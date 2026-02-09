//! Agent commands for Claude Agent SDK integration
//!
//! These commands interact with the Node.js sidecar via IPC.

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

use tauri::{AppHandle, Emitter as _, State};

use crate::agent::{
    AttachmentContentBlock, CommandScope, ForkSessionOptions, ForkSessionResult, McpToolResponse,
    Model, PermissionDecision, PermissionResponse, SessionConfig, SessionManager,
    SlashCommandDefinition, SubagentDefinition,
};

/// Result type for agent commands
type Result<T> = result::Result<T, String>;

/// Convert bridge error to string
fn to_error<E: Display>(e: E) -> String {
    e.to_string()
}

// ============================================================================
// Session Management Commands
// ============================================================================

/// Create a new agent session
#[tauri::command]
pub async fn agent_create_session(
    session_id: String,
    config: Option<SessionConfig>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state.create_session(&session_id, config).map_err(to_error)
}

/// Delete an agent session
#[tauri::command]
pub async fn agent_delete_session(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state.delete_session(&session_id).map_err(to_error)
}

/// Send a message to an agent session
#[tauri::command]
pub async fn agent_send_message(
    session_id: String,
    message: String,
    attachments: Option<Vec<AttachmentContentBlock>>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state
        .send_message(&session_id, &message, attachments)
        .map_err(to_error)
}

/// Interrupt the current agent execution
#[tauri::command]
pub async fn agent_interrupt(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state.interrupt(&session_id).map_err(to_error)
}

/// Check if a session is ready
#[tauri::command]
pub async fn agent_is_session_ready(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<bool> {
    state.is_session_ready(&session_id).map_err(to_error)
}

/// Get the SDK session ID
#[tauri::command]
pub async fn agent_get_sdk_session_id(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Option<String>> {
    state.get_sdk_session_id(&session_id).map_err(to_error)
}

// ============================================================================
// Permission Commands
// ============================================================================

/// Respond to a permission request
#[tauri::command]
pub async fn agent_respond_permission(
    request_id: String,
    decision: String,
    always: bool,
    answers: Option<hashbrown::HashMap<String, String>>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    let decision = match decision.as_str() {
        "approve" => PermissionDecision::Approve,
        "deny" => PermissionDecision::Deny,
        _ => return Err("Invalid decision: must be 'approve' or 'deny'".to_owned()),
    };

    let response = PermissionResponse {
        request_id,
        decision,
        always,
        answers,
    };

    state.respond_to_permission(response).map_err(to_error)
}

/// Send a browser MCP tool response back to the agent session
#[tauri::command]
pub async fn browser_tool_response(
    session_id: String,
    response: McpToolResponse,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state
        .browser_tool_response(&session_id, response)
        .map_err(to_error)
}

// ============================================================================
// Mode Commands
// ============================================================================

/// Set thinking mode for a session
#[tauri::command]
pub async fn agent_set_thinking_mode(
    session_id: String,
    enabled: bool,
    max_tokens: Option<u32>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state
        .set_thinking_mode(&session_id, enabled, max_tokens)
        .map_err(to_error)
}

/// Get thinking mode for a session
#[tauri::command]
pub async fn agent_get_thinking_mode(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<bool> {
    state.get_thinking_mode(&session_id).map_err(to_error)
}

/// Set model for a session
#[tauri::command]
pub async fn agent_set_model(
    session_id: String,
    model: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    let model = match model.as_str() {
        "haiku" => Model::Haiku,
        "sonnet" => Model::Sonnet,
        "opus" => Model::Opus,
        _ => return Err("Invalid model: must be 'haiku', 'sonnet', or 'opus'".to_owned()),
    };

    state.set_model(&session_id, model).map_err(to_error)
}

/// Set plan mode for a session
#[tauri::command]
pub async fn agent_set_plan_mode(
    session_id: String,
    enabled: bool,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state.set_plan_mode(&session_id, enabled).map_err(to_error)
}

/// Get plan mode for a session
#[tauri::command]
pub async fn agent_get_plan_mode(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<bool> {
    state.get_plan_mode(&session_id).map_err(to_error)
}

/// Set accept mode for a session
#[tauri::command]
pub async fn agent_set_accept_mode(
    session_id: String,
    enabled: bool,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state
        .set_accept_mode(&session_id, enabled)
        .map_err(to_error)
}

/// Get accept mode for a session
#[tauri::command]
pub async fn agent_get_accept_mode(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<bool> {
    state.get_accept_mode(&session_id).map_err(to_error)
}

// ============================================================================
// Session Storage Commands
// ============================================================================

/// Get stored SDK session ID for resume
#[tauri::command]
pub async fn agent_get_stored_session(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Option<String>> {
    state.get_stored_session(&session_id).map_err(to_error)
}

/// Cleanup old sessions
#[tauri::command]
pub async fn agent_cleanup_sessions(
    max_age_days: Option<u32>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<i64> {
    state.cleanup_sessions(max_age_days).map_err(to_error)
}

// ============================================================================
// Agent Definition Commands
// ============================================================================

/// List all agents in workspace
#[tauri::command]
pub async fn agent_list_agents(
    workspace_path: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Vec<SubagentDefinition>> {
    state.list_agents(&workspace_path).map_err(to_error)
}

/// Get a single agent by name
#[tauri::command]
pub async fn agent_get_agent(
    workspace_path: String,
    name: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Option<SubagentDefinition>> {
    state.get_agent(&workspace_path, &name).map_err(to_error)
}

/// Create a new agent
#[tauri::command]
pub async fn agent_create_agent(
    workspace_path: String,
    agent: SubagentDefinition,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SubagentDefinition> {
    state.create_agent(&workspace_path, agent).map_err(to_error)
}

/// Update an existing agent
#[tauri::command]
pub async fn agent_update_agent(
    workspace_path: String,
    original_name: String,
    agent: SubagentDefinition,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SubagentDefinition> {
    state
        .update_agent(&workspace_path, &original_name, agent)
        .map_err(to_error)
}

/// Delete an agent
#[tauri::command]
pub async fn agent_delete_agent(
    workspace_path: String,
    name: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    state.delete_agent(&workspace_path, &name).map_err(to_error)
}

// ============================================================================
// Command Definition Commands
// ============================================================================

/// List all commands in workspace
#[tauri::command]
pub async fn agent_list_commands(
    workspace_path: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Vec<SlashCommandDefinition>> {
    state.list_commands(&workspace_path).map_err(to_error)
}

/// Get a single command by name and scope
#[tauri::command]
pub async fn agent_get_command(
    workspace_path: String,
    name: String,
    scope: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Option<SlashCommandDefinition>> {
    let scope = match scope.as_str() {
        "builtin" => CommandScope::Builtin,
        "default" => CommandScope::Default,
        "project" => CommandScope::Project,
        "personal" => CommandScope::Personal,
        _ => {
            return Err(
                "Invalid scope: must be 'builtin', 'default', 'project', or 'personal'".to_owned(),
            )
        },
    };
    state
        .get_command(&workspace_path, &name, scope)
        .map_err(to_error)
}

/// Create a new command
#[tauri::command]
pub async fn agent_create_command(
    workspace_path: String,
    command: SlashCommandDefinition,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SlashCommandDefinition> {
    state
        .create_command(&workspace_path, command)
        .map_err(to_error)
}

/// Update an existing command
#[tauri::command]
pub async fn agent_update_command(
    workspace_path: String,
    original_name: String,
    command: SlashCommandDefinition,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SlashCommandDefinition> {
    state
        .update_command(&workspace_path, &original_name, command)
        .map_err(to_error)
}

/// Delete a command
#[tauri::command]
pub async fn agent_delete_command(
    workspace_path: String,
    name: String,
    scope: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    let scope = match scope.as_str() {
        "builtin" => CommandScope::Builtin,
        "default" => CommandScope::Default,
        "project" => CommandScope::Project,
        "personal" => CommandScope::Personal,
        _ => {
            return Err(
                "Invalid scope: must be 'builtin', 'default', 'project', or 'personal'".to_owned(),
            )
        },
    };
    state
        .delete_command(&workspace_path, &name, scope)
        .map_err(to_error)
}

// ============================================================================
// Fork and Generate Commands
// ============================================================================

/// Fork a session (create a checkpoint/branch)
#[tauri::command]
pub async fn agent_fork_session(
    session_id: String,
    options: Option<ForkSessionOptions>,
    state: State<'_, Arc<SessionManager>>,
) -> Result<ForkSessionResult> {
    state.fork_session(&session_id, options).map_err(to_error)
}

/// Rewind files to a specific checkpoint.
/// This restores all files modified by Write, Edit, NotebookEdit tools
/// to their state at the given checkpoint UUID.
#[tauri::command]
pub async fn agent_rewind_files(
    session_id: String,
    checkpoint_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<()> {
    log::debug!(
        "[REWIND] Tauri cmd agent_rewind_files — session_id={}, checkpoint_id={}",
        session_id,
        &checkpoint_id[..8.min(checkpoint_id.len())]
    );
    let result = state
        .rewind_files(&session_id, &checkpoint_id)
        .map_err(to_error);
    log::debug!(
        "[REWIND] Tauri cmd agent_rewind_files — result={}",
        if result.is_ok() { "ok" } else { "err" }
    );
    result
}

/// Fork a session at a specific message point.
/// Creates a new SDK session that has context only UP TO the specified message.
/// Used for rewind operations - Claude only sees the conversation history up to that point.
#[tauri::command]
pub async fn agent_fork_session_at(
    session_id: String,
    at_message_uuid: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<String> {
    log::debug!(
        "[REWIND] Tauri cmd agent_fork_session_at — session_id={}, at_message_uuid={}",
        session_id,
        &at_message_uuid[..8.min(at_message_uuid.len())]
    );
    let result = state
        .fork_session_at(&session_id, &at_message_uuid)
        .map_err(to_error);
    log::debug!(
        "[REWIND] Tauri cmd agent_fork_session_at — result={}",
        match &result {
            Ok(id) => format!("ok({})", &id[..8.min(id.len())]),
            Err(e) => format!("err({e})"),
        }
    );
    result
}

/// Generate an agent definition from a natural language description
#[tauri::command]
pub async fn agent_generate_agent_definition(
    description: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SubagentDefinition> {
    state
        .generate_agent_definition(&description)
        .map_err(to_error)
}

/// Generate a command definition from a natural language description
#[tauri::command]
pub async fn agent_generate_command_definition(
    description: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<SlashCommandDefinition> {
    state
        .generate_command_definition(&description)
        .map_err(to_error)
}

// ============================================================================
// Event Wiring
// ============================================================================

use crate::agent::protocol::{
    AgentMessage, BridgeEvent, McpToolRequest, PermissionRequest, SDKMessage, SerializableError,
    SessionInitEvent,
};

/// Emit agent message event
fn emit_agent_message(app: &AppHandle, session_id: &str, message: &AgentMessage) {
    drop(app.emit(
        "agent:message",
        serde_json::json!({
            "sessionId": session_id,
            "message": message,
        }),
    ));
}

/// Emit permission request event
fn emit_permission_request(app: &AppHandle, request: &PermissionRequest) {
    drop(app.emit(
        "agent:permission_request",
        serde_json::json!({
            "sessionId": request.session_id,
            "toolName": request.tool_name,
            "toolInput": request.tool_input,
            "requestId": request.request_id,
        }),
    ));
}

/// Emit session init event
fn emit_session_init(app: &AppHandle, init_event: &SessionInitEvent) {
    log::debug!(
        "[REWIND] Tauri emit agent:session_init — sessionId={}, sdkSessionId={}, isResumed={}, isForked={}",
        init_event.session_id,
        &init_event.sdk_session_id[..8.min(init_event.sdk_session_id.len())],
        init_event.is_resumed,
        init_event.is_forked,
    );
    drop(app.emit(
        "agent:session_init",
        serde_json::json!({
            "sessionId": init_event.session_id,
            "sdkSessionId": init_event.sdk_session_id,
            "isResumed": init_event.is_resumed,
            "isForked": init_event.is_forked,
        }),
    ));
}

/// Emit plan mode changed event
fn emit_plan_mode_changed(app: &AppHandle, session_id: &str, enabled: bool) {
    drop(app.emit(
        "agent:plan_mode_changed",
        serde_json::json!({
            "sessionId": session_id,
            "enabled": enabled,
        }),
    ));
}

/// Emit accept mode changed event
fn emit_accept_mode_changed(app: &AppHandle, session_id: &str, enabled: bool) {
    drop(app.emit(
        "agent:accept_mode_changed",
        serde_json::json!({
            "sessionId": session_id,
            "enabled": enabled,
        }),
    ));
}

/// Emit error event
fn emit_error(app: &AppHandle, error: &SerializableError) {
    drop(app.emit(
        "agent:error",
        serde_json::json!({
            "message": error.message,
            "stack": error.stack,
        }),
    ));
}

/// Emit checkpoint event
fn emit_checkpoint(app: &AppHandle, session_id: &str, checkpoint_id: &str) {
    log::debug!(
        "[REWIND] Tauri emit agent:checkpoint — sessionId={}, checkpointId={}",
        session_id,
        &checkpoint_id[..8.min(checkpoint_id.len())]
    );
    drop(app.emit(
        "agent:checkpoint",
        serde_json::json!({
            "sessionId": session_id,
            "checkpointId": checkpoint_id,
        }),
    ));
}

/// Emit canvas message event
fn emit_canvas_message(app: &AppHandle, session_id: &str, message: &SDKMessage) {
    drop(app.emit(
        "canvas:message",
        serde_json::json!({
            "sessionId": session_id,
            "message": message,
        }),
    ));
}

/// Emit canvas tool request event
fn emit_canvas_tool_request(app: &AppHandle, session_id: &str, request: &McpToolRequest) {
    drop(app.emit(
        "canvas:tool_request",
        serde_json::json!({
            "sessionId": session_id,
            "request": request,
        }),
    ));
}

/// Emit browser tool request event
fn emit_browser_tool_request(app: &AppHandle, session_id: &str, request: &McpToolRequest) {
    drop(app.emit(
        "browser:tool_request",
        serde_json::json!({
            "sessionId": session_id,
            "request": request,
        }),
    ));
}

/// Emit canvas error event
fn emit_canvas_error(app: &AppHandle, session_id: &str, error: &str) {
    drop(app.emit(
        "canvas:error",
        serde_json::json!({
            "sessionId": session_id,
            "error": error,
        }),
    ));
}

/// Emit auth error event
fn emit_auth_error(
    app: &AppHandle,
    session_id: &str,
    category: &str,
    message: &str,
    recoverable: bool,
) {
    drop(app.emit(
        "agent:auth_error",
        serde_json::json!({
            "sessionId": session_id,
            "category": category,
            "message": message,
            "recoverable": recoverable,
        }),
    ));
}

/// Wire up event callbacks to emit Tauri events
pub fn setup_event_callbacks(app: &AppHandle, session_manager: &Arc<SessionManager>) {
    let app_handle = app.clone();

    session_manager.set_event_callback(Arc::new(move |event: BridgeEvent| match event {
        BridgeEvent::AgentMessage {
            session_id,
            message,
        } => emit_agent_message(&app_handle, &session_id, &message),
        BridgeEvent::PermissionRequest { request } => {
            emit_permission_request(&app_handle, &request);
        },
        BridgeEvent::SessionInit { event: init_event } => {
            emit_session_init(&app_handle, &init_event);
        },
        BridgeEvent::PlanModeChanged {
            session_id,
            enabled,
        } => emit_plan_mode_changed(&app_handle, &session_id, enabled),
        BridgeEvent::AcceptModeChanged {
            session_id,
            enabled,
        } => emit_accept_mode_changed(&app_handle, &session_id, enabled),
        BridgeEvent::ErrorEvent { error } => emit_error(&app_handle, &error),
        BridgeEvent::Ready => {
            drop(app_handle.emit("agent:ready", ()));
        },
        BridgeEvent::Checkpoint {
            session_id,
            checkpoint_id,
        } => emit_checkpoint(&app_handle, &session_id, &checkpoint_id),
        BridgeEvent::CanvasMessage {
            session_id,
            message,
        } => emit_canvas_message(&app_handle, &session_id, &message),
        BridgeEvent::CanvasToolRequest {
            session_id,
            request,
        } => emit_canvas_tool_request(&app_handle, &session_id, &request),
        BridgeEvent::CanvasError { session_id, error } => {
            emit_canvas_error(&app_handle, &session_id, &error);
        },
        BridgeEvent::BrowserToolRequest {
            session_id,
            request,
        } => emit_browser_tool_request(&app_handle, &session_id, &request),
        BridgeEvent::AuthError {
            session_id,
            category,
            message,
            recoverable,
        } => emit_auth_error(&app_handle, &session_id, &category, &message, recoverable),
    }));
}
