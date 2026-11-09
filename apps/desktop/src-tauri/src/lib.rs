use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::io::{Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri::webview::PageLoadEvent;

/// HOA home directory name under the OS home. Must equal `HOA_HOME_DIRNAME` in `@lib/hoa-home` and the `.hoa` in the
/// `capabilities/default.json` shell scope (guarded by `tauriShellScope.test.ts`).
const HOA_HOME_DIRNAME: &str = ".hoa";

#[derive(Serialize)]
struct HostProcessInfo {
    cwd: String,
    env: HashMap<String, String>,
}

/// PIDs spawned from the WebView via `@tauri-apps/plugin-shell`.
/// Cleared and killed on WebView reload / app exit so orphans cannot keep
/// agent-side session locks (e.g. Codex "already has an active writer").
#[derive(Default)]
struct TrackedChildPids(Mutex<HashSet<u32>>);

#[tauri::command]
fn host_process_info() -> Result<HostProcessInfo, String> {
    let cwd = std::env::current_dir()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .into_owned();
    let env = std::env::vars().collect();

    Ok(HostProcessInfo { cwd, env })
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn track_child_process(pid: u32, state: State<'_, TrackedChildPids>) {
    if let Ok(mut pids) = state.0.lock() {
        pids.insert(pid);
    }
}

#[tauri::command]
fn untrack_child_process(pid: u32, state: State<'_, TrackedChildPids>) {
    if let Ok(mut pids) = state.0.lock() {
        pids.remove(&pid);
    }
}

/// Kill a tracked child and its descendants (adapters spawn `claude`/`codex` beneath node).
/// Only PIDs registered via `track_child_process` are accepted.
#[tauri::command]
fn kill_tracked_process_tree(pid: u32, state: State<'_, TrackedChildPids>) -> Result<(), String> {
    let tracked = state.0.lock().map(|mut pids| pids.remove(&pid)).unwrap_or(false);
    if !tracked {
        return Err(format!("pid {pid} is not a tracked child process"));
    }
    kill_process_tree(pid);
    Ok(())
}


// ---------------------------------------------------------------------------------------------
// Antigravity provider spawn boundary
// ---------------------------------------------------------------------------------------------
// The shell plugin only spawns commands named in static capability scopes, and the active Antigravity
// runtime is selected by `current.json` (no symlink). So the spawn is a constrained command that reads
// that document itself: it never accepts an executable path or arguments from the webview.

#[derive(Deserialize)]
struct RuntimeRef {
    version: String,
}

#[derive(Deserialize)]
struct RuntimeState {
    #[serde(rename = "_tag")]
    tag: String,
}

#[derive(Deserialize)]
struct RuntimeDistribution {
    #[serde(rename = "_tag")]
    tag: String,
    #[serde(default)]
    cmd: String,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Deserialize)]
struct RuntimeEntry {
    version: String,
    distribution: RuntimeDistribution,
    state: RuntimeState,
}

#[derive(Deserialize)]
struct RuntimeDocument {
    active: Option<RuntimeRef>,
    catalog: Vec<RuntimeEntry>,
}

struct AntigravitySpawn {
    command: PathBuf,
    args: Vec<String>,
}

fn is_safe_segment(segment: &str) -> bool {
    let mut chars = segment.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+'))
}

/// Resolve the active runtime's recorded command + args. Pure, so it is unit-testable.
fn resolve_antigravity_spawn(home: &Path, document: &str) -> Result<AntigravitySpawn, String> {
    let document: RuntimeDocument = serde_json::from_str(document).map_err(|error| error.to_string())?;
    let active = document.active.ok_or("No Antigravity runtime installed")?;
    let entry = document
        .catalog
        .iter()
        .find(|entry| entry.version == active.version)
        .ok_or("Active Antigravity runtime is not cataloged")?;
    if entry.state.tag != "completed" || entry.distribution.tag != "binary" {
        return Err("Active Antigravity runtime is not a completed binary runtime".into());
    }
    let cmd = entry.distribution.cmd.strip_prefix("./").unwrap_or(&entry.distribution.cmd);
    if !is_safe_segment(&entry.version) || !is_safe_segment(cmd) {
        return Err("Antigravity runtime version or command is unsafe".into());
    }
    let command = home
        .join(HOA_HOME_DIRNAME)
        .join("providers")
        .join("antigravity-acp")
        .join("runtime")
        .join(&entry.version)
        .join(cmd);
    Ok(AntigravitySpawn { command, args: entry.distribution.args.clone() })
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
enum ProviderEvent {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
    Exit { code: i32 },
}

/// Stdin handles for provider processes spawned through `spawn_antigravity_provider`, keyed by pid.
#[derive(Default)]
struct ProviderStdins(Mutex<HashMap<u32, ChildStdin>>);

fn pump<R: Read + Send + 'static>(mut reader: R, channel: Channel<ProviderEvent>, wrap: fn(Vec<u8>) -> ProviderEvent) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while let Ok(read) = reader.read(&mut buffer) {
            if read == 0 || channel.send(wrap(buffer[..read].to_vec())).is_err() {
                break;
            }
        }
    });
}

/// Spawn the active Antigravity runtime with piped stdio. `env` is the complete environment (no inheritance).
/// The pid is tracked like shell-plugin children so reload / exit reaps it; kill goes through
/// `kill_tracked_process_tree`.
#[tauri::command]
fn spawn_antigravity_provider(
    app: tauri::AppHandle,
    env: HashMap<String, String>,
    on_event: Channel<ProviderEvent>,
    tracked: State<'_, TrackedChildPids>,
    stdins: State<'_, ProviderStdins>,
) -> Result<u32, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    let document = std::fs::read_to_string(home.join(HOA_HOME_DIRNAME).join("providers/antigravity-acp/current.json"))
        .map_err(|error| error.to_string())?;
    let spawn = resolve_antigravity_spawn(&home, &document)?;
    let mut child = Command::new(&spawn.command)
        .args(&spawn.args)
        .env_clear()
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let pid = child.id();
    if let Some(stdin) = child.stdin.take() {
        if let Ok(mut map) = stdins.0.lock() {
            map.insert(pid, stdin);
        }
    }
    if let Ok(mut pids) = tracked.0.lock() {
        pids.insert(pid);
    }
    if let Some(stdout) = child.stdout.take() {
        pump(stdout, on_event.clone(), ProviderEvent::Stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        pump(stderr, on_event.clone(), ProviderEvent::Stderr);
    }
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|status| status.code()).unwrap_or(1);
        if let Ok(mut pids) = app_handle.state::<TrackedChildPids>().0.lock() {
            pids.remove(&pid);
        }
        if let Ok(mut map) = app_handle.state::<ProviderStdins>().0.lock() {
            map.remove(&pid);
        }
        let _ = on_event.send(ProviderEvent::Exit { code });
    });
    Ok(pid)
}

#[tauri::command]
fn write_provider_stdin(pid: u32, data: Vec<u8>, stdins: State<'_, ProviderStdins>) -> Result<(), String> {
    let mut map = stdins.0.lock().map_err(|error| error.to_string())?;
    let stdin = map.get_mut(&pid).ok_or("unknown provider process")?;
    stdin.write_all(&data).and_then(|_| stdin.flush()).map_err(|error| error.to_string())
}

/// True only for `<home>/.hoa/providers/<launch-target>/current.json` with no traversal.
fn is_provider_current_json(home: &Path, path: &Path) -> bool {
    let root = home.join(HOA_HOME_DIRNAME).join("providers");
    let Ok(relative) = path.strip_prefix(&root) else {
        return false;
    };
    let parts: Vec<Component> = relative.components().collect();
    if parts.iter().any(|part| !matches!(part, Component::Normal(_))) || parts.len() != 2 {
        return false;
    }
    let id = parts[0].as_os_str().to_string_lossy();
    let valid_id = !id.is_empty()
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains("--")
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    valid_id && parts[1].as_os_str() == "current.json"
}

/// Atomically replace a provider's `current.json`: temp file beside the target, then rename.
/// Refuses any other path (the shared FileSystem `rename` is unavailable to the webview).
#[tauri::command]
fn atomic_replace_provider_state(
    app: tauri::AppHandle,
    path: String,
    content: String,
) -> Result<(), String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    let target = PathBuf::from(&path);
    if !is_provider_current_json(&home, &target) {
        return Err(format!("atomic replace refused for path outside provider state: {path}"));
    }
    let dir = target.parent().ok_or("missing parent directory")?;
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let temp = dir.join(format!("current.json.{}.tmp", std::process::id()));
    let result = std::fs::write(&temp, content).and_then(|_| std::fs::rename(&temp, &target));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|error| error.to_string())
}

// ---------------------------------------------------------------------------------------------
// Bundled VS Code extension boundary
// ---------------------------------------------------------------------------------------------
// The shell plugin only spawns commands named in static capability scopes, and the VS Code CLI path varies per
// machine. So detect / list / install are constrained commands: the webview supplies no executable path or
// arguments, and install only ever passes the `.vsix` bundled with this app.

const VSCODE_EXTENSION_ID: &str = "harris-miller.hoa-vscode";
const BUNDLED_VSIX_NAME: &str = "hoa-vscode.vsix";

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "_tag")]
enum VscodeDetection {
    /// A working CLI: `code` on PATH, else the CLI inside the VS Code app bundle.
    Cli { path: String },
    /// VS Code is installed but no CLI was found.
    AppOnly,
    NotFound,
}

#[derive(Serialize)]
struct BundledVscodeExtension {
    path: String,
    version: String,
}

/// Per-OS standard locations of the VS Code app directory and of the CLI inside it.
fn vscode_app_locations(local_app_data: Option<&Path>) -> (Vec<PathBuf>, Vec<PathBuf>) {
    if cfg!(target_os = "macos") {
        let app = PathBuf::from("/Applications/Visual Studio Code.app");
        (vec![app.join("Contents/Resources/app/bin/code")], vec![app])
    } else if cfg!(target_os = "windows") {
        let app = local_app_data.map(|dir| dir.join("Programs/Microsoft VS Code"));
        (
            app.iter().map(|app| app.join("bin/code.cmd")).collect(),
            app.into_iter().collect(),
        )
    } else {
        (
            vec![PathBuf::from("/usr/share/code/bin/code"), PathBuf::from("/usr/bin/code")],
            vec![PathBuf::from("/usr/share/code")],
        )
    }
}

/// `code` on PATH, then the app-bundle CLI, then whether the app itself exists. `exists` is injected for tests.
fn resolve_vscode(
    path_env: Option<&std::ffi::OsStr>,
    cli_candidates: &[PathBuf],
    app_dirs: &[PathBuf],
    is_file: impl Fn(&Path) -> bool,
    is_dir: impl Fn(&Path) -> bool,
) -> VscodeDetection {
    let name = if cfg!(target_os = "windows") { "code.cmd" } else { "code" };
    let on_path = path_env
        .into_iter()
        .flat_map(std::env::split_paths)
        .map(|dir| dir.join(name))
        .find(|candidate| is_file(candidate));
    match on_path.or_else(|| cli_candidates.iter().find(|candidate| is_file(candidate)).cloned()) {
        Some(path) => VscodeDetection::Cli { path: path.to_string_lossy().into_owned() },
        None if app_dirs.iter().any(|dir| is_dir(dir)) => VscodeDetection::AppOnly,
        None => VscodeDetection::NotFound,
    }
}

fn detect_vscode_cli() -> VscodeDetection {
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let (clis, apps) = vscode_app_locations(local_app_data.as_deref());
    resolve_vscode(std::env::var_os("PATH").as_deref(), &clis, &apps, Path::is_file, Path::is_dir)
}

/// Version of `VSCODE_EXTENSION_ID` in `code --list-extensions --show-versions` output (`publisher.name@1.2.3`).
fn parse_installed_extension_version(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let (id, version) = line.trim().split_once('@')?;
        id.eq_ignore_ascii_case(VSCODE_EXTENSION_ID).then(|| version.to_string())
    })
}

fn require_vscode_cli() -> Result<PathBuf, String> {
    match detect_vscode_cli() {
        VscodeDetection::Cli { path } => Ok(PathBuf::from(path)),
        _ => Err("VS Code CLI not found".into()),
    }
}

/// The `.vsix` shipped in the app resources and its version (the app version it was stamped with), or `None` when
/// the build did not bundle it (`tauri dev`).
#[tauri::command]
fn bundled_vscode_extension(app: tauri::AppHandle) -> Option<BundledVscodeExtension> {
    let path = app.path().resolve(BUNDLED_VSIX_NAME, tauri::path::BaseDirectory::Resource).ok()?;
    path.is_file().then(|| BundledVscodeExtension {
        path: path.to_string_lossy().into_owned(),
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command(async)]
fn detect_vscode() -> VscodeDetection {
    detect_vscode_cli()
}

#[tauri::command(async)]
fn vscode_installed_extension_version() -> Result<Option<String>, String> {
    let output = Command::new(require_vscode_cli()?)
        .args(["--list-extensions", "--show-versions"])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(parse_installed_extension_version(&String::from_utf8_lossy(&output.stdout)))
}

/// `code --install-extension <bundled vsix> --force`. Returns the CLI's stderr on failure.
#[tauri::command(async)]
fn install_bundled_vscode_extension(app: tauri::AppHandle) -> Result<(), String> {
    let bundled = bundled_vscode_extension(app).ok_or("VS Code extension is not bundled with this build")?;
    let output = Command::new(require_vscode_cli()?)
        .args(["--install-extension", &bundled.path, "--force"])
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { format!("code exited with {}", output.status) } else { stderr })
    }
}

/// Kill `pid` and its descendants (depth-first). Unix only — desktop target.
fn kill_process_tree(pid: u32) {
    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("pgrep").args(["-P", &pid.to_string()]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Ok(child) = line.trim().parse::<u32>() {
                    kill_process_tree(child);
                }
            }
        }
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
    }
}

fn reap_tracked_children(state: &TrackedChildPids) {
    let pids: Vec<u32> = match state.0.lock() {
        Ok(mut guard) => {
            let drained: Vec<u32> = guard.iter().copied().collect();
            guard.clear();
            drained
        }
        Err(_) => return,
    };
    for pid in pids {
        kill_process_tree(pid);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // GUI launches (Finder/Dock) get a minimal PATH; load the login shell's. No-op on Windows.
    let _ = fix_path_env::fix();


    #[cfg(debug_assertions)]
    {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env.development");
        let _ = dotenvy::from_path(path);
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(TrackedChildPids::default())
        .manage(ProviderStdins::default())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), PageLoadEvent::Started) {
                reap_tracked_children(&webview.state::<TrackedChildPids>());
            }
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            atomic_replace_provider_state,
            bundled_vscode_extension,
            detect_vscode,
            greet,
            install_bundled_vscode_extension,
            kill_tracked_process_tree,
            spawn_antigravity_provider,
            write_provider_stdin,
            host_process_info,
            track_child_process,
            untrack_child_process,
            vscode_installed_extension_version
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                reap_tracked_children(&app_handle.state::<TrackedChildPids>());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_the_recorded_antigravity_command() {
        let home = Path::new("/home/operator");
        let document = r#"{"schemaVersion":1,"active":{"version":"1.4.5","dir":"runtime/1.4.5"},"catalog":[{"version":"1.4.5","dir":"runtime/1.4.5","distribution":{"_tag":"binary","version":"1.4.5","platform":"linux-x86_64","archive":"https://dl.google.com/agy-extensions/a.zip","sha256":"aa","cmd":"agy_acp_server.par","args":["--uid="]},"state":{"_tag":"completed"}}]}"#;
        let spawn = resolve_antigravity_spawn(home, document).unwrap();
        assert_eq!(spawn.command, Path::new("/home/operator/.hoa/providers/antigravity-acp/runtime/1.4.5/agy_acp_server.par"));
        assert_eq!(spawn.args, vec!["--uid=".to_string()]);
        assert!(resolve_antigravity_spawn(home, &document.replace("agy_acp_server.par", "../../bin/sh")).is_err());
        assert!(resolve_antigravity_spawn(home, &document.replace("\"completed\"", "\"downloading\"")).is_err());
        assert!(resolve_antigravity_spawn(home, r#"{"active":null,"catalog":[]}"#).is_err());
        assert!(resolve_antigravity_spawn(home, "{nope").is_err());
    }

    #[test]
    fn accepts_only_provider_current_json() {
        let home = Path::new("/home/operator");
        assert!(is_provider_current_json(home, Path::new("/home/operator/.hoa/providers/claude-agent-acp/current.json")));
        for bad in [
            "/home/operator/.hoa/settings.json",
            "/home/operator/.hoa/providers/claude-agent-acp/runtime/1.0.0/current.json",
            "/home/operator/.hoa/providers/../settings.json",
            "/home/operator/.hoa/providers/claude-agent-acp/../x/current.json",
            "/home/operator/.hoa/providers/Bad_Id/current.json",
            "/home/operator/.hoa/providers/current.json",
            "/etc/.hoa/providers/claude-agent-acp/current.json",
        ] {
            assert!(!is_provider_current_json(home, Path::new(bad)), "{bad}");
        }
    }

    #[test]
    fn resolves_the_vscode_cli() {
        let name = if cfg!(target_os = "windows") { "code.cmd" } else { "code" };
        let bundle_cli = PathBuf::from("/app/bin/code");
        let app = PathBuf::from("/app");
        let path_env = std::env::join_paths(["/usr/local/bin", "/opt/bin"]).unwrap();
        let on_path = Path::new("/opt/bin").join(name);

        let with = |existing: Vec<PathBuf>, path_env: Option<&std::ffi::OsStr>| {
            let exists = |path: &Path| existing.iter().any(|e| e == path);
            resolve_vscode(path_env, &[bundle_cli.clone()], &[app.clone()], exists, exists)
        };
        // PATH wins over the app bundle.
        assert_eq!(
            with(vec![on_path.clone(), bundle_cli.clone()], Some(&path_env)),
            VscodeDetection::Cli { path: on_path.to_string_lossy().into_owned() }
        );
        // Minimal PATH (GUI launch): falls back to the app-bundle CLI.
        assert_eq!(
            with(vec![bundle_cli.clone()], None),
            VscodeDetection::Cli { path: bundle_cli.to_string_lossy().into_owned() }
        );
        // App present, no CLI.
        assert_eq!(with(vec![app.clone()], Some(&path_env)), VscodeDetection::AppOnly);
        assert_eq!(with(vec![], Some(&path_env)), VscodeDetection::NotFound);
    }

    #[test]
    fn parses_the_installed_extension_version() {
        let output = "ms-python.python@2024.1.0\nHarris-Miller.hoa-vscode@0.1.0\nother.ext@1.0.0\n";
        assert_eq!(parse_installed_extension_version(output), Some("0.1.0".to_string()));
        assert_eq!(parse_installed_extension_version("harris-miller.hoa-vscode-fork@1.0.0\n"), None);
        assert_eq!(parse_installed_extension_version(""), None);
    }
}
