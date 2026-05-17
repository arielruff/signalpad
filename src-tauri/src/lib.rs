use std::fs;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
fn get_notes_dir(app: tauri::AppHandle) -> Result<String, String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let notes_dir = docs.join("SignalPad");
    Ok(notes_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_note_files(dir: String) -> Vec<String> {
    match fs::read_dir(&dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let p = e.path();
                if !p.is_file() { return false; }
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                // exclude snapshot files
                if name.contains(".snap.") { return false; }
                p.extension()
                    .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("txt"))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_string_lossy().to_string())
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn list_snapshot_files(dir: String, note_id: String) -> Vec<String> {
    let prefix = format!("{}.snap.", note_id);
    match fs::read_dir(&dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let p = e.path();
                if !p.is_file() { return false; }
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                name.starts_with(&prefix) && name.ends_with(".md")
            })
            .map(|e| e.path().to_string_lossy().to_string())
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_note(app: tauri::AppHandle, note_id: String, file_ext: String) -> Result<(), String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let ext = if file_ext.is_empty() { "md".to_string() } else { file_ext };
    let file = docs.join("SignalPad").join(format!("{}.{}", note_id, ext));
    let path = file.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(file.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or(path))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_icon(tauri::include_image!("icons/128x128.png"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notes_dir,
            list_note_files,
            list_snapshot_files,
            read_file,
            write_file,
            read_file_bytes,
            write_file_bytes,
            delete_file,
            open_folder,
            reveal_note,
            focus_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
