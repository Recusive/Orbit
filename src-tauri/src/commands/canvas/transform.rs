//! Canvas Tailwind class transformation module.
//!
//! Provides regex-based transformation of Tailwind CSS classes in React/TSX
//! component source files. This replaces the browser-side Babel AST transformation
//! to avoid Node.js `process` polyfill issues.
//!
//! ## Supported Patterns
//!
//! 1. `className="..."` - Direct string literals
//! 2. `className={cn("...", ...)}` - Utility function calls (cn, clsx, classNames, twMerge)
//! 3. `cva("...", {...})` - CVA base classes (only first argument)
//!
//! ## Class Replacement Logic
//!
//! Classes are replaced based on conflict prefix matching:
//! - `rounded-lg` conflicts with `rounded-xl` (both have prefix `rounded`)
//! - `p-4` conflicts with `p-6` (both have prefix `p`)
//! - `text-sm` conflicts with `text-lg` (both have prefix `text`)
//!
//! Variant-prefixed classes (e.g., `hover:bg-red-500`, `md:p-4`) are preserved
//! and never modified.
//!
//! ## Example
//!
//! ```ignore
//! let source = r#"<Button className="rounded-lg p-4">Click</Button>"#;
//! let changes = vec![StyleChange {
//!     property: "borderRadius".to_string(),
//!     value: "12px".to_string(),
//!     tailwind_class: "rounded-xl".to_string(),
//! }];
//!
//! let result = transform_tailwind_classes(&source, &changes)?;
//! // result.code: <Button className="rounded-xl p-4">Click</Button>
//! ```

#![expect(
    clippy::str_to_string,
    reason = "String construction from literals is clearer with .to_string()"
)]

use hashbrown::HashMap;
use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::result;
use std::sync::LazyLock;

/// Result type for transform operations
type Result<T> = result::Result<T, String>;

// ============================================================================
// Types
// ============================================================================

/// A single style change to apply.
///
/// Maps a CSS property change to a Tailwind class replacement.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleChange {
    /// CSS property name (camelCase, e.g., "borderRadius")
    pub property: String,
    /// CSS value (e.g., "12px")
    pub value: String,
    /// Tailwind class to add/replace (e.g., "rounded-xl")
    pub tailwind_class: String,
}

/// Result of a transform operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformResult {
    /// Whether the transformation succeeded
    pub success: bool,
    /// Transformed source code (only if success=true)
    pub code: Option<String>,
    /// Classes that were added
    pub added_classes: Vec<String>,
    /// Classes that were removed
    pub removed_classes: Vec<String>,
    /// Non-fatal warnings (e.g., template literals that couldn't be processed)
    pub warnings: Vec<String>,
    /// Error message (only if success=false)
    pub error: Option<String>,
}

impl TransformResult {
    /// Create a successful result with transformed code.
    fn ok(code: String, added: Vec<String>, removed: Vec<String>, warnings: Vec<String>) -> Self {
        Self {
            success: true,
            code: Some(code),
            added_classes: added,
            removed_classes: removed,
            warnings,
            error: None,
        }
    }

    /// Create a failed result with an error message.
    fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            code: None,
            added_classes: Vec::new(),
            removed_classes: Vec::new(),
            warnings: Vec::new(),
            error: Some(message.into()),
        }
    }
}

// ============================================================================
// Constants
// ============================================================================

/// Tailwind variant prefixes that should never be modified.
///
/// Classes with these prefixes (e.g., `hover:bg-red-500`) are preserved as-is.
const VARIANT_PREFIXES: &[&str] = &[
    // Responsive breakpoints
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
    // State variants
    "hover",
    "focus",
    "active",
    "visited",
    "disabled",
    "focus-within",
    "focus-visible",
    // Dark mode
    "dark",
    // Group/peer variants
    "group-hover",
    "group-focus",
    "peer-hover",
    "peer-focus",
    // Position variants
    "first",
    "last",
    "odd",
    "even",
    "first-of-type",
    "last-of-type",
    // Motion preferences
    "motion-safe",
    "motion-reduce",
    // Print
    "print",
    // RTL/LTR
    "rtl",
    "ltr",
    // Pseudo-elements
    "placeholder",
    "selection",
    "file",
    "marker",
    "before",
    "after",
];

/// Single-word Tailwind utilities that don't follow the `prefix-value` pattern.
const SINGLE_WORD_UTILITIES: &[&str] = &[
    "block",
    "inline",
    "flex",
    "grid",
    "hidden",
    "static",
    "relative",
    "absolute",
    "fixed",
    "sticky",
    "italic",
    "underline",
    "uppercase",
    "lowercase",
    "capitalize",
];

/// Class merging utility function names.
const MERGE_UTILITY_NAMES: &[&str] = &["cn", "clsx", "classNames", "twMerge", "cx"];

// ============================================================================
// Regex Patterns
// ============================================================================

/// Regex for `className="..."` pattern
static RE_CLASSNAME_STRING: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is a compile-time constant"
    )]
    Regex::new(r#"className\s*=\s*"([^"]*)""#).expect("className string regex should be valid")
});

/// Regex for `className={'...'}` pattern (single quotes)
static RE_CLASSNAME_STRING_SINGLE: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is a compile-time constant"
    )]
    Regex::new(r"className\s*=\s*\{\s*'([^']*)'\s*\}")
        .expect("className single quote regex should be valid")
});

/// Regex for `className={"..."}` pattern (expression container with string)
static RE_CLASSNAME_EXPR_STRING: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is a compile-time constant"
    )]
    Regex::new(r#"className\s*=\s*\{\s*"([^"]*)"\s*\}"#)
        .expect("className expression string regex should be valid")
});

/// Regex for utility function first argument: `cn("...", ...)` or `clsx("...", ...)`
static RE_UTILITY_FN: LazyLock<Regex> = LazyLock::new(|| {
    let names = MERGE_UTILITY_NAMES.join("|");
    let pattern = format!(r#"(?:{names})\s*\(\s*"([^"]*)""#);
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is constructed from constants"
    )]
    Regex::new(&pattern).expect("utility function regex should be valid")
});

/// Regex for CVA base classes: `cva("...", {...})`
static RE_CVA: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::expect_used,
        reason = "Regex pattern is a compile-time constant"
    )]
    Regex::new(r#"cva\s*\(\s*"([^"]*)""#).expect("cva regex should be valid")
});

// ============================================================================
// Variant Handling
// ============================================================================

/// Check if a Tailwind class has a variant prefix.
///
/// # Examples
///
/// ```ignore
/// has_variant_prefix("hover:text-red-500") // true
/// has_variant_prefix("text-red-500")       // false
/// has_variant_prefix("md:p-4")             // true
/// ```
fn has_variant_prefix(class: &str) -> bool {
    class.find(':').is_some_and(|colon_pos| {
        let prefix = &class[..colon_pos];
        VARIANT_PREFIXES.contains(&prefix)
    })
}

/// Extract the base class from a variant-prefixed class.
///
/// Strips all variant prefixes to get the underlying class.
///
/// # Examples
///
/// ```ignore
/// extract_base_class("hover:text-red-500") // "text-red-500"
/// extract_base_class("md:hover:p-4")       // "p-4"
/// extract_base_class("text-sm")            // "text-sm"
/// ```
fn extract_base_class(class: &str) -> &str {
    let mut current = class;

    while let Some(colon_pos) = current.find(':') {
        let prefix = &current[..colon_pos];
        if VARIANT_PREFIXES.contains(&prefix) {
            current = &current[colon_pos + 1..];
        } else {
            break;
        }
    }

    current
}

/// Extract the conflict prefix from a Tailwind class.
///
/// Used to determine which classes conflict with each other.
/// Classes with the same conflict prefix replace each other.
///
/// # Examples
///
/// ```ignore
/// get_conflict_prefix("rounded-lg")      // "rounded"
/// get_conflict_prefix("text-sm")         // "text"
/// get_conflict_prefix("p-4")             // "p"
/// get_conflict_prefix("hover:p-4")       // "p"
/// get_conflict_prefix("bg-[#ff0000]")    // "bg"
/// ```
fn get_conflict_prefix(class: &str) -> &str {
    // First extract base class (strip variants)
    let base_class = extract_base_class(class);

    // Handle negative prefix
    let positive_class = base_class.strip_prefix('-').unwrap_or(base_class);

    // Handle arbitrary values: `bg-[#ff0000]` -> `bg`
    if let Some(bracket_pos) = positive_class.find("-[") {
        return &positive_class[..bracket_pos];
    }

    // Handle single-word utilities
    if SINGLE_WORD_UTILITIES.contains(&positive_class) {
        return positive_class;
    }

    // Extract prefix from dash-separated class
    positive_class
        .find('-')
        .map_or(positive_class, |dash_pos| &positive_class[..dash_pos])
}

// ============================================================================
// Class Replacement
// ============================================================================

/// Replace classes in a class string while preserving variants.
///
/// # Arguments
///
/// * `class_string` - Space-separated Tailwind classes
/// * `changes` - Style changes to apply
///
/// # Returns
///
/// A tuple of (new_class_string, added_classes, removed_classes)
fn replace_classes(
    class_string: &str,
    changes: &[StyleChange],
) -> (String, Vec<String>, Vec<String>) {
    let classes: Vec<&str> = class_string.split_whitespace().collect();
    let mut added: Vec<String> = Vec::new();
    let mut removed: Vec<String> = Vec::new();

    // Build a map of conflict prefixes to new classes
    let change_map: HashMap<&str, &str> = changes
        .iter()
        .map(|c| {
            (
                get_conflict_prefix(&c.tailwind_class),
                c.tailwind_class.as_str(),
            )
        })
        .collect();

    // Track which prefixes we've already processed
    let mut processed_prefixes: HashSet<&str> = HashSet::new();
    let mut new_classes: Vec<&str> = Vec::new();

    for class in &classes {
        // Skip if class has variant prefix - preserve these unchanged
        if has_variant_prefix(class) {
            new_classes.push(class);
            continue;
        }

        // Check if this class conflicts with any change
        let prefix = get_conflict_prefix(class);

        if let Some(&replacement) = change_map.get(prefix) {
            // Only add replacement once per prefix (insert returns true if new)
            if processed_prefixes.insert(prefix) {
                new_classes.push(replacement);
                added.push(replacement.to_string());
            }
            removed.push((*class).to_string());
        } else {
            // Keep the class as-is
            new_classes.push(class);
        }
    }

    // Add any new classes that weren't replacements (new properties)
    for change in changes {
        let prefix = get_conflict_prefix(&change.tailwind_class);
        // insert returns true if the value was newly inserted
        if processed_prefixes.insert(prefix) {
            new_classes.push(&change.tailwind_class);
            added.push(change.tailwind_class.clone());
        }
    }

    (new_classes.join(" "), added, removed)
}

// ============================================================================
// Transform Engine
// ============================================================================

/// Transform Tailwind classes in a React/TSX source file.
///
/// Uses regex patterns to find className targets and replaces classes
/// based on the provided style changes.
///
/// # Arguments
///
/// * `source_code` - The original TypeScript/JSX source code
/// * `changes` - Array of style changes to apply
///
/// # Returns
///
/// A `TransformResult` with the transformed code or an error.
pub fn transform_tailwind_classes(source_code: &str, changes: &[StyleChange]) -> TransformResult {
    // Early return if no changes
    if changes.is_empty() {
        return TransformResult::ok(source_code.to_string(), Vec::new(), Vec::new(), Vec::new());
    }

    let mut code = source_code.to_string();
    let mut all_added: Vec<String> = Vec::new();
    let mut all_removed: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut found_target = false;

    // Helper to process a regex match
    let process_match = |code: &mut String,
                         regex: &Regex,
                         found: &mut bool,
                         added: &mut Vec<String>,
                         removed: &mut Vec<String>| {
        let new_code = regex.replace_all(code, |caps: &Captures<'_>| {
            // Default fallback: return the full match unchanged
            let fallback = || {
                caps.get(0)
                    .map_or_else(String::new, |m| m.as_str().to_string())
            };

            caps.get(1).map_or_else(fallback, |class_match| {
                let original_classes = class_match.as_str();
                let (new_classes, add, rem) = replace_classes(original_classes, changes);

                if new_classes != original_classes {
                    *found = true;
                    added.extend(add);
                    removed.extend(rem);

                    // Reconstruct the full match with replaced classes
                    let full_match = caps.get(0).map_or("", |m| m.as_str());
                    full_match.replace(original_classes, &new_classes)
                } else {
                    caps.get(0)
                        .map_or_else(String::new, |m| m.as_str().to_string())
                }
            })
        });
        *code = new_code.to_string();
    };

    // Process each regex pattern
    process_match(
        &mut code,
        &RE_CLASSNAME_STRING,
        &mut found_target,
        &mut all_added,
        &mut all_removed,
    );
    process_match(
        &mut code,
        &RE_CLASSNAME_STRING_SINGLE,
        &mut found_target,
        &mut all_added,
        &mut all_removed,
    );
    process_match(
        &mut code,
        &RE_CLASSNAME_EXPR_STRING,
        &mut found_target,
        &mut all_added,
        &mut all_removed,
    );
    process_match(
        &mut code,
        &RE_UTILITY_FN,
        &mut found_target,
        &mut all_added,
        &mut all_removed,
    );
    process_match(
        &mut code,
        &RE_CVA,
        &mut found_target,
        &mut all_added,
        &mut all_removed,
    );

    // Warn if no className target was found
    if !found_target {
        warnings
            .push("No className attribute or CVA/utility function found in component".to_string());
    }

    // Check for template literals that we can't handle
    if code.contains("className={`") || code.contains("className = `") {
        warnings.push("Template literal in className cannot be automatically modified".to_string());
    }

    // Deduplicate tracking arrays
    let unique_added: Vec<String> = all_added
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let unique_removed: Vec<String> = all_removed
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    TransformResult::ok(code, unique_added, unique_removed, warnings)
}

// ============================================================================
// Tauri Command
// ============================================================================

use crate::utils::paths::get_component_path;
use std::fs;

/// Persist style changes to a component's source file.
///
/// This command:
/// 1. Reads the component source file
/// 2. Transforms Tailwind classes based on the provided style changes
/// 3. Creates a backup (using existing backup logic)
/// 4. Writes the modified source back
///
/// # Arguments
///
/// * `component_name` - The component name (e.g., "button")
/// * `component_type` - Either "ui" or "custom"
/// * `changes` - Array of style changes to apply
/// * `test_mode` - If `true`, uses test directory
///
/// # Returns
///
/// A `TransformResult` with the transformation outcome.
#[tauri::command]
pub async fn canvas_persist_styles(
    component_name: String,
    component_type: String,
    changes: Vec<StyleChange>,
    test_mode: Option<bool>,
) -> TransformResult {
    let test_mode = test_mode.unwrap_or(false);

    // Get component path
    let path = match get_component_path(&component_name, &component_type, test_mode) {
        Ok(p) => p,
        Err(e) => return TransformResult::err(format!("Invalid component path: {e}")),
    };

    // Check file exists
    if !path.exists() {
        return TransformResult::err(format!("Component file not found: {}", path.display()));
    }

    // Read current source
    let source_code = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(e) => return TransformResult::err(format!("Failed to read component: {e}")),
    };

    // Transform the source
    let result = transform_tailwind_classes(&source_code, &changes);

    // If transformation succeeded and code changed, write it back
    if result.success {
        if let Some(new_code) = &result.code {
            if *new_code != source_code {
                // Create backup first (using persist module's backup logic)
                // We'll import the backup creation function
                if let Err(e) = create_backup_and_write(
                    &path,
                    new_code,
                    &component_name,
                    &component_type,
                    test_mode,
                ) {
                    return TransformResult::err(format!("Failed to write changes: {e}"));
                }

                log::info!(
                    "Persisted style changes to {}: added {:?}, removed {:?}",
                    component_name,
                    result.added_classes,
                    result.removed_classes
                );
            }
        }
    }

    result
}

/// Create a backup and write new content atomically.
///
/// This is extracted to reuse the backup logic from persist.rs.
fn create_backup_and_write(
    path: &Path,
    content: &str,
    component_name: &str,
    component_type: &str,
    test_mode: bool,
) -> Result<()> {
    use crate::utils::paths::get_backup_dir;
    use chrono::Utc;
    use std::io::Write as _;

    // Create backup directory
    let backup_dir = get_backup_dir(component_name, component_type, test_mode)?;
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {e}"))?;

    // Generate backup filename with timestamp
    let backup_filename = format!(
        "{}_{}.tsx",
        component_name,
        Utc::now().format("%Y%m%d_%H%M%S_%3f")
    );
    let backup_path = backup_dir.join(&backup_filename);

    // Copy current file to backup
    let _ = fs::copy(path, &backup_path).map_err(|e| format!("Failed to create backup: {e}"))?;

    // Atomic write: write to temp file, then rename
    let temp_path = path.with_extension("tmp");

    let mut file =
        fs::File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync temp file: {e}"))?;
    drop(file);

    // Atomic rename
    fs::rename(&temp_path, path).map_err(|e| {
        // Attempt cleanup - ignore errors since we're already failing
        let _ = fs::remove_file(&temp_path).ok();
        format!("Failed to finalize write: {e}")
    })?;

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "unwrap is acceptable in tests")]
mod tests {
    use super::*;

    #[test]
    fn test_has_variant_prefix() {
        assert!(has_variant_prefix("hover:bg-red-500"));
        assert!(has_variant_prefix("md:p-4"));
        assert!(has_variant_prefix("dark:text-white"));
        assert!(!has_variant_prefix("bg-red-500"));
        assert!(!has_variant_prefix("p-4"));
        assert!(!has_variant_prefix("text-sm"));
    }

    #[test]
    fn test_extract_base_class() {
        assert_eq!(extract_base_class("hover:bg-red-500"), "bg-red-500");
        assert_eq!(extract_base_class("md:hover:p-4"), "p-4");
        assert_eq!(extract_base_class("text-sm"), "text-sm");
        assert_eq!(extract_base_class("dark:focus:ring-2"), "ring-2");
    }

    #[test]
    fn test_get_conflict_prefix() {
        assert_eq!(get_conflict_prefix("rounded-lg"), "rounded");
        assert_eq!(get_conflict_prefix("rounded-xl"), "rounded");
        assert_eq!(get_conflict_prefix("text-sm"), "text");
        assert_eq!(get_conflict_prefix("text-lg"), "text");
        assert_eq!(get_conflict_prefix("p-4"), "p");
        assert_eq!(get_conflict_prefix("p-6"), "p");
        assert_eq!(get_conflict_prefix("hover:p-4"), "p");
        assert_eq!(get_conflict_prefix("bg-[#ff0000]"), "bg");
        assert_eq!(get_conflict_prefix("-mt-4"), "mt");
        assert_eq!(get_conflict_prefix("flex"), "flex");
        assert_eq!(get_conflict_prefix("block"), "block");
    }

    #[test]
    fn test_replace_classes_simple() {
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let (result, added, removed) = replace_classes("rounded-lg p-4", &changes);

        assert_eq!(result, "rounded-xl p-4");
        assert_eq!(added, vec!["rounded-xl"]);
        assert_eq!(removed, vec!["rounded-lg"]);
    }

    #[test]
    fn test_replace_classes_preserves_variants() {
        let changes = vec![StyleChange {
            property: "padding".to_string(),
            value: "24px".to_string(),
            tailwind_class: "p-6".to_string(),
        }];

        let (result, _added, removed) = replace_classes("p-4 hover:p-8 md:p-2", &changes);

        assert!(result.contains("hover:p-8"));
        assert!(result.contains("md:p-2"));
        assert!(result.contains("p-6"));
        assert!(!result.contains(" p-4 ") && !result.starts_with("p-4 "));
        assert_eq!(removed, vec!["p-4"]);
    }

    #[test]
    fn test_replace_classes_adds_new() {
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "8px".to_string(),
            tailwind_class: "rounded-md".to_string(),
        }];

        let (result, added, _removed) = replace_classes("p-4 text-sm", &changes);

        assert!(result.contains("rounded-md"));
        assert!(result.contains("p-4"));
        assert!(result.contains("text-sm"));
        assert!(added.contains(&"rounded-md".to_string()));
    }

    #[test]
    fn test_transform_classname_string() {
        let source = r#"<Button className="rounded-lg p-4">Click</Button>"#;
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert!(result.code.as_ref().unwrap().contains("rounded-xl"));
        assert!(!result.code.as_ref().unwrap().contains("rounded-lg"));
        assert!(result.code.as_ref().unwrap().contains("p-4"));
    }

    #[test]
    fn test_transform_utility_function() {
        let source = r#"<Button className={cn("rounded-lg p-4", className)}>Click</Button>"#;
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert!(result.code.as_ref().unwrap().contains("rounded-xl"));
        assert!(!result.code.as_ref().unwrap().contains("rounded-lg"));
    }

    #[test]
    fn test_transform_cva() {
        let source = r#"const buttonVariants = cva("rounded-lg p-4", { variants: {} });"#;
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert!(result.code.as_ref().unwrap().contains("rounded-xl"));
        assert!(!result.code.as_ref().unwrap().contains("rounded-lg"));
    }

    #[test]
    fn test_transform_no_changes() {
        let source = r#"<Button className="p-4">Click</Button>"#;
        let changes: Vec<StyleChange> = vec![];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert_eq!(result.code.as_ref().unwrap(), source);
        assert!(result.added_classes.is_empty());
        assert!(result.removed_classes.is_empty());
    }

    #[test]
    fn test_transform_warns_on_no_target() {
        let source = "function Button() { return <button>Click</button>; }";
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert!(!result.warnings.is_empty());
        assert!(result
            .warnings
            .first()
            .is_some_and(|w| w.contains("No className")));
    }

    #[test]
    fn test_transform_warns_on_template_literal() {
        let source =
            "<Button className={`rounded-lg ${active ? 'bg-blue-500' : ''}`}>Click</Button>";
        let changes = vec![StyleChange {
            property: "borderRadius".to_string(),
            value: "12px".to_string(),
            tailwind_class: "rounded-xl".to_string(),
        }];

        let result = transform_tailwind_classes(source, &changes);

        assert!(result.success);
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("Template literal")));
    }

    #[test]
    fn test_style_change_deserialization() {
        let json = r#"{"property":"borderRadius","value":"12px","tailwindClass":"rounded-xl"}"#;
        let change: StyleChange = serde_json::from_str(json).unwrap();

        assert_eq!(change.property, "borderRadius");
        assert_eq!(change.value, "12px");
        assert_eq!(change.tailwind_class, "rounded-xl");
    }

    #[test]
    fn test_transform_result_serialization() {
        let result = TransformResult::ok(
            "code".to_string(),
            vec!["added".to_string()],
            vec!["removed".to_string()],
            vec!["warning".to_string()],
        );

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"addedClasses\":[\"added\"]"));
        assert!(json.contains("\"removedClasses\":[\"removed\"]"));
    }
}
