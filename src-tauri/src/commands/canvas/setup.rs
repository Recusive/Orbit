//! Canvas setup commands for ~/.orbit/canvas directory management
//!
//! Provides Tauri commands to initialize, check, and manage the Canvas
//! component library stored in the user's home directory.
//!
//! ## Environment Override
//!
//! The `ORBIT_CANVAS_PATH` environment variable can be set to override
//! the default `~/.orbit/canvas` path. This is useful for testing and
//! non-standard setups.

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
    reason = "String construction from literals is clearer with .to_string()"
)]
#![expect(
    clippy::disallowed_methods,
    reason = "std::env::var used for ORBIT_CANVAS_PATH override - intentional for test/dev flexibility"
)]
#![expect(
    clippy::redundant_closure_for_method_calls,
    reason = "Explicit closure is clearer in filter_map chains"
)]
#![expect(
    clippy::option_if_let_else,
    reason = "match is more readable than map_or for Result error handling"
)]

use std::path::PathBuf;
use std::result;

use chrono::Utc;
use serde::{Deserialize, Serialize};

/// Result type for setup commands
type Result<T> = result::Result<T, String>;

// ============================================================================
// Types
// ============================================================================

/// Status of the Canvas setup
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    /// Whether the Canvas environment is fully initialized
    pub initialized: bool,
    /// Path to the ~/.orbit/canvas directory
    pub orbit_path: String,
    /// Number of components installed in components/ui
    pub component_count: u32,
    /// Whether the preview environment is ready (has node_modules)
    pub preview_ready: bool,
}

/// Metadata for a single component in the local registry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentMeta {
    /// Component name (e.g., "button", "dialog")
    pub name: String,
    /// Component type (e.g., "ui", "custom")
    pub component_type: String,
    /// npm dependencies required by this component
    pub dependencies: Vec<String>,
    /// Other shadcn components this component depends on
    pub registry_dependencies: Vec<String>,
}

/// Local registry tracking installed components
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRegistry {
    /// Registry format version
    pub version: String,
    /// ISO 8601 timestamp of last update
    pub last_updated: String,
    /// List of installed components
    pub components: Vec<ComponentMeta>,
}

impl Default for LocalRegistry {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            last_updated: Utc::now().to_rfc3339(),
            components: Vec::new(),
        }
    }
}

// ============================================================================
// Path Resolution
// ============================================================================

/// Get the path to ~/.orbit/canvas
///
/// Supports `ORBIT_CANVAS_PATH` environment variable override for testing
/// and non-standard setups.
///
/// # Errors
///
/// Returns an error if the home directory cannot be determined.
pub fn get_orbit_canvas_path() -> Result<PathBuf> {
    // Check for env override (useful for testing)
    if let Ok(override_path) = std::env::var("ORBIT_CANVAS_PATH") {
        return Ok(PathBuf::from(override_path));
    }

    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".orbit").join("canvas"))
}

// ============================================================================
// Commands
// ============================================================================

/// Get the path to the Canvas directory
///
/// Returns the resolved path to `~/.orbit/canvas` or the override path
/// if `ORBIT_CANVAS_PATH` is set.
#[tauri::command]
pub async fn canvas_get_orbit_path() -> Result<String> {
    let path = get_orbit_canvas_path()?;
    Ok(path.to_string_lossy().to_string())
}

/// Check the current Canvas setup status
///
/// Returns detailed information about:
/// - Whether the environment is initialized
/// - The path to the Canvas directory
/// - Number of installed components
/// - Whether the preview environment is ready
#[tauri::command]
pub async fn canvas_check_setup() -> Result<SetupStatus> {
    let orbit_path = get_orbit_canvas_path()?;
    let components_path = orbit_path.join("components").join("ui");
    let ready_marker = orbit_path.join(".ready");

    let initialized = orbit_path.exists() && ready_marker.exists();

    let component_count = if components_path.exists() {
        std::fs::read_dir(&components_path)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .is_some_and(|ext| ext == "tsx" || ext == "ts")
                    })
                    .count()
            })
            .map_err(|e| format!("Failed to read components directory: {e}"))?
    } else {
        0
    };

    let preview_ready = orbit_path.join("preview").join("node_modules").exists();

    Ok(SetupStatus {
        initialized,
        orbit_path: orbit_path.to_string_lossy().to_string(),
        component_count: u32::try_from(component_count).unwrap_or(u32::MAX),
        preview_ready,
    })
}

/// Initialize the Canvas directory structure
///
/// Creates the following directories:
/// - `~/.orbit/canvas/components/ui` - shadcn components
/// - `~/.orbit/canvas/components/custom` - user-created components
/// - `~/.orbit/canvas/lib` - utility functions (cn, etc.)
/// - `~/.orbit/canvas/hooks` - React hooks (useIsMobile, etc.)
/// - `~/.orbit/canvas/preview/src` - preview app source
#[tauri::command]
pub async fn canvas_initialize_directories() -> Result<()> {
    let orbit_path = get_orbit_canvas_path()?;

    let dirs = [
        orbit_path.join("components").join("ui"),
        orbit_path.join("components").join("custom"),
        orbit_path.join("lib"),
        orbit_path.join("hooks"),
        orbit_path.join("preview").join("src"),
    ];

    for dir in &dirs {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }

    // Create the use-mobile hook (required by sidebar component)
    let use_mobile_hook = r#""use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
"#;
    std::fs::write(
        orbit_path.join("hooks").join("use-mobile.tsx"),
        use_mobile_hook,
    )
    .map_err(|e| format!("Failed to write use-mobile hook: {e}"))?;

    Ok(())
}

/// Mark the Canvas setup as complete
///
/// Creates a `.ready` marker file to indicate successful initialization.
#[tauri::command]
pub async fn canvas_mark_ready() -> Result<()> {
    let orbit_path = get_orbit_canvas_path()?;
    let ready_marker = orbit_path.join(".ready");

    std::fs::write(&ready_marker, Utc::now().to_rfc3339())
        .map_err(|e| format!("Failed to create ready marker: {e}"))?;

    Ok(())
}

/// Reset Canvas setup by removing ~/.orbit/canvas entirely
///
/// **Warning**: This is destructive and removes all installed components
/// and custom configurations.
#[tauri::command]
pub async fn canvas_reset_setup() -> Result<()> {
    let orbit_path = get_orbit_canvas_path()?;

    if orbit_path.exists() {
        std::fs::remove_dir_all(&orbit_path)
            .map_err(|e| format!("Failed to remove {}: {e}", orbit_path.display()))?;
    }

    Ok(())
}

/// Get the local component registry
///
/// Returns the registry of installed components. If no registry exists,
/// returns a default empty registry.
#[tauri::command]
pub async fn canvas_get_registry() -> Result<LocalRegistry> {
    let orbit_path = get_orbit_canvas_path()?;
    let registry_path = orbit_path.join("registry.json");

    if !registry_path.exists() {
        return Ok(LocalRegistry::default());
    }

    let content = std::fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry: {e}"))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse registry: {e}"))
}

/// Save the local component registry
///
/// Persists the registry to `~/.orbit/canvas/registry.json`.
#[tauri::command]
pub async fn canvas_save_registry(registry: LocalRegistry) -> Result<()> {
    let orbit_path = get_orbit_canvas_path()?;

    // Ensure directory exists
    std::fs::create_dir_all(&orbit_path)
        .map_err(|e| format!("Failed to create canvas directory: {e}"))?;

    let registry_path = orbit_path.join("registry.json");

    let content = serde_json::to_string_pretty(&registry)
        .map_err(|e| format!("Failed to serialize registry: {e}"))?;

    std::fs::write(&registry_path, content).map_err(|e| format!("Failed to write registry: {e}"))
}

// ============================================================================
// Error Recovery Commands
// ============================================================================

/// Check if the preview server port (5199) is available
///
/// Attempts to bind to the port to verify availability.
/// Returns `true` if the port is free, `false` if already in use.
#[tauri::command]
pub async fn canvas_check_port_available() -> Result<bool> {
    use std::net::TcpListener;

    match TcpListener::bind("127.0.0.1:5199") {
        Ok(_listener) => {
            // Port is available - listener is dropped automatically
            Ok(true)
        },
        Err(_) => {
            // Port is in use or unavailable
            Ok(false)
        },
    }
}

/// Get the list of already downloaded components
///
/// Returns the names of component files in `~/.orbit/canvas/components/ui/`.
/// Useful for detecting partial downloads and enabling resume functionality.
#[tauri::command]
pub async fn canvas_get_download_state() -> Result<Vec<String>> {
    let orbit_path = get_orbit_canvas_path()?;
    let components_path = orbit_path.join("components").join("ui");

    if !components_path.exists() {
        return Ok(vec![]);
    }

    let downloaded: Vec<String> = std::fs::read_dir(&components_path)
        .map_err(|e| format!("Failed to read components directory: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            // Only include .tsx and .ts files
            if path
                .extension()
                .is_some_and(|ext| ext == "tsx" || ext == "ts")
            {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect();

    Ok(downloaded)
}

/// Resume download from a partial state
///
/// Downloads only components that are not in the `skip_components` list.
/// Use with `canvas_get_download_state()` to get the list of already downloaded.
///
/// # Arguments
///
/// * `app_handle` - Tauri app handle for emitting progress events
/// * `skip_components` - List of component names to skip (already downloaded)
///
/// # Returns
///
/// A `DownloadSummary` with the results of the resumed download.
#[tauri::command]
pub async fn canvas_resume_download(
    app_handle: tauri::AppHandle,
    skip_components: Vec<String>,
) -> Result<super::download::DownloadSummary> {
    use std::collections::HashSet;

    use chrono::Utc;
    use tauri::Emitter as _;

    // Build set of components to skip for O(1) lookup
    let skip_set: HashSet<&str> = skip_components.iter().map(|s| s.as_str()).collect();

    // Filter out already downloaded components
    let remaining: Vec<&str> = super::download::SHADCN_COMPONENTS
        .iter()
        .filter(|c| !skip_set.contains(*c))
        .copied()
        .collect();

    if remaining.is_empty() {
        // All components already downloaded
        return Ok(super::download::DownloadSummary {
            total: 0,
            successful: 0,
            failed: 0,
            npm_dependencies: vec![],
            errors: vec![],
        });
    }

    let total = u32::try_from(remaining.len()).unwrap_or(u32::MAX);
    let mut successful = 0u32;
    let mut failed = 0u32;
    let mut errors = Vec::new();
    let mut all_npm_deps: HashSet<String> = HashSet::new();

    // Emit start event
    let _ = app_handle.emit(
        "canvas:download-progress",
        super::download::DownloadProgress {
            component: "Resuming...".to_string(),
            current: 0,
            total,
            phase: "downloading".to_string(),
        },
    );

    // Download each remaining component
    for (idx, name) in remaining.iter().enumerate() {
        let current = u32::try_from(idx + 1).unwrap_or(u32::MAX);

        // Emit progress event
        let _ = app_handle.emit(
            "canvas:download-progress",
            super::download::DownloadProgress {
                component: (*name).to_string(),
                current,
                total,
                phase: "downloading".to_string(),
            },
        );

        match super::download::canvas_download_component((*name).to_string()).await {
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

    // Mark setup as complete if we downloaded everything successfully
    if failed == 0 {
        let orbit_path = get_orbit_canvas_path()?;
        let _ = std::fs::write(orbit_path.join(".ready"), "");

        // Update registry with all components
        let registry = LocalRegistry {
            version: "1.0.0".to_string(),
            last_updated: Utc::now().to_rfc3339(),
            components: super::download::SHADCN_COMPONENTS
                .iter()
                .map(|name| ComponentMeta {
                    name: (*name).to_string(),
                    component_type: "ui".to_string(),
                    dependencies: vec![],
                    registry_dependencies: vec![],
                })
                .collect(),
        };
        canvas_save_registry(registry).await?;
    }

    // Emit complete event
    let _ = app_handle.emit(
        "canvas:download-progress",
        super::download::DownloadProgress {
            component: "Complete".to_string(),
            current: total,
            total,
            phase: "complete".to_string(),
        },
    );

    Ok(super::download::DownloadSummary {
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
    fn test_setup_status_serialization() {
        let status = SetupStatus {
            initialized: true,
            orbit_path: "/home/user/.orbit/canvas".to_string(),
            component_count: 42,
            preview_ready: false,
        };

        let json = serde_json::to_string(&status);
        assert!(json.is_ok(), "SetupStatus should serialize");

        let json_str = json.expect("Serialization should succeed");
        assert!(json_str.contains("\"initialized\":true"));
        assert!(json_str.contains("\"componentCount\":42"));
    }

    #[test]
    fn test_local_registry_default() {
        let registry = LocalRegistry::default();

        assert_eq!(registry.version, "1.0.0");
        assert!(registry.components.is_empty());
        assert!(!registry.last_updated.is_empty());
    }

    #[test]
    fn test_component_meta_serialization() {
        let meta = ComponentMeta {
            name: "button".to_string(),
            component_type: "ui".to_string(),
            dependencies: vec!["@radix-ui/react-slot".to_string()],
            registry_dependencies: vec![],
        };

        let json = serde_json::to_string(&meta);
        assert!(json.is_ok(), "ComponentMeta should serialize");

        let json_str = json.expect("Serialization should succeed");
        assert!(json_str.contains("\"name\":\"button\""));
        assert!(json_str.contains("\"componentType\":\"ui\""));
    }

    #[test]
    fn test_get_orbit_canvas_path_with_env_override() {
        // Set env override
        std::env::set_var("ORBIT_CANVAS_PATH", "/tmp/test-orbit-canvas");

        let path = get_orbit_canvas_path();
        assert!(path.is_ok());
        assert_eq!(
            path.expect("Path should resolve"),
            PathBuf::from("/tmp/test-orbit-canvas")
        );

        // Clean up
        std::env::remove_var("ORBIT_CANVAS_PATH");
    }
}
