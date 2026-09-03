use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
struct HostProcessInfo {
    cwd: String,
    env: HashMap<String, String>,
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, host_process_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
