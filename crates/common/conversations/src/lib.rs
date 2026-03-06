//! Orbit Conversations — pure disk reader for Claude Code JSONL files.
//!
//! The Claude Agent SDK writes JSONL files to `~/.claude/projects/`. This crate
//! **reads** them. It never caches and rarely writes (fork, custom-title). The frontend
//! Zustand store owns all in-memory state.
//!
//! # Storage Location
//!
//! `~/.claude/projects/{encoded-workspace}/{session-id}.jsonl`
//! Workspace path encoded by replacing `/` with `-` (Claude Code convention).
//! Example: `/Users/pranit/Desktop/orbit` → `-Users-pranit-Desktop-orbit`
//!
//! # JSONL Format
//!
//! Each file is newline-delimited JSON. Line types include `user`, `assistant`,
//! `summary`, `system`, `file-history-snapshot`, and others. Orbit reads all types
//! it understands and silently skips unknown types (forward-compatible).

use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::{
    self, BufRead as _, BufReader, ErrorKind, Read as _, Seek as _, SeekFrom, Write as _,
};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use hashbrown::HashMap;
use orbit_core::{Error, Result};
use serde::{Deserialize, Serialize};

// ============================================
// Message Types
// ============================================

/// Role of a message in the conversation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum MessageRole {
    /// Message from the user
    User,
    /// Message from the assistant
    Assistant,
    /// System message
    System,
}

/// A single message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    /// Unique message ID
    pub id: String,
    /// Role of the message sender
    pub role: MessageRole,
    /// Message content (text)
    pub content: String,
    /// Optional thinking content (for assistant messages with extended thinking)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    /// Duration of the thinking phase in milliseconds (for UI display on reload)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_duration_ms: Option<u64>,
    /// Individual thinking phases with offsets for interleaved rendering.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub thinking_phases: Vec<ThinkingPhase>,
    /// Whether this message was interrupted by the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_interrupted: Option<bool>,
    /// Wall-clock duration of the entire turn in milliseconds (from SDK `turn_duration` event).
    /// Includes thinking + content generation + tool execution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_duration_ms: Option<u64>,
    /// Timestamp when the message was created (Unix epoch milliseconds)
    pub created_at: u64,
    /// Tool uses in this message
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_uses: Vec<ToolUse>,
    /// Token usage for this message (assistant messages only)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    /// Parent message UUID for branch tracking (normalized to skip system/progress lines).
    /// Used by the frontend's `getActiveChain()` to walk the active branch after rewind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_uuid: Option<String>,
}

/// A tool use within a message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUse {
    /// Tool use ID
    pub id: String,
    /// Name of the tool
    pub name: String,
    /// Tool input parameters
    pub input: serde_json::Value,
    /// Tool output/result
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Whether the tool execution was successful
    #[serde(default = "default_true")]
    pub success: bool,
    /// Byte offset into the merged text content where this tool was invoked.
    /// Used by the frontend to interleave tool widgets between text segments.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// Stable ordering key shared with `ThinkingPhase::ordinal`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}

/// A single thinking phase within an assistant turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingPhase {
    /// Thinking text content
    pub content: String,
    /// UTF-16 content offset at the point this thinking phase appeared.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// Stable ordering key shared with `ToolUse::ordinal`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
    /// Duration of this specific thinking phase in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

/// Token usage statistics for a message
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
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

// ============================================
// Per-message metadata sidecar (`.metadata.json`)
// ============================================

/// Per-message metadata that the SDK doesn't persist to JSONL.
///
/// Currently stores `thinking_duration_ms` (computed client-side during streaming)
/// plus per-phase duration arrays aligned to `thinking_phases`.
/// Designed for future per-message fields that originate from the frontend.
///
/// # ID Mismatch & Fingerprint Matching
///
/// The frontend writes metadata keyed by the agent-bridge's turn ID (a `randomUUID()`
/// generated per turn for stable event grouping). The SDK JSONL uses its own UUIDs
/// for each line. These are deliberately different ID namespaces.
///
/// To bridge this gap, we store a `thinking_prefix` — the first 128 bytes of thinking
/// text — as a fingerprint. During load, if a direct ID match fails for an assistant
/// message with thinking, we fall back to matching by this prefix.
#[derive(Debug, Default, Serialize, Deserialize)]
struct MessageMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thinking_duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    phase_durations: Option<Vec<u64>>,
    /// First 128 bytes of thinking text, used as a fingerprint for matching
    /// when the frontend message ID differs from the SDK JSONL UUID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thinking_prefix: Option<String>,
}

/// Top-level structure of the `.metadata.json` sidecar file.
#[derive(Debug, Default, Serialize, Deserialize)]
struct SessionMetadata {
    #[serde(default)]
    messages: HashMap<String, MessageMetadata>,
}

// ============================================
// JSONL Line Types (internal parsing)
// ============================================

/// Discriminated union for JSONL line types.
///
/// Claude Code JSONL files contain lines tagged by `"type"`.
/// We parse only the types we need and skip the rest.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum JsonlLine {
    #[serde(rename = "user")]
    User {
        uuid: String,
        message: UserMessagePayload,
        timestamp: String,
        /// SDK marks slash-command expansion messages as meta — these are internal
        /// protocol messages (expanded prompt text) that should not render as user chat bubbles.
        #[serde(default, rename = "isMeta")]
        is_meta: bool,
    },
    #[serde(rename = "assistant")]
    Assistant {
        uuid: String,
        /// Passthrough — the rich content-array structure varies
        message: serde_json::Value,
        timestamp: Option<String>,
    },
    #[serde(rename = "summary")]
    Summary { summary: String },
    /// Claude Code stores explicit titles as a separate line type.
    #[serde(rename = "custom-title")]
    CustomTitle { title: String },
    /// System events (turn_duration, stop_hook_summary, etc.)
    #[serde(rename = "system")]
    System {
        #[serde(default)]
        subtype: Option<String>,
        /// Turn duration in milliseconds (only on subtype == "turn_duration")
        #[serde(default, rename = "durationMs")]
        duration_ms: Option<u64>,
    },
    /// Catch-all for file-history-snapshot, tool_result, progress, etc.
    #[serde(other)]
    Unknown,
}

/// Payload for a user message inside a JSONL line.
#[derive(Debug, Deserialize)]
struct UserMessagePayload {
    content: UserContent,
}

/// User message content can be a plain string or a structured array.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum UserContent {
    Text(String),
    Blocks(Vec<serde_json::Value>),
}

impl UserContent {
    fn to_text(&self) -> String {
        match self {
            Self::Text(s) => clean_user_text(s),
            Self::Blocks(blocks) => {
                // Return only the LAST text block — this is always the user's original
                // typed text per buildContentBlocks() convention (attachments first, user
                // text last). Earlier text blocks contain context metadata (file paths,
                // command expansions) that should not render as user message content.
                blocks
                    .iter()
                    .rev()
                    .find_map(|b| b.get("text").and_then(serde_json::Value::as_str))
                    .unwrap_or("")
                    .to_owned()
            },
        }
    }

    /// Check if this content contains ANY tool_result block (SDK protocol, not real user text).
    fn has_any_tool_result(&self) -> bool {
        match self {
            Self::Text(_) => false,
            Self::Blocks(blocks) => blocks
                .iter()
                .any(|b| b.get("type").and_then(serde_json::Value::as_str) == Some("tool_result")),
        }
    }
}

/// Usage info embedded in assistant `message.usage`.
#[derive(Debug, Default, Deserialize)]
#[expect(
    clippy::struct_field_names,
    reason = "field names must match JSON serialization format"
)]
struct RawUsage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
    #[serde(default)]
    cache_read_input_tokens: Option<u32>,
    #[serde(default)]
    cache_creation_input_tokens: Option<u32>,
}

// ============================================
// Conversation Types
// ============================================

/// A complete conversation with messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    /// Session ID (unique identifier)
    pub session_id: String,
    /// Display title for the conversation
    pub title: String,
    /// When the conversation was created (Unix epoch milliseconds)
    pub created_at: u64,
    /// When the conversation was last updated (Unix epoch milliseconds)
    pub updated_at: u64,
    /// All messages in the conversation
    pub messages: Vec<Message>,
    /// Optional workspace path associated with this conversation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    /// Optional worktree path for multi-agent isolation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// Optional forked from session ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
    /// Authoritative cumulative session usage from the SDK `result` event.
    /// Read from `{sessionId}.usage.json` sidecar file (written by agent-bridge).
    /// More accurate than summing per-message usage from JSONL (which has stale output_tokens).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_usage: Option<TokenUsage>,
}

impl Conversation {
    /// Create a new empty conversation.
    #[must_use]
    pub fn new(
        session_id: String,
        title: String,
        workspace_path: Option<String>,
        worktree_path: Option<String>,
    ) -> Self {
        let now = current_timestamp();
        Self {
            session_id,
            title,
            created_at: now,
            updated_at: now,
            messages: Vec::new(),
            workspace_path,
            worktree_path,
            forked_from: None,
            session_usage: None,
        }
    }

    /// Get message count
    #[must_use]
    pub fn message_count(&self) -> usize {
        self.messages.len()
    }

    /// Add a message to the conversation (deduplicates by ID)
    pub fn add_message(&mut self, message: Message) {
        if !self.messages.iter().any(|m| m.id == message.id) {
            self.messages.push(message);
        }
        self.updated_at = current_timestamp();
    }

    /// Update the title
    pub fn set_title(&mut self, title: String) {
        self.title = title;
        self.updated_at = current_timestamp();
    }

    /// Create a forked copy of this conversation up to a specific message
    #[must_use]
    pub fn fork(&self, new_session_id: String, up_to_message_id: Option<&str>) -> Self {
        let now = current_timestamp();
        let messages = up_to_message_id.map_or_else(
            || self.messages.clone(),
            |msg_id| {
                self.messages
                    .iter()
                    .take_while(|m| m.id != msg_id)
                    .chain(self.messages.iter().find(|m| m.id == msg_id))
                    .cloned()
                    .collect()
            },
        );

        Self {
            session_id: new_session_id,
            title: format!("{} (fork)", self.title),
            created_at: now,
            updated_at: now,
            messages,
            workspace_path: self.workspace_path.clone(),
            worktree_path: self.worktree_path.clone(),
            forked_from: Some(self.session_id.clone()),
            session_usage: None,
        }
    }
}

/// Summary of a conversation (for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    /// Session ID
    pub session_id: String,
    /// Display title
    pub title: String,
    /// Last updated timestamp
    pub updated_at: u64,
    /// Number of messages
    pub message_count: usize,
    /// Optional workspace path associated with this conversation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    /// Optional worktree path for multi-agent isolation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
}

impl From<&Conversation> for ConversationSummary {
    fn from(conv: &Conversation) -> Self {
        Self {
            session_id: conv.session_id.clone(),
            title: conv.title.clone(),
            updated_at: conv.updated_at,
            message_count: conv.messages.len(),
            workspace_path: conv.workspace_path.clone(),
            worktree_path: conv.worktree_path.clone(),
        }
    }
}

// ============================================
// Conversation Manager — pure disk reader
// ============================================

/// Reads conversations from `~/.claude/projects/` JSONL files.
///
/// **No cache.** Every call reads from disk. The frontend Zustand store
/// owns all in-memory state (sidebar list, active conversation, etc.).
#[derive(Debug)]
pub struct ConversationManager {
    /// Base path (e.g., `~/.claude/`)
    base_dir: PathBuf,
}

impl ConversationManager {
    /// Create a new conversation manager pointing to `~/.claude/`
    #[must_use]
    pub fn new() -> Self {
        Self {
            base_dir: Self::default_base_dir(),
        }
    }

    /// Create a conversation manager with a custom base directory (for testing)
    #[must_use]
    pub fn with_data_dir(data_dir: PathBuf) -> Self {
        Self { base_dir: data_dir }
    }

    /// Default base directory: `~/.claude/`
    #[must_use]
    pub fn default_base_dir() -> PathBuf {
        dirs::home_dir().map_or_else(|| PathBuf::from(".claude"), |h| h.join(".claude"))
    }

    /// Get the projects directory
    #[must_use]
    pub fn projects_dir(&self) -> PathBuf {
        self.base_dir.join("projects")
    }

    /// Get the data directory path
    #[must_use]
    pub fn data_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    /// Get the directory for a specific workspace
    fn workspace_dir(&self, workspace_path: Option<&str>) -> PathBuf {
        let encoded = workspace_path.map_or_else(|| String::from("_global"), encode_workspace_path);
        self.projects_dir().join(encoded)
    }

    /// Get the file path for a conversation in a workspace
    fn conversation_path(&self, session_id: &str, workspace_path: Option<&str>) -> PathBuf {
        self.workspace_dir(workspace_path)
            .join(format!("{session_id}.jsonl"))
    }

    /// Ensure a workspace directory exists
    fn ensure_workspace_dir(&self, workspace_path: Option<&str>) -> Result<()> {
        let dir = self.workspace_dir(workspace_path);
        if !dir.exists() {
            fs::create_dir_all(&dir).map_err(|e| {
                Error::Config(format!(
                    "Failed to create workspace directory {}: {}",
                    dir.display(),
                    e
                ))
            })?;
        }
        Ok(())
    }

    // ----------------------------------------
    // Listing (readdir + stat + last-bytes scan)
    // ----------------------------------------

    /// List all conversation summaries for a workspace.
    ///
    /// Reads directory entries, uses file mtime for `updated_at`,
    /// and scans the last ~4 KB of each file for a summary line.
    ///
    /// # Errors
    ///
    /// Returns an error if the directory cannot be read.
    pub fn load_summaries_for_workspace(
        &self,
        workspace_path: Option<&str>,
    ) -> Result<Vec<ConversationSummary>> {
        self.load_summaries_for_workspace_limited(workspace_path, 10)
    }

    /// Load conversation summaries with a configurable limit.
    ///
    /// We first collect (session_id, mtime) pairs cheaply using only filesystem
    /// metadata (no file reads), sort by mtime descending, then lazily read titles
    /// until `limit` valid conversations are found. Non-conversation files (e.g.,
    /// SDK file-history-snapshot checkpoint files) are skipped without counting
    /// toward the limit.
    pub fn load_summaries_for_workspace_limited(
        &self,
        workspace_path: Option<&str>,
        limit: usize,
    ) -> Result<Vec<ConversationSummary>> {
        let workspace_dir = self.workspace_dir(workspace_path);

        if !workspace_dir.exists() {
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(&workspace_dir).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(workspace_dir.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        // Phase 1: Collect (path, session_id, mtime) cheaply — metadata only, no file reads
        let mut candidates: Vec<(PathBuf, String, u64)> = Vec::new();

        for entry in entries {
            let Ok(entry) = entry else { continue };
            let path = entry.path();

            if path.is_dir() {
                continue;
            }

            if path.extension().is_none_or(|ext| ext != "jsonl") {
                continue;
            }

            let session_id = path.file_stem().and_then(|s| s.to_str()).map(str::to_owned);

            let Some(session_id) = session_id else {
                continue;
            };

            let updated_at = path
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    t.duration_since(UNIX_EPOCH).ok().map(|d| {
                        #[expect(
                            clippy::cast_possible_truncation,
                            reason = "u64 can hold timestamps until year 584,942,417"
                        )]
                        let ms = d.as_millis() as u64;
                        ms
                    })
                })
                .unwrap_or(0);

            candidates.push((path, session_id, updated_at));
        }

        // Phase 2: Sort by mtime descending (most recent first)
        candidates.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| b.1.cmp(&a.1)));

        // Phase 3: Read titles lazily until we have `limit` valid conversations.
        // Skip files with no conversation content (e.g., SDK file-history-snapshot
        // checkpoint files that contain only snapshot records, not real messages).
        // These would appear as phantom "Untitled" sidebar entries.
        //
        // NOTE: We do NOT truncate candidates before filtering (as was done previously).
        // Truncating first caused the sidebar to show fewer than `limit` entries when
        // non-conversation files (file-history-snapshots) occupied slots in the top N.
        // Instead, we iterate lazily with `.take(limit)` after the filter, reading
        // only as many files as needed to fill the sidebar.
        let summaries: Vec<ConversationSummary> = candidates
            .into_iter()
            .filter_map(|(path, session_id, updated_at)| {
                let title = read_last_summary(&path)?;
                Some(ConversationSummary {
                    session_id,
                    title,
                    updated_at,
                    message_count: 0,
                    workspace_path: workspace_path.map(str::to_owned),
                    worktree_path: None,
                })
            })
            .take(limit)
            .collect();

        tracing::debug!(
            "Loaded {} conversations (limit {}) from workspace: {:?}",
            summaries.len(),
            limit,
            workspace_path
        );

        Ok(summaries)
    }

    // ----------------------------------------
    // Loading (line-by-line JSONL parse)
    // ----------------------------------------

    /// Load a conversation by session ID from a specific workspace.
    ///
    /// Parses the JSONL file line-by-line, building the message vector.
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be read.
    pub fn load_from_workspace(
        &self,
        session_id: &str,
        workspace_path: Option<&str>,
    ) -> Result<Option<Conversation>> {
        let path = self.conversation_path(session_id, workspace_path);

        if !path.exists() {
            return Ok(None);
        }

        let file = fs::File::open(&path).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        let reader = BufReader::new(file);
        let parsed = parse_jsonl_lines(reader, &path);

        // Merge consecutive assistant messages into single turns.
        let mut messages =
            merge_consecutive_assistants(parsed.raw_messages, &parsed.turn_start_ids);

        // Merge per-message metadata from sidecar (e.g., thinking_duration_ms,
        // per-phase duration arrays).
        let metadata = read_message_metadata(&path);
        if !metadata.is_empty() {
            merge_sidecar_metadata(&mut messages, &metadata);
        }

        let now = current_timestamp();
        let created_at = parsed.first_timestamp.unwrap_or(now);
        let updated_at = parsed.last_timestamp.unwrap_or(now);

        // Read authoritative session usage from sidecar file (written by agent-bridge
        // on each SDK `result` event). More accurate than JSONL per-message usage.
        let session_usage = read_session_usage(&path);

        Ok(Some(Conversation {
            session_id: session_id.to_owned(),
            title: parsed.title,
            created_at,
            updated_at,
            messages,
            workspace_path: workspace_path.map(str::to_owned),
            worktree_path: None,
            forked_from: None,
            session_usage,
        }))
    }

    /// Load a conversation by session ID (searches current workspace, then all).
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be read.
    pub fn load(
        &self,
        session_id: &str,
        workspace_path: Option<&str>,
    ) -> Result<Option<Conversation>> {
        // Try specified workspace first
        if let Some(conv) = self.load_from_workspace(session_id, workspace_path)? {
            return Ok(Some(conv));
        }

        // Search all workspace folders
        let projects_dir = self.projects_dir();
        if !projects_dir.exists() {
            return Ok(None);
        }

        if let Ok(entries) = fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let conv_path = entry.path().join(format!("{session_id}.jsonl"));
                    if conv_path.exists() {
                        let folder_name = entry.file_name();
                        let ws_path = folder_name.to_str().map(decode_workspace_path);
                        return self.load_from_workspace(session_id, ws_path.as_deref());
                    }
                }
            }
        }

        Ok(None)
    }

    // ----------------------------------------
    // No-ops (frontend owns in-memory state)
    // ----------------------------------------

    /// No-op. Returns a `Conversation` struct for the frontend to use.
    ///
    /// The Claude Agent SDK handles disk persistence. The frontend Zustand
    /// store handles in-memory state (sidebar list).
    pub fn create(
        &self,
        session_id: String,
        title: String,
        workspace_path: Option<String>,
        worktree_path: Option<String>,
    ) -> Result<Conversation> {
        Ok(Conversation::new(
            session_id,
            title,
            workspace_path,
            worktree_path,
        ))
    }

    /// Persist per-message metadata that the SDK doesn't write to JSONL.
    ///
    /// The Claude Agent SDK handles JSONL persistence for message content.
    /// This method writes supplementary metadata (e.g., `thinking_duration_ms`)
    /// to a `.metadata.json` sidecar file alongside the JSONL.
    pub fn add_message(
        &self,
        session_id: &str,
        message: &Message,
        workspace_path: Option<&str>,
        _worktree_path: Option<&str>,
    ) -> Result<()> {
        let phase_durations: Option<Vec<u64>> = {
            let durations: Vec<u64> = message
                .thinking_phases
                .iter()
                .map(|phase| phase.duration_ms.unwrap_or(0))
                .collect();
            if durations.iter().all(|&duration| duration == 0) {
                None
            } else {
                Some(durations)
            }
        };

        // Only write sidecar if there's metadata worth persisting
        if message.thinking_duration_ms.is_some() || phase_durations.is_some() {
            let jsonl_path = self.conversation_path(session_id, workspace_path);
            // Store a thinking content prefix as a fingerprint for matching.
            // The frontend message ID (bridge turn ID) differs from the SDK JSONL
            // UUID, so we need content-based fallback matching during load.
            let thinking_prefix = message
                .thinking
                .as_ref()
                .map(|t| truncate_to_char_boundary(t, 128).to_owned());
            write_message_metadata(
                &jsonl_path,
                &message.id,
                MessageMetadata {
                    thinking_duration_ms: message.thinking_duration_ms,
                    phase_durations,
                    thinking_prefix,
                },
            )?;
        }
        Ok(())
    }

    /// Persist a custom title by appending a `custom-title` line to the JSONL.
    ///
    /// Matches the Claude Code CLI convention: `{"type":"custom-title","title":"..."}`.
    /// The backend already reads this line type with highest priority in
    /// `parse_title_line()` and `read_last_summary()`.
    ///
    /// IMPORTANT: We must NOT create the JSONL file if it doesn't exist yet.
    /// The Claude CLI checks for file existence on startup and refuses to start
    /// with "Session ID already in use" if the file is present. The CLI itself
    /// creates the file on first message. We only append to an existing file.
    ///
    /// NOTE: For regular files, `PIPE_BUF` does not guarantee cross-process atomicity.
    /// We still serialize to a single line and write it with one `write_all` call to
    /// minimize interleaving risk. If strict multi-writer guarantees are needed,
    /// file locking must be added around all writers.
    pub fn update_title(
        &self,
        session_id: &str,
        title: &str,
        workspace_path: Option<&str>,
    ) -> Result<()> {
        // Use find_conversation_path (searches all workspaces) instead of
        // conversation_path (single workspace). Matches how delete() works.
        // This prevents silent skips when the workspace path doesn't match
        // where the JSONL was actually stored.
        let Some(jsonl_path) = self.find_conversation_path(session_id, workspace_path) else {
            // JSONL doesn't exist yet — the CLI hasn't created it.
            // Creating it prematurely would trigger the CLI's "Session ID already in use" guard.
            return Ok(());
        };

        let line = serde_json::json!({
            "type": "custom-title",
            "title": title,
        });
        let mut line_bytes = serde_json::to_vec(&line).map_err(|e| {
            Error::Config(format!(
                "Failed to serialize custom-title JSON for {}: {}",
                jsonl_path.display(),
                e
            ))
        })?;
        line_bytes.push(b'\n');

        let mut file = OpenOptions::new()
            .append(true)
            .open(&jsonl_path)
            .map_err(|e| {
                Error::Config(format!(
                    "Failed to open JSONL for title update {}: {}",
                    jsonl_path.display(),
                    e
                ))
            })?;

        file.write_all(&line_bytes).map_err(|e| {
            Error::Config(format!(
                "Failed to write custom-title to {}: {}",
                jsonl_path.display(),
                e
            ))
        })?;

        Ok(())
    }

    // ----------------------------------------
    // Fork (reads source, writes new file)
    // ----------------------------------------

    /// Fork a conversation from a specific message.
    ///
    /// Reads source JSONL lines and writes a subset to a new file.
    ///
    /// # Errors
    ///
    /// Returns an error if the fork cannot be created.
    pub fn fork(
        &self,
        session_id: &str,
        new_session_id: &str,
        up_to_message_id: Option<&str>,
        workspace_path: Option<&str>,
    ) -> Result<Option<Conversation>> {
        let Some(original) = self.load(session_id, workspace_path)? else {
            return Ok(None);
        };

        let forked = original.fork(new_session_id.to_owned(), up_to_message_id);
        let ws = forked.workspace_path.as_deref();

        self.ensure_workspace_dir(ws)?;
        let new_path = self.conversation_path(new_session_id, ws);

        // Read source file and copy relevant lines
        let source_path = self.find_conversation_path(session_id, workspace_path);
        if let Some(source_path) = source_path {
            let keep_ids: HashSet<&str> = forked.messages.iter().map(|m| m.id.as_str()).collect();

            let source_file = fs::File::open(&source_path).map_err(Error::Io)?;
            let reader = BufReader::new(source_file);
            let mut output_lines: Vec<String> = Vec::new();

            // Write summary line first
            let summary_line = serde_json::json!({
                "type": "summary",
                "summary": forked.title,
                "leafUuid": ""
            });
            output_lines.push(serde_json::to_string(&summary_line)?);

            for line_result in reader.lines() {
                let Ok(line) = line_result else { continue };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(uuid) = parsed.get("uuid").and_then(serde_json::Value::as_str) {
                        if keep_ids.contains(uuid) {
                            output_lines.push(line);
                        }
                    } else if let Some(msg_id) =
                        parsed.get("messageId").and_then(serde_json::Value::as_str)
                    {
                        if keep_ids.contains(msg_id) {
                            output_lines.push(line);
                        }
                    }
                }
            }

            let mut content = output_lines.join("\n");
            content.push('\n');
            fs::write(&new_path, content).map_err(|e| {
                if e.kind() == ErrorKind::PermissionDenied {
                    Error::PermissionDenied(new_path.display().to_string())
                } else {
                    Error::Io(e)
                }
            })?;
        }

        Ok(Some(forked))
    }

    // ----------------------------------------
    // Deletion
    // ----------------------------------------

    /// Delete a conversation's JSONL file.
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be deleted.
    pub fn delete(&self, session_id: &str, workspace_path: Option<&str>) -> Result<()> {
        if let Some(path) = self.find_conversation_path(session_id, workspace_path) {
            fs::remove_file(&path).map_err(|e| {
                if e.kind() == ErrorKind::PermissionDenied {
                    Error::PermissionDenied(path.display().to_string())
                } else {
                    Error::Io(e)
                }
            })?;

            // Clean up sidecar files (best-effort, ignore errors)
            drop(fs::remove_file(path.with_extension("metadata.json")));
            drop(fs::remove_file(path.with_extension("usage.json")));

            tracing::debug!("Deleted conversation {}", session_id);
        }

        Ok(())
    }

    // ----------------------------------------
    // Helpers
    // ----------------------------------------

    /// Find the full path to a conversation's JSONL file.
    fn find_conversation_path(
        &self,
        session_id: &str,
        workspace_path: Option<&str>,
    ) -> Option<PathBuf> {
        // Try specified workspace first
        let path = self.conversation_path(session_id, workspace_path);
        if path.exists() {
            return Some(path);
        }

        // Search all workspace folders
        let projects_dir = self.projects_dir();
        if !projects_dir.exists() {
            return None;
        }

        if let Ok(entries) = fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let conv_path = entry.path().join(format!("{session_id}.jsonl"));
                    if conv_path.exists() {
                        return Some(conv_path);
                    }
                }
            }
        }

        None
    }
}

impl Default for ConversationManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// Helper Functions
// ============================================

/// Intermediate state collected while parsing JSONL lines.
struct ParsedJsonl {
    raw_messages: Vec<Message>,
    turn_start_ids: HashSet<String>,
    title: String,
    first_timestamp: Option<u64>,
    last_timestamp: Option<u64>,
}

/// Tool result data extracted from `tool_result` content blocks.
struct ToolResultData {
    output: String,
    is_error: bool,
}

/// Insert or replace a message in the dedup map.
fn dedup_insert(
    raw_messages: &mut Vec<Message>,
    seen_uuids: &mut HashMap<String, usize>,
    uuid: String,
    msg: Message,
) {
    if let Some(&idx) = seen_uuids.get(&uuid) {
        if let Some(slot) = raw_messages.get_mut(idx) {
            *slot = msg;
        }
    } else {
        let _ = seen_uuids.insert(uuid, raw_messages.len());
        raw_messages.push(msg);
    }
}

/// Build a `Message` from an assistant JSONL line.
fn build_assistant_message(uuid: &str, value: &serde_json::Value, ts: u64) -> Message {
    let (text, thinking, thinking_phases, tool_uses) = extract_assistant_content(value);
    let usage = extract_usage(value);
    let is_interrupted = value
        .get("stop_reason")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|r| r == "max_tokens");

    Message {
        id: uuid.to_owned(),
        role: MessageRole::Assistant,
        content: text,
        thinking,
        thinking_duration_ms: None,
        thinking_phases,
        is_interrupted: is_interrupted.then_some(true),
        turn_duration_ms: None,
        created_at: ts,
        tool_uses,
        usage,
        parent_uuid: None,
    }
}

/// Fall back to first user message text if no summary/custom-title was found.
fn resolve_title(title: String, first_user_text: Option<String>) -> String {
    if title != "Untitled" {
        return title;
    }
    match first_user_text {
        Some(text) if text.len() > 80 => {
            format!("{}…", &text[..floor_char_boundary(&text, 77)])
        },
        Some(text) => text,
        None => title,
    }
}

/// Build the set of active UUIDs by walking the `parentUuid` chain from the leaf.
///
/// The Claude SDK uses append-only JSONL with `parentUuid` branching. When a conversation
/// is rewound, the old messages stay in the file and new messages are appended with
/// `parentUuid` pointing to the fork point. To get the active branch, we must walk
/// backwards from the leaf (last line with a UUID) through the `parentUuid` chain.
///
/// Returns `None` if no line has a `parentUuid` field (legacy/unbranched conversation).
fn build_active_uuid_set(lines: &[String]) -> Option<HashSet<String>> {
    // Phase 1: Lightweight parse to extract uuid and parentUuid from ALL line types
    // (user, assistant, system, progress, file-history-snapshot, etc.)
    let mut chain_links: Vec<(String, Option<String>)> = Vec::new();
    let mut uuid_to_parent: HashMap<String, Option<String>> = HashMap::new();
    let mut has_any_parent = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Only parse what we need: uuid and parentUuid fields
        let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        let Some(uuid) = value.get("uuid").and_then(serde_json::Value::as_str) else {
            continue;
        };

        let parent_uuid = value.get("parentUuid").and_then(|v| {
            if v.is_null() {
                None
            } else {
                v.as_str().map(str::to_owned)
            }
        });

        if parent_uuid.is_some() {
            has_any_parent = true;
        }

        let uuid_owned = uuid.to_owned();
        let _ = uuid_to_parent.insert(uuid_owned.clone(), parent_uuid.clone());
        chain_links.push((uuid_owned, parent_uuid));
    }

    // If no line has parentUuid, this is a legacy/unbranched conversation
    if !has_any_parent {
        return None;
    }

    // Phase 2: Walk chain from the leaf backwards to build active set
    // The leaf is the last UUID we encountered in file order
    let (leaf_uuid, _) = chain_links.last()?;

    let mut active_uuids = HashSet::new();
    let mut current = Some(leaf_uuid.clone());
    let mut visited = HashSet::new();

    while let Some(uuid) = current {
        if !visited.insert(uuid.clone()) {
            // Cycle detected — stop to prevent infinite loop
            tracing::warn!("Cycle detected in parentUuid chain at {uuid}");
            break;
        }
        let Some(parent) = uuid_to_parent.get(&uuid).cloned() else {
            // Dangling parent chain (e.g., an SDK artifact UUID was removed during cleanup).
            // Fall back to unfiltered parsing so we never collapse to an empty conversation.
            tracing::warn!(
                "Dangling parentUuid chain at {uuid}; disabling active-branch filtering"
            );
            return None;
        };

        let _ = active_uuids.insert(uuid.clone());
        current = parent;
    }

    Some(active_uuids)
}

/// Check if a UUID is on the active branch (always true for unbranched conversations).
fn is_active(uuid: &str, active_uuids: Option<&HashSet<String>>) -> bool {
    active_uuids.is_none_or(|active| active.contains(uuid))
}

/// Parse JSONL lines from a reader, collecting messages and metadata.
///
/// Supports branched conversations (rewind): when `parentUuid` fields are present,
/// only messages on the active branch are returned. Dead branches are filtered out.
fn parse_jsonl_lines(reader: BufReader<fs::File>, path: &Path) -> ParsedJsonl {
    let all_lines: Vec<String> = reader.lines().map_while(io::Result::ok).collect();
    let active_uuids = build_active_uuid_set(&all_lines);
    let mut ctx = ParseContext::new();

    for (line_num, line) in all_lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<JsonlLine>(trimmed) {
            Ok(JsonlLine::User {
                uuid,
                message: payload,
                timestamp,
                is_meta,
                ..
            }) => {
                if !is_active(&uuid, active_uuids.as_ref()) || is_meta {
                    continue;
                }
                ctx.process_user_line(uuid, &payload, &timestamp);
            },
            Ok(JsonlLine::Assistant {
                uuid,
                message: value,
                timestamp,
                ..
            }) => {
                let active = is_active(&uuid, active_uuids.as_ref());
                ctx.last_assistant_active = active;
                if !active {
                    continue;
                }
                ctx.process_assistant_line(uuid, &value, timestamp.as_deref());
            },
            Ok(JsonlLine::Summary { summary, .. }) => ctx.title = summary,
            Ok(JsonlLine::CustomTitle { title: t, .. }) => ctx.title = t,
            Ok(JsonlLine::System {
                subtype,
                duration_ms,
                ..
            }) => {
                if subtype.as_deref() == Some("turn_duration") {
                    // Only apply turn_duration if the most recent assistant was on
                    // the active branch. Dead-branch durations must not overwrite
                    // the active assistant's value.
                    if ctx.last_assistant_active {
                        if let Some(ms) = duration_ms {
                            ctx.apply_turn_duration(ms);
                        }
                    }
                }
            },
            Ok(JsonlLine::Unknown) => {},
            Err(e) => {
                tracing::warn!(
                    "Skipping JSONL line {} in {}: {}",
                    line_num,
                    path.display(),
                    e
                );
            },
        }
    }

    ctx.finalize()
}

/// Accumulator for `parse_jsonl_lines` — extracted to keep the main loop under 100 lines.
struct ParseContext {
    raw_messages: Vec<Message>,
    seen_uuids: HashMap<String, usize>,
    title: String,
    first_user_text: Option<String>,
    first_timestamp: Option<u64>,
    last_timestamp: Option<u64>,
    tool_results: HashMap<String, ToolResultData>,
    pending_interrupt_boundary: bool,
    turn_start_ids: HashSet<String>,
    last_msg_uuid: Option<String>,
    /// Tracks whether the most recently encountered assistant line was on the active branch.
    /// Used to skip `turn_duration` system lines that follow dead-branch assistants.
    last_assistant_active: bool,
}

impl ParseContext {
    fn new() -> Self {
        Self {
            raw_messages: Vec::new(),
            seen_uuids: HashMap::new(),
            title: String::from("Untitled"),
            first_user_text: None,
            first_timestamp: None,
            last_timestamp: None,
            tool_results: HashMap::new(),
            pending_interrupt_boundary: false,
            turn_start_ids: HashSet::new(),
            last_msg_uuid: None,
            last_assistant_active: false,
        }
    }

    fn track_timestamp(&mut self, ts: u64) {
        if self.first_timestamp.is_none() {
            self.first_timestamp = Some(ts);
        }
        self.last_timestamp = Some(ts);
    }

    /// Apply a `turn_duration` value from a system line to the most recent assistant message.
    fn apply_turn_duration(&mut self, ms: u64) {
        if let Some(last) = self.raw_messages.last_mut() {
            if last.role == MessageRole::Assistant {
                last.turn_duration_ms = Some(ms);
            }
        }
    }

    fn process_user_line(&mut self, uuid: String, payload: &UserMessagePayload, timestamp: &str) {
        if payload.content.has_any_tool_result() {
            extract_tool_results(&payload.content, &mut self.tool_results);
            return;
        }
        let ts = parse_iso_timestamp(timestamp);
        self.track_timestamp(ts);
        let text = payload.content.to_text();
        // SDK writes these markers when the user interrupts (Stop button).
        // Mark the preceding assistant message as interrupted so the UI
        // can show the "Response interrupted" indicator after session reload.
        // Deliberately omits closing "]" to match both "...user]" and "...user for tool use]"
        if text.starts_with("[Request interrupted by user") {
            if let Some(last) = self.raw_messages.last_mut() {
                if last.role == MessageRole::Assistant {
                    last.is_interrupted = Some(true);
                }
            }
            self.pending_interrupt_boundary = true;
            return;
        }
        if text.is_empty() {
            return;
        }
        if self.first_user_text.is_none() {
            self.first_user_text = Some(text.clone());
        }
        let msg = Message {
            id: uuid.clone(),
            role: MessageRole::User,
            content: text,
            thinking: None,
            thinking_duration_ms: None,
            thinking_phases: Vec::new(),
            is_interrupted: None,
            turn_duration_ms: None,
            created_at: ts,
            tool_uses: Vec::new(),
            usage: None,
            parent_uuid: self.last_msg_uuid.clone(),
        };
        self.last_msg_uuid = Some(uuid.clone());
        dedup_insert(&mut self.raw_messages, &mut self.seen_uuids, uuid, msg);
    }

    fn process_assistant_line(
        &mut self,
        uuid: String,
        value: &serde_json::Value,
        timestamp: Option<&str>,
    ) {
        let ts = timestamp.map_or_else(|| self.last_timestamp.unwrap_or(0), parse_iso_timestamp);
        self.track_timestamp(ts);
        let mut msg = build_assistant_message(&uuid, value, ts);
        if self.pending_interrupt_boundary {
            let _ = self.turn_start_ids.insert(uuid.clone());
            self.pending_interrupt_boundary = false;
        }
        msg.parent_uuid.clone_from(&self.last_msg_uuid);
        self.last_msg_uuid = Some(uuid.clone());
        dedup_insert(&mut self.raw_messages, &mut self.seen_uuids, uuid, msg);
    }

    fn finalize(mut self) -> ParsedJsonl {
        backfill_tool_outputs(&mut self.raw_messages, self.tool_results);
        let title = resolve_title(self.title, self.first_user_text);
        ParsedJsonl {
            raw_messages: self.raw_messages,
            turn_start_ids: self.turn_start_ids,
            title,
            first_timestamp: self.first_timestamp,
            last_timestamp: self.last_timestamp,
        }
    }
}

/// Read the title for a JSONL file.
///
/// Strategy:
/// 1. Scan for a summary or custom-title line (last one wins).
/// 2. If none found, fall back to the first user message content (truncated).
///
/// For files ≤ 8 KB, reads the entire file. For larger files, scans the
/// last 4 KB first, then falls back to the first line and first user message.
fn read_last_summary(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();

    if file_len == 0 {
        return None;
    }

    // For small files (≤ 8 KB), just read the whole thing.
    if file_len <= 8192 {
        let content = fs::read_to_string(path).ok()?;
        let mut last_summary: Option<String> = None;
        let mut first_user_text: Option<String> = None;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(summary) = parse_title_line(trimmed) {
                last_summary = Some(summary);
            }
            if first_user_text.is_none() {
                first_user_text = extract_user_text_from_line(trimmed);
            }
        }

        return last_summary.or(first_user_text);
    }

    // For large files, scan the tail first (where summary/custom-title usually lands).
    const TAIL_SCAN_BYTES: u64 = 64 * 1024;
    let mut reader = BufReader::new(file);
    let tail_scan = file_len.min(TAIL_SCAN_BYTES);
    let tail_offset = i64::try_from(tail_scan).ok()?;
    let _ = reader.seek(SeekFrom::End(-tail_offset)).ok()?;

    let mut partial = String::new();
    let _ = reader.read_line(&mut partial).ok()?;

    let mut remaining = String::new();
    let _ = reader.read_to_string(&mut remaining).ok()?;

    for line in remaining.lines().rev().filter(|l| !l.trim().is_empty()) {
        if let Some(summary) = parse_title_line(line.trim()) {
            return Some(summary);
        }
    }

    // Tail window did not include a title marker. Fall back to a forward stream
    // over the file so older custom-title entries are still discoverable.
    forward_scan_title(path)
}

/// Scan the entire file line-by-line for the last `custom-title`/`summary` entry,
/// falling back to the first user message text.
fn forward_scan_title(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut last_summary: Option<String> = None;
    let mut first_user_text: Option<String> = None;
    for line_result in reader.lines() {
        let Ok(line) = line_result else { continue };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(summary) = parse_title_line(trimmed) {
            last_summary = Some(summary);
        }
        if first_user_text.is_none() {
            first_user_text = extract_user_text_from_line(trimmed);
        }
    }
    last_summary.or(first_user_text)
}

/// Extract user message text from a JSONL line, if it's a real user message.
fn extract_user_text_from_line(line: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(line).ok()?;
    if parsed.get("type").and_then(serde_json::Value::as_str) != Some("user") {
        return None;
    }
    // Skip SDK meta messages (slash command expansions, etc.)
    if parsed.get("isMeta").and_then(serde_json::Value::as_bool) == Some(true) {
        return None;
    }
    let msg = parsed.get("message")?;
    let content = msg.get("content")?;

    let text = match content {
        serde_json::Value::String(s) => {
            if s.is_empty() {
                return None;
            }
            clean_user_text(s)
        },
        serde_json::Value::Array(blocks) => {
            let has_tool_result = blocks
                .iter()
                .any(|b| b.get("type").and_then(serde_json::Value::as_str) == Some("tool_result"));
            if has_tool_result {
                return None;
            }
            // Use only the LAST text block (user's original text).
            // Earlier blocks contain context metadata (file paths, command expansions).
            let last_text = blocks
                .iter()
                .rev()
                .find_map(|b| b.get("text").and_then(serde_json::Value::as_str));
            match last_text {
                Some(t) if !t.is_empty() => t.to_owned(),
                _ => return None,
            }
        },
        _ => return None,
    };

    let truncated = if text.len() > 80 {
        format!("{}…", &text[..floor_char_boundary(&text, 77)])
    } else {
        text
    };
    Some(truncated)
}

/// Try to parse a single JSONL line as a title source (summary or custom-title).
fn parse_title_line(line: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(line).ok()?;
    match parsed.get("type").and_then(serde_json::Value::as_str) {
        Some("summary") => parsed
            .get("summary")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        Some("custom-title") => parsed
            .get("title")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        _ => None,
    }
}

/// Merge consecutive assistant messages into single turns.
///
/// When two assistant JSONL lines appear consecutively (e.g., thinking+tool_use followed
/// by text response), they belong to the same turn. This merges them into a single
/// `Message`, combining content, tool uses, and metadata.
///
/// After merging, any `parent_uuid` references that pointed to a consumed (merged-away)
/// message are remapped to the surviving message's UUID. Without this remap, the
/// frontend's `getActiveChain()` walk breaks at merged boundaries.
fn merge_consecutive_assistants(raw: Vec<Message>, turn_starts: &HashSet<String>) -> Vec<Message> {
    let mut merged: Vec<Message> = Vec::with_capacity(raw.len());
    // Track consumed UUID → surviving UUID so we can fix parent_uuid references.
    let mut uuid_remap: HashMap<String, String> = HashMap::new();

    for msg in raw {
        if msg.role == MessageRole::Assistant {
            if let Some(last) = merged.last_mut() {
                if last.role == MessageRole::Assistant && !turn_starts.contains(&msg.id) {
                    // This message will be absorbed — record the remap.
                    let _ = uuid_remap.insert(msg.id.clone(), last.id.clone());
                    absorb_assistant_message(last, msg);
                    continue;
                }
            }
        }
        merged.push(msg);
    }

    // Fix parent_uuid references broken by merge. A message may point to a UUID
    // that was consumed during merge — remap it to the surviving message's UUID.
    remap_parent_uuids(&mut merged, &uuid_remap);

    merged
}

/// Absorb `incoming` assistant message into `target`, merging content, tools, and metadata.
fn absorb_assistant_message(target: &mut Message, incoming: Message) {
    // Record the current text length in UTF-16 code units BEFORE appending
    // so we can shift the incoming tool offsets by this amount.
    // Must use UTF-16 (not UTF-8 bytes) to match JavaScript string indexing.
    let base_len = u32::try_from(target.content.encode_utf16().count()).unwrap_or(u32::MAX);
    let incoming_has_text = !incoming.content.is_empty();

    if incoming_has_text {
        if target.content.is_empty() {
            target.content = incoming.content;
        } else {
            target.content.push('\n');
            target.content.push_str(&incoming.content);
        }
    }
    match (&mut target.thinking, incoming.thinking) {
        (Some(existing), Some(incoming_text)) => {
            existing.push_str("\n\n");
            existing.push_str(&incoming_text);
        },
        (None, some @ Some(_)) => {
            target.thinking = some;
        },
        _ => {},
    }

    // Shift tool content_offsets by the existing text length
    // (+ 1 for the "\n" separator if we appended text).
    let shift = if base_len > 0 && incoming_has_text {
        base_len + 1
    } else {
        base_len
    };
    let ordinal_shift = target
        .thinking_phases
        .iter()
        .filter_map(|phase| phase.ordinal)
        .chain(target.tool_uses.iter().filter_map(|tool| tool.ordinal))
        .max()
        .map_or(0, |max| max + 1);

    for mut tool in incoming.tool_uses {
        tool.content_offset = Some(tool.content_offset.unwrap_or(0).saturating_add(shift));
        tool.ordinal = tool
            .ordinal
            .map(|ordinal| ordinal.saturating_add(ordinal_shift));
        target.tool_uses.push(tool);
    }
    for mut phase in incoming.thinking_phases {
        phase.content_offset = Some(phase.content_offset.unwrap_or(0).saturating_add(shift));
        phase.ordinal = phase
            .ordinal
            .map(|ordinal| ordinal.saturating_add(ordinal_shift));
        target.thinking_phases.push(phase);
    }

    if incoming.usage.is_some() {
        target.usage = incoming.usage;
    }
    if incoming.created_at > target.created_at {
        target.created_at = incoming.created_at;
    }
    if incoming.is_interrupted.is_some() {
        target.is_interrupted = incoming.is_interrupted;
    }
    if incoming.turn_duration_ms.is_some() {
        target.turn_duration_ms = incoming.turn_duration_ms;
    }
}

/// Remap `parent_uuid` references that point to consumed (merged-away) UUIDs.
fn remap_parent_uuids(messages: &mut [Message], uuid_remap: &HashMap<String, String>) {
    if uuid_remap.is_empty() {
        return;
    }
    for msg in messages {
        if let Some(parent) = &msg.parent_uuid {
            if let Some(surviving) = uuid_remap.get(parent) {
                msg.parent_uuid = Some(surviving.clone());
            }
        }
    }
}

/// Merge per-message metadata from the sidecar into loaded messages.
///
/// The sidecar is keyed by the frontend's message ID (agent-bridge turn ID),
/// which differs from the SDK JSONL UUID. We try direct ID match first, then
/// fall back to matching by thinking content prefix fingerprint.
fn merge_sidecar_metadata(messages: &mut [Message], metadata: &HashMap<String, MessageMetadata>) {
    for msg in messages {
        if msg.thinking_duration_ms.is_some() {
            continue;
        }

        let matched_fragment_meta =
            collect_fragment_metadata_matches(&msg.thinking_phases, metadata);
        let unique_fragment_starts: HashSet<usize> = matched_fragment_meta
            .iter()
            .map(|(start_index, _)| *start_index)
            .collect();
        let use_fragment_stitching = unique_fragment_starts.len() > 1
            || unique_fragment_starts
                .iter()
                .next()
                .is_some_and(|start| *start > 0);

        if use_fragment_stitching {
            for (start_index, meta) in &matched_fragment_meta {
                apply_phase_durations_from(
                    &mut msg.thinking_phases,
                    *start_index,
                    meta.phase_durations.as_deref(),
                );
            }
            msg.thinking_duration_ms = matched_fragment_meta
                .iter()
                .max_by_key(|(start_index, _)| *start_index)
                .and_then(|(_, meta)| meta.thinking_duration_ms);
            continue;
        }

        // Try direct ID match first
        if let Some(meta) = metadata.get(&msg.id) {
            msg.thinking_duration_ms = meta.thinking_duration_ms;
            apply_phase_durations(&mut msg.thinking_phases, meta.phase_durations.as_deref());
            continue;
        }
        // Fallback: match by thinking content prefix fingerprint
        if let Some(thinking) = &msg.thinking {
            let (duration, phase_durs) = match_by_thinking_prefix(thinking, metadata);
            msg.thinking_duration_ms = duration;
            apply_phase_durations(&mut msg.thinking_phases, phase_durs);
        }
    }
}

/// Match a message's thinking text against sidecar entries by prefix fingerprint.
///
/// Returns `(thinking_duration_ms, phase_durations)` from the best match.
/// Prefers exact 128-byte prefix match; falls back to longest prefix match
/// (for old 64-char sidecars). Rejects ambiguous ties.
fn match_by_thinking_prefix<'a>(
    thinking: &str,
    metadata: &'a HashMap<String, MessageMetadata>,
) -> (Option<u64>, Option<&'a [u64]>) {
    let msg_prefix = truncate_to_char_boundary(thinking, 128);

    // Prefer exact matches first to avoid ambiguity in mixed-version sidecars.
    for meta in metadata.values() {
        if let Some(stored_prefix) = &meta.thinking_prefix {
            if !stored_prefix.is_empty() && stored_prefix == msg_prefix {
                return (meta.thinking_duration_ms, meta.phase_durations.as_deref());
            }
        }
    }

    // Fall back to longest prefix match so old 64-char sidecars still work.
    let mut best_len: usize = 0;
    let mut best_duration: Option<u64> = None;
    let mut best_phase_durations: Option<&[u64]> = None;
    let mut tie = false;

    for meta in metadata.values() {
        if let Some(stored_prefix) = &meta.thinking_prefix {
            if !stored_prefix.is_empty() && msg_prefix.starts_with(stored_prefix.as_str()) {
                let len = stored_prefix.len();
                if len > best_len {
                    best_len = len;
                    best_duration = meta.thinking_duration_ms;
                    best_phase_durations = meta.phase_durations.as_deref();
                    tie = false;
                } else if len == best_len {
                    tie = true;
                }
            }
        }
    }

    if tie {
        (None, None)
    } else {
        (best_duration, best_phase_durations)
    }
}

fn apply_phase_durations(phases: &mut [ThinkingPhase], durations: Option<&[u64]>) {
    apply_phase_durations_from(phases, 0, durations);
}

fn apply_phase_durations_from(
    phases: &mut [ThinkingPhase],
    start_index: usize,
    durations: Option<&[u64]>,
) {
    if let Some(durations) = durations {
        for (offset, &duration) in durations.iter().enumerate() {
            if let Some(phase) = phases.get_mut(start_index + offset) {
                phase.duration_ms = Some(duration);
            }
        }
    }
}

fn collect_fragment_metadata_matches<'a>(
    phases: &[ThinkingPhase],
    metadata: &'a HashMap<String, MessageMetadata>,
) -> Vec<(usize, &'a MessageMetadata)> {
    let mut matches: Vec<(usize, &'a MessageMetadata)> = metadata
        .values()
        .filter_map(|meta| {
            let stored_prefix = meta.thinking_prefix.as_deref()?;
            if stored_prefix.is_empty() {
                return None;
            }
            find_matching_phase_start(phases, stored_prefix).map(|start| (start, meta))
        })
        .collect();
    matches.sort_by_key(|(start, _)| *start);
    matches
}

fn find_matching_phase_start(phases: &[ThinkingPhase], stored_prefix: &str) -> Option<usize> {
    let mut matched_start: Option<usize> = None;

    for start_index in 0..phases.len() {
        let suffix = phases
            .get(start_index..)
            .unwrap_or_default()
            .iter()
            .map(|phase| phase.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");

        if suffix.starts_with(stored_prefix) {
            if matched_start.is_some() {
                return None;
            }
            matched_start = Some(start_index);
        }
    }

    matched_start
}

/// Extract tool results from a `tool_result`-only user message into the collector map.
///
/// The Claude SDK stores tool outputs as separate user-type JSONL lines with
/// `content: [{type: "tool_result", tool_use_id: "...", content: "output"}]`.
/// This function extracts those outputs keyed by `tool_use_id` so they can be
/// backfilled onto the corresponding `ToolUse` entries in assistant messages.
fn extract_tool_results(content: &UserContent, results: &mut HashMap<String, ToolResultData>) {
    if let UserContent::Blocks(blocks) = content {
        for block in blocks {
            if block.get("type").and_then(serde_json::Value::as_str) != Some("tool_result") {
                continue;
            }
            let Some(tool_use_id) = block.get("tool_use_id").and_then(serde_json::Value::as_str)
            else {
                continue;
            };

            let output = match block.get("content") {
                Some(serde_json::Value::String(s)) => s.clone(),
                Some(serde_json::Value::Array(arr)) => {
                    // Handle array-of-blocks content format:
                    // [{type: "text", text: "..."}, ...]
                    arr.iter()
                        .filter_map(|b| b.get("text").and_then(serde_json::Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                },
                _ => String::new(),
            };

            let is_error = block
                .get("is_error")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);

            let _ = results.insert(tool_use_id.to_owned(), ToolResultData { output, is_error });
        }
    }
}

/// Match collected tool results to `ToolUse` entries in assistant messages.
///
/// After parsing all JSONL lines, tool_result user messages have been collected
/// into a map keyed by `tool_use_id`. This function walks assistant messages and
/// populates `output` and adjusts `success` for each matching tool use.
fn backfill_tool_outputs(
    messages: &mut [Message],
    mut tool_results: HashMap<String, ToolResultData>,
) {
    if tool_results.is_empty() {
        return;
    }
    for msg in messages.iter_mut() {
        if msg.role == MessageRole::Assistant {
            for tool in &mut msg.tool_uses {
                if let Some(result) = tool_results.remove(&tool.id) {
                    tool.output = Some(result.output);
                    if result.is_error {
                        tool.success = false;
                    }
                }
            }
        }
    }
}

/// Extract text content, thinking, thinking phases, and tool uses from an assistant message.
///
/// Tracks the running UTF-16 length of concatenated text so each `ToolUse`
/// records the `content_offset` where it appeared in the text stream.
/// The frontend uses this offset to interleave tool widgets between text
/// segments (via `buildSegments`).
fn extract_assistant_content(
    value: &serde_json::Value,
) -> (String, Option<String>, Vec<ThinkingPhase>, Vec<ToolUse>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut thinking: Option<String> = None;
    let mut thinking_phases: Vec<ThinkingPhase> = Vec::new();
    let mut tool_uses: Vec<ToolUse> = Vec::new();
    // Running UTF-16 code unit count of all text parts joined so far.
    // Must use UTF-16 (not UTF-8 bytes) because the frontend uses JavaScript
    // string.slice() which indexes by UTF-16 code units.
    let mut text_utf16_len: u32 = 0;
    let mut ordinal_counter: u32 = 0;

    let content = value.get("content");

    if let Some(serde_json::Value::Array(blocks)) = content {
        for block in blocks {
            match block.get("type").and_then(serde_json::Value::as_str) {
                Some("text") => {
                    if let Some(text) = block.get("text").and_then(serde_json::Value::as_str) {
                        if !text_parts.is_empty() {
                            // Account for the "\n" join separator (1 UTF-16 code unit)
                            text_utf16_len += 1;
                        }
                        text_utf16_len +=
                            u32::try_from(text.encode_utf16().count()).unwrap_or(u32::MAX);
                        text_parts.push(text.to_owned());
                    }
                },
                Some("thinking") => {
                    if let Some(text) = block.get("thinking").and_then(serde_json::Value::as_str) {
                        thinking_phases.push(ThinkingPhase {
                            content: text.to_owned(),
                            content_offset: Some(text_utf16_len),
                            ordinal: Some(ordinal_counter),
                            duration_ms: None,
                        });
                        ordinal_counter = ordinal_counter.saturating_add(1);
                        match &mut thinking {
                            Some(existing) => {
                                existing.push_str("\n\n");
                                existing.push_str(text);
                            },
                            None => {
                                thinking = Some(text.to_owned());
                            },
                        }
                    }
                },
                Some("tool_use") => {
                    let id = block
                        .get("id")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    let name = block
                        .get("name")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    let input = block
                        .get("input")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);

                    tool_uses.push(ToolUse {
                        id,
                        name,
                        input,
                        output: None,
                        success: true,
                        content_offset: Some(text_utf16_len),
                        ordinal: Some(ordinal_counter),
                    });
                    ordinal_counter = ordinal_counter.saturating_add(1);
                },
                _ => {},
            }
        }
    } else if let Some(serde_json::Value::String(s)) = content {
        text_parts.push(s.clone());
    }

    (text_parts.join("\n"), thinking, thinking_phases, tool_uses)
}

/// Extract token usage from an assistant message.
fn extract_usage(value: &serde_json::Value) -> Option<TokenUsage> {
    let usage_val = value.get("usage")?;
    let raw: RawUsage = serde_json::from_value(usage_val.clone()).ok()?;

    Some(TokenUsage {
        input_tokens: raw.input_tokens,
        output_tokens: raw.output_tokens,
        cache_read_input_tokens: raw.cache_read_input_tokens,
        cache_creation_input_tokens: raw.cache_creation_input_tokens,
        total_cost_usd: None,
    })
}

/// Read authoritative session usage from a `.usage.json` sidecar file.
///
/// The agent-bridge writes this file when it receives the SDK's `result` event,
/// which contains correct cumulative usage. The JSONL per-message usage has
/// inaccurate `output_tokens` (written at stream-start, never updated).
///
/// `jsonl_path` is the path to the `.jsonl` file; we swap the extension.
fn read_session_usage(jsonl_path: &Path) -> Option<TokenUsage> {
    let usage_path = jsonl_path.with_extension("usage.json");
    let data = fs::read_to_string(&usage_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&data).ok()?;

    let to_u32 = |v: u64| -> u32 { u32::try_from(v).unwrap_or(u32::MAX) };

    Some(TokenUsage {
        input_tokens: json
            .get("inputTokens")
            .and_then(serde_json::Value::as_u64)
            .map_or(0, to_u32),
        output_tokens: json
            .get("outputTokens")
            .and_then(serde_json::Value::as_u64)
            .map_or(0, to_u32),
        cache_read_input_tokens: json
            .get("cacheReadInputTokens")
            .and_then(serde_json::Value::as_u64)
            .map(to_u32),
        cache_creation_input_tokens: json
            .get("cacheCreationInputTokens")
            .and_then(serde_json::Value::as_u64)
            .map(to_u32),
        total_cost_usd: json.get("totalCostUsd").and_then(serde_json::Value::as_f64),
    })
}

/// Read per-message metadata from a `.metadata.json` sidecar file.
///
/// Returns a map from message ID → metadata. The frontend writes this file
/// via `conversation_add_message` for data the SDK doesn't persist to JSONL
/// (e.g., `thinking_duration_ms` which is computed client-side during streaming).
///
/// `jsonl_path` is the path to the `.jsonl` file; we swap the extension.
fn read_message_metadata(jsonl_path: &Path) -> HashMap<String, MessageMetadata> {
    let meta_path = jsonl_path.with_extension("metadata.json");
    let Ok(data) = fs::read_to_string(&meta_path) else {
        return HashMap::new();
    };
    let Ok(session_meta) = serde_json::from_str::<SessionMetadata>(&data) else {
        return HashMap::new();
    };
    session_meta.messages
}

/// Write per-message metadata to a `.metadata.json` sidecar file.
///
/// Reads the existing sidecar (if any), merges the new entry, and writes back.
/// Uses atomic write (write to temp file, then rename) to prevent corruption.
///
/// # Errors
///
/// Returns an error if the file cannot be written.
fn write_message_metadata(
    jsonl_path: &Path,
    message_id: &str,
    metadata: MessageMetadata,
) -> Result<()> {
    let meta_path = jsonl_path.with_extension("metadata.json");

    // Read existing sidecar or start fresh
    let mut session_meta = fs::read_to_string(&meta_path)
        .ok()
        .and_then(|data| serde_json::from_str::<SessionMetadata>(&data).ok())
        .unwrap_or_default();

    // Insert/update the entry for this message
    let _ = session_meta
        .messages
        .insert(message_id.to_owned(), metadata);

    // Atomic write: temp file → rename
    let tmp_path = meta_path.with_extension("metadata.json.tmp");
    let serialized = serde_json::to_string_pretty(&session_meta)
        .map_err(|e| Error::Config(format!("Failed to serialize metadata: {e}")))?;
    fs::write(&tmp_path, serialized).map_err(Error::Io)?;
    fs::rename(&tmp_path, &meta_path).map_err(Error::Io)?;

    Ok(())
}

/// Parse an ISO-8601 timestamp to epoch milliseconds.
fn parse_iso_timestamp(s: &str) -> u64 {
    chrono::DateTime::parse_from_rfc3339(s).map_or_else(
        |_| current_timestamp(),
        |dt| {
            #[expect(
                clippy::cast_sign_loss,
                reason = "timestamps are always positive after UNIX epoch"
            )]
            let ms = dt.timestamp_millis() as u64;
            ms
        },
    )
}

/// Encode a workspace path to a folder name (Claude Code convention).
#[must_use]
pub fn encode_workspace_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Decode an encoded folder name back to an absolute path.
#[must_use]
pub fn decode_workspace_path(encoded: &str) -> String {
    encoded.replace('-', "/")
}

/// Get current timestamp in milliseconds
fn current_timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "u64 can hold timestamps until year 584,942,417"
        )]
        let millis = d.as_millis() as u64;
        millis
    })
}

const fn default_true() -> bool {
    true
}

/// Strip the file context prefix that was prepended to user messages in older versions.
///
/// Old conversations stored file paths as a string prepend:
/// "The user has attached the following files for context. ...\n- /path\n\nactual text"
/// New conversations use separate content blocks instead. This function strips the
/// old-style prefix so the user's original text renders cleanly on reload.
fn strip_file_context_prefix(s: &str) -> String {
    const PREFIX: &str = "The user has attached the following files for context.";
    if s.starts_with(PREFIX) {
        if let Some(idx) = s.find("\n\n") {
            let rest = &s[idx + 2..];
            if !rest.is_empty() {
                return rest.to_owned();
            }
        }
    }
    s.to_owned()
}

/// Strip SDK command XML tags from user messages.
///
/// The Claude SDK stores slash commands / skills with XML tags. Two formats exist:
///
/// **Legacy format** (`.claude/commands/` without user args):
///   `<command-name>/init</command-name>\n<command-message>init</command-message>`
///
/// **Current format** (skills and commands with user args):
///   `<command-message>web-animation-design</command-message>\n<command-name>/web-animation-design</command-name>\n<command-args>load this</command-args>`
///
/// For display we reconstruct: `/web-animation-design load this`.
fn strip_sdk_command_xml(s: &str) -> String {
    const NAME_OPEN: &str = "<command-name>";
    const NAME_CLOSE: &str = "</command-name>";
    const ARGS_OPEN: &str = "<command-args>";
    const ARGS_CLOSE: &str = "</command-args>";

    // Extract <command-name> — present in both formats
    let name = extract_xml_tag(s, NAME_OPEN, NAME_CLOSE);
    let name = match name {
        Some(n) if !n.is_empty() => n,
        _ => return s.to_owned(), // No command-name tag → pass through
    };

    // Extract <command-args> — user text AFTER the slash command (current format)
    if let Some(args) = extract_xml_tag(s, ARGS_OPEN, ARGS_CLOSE) {
        let args = args.trim();
        if !args.is_empty() {
            return format!("{name} {args}");
        }
    }

    name.to_owned()
}

/// Extract text between an XML open/close tag pair. Returns `None` if tags are missing.
fn extract_xml_tag<'a>(s: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let start = s.find(open)?;
    let end = s.find(close)?;
    let content_start = start + open.len();
    (content_start < end).then(|| &s[content_start..end])
}

/// Clean user message text for display by applying all stripping passes.
///
/// Handles three formats that can appear in JSONL:
/// 1. Old-style file context prefix (plain string with prepended metadata)
/// 2. SDK command XML tags (from `.claude/commands/` handled natively by SDK)
/// 3. Clean text (returned as-is)
fn clean_user_text(s: &str) -> String {
    let stripped = strip_file_context_prefix(s);
    strip_sdk_command_xml(&stripped)
}

/// Find the largest byte index at or before `index` that is a valid char boundary.
/// Equivalent to `str::floor_char_boundary` (stable since Rust 1.91.0) but works on MSRV 1.85.0.
fn floor_char_boundary(s: &str, index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    let mut i = index;
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// Truncate a string to at most `max_len` bytes at a valid char boundary.
fn truncate_to_char_boundary(s: &str, max_len: usize) -> &str {
    &s[..floor_char_boundary(s, max_len)]
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
#[expect(
    clippy::expect_used,
    clippy::indexing_slicing,
    reason = "acceptable in test code"
)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    /// Join lines and append a trailing newline for JSONL test files.
    fn jsonl_content(lines: &[&str]) -> String {
        let mut content = lines.join("\n");
        content.push('\n');
        content
    }

    fn create_test_manager() -> (ConversationManager, TempDir) {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let manager = ConversationManager::with_data_dir(temp_dir.path().to_path_buf());
        (manager, temp_dir)
    }

    #[test]
    fn test_thinking_phase_serialization_with_duration() {
        let phase = ThinkingPhase {
            content: String::from("phase 1"),
            content_offset: Some(4),
            ordinal: Some(2),
            duration_ms: Some(1500),
        };

        let serialized = serde_json::to_value(&phase).expect("serialize phase");
        assert_eq!(serialized["durationMs"], json!(1500_u64));

        let round_trip: ThinkingPhase =
            serde_json::from_value(serialized).expect("deserialize phase");
        assert_eq!(round_trip.duration_ms, Some(1500));
    }

    #[test]
    fn test_create_returns_struct_no_disk() {
        let (manager, _temp) = create_test_manager();

        let conv = manager
            .create("session-1".to_owned(), "Test Chat".to_owned(), None, None)
            .expect("Failed to create");

        assert_eq!(conv.session_id, "session-1");
        assert_eq!(conv.title, "Test Chat");
        assert!(conv.messages.is_empty());

        // No JSONL file written
        let path = manager.conversation_path("session-1", None);
        assert!(!path.exists());
    }

    #[test]
    fn test_add_message_no_thinking_no_sidecar() {
        let (manager, _temp) = create_test_manager();

        let msg = Message {
            id: "m1".to_owned(),
            role: MessageRole::User,
            content: "Hello".to_owned(),
            thinking: None,
            thinking_duration_ms: None,
            thinking_phases: Vec::new(),
            is_interrupted: None,
            turn_duration_ms: None,
            created_at: current_timestamp(),
            tool_uses: Vec::new(),
            usage: None,
            parent_uuid: None,
        };

        // No thinking_duration_ms → no sidecar written
        manager
            .add_message("session-1", &msg, None, None)
            .expect("add_message should succeed");

        let meta_path = manager
            .conversation_path("session-1", None)
            .with_extension("metadata.json");
        assert!(
            !meta_path.exists(),
            "No sidecar when no metadata to persist"
        );
    }

    #[test]
    fn test_add_message_writes_thinking_duration_sidecar() {
        let (manager, _temp) = create_test_manager();

        // Ensure the workspace dir exists (normally created by SDK)
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let msg = Message {
            id: "a1".to_owned(),
            role: MessageRole::Assistant,
            content: "Response".to_owned(),
            thinking: Some("Deep thought".to_owned()),
            thinking_duration_ms: Some(1234),
            thinking_phases: vec![
                ThinkingPhase {
                    content: String::from("phase 1"),
                    content_offset: Some(0),
                    ordinal: Some(0),
                    duration_ms: Some(250),
                },
                ThinkingPhase {
                    content: String::from("phase 2"),
                    content_offset: Some(8),
                    ordinal: Some(1),
                    duration_ms: None,
                },
                ThinkingPhase {
                    content: String::from("phase 3"),
                    content_offset: Some(16),
                    ordinal: Some(2),
                    duration_ms: Some(875),
                },
            ],
            is_interrupted: None,
            turn_duration_ms: None,
            created_at: current_timestamp(),
            tool_uses: Vec::new(),
            usage: None,
            parent_uuid: None,
        };

        manager
            .add_message("session-1", &msg, None, None)
            .expect("add_message should write sidecar");

        // Verify sidecar exists and contains the correct data
        let meta_path = manager
            .conversation_path("session-1", None)
            .with_extension("metadata.json");
        assert!(meta_path.exists(), "Sidecar should be created");

        let data = fs::read_to_string(&meta_path).expect("read sidecar");
        let session_meta: SessionMetadata = serde_json::from_str(&data).expect("parse sidecar");
        let meta = session_meta.messages.get("a1").expect("message entry");
        assert_eq!(meta.thinking_duration_ms, Some(1234));
        assert_eq!(meta.phase_durations.as_deref(), Some(&[250, 0, 875][..]));
        assert_eq!(
            meta.thinking_prefix.as_deref(),
            Some("Deep thought"),
            "thinking_prefix should be stored for fingerprint matching"
        );
    }

    #[test]
    fn test_load_merges_thinking_duration_from_sidecar() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Write a JSONL with an assistant message (no thinking duration in JSONL)
        let path = ws_dir.join("session-1.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Test","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 1"},{"type":"text","text":"Hi"},{"type":"thinking","thinking":"phase 2"},{"type":"text","text":"there"}]},"timestamp":"2026-01-11T18:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        // Write the metadata sidecar with thinking_duration_ms (direct ID match case)
        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    "a1".to_owned(),
                    MessageMetadata {
                        thinking_duration_ms: Some(5678),
                        phase_durations: Some(vec![111, 222]),
                        thinking_prefix: Some("phase 1\n\nphase 2".to_owned()),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        // Load and verify the merge
        let conv = manager
            .load_from_workspace("session-1", None)
            .expect("load")
            .expect("conversation exists");

        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(
            assistant_msg.thinking_duration_ms,
            Some(5678),
            "thinking_duration_ms should be merged from sidecar"
        );
        assert_eq!(assistant_msg.thinking_phases.len(), 2);
        assert_eq!(assistant_msg.thinking_phases[0].duration_ms, Some(111));
        assert_eq!(assistant_msg.thinking_phases[1].duration_ms, Some(222));
        assert_eq!(
            assistant_msg.thinking.as_deref(),
            Some("phase 1\n\nphase 2"),
            "thinking text should come from JSONL"
        );
    }

    #[test]
    fn test_load_merges_thinking_duration_via_fingerprint() {
        // This test validates the fingerprint-based fallback matching.
        // The sidecar uses a DIFFERENT message ID than the JSONL (simulating
        // the real-world mismatch between bridge turn IDs and SDK UUIDs),
        // but matching succeeds via the thinking content prefix.
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // JSONL uses SDK UUID "sdk-uuid-abc" for the assistant message
        let path = ws_dir.join("session-fp.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Fingerprint Test","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"sdk-uuid-abc","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Analyzing the request carefully"},{"type":"text","text":"Hi"},{"type":"thinking","thinking":"Checking another angle"},{"type":"text","text":"!"}]},"timestamp":"2026-01-11T18:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        // Sidecar uses frontend turn ID "bridge-turn-xyz" (different from SDK UUID)
        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    "bridge-turn-xyz".to_owned(),
                    MessageMetadata {
                        thinking_duration_ms: Some(3456),
                        phase_durations: Some(vec![333, 444]),
                        thinking_prefix: Some(
                            "Analyzing the request carefully\n\nChecking another angle".to_owned(),
                        ),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        // Load — direct ID match fails (sdk-uuid-abc ≠ bridge-turn-xyz),
        // but fingerprint match succeeds via thinking prefix
        let conv = manager
            .load_from_workspace("session-fp", None)
            .expect("load")
            .expect("conversation exists");

        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(
            assistant_msg.thinking_duration_ms,
            Some(3456),
            "thinking_duration_ms should be merged via fingerprint fallback"
        );
        assert_eq!(assistant_msg.thinking_phases.len(), 2);
        assert_eq!(assistant_msg.thinking_phases[0].duration_ms, Some(333));
        assert_eq!(assistant_msg.thinking_phases[1].duration_ms, Some(444));
        assert_eq!(
            assistant_msg.thinking.as_deref(),
            Some("Analyzing the request carefully\n\nChecking another angle"),
        );
    }

    #[test]
    fn test_load_handles_short_phase_duration_arrays() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("session-short-phase-durations.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Short Durations","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 1"},{"type":"text","text":"Hi"},{"type":"thinking","thinking":"phase 2"},{"type":"text","text":"there"}]},"timestamp":"2026-01-11T18:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("a1"),
                    MessageMetadata {
                        thinking_duration_ms: Some(2000),
                        phase_durations: Some(vec![777]),
                        thinking_prefix: Some(String::from("phase 1\n\nphase 2")),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-short-phase-durations", None)
            .expect("load")
            .expect("conversation exists");
        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_phases.len(), 2);
        assert_eq!(assistant_msg.thinking_phases[0].duration_ms, Some(777));
        assert_eq!(assistant_msg.thinking_phases[1].duration_ms, None);
    }

    #[test]
    fn test_load_merges_fragment_phase_durations_across_single_merged_turn() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("session-fragment-phase-durations.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Fragment Durations","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 1"}]},"timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]},"timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"assistant","uuid":"a3","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 2"}]},"timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a4","message":{"role":"assistant","content":[{"type":"text","text":"there"}]},"timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("bridge-fragment-1"),
                    MessageMetadata {
                        thinking_duration_ms: Some(111),
                        phase_durations: Some(vec![111]),
                        thinking_prefix: Some(String::from("phase 1")),
                    },
                );
                let _ = m.insert(
                    String::from("bridge-fragment-2"),
                    MessageMetadata {
                        thinking_duration_ms: Some(222),
                        phase_durations: Some(vec![222]),
                        thinking_prefix: Some(String::from("phase 2")),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-fragment-phase-durations", None)
            .expect("load")
            .expect("conversation exists");
        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_duration_ms, Some(222));
        assert_eq!(assistant_msg.thinking_phases.len(), 2);
        assert_eq!(assistant_msg.thinking_phases[0].duration_ms, Some(111));
        assert_eq!(assistant_msg.thinking_phases[1].duration_ms, Some(222));
    }

    #[test]
    fn test_has_any_tool_result_detects_mixed_blocks() {
        assert!(!UserContent::Text(String::from("hello")).has_any_tool_result());
        assert!(
            !UserContent::Blocks(vec![json!({ "type": "text", "text": "hello" })])
                .has_any_tool_result()
        );
        assert!(UserContent::Blocks(vec![json!({
            "type": "tool_result",
            "tool_use_id": "t1",
            "content": "done"
        })])
        .has_any_tool_result());
        assert!(UserContent::Blocks(vec![
            json!({
                "type": "tool_result",
                "tool_use_id": "t1",
                "content": "done"
            }),
            json!({ "type": "text", "text": "Tool loaded." }),
        ])
        .has_any_tool_result());
    }

    #[test]
    fn test_extract_assistant_content_tracks_thinking_phases_and_ordinals() {
        let value = json!({
            "content": [
                { "type": "thinking", "thinking": "phase 1" },
                { "type": "text", "text": "Hi" },
                { "type": "tool_use", "id": "t1", "name": "Bash", "input": { "command": "ls" } },
                { "type": "thinking", "thinking": "phase 2" },
                { "type": "text", "text": "there" }
            ]
        });

        let (text, thinking, thinking_phases, tool_uses) = extract_assistant_content(&value);

        assert_eq!(text, "Hi\nthere");
        assert_eq!(thinking.as_deref(), Some("phase 1\n\nphase 2"));
        assert_eq!(thinking_phases.len(), 2);
        assert_eq!(thinking_phases[0].content, "phase 1");
        assert_eq!(thinking_phases[0].content_offset, Some(0));
        assert_eq!(thinking_phases[0].ordinal, Some(0));
        assert_eq!(thinking_phases[0].duration_ms, None);
        assert_eq!(tool_uses.len(), 1);
        assert_eq!(tool_uses[0].content_offset, Some(2));
        assert_eq!(tool_uses[0].ordinal, Some(1));
        assert_eq!(thinking_phases[1].content, "phase 2");
        assert_eq!(thinking_phases[1].content_offset, Some(2));
        assert_eq!(thinking_phases[1].ordinal, Some(2));
        assert_eq!(thinking_phases[1].duration_ms, None);
    }

    #[test]
    fn test_absorb_assistant_message_shifts_shared_ordinals() {
        let mut target = Message {
            id: String::from("a1"),
            role: MessageRole::Assistant,
            content: String::from("Hi"),
            thinking: Some(String::from("phase 1")),
            thinking_duration_ms: None,
            thinking_phases: vec![ThinkingPhase {
                content: String::from("phase 1"),
                content_offset: Some(0),
                ordinal: Some(0),
                duration_ms: Some(100),
            }],
            is_interrupted: None,
            turn_duration_ms: None,
            created_at: 1,
            tool_uses: vec![ToolUse {
                id: String::from("t1"),
                name: String::from("Bash"),
                input: json!({ "command": "pwd" }),
                output: None,
                success: true,
                content_offset: Some(2),
                ordinal: Some(1),
            }],
            usage: None,
            parent_uuid: None,
        };
        let incoming = Message {
            id: String::from("a2"),
            role: MessageRole::Assistant,
            content: String::from("there"),
            thinking: Some(String::from("phase 2")),
            thinking_duration_ms: None,
            thinking_phases: vec![ThinkingPhase {
                content: String::from("phase 2"),
                content_offset: Some(0),
                ordinal: Some(0),
                duration_ms: Some(200),
            }],
            is_interrupted: None,
            turn_duration_ms: None,
            created_at: 2,
            tool_uses: vec![ToolUse {
                id: String::from("t2"),
                name: String::from("Read"),
                input: json!({ "file_path": "/tmp/test.txt" }),
                output: None,
                success: true,
                content_offset: Some(0),
                ordinal: Some(1),
            }],
            usage: None,
            parent_uuid: None,
        };

        absorb_assistant_message(&mut target, incoming);

        assert_eq!(target.content, "Hi\nthere");
        assert_eq!(target.thinking.as_deref(), Some("phase 1\n\nphase 2"));
        assert_eq!(target.thinking_phases.len(), 2);
        assert_eq!(target.thinking_phases[1].content_offset, Some(3));
        assert_eq!(target.thinking_phases[1].ordinal, Some(2));
        assert_eq!(target.thinking_phases[0].duration_ms, Some(100));
        assert_eq!(target.thinking_phases[1].duration_ms, Some(200));
        assert_eq!(target.tool_uses.len(), 2);
        assert_eq!(target.tool_uses[1].content_offset, Some(3));
        assert_eq!(target.tool_uses[1].ordinal, Some(3));
    }

    #[test]
    fn test_mixed_tool_result_with_text_is_treated_as_protocol_artifact() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("mixed-tool-result.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"run ls"},"cwd":"/test","sessionId":"mixed-tool-result","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Checking..."},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/test","sessionId":"mixed-tool-result","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt"},{"type":"text","text":"Tool loaded."}]},"cwd":"/test","sessionId":"mixed-tool-result","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Found file1.txt"}]},"cwd":"/test","sessionId":"mixed-tool-result","timestamp":"2026-01-11T18:00:03.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("mixed-tool-result", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 2);
        assert_eq!(conv.messages[0].id, "u1");
        let assistant = &conv.messages[1];
        assert!(assistant.content.contains("Checking..."));
        assert!(assistant.content.contains("Found file1.txt"));
        assert_eq!(assistant.tool_uses.len(), 1);
        assert_eq!(assistant.tool_uses[0].output.as_deref(), Some("file1.txt"));
    }

    #[test]
    fn test_tool_output_backfill_multiple_tools_with_error() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("multi-tool-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"check files"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Let me check."},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"/missing.txt"}}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt\nfile2.txt"},{"type":"tool_result","tool_use_id":"t2","content":"Error: file not found","is_error":true}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"The file doesn't exist."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("multi-tool-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 2);
        let assistant = &conv.messages[1];
        assert_eq!(assistant.tool_uses.len(), 2);
        assert_eq!(
            assistant.tool_uses[0].output.as_deref(),
            Some("file1.txt\nfile2.txt")
        );
        assert!(assistant.tool_uses[0].success);
        assert_eq!(
            assistant.tool_uses[1].output.as_deref(),
            Some("Error: file not found")
        );
        assert!(!assistant.tool_uses[1].success);
    }

    #[test]
    fn test_multi_phase_thinking_survives_merge_with_shifted_offsets_and_ordinals() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("thinking-merge-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"do work"},"cwd":"/test","sessionId":"thinking-merge-session","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 1"},{"type":"text","text":"Hello"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/test","sessionId":"thinking-merge-session","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt"}]},"cwd":"/test","sessionId":"thinking-merge-session","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"thinking","thinking":"phase 2"},{"type":"text","text":"World"},{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"a.txt"}}]},"cwd":"/test","sessionId":"thinking-merge-session","timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("thinking-merge-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 2);
        let assistant = &conv.messages[1];
        assert_eq!(assistant.content, "Hello\nWorld");
        assert_eq!(assistant.thinking.as_deref(), Some("phase 1\n\nphase 2"));
        assert_eq!(assistant.thinking_phases.len(), 2);
        assert_eq!(assistant.thinking_phases[0].content_offset, Some(0));
        assert_eq!(assistant.thinking_phases[0].ordinal, Some(0));
        assert_eq!(assistant.thinking_phases[1].content_offset, Some(6));
        assert_eq!(assistant.thinking_phases[1].ordinal, Some(2));
        assert_eq!(assistant.tool_uses.len(), 2);
        assert_eq!(assistant.tool_uses[0].content_offset, Some(5));
        assert_eq!(assistant.tool_uses[0].ordinal, Some(1));
        assert_eq!(assistant.tool_uses[1].content_offset, Some(11));
        assert_eq!(assistant.tool_uses[1].ordinal, Some(3));
    }

    #[test]
    fn test_fingerprint_prefers_exact_match_over_shorter_prefix() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let thinking = format!("{}{}", "A".repeat(128), " exact tail");
        let path = ws_dir.join("fingerprint-exact.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-a1",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": thinking },
                    { "type": "text", "text": "Hi" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Fingerprint Exact","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let short_prefix = truncate_to_char_boundary(&thinking, 64).to_owned();
        let exact_prefix = truncate_to_char_boundary(&thinking, 128).to_owned();
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("legacy-short"),
                    MessageMetadata {
                        thinking_duration_ms: Some(111),
                        phase_durations: None,
                        thinking_prefix: Some(short_prefix),
                    },
                );
                let _ = m.insert(
                    String::from("exact-new"),
                    MessageMetadata {
                        thinking_duration_ms: Some(222),
                        phase_durations: None,
                        thinking_prefix: Some(exact_prefix),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("fingerprint-exact", None)
            .expect("load")
            .expect("not found");

        let assistant = conv
            .messages
            .iter()
            .find(|msg| msg.role == MessageRole::Assistant)
            .expect("assistant");
        assert_eq!(assistant.thinking_duration_ms, Some(222));
    }

    #[test]
    fn test_fingerprint_skips_ambiguous_prefix_ties() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let thinking = "A".repeat(80);
        let path = ws_dir.join("fingerprint-ambiguous.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-a1",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": thinking },
                    { "type": "text", "text": "Hi" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Fingerprint Ambiguous","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let ambiguous_prefix = truncate_to_char_boundary(&thinking, 64).to_owned();
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("legacy-a"),
                    MessageMetadata {
                        thinking_duration_ms: Some(111),
                        phase_durations: None,
                        thinking_prefix: Some(ambiguous_prefix.clone()),
                    },
                );
                let _ = m.insert(
                    String::from("legacy-b"),
                    MessageMetadata {
                        thinking_duration_ms: Some(222),
                        phase_durations: None,
                        thinking_prefix: Some(ambiguous_prefix),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("fingerprint-ambiguous", None)
            .expect("load")
            .expect("not found");

        let assistant = conv
            .messages
            .iter()
            .find(|msg| msg.role == MessageRole::Assistant)
            .expect("assistant");
        assert_eq!(assistant.thinking_duration_ms, None);
    }

    #[test]
    fn test_load_prefers_exact_128_prefix_match_over_shorter_match() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let long_thinking = format!("{}{}tail", "A".repeat(64), "B".repeat(70));
        let path = ws_dir.join("session-ranked-prefix.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-uuid-1",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": long_thinking },
                    { "type": "text", "text": "Hi!" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Ranked Prefix","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let short_prefix = truncate_to_char_boundary(&long_thinking, 64).to_owned();
        let exact_prefix = truncate_to_char_boundary(&long_thinking, 128).to_owned();
        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("old-64"),
                    MessageMetadata {
                        thinking_duration_ms: Some(1111),
                        phase_durations: None,
                        thinking_prefix: Some(short_prefix),
                    },
                );
                let _ = m.insert(
                    String::from("new-128"),
                    MessageMetadata {
                        thinking_duration_ms: Some(2222),
                        phase_durations: None,
                        thinking_prefix: Some(exact_prefix),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-ranked-prefix", None)
            .expect("load")
            .expect("conversation exists");
        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_duration_ms, Some(2222));
    }

    #[test]
    fn test_load_skips_ambiguous_prefix_ties() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let long_thinking = format!("{}{}tail", "A".repeat(64), "B".repeat(70));
        let path = ws_dir.join("session-prefix-tie.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-uuid-1",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": long_thinking },
                    { "type": "text", "text": "Hi!" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Prefix Tie","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let shared_prefix = truncate_to_char_boundary(&long_thinking, 64).to_owned();
        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("old-a"),
                    MessageMetadata {
                        thinking_duration_ms: Some(1111),
                        phase_durations: None,
                        thinking_prefix: Some(shared_prefix.clone()),
                    },
                );
                let _ = m.insert(
                    String::from("old-b"),
                    MessageMetadata {
                        thinking_duration_ms: Some(2222),
                        phase_durations: None,
                        thinking_prefix: Some(shared_prefix),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-prefix-tie", None)
            .expect("load")
            .expect("conversation exists");
        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_duration_ms, None);
    }

    #[test]
    fn test_load_merges_thinking_duration_via_legacy_short_prefix() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let long_thinking = format!("{}\n\nphase two", "a".repeat(80));
        let legacy_prefix = truncate_to_char_boundary(&long_thinking, 64).to_owned();

        let path = ws_dir.join("session-fp-legacy.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-uuid-legacy",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": &long_thinking },
                    { "type": "text", "text": "Hi!" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Fingerprint Legacy Test","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    "bridge-turn-legacy".to_owned(),
                    MessageMetadata {
                        thinking_duration_ms: Some(4321),
                        phase_durations: None,
                        thinking_prefix: Some(legacy_prefix),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-fp-legacy", None)
            .expect("load")
            .expect("conversation exists");

        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_duration_ms, Some(4321));
        assert_eq!(
            assistant_msg.thinking.as_deref(),
            Some(long_thinking.as_str())
        );
    }

    #[test]
    fn test_fingerprint_non_ascii() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let thinking = "🙂界".repeat(30);
        assert!(thinking.len() > 128);

        let path = ws_dir.join("session-fingerprint-non-ascii.jsonl");
        let assistant_line = serde_json::json!({
            "type": "assistant",
            "uuid": "sdk-uuid-non-ascii",
            "message": {
                "role": "assistant",
                "content": [
                    { "type": "thinking", "thinking": &thinking },
                    { "type": "text", "text": "Hi!" }
                ]
            },
            "timestamp": "2026-01-11T18:00:01.000Z"
        })
        .to_string();
        let lines = [
            r#"{"type":"summary","summary":"Fingerprint Non ASCII","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-11T18:00:00.000Z"}"#,
            assistant_line.as_str(),
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write jsonl");

        let meta_path = path.with_extension("metadata.json");
        let meta = SessionMetadata {
            messages: {
                let mut m = HashMap::new();
                let _ = m.insert(
                    String::from("bridge-non-ascii"),
                    MessageMetadata {
                        thinking_duration_ms: Some(2468),
                        phase_durations: Some(vec![1357]),
                        thinking_prefix: Some(truncate_to_char_boundary(&thinking, 128).to_owned()),
                    },
                );
                m
            },
        };
        fs::write(&meta_path, serde_json::to_string(&meta).expect("serialize"))
            .expect("write sidecar");

        let conv = manager
            .load_from_workspace("session-fingerprint-non-ascii", None)
            .expect("load")
            .expect("conversation exists");
        let assistant_msg = conv
            .messages
            .iter()
            .find(|m| m.role == MessageRole::Assistant)
            .expect("assistant message");

        assert_eq!(assistant_msg.thinking_duration_ms, Some(2468));
        assert_eq!(assistant_msg.thinking_phases.len(), 1);
        assert_eq!(assistant_msg.thinking_phases[0].duration_ms, Some(1357));
        assert_eq!(assistant_msg.thinking.as_deref(), Some(thinking.as_str()));
    }

    #[test]
    fn test_update_title_skips_missing_file() {
        let (manager, _temp) = create_test_manager();

        // No JSONL file exists — update_title should silently skip (no error).
        manager
            .update_title("session-1", "New Title", None)
            .expect("update_title should skip when JSONL doesn't exist");
    }

    #[test]
    fn test_load_sdk_written_file() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("session-1.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Test Chat","leafUuid":""}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"},"cwd":"/test","sessionId":"session-1","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"cwd":"/test","sessionId":"session-1","timestamp":"2026-01-11T18:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let loaded = manager
            .load("session-1", None)
            .expect("Failed to load")
            .expect("Conversation not found");

        assert_eq!(loaded.session_id, "session-1");
        assert_eq!(loaded.title, "Test Chat");
        assert_eq!(loaded.messages.len(), 2);
        assert_eq!(loaded.messages[0].content, "Hello");
        assert_eq!(loaded.messages[1].content, "Hi there!");
    }

    #[test]
    fn test_load_nonexistent() {
        let (manager, _temp) = create_test_manager();
        let result = manager.load("nonexistent", None).expect("Failed to load");
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_conversation() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("session-1.jsonl");
        fs::write(
            &path,
            r#"{"type":"summary","summary":"Test","leafUuid":""}"#,
        )
        .expect("write");

        assert!(manager.load("session-1", None).expect("load").is_some());

        manager.delete("session-1", None).expect("delete");

        assert!(manager.load("session-1", None).expect("load").is_none());
    }

    #[test]
    fn test_load_summaries_from_disk() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        for (id, title) in [("s1", "Chat 1"), ("s2", "Chat 2"), ("s3", "Chat 3")] {
            let path = ws_dir.join(format!("{id}.jsonl"));
            let mut line = format!(r#"{{"type":"summary","summary":"{title}","leafUuid":""}}"#);
            line.push('\n');
            fs::write(&path, line).expect("write");
        }

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        assert_eq!(summaries.len(), 3);
    }

    #[test]
    fn test_fork_conversation() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("session-1.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Original","leafUuid":""}"#,
            r#"{"type":"user","uuid":"m1","message":{"role":"user","content":"Message 1"},"cwd":"/test","sessionId":"session-1","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"m2","message":{"role":"assistant","content":[{"type":"text","text":"Response 1"}]},"cwd":"/test","sessionId":"session-1","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"user","uuid":"m3","message":{"role":"user","content":"Message 2"},"cwd":"/test","sessionId":"session-1","timestamp":"2026-01-11T18:00:02.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let forked = manager
            .fork("session-1", "session-2", Some("m2"), None)
            .expect("Failed to fork")
            .expect("Original not found");

        assert_eq!(forked.session_id, "session-2");
        assert_eq!(forked.messages.len(), 2);
        assert_eq!(forked.forked_from, Some("session-1".to_owned()));
    }

    #[test]
    fn test_read_real_claude_code_format() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("test-session.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Test Session","leafUuid":"abc"}"#,
            r#"{"type":"file-history-snapshot","messageId":"m1","snapshot":{},"isSnapshotUpdate":false}"#,
            r#"{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/test","sessionId":"test-session","version":"2.1.4","gitBranch":"main","type":"user","message":{"role":"user","content":"hello"},"uuid":"m1","timestamp":"2026-01-11T18:45:25.544Z","thinkingMetadata":{"level":"high"},"todos":[]}"#,
            r#"{"parentUuid":"m1","isSidechain":false,"cwd":"/test","sessionId":"test-session","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}],"usage":{"input_tokens":100,"output_tokens":50}},"uuid":"m2","timestamp":"2026-01-11T18:45:30.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("test-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.title, "Test Session");
        assert_eq!(conv.messages.len(), 2);
        assert!(conv.messages[1].usage.is_some());
        let usage = conv.messages[1].usage.as_ref().expect("usage");
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
    }

    #[test]
    fn test_empty_file_loads_as_untitled() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        fs::write(ws_dir.join("empty-session.jsonl"), "").expect("write");

        let conv = manager
            .load_from_workspace("empty-session", None)
            .expect("load")
            .expect("not found");
        assert_eq!(conv.title, "Untitled");
    }

    #[test]
    fn test_summary_first_line_small_file() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let lines = [
            r#"{"type":"summary","summary":"My Small Chat","leafUuid":"abc"}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hi"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:00.000Z"}"#,
        ];
        fs::write(ws_dir.join("small-session.jsonl"), jsonl_content(&lines)).expect("write");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        let s = summaries.iter().find(|s| s.session_id == "small-session");
        assert_eq!(s.expect("found").title, "My Small Chat");
    }

    #[test]
    fn test_large_file_finds_custom_title_outside_tail_window() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let mut content = String::new();
        content.push_str(
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"fallback title text"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:00.000Z"}"#,
        );
        content.push('\n');
        content.push_str(r#"{"type":"custom-title","title":"Pinned Custom Title"}"#);
        content.push('\n');

        // Ensure file is much larger than the tail scan window so custom-title
        // is outside the tail and must be found by forward fallback scanning.
        let filler = "x".repeat(160);
        for i in 0_i32..2_200_i32 {
            let line = format!(r#"{{"type":"system","idx":{i},"payload":"{filler}"}}"#);
            content.push_str(&line);
            content.push('\n');
        }

        fs::write(ws_dir.join("large-custom-title-session.jsonl"), content).expect("write");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        let s = summaries
            .iter()
            .find(|s| s.session_id == "large-custom-title-session");
        assert_eq!(s.expect("found").title, "Pinned Custom Title");
    }

    #[test]
    fn test_fallback_to_first_user_message() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let lines = [
            r#"{"type":"file-history-snapshot","messageId":"m1","snapshot":{}}"#,
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hi"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:00.000Z"}"#,
        ];
        fs::write(
            ws_dir.join("nosummary-session.jsonl"),
            jsonl_content(&lines),
        )
        .expect("write");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        let s = summaries
            .iter()
            .find(|s| s.session_id == "nosummary-session");
        assert_eq!(s.expect("found").title, "hi");
    }

    #[test]
    fn test_tool_result_filtering_and_assistant_merging() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("tool-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"run ls"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"I'll run that for you."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt\nfile2.txt"}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:04.000Z"}"#,
            r#"{"type":"assistant","uuid":"a3","message":{"role":"assistant","content":[{"type":"text","text":"Here are your files: file1.txt and file2.txt"}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:05.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("tool-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 2);
        assert_eq!(conv.messages[0].content, "run ls");
        assert!(conv.messages[1].content.contains("I'll run that for you."));
        assert!(conv.messages[1].content.contains("Here are your files"));
        assert_eq!(conv.messages[1].tool_uses.len(), 1);
        assert_eq!(conv.messages[1].tool_uses[0].name, "Bash");

        // The tool was on a separate JSONL line (a2) with no text.
        // After merge: base text "I'll run that for you." (22 bytes), tool_use line
        // had empty content so no \n separator added. Tool offset = 0 + 22 = 22.
        assert_eq!(
            conv.messages[1].tool_uses[0].content_offset,
            Some(22),
            "Tool offset should account for preceding text from earlier lines"
        );

        // Tool output should be backfilled from the tool_result user message.
        assert_eq!(
            conv.messages[1].tool_uses[0].output.as_deref(),
            Some("file1.txt\nfile2.txt"),
            "Tool output should be extracted from tool_result JSONL line"
        );
        assert!(
            conv.messages[1].tool_uses[0].success,
            "Tool without is_error should default to success"
        );
    }

    #[test]
    fn test_content_offset_interleaved_text_and_tools() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Single assistant message with interleaved text → tool → text → tool → text
        let path = ws_dir.join("interleaved-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"do stuff"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"First."},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}},{"type":"text","text":"Second."},{"type":"tool_use","id":"t2","name":"Read","input":{"path":"a.txt"}},{"type":"text","text":"Third."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("interleaved-session", None)
            .expect("load")
            .expect("not found");

        // Should have 1 user + 1 assistant message
        assert_eq!(conv.messages.len(), 2);
        let assistant = &conv.messages[1];

        // Content should be all text parts joined: "First.\nSecond.\nThird."
        assert_eq!(assistant.content, "First.\nSecond.\nThird.");
        assert_eq!(assistant.tool_uses.len(), 2);

        // t1 appears after "First." (6 UTF-16 code units)
        assert_eq!(assistant.tool_uses[0].id, "t1");
        assert_eq!(assistant.tool_uses[0].content_offset, Some(6));

        // t2 appears after "First.\nSecond." (6 + 1 + 7 = 14 UTF-16 code units)
        assert_eq!(assistant.tool_uses[1].id, "t2");
        assert_eq!(assistant.tool_uses[1].content_offset, Some(14));
    }

    /// Verify content_offset uses UTF-16 code units, not UTF-8 bytes.
    /// JavaScript's string.slice() indexes by UTF-16 code units, so offsets
    /// must match that encoding. Multi-byte UTF-8 characters (em dashes,
    /// smart quotes, emojis) would produce wrong offsets if counted as bytes.
    #[test]
    fn test_content_offset_uses_utf16_not_bytes() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Text contains an em dash (U+2014): 3 bytes UTF-8, 1 UTF-16 code unit
        // "Hello — world" = 13 UTF-16 code units, but 15 UTF-8 bytes
        let path = ws_dir.join("utf16-offset-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"test"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hello — world."},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}},{"type":"text","text":"After tool."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("utf16-offset-session", None)
            .expect("load")
            .expect("not found");

        let assistant = &conv.messages[1];
        assert_eq!(assistant.content, "Hello \u{2014} world.\nAfter tool.");
        assert_eq!(assistant.tool_uses.len(), 1);

        // "Hello — world." = 14 UTF-16 code units (not 16 UTF-8 bytes)
        // If this were byte-counted, it would be 16 and JS slice(0, 16) would
        // cut 2 chars into "After tool.", splitting text incorrectly.
        assert_eq!(assistant.tool_uses[0].content_offset, Some(14));
    }

    /// Verify content_offset is correct after absorb_assistant_message merges
    /// consecutive JSONL lines containing multi-byte characters.
    #[test]
    fn test_content_offset_utf16_across_merged_lines() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Simulate SDK output: separate JSONL lines for text and tool_use
        // Text contains em dashes (3 bytes each, 1 UTF-16 code unit each)
        let path = ws_dir.join("utf16-merge-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"test"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            // First assistant line: text with em dash "path — when"
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"streaming path — done."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            // Second assistant line: tool_use (gets merged)
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Grep","input":{"pattern":"test"}}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            // Third assistant line: more text (gets merged)
            r#"{"type":"assistant","uuid":"a3","message":{"role":"assistant","content":[{"type":"text","text":"After grep."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("utf16-merge-session", None)
            .expect("load")
            .expect("not found");

        // Should merge into 1 user + 1 assistant
        assert_eq!(conv.messages.len(), 2);
        let assistant = &conv.messages[1];
        assert_eq!(
            assistant.content,
            "streaming path \u{2014} done.\nAfter grep."
        );

        // "streaming path — done." = 22 UTF-16 code units
        // (not 24 UTF-8 bytes — the em dash is 3 bytes but 1 code unit)
        assert_eq!(assistant.tool_uses[0].content_offset, Some(22));
    }

    #[test]
    fn test_workspace_isolation() {
        let (manager, _temp) = create_test_manager();

        let ws1_dir = manager.workspace_dir(Some("/workspace/one"));
        let ws2_dir = manager.workspace_dir(Some("/workspace/two"));
        fs::create_dir_all(&ws1_dir).expect("mkdir ws1");
        fs::create_dir_all(&ws2_dir).expect("mkdir ws2");

        fs::write(
            ws1_dir.join("s1.jsonl"),
            jsonl_content(&[r#"{"type":"summary","summary":"WS1 Chat","leafUuid":""}"#]),
        )
        .expect("write ws1");

        fs::write(
            ws2_dir.join("s2.jsonl"),
            jsonl_content(&[r#"{"type":"summary","summary":"WS2 Chat","leafUuid":""}"#]),
        )
        .expect("write ws2");

        let ws1 = manager
            .load_summaries_for_workspace(Some("/workspace/one"))
            .expect("load");
        let ws2 = manager
            .load_summaries_for_workspace(Some("/workspace/two"))
            .expect("load");

        assert_eq!(ws1.len(), 1);
        assert_eq!(ws1[0].title, "WS1 Chat");
        assert_eq!(ws2.len(), 1);
        assert_eq!(ws2[0].title, "WS2 Chat");
    }

    // ============================================================================
    // User content cleaning tests (file context, command XML, content blocks)
    // ============================================================================

    #[test]
    fn test_content_blocks_extracts_last_text_block() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Message with multiple text blocks: file context first, user text last
        let path = ws_dir.join("blocks-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":[{"type":"text","text":"The user has attached the following files for context. Use your Read tool to read them if needed:\n- /src/main.rs"},{"type":"text","text":"what does this do?"}]},"cwd":"/test","sessionId":"blocks-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"It's the entry point."}]},"cwd":"/test","sessionId":"blocks-session","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("blocks-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 2);
        // Should only contain the last text block (user's original text)
        assert_eq!(conv.messages[0].content, "what does this do?");
    }

    #[test]
    fn test_strip_file_context_prefix_from_old_message() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Old-style message with file context prepended as a plain string
        let path = ws_dir.join("old-file-context.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"The user has attached the following files for context. Use your Read tool to read them if needed:\n- /src/main.rs\n\nwhat does this do?"},"cwd":"/test","sessionId":"old-file-context","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"It's the entry point."}]},"cwd":"/test","sessionId":"old-file-context","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("old-file-context", None)
            .expect("load")
            .expect("not found");

        // Should strip the file context prefix, leaving only user's text
        assert_eq!(conv.messages[0].content, "what does this do?");
    }

    #[test]
    fn test_strip_sdk_command_xml_tags() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // SDK stores slash commands with XML wrapping
        let path = ws_dir.join("cmd-xml-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"<command-name>/init</command-name>\n<command-message>init</command-message>"},"cwd":"/test","sessionId":"cmd-xml-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Analyzing codebase..."}]},"cwd":"/test","sessionId":"cmd-xml-session","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("cmd-xml-session", None)
            .expect("load")
            .expect("not found");

        // Should extract command name from XML, not show raw tags
        assert_eq!(conv.messages[0].content, "/init");
    }

    #[test]
    fn test_strip_sdk_command_xml_preserves_command_args() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Real SDK format for skill invocations (v2.1.44+):
        // <command-message> = bare name, <command-name> = /name, <command-args> = user text
        // The user typed "/web-animation-design load this"
        let path = ws_dir.join("cmd-with-args.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"<command-message>web-animation-design</command-message>\n<command-name>/web-animation-design</command-name>\n<command-args>load this</command-args>"},"cwd":"/test","sessionId":"cmd-with-args","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Loading skill..."}]},"cwd":"/test","sessionId":"cmd-with-args","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("cmd-with-args", None)
            .expect("load")
            .expect("not found");

        // Should preserve both command name AND user's args text
        assert_eq!(conv.messages[0].content, "/web-animation-design load this");
    }

    #[test]
    fn test_strip_sdk_command_xml_no_args() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Skill invocation with no extra user text (just "/skill-name")
        let path = ws_dir.join("cmd-no-args.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"<command-message>web-animation-design</command-message>\n<command-name>/web-animation-design</command-name>"},"cwd":"/test","sessionId":"cmd-no-args","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Loading skill..."}]},"cwd":"/test","sessionId":"cmd-no-args","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("cmd-no-args", None)
            .expect("load")
            .expect("not found");

        // No args → just the command name
        assert_eq!(conv.messages[0].content, "/web-animation-design");
    }

    #[test]
    fn test_sdk_meta_messages_filtered_out() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // SDK stores slash commands as TWO user messages:
        // 1. The command text with XML tags (isMeta absent or false)
        // 2. The expanded prompt with isMeta: true
        // Only the first should appear as a chat message.
        // All lines have parentUuid (real SDK format) so chain filtering is active.
        let path = ws_dir.join("meta-session.jsonl");
        let lines = [
            r#"{"parentUuid":null,"type":"user","uuid":"u1","message":{"role":"user","content":"<command-name>/init</command-name>\n<command-message>init</command-message>"},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"parentUuid":"u1","type":"user","uuid":"u2","isMeta":true,"message":{"role":"user","content":[{"type":"text","text":"Please analyze this codebase and create a CLAUDE.md file..."}]},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"parentUuid":"u2","type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"I'll analyze the codebase."}]},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("meta-session", None)
            .expect("load")
            .expect("not found");

        // Should have 2 messages: command + assistant response (meta message filtered out)
        assert_eq!(conv.messages.len(), 2);
        assert_eq!(conv.messages[0].content, "/init");
        assert_eq!(conv.messages[0].role, MessageRole::User);
        assert_eq!(conv.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn test_plain_text_message_unchanged() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Normal plain text message should pass through unchanged
        let path = ws_dir.join("plain-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello world"},"cwd":"/test","sessionId":"plain-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]},"cwd":"/test","sessionId":"plain-session","timestamp":"2026-02-07T12:00:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("plain-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages[0].content, "hello world");
    }

    #[test]
    fn test_sidebar_title_strips_file_context() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Conversation with no summary — title falls back to first user message.
        // Old-style file context prefix should be stripped from sidebar title.
        let path = ws_dir.join("sidebar-strip.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"The user has attached the following files for context. Use your Read tool to read them if needed:\n- /src/main.rs\n\nreview this file"},"cwd":"/test","sessionId":"sidebar-strip","timestamp":"2026-02-07T12:00:00.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        let s = summaries.iter().find(|s| s.session_id == "sidebar-strip");
        assert_eq!(s.expect("found").title, "review this file");
    }

    #[test]
    fn test_sidebar_title_strips_command_xml() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // No summary — title falls back to first user message with SDK command XML
        let path = ws_dir.join("sidebar-cmd.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"<command-name>/review-branch</command-name>\n<command-message>review-branch</command-message>"},"cwd":"/test","sessionId":"sidebar-cmd","timestamp":"2026-02-07T12:00:00.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");
        let s = summaries.iter().find(|s| s.session_id == "sidebar-cmd");
        assert_eq!(s.expect("found").title, "/review-branch");
    }

    #[test]
    fn test_file_history_snapshot_only_excluded_from_summaries() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Create a real conversation
        fs::write(
            ws_dir.join("real-chat.jsonl"),
            jsonl_content(&[
                r#"{"type":"summary","summary":"Real Chat","leafUuid":""}"#,
                r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"real-chat","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            ]),
        )
        .expect("write real chat");

        // Create a file-history-snapshot-only file (SDK checkpoint artifact)
        fs::write(
            ws_dir.join("snapshot-only.jsonl"),
            jsonl_content(&[
                r#"{"type":"file-history-snapshot","messageId":"m1","snapshot":{},"isSnapshotUpdate":false}"#,
                r#"{"type":"file-history-snapshot","messageId":"m2","snapshot":{"files":["/test.py"]},"isSnapshotUpdate":true}"#,
            ]),
        )
        .expect("write snapshot file");

        // Create an empty file (should also be excluded)
        fs::write(ws_dir.join("empty.jsonl"), "").expect("write empty");

        let summaries = manager
            .load_summaries_for_workspace(None)
            .expect("load summaries");

        // Only the real conversation should appear — snapshot-only and empty files excluded
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].title, "Real Chat");
    }

    #[test]
    fn test_sdk_interrupt_marker_and_empty_user_messages_filtered() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Scenario: user sends a message, assistant responds, gets interrupted (rewind or stop),
        // SDK writes "[Request interrupted by user]" as a synthetic user message, then a new
        // user message follows. Also include an empty user message edge case.
        let path = ws_dir.join("interrupt-filter.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Working on it..."}],"stop_reason":"max_tokens"},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:01.000Z"}"#,
            // SDK interrupt marker — should be filtered out
            r#"{"type":"user","uuid":"u-int","message":{"role":"user","content":"[Request interrupted by user]"},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:02.000Z"}"#,
            // Empty user message — should be filtered out
            r#"{"type":"user","uuid":"u-empty","message":{"role":"user","content":""},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:03.000Z"}"#,
            // Real follow-up message — should be kept
            r#"{"type":"user","uuid":"u2","message":{"role":"user","content":"try again"},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:04.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Done!"}]},"cwd":"/test","sessionId":"interrupt-filter","timestamp":"2026-02-09T12:00:05.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("interrupt-filter", None)
            .expect("load")
            .expect("not found");

        // Should have exactly 4 messages: u1, a1, u2, a2
        // The interrupt marker (u-int) and empty message (u-empty) should be gone.
        assert_eq!(conv.messages.len(), 4);
        assert_eq!(conv.messages[0].content, "hello");
        assert_eq!(conv.messages[0].role, MessageRole::User);
        assert_eq!(conv.messages[1].content, "Working on it...");
        assert_eq!(conv.messages[1].role, MessageRole::Assistant);
        assert!(conv.messages[1].is_interrupted == Some(true));
        assert_eq!(conv.messages[2].content, "try again");
        assert_eq!(conv.messages[2].role, MessageRole::User);
        assert_eq!(conv.messages[3].content, "Done!");
        assert_eq!(conv.messages[3].role, MessageRole::Assistant);
    }

    #[test]
    fn test_interrupt_detected_from_sdk_marker_without_stop_reason() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // In streaming input mode, stop_reason is null for ALL assistant messages.
        // The only reliable interrupt signal is the SDK's synthetic user message
        // "[Request interrupted by user]" or "[Request interrupted by user for tool use]".
        let path = ws_dir.join("interrupt-null-sr.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:00.000Z"}"#,
            // stop_reason is null — same as normal completion in streaming mode
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Let me search..."}],"stop_reason":null},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:01.000Z"}"#,
            // SDK interrupt marker for tool use — should mark a1 as interrupted
            r#"{"type":"user","uuid":"u-int","message":{"role":"user","content":"[Request interrupted by user for tool use]"},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:02.000Z"}"#,
            r#"{"type":"user","uuid":"u2","message":{"role":"user","content":"go on"},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Done!"}],"stop_reason":null},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("interrupt-null-sr", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 4); // u1, a1, u2, a2
        assert_eq!(conv.messages[1].content, "Let me search...");
        assert_eq!(
            conv.messages[1].is_interrupted,
            Some(true),
            "Interrupt should be detected from SDK marker even with stop_reason:null"
        );
        // The non-interrupted assistant should NOT be marked
        assert_eq!(conv.messages[3].content, "Done!");
        assert_eq!(
            conv.messages[3].is_interrupted, None,
            "Non-interrupted assistant should not be marked"
        );
    }

    #[test]
    fn test_interrupt_marker_creates_merge_boundary_before_placeholder_response() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // tool_result and interrupt markers are protocol lines consumed by the parser.
        // After filtering, assistant a1 and a2 become adjacent; interrupt must force
        // a merge boundary so "No response requested." stays on its own message.
        let path = ws_dir.join("interrupt-boundary.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"ask me"},"cwd":"/test","sessionId":"interrupt-boundary","timestamp":"2026-02-26T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Need user input."},{"type":"tool_use","id":"ask_1","name":"AskUserQuestion","input":{"questions":[{"question":"Proceed?"}]}}]},"cwd":"/test","sessionId":"interrupt-boundary","timestamp":"2026-02-26T12:00:01.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"ask_1","content":"User declined to answer","is_error":true}]},"cwd":"/test","sessionId":"interrupt-boundary","timestamp":"2026-02-26T12:00:02.000Z"}"#,
            r#"{"type":"user","uuid":"u-int","message":{"role":"user","content":"[Request interrupted by user for tool use]"},"cwd":"/test","sessionId":"interrupt-boundary","timestamp":"2026-02-26T12:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"No response requested."}]},"cwd":"/test","sessionId":"interrupt-boundary","timestamp":"2026-02-26T12:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("interrupt-boundary", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 3);
        assert_eq!(conv.messages[0].id, "u1");

        let interrupted = &conv.messages[1];
        assert_eq!(interrupted.id, "a1");
        assert_eq!(interrupted.role, MessageRole::Assistant);
        assert_eq!(interrupted.is_interrupted, Some(true));
        assert_eq!(interrupted.tool_uses.len(), 1);
        assert_eq!(interrupted.tool_uses[0].name, "AskUserQuestion");
        assert_eq!(
            interrupted.tool_uses[0].output.as_deref(),
            Some("User declined to answer")
        );
        assert!(
            !interrupted.tool_uses[0].success,
            "Tool result with is_error:true should mark tool success=false"
        );

        let placeholder = &conv.messages[2];
        assert_eq!(placeholder.id, "a2");
        assert_eq!(placeholder.role, MessageRole::Assistant);
        assert_eq!(placeholder.content, "No response requested.");
        assert!(
            placeholder.tool_uses.is_empty(),
            "Placeholder continuation should remain a standalone assistant message"
        );
    }

    #[test]
    fn test_tool_result_does_not_create_merge_boundary() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Normal tool flow must keep merging across tool_result:
        // assistant(tool_use) -> user(tool_result) -> assistant(text continuation)
        let path = ws_dir.join("tool-result-merge.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"run ls"},"cwd":"/test","sessionId":"tool-result-merge","timestamp":"2026-02-26T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/test","sessionId":"tool-result-merge","timestamp":"2026-02-26T12:00:01.000Z"}"#,
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt"}]},"cwd":"/test","sessionId":"tool-result-merge","timestamp":"2026-02-26T12:00:02.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Found file1.txt"}]},"cwd":"/test","sessionId":"tool-result-merge","timestamp":"2026-02-26T12:00:03.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("tool-result-merge", None)
            .expect("load")
            .expect("not found");

        // Expect one merged assistant turn; tool_result alone must not split it.
        assert_eq!(conv.messages.len(), 2);
        assert_eq!(conv.messages[0].id, "u1");
        let assistant = &conv.messages[1];
        assert_eq!(assistant.role, MessageRole::Assistant);
        assert_eq!(assistant.id, "a1");
        assert_eq!(assistant.content, "Found file1.txt");
        assert_eq!(assistant.tool_uses.len(), 1);
        assert_eq!(assistant.tool_uses[0].name, "Bash");
        assert_eq!(assistant.tool_uses[0].output.as_deref(), Some("file1.txt"));
    }

    #[test]
    fn test_turn_duration_from_system_line() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        let path = ws_dir.join("turn-dur.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"stop_reason":null},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:01.000Z"}"#,
            // turn_duration system line — should be applied to a1
            r#"{"type":"system","subtype":"turn_duration","durationMs":82261,"uuid":"s1","timestamp":"2026-02-17T12:00:03.000Z"}"#,
            r#"{"type":"user","uuid":"u2","message":{"role":"user","content":"thanks"},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:04.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Welcome!"}],"stop_reason":null},"cwd":"/test","sessionId":"s","timestamp":"2026-02-17T12:00:05.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("turn-dur", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 4); // u1, a1, u2, a2
        assert_eq!(
            conv.messages[1].turn_duration_ms,
            Some(82261),
            "turn_duration_ms should be set from system line"
        );
        assert_eq!(
            conv.messages[3].turn_duration_ms, None,
            "Second assistant should have no turn_duration_ms (no system line for it)"
        );
    }

    // ============================================================================
    // Active chain filtering (parentUuid branch resolution for rewind)
    // ============================================================================

    /// Assert a message matches expected id, content, role, and parent_uuid.
    fn assert_msg(msg: &Message, id: &str, content: &str, role: MessageRole, parent: Option<&str>) {
        assert_eq!(msg.id, id);
        assert_eq!(msg.content, content);
        assert_eq!(msg.role, role);
        assert_eq!(msg.parent_uuid.as_deref(), parent);
    }

    #[test]
    fn test_active_chain_after_rewind() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Branch 1 (original): u1→sys1→a1→sys2→u2→sys3→a2
        // Branch 2 (rewind to a1): u3→sys4→a3
        // Active chain: u1, a1, u3, a3 — dead branch (u2, a2) filtered out.
        let path = ws_dir.join("branched-session.jsonl");
        let lines = [
            r#"{"type":"summary","summary":"Branched Chat","leafUuid":"a3"}"#,
            r#"{"parentUuid":null,"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"parentUuid":"u1","type":"system","uuid":"sys1","message":{},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:00.500Z"}"#,
            r#"{"parentUuid":"sys1","type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"parentUuid":"a1","type":"system","uuid":"sys2","message":{},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:01.500Z"}"#,
            r#"{"parentUuid":"sys2","type":"user","uuid":"u2","message":{"role":"user","content":"how are you"},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"parentUuid":"u2","type":"system","uuid":"sys3","message":{},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:02.500Z"}"#,
            r#"{"parentUuid":"sys3","type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"I'm doing well!"}]},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"parentUuid":"a1","type":"user","uuid":"u3","message":{"role":"user","content":"actually, what's up"},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:01:00.000Z"}"#,
            r#"{"parentUuid":"u3","type":"system","uuid":"sys4","message":{},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:01:00.500Z"}"#,
            r#"{"parentUuid":"sys4","type":"assistant","uuid":"a3","message":{"role":"assistant","content":[{"type":"text","text":"Not much, just chilling!"}]},"cwd":"/test","sessionId":"branched-session","timestamp":"2026-01-11T18:01:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("branched-session", None)
            .expect("load")
            .expect("not found");

        assert_eq!(conv.messages.len(), 4);
        assert_msg(&conv.messages[0], "u1", "hello", MessageRole::User, None);
        assert_msg(
            &conv.messages[1],
            "a1",
            "Hi there!",
            MessageRole::Assistant,
            Some("u1"),
        );
        assert_msg(
            &conv.messages[2],
            "u3",
            "actually, what's up",
            MessageRole::User,
            Some("a1"),
        );
        assert_msg(
            &conv.messages[3],
            "a3",
            "Not much, just chilling!",
            MessageRole::Assistant,
            Some("u3"),
        );
    }

    #[test]
    fn test_unbranched_conversation_returns_all_messages() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Legacy conversation with no parentUuid fields — all messages should be returned
        let path = ws_dir.join("unbranched-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"unbranched-session","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]},"cwd":"/test","sessionId":"unbranched-session","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"user","uuid":"u2","message":{"role":"user","content":"goodbye"},"cwd":"/test","sessionId":"unbranched-session","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Bye!"}]},"cwd":"/test","sessionId":"unbranched-session","timestamp":"2026-01-11T18:00:03.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("unbranched-session", None)
            .expect("load")
            .expect("not found");

        // All 4 messages should be present (no filtering for legacy conversations)
        assert_eq!(conv.messages.len(), 4);
        assert_eq!(conv.messages[0].content, "hello");
        assert_eq!(conv.messages[1].content, "Hi!");
        assert_eq!(conv.messages[2].content, "goodbye");
        assert_eq!(conv.messages[3].content, "Bye!");
    }

    #[test]
    fn test_dangling_parent_chain_falls_back_instead_of_empty_conversation() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Simulates rewind cleanup removing an intermediate UUID line while a later
        // interrupt marker still points to it. The active chain is dangling:
        // intr1 -> missing-empty-uuid (not present in file).
        let path = ws_dir.join("dangling-parent.jsonl");
        let lines = [
            r#"{"parentUuid":null,"type":"user","uuid":"u1","message":{"role":"user","content":"hello"},"cwd":"/test","sessionId":"dangling-parent","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"parentUuid":"u1","type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"cwd":"/test","sessionId":"dangling-parent","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"parentUuid":"a1","type":"user","uuid":"u2","message":{"role":"user","content":"next"},"cwd":"/test","sessionId":"dangling-parent","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"parentUuid":"u2","type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Done"}]},"cwd":"/test","sessionId":"dangling-parent","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"parentUuid":"missing-empty-uuid","type":"user","uuid":"intr1","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]},"cwd":"/test","sessionId":"dangling-parent","timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("dangling-parent", None)
            .expect("load")
            .expect("not found");

        // Interrupt marker itself is consumed as metadata; the real turns remain visible.
        assert_eq!(conv.messages.len(), 4);
        assert_eq!(conv.messages[0].id, "u1");
        assert_eq!(conv.messages[1].id, "a1");
        assert_eq!(conv.messages[2].id, "u2");
        assert_eq!(conv.messages[3].id, "a2");
    }

    #[test]
    fn test_double_rewind_active_chain() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Simulate two rewinds:
        //
        // Original: u1 → a1 → u2 → a2
        // Rewind 1 (to a1): u3 → a3  (u2, a2 dead)
        // Rewind 2 (to a1): u4 → a4  (u3, a3 also dead)
        //
        // Active: u1, a1, u4, a4
        let path = ws_dir.join("double-rewind.jsonl");
        let lines = [
            // Original branch
            r#"{"parentUuid":null,"type":"user","uuid":"u1","message":{"role":"user","content":"msg 1"},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"parentUuid":"u1","type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"response 1"}]},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"parentUuid":"a1","type":"user","uuid":"u2","message":{"role":"user","content":"msg 2"},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"parentUuid":"u2","type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"response 2"}]},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            // Rewind 1: fork from a1
            r#"{"parentUuid":"a1","type":"user","uuid":"u3","message":{"role":"user","content":"msg 3 (rewind 1)"},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:01:00.000Z"}"#,
            r#"{"parentUuid":"u3","type":"assistant","uuid":"a3","message":{"role":"assistant","content":[{"type":"text","text":"response 3"}]},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:01:01.000Z"}"#,
            // Rewind 2: fork from a1 again (abandoning rewind 1's branch too)
            r#"{"parentUuid":"a1","type":"user","uuid":"u4","message":{"role":"user","content":"msg 4 (rewind 2)"},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:02:00.000Z"}"#,
            r#"{"parentUuid":"u4","type":"assistant","uuid":"a4","message":{"role":"assistant","content":[{"type":"text","text":"response 4"}]},"cwd":"/test","sessionId":"double-rewind","timestamp":"2026-01-11T18:02:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("double-rewind", None)
            .expect("load")
            .expect("not found");

        // Active: u1, a1, u4, a4 (both original tail and rewind 1 are dead)
        assert_eq!(conv.messages.len(), 4);
        assert_eq!(conv.messages[0].id, "u1");
        assert_eq!(conv.messages[0].content, "msg 1");
        assert_eq!(conv.messages[1].id, "a1");
        assert_eq!(conv.messages[1].content, "response 1");
        assert_eq!(conv.messages[2].id, "u4");
        assert_eq!(conv.messages[2].content, "msg 4 (rewind 2)");
        assert_eq!(conv.messages[3].id, "a4");
        assert_eq!(conv.messages[3].content, "response 4");
    }

    #[test]
    fn test_active_chain_with_tool_results_and_merge() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Branched conversation with tool results on active branch
        // Tool results from the dead branch should be filtered out
        let path = ws_dir.join("branched-tools.jsonl");
        let lines = [
            r#"{"parentUuid":null,"type":"user","uuid":"u1","message":{"role":"user","content":"run ls"},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:00.000Z"}"#,
            r#"{"parentUuid":"u1","type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Sure!"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            // tool_result on active branch (parentUuid points to a1)
            r#"{"parentUuid":"a1","type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt"}]},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            r#"{"parentUuid":"tr1","type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"Found file1.txt"}]},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            // Dead branch: user2 after a2 (will be pruned by rewind)
            r#"{"parentUuid":"a2","type":"user","uuid":"u2","message":{"role":"user","content":"dead branch msg"},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:04.000Z"}"#,
            r#"{"parentUuid":"u2","type":"assistant","uuid":"a3-dead","message":{"role":"assistant","content":[{"type":"text","text":"dead response"}]},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:00:05.000Z"}"#,
            // Rewind: fork from a2
            r#"{"parentUuid":"a2","type":"user","uuid":"u3","message":{"role":"user","content":"new after rewind"},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:01:00.000Z"}"#,
            r#"{"parentUuid":"u3","type":"assistant","uuid":"a4","message":{"role":"assistant","content":[{"type":"text","text":"Fresh start!"}]},"cwd":"/test","sessionId":"branched-tools","timestamp":"2026-01-11T18:01:01.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("branched-tools", None)
            .expect("load")
            .expect("not found");

        // Active: u1, a1+a2 (merged), u3, a4
        // Tool result tr1 is consumed by backfill, dead branch (u2, a3-dead) gone
        assert_eq!(conv.messages.len(), 4);
        assert_eq!(conv.messages[0].id, "u1");
        assert_eq!(conv.messages[0].content, "run ls");

        // a1 and a2 merged (consecutive assistants)
        assert_eq!(conv.messages[1].role, MessageRole::Assistant);
        assert!(conv.messages[1].content.contains("Sure!"));
        assert!(conv.messages[1].content.contains("Found file1.txt"));
        assert_eq!(conv.messages[1].tool_uses.len(), 1);
        assert_eq!(
            conv.messages[1].tool_uses[0].output.as_deref(),
            Some("file1.txt")
        );

        assert_eq!(conv.messages[2].id, "u3");
        assert_eq!(conv.messages[2].content, "new after rewind");
        assert_eq!(conv.messages[3].id, "a4");
        assert_eq!(conv.messages[3].content, "Fresh start!");
    }
}
