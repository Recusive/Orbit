//! LSP commands
//!
//! Provides Language Server Protocol integration for code intelligence features.

use futures::StreamExt as _;
use log::{debug, error};
use orbit_core::{CompletionItem, Diagnostic, HoverInfo, Location, Result, SignatureHelp};
use orbit_lsp::LspManager;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter as _};
use tokio::sync::Mutex;

use crate::core::perf_logger::PerfSource;
use crate::perf_log;

static LSP_MANAGER: OnceLock<Mutex<LspManager>> = OnceLock::new();

fn get_lsp_manager() -> &'static Mutex<LspManager> {
    LSP_MANAGER.get_or_init(|| Mutex::new(LspManager::new()))
}

/// Diagnostics event payload sent to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsEvent {
    /// File path (absolute).
    pub path: String,
    /// Diagnostics for this file.
    pub diagnostics: Vec<Diagnostic>,
    /// Language server that produced these.
    pub language: String,
}

/// Set the workspace root for LSP operations
#[tauri::command]
pub async fn lsp_set_workspace(path: String) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_set_workspace", {
        let manager = get_lsp_manager().lock().await;
        manager.set_workspace_root(PathBuf::from(path)).await;
        Ok(())
    })
}

/// Get code completions at a position in a file
#[tauri::command]
pub async fn lsp_completions(path: String, line: u32, column: u32) -> Result<Vec<CompletionItem>> {
    perf_log!(PerfSource::Lsp, "lsp_completions", {
        let manager = get_lsp_manager().lock().await;
        manager.get_completions(&path, line, column).await
    })
}

/// Get hover information at a position in a file
#[tauri::command]
pub async fn lsp_hover(path: String, line: u32, column: u32) -> Result<Option<HoverInfo>> {
    perf_log!(PerfSource::Lsp, "lsp_hover", {
        let manager = get_lsp_manager().lock().await;
        manager.get_hover(&path, line, column).await
    })
}

/// Go to the definition of a symbol at a position
#[tauri::command]
pub async fn lsp_goto_definition(path: String, line: u32, column: u32) -> Result<Option<Location>> {
    perf_log!(PerfSource::Lsp, "lsp_goto_definition", {
        let manager = get_lsp_manager().lock().await;
        manager.goto_definition(&path, line, column).await
    })
}

/// Find all references to a symbol at a position
#[tauri::command]
pub async fn lsp_find_references(path: String, line: u32, column: u32) -> Result<Vec<Location>> {
    perf_log!(PerfSource::Lsp, "lsp_find_references", {
        let manager = get_lsp_manager().lock().await;
        manager.find_references(&path, line, column).await
    })
}

/// Format a document
#[tauri::command]
pub async fn lsp_format(path: String) -> Result<String> {
    perf_log!(PerfSource::Lsp, "lsp_format", {
        let manager = get_lsp_manager().lock().await;
        manager.format_document(&path).await
    })
}

/// Get diagnostics for a file
#[tauri::command]
pub async fn lsp_diagnostics(path: String) -> Result<Vec<Diagnostic>> {
    perf_log!(PerfSource::Lsp, "lsp_diagnostics", {
        let manager = get_lsp_manager().lock().await;
        manager.get_diagnostics(&path).await
    })
}

/// Get signature help at a position
#[tauri::command]
pub async fn lsp_signature_help(
    path: String,
    line: u32,
    column: u32,
) -> Result<Option<SignatureHelp>> {
    perf_log!(PerfSource::Lsp, "lsp_signature_help", {
        let manager = get_lsp_manager().lock().await;
        manager.get_signature_help(&path, line, column).await
    })
}

/// Notify that a document was opened
#[tauri::command]
pub async fn lsp_did_open(path: String, language: String, content: String) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_did_open", {
        let manager = get_lsp_manager().lock().await;
        manager.did_open(&path, &language, &content).await
    })
}

/// Notify that a document changed
#[tauri::command]
pub async fn lsp_did_change(path: String, content: String, version: i32) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_did_change", {
        let manager = get_lsp_manager().lock().await;
        manager.did_change(&path, &content, version).await
    })
}

/// Notify that a document was saved
#[tauri::command]
pub async fn lsp_did_save(path: String) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_did_save", {
        let manager = get_lsp_manager().lock().await;
        manager.did_save(&path).await
    })
}

/// Notify that a document was closed
#[tauri::command]
pub async fn lsp_did_close(path: String) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_did_close", {
        let manager = get_lsp_manager().lock().await;
        manager.did_close(&path).await
    })
}

/// Start a language server and begin emitting diagnostics events.
#[tauri::command]
pub async fn lsp_start(language: String, root_path: String, app: AppHandle) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_start", {
        let client = {
            let manager = get_lsp_manager().lock().await;
            manager.start_server(&language, &root_path).await?
        };

        // If a new client was started, set up diagnostics event emitter
        if let Some(client) = client {
            if let Some(mut rx) = client.take_diagnostics_receiver().await {
                let lang = language.clone();
                let app_handle = app.clone();

                // Spawn task to emit diagnostics events (drop handle since we don't need to join)
                drop(tokio::spawn(async move {
                    while let Some((path, diagnostics)) = rx.next().await {
                        let path_str = path.to_string_lossy().to_string();
                        let event = DiagnosticsEvent {
                            path: path_str.clone(),
                            diagnostics,
                            language: lang.clone(),
                        };

                        if let Err(e) = app_handle.emit("lsp:diagnostics", &event) {
                            error!("Failed to emit diagnostics event for {path_str}: {e}");
                        }
                    }

                    debug!("Diagnostics emitter stopped for {lang}");
                }));
            }
        }

        Ok(())
    })
}

/// Stop a language server
#[tauri::command]
pub async fn lsp_stop(language: String) -> Result<()> {
    perf_log!(PerfSource::Lsp, "lsp_stop", {
        let manager = get_lsp_manager().lock().await;
        manager.stop_server(&language).await
    })
}

/// Check if a language server is running
#[tauri::command]
pub async fn lsp_is_running(language: String) -> Result<bool> {
    perf_log!(PerfSource::Lsp, "lsp_is_running", {
        let manager = get_lsp_manager().lock().await;
        Ok(manager.is_server_running(&language).await)
    })
}

/// Get list of running language servers
#[tauri::command]
pub async fn lsp_running_servers() -> Result<Vec<String>> {
    perf_log!(PerfSource::Lsp, "lsp_running_servers", {
        let manager = get_lsp_manager().lock().await;
        Ok(manager.running_servers().await)
    })
}
