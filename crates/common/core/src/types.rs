//! Shared types for Orbit

use std::fmt;

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
    /// Whether this is a symbolic link
    pub is_symlink: bool,
    /// Whether this is a hidden file (name starts with dot)
    pub is_hidden: bool,
    /// Whether this file is ignored by git (.gitignore)
    pub is_git_ignored: bool,
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Current branch name (empty if detached HEAD)
    pub branch: String,
    /// Upstream branch name if tracking
    pub upstream: Option<String>,
    /// Commits ahead of upstream
    pub ahead: u32,
    /// Commits behind upstream
    pub behind: u32,
    /// Files staged for commit (in index)
    pub staged: Vec<StatusEntry>,
    /// Files modified but not staged (in working tree)
    pub modified: Vec<StatusEntry>,
    /// Untracked files
    pub untracked: Vec<StatusEntry>,
    /// Files with merge conflicts
    pub conflicted: Vec<StatusEntry>,
}

impl GitStatus {
    /// Check if there are any changes.
    #[must_use]
    pub fn is_clean(&self) -> bool {
        self.staged.is_empty()
            && self.modified.is_empty()
            && self.untracked.is_empty()
            && self.conflicted.is_empty()
    }

    /// Get total count of changed files.
    #[must_use]
    pub fn total_changes(&self) -> usize {
        self.staged.len() + self.modified.len() + self.untracked.len() + self.conflicted.len()
    }

    /// Check if there are conflicts.
    #[must_use]
    pub fn has_conflicts(&self) -> bool {
        !self.conflicted.is_empty()
    }
}

/// Git status polling response with fingerprint-based change detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    /// Whether the caller should treat this poll as a material status change.
    pub changed: bool,
    /// Stable fingerprint for the full status payload.
    pub fingerprint: String,
    /// The full status payload when available.
    pub status: Option<GitStatus>,
}

/// Renamed file pair (legacy - use StatusEntry instead)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedFile {
    /// Original file path
    pub from: String,
    /// New file path
    pub to: String,
}

/// Status of a file in git.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum FileStatus {
    /// File is newly added (staged).
    Added,
    /// File has been modified.
    Modified,
    /// File has been deleted.
    Deleted,
    /// File has been renamed.
    Renamed,
    /// File has been copied.
    Copied,
    /// File is untracked (not in git).
    Untracked,
    /// File has merge conflicts.
    Conflicted,
    /// File type changed (e.g., file to symlink).
    TypeChange,
}

impl fmt::Display for FileStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Added => write!(f, "A"),
            Self::Modified => write!(f, "M"),
            Self::Deleted => write!(f, "D"),
            Self::Renamed => write!(f, "R"),
            Self::Copied => write!(f, "C"),
            Self::Untracked => write!(f, "?"),
            Self::Conflicted => write!(f, "U"),
            Self::TypeChange => write!(f, "T"),
        }
    }
}

/// A file's status entry in git.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    /// File path relative to repository root.
    pub path: String,
    /// Status type.
    pub status: FileStatus,
    /// Original path for renames/copies (None if not renamed/copied).
    pub old_path: Option<String>,
    /// Similarity percentage for renames/copies (0-100).
    pub similarity: Option<u8>,
}

#[expect(
    clippy::impl_trait_in_params,
    reason = "ergonomic API for string-like types"
)]
impl StatusEntry {
    /// Create a new status entry.
    #[must_use]
    pub fn new(path: impl Into<String>, status: FileStatus) -> Self {
        Self {
            path: path.into(),
            status,
            old_path: None,
            similarity: None,
        }
    }

    /// Create a renamed/moved entry.
    #[must_use]
    pub fn renamed(
        old_path: impl Into<String>,
        new_path: impl Into<String>,
        similarity: Option<u8>,
    ) -> Self {
        Self {
            path: new_path.into(),
            status: FileStatus::Renamed,
            old_path: Some(old_path.into()),
            similarity,
        }
    }

    /// Create a copied entry.
    #[must_use]
    pub fn copied(
        source_path: impl Into<String>,
        new_path: impl Into<String>,
        similarity: Option<u8>,
    ) -> Self {
        Self {
            path: new_path.into(),
            status: FileStatus::Copied,
            old_path: Some(source_path.into()),
            similarity,
        }
    }

    /// Check if this is a rename or copy.
    #[must_use]
    pub fn has_old_path(&self) -> bool {
        self.old_path.is_some()
    }
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

/// Fuzzy file search result from Nucleo matcher.
///
/// Used by the @ mention file picker to display ranked file matches
/// with highlighting support for matched characters.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuzzySearchResult {
    /// File path relative to workspace root.
    pub path: String,
    /// Filename only (for display).
    pub name: String,
    /// Match score from Nucleo (higher = better match).
    pub score: u32,
    /// Character indices in `name` where the pattern matched.
    /// Used for highlighting matched characters in the UI.
    pub match_indices: Vec<u32>,
    /// Character indices in `path` where the pattern matched.
    /// Used for highlighting matched characters in the path subtitle.
    pub path_match_indices: Vec<u32>,
}
