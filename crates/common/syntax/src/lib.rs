//! Snowflake Syntax - Syntax highlighting and tree-sitter parsing
//!
//! This crate provides syntax highlighting and parsing capabilities
//! using tree-sitter for accurate syntax analysis.

use snowflake_core::Result;

/// Supported programming languages
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Language {
    /// Rust programming language
    Rust,
    /// TypeScript (including TSX)
    TypeScript,
    /// JavaScript (including JSX)
    JavaScript,
    /// Python
    Python,
    /// Go
    Go,
    /// JSON data format
    Json,
    /// HTML markup
    Html,
    /// CSS stylesheets
    Css,
    /// Markdown documentation
    Markdown,
    /// TOML configuration
    Toml,
    /// YAML configuration
    Yaml,
}

impl Language {
    /// Detect language from file extension
    #[must_use]
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "rs" => Some(Self::Rust),
            "ts" | "tsx" => Some(Self::TypeScript),
            "js" | "jsx" | "mjs" | "cjs" => Some(Self::JavaScript),
            "py" | "pyi" => Some(Self::Python),
            "go" => Some(Self::Go),
            "json" => Some(Self::Json),
            "html" | "htm" => Some(Self::Html),
            "css" | "scss" | "sass" => Some(Self::Css),
            "md" | "markdown" => Some(Self::Markdown),
            "toml" => Some(Self::Toml),
            "yaml" | "yml" => Some(Self::Yaml),
            _ => None,
        }
    }
}

/// Parse source code and return syntax tree
///
/// # Errors
///
/// Returns an error if parsing fails
pub fn parse(_source: &str, _language: Language) -> Result<()> {
    // TODO: Implement tree-sitter parsing
    Ok(())
}

/// Get syntax highlights for source code
///
/// # Errors
///
/// Returns an error if highlighting fails
pub fn highlight(_source: &str, _language: Language) -> Result<Vec<HighlightSpan>> {
    // TODO: Implement syntax highlighting
    Ok(vec![])
}

/// A highlighted span of text
#[derive(Debug, Clone, Copy)]
pub struct HighlightSpan {
    /// Start byte offset
    pub start: usize,
    /// End byte offset
    pub end: usize,
    /// Highlight type
    pub kind: HighlightKind,
}

/// Types of syntax highlights
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum HighlightKind {
    /// Language keyword (if, else, fn, etc.)
    Keyword,
    /// Function or method name
    Function,
    /// Variable name
    Variable,
    /// String literal
    String,
    /// Numeric literal
    Number,
    /// Code comment
    Comment,
    /// Type name
    Type,
    /// Operator (+, -, *, etc.)
    Operator,
    /// Punctuation (braces, parens, etc.)
    Punctuation,
}
