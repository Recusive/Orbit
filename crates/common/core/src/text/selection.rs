//! Selection type for text editing.

use serde::{Deserialize, Serialize};

use super::{Position, Range};

/// The direction of a selection relative to the anchor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum SelectionDirection {
    /// Selection extends forward (head > anchor)
    #[default]
    Forward,
    /// Selection extends backward (head < anchor)
    Backward,
    /// No direction (cursor, anchor == head)
    None,
}

/// A selection in a text document.
///
/// A selection has an anchor (where selection started) and a head (current cursor position).
/// The anchor and head can be in any order - the selection can be forwards or backwards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    /// The anchor position (where selection started)
    pub anchor: Position,
    /// The head position (current cursor position)
    pub head: Position,
    /// Whether this is the primary selection in a multi-cursor scenario
    pub is_primary: bool,
}

impl Selection {
    /// Creates a cursor (zero-width selection) at the given position.
    #[must_use]
    pub const fn cursor(pos: Position) -> Self {
        Self {
            anchor: pos,
            head: pos,
            is_primary: true,
        }
    }

    /// Creates a selection from anchor to head.
    #[must_use]
    pub const fn new(anchor: Position, head: Position) -> Self {
        Self {
            anchor,
            head,
            is_primary: true,
        }
    }

    /// Creates a selection spanning a range (anchor at start, head at end).
    #[must_use]
    pub const fn range(start: Position, end: Position) -> Self {
        Self {
            anchor: start,
            head: end,
            is_primary: true,
        }
    }

    /// Creates a selection from a Range (anchor at start, head at end).
    #[must_use]
    pub const fn from_range(range: Range) -> Self {
        Self {
            anchor: range.start,
            head: range.end,
            is_primary: true,
        }
    }

    /// Returns true if this is a cursor (zero-width selection).
    #[must_use]
    pub fn is_cursor(&self) -> bool {
        self.anchor == self.head
    }

    /// Returns true if the selection is collapsed (same as is_cursor).
    #[must_use]
    pub fn collapsed(&self) -> bool {
        self.is_cursor()
    }

    /// Returns the direction of the selection.
    #[must_use]
    pub fn direction(&self) -> SelectionDirection {
        use std::cmp::Ordering;
        match self.anchor.cmp(&self.head) {
            Ordering::Less => SelectionDirection::Forward,
            Ordering::Greater => SelectionDirection::Backward,
            Ordering::Equal => SelectionDirection::None,
        }
    }

    /// Returns the selection as a normalized range (start <= end).
    #[must_use]
    pub fn to_range(&self) -> Range {
        if self.anchor <= self.head {
            Range::new(self.anchor, self.head)
        } else {
            Range::new(self.head, self.anchor)
        }
    }

    /// Returns the start position (minimum of anchor and head).
    #[must_use]
    pub fn start(&self) -> Position {
        if self.anchor <= self.head {
            self.anchor
        } else {
            self.head
        }
    }

    /// Returns the end position (maximum of anchor and head).
    #[must_use]
    pub fn end(&self) -> Position {
        if self.anchor >= self.head {
            self.anchor
        } else {
            self.head
        }
    }

    /// Returns a new selection with the primary flag set.
    #[must_use]
    pub const fn with_primary(self, is_primary: bool) -> Self {
        Self { is_primary, ..self }
    }

    /// Moves the head to a new position, keeping the anchor fixed.
    #[must_use]
    pub const fn extend_to(self, head: Position) -> Self {
        Self { head, ..self }
    }

    /// Moves both anchor and head to a new position (collapses to cursor).
    #[must_use]
    pub const fn move_to(self, pos: Position) -> Self {
        Self {
            anchor: pos,
            head: pos,
            ..self
        }
    }

    /// Flips the selection (swaps anchor and head).
    #[must_use]
    pub const fn flip(self) -> Self {
        Self {
            anchor: self.head,
            head: self.anchor,
            ..self
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_selection_cursor() {
        let pos = Position::new(5, 10);
        let sel = Selection::cursor(pos);

        assert!(sel.is_cursor());
        assert!(sel.collapsed());
        assert_eq!(sel.anchor, pos);
        assert_eq!(sel.head, pos);
        assert!(sel.is_primary);
        assert_eq!(sel.direction(), SelectionDirection::None);
    }

    #[test]
    fn test_selection_range() {
        let start = Position::new(1, 0);
        let end = Position::new(1, 10);
        let sel = Selection::range(start, end);

        assert!(!sel.is_cursor());
        assert_eq!(sel.anchor, start);
        assert_eq!(sel.head, end);
        assert_eq!(sel.direction(), SelectionDirection::Forward);
    }

    #[test]
    fn test_selection_direction() {
        let a = Position::new(0, 0);
        let b = Position::new(0, 10);

        let forward = Selection::new(a, b);
        assert_eq!(forward.direction(), SelectionDirection::Forward);

        let backward = Selection::new(b, a);
        assert_eq!(backward.direction(), SelectionDirection::Backward);

        let none = Selection::cursor(a);
        assert_eq!(none.direction(), SelectionDirection::None);
    }

    #[test]
    fn test_selection_to_range() {
        let a = Position::new(0, 0);
        let b = Position::new(0, 10);

        let forward = Selection::new(a, b);
        assert_eq!(forward.to_range(), Range::new(a, b));

        let backward = Selection::new(b, a);
        assert_eq!(backward.to_range(), Range::new(a, b));
    }

    #[test]
    fn test_selection_start_end() {
        let a = Position::new(0, 0);
        let b = Position::new(0, 10);

        let forward = Selection::new(a, b);
        assert_eq!(forward.start(), a);
        assert_eq!(forward.end(), b);

        let backward = Selection::new(b, a);
        assert_eq!(backward.start(), a);
        assert_eq!(backward.end(), b);
    }

    #[test]
    fn test_selection_extend_to() {
        let sel = Selection::cursor(Position::new(0, 0));
        let extended = sel.extend_to(Position::new(0, 10));

        assert_eq!(extended.anchor, Position::new(0, 0));
        assert_eq!(extended.head, Position::new(0, 10));
        assert!(!extended.is_cursor());
    }

    #[test]
    fn test_selection_move_to() {
        let sel = Selection::new(Position::new(0, 0), Position::new(0, 10));
        let moved = sel.move_to(Position::new(5, 5));

        assert!(moved.is_cursor());
        assert_eq!(moved.anchor, Position::new(5, 5));
        assert_eq!(moved.head, Position::new(5, 5));
    }

    #[test]
    fn test_selection_flip() {
        let sel = Selection::new(Position::new(0, 0), Position::new(0, 10));
        let flipped = sel.flip();

        assert_eq!(flipped.anchor, Position::new(0, 10));
        assert_eq!(flipped.head, Position::new(0, 0));
    }

    #[test]
    fn test_selection_with_primary() {
        let sel = Selection::cursor(Position::new(0, 0));
        assert!(sel.is_primary);

        let secondary = sel.with_primary(false);
        assert!(!secondary.is_primary);
    }
}
