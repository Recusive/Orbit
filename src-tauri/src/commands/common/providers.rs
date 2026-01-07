//! Provider detection commands for Tauri
//!
//! Handles AI provider detection (CLI installation check).
//! Note: Keychain reading is handled by agent-bridge TypeScript code.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::process::Command;

use serde::{Deserialize, Serialize};

/// Result of CLI detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliDetection {
    /// Whether the CLI is installed.
    pub installed: bool,
    /// Path to the CLI executable (if found).
    pub path: Option<String>,
    /// Version string (if available).
    pub version: Option<String>,
}

/// Result of keychain credential check.
/// Used by frontend to know if credentials exist (actual reading done in TypeScript).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainStatus {
    /// Whether valid credentials were found.
    pub has_credentials: bool,
    /// Type of credentials (e.g., "oauth", "api_key").
    pub credential_type: Option<String>,
    /// When the credentials expire (Unix timestamp), if applicable.
    pub expires_at: Option<i64>,
    /// Error message if check failed.
    pub error: Option<String>,
}

/// Detect if Claude Code CLI is installed.
///
/// Checks for the `claude` command in PATH and retrieves version info.
#[tauri::command]
pub async fn detect_claude_cli() -> CliDetection {
    // Try to find the claude command
    let which_result = Command::new("which").arg("claude").output();

    match which_result {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_owned();

            // Try to get version
            let version = Command::new("claude")
                .arg("--version")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned());

            CliDetection {
                installed: true,
                path: Some(path),
                version,
            }
        },
        _ => CliDetection {
            installed: false,
            path: None,
            version: None,
        },
    }
}

/// Check for Claude Code credentials in the system keychain.
///
/// This is a lightweight check that only verifies if credentials exist.
/// The actual credential reading is handled by agent-bridge TypeScript code
/// to avoid duplicating the parsing logic.
#[tauri::command]
pub async fn check_claude_keychain() -> KeychainStatus {
    #[cfg(target_os = "macos")]
    {
        check_macos_keychain_exists().await
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On non-macOS platforms, keychain check is not yet supported
        KeychainStatus {
            has_credentials: false,
            credential_type: None,
            expires_at: None,
            error: Some("Keychain check not supported on this platform".to_owned()),
        }
    }
}

/// Check if credentials exist in macOS keychain (without parsing them).
#[cfg(target_os = "macos")]
async fn check_macos_keychain_exists() -> KeychainStatus {
    // Try to read the Claude Code credentials from Keychain
    // We only check if the entry exists, not parse the contents
    // (actual parsing is done in TypeScript agent-bridge)
    let result = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output();

    match result {
        Ok(output) if output.status.success() => {
            // Credentials exist - the TypeScript code will handle parsing
            KeychainStatus {
                has_credentials: true,
                credential_type: Some("oauth".to_owned()),
                expires_at: None, // TypeScript handles expiry check
                error: None,
            }
        },
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("could not be found") {
                KeychainStatus {
                    has_credentials: false,
                    credential_type: None,
                    expires_at: None,
                    error: None,
                }
            } else {
                KeychainStatus {
                    has_credentials: false,
                    credential_type: None,
                    expires_at: None,
                    error: Some(format!("Keychain access error: {}", stderr.trim())),
                }
            }
        },
        Err(e) => KeychainStatus {
            has_credentials: false,
            credential_type: None,
            expires_at: None,
            error: Some(format!("Failed to check keychain: {e}")),
        },
    }
}
