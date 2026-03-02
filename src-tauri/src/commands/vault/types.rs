//! Types for Vault commands.

use serde::{Deserialize, Serialize};

/// Maximum file size accepted by Vault read commands (10 MB).
pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;
/// Default page size for list operations.
pub const DEFAULT_LIST_LIMIT: u32 = 500;
/// Upper bound for page size in list operations.
pub const MAX_LIST_LIMIT: u32 = 2000;
/// Default max depth for project doc discovery.
pub const DEFAULT_DISCOVERY_MAX_DEPTH: usize = 6;
/// Default max discovered project docs.
pub const DEFAULT_DISCOVERY_MAX_RESULTS: usize = 500;
/// Hard cap for discovery results.
pub const MAX_DISCOVERY_RESULTS: usize = 500;
/// Default max search results.
pub const DEFAULT_SEARCH_MAX_RESULTS: usize = 50;
/// Hard cap for search results.
pub const MAX_SEARCH_RESULTS: usize = 200;

/// Content encoding format used for Vault content payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum ContentEncoding {
    /// UTF-8 plain text.
    Utf8,
    /// Base64-encoded binary payload.
    Base64,
}

/// File content returned by Vault read commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultContent {
    /// UTF-8 text or base64-encoded bytes.
    pub content: String,
    /// Encoding used for `content`.
    pub encoding: ContentEncoding,
    /// Whether the source file was detected as binary.
    pub is_binary: bool,
    /// File size in bytes.
    pub size_bytes: u64,
}

/// File or directory metadata for Vault listings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    /// Relative path from Vault root.
    pub path: String,
    /// Basename only.
    pub name: String,
    /// Whether this entry is a directory.
    pub is_dir: bool,
    /// Size in bytes (0 for directories).
    pub size_bytes: u64,
    /// Creation timestamp in milliseconds since Unix epoch.
    pub created_at: u64,
    /// Modified timestamp in milliseconds since Unix epoch.
    pub modified_at: u64,
    /// Lowercase extension without dot.
    pub extension: Option<String>,
}

/// Paginated directory listing result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultListResult {
    /// Page of entries.
    pub entries: Vec<VaultEntry>,
    /// Full number of entries before pagination.
    pub total_count: u32,
    /// Whether more results exist beyond this page.
    pub has_more: bool,
}

/// Result payload for write operations.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    /// Last modified timestamp after successful write.
    pub modified_at: u64,
}

/// Vault aggregate statistics.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStats {
    /// Number of files.
    pub total_files: u32,
    /// Number of directories.
    pub total_dirs: u32,
    /// Sum of file sizes in bytes.
    pub total_size_bytes: u64,
}

/// Vault auto-context configuration persisted in `vault-context.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultContextConfig {
    /// Config schema version.
    pub version: String,
    /// Absolute paths to always include in chat context.
    pub included_paths: Vec<String>,
}

impl Default for VaultContextConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_owned(),
            included_paths: Vec::new(),
        }
    }
}

/// Classification bucket for discovered project docs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum ProjectDocSource {
    /// File is directly at workspace root.
    Root,
    /// File is under a `docs/` directory.
    Docs,
    /// Any other location in the workspace.
    Other,
}

/// Markdown-like project document metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocEntry {
    /// Absolute path on disk.
    pub path: String,
    /// Path relative to workspace root.
    pub relative_path: String,
    /// Basename only.
    pub name: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Modified timestamp in milliseconds since Unix epoch.
    pub modified_at: u64,
    /// Coarse location classification.
    pub source: ProjectDocSource,
}

/// Source kind for unified doc search results.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum DocSource {
    /// Result from `.orbit/Vault`.
    Vault,
    /// Result from workspace project docs.
    Project,
}

/// Match entry returned from unified Vault/project search.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchResult {
    /// Absolute file path.
    pub path: String,
    /// Relative path from source root.
    pub relative_path: String,
    /// 1-based line number.
    pub line_number: u32,
    /// Full line text.
    pub line_content: String,
    /// Source bucket.
    pub source: DocSource,
}
