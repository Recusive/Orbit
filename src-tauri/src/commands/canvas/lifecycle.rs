//! Canvas commands for Claude canvas agent integration
//!
//! These commands interact with the canvas session in the Node.js sidecar.

#![expect(
    clippy::unreachable,
    reason = "Tauri command macro generates unreachable!() for exhaustive match arms"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]

use std::fmt::Display;
use std::result;
use std::sync::Arc;

use tauri::State;

use crate::agent::protocol::{CanvasSessionConfig, CanvasState, McpToolResponse};
use crate::agent::SessionManager;
use crate::core::perf_logger::PerfSource;
use crate::perf_log;

/// Result type for canvas commands (matches agent commands pattern)
type Result<T> = result::Result<T, String>;

/// Convert error to string
fn to_error<E: Display>(e: E) -> String {
    e.to_string()
}

// ============================================================================
// Canvas Session Commands
// ============================================================================

/// Create a new canvas session
#[tauri::command]
pub async fn canvas_create_session(
    session_id: String,
    config: Option<CanvasSessionConfig>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    perf_log!(PerfSource::Canvas, "canvas_create_session", {
        state
            .canvas_create_session(&session_id, config)
            .map_err(to_error)
    })
}

/// Delete a canvas session
#[tauri::command]
pub async fn canvas_delete_session(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    perf_log!(PerfSource::Canvas, "canvas_delete_session", {
        state.canvas_delete_session(&session_id).map_err(to_error)
    })
}

/// Send a message to a canvas session with current canvas state
#[tauri::command]
pub async fn canvas_send_message(
    session_id: String,
    message: String,
    canvas_state: CanvasState,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    perf_log!(PerfSource::Canvas, "canvas_send_message", {
        state
            .canvas_send_message(&session_id, &message, canvas_state)
            .map_err(to_error)
    })
}

/// Interrupt a canvas session
#[tauri::command]
pub async fn canvas_interrupt(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    perf_log!(PerfSource::Canvas, "canvas_interrupt", {
        state.canvas_interrupt(&session_id).map_err(to_error)
    })
}

/// Send a tool response back to a canvas session
#[tauri::command]
pub async fn canvas_tool_response(
    session_id: String,
    response: McpToolResponse,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    perf_log!(PerfSource::Canvas, "canvas_tool_response", {
        state
            .canvas_tool_response(&session_id, response)
            .map_err(to_error)
    })
}
