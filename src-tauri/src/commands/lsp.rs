//! LSP commands

use snowflake_core::{CompletionItem, Diagnostic, HoverInfo, Location, Result, SignatureHelp};
use snowflake_lsp::LspManager;
use std::sync::OnceLock;
use tokio::sync::Mutex;

static LSP_MANAGER: OnceLock<Mutex<LspManager>> = OnceLock::new();

fn get_lsp_manager() -> &'static Mutex<LspManager> {
    LSP_MANAGER.get_or_init(|| Mutex::new(LspManager::new()))
}

#[tauri::command]
pub async fn lsp_completions(path: String, line: u32, column: u32) -> Result<Vec<CompletionItem>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_completions(&path, line, column).await
}

#[tauri::command]
pub async fn lsp_hover(path: String, line: u32, column: u32) -> Result<Option<HoverInfo>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_hover(&path, line, column).await
}

#[tauri::command]
pub async fn lsp_goto_definition(path: String, line: u32, column: u32) -> Result<Option<Location>> {
    let manager = get_lsp_manager().lock().await;
    manager.goto_definition(&path, line, column).await
}

#[tauri::command]
pub async fn lsp_find_references(path: String, line: u32, column: u32) -> Result<Vec<Location>> {
    let manager = get_lsp_manager().lock().await;
    manager.find_references(&path, line, column).await
}

#[tauri::command]
pub async fn lsp_format(path: String) -> Result<String> {
    let manager = get_lsp_manager().lock().await;
    manager.format_document(&path).await
}

#[tauri::command]
pub async fn lsp_diagnostics(path: String) -> Result<Vec<Diagnostic>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_diagnostics(&path).await
}

#[tauri::command]
pub async fn lsp_signature_help(
    path: String,
    line: u32,
    column: u32,
) -> Result<Option<SignatureHelp>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_signature_help(&path, line, column).await
}
