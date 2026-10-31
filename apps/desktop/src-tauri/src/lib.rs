use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(TrackedChildPids::default())
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
