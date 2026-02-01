//! Provider detection commands for Tauri
//!
//! Handles credential detection (keychain check) and CLI-based authentication.
//! Note: CLI detection removed - bundled app has its own claude binary.
//! Note: Keychain reading is handled by agent-bridge TypeScript code.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Result of keychain credential check.
/// Used by frontend to know if credentials are valid (token parsed and checked).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainStatus {
    /// Whether valid, non-expired credentials were found.
    pub has_credentials: bool,
    /// Type of credentials (e.g., "oauth", "api_key").
    pub credential_type: Option<String>,
    /// When the credentials expire (Unix timestamp), if applicable.
    pub expires_at: Option<i64>,
    /// Whether a keychain entry exists (even if token is invalid/expired).
    pub entry_exists: bool,
    /// Error message if check failed.
    pub error: Option<String>,
}

/// Result of triggering Claude CLI authentication.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTriggerResult {
    /// Whether the auth trigger completed (CLI ran successfully or token was refreshed).
    pub success: bool,
    /// Error message if the trigger failed.
    pub error: Option<String>,
}

/// Check for Claude Code credentials in the system keychain.
///
/// Parses the keychain JSON to validate that the OAuth access token exists,
/// is non-empty, and has not expired. Returns `entry_exists: true` even when
/// the token is invalid/expired so the frontend can decide to trigger re-auth.
#[tauri::command]
pub async fn check_claude_keychain() -> KeychainStatus {
    #[cfg(target_os = "macos")]
    {
        check_macos_keychain_validated().await
    }

    #[cfg(not(target_os = "macos"))]
    {
        KeychainStatus {
            has_credentials: false,
            credential_type: None,
            expires_at: None,
            entry_exists: false,
            error: Some("Keychain check not supported on this platform".to_owned()),
        }
    }
}

/// Trigger Claude CLI OAuth authentication.
///
/// Spawns the bundled `claude` binary with a minimal prompt to force the OAuth
/// flow. The CLI handles token refresh (if expired) or opens the browser for
/// first-time login. Even if the prompt itself errors (e.g. budget exceeded),
/// the auth side-effect still occurs.
#[tauri::command]
pub async fn trigger_claude_auth(app: tauri::AppHandle) -> AuthTriggerResult {
    trigger_claude_auth_inner(&app).await
}

/// Resolve the path to the bundled `claude` binary.
///
/// Uses the same discovery logic as `agent/bridge.rs`: the binary lives in the
/// same directory as the app executable (production) or in `src-tauri/binaries/`
/// (development).
fn resolve_claude_binary_path() -> Option<PathBuf> {
    use std::env;

    let target_triple = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        }
    } else if cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        "x86_64-unknown-linux-gnu"
    };

    // Try production path (next to executable)
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Tauri bundle naming (no target triple suffix)
            let prod_path = exe_dir.join("claude");
            if prod_path.exists() {
                return Some(prod_path);
            }
            // Manual builds with target triple
            let dev_path = exe_dir.join(format!("claude-{target_triple}"));
            if dev_path.exists() {
                return Some(dev_path);
            }
        }
    }

    // Fall back to development path
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("claude-{target_triple}"));
    if dev_path.exists() {
        return Some(dev_path);
    }

    None
}

/// Inner implementation of auth trigger (all platforms).
async fn trigger_claude_auth_inner(_app: &tauri::AppHandle) -> AuthTriggerResult {
    use std::process::Stdio;
    use tokio::process::Command;

    let Some(claude_path) = resolve_claude_binary_path() else {
        return AuthTriggerResult {
            success: false,
            error: Some("Could not find bundled claude binary".to_owned()),
        };
    };

    log::info!("Triggering Claude auth via: {}", claude_path.display());

    // Run claude with a tiny prompt. The CLI will:
    // - Silently refresh an expired token (no browser needed)
    // - Open the browser for first-time OAuth login
    // The command itself may fail (budget limit), but auth still happens.
    let result = Command::new(&claude_path)
        .args(["-p", "hi", "--max-turns", "1"])
        .env("DISABLE_INTERACTIVITY", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await;

    match result {
        Ok(output) => {
            // Even non-zero exit is fine — the auth side-effect happens regardless.
            // Only a spawn failure is a real error.
            if output.status.success() {
                log::info!("Claude auth trigger completed successfully");
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::info!(
                    "Claude auth trigger exited with {}: {}",
                    output.status,
                    stderr.trim()
                );
            }
            AuthTriggerResult {
                success: true,
                error: None,
            }
        },
        Err(e) => {
            log::error!("Failed to spawn claude for auth: {e}");
            AuthTriggerResult {
                success: false,
                error: Some(format!("Failed to run claude: {e}")),
            }
        },
    }
}

/// Check macOS keychain and validate the OAuth token contents.
#[cfg(target_os = "macos")]
async fn check_macos_keychain_validated() -> KeychainStatus {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

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
            let raw = String::from_utf8_lossy(&output.stdout);
            let json_str = raw.trim();

            // Parse the JSON to validate token contents
            match serde_json::from_str::<serde_json::Value>(json_str) {
                Ok(json) => {
                    // Look for claudeAiOauth.accessToken
                    let access_token = json
                        .get("claudeAiOauth")
                        .and_then(|oauth| oauth.get("accessToken"))
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");

                    let expires_at = json
                        .get("claudeAiOauth")
                        .and_then(|oauth| oauth.get("expiresAt"))
                        .and_then(serde_json::Value::as_i64);

                    if access_token.is_empty() {
                        return KeychainStatus {
                            has_credentials: false,
                            credential_type: Some("oauth".to_owned()),
                            expires_at,
                            entry_exists: true,
                            error: Some("Access token is empty".to_owned()),
                        };
                    }

                    // Check expiry (with 60s buffer for clock skew)
                    if let Some(exp) = expires_at {
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
                            .unwrap_or(0);

                        // expiresAt is in milliseconds
                        let exp_secs = exp / 1000;
                        if exp_secs <= now + 60 {
                            return KeychainStatus {
                                has_credentials: false,
                                credential_type: Some("oauth".to_owned()),
                                expires_at,
                                entry_exists: true,
                                error: Some("OAuth token has expired".to_owned()),
                            };
                        }
                    }

                    KeychainStatus {
                        has_credentials: true,
                        credential_type: Some("oauth".to_owned()),
                        expires_at,
                        entry_exists: true,
                        error: None,
                    }
                },
                Err(e) => {
                    // Entry exists but isn't valid JSON — treat as invalid
                    KeychainStatus {
                        has_credentials: false,
                        credential_type: None,
                        expires_at: None,
                        entry_exists: true,
                        error: Some(format!("Failed to parse keychain JSON: {e}")),
                    }
                },
            }
        },
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("could not be found") {
                KeychainStatus {
                    has_credentials: false,
                    credential_type: None,
                    expires_at: None,
                    entry_exists: false,
                    error: None,
                }
            } else {
                KeychainStatus {
                    has_credentials: false,
                    credential_type: None,
                    expires_at: None,
                    entry_exists: false,
                    error: Some(format!("Keychain access error: {}", stderr.trim())),
                }
            }
        },
        Err(e) => KeychainStatus {
            has_credentials: false,
            credential_type: None,
            expires_at: None,
            entry_exists: false,
            error: Some(format!("Failed to check keychain: {e}")),
        },
    }
}
