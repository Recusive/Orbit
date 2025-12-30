//! Terminal commands for Tauri
//!
//! These commands provide terminal functionality via PTY sessions.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde::{Deserialize, Serialize};
use snowflake_core::{Result, TerminalInfo};
use snowflake_terminal::{ForegroundProcess, Signal, TerminalConfig, TerminalManager};
use tauri::{AppHandle, Emitter as _};
use tokio::time::sleep;

static TERMINAL_MANAGER: OnceLock<TerminalManager> = OnceLock::new();

/// Interval for polling foreground process changes (milliseconds).
const FOREGROUND_POLL_INTERVAL_MS: u64 = 500;

fn get_terminal_manager() -> &'static TerminalManager {
    TERMINAL_MANAGER.get_or_init(TerminalManager::new)
}

/// Terminal output event payload.
#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputEvent {
    /// Terminal ID.
    pub id: String,
    /// Base64-encoded output data.
    pub data: String,
}

/// Terminal exit event payload.
#[derive(Debug, Clone, Serialize)]
pub struct TerminalExitEvent {
    /// Terminal ID.
    pub id: String,
    /// Exit code (0 if unknown).
    pub code: i32,
}

/// Terminal foreground process change event payload.
#[derive(Debug, Clone, Serialize)]
pub struct TerminalForegroundEvent {
    /// Terminal ID.
    pub id: String,
    /// Current foreground process name (e.g., "zsh", "node", "python").
    pub process_name: String,
    /// Process ID.
    pub pid: u32,
}

/// Create a new terminal session.
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command requires all parameters"
)]
pub async fn terminal_create(
    app: AppHandle,
    id: String,
    cwd: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalInfo> {
    let mut config = TerminalConfig::new();

    if let Some(shell) = shell {
        config = config.with_shell(shell);
    }

    if let Some(cwd) = cwd {
        config = config.with_cwd(PathBuf::from(cwd));
    }

    if let Some(cols) = cols {
        config.cols = cols;
    }

    if let Some(rows) = rows {
        config.rows = rows;
    }

    let manager = get_terminal_manager();
    let terminal = manager.create(id.clone(), config)?;
    let info = terminal.info();

    // Get initial shell name for foreground process
    let initial_process_name = terminal.shell_name().to_owned();

    // Take the output receiver and spawn a task to forward output
    if let Some(mut receiver) = terminal.take_output_receiver() {
        let terminal_id = id.clone();
        let app_for_output = app.clone();

        let _handle = tokio::spawn(async move {
            while let Some(data) = receiver.recv().await {
                // Encode data as base64
                let encoded = BASE64_STANDARD.encode(&data);

                let event = TerminalOutputEvent {
                    id: terminal_id.clone(),
                    data: encoded,
                };

                // Emit to frontend
                if app_for_output.emit("terminal:output", &event).is_err() {
                    log::warn!("Failed to emit terminal output event for '{terminal_id}'");
                    break;
                }
            }

            // Terminal closed, emit exit event
            let exit_event = TerminalExitEvent {
                id: terminal_id,
                code: 0,
            };

            let _result = app_for_output.emit("terminal:exit", &exit_event);
        });
    } else {
        // This shouldn't happen in normal operation
        log::warn!("Terminal '{id}' has no output receiver - output forwarding disabled");
    }

    // Emit initial foreground process (shell name)
    let initial_event = TerminalForegroundEvent {
        id: id.clone(),
        process_name: initial_process_name,
        pid: info.pid,
    };
    let _result = app.emit("terminal:foreground", &initial_event);

    // Spawn a task to poll for foreground process changes
    let terminal_id_for_poll = id;
    let _poll_handle = tokio::spawn(async move {
        let poll_interval = Duration::from_millis(FOREGROUND_POLL_INTERVAL_MS);

        loop {
            sleep(poll_interval).await;

            let manager = get_terminal_manager();

            // Check if terminal still exists
            let Some(terminal) = manager.get(&terminal_id_for_poll) else {
                break;
            };

            // Check if terminal is still running
            if !terminal.is_running() {
                break;
            }

            // Check for foreground process change
            if let Some(new_process) = terminal.check_foreground_change() {
                let event = TerminalForegroundEvent {
                    id: terminal_id_for_poll.clone(),
                    process_name: new_process.name,
                    pid: new_process.pid,
                };

                if app.emit("terminal:foreground", &event).is_err() {
                    log::warn!(
                        "Failed to emit terminal foreground event for '{terminal_id_for_poll}'"
                    );
                    break;
                }
            }
        }
    });

    Ok(info)
}

/// Write data to a terminal.
#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<()> {
    let manager = get_terminal_manager();
    manager.write(&id, data.as_bytes())
}

/// Resize a terminal.
#[tauri::command]
pub async fn terminal_resize(id: String, cols: u16, rows: u16) -> Result<()> {
    let manager = get_terminal_manager();
    manager.resize(&id, cols, rows)
}

/// Close a terminal session.
#[tauri::command]
pub async fn terminal_close(id: String) -> Result<()> {
    let manager = get_terminal_manager();
    manager.close(&id)
}

/// List all active terminal IDs.
#[tauri::command]
pub async fn terminal_list() -> Result<Vec<String>> {
    let manager = get_terminal_manager();
    Ok(manager.list())
}

/// Send a signal to a terminal.
#[tauri::command]
pub async fn terminal_signal(id: String, signal: String) -> Result<()> {
    let signal = match signal.to_uppercase().as_str() {
        "SIGINT" => Signal::Sigint,
        "SIGTERM" => Signal::Sigterm,
        "SIGKILL" => Signal::Sigkill,
        _ => {
            return Err(snowflake_core::Error::Terminal(format!(
                "Invalid signal: {signal}. Must be SIGINT, SIGTERM, or SIGKILL"
            )))
        },
    };

    let manager = get_terminal_manager();
    manager.send_signal(&id, signal)
}

/// Acknowledge data received from a terminal (for flow control).
#[tauri::command]
pub async fn terminal_acknowledge(id: String, byte_count: u64) -> Result<()> {
    let manager = get_terminal_manager();
    manager.acknowledge_data(&id, byte_count)
}

/// Get pending bytes for a terminal (bytes written but not acknowledged).
#[tauri::command]
pub async fn terminal_pending_bytes(id: String) -> Result<u64> {
    let manager = get_terminal_manager();
    manager.pending_bytes(&id)
}

/// Get the current foreground process for a terminal.
#[tauri::command]
pub async fn terminal_foreground_process(id: String) -> Result<ForegroundProcess> {
    let manager = get_terminal_manager();
    manager.get_foreground_process(&id)
}

/// Prompt event payload (emitted when shell integration detects a prompt).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalPromptEvent {
    /// Terminal ID.
    pub id: String,
    /// Prompt type: "primary", "continuation", or "secondary".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_type: Option<String>,
}

/// Emit a prompt event (called by frontend when shell integration detects a prompt).
#[tauri::command]
pub async fn terminal_emit_prompt(
    app: AppHandle,
    id: String,
    prompt_type: Option<String>,
) -> Result<()> {
    let event = TerminalPromptEvent { id, prompt_type };
    app.emit("terminal:prompt", &event)
        .map_err(|e| snowflake_core::Error::Terminal(format!("Failed to emit prompt event: {e}")))
}
