//! IPC Protocol types for Rust ↔ Node.js communication
//!
//! Matches the TypeScript types in agent-bridge/src/protocol.ts

#![allow(
    missing_docs,
    reason = "IPC data types mirror TypeScript definitions; field names are self-documenting"
)]

use hashbrown::HashMap;
use serde::{Deserialize, Serialize};

// ============================================================================
// Attachment Types
// ============================================================================

/// Attachment content block for Claude SDK
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentContentBlock {
    #[serde(rename = "type")]
    pub block_type: AttachmentType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AttachmentSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_end: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentType {
    Document,
    Image,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentSource {
    #[serde(rename = "type")]
    pub source_type: String, // "base64"
    pub media_type: String,
    pub data: String,
}

// ============================================================================
// Session Configuration
// ============================================================================

/// Session configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_thinking_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accept_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub critique_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<Model>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_mode: Option<SessionMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_session: Option<bool>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Model {
    Haiku,
    Sonnet,
    Opus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionMode {
    Chat,
    Agent,
}

// ============================================================================
// Agent Message Types
// ============================================================================

/// Agent message types sent from Node.js to Rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    #[serde(rename = "type")]
    pub message_type: AgentMessageType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<ToolMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub structured_output: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_subtype: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageType {
    Text,
    Thinking,
    ToolUse,
    Result,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ToolStatus>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ToolStatus {
    AwaitingPermission,
    Running,
    Success,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    /// Input tokens used
    pub input_tokens: u32,
    /// Output tokens used
    pub output_tokens: u32,
    /// Tokens read from cache
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    /// Tokens written to cache
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
}

// ============================================================================
// Permission Types
// ============================================================================

/// Permission request from Node.js
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub session_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub request_id: String,
}

/// Permission response to Node.js
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResponse {
    pub request_id: String,
    pub decision: PermissionDecision,
    pub always: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answers: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Approve,
    Deny,
}

// ============================================================================
// Session Events
// ============================================================================

/// Session initialization event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInitEvent {
    pub session_id: String,
    pub sdk_session_id: String,
    pub is_resumed: bool,
    pub is_forked: bool,
}

/// Serializable error
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerializableError {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
}

// ============================================================================
// Fork Session Types
// ============================================================================

/// Fork session options
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkSessionOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_alive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// Fork session result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkSessionResult {
    pub sdk_session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orbit_session_id: Option<String>,
}

// ============================================================================
// Request Types (Rust → Node.js)
// ============================================================================

/// All possible requests to send to Node.js sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BridgeRequest {
    CreateSession {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        config: Option<SessionConfig>,
    },
    DeleteSession {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    SendMessage {
        #[serde(rename = "sessionId")]
        session_id: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        attachments: Option<Vec<AttachmentContentBlock>>,
    },
    Interrupt {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    PermissionResponse {
        response: PermissionResponse,
    },
    SetThinkingMode {
        #[serde(rename = "sessionId")]
        session_id: String,
        enabled: bool,
        #[serde(rename = "maxTokens", skip_serializing_if = "Option::is_none")]
        max_tokens: Option<u32>,
    },
    GetThinkingMode {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    SetModel {
        #[serde(rename = "sessionId")]
        session_id: String,
        model: Model,
    },
    SetPlanMode {
        #[serde(rename = "sessionId")]
        session_id: String,
        enabled: bool,
    },
    GetPlanMode {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    SetAcceptMode {
        #[serde(rename = "sessionId")]
        session_id: String,
        enabled: bool,
    },
    GetAcceptMode {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    IsSessionReady {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    GetSdkSessionId {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    GetStoredSession {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    CleanupSessions {
        #[serde(rename = "maxAgeDays", skip_serializing_if = "Option::is_none")]
        max_age_days: Option<u32>,
    },
    // Agent Definition Operations
    ListAgents {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
    },
    GetAgent {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        name: String,
    },
    CreateAgent {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        agent: SubagentDefinition,
    },
    UpdateAgent {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        #[serde(rename = "originalName")]
        original_name: String,
        agent: SubagentDefinition,
    },
    DeleteAgent {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        name: String,
    },
    // Command Definition Operations
    ListCommands {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
    },
    GetCommand {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        name: String,
        scope: CommandScope,
    },
    CreateCommand {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        command: SlashCommandDefinition,
    },
    UpdateCommand {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        #[serde(rename = "originalName")]
        original_name: String,
        command: SlashCommandDefinition,
    },
    DeleteCommand {
        #[serde(rename = "workspacePath")]
        workspace_path: String,
        name: String,
        scope: CommandScope,
    },
    // Fork and Generate Operations
    ForkSession {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        options: Option<ForkSessionOptions>,
    },
    GenerateAgentDefinition {
        description: String,
    },
    GenerateCommandDefinition {
        description: String,
    },
    Shutdown,
}

// ============================================================================
// Response Types (Node.js → Rust)
// ============================================================================

/// Command responses from Node.js
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CommandResponse {
    Success {
        #[serde(rename = "requestType")]
        request_type: String,
    },
    Error {
        #[serde(rename = "requestType")]
        request_type: String,
        error: String,
    },
    Boolean {
        #[serde(rename = "requestType")]
        request_type: String,
        value: bool,
    },
    String {
        #[serde(rename = "requestType")]
        request_type: String,
        value: Option<String>,
    },
    Number {
        #[serde(rename = "requestType")]
        request_type: String,
        value: i64,
    },
    #[serde(rename = "agent_list")]
    AgentList {
        #[serde(rename = "requestType")]
        request_type: String,
        agents: Vec<SubagentDefinition>,
    },
    Agent {
        #[serde(rename = "requestType")]
        request_type: String,
        agent: Option<SubagentDefinition>,
    },
    #[serde(rename = "command_list")]
    CommandList {
        #[serde(rename = "requestType")]
        request_type: String,
        commands: Vec<SlashCommandDefinition>,
    },
    Command {
        #[serde(rename = "requestType")]
        request_type: String,
        command: Option<SlashCommandDefinition>,
    },
    #[serde(rename = "fork_result")]
    ForkResult {
        #[serde(rename = "requestType")]
        request_type: String,
        result: ForkSessionResult,
    },
}

/// Events from Node.js (unsolicited)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BridgeEvent {
    AgentMessage {
        #[serde(rename = "sessionId")]
        session_id: String,
        message: AgentMessage,
    },
    PermissionRequest {
        request: PermissionRequest,
    },
    SessionInit {
        event: SessionInitEvent,
    },
    PlanModeChanged {
        #[serde(rename = "sessionId")]
        session_id: String,
        enabled: bool,
    },
    AcceptModeChanged {
        #[serde(rename = "sessionId")]
        session_id: String,
        enabled: bool,
    },
    ErrorEvent {
        error: SerializableError,
    },
    Ready,
}

/// All possible messages from Node.js
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BridgeResponse {
    /// Command response
    Command(CommandResponse),
    /// Event (boxed to reduce enum size)
    Event(Box<BridgeEvent>),
}

impl BridgeResponse {
    /// Check if this is a ready event
    #[must_use]
    pub fn is_ready(&self) -> bool {
        matches!(self, Self::Event(evt) if matches!(**evt, BridgeEvent::Ready))
    }

    /// Try to get as command response
    #[must_use]
    pub fn as_command(&self) -> Option<&CommandResponse> {
        match self {
            Self::Command(cmd) => Some(cmd),
            Self::Event(_) => None,
        }
    }

    /// Try to get as event
    #[must_use]
    pub fn as_event(&self) -> Option<&BridgeEvent> {
        match self {
            Self::Command(_) => None,
            Self::Event(evt) => Some(evt),
        }
    }
}

// ============================================================================
// Subagent Definition Types
// ============================================================================

/// Model type for agents/commands (includes 'inherit' option)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentModel {
    Sonnet,
    Opus,
    Haiku,
    Inherit,
}

/// Subagent definition from .claude/agents/*.md
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentDefinition {
    pub name: String,
    pub description: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disallowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<AgentModel>,
}

// ============================================================================
// Slash Command Definition Types
// ============================================================================

/// Command scope: where the command comes from
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommandScope {
    Builtin,
    Default,
    Project,
    Personal,
}

/// Slash command definition from .claude/commands/*.md
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandDefinition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<Model>,
    pub scope: CommandScope,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub readonly: Option<bool>,
}
