//! Core text editing primitives.
//!
//! This module provides the fundamental types for text editing:
//!
//! - [`Position`] - A position in a document (line, column)
//! - [`Range`] - A range between two positions
//! - [`Buffer`] - An efficient text buffer backed by a rope
//! - [`Selection`] - A selection with anchor and head
//! - [`Edit`] - An edit operation
//! - [`EditHistory`] - Undo/redo history
//! - [`Document`] - A text document with editing capabilities

mod buffer;
mod document;
mod edit;
mod position;
mod range;
mod selection;

pub use buffer::Buffer;
pub use document::{Document, DocumentMeta};
pub use edit::{Edit, EditHistory};
pub use position::Position;
pub use range::Range;
pub use selection::{Selection, SelectionDirection};
