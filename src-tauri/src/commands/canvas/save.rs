//! Canvas component save and export commands
//!
//! Provides Tauri commands to save customized components to the user's
//! custom folder and export components to external project directories.

#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]
#![expect(
    clippy::absolute_paths,
    reason = "std::fs calls are clearer inline for file operations"
)]
#![expect(
    clippy::disallowed_types,
    reason = "HashMap used for CSS styles - determinism not required for this use case"
)]
#![expect(
    clippy::str_to_string,
    reason = "String construction from literals is clearer with .to_string()"
)]
#![expect(
    clippy::option_if_let_else,
    reason = "match is more readable than map_or_else for this pattern"
)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::result;

use chrono::Utc;
use serde::{Deserialize, Serialize};

/// Result type for save commands
type Result<T> = result::Result<T, String>;

// ============================================================================
// Types
// ============================================================================

/// Input for saving a customized component
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveComponentInput {
    /// Name for the new custom component (e.g., "primary-button")
    pub name: String,
    /// Source component name (e.g., "button")
    pub source_name: String,
    /// Source type: "ui" for shadcn components, "custom" for user-created
    pub source_type: String,
    /// CSS style overrides (kebab-case keys, e.g., "background-color": "#ff0000")
    pub styles: HashMap<String, String>,
    /// Additional props to pass through (currently unused, reserved for future)
    pub props: serde_json::Value,
}

/// Result of a save or export operation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Path where the component was saved (if successful)
    pub path: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

// ============================================================================
// Commands
// ============================================================================

/// Save a customized component to the custom folder
///
/// Creates a wrapper component in `~/.orbit/canvas/components/custom/` that
/// imports the source component and applies custom styles.
///
/// # Arguments
///
/// * `input` - Component metadata including name, source, and style overrides
///
/// # Returns
///
/// A `SaveResult` indicating success/failure and the saved path.
#[tauri::command]
pub async fn canvas_save_custom_component(input: SaveComponentInput) -> Result<SaveResult> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Determine source component path based on type
    let source_path = if input.source_type == "custom" {
        orbit_path
            .join("components")
            .join("custom")
            .join(format!("{}.tsx", input.source_name))
    } else {
        orbit_path
            .join("components")
            .join("ui")
            .join(format!("{}.tsx", input.source_name))
    };

    // Verify source exists
    if !source_path.exists() {
        return Ok(SaveResult {
            success: false,
            path: None,
            error: Some(format!(
                "Source component not found: {}",
                source_path.display()
            )),
        });
    }

    // Read source for validation (not currently used in wrapper approach,
    // but may be needed for future inline customization)
    let _source_content =
        std::fs::read_to_string(&source_path).map_err(|e| format!("Failed to read source: {e}"))?;

    // Generate wrapper component
    let custom_content = generate_wrapper_component(
        &input.name,
        &input.source_name,
        &input.source_type,
        &input.styles,
    );

    // Ensure custom directory exists
    let custom_dir = orbit_path.join("components").join("custom");
    std::fs::create_dir_all(&custom_dir)
        .map_err(|e| format!("Failed to create custom directory: {e}"))?;

    // Write the custom component
    let dest_path = custom_dir.join(format!("{}.tsx", input.name));
    std::fs::write(&dest_path, custom_content)
        .map_err(|e| format!("Failed to write component: {e}"))?;

    // Update registry to include the new custom component
    update_registry_with_custom(&input.name, &input.source_name).await?;

    Ok(SaveResult {
        success: true,
        path: Some(dest_path.to_string_lossy().to_string()),
        error: None,
    })
}

/// Export a component to an external project path
///
/// Copies a component from `~/.orbit/canvas/` to a user-specified directory.
/// Also copies `lib/utils.ts` if not already present at the destination.
///
/// # Arguments
///
/// * `component_name` - Name of the component to export (e.g., "button")
/// * `component_type` - Type: "ui" or "custom"
/// * `destination_dir` - Target directory path for the export
///
/// # Returns
///
/// A `SaveResult` indicating success/failure and the exported path.
#[tauri::command]
pub async fn canvas_export_component(
    component_name: String,
    component_type: String,
    destination_dir: String,
) -> Result<SaveResult> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Determine source path based on component type
    let source_path = if component_type == "custom" {
        orbit_path
            .join("components")
            .join("custom")
            .join(format!("{component_name}.tsx"))
    } else {
        orbit_path
            .join("components")
            .join("ui")
            .join(format!("{component_name}.tsx"))
    };

    // Verify source exists
    if !source_path.exists() {
        return Ok(SaveResult {
            success: false,
            path: None,
            error: Some(format!("Component not found: {component_name}")),
        });
    }

    let dest_dir = PathBuf::from(&destination_dir);

    // Ensure destination directory exists
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create destination directory: {e}"))?;

    let dest_path = dest_dir.join(format!("{component_name}.tsx"));

    // Copy the component file
    let _ = std::fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy component: {e}"))?;

    // Also copy utils.ts if it doesn't exist at destination's lib folder
    // The typical shadcn structure is: components/ui/*.tsx + lib/utils.ts
    let utils_dest = dest_dir
        .parent()
        .unwrap_or(&dest_dir)
        .join("lib")
        .join("utils.ts");

    if !utils_dest.exists() {
        let utils_source = orbit_path.join("lib").join("utils.ts");
        if utils_source.exists() {
            // Ensure lib directory exists
            if let Some(lib_dir) = utils_dest.parent() {
                let _ = std::fs::create_dir_all(lib_dir);
            }
            let _ = std::fs::copy(&utils_source, &utils_dest);
        }
    }

    Ok(SaveResult {
        success: true,
        path: Some(dest_path.to_string_lossy().to_string()),
        error: None,
    })
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Generate a wrapper component that applies custom styles to a source component
///
/// Creates a React component that wraps the source and merges custom styles.
fn generate_wrapper_component(
    name: &str,
    source_name: &str,
    source_type: &str,
    styles: &HashMap<String, String>,
) -> String {
    // Convert component name to PascalCase for React naming convention
    let pascal_name = to_pascal_case(name);
    let source_pascal = to_pascal_case(source_name);

    // Determine import path based on source type
    let import_path = if source_type == "custom" {
        format!("./{source_name}")
    } else {
        format!("../ui/{source_name}")
    };

    // Generate inline styles object
    let style_block = if styles.is_empty() {
        String::new()
    } else {
        let style_entries: Vec<String> = styles
            .iter()
            .map(|(k, v)| {
                // Convert kebab-case CSS props to camelCase for React
                let camel_key = to_camel_case(k);
                format!("  {camel_key}: '{v}',")
            })
            .collect();
        format!(
            "const customStyles: React.CSSProperties = {{\n{}\n}};\n\n",
            style_entries.join("\n")
        )
    };

    // Construct the wrapper component
    let style_prop = if styles.is_empty() {
        String::new()
    } else {
        "\n      style={{...customStyles, ...props.style}}".to_string()
    };

    format!(
        "// Custom component based on {source_name}
// Generated by Canvas UI Builder

import {{ {source_pascal} }} from '{import_path}';

{style_block}export function {pascal_name}(props: React.ComponentProps<typeof {source_pascal}>) {{
  return (
    <{source_pascal}
      {{...props}}{style_prop}
    />
  );
}}
",
    )
}

/// Convert kebab-case string to PascalCase
///
/// Example: "primary-button" -> "PrimaryButton"
fn to_pascal_case(s: &str) -> String {
    s.split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect(),
            }
        })
        .collect()
}

/// Convert kebab-case string to camelCase
///
/// Example: "background-color" -> "backgroundColor"
fn to_camel_case(s: &str) -> String {
    s.split('-')
        .enumerate()
        .map(|(i, part)| {
            if i == 0 {
                part.to_string()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().chain(chars).collect(),
                }
            }
        })
        .collect()
}

/// Update the local registry to include a new custom component
async fn update_registry_with_custom(name: &str, source_name: &str) -> Result<()> {
    let mut registry = super::setup::canvas_get_registry().await?;

    // Only add if not already present
    if !registry.components.iter().any(|c| c.name == name) {
        registry.components.push(super::setup::ComponentMeta {
            name: name.to_string(),
            component_type: "custom".to_string(),
            dependencies: vec![],
            // Custom components depend on their source
            registry_dependencies: vec![source_name.to_string()],
        });

        registry.last_updated = Utc::now().to_rfc3339();
        super::setup::canvas_save_registry(registry).await?;
    }

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[expect(
    clippy::expect_used,
    reason = "expect is idiomatic in tests for unwrapping expected values"
)]
mod tests {
    use super::*;

    #[test]
    fn test_to_pascal_case() {
        assert_eq!(to_pascal_case("button"), "Button");
        assert_eq!(to_pascal_case("primary-button"), "PrimaryButton");
        assert_eq!(to_pascal_case("my-custom-card"), "MyCustomCard");
        assert_eq!(to_pascal_case(""), "");
    }

    #[test]
    fn test_to_camel_case() {
        assert_eq!(to_camel_case("background-color"), "backgroundColor");
        assert_eq!(to_camel_case("border-top-width"), "borderTopWidth");
        assert_eq!(to_camel_case("color"), "color");
        assert_eq!(to_camel_case(""), "");
    }

    #[test]
    fn test_generate_wrapper_component_with_styles() {
        let mut styles = HashMap::new();
        let _ = styles.insert("background-color".to_string(), "#ff0000".to_string());
        let _ = styles.insert("border-radius".to_string(), "8px".to_string());

        let result = generate_wrapper_component("primary-button", "button", "ui", &styles);

        assert!(result.contains("PrimaryButton"));
        assert!(result.contains("Button"));
        assert!(result.contains("../ui/button"));
        assert!(result.contains("customStyles"));
        assert!(result.contains("backgroundColor"));
        assert!(result.contains("borderRadius"));
    }

    #[test]
    fn test_generate_wrapper_component_without_styles() {
        let styles = HashMap::new();
        let result = generate_wrapper_component("my-card", "card", "ui", &styles);

        assert!(result.contains("MyCard"));
        assert!(result.contains("Card"));
        assert!(!result.contains("customStyles"));
        assert!(!result.contains("style={{"));
    }

    #[test]
    fn test_generate_wrapper_component_custom_source() {
        let styles = HashMap::new();
        let result =
            generate_wrapper_component("extended-primary", "primary-button", "custom", &styles);

        assert!(result.contains("ExtendedPrimary"));
        assert!(result.contains("PrimaryButton"));
        assert!(result.contains("./primary-button"));
    }

    #[test]
    fn test_save_result_serialization() {
        let result = SaveResult {
            success: true,
            path: Some("/home/user/.orbit/canvas/components/custom/my-button.tsx".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&result);
        assert!(json.is_ok(), "SaveResult should serialize");

        let json_str = json.expect("Serialization should succeed");
        assert!(json_str.contains("\"success\":true"));
        assert!(json_str.contains("\"path\""));
        assert!(json_str.contains("my-button.tsx"));
    }

    #[test]
    fn test_save_component_input_deserialization() {
        let json = r##"{
            "name": "primary-button",
            "sourceName": "button",
            "sourceType": "ui",
            "styles": {"background-color": "#ff0000"},
            "props": {}
        }"##;

        let input: serde_json::Result<SaveComponentInput> = serde_json::from_str(json);
        assert!(input.is_ok(), "SaveComponentInput should deserialize");

        let input = input.expect("Deserialization should succeed");
        assert_eq!(input.name, "primary-button");
        assert_eq!(input.source_name, "button");
        assert_eq!(input.source_type, "ui");
        assert_eq!(
            input.styles.get("background-color"),
            Some(&"#ff0000".to_string())
        );
    }
}
