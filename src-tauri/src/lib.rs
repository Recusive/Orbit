//! Snowflake - Modern AI-powered code editor
//!
//! This is the main Tauri application library that wires together
//! all the backend functionality.

pub mod agent;
pub mod commands;

use std::env;
use std::path::PathBuf;
use std::sync::Arc;

use commands::{
    agent as agent_cmd, ai, conversations, files, git, lsp, search, settings, terminal, workspace,
};
use snowflake_conversations::ConversationManager;
use snowflake_settings::SettingsManager;
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
#[expect(
    clippy::too_many_lines,
    reason = "Tauri app setup requires listing all commands in one invoke_handler"
)]
pub fn run() {
    // Initialize settings manager and load settings
    let settings_manager = SettingsManager::new();
    if let Err(e) = settings_manager.load() {
        log::warn!("Failed to load settings: {e}");
    }

    // Initialize conversation manager and load summaries
    let conversation_manager = ConversationManager::new();
    if let Err(e) = conversation_manager.load_summaries() {
        log::warn!("Failed to load conversation summaries: {e}");
    }

    // Initialize agent session manager
    // The sidecar path will be resolved relative to the app bundle in production
    // For development, it uses the local agent-bridge directory
    let sidecar_path = env::current_dir().map_or_else(
        |_| PathBuf::from("agent-bridge/dist/index.js"),
        |p| p.join("../agent-bridge/dist/index.js"),
    );
    let session_manager = Arc::new(agent::SessionManager::new(sidecar_path));

    // Clone for .manage() before moving into .setup()
    let session_manager_for_state = Arc::clone(&session_manager);

    let result = tauri::Builder::default()
        // Managed state
        .manage(settings_manager)
        .manage(conversation_manager)
        .manage(session_manager_for_state)
        // Plugins
        .plugin(build_log_plugin().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Setup event callbacks for agent
        .setup(move |app| {
            agent_cmd::setup_event_callbacks(app.handle(), &session_manager);
            Ok(())
        })
        // Commands
        .invoke_handler(tauri::generate_handler![
            // Agent commands
            agent_cmd::agent_create_session,
            agent_cmd::agent_delete_session,
            agent_cmd::agent_send_message,
            agent_cmd::agent_interrupt,
            agent_cmd::agent_is_session_ready,
            agent_cmd::agent_get_sdk_session_id,
            agent_cmd::agent_respond_permission,
            agent_cmd::agent_set_thinking_mode,
            agent_cmd::agent_get_thinking_mode,
            agent_cmd::agent_set_model,
            agent_cmd::agent_set_plan_mode,
            agent_cmd::agent_get_plan_mode,
            agent_cmd::agent_set_accept_mode,
            agent_cmd::agent_get_accept_mode,
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
            // File watcher commands
            files::watch_path,
            files::unwatch_path,
            // LSP commands
            lsp::lsp_set_workspace,
            lsp::lsp_completions,
            lsp::lsp_hover,
            lsp::lsp_goto_definition,
            lsp::lsp_find_references,
            lsp::lsp_format,
            lsp::lsp_diagnostics,
            lsp::lsp_signature_help,
            lsp::lsp_did_open,
            lsp::lsp_did_change,
            lsp::lsp_did_save,
            lsp::lsp_did_close,
            lsp::lsp_start,
            lsp::lsp_stop,
            lsp::lsp_is_running,
            lsp::lsp_running_servers,
            // Terminal commands
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_list,
            // Git commands
            git::git_discover,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_stage_all,
            git::git_commit,
            git::git_diff,
            git::git_diff_structured,
            git::git_staged_diff,
            git::git_discard,
            git::git_log,
            git::git_branches,
            git::git_branch_info,
            git::git_checkout,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_blame,
            git::git_push,
            git::git_pull,
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
            // Settings commands
            settings::get_settings,
            settings::update_settings,
            settings::add_recent_project,
            settings::get_recent_projects,
            settings::clear_recent_projects,
            settings::get_settings_path,
            // Conversation commands
            conversations::conversation_create,
            conversations::conversation_list,
            conversations::conversation_load,
            conversations::conversation_delete,
            conversations::conversation_update_title,
            conversations::conversation_add_message,
            conversations::conversation_fork,
            conversations::conversation_data_path,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("Error running Tauri application: {e}");
    }
}
