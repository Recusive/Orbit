//! Shared types for Snowflake

use serde::{Deserialize, Serialize};

/// File entry returned by directory listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Full path to the file
    pub path: String,
    /// File name without directory
    pub name: String,
    /// Whether this is a directory
    pub is_dir: bool,
    /// File size in bytes (None for directories)
    pub size: Option<u64>,
    /// Last modified timestamp (Unix epoch seconds)
    pub modified: Option<u64>,
}

/// Detailed file information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    /// Full path to the file
    pub path: String,
    /// File name without directory
    pub name: String,
    /// Whether this is a directory
    pub is_dir: bool,
    /// Whether this is a regular file
    pub is_file: bool,
    /// File size in bytes
    pub size: u64,
    /// Last modified timestamp (Unix epoch seconds)
    pub modified: u64,
    /// Creation timestamp (Unix epoch seconds)
    pub created: u64,
    /// Whether the file is read-only
    pub readonly: bool,
}

/// LSP completion item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    /// Display label for the completion
    pub label: String,
    /// Completion item kind (function, variable, etc.)
    pub kind: i32,
    /// Additional detail about the item
    pub detail: Option<String>,
    /// Documentation for the item
    pub documentation: Option<String>,
    /// Text to insert when selected
    pub insert_text: Option<String>,
    /// Sort text for ordering completions
    pub sort_text: Option<String>,
}

/// LSP hover information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoverInfo {
    /// Hover content (usually markdown)
    pub contents: String,
    /// Range the hover applies to
    pub range: Option<Range>,
}

/// Location in a file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    /// File path
    pub path: String,
    /// Line number (0-indexed)
    pub line: u32,
    /// Column number (0-indexed)
    pub column: u32,
}

/// Range in a file
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    /// Start position
    pub start: Position,
    /// End position
    pub end: Position,
}

/// Position in a file
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    /// Line number (0-indexed)
    pub line: u32,
    /// Column number (0-indexed)
    pub column: u32,
}

/// Diagnostic message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    /// Diagnostic message text
    pub message: String,
    /// Severity level
    pub severity: DiagnosticSeverity,
    /// Range in the file
    pub range: Range,
    /// Source of the diagnostic (e.g., "rustc")
    pub source: Option<String>,
    /// Error code
    pub code: Option<String>,
}

/// Diagnostic severity levels
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum DiagnosticSeverity {
    /// Error - must be fixed
    Error,
    /// Warning - should be addressed
    Warning,
    /// Informational message
    Info,
    /// Hint or suggestion
    Hint,
}

/// Signature help information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureHelp {
    /// Available signatures
    pub signatures: Vec<SignatureInfo>,
    /// Index of the active signature
    pub active_signature: u32,
    /// Index of the active parameter
    pub active_parameter: u32,
}

/// Signature information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    /// Signature label
    pub label: String,
    /// Signature documentation
    pub documentation: Option<String>,
    /// Parameter information
    pub parameters: Vec<ParameterInfo>,
}

/// Parameter information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterInfo {
    /// Parameter label
    pub label: String,
    /// Parameter documentation
    pub documentation: Option<String>,
}

/// Terminal session info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    /// Unique terminal identifier
    pub id: String,
    /// Process ID
    pub pid: u32,
    /// Shell executable path
    pub shell: String,
    /// Current working directory
    pub cwd: String,
}

/// Git repository status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Current branch name
    pub branch: String,
    /// Staged files
    pub staged: Vec<String>,
    /// Modified files (unstaged)
    pub modified: Vec<String>,
    /// Untracked files
    pub untracked: Vec<String>,
    /// Deleted files
    pub deleted: Vec<String>,
    /// Renamed files
    pub renamed: Vec<RenamedFile>,
    /// Conflicted files (merge conflicts)
    pub conflicted: Vec<String>,
    /// Commits ahead of remote
    pub ahead: u32,
    /// Commits behind remote
    pub behind: u32,
    /// Whether working directory is clean
    pub is_clean: bool,
}

/// Renamed file pair
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedFile {
    /// Original file path
    pub from: String,
    /// New file path
    pub to: String,
}

/// Git commit information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    /// Full commit SHA
    pub sha: String,
    /// Short commit SHA (7 chars)
    pub short_sha: String,
    /// Commit message
    pub message: String,
    /// Author name
    pub author: String,
    /// Author email
    pub email: String,
    /// Commit timestamp (Unix epoch seconds)
    pub date: u64,
}

/// Git branch information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    /// Branch name
    pub name: String,
    /// Whether this is a remote branch
    pub is_remote: bool,
    /// Whether this is the current branch
    pub is_current: bool,
    /// Upstream tracking branch
    pub upstream: Option<String>,
}

/// Chat message for AI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// Message role (user, assistant, system)
    pub role: ChatRole,
    /// Message content
    pub content: String,
}

/// Chat message role
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum ChatRole {
    /// User message
    User,
    /// Assistant response
    Assistant,
    /// System prompt
    System,
}

/// Chat response from AI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    /// Response content
    pub content: String,
    /// Token usage statistics
    pub usage: Option<TokenUsage>,
    /// Model used for generation
    pub model: Option<String>,
    /// Reason generation stopped
    pub stop_reason: Option<String>,
}

/// Token usage information
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    /// Number of input tokens
    pub input_tokens: u32,
    /// Number of output tokens
    pub output_tokens: u32,
}

/// Search options
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    /// Case-sensitive search
    pub case_sensitive: Option<bool>,
    /// Match whole words only
    pub whole_word: Option<bool>,
    /// Use regex pattern
    pub regex: Option<bool>,
    /// Include patterns (globs)
    pub include: Option<Vec<String>>,
    /// Exclude patterns (globs)
    pub exclude: Option<Vec<String>>,
    /// Maximum number of results
    pub max_results: Option<u32>,
}

/// File search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// Full file path
    pub path: String,
    /// File name
    pub name: String,
    /// Whether this is a directory
    pub is_dir: bool,
}

/// Text search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSearchResult {
    /// File path
    pub path: String,
    /// Line number (1-indexed)
    pub line: u32,
    /// Column number (1-indexed)
    pub column: u32,
    /// Length of the match
    pub match_length: u32,
    /// Full line content
    pub line_content: String,
    /// Context lines before match
    pub before_context: Option<Vec<String>>,
    /// Context lines after match
    pub after_context: Option<Vec<String>>,
}

/// File change event types
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum FileChangeType {
    /// File was created
    Created,
    /// File was modified
    Modified,
    /// File was deleted
    Deleted,
    /// File was renamed
    Renamed,
}

/// File change event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    /// Type of change
    #[serde(rename = "type")]
    pub change_type: FileChangeType,
    /// File path
    pub path: String,
    /// New path (for renames)
    pub new_path: Option<String>,
}
