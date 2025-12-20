//! Snowflake - Modern AI-powered code editor
//!
//! This is the main Tauri application library that wires together
//! all the backend functionality.

pub mod commands;

use commands::{ai, files, git, lsp, search, terminal, workspace};

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::disallowed_types)] // tauri::generate_context! uses std::collections::HashMap internally
#[allow(clippy::large_stack_frames)] // tauri::generate_context! macro causes this
pub fn run() {
    let result = tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Commands
        .invoke_handler(tauri::generate_handler![
            // File commands
            files::read_file,
            files::write_file,
            files::list_directory,
            files::delete_file,
            files::rename_file,
            files::create_directory,
            files::file_exists,
            files::get_file_info,
            // LSP commands
            lsp::lsp_completions,
            lsp::lsp_hover,
            lsp::lsp_goto_definition,
            lsp::lsp_find_references,
            lsp::lsp_format,
            lsp::lsp_diagnostics,
            lsp::lsp_signature_help,
            // Terminal commands
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            // Git commands
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_diff,
            git::git_log,
            git::git_branches,
            git::git_checkout,
            // AI commands
            ai::ai_chat,
            ai::ai_complete,
            ai::ai_stop,
            // Search commands
            search::search_files,
            search::search_text,
            // Workspace commands
            workspace::get_workspace_path,
            workspace::set_workspace_path,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("Error running Tauri application: {e}");
    }
}
