//! LSP commands
//!
//! Provides Language Server Protocol integration for code intelligence features.

use snowflake_core::{CompletionItem, Diagnostic, HoverInfo, Location, Result, SignatureHelp};
use snowflake_lsp::LspManager;
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::sync::Mutex;

static LSP_MANAGER: OnceLock<Mutex<LspManager>> = OnceLock::new();

fn get_lsp_manager() -> &'static Mutex<LspManager> {
    LSP_MANAGER.get_or_init(|| Mutex::new(LspManager::new()))
}

/// Set the workspace root for LSP operations
#[tauri::command]
pub async fn lsp_set_workspace(path: String) -> Result<()> {
    let manager = get_lsp_manager().lock().await;
    manager.set_workspace_root(PathBuf::from(path)).await;
    Ok(())
}

/// Get code completions at a position in a file
#[tauri::command]
pub async fn lsp_completions(path: String, line: u32, column: u32) -> Result<Vec<CompletionItem>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_completions(&path, line, column).await
}

/// Get hover information at a position in a file
#[tauri::command]
pub async fn lsp_hover(path: String, line: u32, column: u32) -> Result<Option<HoverInfo>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_hover(&path, line, column).await
}

/// Go to the definition of a symbol at a position
#[tauri::command]
pub async fn lsp_goto_definition(path: String, line: u32, column: u32) -> Result<Option<Location>> {
    let manager = get_lsp_manager().lock().await;
    manager.goto_definition(&path, line, column).await
}

/// Find all references to a symbol at a position
#[tauri::command]
pub async fn lsp_find_references(path: String, line: u32, column: u32) -> Result<Vec<Location>> {
    let manager = get_lsp_manager().lock().await;
    manager.find_references(&path, line, column).await
}

/// Format a document
#[tauri::command]
pub async fn lsp_format(path: String) -> Result<String> {
    let manager = get_lsp_manager().lock().await;
    manager.format_document(&path).await
}

/// Get diagnostics for a file
#[tauri::command]
pub async fn lsp_diagnostics(path: String) -> Result<Vec<Diagnostic>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_diagnostics(&path).await
}

/// Get signature help at a position
#[tauri::command]
pub async fn lsp_signature_help(
    path: String,
    line: u32,
    column: u32,
) -> Result<Option<SignatureHelp>> {
    let manager = get_lsp_manager().lock().await;
    manager.get_signature_help(&path, line, column).await
}

/// Notify that a document was opened
#[tauri::command]
pub async fn lsp_did_open(path: String, language: String, content: String) -> Result<()> {
    let manager = get_lsp_manager().lock().await;
    manager.did_open(&path, &language, &content).await
}

/// Notify that a document changed
#[tauri::command]
pub async fn lsp_did_change(path: String, content: String, version: i32) -> Result<()> {
    let manager = get_lsp_manager().lock().await;
    manager.did_change(&path, &content, version).await
}

/// Notify that a document was saved
#[tauri::command]
pub async fn lsp_did_save(path: String) -> Result<()> {
    let manager = get_lsp_manager().lock().await;
    manager.did_save(&path).await
}

/// Notify that a document was closed
#[tauri::command]
pub async fn lsp_did_close(path: String) -> Result<()> {
    let manager = get_lsp_manager().lock().await;
    manager.did_close(&path).await
}
