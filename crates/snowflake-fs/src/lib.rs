//! Snowflake File System - File operations and watching
//!
//! This crate provides async file system operations including:
//! - Reading and writing files
//! - Directory listing and traversal
//! - File watching for change notifications
//! - Search functionality using ripgrep

use std::cmp::Ordering;
use std::fs::Metadata;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::UNIX_EPOCH;

use grep::matcher::Matcher as _;
use grep::regex::RegexMatcher;
use grep::searcher::sinks::UTF8;
use grep::searcher::Searcher;
use ignore::WalkBuilder;
use notify::{RecommendedWatcher, RecursiveMode, Watcher as _};
use serde::{Deserialize, Serialize};
use snowflake_core::{Error, FileEntry, FileInfo, Result, SearchOptions, TextSearchResult};
use tokio::fs;

// ============================================
// File Operations
// ============================================

/// Read file contents as a string
///
/// # Errors
///
/// Returns an error if the file cannot be read
pub async fn read_file(path: &str) -> Result<String> {
    fs::read_to_string(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::FileNotFound(path.to_owned()),
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })
}

/// Read file contents as bytes
///
/// # Errors
///
/// Returns an error if the file cannot be read
pub async fn read_file_bytes(path: &str) -> Result<Vec<u8>> {
    fs::read(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::FileNotFound(path.to_owned()),
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })
}

/// Write content to a file
///
/// # Errors
///
/// Returns an error if the file cannot be written
pub async fn write_file(path: &str, content: &str) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).await?;
    }

    fs::write(path, content).await.map_err(|e| match e.kind() {
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })
}

/// Write bytes to a file
///
/// # Errors
///
/// Returns an error if the file cannot be written
pub async fn write_file_bytes(path: &str, content: &[u8]) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).await?;
    }

    fs::write(path, content).await.map_err(|e| match e.kind() {
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })
}

/// List directory contents
///
/// # Arguments
///
/// * `path` - Directory path to list
/// * `show_hidden` - Whether to include hidden files (starting with `.`)
///
/// # Errors
///
/// Returns an error if the directory cannot be read
pub async fn list_directory(path: &str, show_hidden: bool) -> Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    let mut dir = fs::read_dir(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::DirectoryNotFound(path.to_owned()),
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })?;

    while let Some(entry) = dir.next_entry().await? {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        // Skip hidden files if not requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().await.ok();

        let file_entry = FileEntry {
            path: path.to_string_lossy().into_owned(),
            name,
            is_dir: path.is_dir(),
            size: metadata.as_ref().map(Metadata::len),
            modified: metadata.and_then(|m| {
                m.modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs()))
            }),
        };

        entries.push(file_entry);
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Create an empty file
///
/// # Errors
///
/// Returns an error if the file cannot be created
pub async fn create_file(path: &str) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).await?;
    }

    let _file = fs::File::create(path).await.map_err(|e| match e.kind() {
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })?;

    Ok(())
}

/// Create a directory (and parents if needed)
///
/// # Errors
///
/// Returns an error if the directory cannot be created
pub async fn create_directory(path: &str) -> Result<()> {
    fs::create_dir_all(path).await.map_err(|e| match e.kind() {
        ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_owned()),
        _ => Error::Io(e),
    })
}

/// Delete a file or directory
///
/// # Errors
///
/// Returns an error if the file or directory cannot be deleted
pub async fn delete_file(path: &str) -> Result<()> {
    let metadata = fs::metadata(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::FileNotFound(path.to_owned()),
        _ => Error::Io(e),
    })?;

    if metadata.is_dir() {
        fs::remove_dir_all(path).await?;
    } else {
        fs::remove_file(path).await?;
    }

    Ok(())
}

/// Rename/move a file or directory
///
/// # Errors
///
/// Returns an error if the file cannot be renamed
pub async fn rename_file(old_path: &str, new_path: &str) -> Result<()> {
    fs::rename(old_path, new_path)
        .await
        .map_err(|e| match e.kind() {
            ErrorKind::NotFound => Error::FileNotFound(old_path.to_owned()),
            ErrorKind::PermissionDenied => Error::PermissionDenied(old_path.to_owned()),
            _ => Error::Io(e),
        })
}

/// Copy a file
///
/// # Errors
///
/// Returns an error if the file cannot be copied
pub async fn copy_file(from: &str, to: &str) -> Result<()> {
    // Ensure destination parent directory exists
    if let Some(parent) = Path::new(to).parent() {
        fs::create_dir_all(parent).await?;
    }

    let _ = fs::copy(from, to).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::FileNotFound(from.to_owned()),
        ErrorKind::PermissionDenied => Error::PermissionDenied(from.to_owned()),
        _ => Error::Io(e),
    })?;

    Ok(())
}

/// Check if a file or directory exists
pub async fn file_exists(path: &str) -> bool {
    fs::metadata(path).await.is_ok()
}

/// Check if a path is a directory
pub async fn is_directory(path: &str) -> bool {
    fs::metadata(path)
        .await
        .map(|m| m.is_dir())
        .unwrap_or(false)
}

/// Get detailed file information
///
/// # Errors
///
/// Returns an error if file info cannot be retrieved
pub async fn get_file_info(path: &str) -> Result<FileInfo> {
    let metadata = fs::metadata(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => Error::FileNotFound(path.to_owned()),
        _ => Error::Io(e),
    })?;

    let path_obj = Path::new(path);
    let name = path_obj
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());

    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());

    Ok(FileInfo {
        path: path.to_owned(),
        name,
        is_dir: metadata.is_dir(),
        is_file: metadata.is_file(),
        size: metadata.len(),
        modified,
        created,
        readonly: metadata.permissions().readonly(),
    })
}

// ============================================
// File Watching
// ============================================

/// File system event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
#[non_exhaustive]
pub enum FileEvent {
    /// File was created
    Created {
        /// Path to the created file
        path: String,
    },
    /// File was modified
    Modified {
        /// Path to the modified file
        path: String,
    },
    /// File was deleted
    Deleted {
        /// Path to the deleted file
        path: String,
    },
    /// File was renamed
    Renamed {
        /// Original path
        from: String,
        /// New path
        to: String,
    },
}

/// File watcher for monitoring file system changes
#[derive(Debug)]
pub struct FileWatcher {
    watcher: RecommendedWatcher,
    receiver: Receiver<FileEvent>,
}

impl FileWatcher {
    /// Create a new file watcher
    ///
    /// # Errors
    ///
    /// Returns an error if the watcher cannot be created
    pub fn new() -> Result<Self> {
        let (tx, rx): (Sender<FileEvent>, Receiver<FileEvent>) = mpsc::channel();

        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                // Track paths for rename detection
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();

                // Map notify events to our FileEvent type
                let file_event = match event.kind {
                    notify::EventKind::Create(_) => paths
                        .first()
                        .map(|p| FileEvent::Created { path: p.clone() }),
                    notify::EventKind::Modify(_) => paths
                        .first()
                        .map(|p| FileEvent::Modified { path: p.clone() }),
                    notify::EventKind::Remove(_) => paths
                        .first()
                        .map(|p| FileEvent::Deleted { path: p.clone() }),
                    notify::EventKind::Any
                    | notify::EventKind::Access(_)
                    | notify::EventKind::Other => None,
                };

                if let Some(ev) = file_event {
                    // Ignore send errors (receiver may be dropped)
                    drop(tx.send(ev));
                }
            }
        })
        .map_err(|e| Error::Other(format!("Failed to create watcher: {e}")))?;

        Ok(Self {
            watcher,
            receiver: rx,
        })
    }

    /// Watch a path for changes
    ///
    /// # Errors
    ///
    /// Returns an error if the path cannot be watched
    pub fn watch(&mut self, path: &Path) -> Result<()> {
        self.watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(|e| Error::Other(format!("Failed to watch path: {e}")))
    }

    /// Stop watching a path
    ///
    /// # Errors
    ///
    /// Returns an error if the path cannot be unwatched
    pub fn unwatch(&mut self, path: &Path) -> Result<()> {
        self.watcher
            .unwatch(path)
            .map_err(|e| Error::Other(format!("Failed to unwatch path: {e}")))
    }

    /// Get the event receiver
    #[must_use]
    pub fn events(&self) -> &Receiver<FileEvent> {
        &self.receiver
    }
}

// ============================================
// Search
// ============================================

/// Search for text in files under a root directory
///
/// Uses ripgrep components for fast, gitignore-aware searching.
///
/// # Arguments
///
/// * `root` - Root directory to search in
/// * `query` - Search pattern (literal or regex depending on options)
/// * `options` - Search options (case sensitivity, regex, patterns, etc.)
///
/// # Errors
///
/// Returns an error if the search fails
pub fn search_text(
    root: &Path,
    query: &str,
    options: &SearchOptions,
) -> Result<Vec<TextSearchResult>> {
    let case_sensitive = options.case_sensitive.unwrap_or(false);
    let use_regex = options.regex.unwrap_or(false);
    let max_results = options.max_results.map(|n| n as usize);

    // Build regex pattern
    let pattern = if use_regex {
        query.to_owned()
    } else if options.whole_word.unwrap_or(false) {
        format!(r"\b{}\b", regex::escape(query))
    } else {
        regex::escape(query)
    };

    // Create matcher
    let matcher = RegexMatcher::new_line_matcher(&pattern)
        .map_err(|e| Error::Other(format!("Invalid search pattern: {e}")))?;

    let matcher = if case_sensitive {
        matcher
    } else {
        RegexMatcher::new_line_matcher(&format!("(?i){pattern}"))
            .map_err(|e| Error::Other(format!("Invalid search pattern: {e}")))?
    };

    // Build walker (respects .gitignore)
    let mut walker_builder = WalkBuilder::new(root);

    // Apply include patterns
    if let Some(includes) = &options.include {
        for pattern in includes {
            // Add as glob override (returns &mut Self for chaining, ignore it)
            let _ = walker_builder.add_custom_ignore_filename(pattern);
        }
    }

    // Apply exclude patterns
    if let Some(excludes) = &options.exclude {
        for pattern in excludes {
            // Add negative pattern (returns &mut Self for chaining, ignore it)
            let _ = walker_builder.add_custom_ignore_filename(pattern);
        }
    }

    let walker = walker_builder.build();

    let mut results: Vec<TextSearchResult> = Vec::new();
    let mut searcher = Searcher::new();

    for entry in walker.flatten() {
        // Check max results
        if let Some(max) = max_results {
            if results.len() >= max {
                break;
            }
        }

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let path_str = path.to_string_lossy().into_owned();

        // Search this file
        let mut file_results: Vec<TextSearchResult> = Vec::new();

        let sink_result = searcher.search_path(
            &matcher,
            path,
            UTF8(|line_num, line| {
                // Find match position in line
                if let Ok(Some(m)) = matcher.find(line.as_bytes()) {
                    let result = TextSearchResult {
                        path: path_str.clone(),
                        line: u32::try_from(line_num).unwrap_or(u32::MAX),
                        column: u32::try_from(m.start()).unwrap_or(1) + 1, // 1-indexed
                        match_length: u32::try_from(m.end() - m.start()).unwrap_or(0),
                        line_content: line.trim_end().to_owned(),
                        before_context: None,
                        after_context: None,
                    };
                    file_results.push(result);
                }
                Ok(true)
            }),
        );

        // Ignore errors for individual files (might be binary, etc.)
        if sink_result.is_ok() {
            results.extend(file_results);
        }
    }

    Ok(results)
}

/// Search for files by name pattern
///
/// Uses gitignore-aware walking for fast file search.
///
/// # Arguments
///
/// * `root` - Root directory to search in
/// * `pattern` - Glob pattern to match file names
/// * `options` - Search options
///
/// # Errors
///
/// Returns an error if the search fails
pub fn search_files(
    root: &Path,
    pattern: &str,
    options: &SearchOptions,
) -> Result<Vec<snowflake_core::SearchResult>> {
    let max_results = options.max_results.map(|n| n as usize);
    let case_sensitive = options.case_sensitive.unwrap_or(false);

    // Build walker
    let walker = WalkBuilder::new(root).build();

    let mut results: Vec<snowflake_core::SearchResult> = Vec::new();

    // Compile pattern for matching
    let pattern_lower = pattern.to_lowercase();

    for entry in walker.flatten() {
        // Check max results
        if let Some(max) = max_results {
            if results.len() >= max {
                break;
            }
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy();

        // Match against pattern
        let matches = if case_sensitive {
            name.contains(pattern)
        } else {
            name.to_lowercase().contains(&pattern_lower)
        };

        if matches {
            results.push(snowflake_core::SearchResult {
                path: path.to_string_lossy().into_owned(),
                name: name.into_owned(),
                is_dir: path.is_dir(),
            });
        }
    }

    Ok(results)
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use std::env;

    use super::*;

    #[tokio::test]
    #[expect(clippy::panic_in_result_fn, reason = "tests use assert! macros")]
    async fn test_file_operations() -> Result<()> {
        let temp_dir = env::temp_dir().join("snowflake_fs_test");
        fs::create_dir_all(&temp_dir).await?;

        let test_file = temp_dir.join("test.txt");
        let test_path = test_file.to_string_lossy().into_owned();

        // Write
        write_file(&test_path, "Hello, World!").await?;

        // Read
        let content = read_file(&test_path).await?;
        assert_eq!(content, "Hello, World!");

        // Exists
        assert!(file_exists(&test_path).await);

        // Info
        let info = get_file_info(&test_path).await?;
        assert_eq!(info.name, "test.txt");
        assert!(info.is_file);

        // Delete
        delete_file(&test_path).await?;
        assert!(!file_exists(&test_path).await);

        Ok(())
    }

    #[tokio::test]
    #[expect(clippy::panic_in_result_fn, reason = "tests use assert! macros")]
    async fn test_list_directory_hidden() -> Result<()> {
        let temp_dir = env::temp_dir().join("snowflake_fs_hidden_test");
        fs::create_dir_all(&temp_dir).await?;

        // Create files
        let visible_file = temp_dir.join("visible.txt");
        let hidden_file = temp_dir.join(".hidden.txt");

        write_file(&visible_file.to_string_lossy(), "visible").await?;
        write_file(&hidden_file.to_string_lossy(), "hidden").await?;

        // List without hidden
        let entries = list_directory(&temp_dir.to_string_lossy(), false).await?;
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"visible.txt"));
        assert!(!names.contains(&".hidden.txt"));

        // List with hidden
        let entries = list_directory(&temp_dir.to_string_lossy(), true).await?;
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"visible.txt"));
        assert!(names.contains(&".hidden.txt"));

        // Cleanup
        delete_file(&visible_file.to_string_lossy()).await?;
        delete_file(&hidden_file.to_string_lossy()).await?;

        Ok(())
    }

    #[tokio::test]
    #[expect(clippy::panic_in_result_fn, reason = "tests use assert! macros")]
    async fn test_copy_file() -> Result<()> {
        let temp_dir = env::temp_dir().join("snowflake_fs_copy_test");
        fs::create_dir_all(&temp_dir).await?;

        let source = temp_dir.join("source.txt");
        let dest = temp_dir.join("dest.txt");

        write_file(&source.to_string_lossy(), "copy me").await?;
        copy_file(&source.to_string_lossy(), &dest.to_string_lossy()).await?;

        let content = read_file(&dest.to_string_lossy()).await?;
        assert_eq!(content, "copy me");

        // Cleanup
        delete_file(&source.to_string_lossy()).await?;
        delete_file(&dest.to_string_lossy()).await?;

        Ok(())
    }

    #[tokio::test]
    #[expect(clippy::panic_in_result_fn, reason = "tests use assert! macros")]
    async fn test_bytes_operations() -> Result<()> {
        let temp_dir = env::temp_dir().join("snowflake_fs_bytes_test");
        fs::create_dir_all(&temp_dir).await?;

        let test_file = temp_dir.join("bytes.bin");
        let test_path = test_file.to_string_lossy().into_owned();

        let data: Vec<u8> = vec![0x00, 0x01, 0x02, 0xFF, 0xFE];
        write_file_bytes(&test_path, &data).await?;

        let read_data = read_file_bytes(&test_path).await?;
        assert_eq!(data, read_data);

        delete_file(&test_path).await?;

        Ok(())
    }
}
