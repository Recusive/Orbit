//! Path resolution and validation utilities for Canvas UI Builder.
//!
//! Provides centralized path helpers with security validation to prevent
//! path traversal attacks and ensure consistent directory structure.
//!
//! ## Directory Structure
//!
//! ```text
//! ~/.orbit/canvas/
//! ├── components/
//! │   ├── ui/           ← Downloaded shadcn components
//! │   └── custom/       ← User-saved customizations
//! ├── .backups/         ← Timestamped backups
//! │   └── {component}/  ← Per-component backup directories
//! └── ...
//! ```
//!
//! ## Test Mode
//!
//! When `test_mode` is `true`, paths resolve to `~/.orbit-test/canvas` instead
//! of `~/.orbit/canvas`. This allows integration tests to run in isolation.

#![expect(
    clippy::disallowed_methods,
    reason = "std::env::var used for ORBIT_CANVAS_PATH override - intentional for test/dev flexibility"
)]
#![expect(
    clippy::absolute_paths,
    reason = "std::env::var is clearer inline for env variable access"
)]
#![expect(
    clippy::str_to_string,
    reason = "String construction from literals is clearer with .to_string() - matches codebase convention"
)]

use regex::Regex;
use std::path::PathBuf;
use std::result;
use std::sync::LazyLock;

/// Result type for path operations
pub type Result<T> = result::Result<T, String>;

// ============================================================================
// Validation Constants
// ============================================================================

/// Maximum length for component names
const MAX_COMPONENT_NAME_LENGTH: usize = 64;

/// Valid component types
const VALID_COMPONENT_TYPES: [&str; 2] = ["ui", "custom"];

/// Regex pattern for valid component names:
/// - Must start with a letter (a-z, A-Z)
/// - Can contain letters, numbers, and hyphens
/// - Must be 1-64 characters
static COMPONENT_NAME_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    // This regex pattern is known to be valid at compile time
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is a compile-time constant"
    )]
    Regex::new("^[a-zA-Z][a-zA-Z0-9-]*$").expect("Component name regex pattern should be valid")
});

// ============================================================================
// Path Resolution
// ============================================================================

/// Get the path to `~/.orbit/canvas` (production).
///
/// Supports `ORBIT_CANVAS_PATH` environment variable override for testing
/// and non-standard setups.
///
/// # Errors
///
/// Returns an error if the home directory cannot be determined.
///
/// # Examples
///
/// ```ignore
/// let path = get_orbit_canvas_path()?;
/// // path: ~/.orbit/canvas (or ORBIT_CANVAS_PATH if set)
/// ```
pub fn get_orbit_canvas_path() -> Result<PathBuf> {
    // Check for env override (useful for testing)
    if let Ok(override_path) = std::env::var("ORBIT_CANVAS_PATH") {
        return Ok(PathBuf::from(override_path));
    }

    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".orbit").join("canvas"))
}

/// Get the path to `~/.orbit-test/canvas` (testing).
///
/// Used for integration tests to avoid polluting the user's actual
/// Canvas directory.
///
/// # Errors
///
/// Returns an error if the home directory cannot be determined.
///
/// # Examples
///
/// ```ignore
/// let path = get_orbit_canvas_path_test()?;
/// // path: ~/.orbit-test/canvas
/// ```
pub fn get_orbit_canvas_path_test() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".orbit-test").join("canvas"))
}

/// Get the resolved canvas base path based on test mode.
///
/// # Arguments
///
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`; otherwise uses production path
///
/// # Errors
///
/// Returns an error if the home directory cannot be determined.
fn get_canvas_base_path(test_mode: bool) -> Result<PathBuf> {
    if test_mode {
        get_orbit_canvas_path_test()
    } else {
        get_orbit_canvas_path()
    }
}

/// Get the full path to a component file.
///
/// # Arguments
///
/// * `component_name` - The component name (e.g., "button", "dialog")
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses test directory
///
/// # Errors
///
/// Returns an error if:
/// - Component name validation fails
/// - Component type validation fails
/// - Home directory cannot be determined
///
/// # Examples
///
/// ```ignore
/// let path = get_component_path("button", "ui", false)?;
/// // path: ~/.orbit/canvas/components/ui/button.tsx
///
/// let path = get_component_path("my-component", "custom", true)?;
/// // path: ~/.orbit-test/canvas/components/custom/my-component.tsx
/// ```
pub fn get_component_path(
    component_name: &str,
    component_type: &str,
    test_mode: bool,
) -> Result<PathBuf> {
    // Validate inputs
    validate_component_name(component_name)?;
    validate_component_type(component_type)?;

    let base_path = get_canvas_base_path(test_mode)?;
    let filename = format!("{component_name}.tsx");

    Ok(base_path
        .join("components")
        .join(component_type)
        .join(filename))
}

/// Get the path to the globals.css file.
///
/// # Arguments
///
/// * `test_mode` - If `true`, uses test directory
///
/// # Errors
///
/// Returns an error if the home directory cannot be determined.
pub fn get_globals_css_path(test_mode: bool) -> Result<PathBuf> {
    let base_path = get_canvas_base_path(test_mode)?;
    Ok(base_path.join("preview").join("src").join("globals.css"))
}

/// Get the path to the backup directory for a component.
///
/// # Arguments
///
/// * `component_name` - The component name
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses test directory
///
/// # Errors
///
/// Returns an error if validation fails or home directory cannot be determined.
pub fn get_backup_dir(
    component_name: &str,
    component_type: &str,
    test_mode: bool,
) -> Result<PathBuf> {
    validate_component_name(component_name)?;
    validate_component_type(component_type)?;

    let base_path = get_canvas_base_path(test_mode)?;
    Ok(base_path
        .join(".backups")
        .join(component_type)
        .join(component_name))
}

// ============================================================================
// Validation
// ============================================================================

/// Validate a component name.
///
/// Component names must:
/// - Start with a letter (a-z, A-Z)
/// - Contain only letters, numbers, and hyphens
/// - Be 1-64 characters long
/// - Not contain path traversal sequences
///
/// # Arguments
///
/// * `name` - The component name to validate
///
/// # Errors
///
/// Returns an error if the name is invalid, with a descriptive message.
///
/// # Examples
///
/// ```ignore
/// // Valid names
/// validate_component_name("button")?;        // OK
/// validate_component_name("my-component")?;  // OK
/// validate_component_name("Button123")?;     // OK
///
/// // Invalid names
/// validate_component_name("")?;              // Error: empty
/// validate_component_name("123-button")?;    // Error: starts with number
/// validate_component_name("../button")?;     // Error: path traversal
/// validate_component_name("my_button")?;     // Error: contains underscore
/// ```
pub fn validate_component_name(name: &str) -> Result<()> {
    // Check for empty name
    if name.is_empty() {
        return Err("Component name cannot be empty".to_string());
    }

    // Check length
    if name.len() > MAX_COMPONENT_NAME_LENGTH {
        return Err(format!(
            "Component name exceeds maximum length of {MAX_COMPONENT_NAME_LENGTH} characters"
        ));
    }

    // Check for path traversal attempts
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Component name cannot contain path traversal sequences".to_string());
    }

    // Check regex pattern
    if !COMPONENT_NAME_REGEX.is_match(name) {
        return Err(
            "Component name must start with a letter and contain only letters, numbers, and hyphens"
                .to_string(),
        );
    }

    Ok(())
}

/// Validate a component type.
///
/// Valid types are "ui" (for shadcn components) and "custom" (for user components).
///
/// # Arguments
///
/// * `component_type` - The component type to validate
///
/// # Errors
///
/// Returns an error if the type is not "ui" or "custom".
///
/// # Examples
///
/// ```ignore
/// validate_component_type("ui")?;     // OK
/// validate_component_type("custom")?; // OK
/// validate_component_type("other")?;  // Error
/// ```
pub fn validate_component_type(component_type: &str) -> Result<()> {
    if !VALID_COMPONENT_TYPES.contains(&component_type) {
        return Err(format!(
            "Invalid component type '{}'. Must be one of: {}",
            component_type,
            VALID_COMPONENT_TYPES.join(", ")
        ));
    }
    Ok(())
}

/// Validate that a path is within the canvas directory.
///
/// This prevents path traversal attacks by ensuring the resolved path
/// starts with the canvas base path.
///
/// # Arguments
///
/// * `path` - The path to validate
/// * `test_mode` - If `true`, validates against test directory
///
/// # Errors
///
/// Returns an error if:
/// - The path cannot be canonicalized
/// - The path is outside the canvas directory
///
/// # Examples
///
/// ```ignore
/// // Within canvas directory - OK
/// validate_path_within_canvas("~/.orbit/canvas/components/ui/button.tsx", false)?;
///
/// // Outside canvas directory - Error
/// validate_path_within_canvas("/etc/passwd", false)?;
/// ```
pub fn validate_path_within_canvas(path: &str, test_mode: bool) -> Result<PathBuf> {
    let base_path = get_canvas_base_path(test_mode)?;
    let target_path = PathBuf::from(path);

    // Try to canonicalize. If the file doesn't exist yet, check the parent.
    let resolved = if target_path.exists() {
        target_path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {e}"))?
    } else {
        // For new files, validate the parent directory
        let parent = target_path
            .parent()
            .ok_or_else(|| "Path has no parent directory".to_string())?;

        if !parent.exists() {
            // If parent doesn't exist, fall back to lexical check
            target_path
        } else {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Failed to resolve parent path: {e}"))?;
            canonical_parent.join(
                target_path
                    .file_name()
                    .ok_or_else(|| "Path has no filename".to_string())?,
            )
        }
    };

    // Canonicalize the base path for comparison
    let canonical_base = if base_path.exists() {
        base_path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve canvas base path: {e}"))?
    } else {
        base_path
    };

    // Check if resolved path starts with canvas base
    if !resolved.starts_with(&canonical_base) {
        return Err(format!(
            "Path '{}' is outside the canvas directory",
            resolved.display()
        ));
    }

    Ok(resolved)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[expect(
    clippy::unwrap_used,
    clippy::assertions_on_result_states,
    reason = "unwrap and assert on Result is acceptable in tests"
)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_component_name_valid() {
        validate_component_name("button").unwrap();
        validate_component_name("my-component").unwrap();
        validate_component_name("Button123").unwrap();
        validate_component_name("a").unwrap();
        validate_component_name("component-with-many-hyphens").unwrap();
    }

    #[test]
    fn test_validate_component_name_invalid_empty() {
        let result = validate_component_name("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn test_validate_component_name_invalid_starts_with_number() {
        let result = validate_component_name("123button");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must start with a letter"));
    }

    #[test]
    fn test_validate_component_name_invalid_path_traversal() {
        let result = validate_component_name("../button");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path traversal"));

        let result = validate_component_name("button/../evil");
        assert!(result.is_err());

        let result = validate_component_name("button\\..\\evil");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_component_name_invalid_characters() {
        let result = validate_component_name("my_button");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must start with a letter"));

        let result = validate_component_name("my button");
        assert!(result.is_err());

        let result = validate_component_name("my.button");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_component_name_too_long() {
        let long_name = "a".repeat(65);
        let result = validate_component_name(&long_name);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("maximum length"));
    }

    #[test]
    fn test_validate_component_type_valid() {
        validate_component_type("ui").unwrap();
        validate_component_type("custom").unwrap();
    }

    #[test]
    fn test_validate_component_type_invalid() {
        let result = validate_component_type("invalid");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Must be one of"));

        let result = validate_component_type("");
        assert!(result.is_err());

        let result = validate_component_type("UI");
        assert!(result.is_err()); // Case sensitive
    }

    #[test]
    fn test_get_component_path_valid() {
        // This test uses test_mode=true to avoid depending on production paths
        let result = get_component_path("button", "ui", true);
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.to_string_lossy().contains(".orbit-test"));
        assert!(path.to_string_lossy().contains("components/ui/button.tsx"));
    }

    #[test]
    fn test_get_component_path_invalid_name() {
        let result = get_component_path("../evil", "ui", true);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_component_path_invalid_type() {
        let result = get_component_path("button", "invalid", true);
        assert!(result.is_err());
    }
}
