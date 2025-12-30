//! Range type for text editing.

use serde::{Deserialize, Serialize};

use super::Position;

/// A range in a text document.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    /// Start position (inclusive)
    pub start: Position,
    /// End position (exclusive)
    pub end: Position,
}

impl Range {
    /// Creates a new range from start to end positions.
    ///
    /// Note: start should be <= end for a valid forward range.
    #[must_use]
    pub const fn new(start: Position, end: Position) -> Self {
        Self { start, end }
    }

    /// Creates a zero-width range at the given position.
    #[must_use]
    pub const fn point(pos: Position) -> Self {
        Self {
            start: pos,
            end: pos,
        }
    }

    /// Returns true if this range contains the given position.
    #[must_use]
    pub fn contains(&self, pos: Position) -> bool {
        pos >= self.start && pos < self.end
    }

    /// Returns true if this range contains the given position (inclusive end).
    #[must_use]
    pub fn contains_inclusive(&self, pos: Position) -> bool {
        pos >= self.start && pos <= self.end
    }

    /// Returns true if this range intersects with another range.
    #[must_use]
    pub fn intersects(&self, other: &Self) -> bool {
        self.start < other.end && other.start < self.end
    }

    /// Returns true if this range is empty (start == end).
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }

    /// Returns true if start > end (backwards selection).
    #[must_use]
    pub fn is_reversed(&self) -> bool {
        self.start > self.end
    }

    /// Returns a normalized range where start <= end.
    #[must_use]
    pub fn normalized(self) -> Self {
        if self.is_reversed() {
            Self {
                start: self.end,
                end: self.start,
            }
        } else {
            self
        }
    }

    /// Converts to LSP range.
    #[must_use]
    pub fn to_lsp(self) -> lsp_types::Range {
        lsp_types::Range {
            start: self.start.to_lsp(),
            end: self.end.to_lsp(),
        }
    }

    /// Creates from LSP range.
    #[must_use]
    pub fn from_lsp(range: lsp_types::Range) -> Self {
        Self {
            start: Position::from_lsp(range.start),
            end: Position::from_lsp(range.end),
        }
    }
}

impl From<lsp_types::Range> for Range {
    fn from(range: lsp_types::Range) -> Self {
        Self::from_lsp(range)
    }
}

impl From<Range> for lsp_types::Range {
    fn from(range: Range) -> Self {
        range.to_lsp()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_new() {
        let start = Position::new(0, 0);
        let end = Position::new(1, 10);
        let range = Range::new(start, end);
        assert_eq!(range.start, start);
        assert_eq!(range.end, end);
    }

    #[test]
    fn test_range_point() {
        let pos = Position::new(5, 10);
        let range = Range::point(pos);
        assert!(range.is_empty());
        assert_eq!(range.start, pos);
        assert_eq!(range.end, pos);
    }

    #[test]
    fn test_range_contains() {
        let range = Range::new(Position::new(1, 0), Position::new(1, 10));

        // Inside
        assert!(range.contains(Position::new(1, 5)));
        // At start
        assert!(range.contains(Position::new(1, 0)));
        // At end (exclusive)
        assert!(!range.contains(Position::new(1, 10)));
        // Before
        assert!(!range.contains(Position::new(0, 5)));
        // After
        assert!(!range.contains(Position::new(2, 0)));
    }

    #[test]
    fn test_range_intersects() {
        let a = Range::new(Position::new(0, 0), Position::new(0, 10));
        let b = Range::new(Position::new(0, 5), Position::new(0, 15));
        let c = Range::new(Position::new(0, 10), Position::new(0, 20));
        let d = Range::new(Position::new(1, 0), Position::new(1, 10));

        assert!(a.intersects(&b)); // Overlapping
        assert!(!a.intersects(&c)); // Adjacent (no overlap)
        assert!(!a.intersects(&d)); // Different lines
    }

    #[test]
    fn test_range_is_empty() {
        let empty = Range::new(Position::new(1, 5), Position::new(1, 5));
        let nonempty = Range::new(Position::new(1, 5), Position::new(1, 6));

        assert!(empty.is_empty());
        assert!(!nonempty.is_empty());
    }

    #[test]
    fn test_range_normalized() {
        let reversed = Range::new(Position::new(1, 10), Position::new(1, 0));
        let normalized = reversed.normalized();

        assert!(reversed.is_reversed());
        assert!(!normalized.is_reversed());
        assert_eq!(normalized.start, Position::new(1, 0));
        assert_eq!(normalized.end, Position::new(1, 10));
    }

    #[test]
    fn test_range_lsp_conversion() {
        let range = Range::new(Position::new(5, 10), Position::new(10, 20));
        let lsp_range = range.to_lsp();

        assert_eq!(lsp_range.start.line, 5);
        assert_eq!(lsp_range.start.character, 10);
        assert_eq!(lsp_range.end.line, 10);
        assert_eq!(lsp_range.end.character, 20);

        let back = Range::from_lsp(lsp_range);
        assert_eq!(back, range);
    }
}
