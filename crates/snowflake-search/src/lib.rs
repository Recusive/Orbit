//! Snowflake Search - File and text search
//!
//! This crate provides fast search functionality using ripgrep-like capabilities.

use ignore::WalkBuilder;
use snowflake_core::{Result, SearchOptions, SearchResult, TextSearchResult};

/// Search manager for file and text search
pub struct SearchManager;

impl SearchManager {
    /// Create a new search manager
    pub fn new() -> Self {
        Self
    }

    /// Search for files by name
    pub async fn search_files(
        &self,
        root_path: &str,
        query: &str,
        options: Option<SearchOptions>,
    ) -> Result<Vec<SearchResult>> {
        let options = options.unwrap_or_default();
        let max_results = options.max_results.unwrap_or(100) as usize;
        let query_lower = query.to_lowercase();

        let mut results = Vec::new();

        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .ignore(true)
            .git_ignore(true)
            .git_global(true)
            .build();

        for entry in walker.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if name.to_lowercase().contains(&query_lower) {
                results.push(SearchResult {
                    path: path.to_string_lossy().to_string(),
                    name,
                    is_dir: path.is_dir(),
                });

                if results.len() >= max_results {
                    break;
                }
            }
        }

        Ok(results)
    }

    /// Search for text in files
    pub async fn search_text(
        &self,
        root_path: &str,
        pattern: &str,
        options: Option<SearchOptions>,
    ) -> Result<Vec<TextSearchResult>> {
        let options = options.unwrap_or_default();
        let max_results = options.max_results.unwrap_or(100) as usize;
        let case_sensitive = options.case_sensitive.unwrap_or(false);

        let mut results = Vec::new();

        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .ignore(true)
            .git_ignore(true)
            .git_global(true)
            .build();

        for entry in walker.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Ok(content) = std::fs::read_to_string(path) {
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

                        results.push(TextSearchResult {
                            path: path.to_string_lossy().to_string(),
                            line: (line_num + 1) as u32,
                            column: column.unwrap_or(0) as u32,
                            match_length: pattern.len() as u32,
                            line_content: line.to_string(),
                            before_context: None,
                            after_context: None,
                        });

                        if results.len() >= max_results {
                            return Ok(results);
                        }
                    }
                }
            }
        }

        Ok(results)
    }
}

impl Default for SearchManager {
    fn default() -> Self {
        Self::new()
    }
}
