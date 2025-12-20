//! Error types for Snowflake

use thiserror::Error;

/// Main error type for Snowflake operations
#[derive(Error, Debug)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Directory not found: {0}")]
    DirectoryNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("LSP error: {0}")]
    Lsp(String),

    #[error("Terminal error: {0}")]
    Terminal(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("AI error: {0}")]
    Ai(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("{0}")]
    Other(String),
}

/// Result type alias using our Error type
pub type Result<T> = std::result::Result<T, Error>;

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
