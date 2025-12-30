//! Buffer type wrapping ropey::Rope for efficient text editing.

use std::fmt;

use ropey::Rope;

use super::{Position, Range};

/// A text buffer backed by a rope data structure for efficient editing.
#[derive(Debug, Clone, Default)]
pub struct Buffer {
    rope: Rope,
}

impl Buffer {
    /// Creates a new empty buffer.
    #[must_use]
    pub fn new() -> Self {
        Self { rope: Rope::new() }
    }

    /// Creates a buffer from text content.
    #[must_use]
    pub fn from_text(s: &str) -> Self {
        Self {
            rope: Rope::from_str(s),
        }
    }

    /// Inserts text at the given position.
    ///
    /// # Panics
    ///
    /// Panics if the position is out of bounds.
    pub fn insert(&mut self, pos: Position, text: &str) {
        let idx = self.pos_to_char_idx(pos);
        self.rope.insert(idx, text);
    }

    /// Deletes text in the given range.
    ///
    /// # Panics
    ///
    /// Panics if the range is out of bounds.
    pub fn delete(&mut self, range: Range) {
        let range = range.normalized();
        let start_idx = self.pos_to_char_idx(range.start);
        let end_idx = self.pos_to_char_idx(range.end);
        self.rope.remove(start_idx..end_idx);
    }

    /// Replaces text in the given range with new text.
    ///
    /// # Panics
    ///
    /// Panics if the range is out of bounds.
    pub fn replace(&mut self, range: Range, text: &str) {
        let range = range.normalized();
        let start_idx = self.pos_to_char_idx(range.start);
        let end_idx = self.pos_to_char_idx(range.end);
        self.rope.remove(start_idx..end_idx);
        self.rope.insert(start_idx, text);
    }

    /// Returns the entire buffer content as a string.
    #[must_use]
    pub fn text(&self) -> String {
        self.rope.to_string()
    }

    /// Returns the text in the given range.
    #[must_use]
    pub fn slice(&self, range: Range) -> String {
        let range = range.normalized();
        let start_idx = self.pos_to_char_idx(range.start);
        let end_idx = self.pos_to_char_idx(range.end);
        self.rope.slice(start_idx..end_idx).to_string()
    }

    /// Returns a specific line (0-indexed), or None if out of bounds.
    #[must_use]
    pub fn line(&self, n: usize) -> Option<String> {
        if n >= self.rope.len_lines() {
            return None;
        }
        let line = self.rope.line(n);
        Some(line.to_string())
    }

    /// Returns the number of lines in the buffer.
    #[must_use]
    pub fn line_count(&self) -> usize {
        self.rope.len_lines()
    }

    /// Returns the number of characters in the buffer.
    #[must_use]
    pub fn char_count(&self) -> usize {
        self.rope.len_chars()
    }

    /// Returns the number of bytes in the buffer.
    #[must_use]
    pub fn byte_count(&self) -> usize {
        self.rope.len_bytes()
    }

    /// Returns true if the buffer is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.rope.len_chars() == 0
    }

    /// Converts a position to a character index.
    ///
    /// # Panics
    ///
    /// Panics if the position is out of bounds.
    #[must_use]
    pub fn pos_to_char_idx(&self, pos: Position) -> usize {
        let line = pos.line as usize;
        let col = pos.column as usize;

        if line >= self.rope.len_lines() {
            return self.rope.len_chars();
        }

        let line_start = self.rope.line_to_char(line);
        let line_len = self.rope.line(line).len_chars();

        // Clamp column to line length
        let clamped_col = col.min(line_len);
        line_start + clamped_col
    }

    /// Converts a character index to a position.
    #[must_use]
    pub fn char_idx_to_pos(&self, idx: usize) -> Position {
        let clamped_idx = idx.min(self.rope.len_chars());
        let line = self.rope.char_to_line(clamped_idx);
        let line_start = self.rope.line_to_char(line);
        let column = clamped_idx - line_start;

        Position::new(
            u32::try_from(line).unwrap_or(u32::MAX),
            u32::try_from(column).unwrap_or(u32::MAX),
        )
    }

    /// Returns the length of a specific line (0-indexed), or None if out of bounds.
    #[must_use]
    pub fn line_len(&self, line: usize) -> Option<usize> {
        if line >= self.rope.len_lines() {
            return None;
        }
        Some(self.rope.line(line).len_chars())
    }

    /// Returns the end position of the buffer.
    #[must_use]
    pub fn end_position(&self) -> Position {
        self.char_idx_to_pos(self.rope.len_chars())
    }
}

impl From<&str> for Buffer {
    fn from(s: &str) -> Self {
        Self::from_text(s)
    }
}

impl From<String> for Buffer {
    fn from(s: String) -> Self {
        Self::from_text(&s)
    }
}

impl fmt::Display for Buffer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.rope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_new() {
        let buf = Buffer::new();
        assert!(buf.is_empty());
        assert_eq!(buf.char_count(), 0);
        assert_eq!(buf.line_count(), 1); // Empty rope has 1 line
    }

    #[test]
    fn test_buffer_from_str() {
        let buf = Buffer::from_text("hello\nworld");
        assert_eq!(buf.char_count(), 11);
        assert_eq!(buf.line_count(), 2);
        assert_eq!(buf.text(), "hello\nworld");
    }

    #[test]
    fn test_buffer_insert() {
        let mut buf = Buffer::from_text("hello world");

        // Insert at beginning
        buf.insert(Position::new(0, 0), "say ");
        assert_eq!(buf.text(), "say hello world");

        // Insert in middle
        buf.insert(Position::new(0, 10), "beautiful ");
        assert_eq!(buf.text(), "say hello beautiful world");

        // Insert at end
        buf.insert(Position::new(0, 25), "!");
        assert_eq!(buf.text(), "say hello beautiful world!");
    }

    #[test]
    fn test_buffer_insert_multiline() {
        let mut buf = Buffer::from_text("line1\nline2\nline3");

        // Insert at beginning of line 2
        buf.insert(Position::new(1, 0), ">> ");
        assert_eq!(buf.text(), "line1\n>> line2\nline3");
    }

    #[test]
    fn test_buffer_delete() {
        let mut buf = Buffer::from_text("hello beautiful world");

        // Delete "beautiful "
        buf.delete(Range::new(Position::new(0, 6), Position::new(0, 16)));
        assert_eq!(buf.text(), "hello world");
    }

    #[test]
    fn test_buffer_delete_multiline() {
        let mut buf = Buffer::from_text("line1\nline2\nline3");

        // Delete from end of line1 to start of line3
        buf.delete(Range::new(Position::new(0, 5), Position::new(2, 0)));
        assert_eq!(buf.text(), "line1line3");
    }

    #[test]
    fn test_buffer_replace() {
        let mut buf = Buffer::from_text("hello world");

        // Replace "world" with "rust"
        buf.replace(
            Range::new(Position::new(0, 6), Position::new(0, 11)),
            "rust",
        );
        assert_eq!(buf.text(), "hello rust");
    }

    #[test]
    fn test_buffer_replace_expand() {
        let mut buf = Buffer::from_text("hi");

        // Replace "hi" with "hello world"
        buf.replace(
            Range::new(Position::new(0, 0), Position::new(0, 2)),
            "hello world",
        );
        assert_eq!(buf.text(), "hello world");
    }

    #[test]
    fn test_buffer_replace_shrink() {
        let mut buf = Buffer::from_text("hello world");

        // Replace "hello world" with "hi"
        buf.replace(Range::new(Position::new(0, 0), Position::new(0, 11)), "hi");
        assert_eq!(buf.text(), "hi");
    }

    #[test]
    fn test_buffer_line() {
        let buf = Buffer::from_text("line1\nline2\nline3");

        assert_eq!(buf.line(0), Some("line1\n".to_owned()));
        assert_eq!(buf.line(1), Some("line2\n".to_owned()));
        assert_eq!(buf.line(2), Some("line3".to_owned()));
        assert_eq!(buf.line(3), None);
    }

    #[test]
    fn test_buffer_slice() {
        let buf = Buffer::from_text("hello world");
        let slice = buf.slice(Range::new(Position::new(0, 0), Position::new(0, 5)));
        assert_eq!(slice, "hello");
    }

    #[test]
    fn test_buffer_pos_to_char_idx() {
        let buf = Buffer::from_text("line1\nline2\nline3");

        assert_eq!(buf.pos_to_char_idx(Position::new(0, 0)), 0);
        assert_eq!(buf.pos_to_char_idx(Position::new(0, 5)), 5);
        assert_eq!(buf.pos_to_char_idx(Position::new(1, 0)), 6);
        assert_eq!(buf.pos_to_char_idx(Position::new(1, 3)), 9);
        assert_eq!(buf.pos_to_char_idx(Position::new(2, 0)), 12);
    }

    #[test]
    fn test_buffer_char_idx_to_pos() {
        let buf = Buffer::from_text("line1\nline2\nline3");

        assert_eq!(buf.char_idx_to_pos(0), Position::new(0, 0));
        assert_eq!(buf.char_idx_to_pos(5), Position::new(0, 5));
        assert_eq!(buf.char_idx_to_pos(6), Position::new(1, 0));
        assert_eq!(buf.char_idx_to_pos(9), Position::new(1, 3));
        assert_eq!(buf.char_idx_to_pos(12), Position::new(2, 0));
    }

    #[test]
    fn test_buffer_line_count() {
        assert_eq!(Buffer::from_text("").line_count(), 1);
        assert_eq!(Buffer::from_text("a").line_count(), 1);
        assert_eq!(Buffer::from_text("a\n").line_count(), 2);
        assert_eq!(Buffer::from_text("a\nb").line_count(), 2);
        assert_eq!(Buffer::from_text("a\nb\nc").line_count(), 3);
    }

    #[test]
    fn test_buffer_end_position() {
        let buf = Buffer::from_text("line1\nline2");
        assert_eq!(buf.end_position(), Position::new(1, 5));

        let empty = Buffer::new();
        assert_eq!(empty.end_position(), Position::new(0, 0));
    }

    #[test]
    fn test_buffer_line_len() {
        let buf = Buffer::from_text("hello\nworld\n");
        assert_eq!(buf.line_len(0), Some(6)); // "hello\n"
        assert_eq!(buf.line_len(1), Some(6)); // "world\n"
        assert_eq!(buf.line_len(2), Some(0)); // Empty line after trailing newline
        assert_eq!(buf.line_len(3), None);
    }

    #[test]
    fn test_buffer_unicode() {
        let mut buf = Buffer::from_text("hello");
        buf.insert(Position::new(0, 5), " ");
        assert_eq!(buf.text(), "hello ");

        // Insert emoji (emoji is 1 char in Unicode)
        buf.insert(Position::new(0, 6), "\u{1F600}");
        assert_eq!(buf.char_count(), 7); // "hello " (6) + emoji (1) = 7
        assert_eq!(buf.text(), "hello \u{1F600}");
    }

    #[test]
    fn test_buffer_insert_at_end() {
        let mut buf = Buffer::from_text("hello");
        buf.insert(Position::new(0, 5), " world");
        assert_eq!(buf.text(), "hello world");
    }

    #[test]
    fn test_buffer_delete_entire() {
        let mut buf = Buffer::from_text("hello world");
        buf.delete(Range::new(Position::new(0, 0), Position::new(0, 11)));
        assert!(buf.is_empty());
        assert_eq!(buf.text(), "");
    }

    #[test]
    fn test_buffer_empty_operations() {
        let mut buf = Buffer::from_text("hello");

        // Insert empty string (no-op)
        buf.insert(Position::new(0, 0), "");
        assert_eq!(buf.text(), "hello");

        // Delete empty range (no-op)
        buf.delete(Range::new(Position::new(0, 0), Position::new(0, 0)));
        assert_eq!(buf.text(), "hello");

        // Replace with empty (deletion)
        buf.replace(Range::new(Position::new(0, 0), Position::new(0, 5)), "");
        assert!(buf.is_empty());
    }

    #[test]
    fn test_buffer_out_of_bounds_clamping() {
        let buf = Buffer::from_text("hi");

        // Position beyond buffer should clamp
        let idx = buf.pos_to_char_idx(Position::new(100, 100));
        assert_eq!(idx, 2); // Clamped to end

        // Column beyond line should clamp
        let idx = buf.pos_to_char_idx(Position::new(0, 100));
        assert_eq!(idx, 2); // Clamped to line end
    }
}
