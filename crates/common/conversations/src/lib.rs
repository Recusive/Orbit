//! Snowflake Conversations - Chat history persistence
//!
//! This crate handles saving and loading conversation history for the Snowflake editor.
//!
//! # Storage Location
//!
//! Conversations are stored in platform-specific data directories:
//! - macOS: `~/Library/Application Support/snowflake/conversations/`
//! - Linux: `~/.local/share/snowflake/conversations/`
//! - Windows: `%APPDATA%/snowflake/conversations/`
//!
//! Each conversation is stored as a separate JSON file named by its session ID.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process;

use directories::ProjectDirs;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use snowflake_core::{Error, Result};

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
    /// Optional forked from session ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
}

impl Conversation {
    /// Create a new empty conversation
    #[must_use]
    pub fn new(session_id: String, title: String, workspace_path: Option<String>) -> Self {
        let now = current_timestamp();
        Self {
            session_id,
            title,
            created_at: now,
            updated_at: now,
            messages: Vec::new(),
            workspace_path,
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
}

impl From<&Conversation> for ConversationSummary {
    fn from(conv: &Conversation) -> Self {
        Self {
            session_id: conv.session_id.clone(),
            title: conv.title.clone(),
            updated_at: conv.updated_at,
            message_count: conv.messages.len(),
            workspace_path: conv.workspace_path.clone(),
        }
    }
}

// ============================================
// Conversation Manager
// ============================================

/// Manages conversation persistence
#[derive(Debug)]
pub struct ConversationManager {
    /// Path to conversations directory
    data_dir: PathBuf,
    /// In-memory cache of conversation summaries
    summaries: RwLock<Vec<ConversationSummary>>,
}

impl ConversationManager {
    /// Create a new conversation manager with default data directory
    #[must_use]
    pub fn new() -> Self {
        let data_dir = Self::default_data_dir();
        Self {
            data_dir,
            summaries: RwLock::new(Vec::new()),
        }
    }

    /// Create a conversation manager with a custom data directory
    #[must_use]
    pub fn with_data_dir(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            summaries: RwLock::new(Vec::new()),
        }
    }

    /// Get the default data directory for conversations
    #[must_use]
    pub fn default_data_dir() -> PathBuf {
        ProjectDirs::from("com", "snowflake", "snowflake").map_or_else(
            || {
                dirs::data_local_dir().map_or_else(
                    || PathBuf::from(".snowflake/conversations"),
                    |d| d.join("snowflake").join("conversations"),
                )
            },
            |dirs| dirs.data_dir().join("conversations"),
        )
    }

    /// Get the data directory path
    #[must_use]
    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    /// Get the file path for a conversation
    fn conversation_path(&self, session_id: &str) -> PathBuf {
        self.data_dir.join(format!("{session_id}.json"))
    }

    /// Ensure the data directory exists
    fn ensure_data_dir(&self) -> Result<()> {
        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir).map_err(|e| {
                Error::Config(format!(
                    "Failed to create conversations directory {}: {}",
                    self.data_dir.display(),
                    e
                ))
            })?;
        }
        Ok(())
    }

    /// Load all conversation summaries from disk
    ///
    /// # Errors
    ///
    /// Returns an error if the directory cannot be read.
    pub fn load_summaries(&self) -> Result<Vec<ConversationSummary>> {
        self.ensure_data_dir()?;

        let mut summaries = Vec::new();

        let entries = fs::read_dir(&self.data_dir).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(self.data_dir.display().to_string())
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

        Ok(summaries)
    }

    /// Get cached summaries (call `load_summaries` first to populate)
    #[must_use]
    pub fn get_summaries(&self) -> Vec<ConversationSummary> {
        self.summaries.read().clone()
    }

    /// Load all conversation summaries filtered by workspace path
    ///
    /// # Errors
    ///
    /// Returns an error if the directory cannot be read.
    pub fn load_summaries_for_workspace(
        &self,
        workspace_path: Option<&str>,
    ) -> Result<Vec<ConversationSummary>> {
        let all_summaries = self.load_summaries()?;

        match workspace_path {
            Some(path) => {
                // Filter to only conversations for this workspace
                Ok(all_summaries
                    .into_iter()
                    .filter(|s| s.workspace_path.as_deref() == Some(path))
                    .collect())
            },
            None => {
                // No workspace specified - return only orphaned conversations
                Ok(all_summaries
                    .into_iter()
                    .filter(|s| s.workspace_path.is_none())
                    .collect())
            },
        }
    }

    /// Delete all conversations without a workspace path (orphaned)
    ///
    /// # Errors
    ///
    /// Returns an error if any conversation cannot be deleted.
    pub fn cleanup_orphaned_conversations(&self) -> Result<usize> {
        let summaries = self.load_summaries()?;
        let mut removed = 0;

        for summary in summaries {
            if summary.workspace_path.is_none() {
                self.delete(&summary.session_id)?;
                removed += 1;
            }
        }

        tracing::info!("Cleaned up {} orphaned conversations", removed);
        Ok(removed)
    }

    /// Create a new conversation
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be saved.
    pub fn create(
        &self,
        session_id: String,
        title: String,
        workspace_path: Option<String>,
    ) -> Result<Conversation> {
        let conversation = Conversation::new(session_id, title, workspace_path);
        self.save(&conversation)?;

        // Update summaries cache
        {
            let mut summaries = self.summaries.write();
            summaries.insert(0, ConversationSummary::from(&conversation));
        }

        Ok(conversation)
    }

    /// Load a conversation by session ID
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be loaded.
    pub fn load(&self, session_id: &str) -> Result<Option<Conversation>> {
        let path = self.conversation_path(session_id);

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

    /// Save a conversation to disk
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be saved.
    pub fn save(&self, conversation: &Conversation) -> Result<()> {
        self.ensure_data_dir()?;

        let path = self.conversation_path(&conversation.session_id);
        let temp_path = self.data_dir.join(Self::unique_temp_name());
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

    /// Delete a conversation
    ///
    /// # Errors
    ///
    /// Returns an error if the conversation cannot be deleted.
    pub fn delete(&self, session_id: &str) -> Result<()> {
        let path = self.conversation_path(session_id);

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

            tracing::debug!("Deleted conversation {}", session_id);
        }

        Ok(())
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
    ) -> Result<()> {
        let mut conversation = self.load(session_id)?.unwrap_or_else(|| {
            Conversation::new(
                session_id.to_owned(),
                String::from("New Chat"),
                workspace_path.map(str::to_owned),
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
            created_at: current_timestamp(),
            tool_uses: Vec::new(),
            usage: None,
        }
    }

    #[test]
    fn test_create_conversation() {
        let (manager, _temp) = create_test_manager();

        let conv = manager
            .create("session-1".to_owned(), "Test Chat".to_owned(), None)
            .expect("Failed to create conversation");

        assert_eq!(conv.session_id, "session-1");
        assert_eq!(conv.title, "Test Chat");
        assert!(conv.messages.is_empty());
    }

    #[test]
    fn test_save_and_load() {
        let (manager, _temp) = create_test_manager();

        let mut conv = Conversation::new("session-1".to_owned(), "Test Chat".to_owned(), None);
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
            .create("session-1".to_owned(), "Test".to_owned(), None)
            .expect("Failed to create");

        assert!(manager.load("session-1").expect("Failed to load").is_some());

        manager.delete("session-1").expect("Failed to delete");

        assert!(manager.load("session-1").expect("Failed to load").is_none());
    }

    #[test]
    fn test_update_title() {
        let (manager, _temp) = create_test_manager();

        let _ = manager
            .create("session-1".to_owned(), "Old Title".to_owned(), None)
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
            .create("session-1".to_owned(), "Test".to_owned(), None)
            .expect("Failed to create");

        let msg = create_test_message(MessageRole::User, "Hello");
        manager
            .add_message("session-1", msg, None)
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
            .create("session-1".to_owned(), "Chat 1".to_owned(), None)
            .expect("Failed to create");
        let _ = manager
            .create("session-2".to_owned(), "Chat 2".to_owned(), None)
            .expect("Failed to create");
        let _ = manager
            .create("session-3".to_owned(), "Chat 3".to_owned(), None)
            .expect("Failed to create");

        let summaries = manager.load_summaries().expect("Failed to load summaries");

        assert_eq!(summaries.len(), 3);
        // Most recent first
        assert_eq!(summaries[0].session_id, "session-3");
    }

    #[test]
    fn test_fork_conversation() {
        let (manager, _temp) = create_test_manager();

        let mut conv = Conversation::new("session-1".to_owned(), "Original".to_owned(), None);
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
