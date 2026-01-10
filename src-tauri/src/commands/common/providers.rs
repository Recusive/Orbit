//! Provider detection commands for Tauri
//!
//! Handles credential detection (keychain check).
//! Note: CLI detection removed - bundled app has its own claude binary.
//! Note: Keychain reading is handled by agent-bridge TypeScript code.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use serde::{Deserialize, Serialize};

use crate::core::perf_logger::PerfSource;
use crate::perf_log;

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

/// Check for Claude Code credentials in the system keychain.
///
/// This is a lightweight check that only verifies if credentials exist.
/// The actual credential reading is handled by agent-bridge TypeScript code
/// to avoid duplicating the parsing logic.
#[tauri::command]
pub async fn check_claude_keychain() -> KeychainStatus {
    perf_log!(PerfSource::Ipc, "check_claude_keychain", {
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
    })
}

/// Check if credentials exist in macOS keychain (without parsing them).
#[cfg(target_os = "macos")]
async fn check_macos_keychain_exists() -> KeychainStatus {
    use std::process::Command;

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
