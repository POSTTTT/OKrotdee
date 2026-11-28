use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_opener::OpenerExt;

/// The folder holding okrotdee.db: the one named in datadir.txt, usually an
/// external disk, or the configuration directory when nothing is named.
fn data_dir<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    let config = app.path().app_config_dir()?;
    if let Ok(named) = std::fs::read_to_string(config.join("datadir.txt")) {
        let named = named.trim();
        if !named.is_empty() {
            return Ok(PathBuf::from(named));
        }
    }
    Ok(config)
}

/// Show that folder in Finder or Explorer. It can be on any drive, which the
/// command scope has no way to know ahead of time, so the opening happens
/// here, where it is not scoped.
#[tauri::command]
fn open_data_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = data_dir(&app).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Show the folder holding the program's log files, for sending to support.
#[tauri::command]
fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so whatever the other plugins report is in the log too. One
        // file in the system's log folder, in local time, rolled over at 1 MB
        // with the last five kept, so it never fills the disk.
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("okrotdee".into()),
                }))
                .target(Target::new(TargetKind::Stdout))
                .level(log::LevelFilter::Info)
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![open_data_dir, open_log_dir])
        .setup(|app| {
            // On a fresh install the configuration directory does not exist
            // yet, and the interface would take it for an unplugged drive.
            std::fs::create_dir_all(app.path().app_config_dir()?)?;
            // The database can sit on an external disk. Which one is only
            // known at run time, so that folder is allowed here rather than
            // in capabilities, from the same file the interface writes.
            let dir = data_dir(app.handle())?;
            if dir != app.path().app_config_dir()? {
                // The folder itself as well as what is in it: asking whether
                // the drive is plugged in reads the folder.
                app.fs_scope().allow_file(&dir)?;
                app.fs_scope().allow_directory(&dir, true)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
