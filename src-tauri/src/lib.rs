//! Snowflake - Modern AI-powered code editor
//!
//! This is the main Tauri application library that wires together
//! all the backend functionality.

pub mod commands;

use commands::{ai, files, git, lsp, search, terminal, workspace};
use tauri_plugin_log::{Target, TargetKind};

/// Log mode for the application.
///
/// Determined by `SNOWFLAKE_LOG_MODE` env var or defaults based on build type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LogMode {
    /// Production: minimal logging (warn/error only)
    Prod,
    /// Development: balanced logging (info for deps, debug for snowflake)
    Dev,
    /// Debug: verbose logging (debug for deps, trace for snowflake)
    Debug,
}

impl LogMode {
    /// Determine log mode from environment or build configuration.
    #[expect(
        clippy::disallowed_methods,
        reason = "env var needed at startup before config system is available"
    )]
    fn from_env() -> Self {
        use std::env;

        match env::var("SNOWFLAKE_LOG_MODE")
            .unwrap_or_default()
            .to_lowercase()
            .as_str()
        {
            "prod" | "production" => Self::Prod,
            "debug" | "verbose" | "trace" => Self::Debug,
            "dev" | "development" => Self::Dev,
            _ => {
                // Default based on build type
                if cfg!(debug_assertions) {
                    Self::Dev
                } else {
                    Self::Prod
                }
            },
        }
    }
}

/// Build the logging plugin based on the current mode.
fn build_log_plugin() -> tauri_plugin_log::Builder {
    let mode = LogMode::from_env();
    let mut builder = tauri_plugin_log::Builder::default();

    match mode {
        LogMode::Prod => {
            // Production: minimal logging
            builder = builder
                .level(log::LevelFilter::Warn)
                .level_for("snowflake", log::LevelFilter::Info)
                .level_for("snowflake_app", log::LevelFilter::Info)
                .level_for("tao", log::LevelFilter::Error)
                .level_for("wry", log::LevelFilter::Error);
        },
        LogMode::Dev => {
            // Development: balanced logging
            builder = builder
                .level(log::LevelFilter::Info)
                .level_for("snowflake", log::LevelFilter::Debug)
                .level_for("snowflake_app", log::LevelFilter::Debug)
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("tauri", log::LevelFilter::Info);
        },
        LogMode::Debug => {
            // Debug: verbose logging
            builder = builder
                .level(log::LevelFilter::Debug)
                .level_for("snowflake", log::LevelFilter::Trace)
                .level_for("snowflake_app", log::LevelFilter::Trace)
                .level_for("tao", log::LevelFilter::Debug)
                .level_for("wry", log::LevelFilter::Debug)
                .level_for("tauri", log::LevelFilter::Debug);
        },
    }

    // Always log to stdout in dev, and add log file in prod
    let targets = if mode == LogMode::Prod {
        vec![
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
        ]
    } else {
        vec![Target::new(TargetKind::Stdout)]
    };

    builder.targets(targets)
}

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::disallowed_types,
    reason = "tauri::generate_context! uses std::collections::HashMap internally"
)]
#[expect(
    clippy::large_stack_frames,
    reason = "tauri::generate_context! macro causes this"
)]
pub fn run() {
    let result = tauri::Builder::default()
        // Plugins
        .plugin(build_log_plugin().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Commands
        .invoke_handler(tauri::generate_handler![
            // File commands
            files::read_file,
            files::read_file_bytes,
            files::write_file,
            files::write_file_bytes,
            files::list_directory,
            files::create_file,
            files::create_directory,
            files::delete_file,
            files::rename_file,
            files::copy_file,
            files::file_exists,
            files::is_directory,
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
