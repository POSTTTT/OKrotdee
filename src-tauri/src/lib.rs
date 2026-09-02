use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            // The database can sit on an external disk. Which one is only
            // known at run time, so that folder is allowed here rather than
            // in capabilities, from the same file the interface writes.
            let pointer = app.path().app_config_dir()?.join("datadir.txt");
            if let Ok(dir) = std::fs::read_to_string(&pointer) {
                let dir = dir.trim();
                if !dir.is_empty() {
                    // The folder itself as well as what is in it: asking
                    // whether the drive is plugged in reads the folder.
                    app.fs_scope().allow_file(dir)?;
                    app.fs_scope().allow_directory(dir, true)?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
