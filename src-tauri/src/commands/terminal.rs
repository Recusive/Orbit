//! Terminal commands

use snowflake_core::{Result, TerminalInfo};
use snowflake_terminal::TerminalManager;
use std::sync::OnceLock;
use tokio::sync::Mutex;

static TERMINAL_MANAGER: OnceLock<Mutex<TerminalManager>> = OnceLock::new();

fn get_terminal_manager() -> &'static Mutex<TerminalManager> {
    TERMINAL_MANAGER.get_or_init(|| Mutex::new(TerminalManager::new()))
}

#[tauri::command]
pub async fn terminal_create(
    id: String,
    cwd: Option<String>,
    shell: Option<String>,
) -> Result<TerminalInfo> {
    let manager = get_terminal_manager().lock().await;
    manager
        .create(&id, cwd.as_deref(), shell.as_deref())
        .await
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<()> {
    let manager = get_terminal_manager().lock().await;
    manager.write(&id, &data).await
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u16, rows: u16) -> Result<()> {
    let manager = get_terminal_manager().lock().await;
    manager.resize(&id, cols, rows).await
}

#[tauri::command]
pub async fn terminal_close(id: String) -> Result<()> {
    let manager = get_terminal_manager().lock().await;
    manager.close(&id).await
}
