//! LightIDE - Lightweight Code Editor
//! 
//! Rust backend for the Tauri-based code editor

mod commands;
mod file_system;
mod editor;
mod terminal;
mod terminal_commands;

use tauri::Manager;

/// Configure and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // File system commands
            commands::open_directory,
            commands::read_file,
            commands::save_file,
            commands::get_file_tree,
            commands::create_file,
            commands::create_directory,
            commands::delete_path,
            commands::rename_path,
            // Terminal commands
            terminal_commands::create_terminal,
            terminal_commands::write_terminal,
            terminal_commands::read_terminal,
            terminal_commands::resize_terminal,
            terminal_commands::close_terminal,
            terminal_commands::is_terminal_alive,
            terminal_commands::list_terminals,
        ])
        .setup(|app| {
            // Get the main window
            let window = app.get_webview_window("main").unwrap();
            
            // Set window title
            window.set_title("LightIDE")?;
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
