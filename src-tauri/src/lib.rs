// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // --- System tray ---
            let show_item = MenuItem::with_id(app, "show", "Abrir microset", true, None::<&str>)?;
            let panel_item =
                MenuItem::with_id(app, "panel", "Mostrar/ocultar panel", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &panel_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("microset")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "panel" => toggle_panel(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on the tray icon toggles the main window.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                show_main_window(app);
                            }
                        }
                    }
                })
                .build(app)?;

            // Position the floating panel near the top-right of the primary monitor.
            if let Some(panel) = app.get_webview_window("panel") {
                if let Ok(Some(monitor)) = panel.primary_monitor() {
                    let size = monitor.size();
                    let x = (size.width as i32) - 272 - 24;
                    let _ = panel.set_position(tauri::PhysicalPosition::new(x.max(0), 48));
                }
            }

            Ok(())
        })
        // Closing a window hides it to the tray instead of quitting:
        // microset keeps running in the background to remind you.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            show_toast,
            hide_toast,
            open_coach,
            coach_complete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_panel(app: &tauri::AppHandle) {
    if let Some(panel) = app.get_webview_window("panel") {
        if panel.is_visible().unwrap_or(false) {
            let _ = panel.hide();
        } else {
            let _ = panel.show();
            let _ = panel.set_focus();
        }
    }
}

/// Place the toast in the bottom-right of the primary monitor, above the taskbar.
fn position_toast(toast: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = toast.primary_monitor() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let (w, h) = match toast.outer_size() {
            Ok(s) => (s.width as i32, s.height as i32),
            Err(_) => ((340.0 * scale) as i32, (128.0 * scale) as i32),
        };
        let margin = (20.0 * scale) as i32;
        let taskbar = (56.0 * scale) as i32;
        let x = (size.width as i32 - w - margin).max(0);
        let y = (size.height as i32 - h - margin - taskbar).max(0);
        let _ = toast.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

/// Position and show the toast reminder window (without stealing focus).
#[tauri::command]
fn show_toast(app: tauri::AppHandle) {
    if let Some(toast) = app.get_webview_window("toast") {
        position_toast(&toast);
        let _ = toast.show();
    }
}

#[tauri::command]
fn hide_toast(app: tauri::AppHandle) {
    if let Some(toast) = app.get_webview_window("toast") {
        let _ = toast.hide();
    }
}

/// Call the Anthropic Messages API (tool-use) from Rust so the API key stays out
/// of the webview and there's no CORS. Returns the raw JSON response as a string.
#[tauri::command]
async fn coach_complete(
    model: String,
    system: String,
    messages: serde_json::Value,
    tools: serde_json::Value,
) -> Result<String, String> {
    let key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY no está seteada en el entorno".to_string())?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": messages,
        "tools": tools,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("API {status}: {text}"));
    }
    Ok(text)
}

/// Open a terminal running Claude Code in the config folder (the coach workspace).
#[tauri::command]
fn open_coach(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args([
            "/C",
            "start",
            "",
            "cmd",
            "/K",
            &format!("cd /d \"{dir}\" && claude"),
        ]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let term = std::env::var("TERMINAL").unwrap_or_else(|_| "xterm".to_string());
        let mut c = std::process::Command::new(term);
        c.args(["-e", "sh", "-c", &format!("cd '{dir}'; claude; exec $SHELL")]);
        c
    };

    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
