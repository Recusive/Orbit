//! Document type for managing text files.

use std::fs;
use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

use super::{Buffer, Edit, EditHistory, Range, Selection};
use crate::{Error, Result};

/// Atomic counter for generating unique document IDs
static DOCUMENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Generates a new unique document ID.
fn next_document_id() -> u64 {
    DOCUMENT_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
}

/// A text document with editing capabilities.
#[derive(Debug)]
pub struct Document {
    /// Unique document identifier
    id: u64,
    /// File path (None for untitled documents)
    path: Option<PathBuf>,
    /// Text buffer
    buffer: Buffer,
    /// Detected language (based on file extension)
    language: String,
    /// Whether the document has unsaved changes
    modified: bool,
    /// Document version (increments on each edit)
    version: u64,
    /// Edit history for undo/redo
    history: EditHistory,
    /// Current selections
    selections: Vec<Selection>,
}

impl Document {
    /// Creates a new untitled document.
    #[must_use]
    pub fn new() -> Self {
        Self {
            id: next_document_id(),
            path: None,
            buffer: Buffer::new(),
            language: "plaintext".to_owned(),
            modified: false,
            version: 0,
            history: EditHistory::new(),
            selections: vec![Selection::cursor(super::Position::zero())],
        }
    }

    /// Creates a document from text content.
    #[must_use]
    pub fn from_text(content: &str) -> Self {
        Self {
            id: next_document_id(),
            path: None,
            buffer: Buffer::from_text(content),
            language: "plaintext".to_owned(),
            modified: false,
            version: 0,
            history: EditHistory::new(),
            selections: vec![Selection::cursor(super::Position::zero())],
        }
    }

    /// Opens a document from a file path.
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be read.
    pub fn from_path(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path).map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                Error::FileNotFound(path.display().to_string())
            } else if e.kind() == io::ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        let language = Self::detect_language(path);

        Ok(Self {
            id: next_document_id(),
            path: Some(path.to_path_buf()),
            buffer: Buffer::from_text(&content),
            language,
            modified: false,
            version: 0,
            history: EditHistory::new(),
            selections: vec![Selection::cursor(super::Position::zero())],
        })
    }

    /// Saves the document to its current path.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The document has no path (use `save_as` instead)
    /// - The file cannot be written
    pub fn save(&mut self) -> Result<()> {
        let path = self
            .path
            .as_ref()
            .ok_or_else(|| Error::Other("Document has no path".to_owned()))?;

        self.save_to_path(path.clone().as_path())
    }

    /// Saves the document to a new path.
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be written.
    pub fn save_as(&mut self, path: &Path) -> Result<()> {
        self.save_to_path(path)?;
        self.path = Some(path.to_path_buf());
        self.language = Self::detect_language(path);
        Ok(())
    }

    /// Internal save implementation.
    fn save_to_path(&mut self, path: &Path) -> Result<()> {
        let mut file = fs::File::create(path).map_err(|e| {
            if e.kind() == io::ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        file.write_all(self.buffer.text().as_bytes())
            .map_err(Error::Io)?;

        self.modified = false;
        Ok(())
    }

    /// Detects the language based on file extension.
    #[must_use]
    pub fn detect_language(path: &Path) -> String {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map_or("plaintext", |ext| match ext.to_lowercase().as_str() {
                // Rust
                "rs" => "rust",
                // JavaScript/TypeScript
                "js" | "mjs" | "cjs" => "javascript",
                "jsx" => "javascriptreact",
                "ts" => "typescript",
                "tsx" => "typescriptreact",
                // Web
                "html" | "htm" => "html",
                "css" => "css",
                "scss" | "sass" => "scss",
                "less" => "less",
                // Data formats
                "json" => "json",
                "jsonc" => "jsonc",
                "yaml" | "yml" => "yaml",
                "toml" => "toml",
                "xml" => "xml",
                // Python
                "py" | "pyw" | "pyi" => "python",
                // Go
                "go" => "go",
                // C/C++
                "c" | "h" => "c",
                "cpp" | "cc" | "cxx" | "c++" | "hpp" | "hh" | "hxx" | "h++" => "cpp",
                // C#
                "cs" => "csharp",
                // Java
                "java" => "java",
                // Kotlin
                "kt" | "kts" => "kotlin",
                // Swift
                "swift" => "swift",
                // Ruby
                "rb" => "ruby",
                // PHP
                "php" => "php",
                // Shell
                "sh" | "bash" | "zsh" => "shellscript",
                "ps1" | "psm1" | "psd1" => "powershell",
                // Documentation
                "md" | "markdown" => "markdown",
                "rst" => "restructuredtext",
                // Config
                "ini" | "cfg" => "ini",
                "env" => "dotenv",
                // SQL
                "sql" => "sql",
                // GraphQL
                "graphql" | "gql" => "graphql",
                // Docker
                "dockerfile" => "dockerfile",
                // Unknown
                _ => "plaintext",
            })
            .to_owned()
    }

    /// Returns the display name for the document.
    #[must_use]
    pub fn display_name(&self) -> String {
        self.path.as_ref().map_or_else(
            || "Untitled".to_owned(),
            |path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Untitled")
                    .to_owned()
            },
        )
    }

    // ==================== Getters ====================

    /// Returns the document ID.
    #[must_use]
    pub const fn id(&self) -> u64 {
        self.id
    }

    /// Returns the file path, if any.
    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    /// Returns a reference to the buffer.
    #[must_use]
    pub const fn buffer(&self) -> &Buffer {
        &self.buffer
    }

    /// Returns a mutable reference to the buffer.
    #[must_use]
    pub fn buffer_mut(&mut self) -> &mut Buffer {
        &mut self.buffer
    }

    /// Returns the detected language.
    #[must_use]
    pub fn language(&self) -> &str {
        &self.language
    }

    /// Returns whether the document has unsaved changes.
    #[must_use]
    pub const fn is_modified(&self) -> bool {
        self.modified
    }

    /// Returns the document version.
    #[must_use]
    pub const fn version(&self) -> u64 {
        self.version
    }

    /// Returns the text content.
    #[must_use]
    pub fn text(&self) -> String {
        self.buffer.text()
    }

    /// Returns the current selections.
    #[must_use]
    pub fn selections(&self) -> &[Selection] {
        &self.selections
    }

    /// Sets the selections.
    pub fn set_selections(&mut self, selections: Vec<Selection>) {
        if !selections.is_empty() {
            self.selections = selections;
        }
    }

    // ==================== Editing ====================

    /// Applies an edit to the document.
    pub fn apply_edit(&mut self, edit: Edit) {
        // Store old text for the edit history
        let old_text = self.buffer.slice(edit.range);

        // Apply the edit
        self.buffer.replace(edit.range, &edit.text);

        // Record in history
        self.history.push(Edit {
            range: edit.range,
            text: edit.text,
            old_text,
            timestamp: edit.timestamp,
        });

        // Update state
        self.modified = true;
        self.version = self.version.wrapping_add(1);
    }

    /// Inserts text at the given range (replacing any existing text).
    pub fn insert(&mut self, range: Range, text: &str) {
        let old_text = self.buffer.slice(range);
        self.buffer.replace(range, text);

        self.history
            .push(Edit::new(range, text.to_owned(), old_text));

        self.modified = true;
        self.version = self.version.wrapping_add(1);
    }

    /// Undoes the last edit.
    ///
    /// Returns true if an edit was undone.
    pub fn undo(&mut self) -> bool {
        // history.undo() returns the INVERSE of the original edit:
        // - inverse.range = original.range (where the edit happened)
        // - inverse.text = original.old_text (what was there before, to restore)
        // - inverse.old_text = original.text (what was inserted, to delete)
        if let Some(inverse) = self.history.undo() {
            // Calculate the range of text that needs to be deleted
            // The inserted text starts at inverse.range.start
            // Its length is inverse.old_text.chars().count() (the text that was inserted)
            let start_idx = self.buffer.pos_to_char_idx(inverse.range.start);
            let inserted_len = inverse.old_text.chars().count();
            let end_idx = start_idx + inserted_len;
            let end_pos = self.buffer.char_idx_to_pos(end_idx);

            // The range to replace is from original start to where the inserted text ends
            let undo_range = Range::new(inverse.range.start, end_pos);

            // Replace the inserted text with the original text (inverse.text)
            self.buffer.replace(undo_range, &inverse.text);
            self.modified = true;
            self.version = self.version.wrapping_add(1);
            true
        } else {
            false
        }
    }

    /// Redoes the last undone edit.
    ///
    /// Returns true if an edit was redone.
    pub fn redo(&mut self) -> bool {
        if let Some(edit) = self.history.redo() {
            // For redo, we apply the original edit again
            // The range is where to apply it, text is what to insert
            self.buffer.replace(edit.range, &edit.text);
            self.modified = true;
            self.version = self.version.wrapping_add(1);
            true
        } else {
            false
        }
    }

    /// Returns whether undo is available.
    #[must_use]
    pub fn can_undo(&self) -> bool {
        self.history.can_undo()
    }

    /// Returns whether redo is available.
    #[must_use]
    pub fn can_redo(&self) -> bool {
        self.history.can_redo()
    }

    /// Clears the edit history.
    pub fn clear_history(&mut self) {
        self.history.clear();
    }

    /// Marks the document as unmodified (e.g., after save).
    pub fn mark_saved(&mut self) {
        self.modified = false;
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

/// Document metadata for serialization (without buffer content).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    /// Document ID
    pub id: u64,
    /// File path
    pub path: Option<String>,
    /// Language
    pub language: String,
    /// Whether modified
    pub modified: bool,
    /// Version
    pub version: u64,
    /// Display name
    pub display_name: String,
    /// Line count
    pub line_count: usize,
    /// Character count
    pub char_count: usize,
}

impl From<&Document> for DocumentMeta {
    fn from(doc: &Document) -> Self {
        Self {
            id: doc.id(),
            path: doc.path().map(|p| p.display().to_string()),
            language: doc.language().to_owned(),
            modified: doc.is_modified(),
            version: doc.version(),
            display_name: doc.display_name(),
            line_count: doc.buffer().line_count(),
            char_count: doc.buffer().char_count(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::Position;

    #[test]
    fn test_document_new() {
        let doc = Document::new();
        assert!(doc.path().is_none());
        assert_eq!(doc.language(), "plaintext");
        assert!(!doc.is_modified());
        assert_eq!(doc.version(), 0);
        assert!(doc.text().is_empty());
    }

    #[test]
    fn test_document_from_str() {
        let doc = Document::from_text("hello world");
        assert_eq!(doc.text(), "hello world");
        assert!(!doc.is_modified());
    }

    #[test]
    fn test_document_display_name() {
        let doc = Document::new();
        assert_eq!(doc.display_name(), "Untitled");
    }

    #[test]
    fn test_document_detect_language() {
        assert_eq!(Document::detect_language(Path::new("foo.rs")), "rust");
        assert_eq!(Document::detect_language(Path::new("foo.ts")), "typescript");
        assert_eq!(
            Document::detect_language(Path::new("foo.tsx")),
            "typescriptreact"
        );
        assert_eq!(Document::detect_language(Path::new("foo.py")), "python");
        assert_eq!(Document::detect_language(Path::new("foo.go")), "go");
        assert_eq!(Document::detect_language(Path::new("foo.json")), "json");
        assert_eq!(Document::detect_language(Path::new("foo.md")), "markdown");
        assert_eq!(
            Document::detect_language(Path::new("foo.unknown")),
            "plaintext"
        );
        assert_eq!(Document::detect_language(Path::new("foo")), "plaintext");
    }

    #[test]
    fn test_document_insert() {
        let mut doc = Document::from_text("hello world");
        doc.insert(
            Range::new(Position::new(0, 6), Position::new(0, 11)),
            "rust",
        );
        assert_eq!(doc.text(), "hello rust");
        assert!(doc.is_modified());
        assert_eq!(doc.version(), 1);
    }

    #[test]
    fn test_document_undo_redo() {
        let mut doc = Document::from_text("hello");

        // Insert " world"
        doc.insert(
            Range::new(Position::new(0, 5), Position::new(0, 5)),
            " world",
        );
        assert_eq!(doc.text(), "hello world");

        // Undo
        assert!(doc.can_undo());
        assert!(doc.undo());
        assert_eq!(doc.text(), "hello");

        // Redo
        assert!(doc.can_redo());
        assert!(doc.redo());
        assert_eq!(doc.text(), "hello world");
    }

    #[test]
    fn test_document_selections() {
        let mut doc = Document::new();
        assert_eq!(doc.selections().len(), 1);

        let new_selections = vec![
            Selection::cursor(Position::new(0, 0)),
            Selection::cursor(Position::new(1, 0)).with_primary(false),
        ];
        doc.set_selections(new_selections);
        assert_eq!(doc.selections().len(), 2);
    }

    #[test]
    fn test_document_meta() {
        let doc = Document::from_text("hello\nworld");
        let meta = DocumentMeta::from(&doc);

        assert_eq!(meta.language, "plaintext");
        assert!(!meta.modified);
        assert_eq!(meta.line_count, 2);
        assert_eq!(meta.char_count, 11);
    }

    #[test]
    fn test_document_multiple_undo_redo() {
        let mut doc = Document::from_text("");

        // Make multiple edits
        doc.insert(Range::new(Position::new(0, 0), Position::new(0, 0)), "a");
        doc.insert(Range::new(Position::new(0, 1), Position::new(0, 1)), "b");
        doc.insert(Range::new(Position::new(0, 2), Position::new(0, 2)), "c");
        assert_eq!(doc.text(), "abc");

        // Undo all
        assert!(doc.undo());
        assert_eq!(doc.text(), "ab");
        assert!(doc.undo());
        assert_eq!(doc.text(), "a");
        assert!(doc.undo());
        assert_eq!(doc.text(), "");

        // Redo all
        assert!(doc.redo());
        assert_eq!(doc.text(), "a");
        assert!(doc.redo());
        assert_eq!(doc.text(), "ab");
        assert!(doc.redo());
        assert_eq!(doc.text(), "abc");
    }

    #[test]
    fn test_document_undo_when_empty() {
        let mut doc = Document::from_text("hello");
        assert!(!doc.can_undo());
        assert!(!doc.undo()); // Should return false
    }

    #[test]
    fn test_document_redo_after_new_edit() {
        let mut doc = Document::from_text("hello");

        // Make an edit and undo it
        doc.insert(Range::new(Position::new(0, 5), Position::new(0, 5)), "!");
        assert_eq!(doc.text(), "hello!");
        assert!(doc.undo());
        assert_eq!(doc.text(), "hello");
        assert!(doc.can_redo());

        // New edit should clear redo stack
        doc.insert(Range::new(Position::new(0, 5), Position::new(0, 5)), "?");
        assert_eq!(doc.text(), "hello?");
        assert!(!doc.can_redo());
    }

    #[test]
    fn test_document_multiline_undo() {
        let mut doc = Document::from_text("line1");

        // Insert newline and second line
        doc.insert(
            Range::new(Position::new(0, 5), Position::new(0, 5)),
            "\nline2",
        );
        assert_eq!(doc.text(), "line1\nline2");
        assert_eq!(doc.buffer().line_count(), 2);

        // Undo should restore single line
        assert!(doc.undo());
        assert_eq!(doc.text(), "line1");
        assert_eq!(doc.buffer().line_count(), 1);
    }

    #[test]
    fn test_document_replacement_undo() {
        let mut doc = Document::from_text("hello world");

        // Replace "world" with "rust"
        doc.insert(
            Range::new(Position::new(0, 6), Position::new(0, 11)),
            "rust",
        );
        assert_eq!(doc.text(), "hello rust");

        // Undo should restore "world"
        assert!(doc.undo());
        assert_eq!(doc.text(), "hello world");
    }
}
