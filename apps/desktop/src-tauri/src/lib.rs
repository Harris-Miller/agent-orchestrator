use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::io::{Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri::webview::PageLoadEvent;

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
        .join(".ao")
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
    let document = std::fs::read_to_string(home.join(".ao/providers/antigravity-acp/current.json"))
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

/// True only for `<home>/.ao/providers/<launch-target>/current.json` with no traversal.
fn is_provider_current_json(home: &Path, path: &Path) -> bool {
    let root = home.join(".ao").join("providers");
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
            greet,
            kill_tracked_process_tree,
            spawn_antigravity_provider,
            write_provider_stdin,
            host_process_info,
            track_child_process,
            untrack_child_process
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
        assert_eq!(spawn.command, Path::new("/home/operator/.ao/providers/antigravity-acp/runtime/1.4.5/agy_acp_server.par"));
        assert_eq!(spawn.args, vec!["--uid=".to_string()]);
        assert!(resolve_antigravity_spawn(home, &document.replace("agy_acp_server.par", "../../bin/sh")).is_err());
        assert!(resolve_antigravity_spawn(home, &document.replace("\"completed\"", "\"downloading\"")).is_err());
        assert!(resolve_antigravity_spawn(home, r#"{"active":null,"catalog":[]}"#).is_err());
        assert!(resolve_antigravity_spawn(home, "{nope").is_err());
    }

    #[test]
    fn accepts_only_provider_current_json() {
        let home = Path::new("/home/operator");
        assert!(is_provider_current_json(home, Path::new("/home/operator/.ao/providers/claude-agent-acp/current.json")));
        for bad in [
            "/home/operator/.ao/settings.json",
            "/home/operator/.ao/providers/claude-agent-acp/runtime/1.0.0/current.json",
            "/home/operator/.ao/providers/../settings.json",
            "/home/operator/.ao/providers/claude-agent-acp/../x/current.json",
            "/home/operator/.ao/providers/Bad_Id/current.json",
            "/home/operator/.ao/providers/current.json",
            "/etc/.ao/providers/claude-agent-acp/current.json",
        ] {
            assert!(!is_provider_current_json(home, Path::new(bad)), "{bad}");
        }
    }
}
