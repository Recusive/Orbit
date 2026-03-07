//! Conversation commands for Tauri
//!
//! These commands provide conversation persistence operations.

#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use orbit_conversations::{
    Conversation, ConversationManager, ConversationSummary, Message, MessageRole, ThinkingPhase,
    TokenUsage, ToolUse,
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
    /// Duration of the thinking phase in milliseconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_duration_ms: Option<u64>,
    /// Individual thinking phases with offsets for interleaved rendering.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub thinking_phases: Vec<ThinkingPhaseDto>,
    /// Whether this message was interrupted by the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_interrupted: Option<bool>,
    /// Wall-clock duration of the entire turn in milliseconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_duration_ms: Option<u64>,
    /// Timestamp (Unix epoch ms)
    pub created_at: u64,
    /// Tool uses
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_uses: Vec<ToolUseDto>,
    /// Token usage for this message (assistant messages only)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsageDto>,
    /// Parent message UUID for branch tracking (normalized to skip system/progress lines)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_uuid: Option<String>,
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
    /// Byte offset into the message content where this tool was invoked
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// Stable ordering key shared with thinking phases
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}

/// Serializable thinking phase for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingPhaseDto {
    /// Thinking content
    pub content: String,
    /// UTF-16 offset into the message content where this phase occurred
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// Stable ordering key shared with tool ordinals
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
    /// Duration of this specific thinking phase in milliseconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
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
                // Handle future variants - log at trace level to aid debugging
                // when upstream adds new MessageRole variants
                _ => {
                    log::trace!("Unknown MessageRole variant encountered, treating as 'unknown'");
                    String::from("unknown")
                },
            },
            content: msg.content,
            thinking: msg.thinking,
            thinking_duration_ms: msg.thinking_duration_ms,
            thinking_phases: msg
                .thinking_phases
                .into_iter()
                .map(ThinkingPhaseDto::from)
                .collect(),
            is_interrupted: msg.is_interrupted,
            turn_duration_ms: msg.turn_duration_ms,
            created_at: msg.created_at,
            tool_uses: msg.tool_uses.into_iter().map(ToolUseDto::from).collect(),
            usage: msg.usage.map(TokenUsageDto::from),
            parent_uuid: msg.parent_uuid,
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
            content_offset: tu.content_offset,
            ordinal: tu.ordinal,
        }
    }
}

impl From<ThinkingPhase> for ThinkingPhaseDto {
    fn from(phase: ThinkingPhase) -> Self {
        Self {
            content: phase.content,
            content_offset: phase.content_offset,
            ordinal: phase.ordinal,
            duration_ms: phase.duration_ms,
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
            thinking_duration_ms: dto.thinking_duration_ms,
            thinking_phases: dto
                .thinking_phases
                .into_iter()
                .map(ThinkingPhase::from)
                .collect(),
            is_interrupted: dto.is_interrupted,
            turn_duration_ms: dto.turn_duration_ms,
            created_at: dto.created_at,
            tool_uses: dto.tool_uses.into_iter().map(ToolUse::from).collect(),
            usage: dto.usage.map(TokenUsage::from),
            parent_uuid: dto.parent_uuid,
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
            content_offset: dto.content_offset,
            ordinal: dto.ordinal,
        }
    }
}

impl From<ThinkingPhaseDto> for ThinkingPhase {
    fn from(dto: ThinkingPhaseDto) -> Self {
        Self {
            content: dto.content,
            content_offset: dto.content_offset,
            ordinal: dto.ordinal,
            duration_ms: dto.duration_ms,
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
    /// Worktree path for multi-agent isolation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// Forked from session ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
    /// Authoritative cumulative session usage from SDK `result` event.
    /// More accurate than summing per-message usage from JSONL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_usage: Option<TokenUsageDto>,
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
            worktree_path: conv.worktree_path,
            forked_from: conv.forked_from,
            session_usage: conv.session_usage.map(TokenUsageDto::from),
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
    /// Worktree path for multi-agent isolation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
}

impl From<ConversationSummary> for ConversationSummaryDto {
    fn from(summary: ConversationSummary) -> Self {
        Self {
            session_id: summary.session_id,
            title: summary.title,
            updated_at: summary.updated_at,
            message_count: summary.message_count,
            workspace_path: summary.workspace_path,
            worktree_path: summary.worktree_path,
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
    worktree_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<ConversationDto> {
    let conv = manager.create(session_id, title, workspace_path, worktree_path)?;
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

/// Load a conversation by session ID.
///
/// Reads the single JSONL file for this session. Each session's JSONL is
/// self-contained (forkSessionAt pre-populates the new file with ancestor
/// messages). Uses `parentUuid` chains to filter dead branches.
#[tauri::command]
pub fn conversation_load(
    session_id: String,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<Option<ConversationDto>> {
    let conv = manager.load(&session_id, workspace_path.as_deref())?;
    Ok(conv.map(ConversationDto::from))
}

/// Delete a conversation
#[tauri::command]
pub fn conversation_delete(
    session_id: String,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.delete(&session_id, workspace_path.as_deref())
}

/// Update conversation title by appending a `custom-title` line to the session JSONL.
#[tauri::command]
pub fn conversation_update_title(
    session_id: String,
    title: String,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<bool> {
    manager.update_title(&session_id, &title, workspace_path.as_deref())
}

/// Add a message to a conversation
#[tauri::command]
pub fn conversation_add_message(
    session_id: String,
    message: MessageDto,
    workspace_path: Option<String>,
    worktree_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.add_message(
        &session_id,
        &Message::from(message),
        workspace_path.as_deref(),
        worktree_path.as_deref(),
    )
}

/// Fork (rewind) a conversation
#[tauri::command]
pub fn conversation_fork(
    session_id: String,
    new_session_id: String,
    up_to_message_id: Option<String>,
    workspace_path: Option<String>,
    manager: State<'_, ConversationManager>,
) -> Result<Option<ConversationDto>> {
    let forked = manager.fork(
        &session_id,
        &new_session_id,
        up_to_message_id.as_deref(),
        workspace_path.as_deref(),
    )?;
    Ok(forked.map(ConversationDto::from))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tool_use_dto_round_trip_preserves_ordinal() {
        let tool = ToolUse {
            id: String::from("t1"),
            name: String::from("Bash"),
            input: json!({ "command": "ls" }),
            output: Some(String::from("file1.txt")),
            success: true,
            content_offset: Some(12),
            ordinal: Some(3),
        };

        let dto = ToolUseDto::from(tool);
        assert_eq!(dto.ordinal, Some(3));
        assert_eq!(dto.content_offset, Some(12));

        let round_trip = ToolUse::from(dto);
        assert_eq!(round_trip.ordinal, Some(3));
        assert_eq!(round_trip.content_offset, Some(12));
    }

    #[test]
    fn thinking_phase_dto_round_trip_preserves_fields() {
        let phase = ThinkingPhase {
            content: String::from("phase 1"),
            content_offset: Some(8),
            ordinal: Some(2),
            duration_ms: Some(1200),
        };

        let dto = ThinkingPhaseDto::from(phase);
        assert_eq!(dto.content, "phase 1");
        assert_eq!(dto.content_offset, Some(8));
        assert_eq!(dto.ordinal, Some(2));
        assert_eq!(dto.duration_ms, Some(1200));

        let round_trip = ThinkingPhase::from(dto);
        assert_eq!(round_trip.content_offset, Some(8));
        assert_eq!(round_trip.ordinal, Some(2));
        assert_eq!(round_trip.duration_ms, Some(1200));
    }

    #[test]
    fn message_dto_round_trip_preserves_thinking_phases_and_tool_ordinals() {
        let message = Message {
            id: String::from("a1"),
            role: MessageRole::Assistant,
            content: String::from("done"),
            thinking: Some(String::from("phase 1\n\nphase 2")),
            thinking_duration_ms: Some(4200),
            thinking_phases: vec![
                ThinkingPhase {
                    content: String::from("phase 1"),
                    content_offset: Some(0),
                    ordinal: Some(0),
                    duration_ms: Some(1100),
                },
                ThinkingPhase {
                    content: String::from("phase 2"),
                    content_offset: Some(4),
                    ordinal: Some(2),
                    duration_ms: Some(2200),
                },
            ],
            is_interrupted: Some(true),
            turn_duration_ms: Some(5000),
            created_at: 123,
            tool_uses: vec![ToolUse {
                id: String::from("t1"),
                name: String::from("Read"),
                input: json!({ "file_path": "/tmp/test.txt" }),
                output: Some(String::from("contents")),
                success: false,
                content_offset: Some(4),
                ordinal: Some(1),
            }],
            usage: Some(TokenUsage {
                input_tokens: 1,
                output_tokens: 2,
                cache_read_input_tokens: Some(3),
                cache_creation_input_tokens: Some(4),
                total_cost_usd: Some(0.5_f64),
            }),
            parent_uuid: Some(String::from("u1")),
        };

        let dto = MessageDto::from(message);
        assert_eq!(dto.thinking_phases.len(), 2);
        assert_eq!(dto.tool_uses.first().map(|t| t.ordinal), Some(Some(1)));
        assert_eq!(
            dto.thinking_phases.first().map(|p| p.duration_ms),
            Some(Some(1100))
        );

        let round_trip = Message::from(dto);
        assert_eq!(round_trip.thinking_phases.len(), 2);
        assert_eq!(
            round_trip.thinking_phases.get(1).map(|p| p.ordinal),
            Some(Some(2))
        );
        assert_eq!(
            round_trip.thinking_phases.get(1).map(|p| p.duration_ms),
            Some(Some(2200))
        );
        assert_eq!(
            round_trip.tool_uses.first().map(|t| t.ordinal),
            Some(Some(1))
        );
        assert_eq!(round_trip.parent_uuid.as_deref(), Some("u1"));
    }
}
