//! Canvas component download commands
//!
//! Provides Tauri commands to download shadcn components from the registry
//! and save them to the local ~/.orbit/canvas directory.

#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]
#![expect(
    clippy::absolute_paths,
    reason = "std::fs calls are clearer inline for file operations in scaffold code"
)]
#![expect(
    clippy::str_to_string,
    reason = "Event payloads and structs require owned strings, .to_string() is clearer than .to_owned()"
)]

use std::collections::HashSet;
use std::time::Duration;

use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::Emitter as _;

/// A file from the shadcn registry
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryFile {
    /// Relative path (e.g., "ui/button.tsx" or "lib/utils.ts")
    pub path: String,
    /// File content
    pub content: String,
    /// File type (e.g., "registry:ui")
    #[serde(rename = "type")]
    pub file_type: String,
}

/// A component from the shadcn registry
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryComponent {
    /// Component name (e.g., "button")
    pub name: String,
    /// Component type (e.g., "registry:ui")
    #[serde(rename = "type")]
    pub component_type: String,
    /// npm dependencies (e.g., `["@radix-ui/react-slot"]`)
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// Other shadcn components this depends on (e.g., `["button"]`)
    #[serde(rename = "registryDependencies", default)]
    pub registry_dependencies: Vec<String>,
    /// Files to write
    pub files: Vec<RegistryFile>,
}

/// Result of downloading a single component
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    /// Component name
    pub name: String,
    /// Whether the download succeeded
    pub success: bool,
    /// Path where component was saved (if successful)
    pub path: Option<String>,
    /// npm dependencies required
    pub dependencies: Vec<String>,
    /// Other shadcn components required
    pub registry_dependencies: Vec<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

/// Base URL for shadcn registry
const SHADCN_REGISTRY_URL: &str = "https://ui.shadcn.com/r";
/// Style to use (new-york-v4 is for Tailwind v4)
const SHADCN_STYLE: &str = "new-york-v4";
const REQUEST_TIMEOUT_SECS: u64 = 30;
const MAX_RETRY_ATTEMPTS: u32 = 3;
const RETRY_DELAY_SECS: u64 = 1;

/// All shadcn components to download (verified Jan 2025)
pub const SHADCN_COMPONENTS: &[&str] = &[
    "accordion",
    "alert-dialog",
    "alert",
    "aspect-ratio",
    "avatar",
    "badge",
    "breadcrumb",
    "button",
    "calendar",
    "card",
    "carousel",
    "chart",
    "checkbox",
    "collapsible",
    "command",
    "context-menu",
    "dialog",
    "drawer",
    "dropdown-menu",
    "form",
    "hover-card",
    "input-otp",
    "input",
    "label",
    "menubar",
    "navigation-menu",
    "pagination",
    "popover",
    "progress",
    "radio-group",
    "resizable",
    "scroll-area",
    "select",
    "separator",
    "sheet",
    "sidebar",
    "skeleton",
    "slider",
    "sonner",
    "switch",
    "table",
    "tabs",
    "textarea",
    // Note: "toast" is deprecated in v4, replaced by "sonner"
    "toggle-group",
    "toggle",
    "tooltip",
];

/// Progress event emitted during batch download
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    /// Current component being downloaded
    pub component: String,
    /// Current progress (1-indexed)
    pub current: u32,
    /// Total number of components
    pub total: u32,
    /// Phase: "downloading" | "complete" | "error"
    pub phase: String,
}

/// Summary of batch download operation
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSummary {
    /// Total components attempted
    pub total: u32,
    /// Successfully downloaded
    pub successful: u32,
    /// Failed to download
    pub failed: u32,
    /// All npm dependencies needed
    pub npm_dependencies: Vec<String>,
    /// Error messages for failed components
    pub errors: Vec<String>,
}

/// Create HTTP client with timeout
fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

/// Download a single component from the shadcn registry
///
/// Fetches the component JSON from `https://ui.shadcn.com/r/styles/{style}/{name}.json`,
/// parses it, and writes the files to `~/.orbit/canvas/components/ui/`.
///
/// # Arguments
///
/// * `name` - Component name (e.g., "button", "dialog", "card")
///
/// # Returns
///
/// A `DownloadResult` indicating success/failure and any dependencies.
#[tauri::command]
pub async fn canvas_download_component(name: String) -> Result<DownloadResult, String> {
    let client = create_client()?;
    let url = format!("{SHADCN_REGISTRY_URL}/styles/{SHADCN_STYLE}/{name}.json");

    // Retry logic for network failures
    let mut attempts = 0;

    let response = loop {
        attempts += 1;
        match client.get(&url).send().await {
            Ok(resp) => break resp,
            Err(_) if attempts < MAX_RETRY_ATTEMPTS => {
                tokio::time::sleep(Duration::from_secs(RETRY_DELAY_SECS)).await;
            },
            Err(e) => {
                return Ok(DownloadResult {
                    name: name.clone(),
                    success: false,
                    path: None,
                    dependencies: vec![],
                    registry_dependencies: vec![],
                    error: Some(format!("Network error after {attempts} attempts: {e}")),
                });
            },
        }
    };

    if !response.status().is_success() {
        return Ok(DownloadResult {
            name: name.clone(),
            success: false,
            path: None,
            dependencies: vec![],
            registry_dependencies: vec![],
            error: Some(format!("HTTP {}", response.status())),
        });
    }

    let component: RegistryComponent = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse {name}: {e}"))?;

    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Save each file using the path from registry
    for file in &component.files {
        let relative_path = std::path::Path::new(&file.path);

        // Determine destination based on file path
        let dest_path = if file.path.contains("lib/") {
            // Library files go to lib/
            orbit_path
                .join("lib")
                .join(relative_path.file_name().unwrap_or_default())
        } else {
            // Component files go to components/ui/
            orbit_path
                .join("components")
                .join("ui")
                .join(relative_path.file_name().unwrap_or_default())
        };

        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        }

        // Transform import paths from @/lib/utils to ../lib/utils
        let transformed_content = transform_imports(&file.content);

        std::fs::write(&dest_path, transformed_content)
            .map_err(|e| format!("Failed to write {}: {e}", dest_path.display()))?;
    }

    Ok(DownloadResult {
        name: component.name,
        success: true,
        path: Some(
            orbit_path
                .join("components")
                .join("ui")
                .to_string_lossy()
                .to_string(),
        ),
        dependencies: component.dependencies,
        registry_dependencies: component.registry_dependencies,
        error: None,
    })
}

/// Transform shadcn import paths to our local structure
///
/// The shadcn registry uses internal paths like:
/// - `@/lib/utils` → `../../lib/utils` (relative path)
/// - `@/registry/new-york-v4/ui/*` → `@/components/ui/*` (vite alias)
/// - `@/registry/new-york-v4/lib/*` → `@/lib/*` (vite alias)
/// - `@/registry/new-york-v4/hooks/*` → `@/hooks/*` (vite alias)
///
/// Components are in `~/.orbit/canvas/components/ui/`, and vite.config.ts
/// has aliases for `@/components/ui`, `@/lib`, and `@/hooks`.
fn transform_imports(content: &str) -> String {
    content
        // Transform @/lib/utils to relative path (for components that import utils)
        .replace("from \"@/lib/utils\"", "from \"../../lib/utils\"")
        .replace("from '@/lib/utils'", "from '../../lib/utils'")
        // Transform internal registry paths to our local aliases
        .replace("@/registry/new-york-v4/ui/", "@/components/ui/")
        .replace("@/registry/new-york-v4/lib/", "@/lib/")
        .replace("@/registry/new-york-v4/hooks/", "@/hooks/")
}

/// Download the utils.ts helper file
///
/// Creates the `cn()` utility function at `~/.orbit/canvas/lib/utils.ts`.
/// This is required by all shadcn components.
#[tauri::command]
pub async fn canvas_download_utils() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let lib_path = orbit_path.join("lib");
    let utils_path = lib_path.join("utils.ts");

    // Ensure lib directory exists
    std::fs::create_dir_all(&lib_path)
        .map_err(|e| format!("Failed to create lib directory: {e}"))?;

    let utils_content = r#"import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
"#;

    std::fs::write(&utils_path, utils_content).map_err(|e| format!("Failed to write utils.ts: {e}"))
}

/// Download all shadcn components with progress reporting
///
/// Downloads all components from `SHADCN_COMPONENTS`, emitting progress events
/// via `canvas:download-progress`. Also downloads utils.ts and updates the
/// local registry.
///
/// # Events
///
/// Emits `canvas:download-progress` with `DownloadProgress` payload:
/// - During download: `{ component: "button", current: 5, total: 48, phase: "downloading" }`
/// - On complete: `{ component: "Complete", current: 48, total: 48, phase: "complete" }`
///
/// # Returns
///
/// A `DownloadSummary` with counts and any errors encountered.
#[tauri::command]
pub async fn canvas_download_all_components(
    app_handle: tauri::AppHandle,
) -> Result<DownloadSummary, String> {
    let components: Vec<String> = SHADCN_COMPONENTS.iter().map(|s| (*s).to_owned()).collect();
    let total = u32::try_from(components.len()).unwrap_or(u32::MAX);

    let mut successful = 0u32;
    let mut failed = 0u32;
    let mut errors = Vec::new();
    let mut all_npm_deps: HashSet<String> = HashSet::new();

    // Emit start event
    let _ = app_handle.emit(
        "canvas:download-progress",
        DownloadProgress {
            component: "Starting...".to_string(),
            current: 0,
            total,
            phase: "downloading".to_string(),
        },
    );

    // Download each component
    for (idx, name) in components.iter().enumerate() {
        let current = u32::try_from(idx + 1).unwrap_or(u32::MAX);

        // Emit progress event
        let _ = app_handle.emit(
            "canvas:download-progress",
            DownloadProgress {
                component: name.clone(),
                current,
                total,
                phase: "downloading".to_string(),
            },
        );

        match canvas_download_component(name.clone()).await {
            Ok(result) => {
                if result.success {
                    successful += 1;
                    for dep in result.dependencies {
                        let _ = all_npm_deps.insert(dep);
                    }
                } else {
                    failed += 1;
                    if let Some(err) = result.error {
                        errors.push(format!("{name}: {err}"));
                    }
                }
            },
            Err(e) => {
                failed += 1;
                errors.push(format!("{name}: {e}"));
            },
        }
    }

    // Download utils.ts (required by all components)
    if let Err(e) = canvas_download_utils().await {
        errors.push(format!("utils.ts: {e}"));
    }

    // Mark setup as complete
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    std::fs::write(orbit_path.join(".ready"), "")
        .map_err(|e| format!("Failed to write .ready marker: {e}"))?;

    // Update local registry with all components
    let registry = super::setup::LocalRegistry {
        version: "1.0.0".to_string(),
        last_updated: Utc::now().to_rfc3339(),
        components: components
            .iter()
            .map(|name| super::setup::ComponentMeta {
                name: name.clone(),
                component_type: "ui".to_string(),
                dependencies: vec![],
                registry_dependencies: vec![],
            })
            .collect(),
    };
    super::setup::canvas_save_registry(registry).await?;

    // Emit complete event
    let _ = app_handle.emit(
        "canvas:download-progress",
        DownloadProgress {
            component: "Complete".to_string(),
            current: total,
            total,
            phase: "complete".to_string(),
        },
    );

    Ok(DownloadSummary {
        total,
        successful,
        failed,
        npm_dependencies: all_npm_deps.into_iter().collect(),
        errors,
    })
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
    fn test_transform_imports_double_quotes() {
        let input = r#"import { cn } from "@/lib/utils""#;
        let expected = r#"import { cn } from "../../lib/utils""#;
        assert_eq!(transform_imports(input), expected);
    }

    #[test]
    fn test_transform_imports_single_quotes() {
        let input = "import { cn } from '@/lib/utils'";
        let expected = "import { cn } from '../../lib/utils'";
        assert_eq!(transform_imports(input), expected);
    }

    #[test]
    fn test_transform_imports_preserves_other_content() {
        let input = r#"import * as React from "react"
import { cn } from "@/lib/utils"

const Button = () => <button />"#;
        let expected = r#"import * as React from "react"
import { cn } from "../../lib/utils"

const Button = () => <button />"#;
        assert_eq!(transform_imports(input), expected);
    }

    #[test]
    fn test_download_result_serialization() {
        let result = DownloadResult {
            name: "button".to_string(),
            success: true,
            path: Some("/home/user/.orbit/canvas/components/ui".to_string()),
            dependencies: vec!["@radix-ui/react-slot".to_string()],
            registry_dependencies: vec![],
            error: None,
        };

        let json = serde_json::to_string(&result);
        assert!(json.is_ok(), "DownloadResult should serialize");

        let json_str = json.expect("Serialization should succeed");
        assert!(json_str.contains("\"name\":\"button\""));
        assert!(json_str.contains("\"success\":true"));
        assert!(json_str.contains("\"registryDependencies\":[]"));
    }
}
