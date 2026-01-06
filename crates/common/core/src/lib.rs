//! Snowflake Core - Shared types and utilities
//!
//! This crate provides the foundation types used across all Snowflake crates.
//!
//! # Crash Handling
//!
//! The [`diagnostics::crash`] module provides panic capture and crash logging:
//!
//! - [`crash::setup_panic_hook`] - Install the custom panic handler
//! - [`crash::CrashManager`] - Manage and read crash logs
//! - [`crash::CrashReport`] - Structured crash report data
//!
//! # Text Editing
//!
//! The [`text`] module provides core text editing primitives:
//!
//! - [`text::Position`] - A position in a document (line, column)
//! - [`text::Range`] - A range between two positions
//! - [`text::Buffer`] - An efficient text buffer backed by a rope
//! - [`text::Selection`] - A selection with anchor and head
//! - [`text::Edit`] - An edit operation
//! - [`text::EditHistory`] - Undo/redo history
//! - [`text::Document`] - A text document with editing capabilities

pub mod diagnostics;
pub mod text;
pub mod types;

pub use diagnostics::crash::{setup_panic_hook, CrashManager, CrashReport};
pub use diagnostics::error::{Error, Result};
pub use text::{Buffer, Document, DocumentMeta, Edit, EditHistory, Selection, SelectionDirection};
pub use types::*;
