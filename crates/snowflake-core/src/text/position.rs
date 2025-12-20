//! Position type for text editing.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

/// A position in a text document (0-indexed line and column).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    /// Line number (0-indexed)
    pub line: u32,
    /// Column number (0-indexed, in UTF-16 code units for LSP compatibility)
    pub column: u32,
}

impl Position {
    /// Creates a new position.
    #[must_use]
    pub const fn new(line: u32, column: u32) -> Self {
        Self { line, column }
    }

    /// Creates a position at the beginning of the document.
    #[must_use]
    pub const fn zero() -> Self {
        Self { line: 0, column: 0 }
    }

    /// Converts to LSP position.
    #[must_use]
    pub const fn to_lsp(self) -> lsp_types::Position {
        lsp_types::Position {
            line: self.line,
            character: self.column,
        }
    }

    /// Creates from LSP position.
    #[must_use]
    pub const fn from_lsp(pos: lsp_types::Position) -> Self {
        Self {
            line: pos.line,
            column: pos.character,
        }
    }
}

impl Ord for Position {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.line.cmp(&other.line) {
            Ordering::Equal => self.column.cmp(&other.column),
            ord => ord,
        }
    }
}

impl PartialOrd for Position {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl From<lsp_types::Position> for Position {
    fn from(pos: lsp_types::Position) -> Self {
        Self::from_lsp(pos)
    }
}

impl From<Position> for lsp_types::Position {
    fn from(pos: Position) -> Self {
        pos.to_lsp()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_new() {
        let pos = Position::new(10, 5);
        assert_eq!(pos.line, 10);
        assert_eq!(pos.column, 5);
    }

    #[test]
    fn test_position_zero() {
        let pos = Position::zero();
        assert_eq!(pos.line, 0);
        assert_eq!(pos.column, 0);
    }

    #[test]
    fn test_position_ordering() {
        let a = Position::new(0, 0);
        let b = Position::new(0, 5);
        let c = Position::new(1, 0);
        let d = Position::new(1, 5);

        assert!(a < b);
        assert!(b < c);
        assert!(c < d);
        assert!(a < d);
    }

    #[test]
    fn test_position_lsp_conversion() {
        let pos = Position::new(10, 20);
        let lsp_pos = pos.to_lsp();
        assert_eq!(lsp_pos.line, 10);
        assert_eq!(lsp_pos.character, 20);

        let back = Position::from_lsp(lsp_pos);
        assert_eq!(back, pos);
    }
}
