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
            list_coach_sessions,
            read_coach_session,
            coach_complete,
            coach_complete_openai
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

/// Call an OpenAI-compatible chat/completions endpoint (e.g. Ollama / LM Studio)
/// for the local coach provider. Returns the raw JSON response as a string.
#[tauri::command]
async fn coach_complete_openai(
    endpoint: String,
    model: String,
    messages: serde_json::Value,
    tools: serde_json::Value,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": 2048,
    });
    if !tools.is_null() {
        body["tools"] = tools;
    }

    let client = reqwest::Client::new();
    let mut req = client.post(&url).header("content-type", "application/json");
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        req = req.header("authorization", format!("Bearer {key}"));
    }

    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("API {status}: {text}"));
    }
    Ok(text)
}

/// Open a terminal running Claude Code in the config folder (the coach workspace).
/// With `session`, resumes that Claude Code session (`claude --resume <id>`).
#[tauri::command]
fn open_coach(
    app: tauri::AppHandle,
    session: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    // Resume runs in the session's own cwd; otherwise the config workspace.
    let dir = match cwd {
        Some(d) if !d.is_empty() => d,
        _ => app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string(),
    };

    let claude = match session.as_deref() {
        Some(id) if !id.is_empty() => format!("claude --resume {id}"),
        _ => "claude".to_string(),
    };

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", "cmd", "/K", &format!("cd /d \"{dir}\" && {claude}")]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let term = std::env::var("TERMINAL").unwrap_or_else(|_| "xterm".to_string());
        let mut c = std::process::Command::new(term);
        c.args(["-e", "sh", "-c", &format!("cd '{dir}'; {claude}; exec $SHELL")]);
        c
    };

    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CoachSession {
    id: String,
    title: String,
    updated_at: String,
    message_count: u32,
    cwd: String,
}

fn parse_session(path: &std::path::Path) -> Option<CoachSession> {
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return None;
    }
    let id = path.file_stem()?.to_str()?.to_string();
    let content = std::fs::read_to_string(path).ok()?;
    let mut title = String::new();
    let mut first_user = String::new();
    let mut updated_at = String::new();
    let mut cwd = String::new();
    let mut count: u32 = 0;
    for line in content.lines() {
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if cwd.is_empty() {
            if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
                cwd = c.to_string();
            }
        }
        match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "ai-title" => {
                if let Some(s) = v.get("aiTitle").and_then(|x| x.as_str()) {
                    title = s.to_string();
                }
            }
            "user" | "assistant" => {
                count += 1;
                if let Some(ts) = v.get("timestamp").and_then(|x| x.as_str()) {
                    updated_at = ts.to_string();
                }
                if first_user.is_empty() {
                    if let Some(c) = v
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        first_user = c.chars().take(48).collect();
                    }
                }
            }
            _ => {}
        }
    }
    if count == 0 {
        return None;
    }
    let title = if !title.is_empty() {
        title
    } else if !first_user.is_empty() {
        first_user
    } else {
        "Sesión Claude Code".to_string()
    };
    Some(CoachSession { id, title, updated_at, message_count: count, cwd })
}

/// List the Claude Code sessions run in any microset project folder (read-only).
/// Transcripts live in ~/.claude/projects/<cwd-encoded>/*.jsonl; we scan folders
/// whose name mentions "microset" (config workspace, repo, src-tauri). Best-effort:
/// coupled to Claude Code's transcript format; returns [] if absent/unreadable.
#[tauri::command]
fn list_coach_sessions(app: tauri::AppHandle) -> Result<Vec<CoachSession>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let projects = home.join(".claude").join("projects");

    let mut out: Vec<CoachSession> = Vec::new();
    let project_dirs = match std::fs::read_dir(&projects) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for pd in project_dirs.flatten() {
        let p = pd.path();
        if !p.is_dir() {
            continue;
        }
        if !pd.file_name().to_string_lossy().to_lowercase().contains("microset") {
            continue;
        }
        let files = match std::fs::read_dir(&p) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for entry in files.flatten() {
            if let Some(s) = parse_session(&entry.path()) {
                out.push(s);
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[derive(serde::Serialize)]
struct CoachMessageOut {
    role: String,
    text: String,
}

fn encode_cwd(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Read a Claude Code session transcript into readable messages (user prompts +
/// assistant text; thinking and tool results are skipped, tool calls noted).
#[tauri::command]
fn read_coach_session(
    app: tauri::AppHandle,
    cwd: String,
    id: String,
) -> Result<Vec<CoachMessageOut>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let path = home
        .join(".claude")
        .join("projects")
        .join(encode_cwd(&cwd))
        .join(format!("{id}.jsonl"));
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    fn flush(out: &mut Vec<CoachMessageOut>, buf: &mut String) {
        let t = buf.trim();
        if !t.is_empty() {
            out.push(CoachMessageOut { role: "assistant".to_string(), text: t.to_string() });
        }
        buf.clear();
    }

    let mut out: Vec<CoachMessageOut> = Vec::new();
    let mut buf = String::new();
    let mut buf_id = String::new();
    for line in content.lines() {
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "assistant" => {
                let mid = v
                    .get("message")
                    .and_then(|m| m.get("id"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                if !buf_id.is_empty() && mid != buf_id {
                    flush(&mut out, &mut buf);
                }
                buf_id = mid.to_string();
                if let Some(blocks) = v
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for b in blocks {
                        match b.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                            "text" => {
                                if let Some(s) = b.get("text").and_then(|x| x.as_str()) {
                                    if !buf.is_empty() {
                                        buf.push('\n');
                                    }
                                    buf.push_str(s);
                                }
                            }
                            "tool_use" => {
                                if let Some(n) = b.get("name").and_then(|x| x.as_str()) {
                                    if !buf.is_empty() {
                                        buf.push('\n');
                                    }
                                    buf.push_str(&format!("· acción: {n}"));
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            "user" => {
                // A typed prompt has string content; tool results are arrays (skip).
                if let Some(s) = v
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    flush(&mut out, &mut buf);
                    buf_id.clear();
                    out.push(CoachMessageOut { role: "user".to_string(), text: s.to_string() });
                }
            }
            _ => {}
        }
    }
    flush(&mut out, &mut buf);
    Ok(out)
}
