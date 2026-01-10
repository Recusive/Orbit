//! Orbit Search - File and text search
//!
//! This crate provides fast search functionality using ripgrep-like capabilities.

use std::fs;
use std::time::Instant;

use ignore::WalkBuilder;
use orbit_core::{Result, SearchOptions, SearchResult, TextSearchResult};
use tracing::debug;

/// Search manager for file and text search
#[derive(Debug, Clone, Copy)]
pub struct SearchManager;

impl SearchManager {
    /// Create a new search manager
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    /// Search for files by name
    pub async fn search_files(
        &self,
        root_path: &str,
        query: &str,
        search_options: Option<SearchOptions>,
    ) -> Result<Vec<SearchResult>> {
        let start = Instant::now();
        debug!(target: "orbit::perf", "[SEARCH:search_files] START - query={query:?}");

        let options = search_options.unwrap_or_default();
        let max_results = options.max_results.map_or(100, |n| n as usize);
        let query_lower = query.to_lowercase();

        let mut results = Vec::new();
        let mut files_scanned: usize = 0;

        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .ignore(true)
            .git_ignore(true)
            .git_global(true)
            .build();

        for entry in walker.flatten() {
            files_scanned += 1;
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();

            if name.to_lowercase().contains(&query_lower) {
                results.push(SearchResult {
                    path: path.to_string_lossy().into_owned(),
                    name,
                    is_dir: path.is_dir(),
                });

                if results.len() >= max_results {
                    break;
                }
            }
        }

        let elapsed = start.elapsed().as_millis();
        debug!(
            target: "orbit::perf",
            "[SEARCH:search_files] END ({elapsed}ms) - {files_scanned} files scanned, {} matches",
            results.len()
        );

        Ok(results)
    }

    /// Search for text in files
    pub async fn search_text(
        &self,
        root_path: &str,
        pattern: &str,
        search_options: Option<SearchOptions>,
    ) -> Result<Vec<TextSearchResult>> {
        let start = Instant::now();
        debug!(target: "orbit::perf", "[SEARCH:search_text] START - pattern={pattern:?}");

        let options = search_options.unwrap_or_default();
        let max_results = options.max_results.map_or(100, |n| n as usize);
        let case_sensitive = options.case_sensitive.unwrap_or(false);

        let mut results = Vec::new();
        let mut files_scanned: usize = 0;
        let mut files_read: usize = 0;

        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .ignore(true)
            .git_ignore(true)
            .git_global(true)
            .build();

        for entry in walker.flatten() {
            files_scanned += 1;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Ok(content) = fs::read_to_string(path) {
                files_read += 1;
                for (line_num, line) in content.lines().enumerate() {
                    let matches = if case_sensitive {
                        line.contains(pattern)
                    } else {
                        line.to_lowercase().contains(&pattern.to_lowercase())
                    };

                    if matches {
                        let column = if case_sensitive {
                            line.find(pattern)
                        } else {
                            line.to_lowercase().find(&pattern.to_lowercase())
                        };

                        // Safe conversions with saturation
                        let line_u32 =
                            u32::try_from(line_num.saturating_add(1)).unwrap_or(u32::MAX);
                        let column_u32 = u32::try_from(column.unwrap_or(0)).unwrap_or(u32::MAX);
                        let match_len_u32 = u32::try_from(pattern.len()).unwrap_or(u32::MAX);

                        results.push(TextSearchResult {
                            path: path.to_string_lossy().into_owned(),
                            line: line_u32,
                            column: column_u32,
                            match_length: match_len_u32,
                            line_content: line.to_owned(),
                            before_context: None,
                            after_context: None,
                        });

                        if results.len() >= max_results {
                            let elapsed = start.elapsed().as_millis();
                            debug!(
                                target: "orbit::perf",
                                "[SEARCH:search_text] END ({elapsed}ms) - {files_scanned} entries, {files_read} files read, {} matches (max reached)",
                                results.len()
                            );
                            return Ok(results);
                        }
                    }
                }
            }
        }

        let elapsed = start.elapsed().as_millis();
        debug!(
            target: "orbit::perf",
            "[SEARCH:search_text] END ({elapsed}ms) - {files_scanned} entries, {files_read} files read, {} matches",
            results.len()
        );

        Ok(results)
    }
}

impl Default for SearchManager {
    fn default() -> Self {
        Self::new()
    }
}
