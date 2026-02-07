//! Orbit Conversations — pure disk reader for Claude Code JSONL files.
//!
//! The Claude Agent SDK writes JSONL files to `~/.claude/projects/`. This crate
//! **reads** them. It never caches, never writes (except fork). The frontend
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
use std::io::{BufRead as _, BufReader, ErrorKind, Read as _, Seek as _, SeekFrom};
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
    /// Whether this message was interrupted by the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_interrupted: Option<bool>,
    /// Timestamp when the message was created (Unix epoch milliseconds)
    pub created_at: u64,
    /// Tool uses in this message
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_uses: Vec<ToolUse>,
    /// Token usage for this message (assistant messages only)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
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
    /// Catch-all for system, file-history-snapshot, tool_result, etc.
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

    /// Check if this content is purely tool_result blocks (SDK protocol, not real user text).
    fn is_tool_result_only(&self) -> bool {
        match self {
            Self::Text(_) => false,
            Self::Blocks(blocks) => {
                !blocks.is_empty()
                    && blocks.iter().all(|b| {
                        b.get("type").and_then(serde_json::Value::as_str) == Some("tool_result")
                    })
            },
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
        let messages = merge_consecutive_assistants(parsed.raw_messages);

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

    /// No-op. The Claude Agent SDK handles JSONL persistence.
    pub fn add_message(
        &self,
        _session_id: &str,
        _message: Message,
        _workspace_path: Option<&str>,
        _worktree_path: Option<&str>,
    ) -> Result<()> {
        Ok(())
    }

    /// No-op. The Claude Agent SDK manages its own summary/custom-title lines.
    pub fn update_title(&self, _session_id: &str, _title: String) -> Result<()> {
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
    let (text, thinking, tool_uses) = extract_assistant_content(value);
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
        is_interrupted: is_interrupted.then_some(true),
        created_at: ts,
        tool_uses,
        usage,
    }
}

/// Parse JSONL lines from a reader, collecting messages and metadata.
fn parse_jsonl_lines(reader: BufReader<fs::File>, path: &Path) -> ParsedJsonl {
    let mut raw_messages: Vec<Message> = Vec::new();
    let mut seen_uuids: HashMap<String, usize> = HashMap::new();
    let mut title = String::from("Untitled");
    let mut first_user_text: Option<String> = None;
    let mut first_timestamp: Option<u64> = None;
    let mut last_timestamp: Option<u64> = None;
    // Collect tool results from tool_result-only user messages so we can
    // backfill `output` onto the matching ToolUse entries in assistant messages.
    let mut tool_results: HashMap<String, ToolResultData> = HashMap::new();

    for (line_num, line_result) in reader.lines().enumerate() {
        let Ok(line) = line_result else { continue };
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
                // Skip SDK meta messages (e.g., slash command expansion text).
                // These are internal protocol messages, not real user input.
                if is_meta {
                    continue;
                }
                if payload.content.is_tool_result_only() {
                    extract_tool_results(&payload.content, &mut tool_results);
                    continue;
                }

                let ts = parse_iso_timestamp(&timestamp);
                if first_timestamp.is_none() {
                    first_timestamp = Some(ts);
                }
                last_timestamp = Some(ts);

                let text = payload.content.to_text();
                if first_user_text.is_none() && !text.is_empty() {
                    first_user_text = Some(text.clone());
                }

                let msg = Message {
                    id: uuid.clone(),
                    role: MessageRole::User,
                    content: text,
                    thinking: None,
                    is_interrupted: None,
                    created_at: ts,
                    tool_uses: Vec::new(),
                    usage: None,
                };
                dedup_insert(&mut raw_messages, &mut seen_uuids, uuid, msg);
            },
            Ok(JsonlLine::Assistant {
                uuid,
                message: value,
                timestamp,
                ..
            }) => {
                let ts = timestamp
                    .as_deref()
                    .map_or_else(|| last_timestamp.unwrap_or(0), parse_iso_timestamp);

                if first_timestamp.is_none() {
                    first_timestamp = Some(ts);
                }
                last_timestamp = Some(ts);

                let msg = build_assistant_message(&uuid, &value, ts);
                dedup_insert(&mut raw_messages, &mut seen_uuids, uuid, msg);
            },
            Ok(JsonlLine::Summary { summary, .. }) => {
                title = summary;
            },
            Ok(JsonlLine::CustomTitle { title: t, .. }) => {
                title = t;
            },
            Ok(JsonlLine::Unknown) => {},
            Err(e) => {
                tracing::warn!(
                    "Skipping unparseable JSONL line {} in {}: {}",
                    line_num,
                    path.display(),
                    e
                );
            },
        }
    }

    // Backfill tool outputs onto assistant ToolUse entries.
    backfill_tool_outputs(&mut raw_messages, tool_results);

    // Fall back to first user message text if no summary/custom-title was found.
    if title == "Untitled" {
        if let Some(text) = first_user_text {
            title = if text.len() > 80 {
                format!("{}…", &text[..floor_char_boundary(&text, 77)])
            } else {
                text
            };
        }
    }

    ParsedJsonl {
        raw_messages,
        title,
        first_timestamp,
        last_timestamp,
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

    // For large files, scan the last 4 KB first
    let mut reader = BufReader::new(file);
    let _ = reader.seek(SeekFrom::End(-4096)).ok()?;

    let mut partial = String::new();
    let _ = reader.read_line(&mut partial).ok()?;

    let mut remaining = String::new();
    let _ = reader.read_to_string(&mut remaining).ok()?;

    for line in remaining.lines().rev().filter(|l| !l.trim().is_empty()) {
        if let Some(summary) = parse_title_line(line.trim()) {
            return Some(summary);
        }
    }

    // Fallback: check the first line
    let file2 = fs::File::open(path).ok()?;
    let mut reader2 = BufReader::new(file2);
    let mut first_line = String::new();
    let _ = reader2.read_line(&mut first_line).ok()?;
    if let Some(summary) = parse_title_line(first_line.trim()) {
        return Some(summary);
    }

    // Last resort: first user message content
    let file3 = fs::File::open(path).ok()?;
    let reader3 = BufReader::new(file3);
    for line_result in reader3.lines().take(50) {
        let Ok(line) = line_result else { continue };
        let trimmed = line.trim();
        if let Some(text) = extract_user_text_from_line(trimmed) {
            return Some(text);
        }
    }

    None
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
fn merge_consecutive_assistants(raw: Vec<Message>) -> Vec<Message> {
    let mut merged: Vec<Message> = Vec::with_capacity(raw.len());

    for msg in raw {
        if msg.role == MessageRole::Assistant {
            if let Some(last) = merged.last_mut() {
                if last.role == MessageRole::Assistant {
                    // Record the current text length BEFORE appending so we can
                    // shift the incoming tool offsets by this amount.
                    let base_len = u32::try_from(last.content.len()).unwrap_or(u32::MAX);
                    let incoming_has_text = !msg.content.is_empty();

                    if incoming_has_text {
                        if last.content.is_empty() {
                            last.content = msg.content;
                        } else {
                            last.content.push('\n');
                            last.content.push_str(&msg.content);
                        }
                    }
                    if last.thinking.is_none() {
                        last.thinking = msg.thinking;
                    }

                    // Shift tool content_offsets by the existing text length
                    // (+ 1 for the "\n" separator if we appended text).
                    let shift = if base_len > 0 && incoming_has_text {
                        base_len + 1
                    } else {
                        base_len
                    };
                    for mut tool in msg.tool_uses {
                        tool.content_offset =
                            Some(tool.content_offset.unwrap_or(0).saturating_add(shift));
                        last.tool_uses.push(tool);
                    }

                    if msg.usage.is_some() {
                        last.usage = msg.usage;
                    }
                    if msg.created_at > last.created_at {
                        last.created_at = msg.created_at;
                    }
                    if msg.is_interrupted.is_some() {
                        last.is_interrupted = msg.is_interrupted;
                    }
                    continue;
                }
            }
        }
        merged.push(msg);
    }

    merged
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

/// Extract text content, thinking, and tool uses from an assistant message.
///
/// Tracks the running byte length of concatenated text so each `ToolUse`
/// records the `content_offset` where it appeared in the text stream.
/// The frontend uses this offset to interleave tool widgets between text
/// segments (via `buildSegments`).
fn extract_assistant_content(value: &serde_json::Value) -> (String, Option<String>, Vec<ToolUse>) {
    let mut text_parts: Vec<String> = Vec::new();
    let mut thinking: Option<String> = None;
    let mut tool_uses: Vec<ToolUse> = Vec::new();
    // Running byte length of all text parts joined so far (including "\n" separators).
    let mut text_byte_len: u32 = 0;

    let content = value.get("content");

    if let Some(serde_json::Value::Array(blocks)) = content {
        for block in blocks {
            match block.get("type").and_then(serde_json::Value::as_str) {
                Some("text") => {
                    if let Some(text) = block.get("text").and_then(serde_json::Value::as_str) {
                        if !text_parts.is_empty() {
                            // Account for the "\n" join separator
                            text_byte_len += 1;
                        }
                        text_byte_len += u32::try_from(text.len()).unwrap_or(u32::MAX);
                        text_parts.push(text.to_owned());
                    }
                },
                Some("thinking") => {
                    if let Some(text) = block.get("thinking").and_then(serde_json::Value::as_str) {
                        thinking = Some(text.to_owned());
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
                        content_offset: Some(text_byte_len),
                    });
                },
                _ => {},
            }
        }
    } else if let Some(serde_json::Value::String(s)) = content {
        text_parts.push(s.clone());
    }

    (text_parts.join("\n"), thinking, tool_uses)
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
/// When the Claude SDK handles slash commands from `.claude/commands/` natively,
/// it stores the user message with XML wrapping:
///   `<command-name>/init</command-name>\n<command-message>init</command-message>`
///
/// For display, we extract just the command name (e.g., `/init`).
fn strip_sdk_command_xml(s: &str) -> String {
    const TAG_OPEN: &str = "<command-name>";
    const TAG_CLOSE: &str = "</command-name>";

    if let Some(start) = s.find(TAG_OPEN) {
        if let Some(end) = s.find(TAG_CLOSE) {
            let name_start = start + TAG_OPEN.len();
            if name_start < end {
                return s[name_start..end].to_owned();
            }
        }
    }
    s.to_owned()
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
    fn test_add_message_is_noop() {
        let (manager, _temp) = create_test_manager();

        let msg = Message {
            id: "m1".to_owned(),
            role: MessageRole::User,
            content: "Hello".to_owned(),
            thinking: None,
            is_interrupted: None,
            created_at: current_timestamp(),
            tool_uses: Vec::new(),
            usage: None,
        };

        // Should succeed silently
        manager
            .add_message("session-1", msg, None, None)
            .expect("add_message should be a no-op");
    }

    #[test]
    fn test_update_title_is_noop() {
        let (manager, _temp) = create_test_manager();

        manager
            .update_title("session-1", "New Title".to_owned())
            .expect("update_title should be a no-op");
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
    fn test_tool_output_backfill_multiple_tools_with_error() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // Assistant uses two tools: Bash (succeeds) and Read (fails with is_error).
        // Both tool_result lines appear as separate user messages.
        let path = ws_dir.join("multi-tool-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"check files"},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:01.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"Let me check."},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"/missing.txt"}}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:02.000Z"}"#,
            // Both tool results in one user message (SDK batches them)
            r#"{"type":"user","uuid":"tr1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file1.txt\nfile2.txt"},{"type":"tool_result","tool_use_id":"t2","content":"Error: file not found","is_error":true}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:03.000Z"}"#,
            r#"{"type":"assistant","uuid":"a2","message":{"role":"assistant","content":[{"type":"text","text":"The file doesn't exist."}]},"cwd":"/test","sessionId":"s","timestamp":"2026-01-11T18:00:04.000Z"}"#,
        ];
        fs::write(&path, jsonl_content(&lines)).expect("write");

        let conv = manager
            .load_from_workspace("multi-tool-session", None)
            .expect("load")
            .expect("not found");

        // user + merged assistant
        assert_eq!(conv.messages.len(), 2);
        let assistant = &conv.messages[1];
        assert_eq!(assistant.tool_uses.len(), 2);

        // First tool: Bash succeeded
        assert_eq!(assistant.tool_uses[0].name, "Bash");
        assert_eq!(
            assistant.tool_uses[0].output.as_deref(),
            Some("file1.txt\nfile2.txt")
        );
        assert!(assistant.tool_uses[0].success);

        // Second tool: Read failed
        assert_eq!(assistant.tool_uses[1].name, "Read");
        assert_eq!(
            assistant.tool_uses[1].output.as_deref(),
            Some("Error: file not found")
        );
        assert!(
            !assistant.tool_uses[1].success,
            "Tool with is_error:true should have success=false"
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

        // t1 appears after "First." (6 bytes)
        assert_eq!(assistant.tool_uses[0].id, "t1");
        assert_eq!(assistant.tool_uses[0].content_offset, Some(6));

        // t2 appears after "First.\nSecond." (6 + 1 + 7 = 14 bytes)
        assert_eq!(assistant.tool_uses[1].id, "t2");
        assert_eq!(assistant.tool_uses[1].content_offset, Some(14));
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
    fn test_sdk_meta_messages_filtered_out() {
        let (manager, _temp) = create_test_manager();
        let ws_dir = manager.workspace_dir(None);
        fs::create_dir_all(&ws_dir).expect("mkdir");

        // SDK stores slash commands as TWO user messages:
        // 1. The command text with XML tags (isMeta absent or false)
        // 2. The expanded prompt with isMeta: true
        // Only the first should appear as a chat message.
        let path = ws_dir.join("meta-session.jsonl");
        let lines = [
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"<command-name>/init</command-name>\n<command-message>init</command-message>"},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"user","uuid":"u2","parentUuid":"u1","isMeta":true,"message":{"role":"user","content":[{"type":"text","text":"Please analyze this codebase and create a CLAUDE.md file..."}]},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:00.000Z"}"#,
            r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"I'll analyze the codebase."}]},"cwd":"/test","sessionId":"meta-session","timestamp":"2026-02-07T12:00:01.000Z"}"#,
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
}
