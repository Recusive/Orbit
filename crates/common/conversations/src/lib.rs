//! Orbit Conversations - Chat history persistence
//!
//! This crate handles saving and loading conversation history for the Orbit editor.
//!
//! # Storage Location (Claude Code Style)
//!
//! Conversations are stored in platform-specific data directories, organized by workspace:
//! - macOS: `~/Library/Application Support/orbit/projects/{encoded-workspace}/`
//! - Linux: `~/.local/share/orbit/projects/{encoded-workspace}/`
//! - Windows: `%APPDATA%/orbit/projects/{encoded-workspace}/`
//!
//! The workspace path is encoded by replacing `/` with `-` (Claude Code pattern).
//! Example: `/Users/pranit/Desktop/orbit` → `-Users-pranit-Desktop-orbit`
//!
//! Each conversation is stored as a separate JSON file named by its session ID.
//! This folder-based isolation ensures sessions are automatically scoped to their workspace.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process;

use directories::ProjectDirs;
use orbit_core::{Error, Result};
use parking_lot::RwLock;
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
}

impl Conversation {
    /// Create a new empty conversation.
    ///
    /// # Arguments
    ///
    /// * `session_id` - Unique identifier for this conversation
    /// * `title` - Display title shown in the sidebar
    /// * `workspace_path` - Root workspace path (e.g., the main git repo directory)
    /// * `worktree_path` - Optional git worktree path for multi-agent isolation.
    ///   When set, this conversation is associated with a specific worktree,
    ///   enabling developers to work on multiple branches simultaneously with
    ///   isolated conversation histories per worktree.
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
        }
    }

    /// Get message count
    #[must_use]
    pub fn message_count(&self) -> usize {
        self.messages.len()
    }

    /// Add a message to the conversation (deduplicates by ID)
    pub fn add_message(&mut self, message: Message) {
        // Avoid duplicates - don't add if message with same ID exists
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
                // Find the message index and take messages up to and including it
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
// Conversation Manager
// ============================================

/// Manages conversation persistence with workspace-based isolation (Claude Code style)
///
/// Conversations are stored in folders organized by encoded workspace path:
/// `{base_dir}/projects/{encoded-workspace}/{session_id}.json`
#[derive(Debug)]
pub struct ConversationManager {
    /// Base path for all projects (e.g., `~/.../orbit/`)
    base_dir: PathBuf,
    /// In-memory cache of conversation summaries (per-workspace, keyed by workspace path)
    summaries: RwLock<Vec<ConversationSummary>>,
    /// Current workspace path being managed (for legacy API compatibility)
    current_workspace: RwLock<Option<String>>,
}

impl ConversationManager {
    /// Create a new conversation manager with default base directory
    #[must_use]
    pub fn new() -> Self {
        let base_dir = Self::default_base_dir();
        Self {
            base_dir,
            summaries: RwLock::new(Vec::new()),
            current_workspace: RwLock::new(None),
        }
    }

    /// Create a conversation manager with a custom base directory
    #[must_use]
    pub fn with_data_dir(data_dir: PathBuf) -> Self {
        Self {
            base_dir: data_dir,
            summaries: RwLock::new(Vec::new()),
            current_workspace: RwLock::new(None),
        }
    }

    /// Get the default base directory for orbit data
    #[must_use]
    pub fn default_base_dir() -> PathBuf {
        ProjectDirs::from("com", "recursive", "orbit").map_or_else(
            || dirs::data_local_dir().map_or_else(|| PathBuf::from(".orbit"), |d| d.join("orbit")),
            |dirs| dirs.data_dir().to_path_buf(),
        )
    }

    /// Get the projects directory (contains all workspace folders)
    #[must_use]
    pub fn projects_dir(&self) -> PathBuf {
        self.base_dir.join("projects")
    }

    /// Get the data directory path (legacy API - returns projects dir)
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
            .join(format!("{session_id}.json"))
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

    /// Load all conversation summaries for a specific workspace
    ///
    /// This reads only from the workspace's folder - no filtering needed!
    ///
    /// # Errors
    ///
    /// Returns an error if the directory cannot be read.
    pub fn load_summaries(&self) -> Result<Vec<ConversationSummary>> {
        // Load from current workspace (legacy API)
        let workspace = self.current_workspace.read().clone();
        self.load_summaries_for_workspace(workspace.as_deref())
    }

    /// Get cached summaries (call `load_summaries` first to populate)
    #[must_use]
    pub fn get_summaries(&self) -> Vec<ConversationSummary> {
        self.summaries.read().clone()
    }

    /// Load all conversation summaries for a specific workspace
    ///
    /// With Claude Code-style isolation, this reads ONLY from the workspace's folder.
    /// No filtering needed - folder structure provides automatic isolation.
    ///
    /// # Errors
    ///
    /// Returns an error if the directory cannot be read.
    pub fn load_summaries_for_workspace(
        &self,
        workspace_path: Option<&str>,
    ) -> Result<Vec<ConversationSummary>> {
        let workspace_dir = self.workspace_dir(workspace_path);

        // If the directory doesn't exist yet, return empty list
        if !workspace_dir.exists() {
            return Ok(Vec::new());
        }

        let mut summaries = Vec::new();

        let entries = fs::read_dir(&workspace_dir).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(workspace_dir.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        for entry in entries {
            let Ok(entry) = entry else { continue };

            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "json") {
                // Try to load the conversation to get summary
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(conv) = serde_json::from_str::<Conversation>(&content) {
                        summaries.push(ConversationSummary::from(&conv));
                    }
                }
            }
        }

        // Sort by updated_at descending (most recent first), then by session_id for determinism
        summaries.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| b.session_id.cmp(&a.session_id))
        });

        // Update cache
        {
            let mut cache = self.summaries.write();
            cache.clone_from(&summaries);
        }

        tracing::debug!(
            "Loaded {} conversations from workspace: {:?}",
            summaries.len(),
            workspace_path
        );

        Ok(summaries)
    }

    /// Delete all conversations in the global (no workspace) folder
    ///
    /// # Errors
    ///
    /// Returns an error if any conversation cannot be deleted.
    pub fn cleanup_orphaned_conversations(&self) -> Result<usize> {
        // Load conversations from the _global folder
        let summaries = self.load_summaries_for_workspace(None)?;
        let mut removed = 0;

        for summary in summaries {
            self.delete_in_workspace(&summary.session_id, None)?;
            removed += 1;
        }

        tracing::info!("Cleaned up {} orphaned conversations", removed);
        Ok(removed)
    }

    /// Create a new conversation in the appropriate workspace folder
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be saved.
    #[expect(
        clippy::needless_pass_by_value,
        reason = "workspace_path and worktree_path are cloned for Conversation::new"
    )]
    pub fn create(
        &self,
        session_id: String,
        title: String,
        workspace_path: Option<String>,
        worktree_path: Option<String>,
    ) -> Result<Conversation> {
        let conversation =
            Conversation::new(session_id, title, workspace_path.clone(), worktree_path);
        self.save_to_workspace(&conversation, workspace_path.as_deref())?;

        // Update summaries cache
        {
            let mut summaries = self.summaries.write();
            summaries.insert(0, ConversationSummary::from(&conversation));
        }

        tracing::debug!(
            "Created conversation {} in workspace: {:?}",
            conversation.session_id,
            workspace_path
        );

        Ok(conversation)
    }

    /// Load a conversation by session ID from a specific workspace
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be loaded.
    pub fn load_from_workspace(
        &self,
        session_id: &str,
        workspace_path: Option<&str>,
    ) -> Result<Option<Conversation>> {
        let path = self.conversation_path(session_id, workspace_path);

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        let conversation = serde_json::from_str(&content)?;
        Ok(Some(conversation))
    }

    /// Load a conversation by session ID (searches in conversation's stored workspace)
    ///
    /// This method first tries to find the conversation in any workspace folder.
    /// For better performance, use `load_from_workspace` if you know the workspace.
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be loaded.
    pub fn load(&self, session_id: &str) -> Result<Option<Conversation>> {
        // First, try the current workspace
        let current = self.current_workspace.read().clone();
        if let Some(conv) = self.load_from_workspace(session_id, current.as_deref())? {
            return Ok(Some(conv));
        }

        // If not found, search all workspace folders
        let projects_dir = self.projects_dir();
        if !projects_dir.exists() {
            return Ok(None);
        }

        if let Ok(entries) = fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let conv_path = entry.path().join(format!("{session_id}.json"));
                    if conv_path.exists() {
                        if let Ok(content) = fs::read_to_string(&conv_path) {
                            if let Ok(conv) = serde_json::from_str::<Conversation>(&content) {
                                return Ok(Some(conv));
                            }
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Save a conversation to its workspace folder
    ///
    /// Uses the conversation's workspace_path field to determine the folder.
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be saved.
    pub fn save(&self, conversation: &Conversation) -> Result<()> {
        self.save_to_workspace(conversation, conversation.workspace_path.as_deref())
    }

    /// Save a conversation to a specific workspace folder
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be saved.
    pub fn save_to_workspace(
        &self,
        conversation: &Conversation,
        workspace_path: Option<&str>,
    ) -> Result<()> {
        self.ensure_workspace_dir(workspace_path)?;

        let workspace_dir = self.workspace_dir(workspace_path);
        let path = self.conversation_path(&conversation.session_id, workspace_path);
        let temp_path = workspace_dir.join(Self::unique_temp_name());
        let content = serde_json::to_string_pretty(conversation)?;

        // Write to temp file first (atomic write)
        fs::write(&temp_path, &content).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(temp_path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        // Rename to actual path
        fs::rename(&temp_path, &path).map_err(|e| {
            drop(fs::remove_file(&temp_path));
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        tracing::debug!(
            "Saved conversation {} to {}",
            conversation.session_id,
            path.display()
        );
        Ok(())
    }

    /// Delete a conversation from a specific workspace
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be deleted.
    pub fn delete_in_workspace(
        &self,
        session_id: &str,
        workspace_path: Option<&str>,
    ) -> Result<()> {
        let path = self.conversation_path(session_id, workspace_path);

        if path.exists() {
            fs::remove_file(&path).map_err(|e| {
                if e.kind() == ErrorKind::PermissionDenied {
                    Error::PermissionDenied(path.display().to_string())
                } else {
                    Error::Io(e)
                }
            })?;

            // Update cache
            {
                let mut summaries = self.summaries.write();
                summaries.retain(|s| s.session_id != session_id);
            }

            tracing::debug!(
                "Deleted conversation {} from {:?}",
                session_id,
                workspace_path
            );
        }

        Ok(())
    }

    /// Delete a conversation (searches all workspaces if needed)
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be deleted.
    pub fn delete(&self, session_id: &str) -> Result<()> {
        // First, find the conversation to get its workspace
        if let Some(conv) = self.load(session_id)? {
            return self.delete_in_workspace(session_id, conv.workspace_path.as_deref());
        }

        // Try current workspace
        let current = self.current_workspace.read().clone();
        self.delete_in_workspace(session_id, current.as_deref())
    }

    /// Update conversation title
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be updated.
    pub fn update_title(&self, session_id: &str, title: String) -> Result<()> {
        if let Some(mut conv) = self.load(session_id)? {
            conv.set_title(title.clone());
            self.save(&conv)?;

            // Update cache
            {
                let mut summaries = self.summaries.write();
                if let Some(summary) = summaries.iter_mut().find(|s| s.session_id == session_id) {
                    summary.title = title;
                    summary.updated_at = conv.updated_at;
                }
            }
        }
        Ok(())
    }

    /// Add a message to a conversation
    ///
    /// Creates the conversation if it doesn't exist.
    ///
    /// # Errors
    ///
    /// Returns an error if the message cannot be added.
    pub fn add_message(
        &self,
        session_id: &str,
        message: Message,
        workspace_path: Option<&str>,
        worktree_path: Option<&str>,
    ) -> Result<()> {
        let mut conversation = self.load(session_id)?.unwrap_or_else(|| {
            Conversation::new(
                session_id.to_owned(),
                String::from("New Chat"),
                workspace_path.map(str::to_owned),
                worktree_path.map(str::to_owned),
            )
        });

        conversation.add_message(message);
        self.save(&conversation)?;

        // Update cache
        {
            let mut summaries = self.summaries.write();
            if let Some(summary) = summaries.iter_mut().find(|s| s.session_id == session_id) {
                summary.message_count = conversation.message_count();
                summary.updated_at = conversation.updated_at;
            } else {
                // Add new summary at front
                summaries.insert(0, ConversationSummary::from(&conversation));
            }
            // Re-sort by updated_at
            summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        }

        Ok(())
    }

    /// Fork a conversation from a specific message (rewind)
    ///
    /// # Errors
    ///
    /// Returns an error if the fork cannot be created.
    pub fn fork(
        &self,
        session_id: &str,
        new_session_id: String,
        up_to_message_id: Option<&str>,
    ) -> Result<Option<Conversation>> {
        let Some(original) = self.load(session_id)? else {
            return Ok(None);
        };

        let forked = original.fork(new_session_id, up_to_message_id);
        self.save(&forked)?;

        // Update cache
        {
            let mut summaries = self.summaries.write();
            summaries.insert(0, ConversationSummary::from(&forked));
        }

        Ok(Some(forked))
    }

    /// Generate a unique temp filename
    fn unique_temp_name() -> String {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let count = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("conv.{}.{}.tmp", process::id(), count)
    }
}

impl Default for ConversationManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// Utilities
// ============================================

/// Encode a workspace path to a folder name (Claude Code style)
///
/// Replaces all `/` with `-` to create a valid folder name.
/// Example: `/Users/pranit/Desktop/orbit` → `-Users-pranit-Desktop-orbit`
#[must_use]
pub fn encode_workspace_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Decode an encoded folder name back to an absolute path
///
/// Replaces all `-` with `/` to restore the original path.
/// Example: `-Users-pranit-Desktop-orbit` → `/Users/pranit/Desktop/orbit`
#[must_use]
pub fn decode_workspace_path(encoded: &str) -> String {
    encoded.replace('-', "/")
}

/// Get current timestamp in milliseconds
fn current_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
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

    fn create_test_manager() -> (ConversationManager, TempDir) {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let manager = ConversationManager::with_data_dir(temp_dir.path().to_path_buf());
        (manager, temp_dir)
    }

    fn create_test_message(role: MessageRole, content: &str) -> Message {
        Message {
            id: uuid::Uuid::new_v4().to_string(),
            role,
            content: content.to_owned(),
            thinking: None,
            is_interrupted: None,
            created_at: current_timestamp(),
            tool_uses: Vec::new(),
            usage: None,
        }
    }

    #[test]
    fn test_create_conversation() {
        let (manager, _temp) = create_test_manager();

        let conv = manager
            .create("session-1".to_owned(), "Test Chat".to_owned(), None, None)
            .expect("Failed to create conversation");

        assert_eq!(conv.session_id, "session-1");
        assert_eq!(conv.title, "Test Chat");
        assert!(conv.messages.is_empty());
    }

    #[test]
    fn test_save_and_load() {
        let (manager, _temp) = create_test_manager();

        let mut conv =
            Conversation::new("session-1".to_owned(), "Test Chat".to_owned(), None, None);
        conv.add_message(create_test_message(MessageRole::User, "Hello"));
        conv.add_message(create_test_message(MessageRole::Assistant, "Hi there!"));

        manager.save(&conv).expect("Failed to save");

        let loaded = manager
            .load("session-1")
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

        let result = manager.load("nonexistent").expect("Failed to load");
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_conversation() {
        let (manager, _temp) = create_test_manager();

        let _ = manager
            .create("session-1".to_owned(), "Test".to_owned(), None, None)
            .expect("Failed to create");

        assert!(manager.load("session-1").expect("Failed to load").is_some());

        manager.delete("session-1").expect("Failed to delete");

        assert!(manager.load("session-1").expect("Failed to load").is_none());
    }

    #[test]
    fn test_update_title() {
        let (manager, _temp) = create_test_manager();

        let _ = manager
            .create("session-1".to_owned(), "Old Title".to_owned(), None, None)
            .expect("Failed to create");

        manager
            .update_title("session-1", "New Title".to_owned())
            .expect("Failed to update");

        let loaded = manager
            .load("session-1")
            .expect("Failed to load")
            .expect("Not found");

        assert_eq!(loaded.title, "New Title");
    }

    #[test]
    fn test_add_message() {
        let (manager, _temp) = create_test_manager();

        let _ = manager
            .create("session-1".to_owned(), "Test".to_owned(), None, None)
            .expect("Failed to create");

        let msg = create_test_message(MessageRole::User, "Hello");
        manager
            .add_message("session-1", msg, None, None)
            .expect("Failed to add message");

        let loaded = manager
            .load("session-1")
            .expect("Failed to load")
            .expect("Not found");

        assert_eq!(loaded.messages.len(), 1);
        assert_eq!(loaded.messages[0].content, "Hello");
    }

    #[test]
    fn test_load_summaries() {
        let (manager, _temp) = create_test_manager();

        let _ = manager
            .create("session-1".to_owned(), "Chat 1".to_owned(), None, None)
            .expect("Failed to create");
        let _ = manager
            .create("session-2".to_owned(), "Chat 2".to_owned(), None, None)
            .expect("Failed to create");
        let _ = manager
            .create("session-3".to_owned(), "Chat 3".to_owned(), None, None)
            .expect("Failed to create");

        let summaries = manager.load_summaries().expect("Failed to load summaries");

        assert_eq!(summaries.len(), 3);
        // Most recent first
        assert_eq!(summaries[0].session_id, "session-3");
    }

    #[test]
    fn test_fork_conversation() {
        let (manager, _temp) = create_test_manager();

        let mut conv = Conversation::new("session-1".to_owned(), "Original".to_owned(), None, None);
        conv.add_message(create_test_message(MessageRole::User, "Message 1"));
        conv.add_message(create_test_message(MessageRole::Assistant, "Response 1"));
        conv.add_message(create_test_message(MessageRole::User, "Message 2"));

        let msg_id = conv.messages[1].id.clone();
        manager.save(&conv).expect("Failed to save");

        let forked = manager
            .fork("session-1", "session-2".to_owned(), Some(&msg_id))
            .expect("Failed to fork")
            .expect("Original not found");

        assert_eq!(forked.session_id, "session-2");
        assert_eq!(forked.messages.len(), 2); // Only first 2 messages
        assert_eq!(forked.forked_from, Some("session-1".to_owned()));
    }
}
