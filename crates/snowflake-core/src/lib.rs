//! Snowflake Core - Shared types and utilities
//!
//! This crate provides the foundation types used across all Snowflake crates.

pub mod error;
pub mod types;

pub use error::{Error, Result};
pub use types::*;
