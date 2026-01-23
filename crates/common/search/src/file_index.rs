//! File index with fuzzy search powered by Nucleo matcher.
//!
//! This module provides fast fuzzy file search for the @ mention picker.
//! Files are indexed on workspace open and incrementally updated on file changes.

use std::path::{Path, PathBuf};
use std::time::Instant;

use ignore::WalkBuilder;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use orbit_core::FuzzySearchResult;
use tracing::debug;

/// File extensions that are indexed for fuzzy search.
///
/// These are common code and configuration file extensions.
pub const INDEXABLE_EXTENSIONS: &[&str] = &[
    // JavaScript/TypeScript
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    // Systems languages
    "rs",
    "go",
    "c",
    "cpp",
    "h",
    "hpp",
    "zig",
    "nim",
    // JVM languages
    "java",
    "kt",
    "scala",
    "groovy",
    "properties",
    // Scripting languages
    "py",
    "rb",
    "php",
    "pl",
    "pm",
    "lua",
    "r",
    // Apple/Microsoft
    "swift",
    "cs",
    "fs",
    "vb",
    // Data formats
    "json",
    "yaml",
    "yml",
    "toml",
    "xml",
    "ini",
    "env",
    "csv",
    "tsv",
    // Documentation
    "md",
    "mdx",
    "txt",
    "rst",
    "adoc",
    "tex",
    // Web
    "html",
    "htm",
    "css",
    "scss",
    "less",
    "sass",
    "vue",
    "svelte",
    "astro",
    // Shell
    "sh",
    "bash",
    "zsh",
    "fish",
    "ps1",
    "bat",
    "cmd",
    // Database/Query
    "sql",
    "graphql",
    "prisma",
    // Build systems
    "cmake",
    "gradle",
    "mk",
    // Config files
    "conf",
    "cfg",
    "config",
    // Infrastructure
    "tf",
    "tfvars",
    "hcl",
    "proto",
    // Lock files (often useful to search)
    "lock",
];

/// Filenames (without extension) that should be indexed.
///
/// These are common configuration and build files that don't have standard extensions.
pub const INDEXABLE_NAMES: &[&str] = &[
    // Build files
    "Makefile",
    "Dockerfile",
    "Justfile",
    "Procfile",
    "Vagrantfile",
    "Gemfile",
    "Rakefile",
    "Brewfile",
    "BUILD",
    "WORKSPACE",
    "CMakeLists.txt",
    // Git config
    ".gitignore",
    ".gitattributes",
    // Docker config
    ".dockerignore",
    // Prettier config
    ".prettierignore",
    ".prettierrc",
    // Environment files
    ".env",
    ".env.local",
    ".env.example",
    ".env.development",
    ".env.production",
    // Linting/formatting config
    ".eslintrc",
    ".editorconfig",
    ".stylelintrc",
    ".babelrc",
    ".browserslistrc",
    // Package manager config
    ".npmrc",
    ".nvmrc",
    ".yarnrc",
];

/// A single indexed file entry.
#[derive(Debug, Clone)]
pub struct IndexEntry {
    /// Absolute path to the file.
    pub path: PathBuf,
    /// Filename only (for matching).
    pub name: String,
}

impl IndexEntry {
    /// Create an index entry from a path, relative to root.
    ///
    /// Returns `None` if the path is not indexable.
    #[must_use]
    pub fn from_path(path: PathBuf, _root: &Path) -> Option<Self> {
        if !Self::is_indexable(&path) {
            return None;
        }

        let name = path.file_name()?.to_string_lossy().into_owned();

        Some(Self { path, name })
    }

    /// Check if a path should be indexed based on extension or filename.
    #[must_use]
    pub fn is_indexable(path: &Path) -> bool {
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            return false;
        };

        // Check if filename is in the whitelist
        if INDEXABLE_NAMES.contains(&name) {
            return true;
        }

        // Check extension
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            return INDEXABLE_EXTENSIONS.contains(&ext);
        }

        false
    }
}

/// File index for fuzzy searching workspace files.
///
/// Maintains an in-memory index of files that can be searched using fuzzy matching.
#[derive(Debug)]
pub struct FileIndex {
    /// Indexed file entries.
    entries: Vec<IndexEntry>,
    /// Root path of the workspace.
    root_path: PathBuf,
}

impl FileIndex {
    /// Build a new file index by walking the workspace.
    ///
    /// Uses `.gitignore` and other ignore files to filter out untracked files.
    #[must_use]
    pub fn build(root_path: PathBuf) -> Self {
        let start = Instant::now();
        debug!(target: "orbit::search", "[FileIndex::build] START - root={}", root_path.display());

        let mut entries = Vec::new();

        let walker = WalkBuilder::new(&root_path)
            .hidden(true) // Include hidden files (we filter by extension/name)
            .ignore(false) // Don't respect .ignore files - index everything
            .git_ignore(false) // Don't respect .gitignore - index everything
            .git_global(false) // Don't respect global gitignore
            .git_exclude(false) // Don't respect .git/info/exclude
            .follow_links(false) // Don't follow symlinks (avoid cycles)
            .filter_entry(|entry| {
                // Skip .git directory and node_modules (too many files)
                let dominated_items = [".git", "node_modules", ".next", "target", "dist", "build", "__pycache__", ".venv", "venv"];
                entry
                    .file_name()
                    .to_str()
                    .is_none_or(|name| !dominated_items.contains(&name))
            })
            .build();

        for entry in walker.flatten() {
            let path = entry.path();

            // Skip directories
            if !path.is_file() {
                continue;
            }

            if let Some(index_entry) = IndexEntry::from_path(path.to_path_buf(), &root_path) {
                entries.push(index_entry);
            }
        }

        let elapsed = start.elapsed().as_millis();
        debug!(
            target: "orbit::search",
            "[FileIndex::build] END ({elapsed}ms) - indexed {} files",
            entries.len()
        );

        Self { entries, root_path }
    }

    /// Add a file to the index.
    ///
    /// Skips if the file is not indexable or already exists.
    pub fn add(&mut self, path: PathBuf) {
        // Skip if not indexable
        if !IndexEntry::is_indexable(&path) {
            return;
        }

        // Skip if already indexed
        if self.entries.iter().any(|e| e.path == path) {
            return;
        }

        if let Some(entry) = IndexEntry::from_path(path, &self.root_path) {
            self.entries.push(entry);
        }
    }

    /// Remove a file from the index.
    pub fn remove(&mut self, path: &Path) {
        self.entries.retain(|e| e.path != path);
    }

    /// Get initial files when no query is provided.
    ///
    /// Returns files sorted alphabetically by relative path.
    /// Useful for showing a default list when the user opens the @ mention picker.
    #[must_use]
    pub fn get_initial(&self, max_results: usize) -> Vec<FuzzySearchResult> {
        // Sort entries by relative path for consistent ordering
        let mut entries: Vec<_> = self.entries.iter().collect();
        entries.sort_by(|a, b| {
            let path_a = a.path.strip_prefix(&self.root_path).unwrap_or(&a.path);
            let path_b = b.path.strip_prefix(&self.root_path).unwrap_or(&b.path);
            path_a.cmp(path_b)
        });

        entries
            .into_iter()
            .take(max_results)
            .map(|entry| {
                let relative_path = entry
                    .path
                    .strip_prefix(&self.root_path)
                    .unwrap_or(&entry.path)
                    .to_string_lossy()
                    .replace('\\', "/");

                FuzzySearchResult {
                    path: relative_path,
                    name: entry.name.clone(),
                    score: 0,
                    match_indices: vec![],
                }
            })
            .collect()
    }

    /// Search the index with a fuzzy query.
    ///
    /// Returns results sorted by match score (highest first).
    /// If query is empty, returns initial files sorted alphabetically by path.
    #[must_use]
    pub fn search(&self, query: &str, max_results: usize) -> Vec<FuzzySearchResult> {
        // Empty query: return initial files sorted by path
        if query.is_empty() {
            return self.get_initial(max_results);
        }

        let start = Instant::now();
        debug!(target: "orbit::search", "[FileIndex::search] START - query={query:?}, max={max_results}");

        // Configure matcher for path matching
        let config = Config::DEFAULT.match_paths();
        let mut matcher = Matcher::new(config);

        // Parse pattern with smart case matching
        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);

        // Score each entry
        let mut scored: Vec<(u32, &IndexEntry, Vec<u32>)> = Vec::new();

        for entry in &self.entries {
            // Get relative path for matching (allows searching by directory + filename)
            let relative_path = entry
                .path
                .strip_prefix(&self.root_path)
                .unwrap_or(&entry.path)
                .to_string_lossy();

            // Try matching against full path first
            let mut path_indices = Vec::new();
            let mut path_buf = Vec::new();
            let path_haystack = Utf32Str::new(&relative_path, &mut path_buf);

            if let Some(path_score) =
                pattern.indices(path_haystack, &mut matcher, &mut path_indices)
            {
                // Now get highlight indices for just the filename (for display)
                let mut name_indices = Vec::new();
                let mut name_buf = Vec::new();
                let name_haystack = Utf32Str::new(&entry.name, &mut name_buf);

                // Try to get indices for filename - if no match, use empty indices
                let _ = pattern.indices(name_haystack, &mut matcher, &mut name_indices);

                scored.push((path_score, entry, name_indices));
            }
        }

        // Sort by score descending
        scored.sort_by(|a, b| b.0.cmp(&a.0));

        // Take top results and convert to FuzzySearchResult
        let results: Vec<FuzzySearchResult> = scored
            .into_iter()
            .take(max_results)
            .map(|(score, entry, match_indices)| {
                // Make path relative to root
                let relative_path = entry
                    .path
                    .strip_prefix(&self.root_path)
                    .unwrap_or(&entry.path)
                    .to_string_lossy()
                    .replace('\\', "/");

                FuzzySearchResult {
                    path: relative_path,
                    name: entry.name.clone(),
                    score,
                    match_indices,
                }
            })
            .collect();

        let elapsed = start.elapsed().as_micros();
        debug!(
            target: "orbit::search",
            "[FileIndex::search] END ({elapsed}μs) - {} results",
            results.len()
        );

        results
    }

    /// Get the number of indexed files.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if the index is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Get the root path of the workspace.
    #[must_use]
    pub fn root_path(&self) -> &Path {
        &self.root_path
    }
}

#[cfg(test)]
#[expect(
    clippy::expect_used,
    clippy::indexing_slicing,
    reason = "Tests use expect/indexing for clarity - panics are appropriate in test setup"
)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write as _;

    fn create_test_workspace() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let root = dir.path();

        // Create test files
        let files = [
            "Button.tsx",
            "button-group.tsx",
            "Modal.tsx",
            "index.ts",
            "config.json",
            "README.md",
            ".gitignore",
        ];

        for file in files {
            let path = root.join(file);
            let mut f = File::create(&path).expect("Failed to create file");
            writeln!(f, "// {file}").expect("Failed to write file");
        }

        // Create a subdirectory with files
        let components_dir = root.join("components");
        fs::create_dir(&components_dir).expect("Failed to create dir");
        let mut f = File::create(components_dir.join("Header.tsx")).expect("Failed to create file");
        writeln!(f, "// Header.tsx").expect("Failed to write file");

        dir
    }

    #[test]
    fn test_search_basic() {
        let workspace = create_test_workspace();
        let index = FileIndex::build(workspace.path().to_path_buf());

        // Should find button files when searching "btn"
        let results = index.search("btn", 10);

        // Should have at least one result
        assert!(!results.is_empty(), "Expected results for 'btn' query");

        // First result should be a button file (highest score)
        let first = &results[0];
        assert!(
            first.name.to_lowercase().contains("button"),
            "Expected button file, got: {}",
            first.name
        );

        // Should have match indices
        assert!(
            !first.match_indices.is_empty(),
            "Expected match indices for highlighting"
        );
    }

    #[test]
    fn test_search_empty_query_returns_initial_files() {
        let workspace = create_test_workspace();
        let index = FileIndex::build(workspace.path().to_path_buf());

        let results = index.search("", 10);
        // Empty query should return initial files sorted alphabetically
        assert!(
            !results.is_empty(),
            "Empty query should return initial files"
        );

        // Results should be sorted alphabetically by path
        let paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        let mut sorted_paths = paths.clone();
        sorted_paths.sort_unstable();
        assert_eq!(
            paths, sorted_paths,
            "Results should be sorted alphabetically"
        );

        // Match indices should be empty (no query to match)
        for result in &results {
            assert!(
                result.match_indices.is_empty(),
                "Initial files should have no match indices"
            );
            assert_eq!(result.score, 0, "Initial files should have score 0");
        }
    }

    #[test]
    fn test_is_indexable() {
        // Test extensions
        assert!(IndexEntry::is_indexable(Path::new("file.ts")));
        assert!(IndexEntry::is_indexable(Path::new("file.tsx")));
        assert!(IndexEntry::is_indexable(Path::new("file.rs")));
        assert!(IndexEntry::is_indexable(Path::new("file.py")));
        assert!(IndexEntry::is_indexable(Path::new("file.json")));

        // Test non-indexable
        assert!(!IndexEntry::is_indexable(Path::new("file.png")));
        assert!(!IndexEntry::is_indexable(Path::new("file.jpg")));
        assert!(!IndexEntry::is_indexable(Path::new("file.exe")));

        // Test whitelisted names
        assert!(IndexEntry::is_indexable(Path::new("Makefile")));
        assert!(IndexEntry::is_indexable(Path::new("Dockerfile")));
        assert!(IndexEntry::is_indexable(Path::new(".gitignore")));
        assert!(IndexEntry::is_indexable(Path::new(".env")));
        assert!(IndexEntry::is_indexable(Path::new(".env.local")));
    }

    #[test]
    fn test_add_remove() {
        let workspace = create_test_workspace();
        let mut index = FileIndex::build(workspace.path().to_path_buf());

        let initial_count = index.len();

        // Add a new file
        let new_file = workspace.path().join("NewComponent.tsx");
        drop(File::create(&new_file).expect("Failed to create file"));
        index.add(new_file.clone());

        assert_eq!(index.len(), initial_count + 1);

        // Remove it
        index.remove(&new_file);
        assert_eq!(index.len(), initial_count);
    }

    #[test]
    fn test_search_case_insensitive() {
        let workspace = create_test_workspace();
        let index = FileIndex::build(workspace.path().to_path_buf());

        // Should find Modal.tsx with lowercase query
        let results = index.search("modal", 10);
        assert!(!results.is_empty(), "Expected case-insensitive match");
        assert!(results.iter().any(|r| r.name == "Modal.tsx"));
    }

    #[test]
    fn test_relative_paths() {
        let workspace = create_test_workspace();
        let index = FileIndex::build(workspace.path().to_path_buf());

        let results = index.search("Header", 10);
        assert!(!results.is_empty());

        // Path should be relative and use forward slashes
        let header_result = results.iter().find(|r| r.name == "Header.tsx");
        assert!(header_result.is_some());
        let path = &header_result.expect("Header.tsx not found").path;
        assert!(
            path.starts_with("components/"),
            "Expected relative path starting with components/, got: {path}"
        );
        assert!(!path.contains('\\'), "Path should use forward slashes");
    }
}
