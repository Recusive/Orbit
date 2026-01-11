//! Conversation commands for Tauri
//!
//! These commands provide conversation persistence operations.

#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use orbit_conversations::{
    Conversation, ConversationManager, ConversationSummary, Message, MessageRole, TokenUsage,
    ToolUse,
};
use orbit_core::Result;
use tauri::State;

/// Serializable message for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    /// Message ID
    pub id: String,
    /// Role: "user", "assistant", or "system"
    pub role: String,
    /// Message content
    pub content: String,
    /// Optional thinking content
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    /// Timestamp (Unix epoch ms)
    pub created_at: u64,
    /// Tool uses
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_uses: Vec<ToolUseDto>,
    /// Token usage for this message (assistant messages only)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsageDto>,
}

/// Serializable tool use for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUseDto {
    /// Tool use ID
    pub id: String,
    /// Tool name
    pub name: String,
    /// Tool input
    pub input: serde_json::Value,
    /// Tool output
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Success status
    #[serde(default = "default_true")]
    pub success: bool,
}

/// Serializable token usage for frontend
#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageDto {
    /// Input tokens consumed
    #[serde(default)]
    pub input_tokens: u32,
    /// Output tokens generated
    #[serde(default)]
    pub output_tokens: u32,
    /// Tokens read from cache
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    /// Tokens used to create cache
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    /// Total cost in USD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_cost_usd: Option<f64>,
}

impl From<TokenUsage> for TokenUsageDto {
    fn from(usage: TokenUsage) -> Self {
        Self {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            total_cost_usd: usage.total_cost_usd,
        }
    }
}

impl From<TokenUsageDto> for TokenUsage {
    fn from(dto: TokenUsageDto) -> Self {
        Self {
            input_tokens: dto.input_tokens,
            output_tokens: dto.output_tokens,
            cache_read_input_tokens: dto.cache_read_input_tokens,
            cache_creation_input_tokens: dto.cache_creation_input_tokens,
            total_cost_usd: dto.total_cost_usd,
        }
    }
}

const fn default_true() -> bool {
    true
}

impl From<Message> for MessageDto {
    fn from(msg: Message) -> Self {
        Self {
            id: msg.id,
            role: match msg.role {
                MessageRole::User => String::from("user"),
                MessageRole::Assistant => String::from("assistant"),
                MessageRole::System => String::from("system"),
                // Handle future variants
                _ => String::from("unknown"),
            },
            content: msg.content,
            thinking: msg.thinking,
            created_at: msg.created_at,
            tool_uses: msg.tool_uses.into_iter().map(ToolUseDto::from).collect(),
            usage: msg.usage.map(TokenUsageDto::from),
        }
    }
}

impl From<ToolUse> for ToolUseDto {
    fn from(tu: ToolUse) -> Self {
        Self {
            id: tu.id,
            name: tu.name,
            input: tu.input,
            output: tu.output,
            success: tu.success,
        }
    }
}

impl From<MessageDto> for Message {
    fn from(dto: MessageDto) -> Self {
        Self {
            id: dto.id,
            role: match dto.role.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                _ => MessageRole::System,
            },
            content: dto.content,
            thinking: dto.thinking,
            created_at: dto.created_at,
            tool_uses: dto.tool_uses.into_iter().map(ToolUse::from).collect(),
            usage: dto.usage.map(TokenUsage::from),
        }
    }
}

impl From<ToolUseDto> for ToolUse {
    fn from(dto: ToolUseDto) -> Self {
        Self {
            id: dto.id,
            name: dto.name,
            input: dto.input,
            output: dto.output,
            success: dto.success,
        }
    }
}

/// Serializable conversation for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    /// Session ID
    pub session_id: String,
    /// Title
    pub title: String,
    /// Created timestamp
    pub created_at: u64,
    /// Updated timestamp
    pub updated_at: u64,
    /// Messages
    pub messages: Vec<MessageDto>,
    /// Workspace path
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    /// Forked from session ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
}

impl From<Conversation> for ConversationDto {
    fn from(conv: Conversation) -> Self {
        Self {
            session_id: conv.session_id,
            title: conv.title,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            messages: conv.messages.into_iter().map(MessageDto::from).collect(),
            workspace_path: conv.workspace_path,
            forked_from: conv.forked_from,
        }
    }
}

/// Serializable conversation summary for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummaryDto {
    /// Session ID
    pub session_id: String,
    /// Title
    pub title: String,
    /// Updated timestamp
    pub updated_at: u64,
    /// Message count
    pub message_count: usize,
    /// Workspace path
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
}

impl From<ConversationSummary> for ConversationSummaryDto {
    fn from(summary: ConversationSummary) -> Self {
        Self {
            session_id: summary.session_id,
            title: summary.title,
            updated_at: summary.updated_at,
            message_count: summary.message_count,
            workspace_path: summary.workspace_path,
        }
    }
}

// ============================================
// Tauri Commands
// ============================================

/// Create a new conversation
#[tauri::command]
pub fn conversation_create(
    session_id: String,
    title: String,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<ConversationDto> {
    let conv = manager.create(session_id, title, workspace_path)?;
    Ok(ConversationDto::from(conv))
}

/// List conversations for a workspace (summaries only)
#[tauri::command]
pub fn conversation_list(
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<Vec<ConversationSummaryDto>> {
    let summaries = manager.load_summaries_for_workspace(workspace_path.as_deref())?;
    Ok(summaries
        .into_iter()
        .map(ConversationSummaryDto::from)
        .collect())
}

/// Load a conversation by session ID
#[tauri::command]
pub fn conversation_load(
    session_id: String,
    manager: State<'_, ConversationManager>,
) -> Result<Option<ConversationDto>> {
    let conv = manager.load(&session_id)?;
    Ok(conv.map(ConversationDto::from))
}

/// Delete a conversation
#[tauri::command]
pub fn conversation_delete(
    session_id: String,
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.delete(&session_id)
}

/// Update conversation title
#[tauri::command]
pub fn conversation_update_title(
    session_id: String,
    title: String,
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.update_title(&session_id, title)
}

/// Add a message to a conversation
#[tauri::command]
pub fn conversation_add_message(
    session_id: String,
    message: MessageDto,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.add_message(
        &session_id,
        Message::from(message),
        workspace_path.as_deref(),
    )
}

/// Fork (rewind) a conversation
#[tauri::command]
pub fn conversation_fork(
    session_id: String,
    new_session_id: String,
    up_to_message_id: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<Option<ConversationDto>> {
    let forked = manager.fork(&session_id, new_session_id, up_to_message_id.as_deref())?;
    Ok(forked.map(ConversationDto::from))
}

/// Get the conversations data directory path
#[tauri::command]
pub fn conversation_data_path(manager: State<'_, ConversationManager>) -> String {
    manager.data_dir().to_string_lossy().to_string()
}

/// Delete all conversations without a workspace path (orphaned)
#[tauri::command]
pub fn conversation_cleanup_orphaned(manager: State<'_, ConversationManager>) -> Result<usize> {
    manager.cleanup_orphaned_conversations()
}
