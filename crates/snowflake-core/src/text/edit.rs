//! Edit types for undo/redo support.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::Range;

/// An edit operation that can be undone/redone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edit {
    /// The range that was modified
    pub range: Range,
    /// The new text that was inserted
    pub text: String,
    /// The old text that was replaced (for undo)
    pub old_text: String,
    /// Timestamp when the edit was made (Unix epoch milliseconds)
    pub timestamp: u64,
}

impl Edit {
    /// Creates a new edit.
    #[must_use]
    pub fn new(range: Range, text: String, old_text: String) -> Self {
        Self {
            range,
            text,
            old_text,
            timestamp: current_timestamp(),
        }
    }

    /// Creates an insertion edit (old_text is empty).
    #[must_use]
    pub fn insert(range: Range, text: String) -> Self {
        Self::new(range, text, String::new())
    }

    /// Creates a deletion edit (text is empty).
    #[must_use]
    pub fn delete(range: Range, old_text: String) -> Self {
        Self::new(range, String::new(), old_text)
    }

    /// Creates a replacement edit.
    #[must_use]
    pub fn replace(range: Range, text: String, old_text: String) -> Self {
        Self::new(range, text, old_text)
    }

    /// Returns the inverse edit (for undo).
    #[must_use]
    pub fn inverse(&self) -> Self {
        Self {
            range: self.range,
            text: self.old_text.clone(),
            old_text: self.text.clone(),
            timestamp: current_timestamp(),
        }
    }

    /// Returns true if this is an insertion (old_text is empty).
    #[must_use]
    pub fn is_insert(&self) -> bool {
        self.old_text.is_empty() && !self.text.is_empty()
    }

    /// Returns true if this is a deletion (text is empty).
    #[must_use]
    pub fn is_delete(&self) -> bool {
        self.text.is_empty() && !self.old_text.is_empty()
    }

    /// Returns true if this is a replacement (both text and old_text are non-empty).
    #[must_use]
    pub fn is_replace(&self) -> bool {
        !self.text.is_empty() && !self.old_text.is_empty()
    }

    /// Returns true if this is a no-op (both text and old_text are empty or equal).
    #[must_use]
    pub fn is_noop(&self) -> bool {
        self.text == self.old_text
    }
}

/// Edit history for undo/redo support.
#[derive(Debug, Clone, Default)]
pub struct EditHistory {
    /// Stack of edits that can be undone
    undo_stack: Vec<Edit>,
    /// Stack of edits that can be redone
    redo_stack: Vec<Edit>,
    /// Maximum number of edits to keep
    max_size: usize,
}

impl EditHistory {
    /// Default maximum history size
    pub const DEFAULT_MAX_SIZE: usize = 1000;

    /// Creates a new empty history with the default max size.
    #[must_use]
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_size: Self::DEFAULT_MAX_SIZE,
        }
    }

    /// Creates a new history with a custom max size.
    #[must_use]
    pub fn with_max_size(max_size: usize) -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_size,
        }
    }

    /// Pushes an edit onto the undo stack.
    ///
    /// This clears the redo stack (new edit branch).
    pub fn push(&mut self, edit: Edit) {
        // Skip no-op edits
        if edit.is_noop() {
            return;
        }

        // Clear redo stack on new edit
        self.redo_stack.clear();

        // Add to undo stack
        self.undo_stack.push(edit);

        // Trim if over max size
        if self.undo_stack.len() > self.max_size {
            let excess = self.undo_stack.len() - self.max_size;
            drop(self.undo_stack.drain(0..excess));
        }
    }

    /// Pops an edit from the undo stack and pushes its inverse to redo.
    ///
    /// Returns the edit to undo, or None if the undo stack is empty.
    pub fn undo(&mut self) -> Option<Edit> {
        let edit = self.undo_stack.pop()?;
        let inverse = edit.inverse();
        self.redo_stack.push(edit);
        Some(inverse)
    }

    /// Pops an edit from the redo stack and pushes it back to undo.
    ///
    /// Returns the edit to redo, or None if the redo stack is empty.
    pub fn redo(&mut self) -> Option<Edit> {
        let edit = self.redo_stack.pop()?;
        let result = edit.clone();
        self.undo_stack.push(edit);
        Some(result)
    }

    /// Clears both undo and redo stacks.
    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    /// Returns true if there are edits to undo.
    #[must_use]
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Returns true if there are edits to redo.
    #[must_use]
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Returns the number of edits in the undo stack.
    #[must_use]
    pub fn undo_count(&self) -> usize {
        self.undo_stack.len()
    }

    /// Returns the number of edits in the redo stack.
    #[must_use]
    pub fn redo_count(&self) -> usize {
        self.redo_stack.len()
    }

    /// Returns the maximum history size.
    #[must_use]
    pub fn max_size(&self) -> usize {
        self.max_size
    }

    /// Sets the maximum history size.
    ///
    /// If the current size exceeds the new max, oldest entries are removed.
    pub fn set_max_size(&mut self, max_size: usize) {
        self.max_size = max_size;

        if self.undo_stack.len() > max_size {
            let excess = self.undo_stack.len() - max_size;
            drop(self.undo_stack.drain(0..excess));
        }

        if self.redo_stack.len() > max_size {
            let excess = self.redo_stack.len() - max_size;
            drop(self.redo_stack.drain(0..excess));
        }
    }
}

/// Returns the current timestamp in milliseconds since Unix epoch.
fn current_timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| {
        // Truncation is acceptable: u64 can hold ~584 million years of milliseconds
        #[expect(
            clippy::cast_possible_truncation,
            reason = "u64 holds 584M years of ms"
        )]
        let ms = d.as_millis() as u64;
        ms
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::Position;

    fn make_range(start_col: u32, end_col: u32) -> Range {
        Range::new(Position::new(0, start_col), Position::new(0, end_col))
    }

    #[test]
    fn test_edit_new() {
        let range = make_range(0, 5);
        let edit = Edit::new(range, "hello".to_owned(), "world".to_owned());

        assert_eq!(edit.range, range);
        assert_eq!(edit.text, "hello");
        assert_eq!(edit.old_text, "world");
        assert!(edit.timestamp > 0);
    }

    #[test]
    fn test_edit_insert() {
        let range = make_range(0, 0);
        let edit = Edit::insert(range, "hello".to_owned());

        assert!(edit.is_insert());
        assert!(!edit.is_delete());
        assert!(!edit.is_replace());
    }

    #[test]
    fn test_edit_delete() {
        let range = make_range(0, 5);
        let edit = Edit::delete(range, "hello".to_owned());

        assert!(!edit.is_insert());
        assert!(edit.is_delete());
        assert!(!edit.is_replace());
    }

    #[test]
    fn test_edit_replace() {
        let range = make_range(0, 5);
        let edit = Edit::replace(range, "world".to_owned(), "hello".to_owned());

        assert!(!edit.is_insert());
        assert!(!edit.is_delete());
        assert!(edit.is_replace());
    }

    #[test]
    fn test_edit_inverse() {
        let range = make_range(0, 5);
        let edit = Edit::replace(range, "world".to_owned(), "hello".to_owned());
        let inverse = edit.inverse();

        assert_eq!(inverse.text, "hello");
        assert_eq!(inverse.old_text, "world");
    }

    #[test]
    fn test_edit_noop() {
        let range = make_range(0, 5);
        let noop = Edit::new(range, "same".to_owned(), "same".to_owned());
        assert!(noop.is_noop());

        let empty = Edit::new(range, String::new(), String::new());
        assert!(empty.is_noop());
    }

    #[test]
    fn test_history_push_undo() {
        let mut history = EditHistory::new();
        assert!(!history.can_undo());

        let edit = Edit::insert(make_range(0, 0), "hello".to_owned());
        history.push(edit);

        assert!(history.can_undo());
        assert_eq!(history.undo_count(), 1);
    }

    #[test]
    fn test_history_undo_returns_inverse() {
        let mut history = EditHistory::new();
        let edit = Edit::insert(make_range(0, 0), "hello".to_owned());
        history.push(edit);

        let undo = history.undo();
        assert!(undo.is_some());
        if let Some(undo) = undo {
            assert_eq!(undo.text, ""); // Inverse of insert is delete
            assert_eq!(undo.old_text, "hello");
        }
    }

    #[test]
    fn test_history_redo() {
        let mut history = EditHistory::new();
        history.push(Edit::insert(make_range(0, 0), "hello".to_owned()));

        let _ = history.undo();
        assert!(history.can_redo());

        let redo = history.redo();
        assert!(redo.is_some());
        if let Some(redo) = redo {
            assert_eq!(redo.text, "hello");
        }
    }

    #[test]
    fn test_history_new_edit_clears_redo() {
        let mut history = EditHistory::new();

        history.push(Edit::insert(make_range(0, 0), "a".to_owned()));
        let _ = history.undo();
        assert!(history.can_redo());

        // New edit should clear redo
        history.push(Edit::insert(make_range(0, 0), "b".to_owned()));
        assert!(!history.can_redo());
    }

    #[test]
    fn test_history_max_size() {
        let mut history = EditHistory::with_max_size(3);

        for i in 0_u32..5_u32 {
            history.push(Edit::insert(make_range(0, 0), i.to_string()));
        }

        assert_eq!(history.undo_count(), 3);
    }

    #[test]
    fn test_history_clear() {
        let mut history = EditHistory::new();

        history.push(Edit::insert(make_range(0, 0), "a".to_owned()));
        history.push(Edit::insert(make_range(0, 0), "b".to_owned()));
        let _ = history.undo();

        history.clear();

        assert!(!history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn test_history_skips_noop() {
        let mut history = EditHistory::new();

        // Push a no-op edit
        history.push(Edit::new(
            make_range(0, 0),
            "same".to_owned(),
            "same".to_owned(),
        ));

        assert!(!history.can_undo());
        assert_eq!(history.undo_count(), 0);
    }
}
