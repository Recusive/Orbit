//! Orbit - Modern AI-powered code editor
//!
//! This is the main Tauri application library that wires together
//! all the backend functionality.

pub mod agent;
pub mod commands;
pub mod core;
pub mod utils;

use std::env;
use std::path::PathBuf;
use std::sync::Arc;

use orbit_search::FileIndex;
use parking_lot::RwLock;

use commands::agent::lifecycle as agent_cmd;
use commands::agent::{ai, conversations};
use commands::browser::{self, BrowserResultState, BrowserWindowState};
use commands::canvas::download as canvas_download;
use commands::canvas::lifecycle as canvas_cmd;
use commands::canvas::persist as canvas_persist;
use commands::canvas::preview as canvas_preview;
use commands::canvas::save as canvas_save;
use commands::canvas::setup as canvas_setup;
use commands::canvas::transform as canvas_transform;
use commands::canvas::PreviewServerState;
use commands::common::{
    credentials, dev_monitor, diagnostics, files, git, lsp, providers,
    search::{self, FileIndexState},
    settings, terminal, workspace,
};
use orbit_conversations::ConversationManager;
use orbit_settings::SettingsManager;
use tauri_plugin_log::{Target, TargetKind};

/// Log mode for the application.
///
/// Determined by `ORBIT_LOG_MODE` env var or defaults based on build type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LogMode {
    /// Production: minimal logging (warn/error only)
    Prod,
    /// Development: balanced logging (info for deps, debug for orbit)
    Dev,
    /// Debug: verbose logging (debug for deps, trace for orbit)
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

        match env::var("ORBIT_LOG_MODE")
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
                .level_for("orbit", log::LevelFilter::Info)
                .level_for("orbit_app", log::LevelFilter::Info)
                .level_for("tao", log::LevelFilter::Error)
                .level_for("wry", log::LevelFilter::Error);
        },
        LogMode::Dev => {
            // Development: balanced logging
            builder = builder
                .level(log::LevelFilter::Info)
                .level_for("orbit", log::LevelFilter::Debug)
                .level_for("orbit_app", log::LevelFilter::Debug)
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("tauri", log::LevelFilter::Info);
        },
        LogMode::Debug => {
            // Debug: verbose logging
            builder = builder
                .level(log::LevelFilter::Debug)
                .level_for("orbit", log::LevelFilter::Trace)
                .level_for("orbit_app", log::LevelFilter::Trace)
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

/// Resolve the path to the agent-bridge sidecar binary.
///
/// In development, the binary is at `src-tauri/binaries/agent-bridge-{target}`.
/// In production, the binary is bundled next to the app executable.
fn resolve_sidecar_path() -> PathBuf {
    let target_triple = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        }
    } else {
        // Linux
        if cfg!(target_arch = "aarch64") {
            "aarch64-unknown-linux-gnu"
        } else {
            "x86_64-unknown-linux-gnu"
        }
    };

    let binary_name = format!("agent-bridge-{target_triple}");

    // Try to find the binary relative to the executable (production)
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // On macOS, Tauri bundles without target triple suffix
            // Check for "agent-bridge" first (Tauri bundle naming)
            let prod_path_simple = exe_dir.join("agent-bridge");
            if prod_path_simple.exists() {
                return prod_path_simple;
            }

            // Also check with target triple (manual builds)
            let prod_path = exe_dir.join(&binary_name);
            if prod_path.exists() {
                return prod_path;
            }
        }
    }

    // Fall back to development path (src-tauri/binaries/)
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&binary_name)
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
    // Initialize Sentry FIRST - before any other initialization
    // This ensures all panics and errors are captured from the very start.
    // The guard must be kept alive for the entire application lifetime.
    let _sentry_guard = sentry::init((
        "https://9d8148a41d5c12f753d58eff8784806a@o4510750911037440.ingest.us.sentry.io/4510751422480384",
        sentry::ClientOptions {
            // ============================================
            // Release Health Configuration
            // ============================================
            // Ties sessions, errors, and crashes to specific app versions
            // Format: "orbit@version" - must match frontend naming for correlation
            release: Some(format!("orbit@{}", env!("CARGO_PKG_VERSION")).into()),
            // Environment for filtering in Sentry dashboard
            environment: Some(
                if cfg!(debug_assertions) {
                    "development".into()
                } else {
                    "production".into()
                },
            ),
            // Session tracking for Release Health metrics
            // Tracks: active users, crash-free sessions, adoption rates
            auto_session_tracking: true,
            // ============================================
            // Privacy
            // ============================================
            // Don't send PII (user IPs, etc.) by default for privacy
            send_default_pii: false,
            // ============================================
            // Integrations
            // ============================================
            // Enable default integrations including PanicIntegration
            // This ensures panics are captured and sent to Sentry
            default_integrations: true,
            ..Default::default()
        },
    ));

    // Install local crash handler AFTER Sentry init
    // The crash handler chains to Sentry's panic hook, so panics:
    // 1. Write to local crash.log (for offline recovery)
    // 2. Send to Sentry (via chained hook)
    core::crash::init();

    // Initialize settings manager and load settings
    let settings_manager = SettingsManager::new();
    if let Err(e) = settings_manager.load() {
        log::warn!("Failed to load settings: {e}");
    }

    // Initialize conversation manager (pure disk reader — no cache to warm)
    let conversation_manager = ConversationManager::new();

    // Initialize agent session manager
    // The sidecar path is resolved based on environment:
    // - Production: bundled next to the executable
    // - Development: in src-tauri/binaries/
    let sidecar_path = resolve_sidecar_path();
    log::info!("Agent bridge sidecar path: {}", sidecar_path.display());
    let session_manager = Arc::new(agent::SessionManager::new(sidecar_path));

    // Clone for .manage() before moving into .setup()
    let session_manager_for_state = Arc::clone(&session_manager);

    // Initialize browser window state
    let browser_state = Arc::new(BrowserWindowState::new());
    let browser_result_state = Arc::new(BrowserResultState::new());

    // Clone browser state for the main-window focus listener (Arc is moved into .manage())
    #[cfg(target_os = "macos")]
    let browser_state_for_focus = Arc::clone(&browser_state);

    // Initialize file index state (empty until workspace is opened)
    let file_index_state: FileIndexState = Arc::new(RwLock::new(Option::<FileIndex>::None));

    let result = tauri::Builder::default()
        // Managed state
        .manage(settings_manager)
        .manage(conversation_manager)
        .manage(session_manager_for_state)
        .manage(browser_state)
        .manage(browser_result_state)
        .manage(PreviewServerState::new())
        .manage(file_index_state)
        // Plugins
        .plugin(build_log_plugin().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(orbit_plugin_decorum::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // Setup event callbacks for agent and configure window
        .setup(move |app| {
            agent_cmd::setup_event_callbacks(app.handle(), &session_manager);

            #[cfg(target_os = "macos")]
            {
                use orbit_plugin_decorum::WebviewWindowExt as _;
                use tauri::Manager as _;
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

                if let Some(window) = app.get_webview_window("main") {
                    // Enable ProMotion 120Hz on supported displays.
                    drop(window.enable_promotion());

                    // Apply heavy frosted vibrancy (iOS 7 style).
                    // FullScreenUI has the heaviest gaussian blur of all NSVisualEffectMaterials,
                    // creating a deeply frosted diffusion instead of a straight see-through look.
                    // CSS surfaces at 70%/55% opacity mask any material tinting — only the
                    // blur effect shows through the transparent portion.
                    if let Err(e) = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::FullScreenUI,
                        None,
                        None,
                    ) {
                        log::warn!("Failed to apply frosted vibrancy: {e}");
                    }

                    // Fix macOS child window z-ordering: when the main window gains
                    // focus, the browser child window can appear behind the parent.
                    // Re-order visible child windows to front on every focus event
                    // using NSWindow.orderFront: (does NOT steal keyboard focus).
                    //
                    // Safety guards:
                    // - try_lock(): non-blocking to avoid deadlocking the main thread
                    // - Only fires for Focused(true) when the browser window exists
                    // - The decorum function itself skips hidden windows (isVisible check)
                    window.on_window_event(move |event| {
                        if !matches!(event, tauri::WindowEvent::Focused(true)) {
                            return;
                        }
                        // Non-blocking check: returns None if lock is contended
                        // (e.g., browser_create/browser_close on a Tokio thread).
                        // This prevents deadlocking the main thread event loop.
                        if browser_state_for_focus.try_is_active() != Some(true) {
                            return;
                        }
                        // The decorum function itself skips hidden child windows
                        // (checks NSWindow.isVisible before calling orderFront:).
                        orbit_plugin_decorum::order_child_windows_front();
                    });
                }
            }

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
            agent_cmd::browser_tool_response,
            agent_cmd::agent_set_thinking_mode,
            agent_cmd::agent_get_thinking_mode,
            agent_cmd::agent_set_model,
            agent_cmd::agent_set_plan_mode,
            agent_cmd::agent_get_plan_mode,
            agent_cmd::agent_set_accept_mode,
            agent_cmd::agent_get_accept_mode,
            // Session storage commands
            agent_cmd::agent_get_stored_session,
            agent_cmd::agent_cleanup_sessions,
            // Agent definition commands
            agent_cmd::agent_list_agents,
            agent_cmd::agent_get_agent,
            agent_cmd::agent_create_agent,
            agent_cmd::agent_update_agent,
            agent_cmd::agent_delete_agent,
            // Command definition commands
            agent_cmd::agent_list_commands,
            agent_cmd::agent_get_command,
            agent_cmd::agent_create_command,
            agent_cmd::agent_update_command,
            agent_cmd::agent_delete_command,
            // Fork and generate commands
            agent_cmd::agent_fork_session,
            agent_cmd::agent_rewind_files,
            agent_cmd::agent_fork_session_at,
            agent_cmd::agent_generate_agent_definition,
            agent_cmd::agent_generate_command_definition,
            // Canvas session commands
            canvas_cmd::canvas_create_session,
            canvas_cmd::canvas_delete_session,
            canvas_cmd::canvas_send_message,
            canvas_cmd::canvas_interrupt,
            canvas_cmd::canvas_tool_response,
            // Canvas setup commands
            canvas_setup::canvas_get_orbit_path,
            canvas_setup::canvas_check_setup,
            canvas_setup::canvas_initialize_directories,
            canvas_setup::canvas_mark_ready,
            canvas_setup::canvas_reset_setup,
            canvas_setup::canvas_get_registry,
            canvas_setup::canvas_save_registry,
            // Canvas error recovery commands
            canvas_setup::canvas_check_port_available,
            canvas_setup::canvas_get_download_state,
            canvas_setup::canvas_resume_download,
            // Canvas download commands
            canvas_download::canvas_download_component,
            canvas_download::canvas_download_utils,
            canvas_download::canvas_download_all_components,
            // Canvas preview commands
            canvas_preview::canvas_setup_preview_server,
            canvas_preview::canvas_install_preview_deps,
            canvas_preview::canvas_start_preview_server,
            canvas_preview::canvas_stop_preview_server,
            canvas_preview::canvas_preview_server_status,
            // Canvas save/export commands
            canvas_save::canvas_save_custom_component,
            canvas_save::canvas_export_component,
            // Canvas persist commands
            canvas_persist::canvas_read_component_source,
            canvas_persist::canvas_write_component_source,
            canvas_persist::canvas_restore_backup,
            canvas_persist::canvas_list_backups,
            canvas_persist::canvas_get_file_hash,
            canvas_persist::canvas_get_component_path,
            canvas_persist::canvas_get_globals_path,
            canvas_persist::canvas_read_file,
            canvas_persist::canvas_write_file,
            // Canvas transform commands
            canvas_transform::canvas_persist_styles,
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
            terminal::terminal_signal,
            terminal::terminal_acknowledge,
            terminal::terminal_pending_bytes,
            terminal::terminal_foreground_process,
            terminal::terminal_emit_prompt,
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
            git::git_fetch,
            git::git_clone,
            git::git_worktree_list,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_worktree_prune,
            // AI commands
            ai::ai_chat,
            ai::ai_complete,
            ai::ai_stop,
            // Search commands
            search::search_files,
            search::search_text,
            // Fuzzy file index commands
            search::build_file_index,
            search::fuzzy_search_files,
            search::clear_file_index,
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
            settings::add_ssh_host,
            settings::get_ssh_hosts,
            settings::remove_ssh_host,
            settings::clear_ssh_hosts,
            // Diagnostics commands
            diagnostics::check_previous_crash,
            diagnostics::clear_crash_log,
            diagnostics::get_crash_log_path,
            diagnostics::sentry_test_capture,
            diagnostics::sentry_test_error,
            // Conversation commands
            conversations::conversation_create,
            conversations::conversation_list,
            conversations::conversation_load,
            conversations::conversation_delete,
            conversations::conversation_update_title,
            conversations::conversation_add_message,
            conversations::conversation_fork,
            // Dev-monitor commands (dev-only)
            dev_monitor::dev_monitor_ensure_dir,
            dev_monitor::dev_monitor_write_batch,
            dev_monitor::dev_monitor_read_entries,
            dev_monitor::dev_monitor_clear,
            // Provider detection commands
            providers::check_claude_keychain,
            providers::trigger_claude_auth,
            // Credentials commands
            credentials::store_api_key,
            credentials::retrieve_api_key,
            credentials::validate_api_key,
            credentials::delete_api_key,
            // Embedded browser commands
            browser::browser_create,
            browser::browser_navigate,
            browser::browser_set_bounds,
            browser::browser_close,
            browser::browser_has,
            browser::browser_info,
            browser::browser_eval,
            browser::browser_js_callback,
            browser::browser_eval_async,
            browser::browser_screenshot,
            browser::browser_open_devtools,
            browser::app_open_devtools,
            // Browser navigation commands
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_stop,
            // Browser visibility commands
            browser::browser_show,
            browser::browser_hide,
            // Legacy browser commands
            browser::browser_detect,
            browser::browser_get_pid,
            browser::browser_clear,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("Error running Tauri application: {e}");
    }
}
