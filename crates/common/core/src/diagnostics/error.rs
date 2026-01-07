//! Error types for Orbit

use std::io;
use std::result;

use thiserror::Error;

/// Main error type for Orbit operations
#[derive(Error, Debug)]
#[non_exhaustive]
pub enum Error {
    /// IO operation failed
    #[error("IO error: {0}")]
    Io(#[from] io::Error),

    /// JSON serialization/deserialization failed
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// Requested file was not found
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Requested directory was not found
    #[error("Directory not found: {0}")]
    DirectoryNotFound(String),

    /// Permission denied for operation
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// Language server protocol error
    #[error("LSP error: {0}")]
    Lsp(String),

    /// Terminal operation failed
    #[error("Terminal error: {0}")]
    Terminal(String),

    /// Git operation failed
    #[error("Git error: {0}")]
    Git(String),

    /// AI service error
    #[error("AI error: {0}")]
    Ai(String),

    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),

    /// Other unspecified error
    #[error("{0}")]
    Other(String),
}

/// Result type alias using our Error type
pub type Result<T> = result::Result<T, Error>;

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
