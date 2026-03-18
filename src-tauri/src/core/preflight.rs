//! Startup preflight checks for production readiness.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::commands::common::{credentials, providers};
use crate::opencode::process::resolve_opencode_binary_path;

/// High-level status for the full preflight report and each individual check.
#[non_exhaustive]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    /// The check passed.
    Ok,
    /// The check passed with a warning or an optional dependency is missing.
    Warn,
    /// The check failed.
    Error,
}

/// Logical grouping for a preflight check.
#[non_exhaustive]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckCategory {
    /// Binary availability and file sanity checks.
    Binary,
    /// Authentication and credential availability checks.
    Credentials,
    /// Host environment checks.
    Environment,
}

/// Suggested recovery step for a failing check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryAction {
    /// Short action label shown to the user.
    pub label: String,
    /// Optional extra detail describing the recovery step.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// One startup health check entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheck {
    /// Stable identifier for the check.
    pub id: String,
    /// Logical grouping of the check.
    pub category: CheckCategory,
    /// Result status.
    pub status: CheckStatus,
    /// Short label for UI display.
    pub label: String,
    /// Human-readable summary message.
    pub message: String,
    /// Optional supplemental detail.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    /// Suggested user action when recovery is possible.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery: Option<RecoveryAction>,
}

/// Aggregate startup health report shared with the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightReport {
    /// Report creation time as Unix milliseconds.
    pub generated_at: i64,
    /// Overall status derived from the individual checks.
    pub overall_status: CheckStatus,
    /// Individual preflight checks.
    pub checks: Vec<PreflightCheck>,
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt as _;

    path.metadata()
        .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.exists()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or_default()
}

fn binary_check(
    id: &str,
    label: &str,
    path: &Path,
    required: bool,
    recovery: RecoveryAction,
) -> PreflightCheck {
    if !path.exists() {
        return PreflightCheck {
            id: id.to_owned(),
            category: CheckCategory::Binary,
            status: if required {
                CheckStatus::Error
            } else {
                CheckStatus::Warn
            },
            label: label.to_owned(),
            message: format!("{label} binary is missing."),
            details: Some(path.display().to_string()),
            recovery: Some(recovery),
        };
    }

    let metadata = match path.metadata() {
        Ok(metadata) => metadata,
        Err(error) => {
            return PreflightCheck {
                id: id.to_owned(),
                category: CheckCategory::Binary,
                status: if required {
                    CheckStatus::Error
                } else {
                    CheckStatus::Warn
                },
                label: label.to_owned(),
                message: format!("Failed to inspect {label} binary."),
                details: Some(error.to_string()),
                recovery: Some(recovery),
            };
        },
    };

    if metadata.len() <= 1_000_000 {
        return PreflightCheck {
            id: id.to_owned(),
            category: CheckCategory::Binary,
            status: if required {
                CheckStatus::Error
            } else {
                CheckStatus::Warn
            },
            label: label.to_owned(),
            message: format!("{label} binary looks incomplete."),
            details: Some(format!("{} bytes at {}", metadata.len(), path.display())),
            recovery: Some(recovery),
        };
    }

    if !is_executable(path) {
        return PreflightCheck {
            id: id.to_owned(),
            category: CheckCategory::Binary,
            status: if required {
                CheckStatus::Error
            } else {
                CheckStatus::Warn
            },
            label: label.to_owned(),
            message: format!("{label} binary is not executable."),
            details: Some(path.display().to_string()),
            recovery: Some(recovery),
        };
    }

    PreflightCheck {
        id: id.to_owned(),
        category: CheckCategory::Binary,
        status: CheckStatus::Ok,
        label: label.to_owned(),
        message: format!("{label} binary is ready."),
        details: Some(path.display().to_string()),
        recovery: None,
    }
}

fn credential_check() -> PreflightCheck {
    if credentials::load_api_key("claude").is_some() {
        return PreflightCheck {
            id: "claude_credentials".to_owned(),
            category: CheckCategory::Credentials,
            status: CheckStatus::Ok,
            label: "Claude credentials".to_owned(),
            message: "Stored Claude API key is available.".to_owned(),
            details: None,
            recovery: None,
        };
    }

    #[cfg(target_os = "macos")]
    {
        let status = providers::keychain_status_sync();
        if status.has_credentials {
            return PreflightCheck {
                id: "claude_credentials".to_owned(),
                category: CheckCategory::Credentials,
                status: CheckStatus::Ok,
                label: "Claude credentials".to_owned(),
                message: "Claude Code OAuth credentials are available.".to_owned(),
                details: status.error,
                recovery: None,
            };
        }

        PreflightCheck {
            id: "claude_credentials".to_owned(),
            category: CheckCategory::Credentials,
            status: CheckStatus::Error,
            label: "Claude credentials".to_owned(),
            message: "No usable Claude credentials were found.".to_owned(),
            details: status.error.or_else(|| {
                status.entry_exists.then(|| {
                    "Claude Code Keychain entry exists but is not currently usable.".to_owned()
                })
            }),
            recovery: Some(RecoveryAction {
                label: "Open Account Settings".to_owned(),
                details: Some("Add an API key or re-authenticate with Claude Code.".to_owned()),
            }),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PreflightCheck {
            id: "claude_credentials".to_owned(),
            category: CheckCategory::Credentials,
            status: CheckStatus::Error,
            label: "Claude credentials".to_owned(),
            message: "No usable Claude credentials were found.".to_owned(),
            details: Some("Add a Claude API key in Settings.".to_owned()),
            recovery: Some(RecoveryAction {
                label: "Open Account Settings".to_owned(),
                details: Some("Add an API key to enable Claude sessions.".to_owned()),
            }),
        }
    }
}

fn home_check() -> PreflightCheck {
    dirs::home_dir().map_or_else(
        || PreflightCheck {
            id: "home_env".to_owned(),
            category: CheckCategory::Environment,
            status: CheckStatus::Error,
            label: "HOME environment".to_owned(),
            message: "HOME is not configured.".to_owned(),
            details: None,
            recovery: None,
        },
        |home| PreflightCheck {
            id: "home_env".to_owned(),
            category: CheckCategory::Environment,
            status: CheckStatus::Ok,
            label: "HOME environment".to_owned(),
            message: "HOME is configured.".to_owned(),
            details: Some(home.display().to_string()),
            recovery: None,
        },
    )
}

fn orbit_dir_check() -> PreflightCheck {
    let Some(home_dir) = dirs::home_dir() else {
        return PreflightCheck {
            id: "orbit_dir".to_owned(),
            category: CheckCategory::Environment,
            status: CheckStatus::Error,
            label: "~/.orbit directory".to_owned(),
            message: "Could not resolve the Orbit data directory.".to_owned(),
            details: None,
            recovery: None,
        };
    };

    let orbit_dir = home_dir.join(".orbit");
    match fs::create_dir_all(&orbit_dir) {
        Ok(()) => {
            let readonly = orbit_dir
                .metadata()
                .map(|metadata| metadata.permissions().readonly())
                .unwrap_or(false);
            if readonly {
                return PreflightCheck {
                    id: "orbit_dir".to_owned(),
                    category: CheckCategory::Environment,
                    status: CheckStatus::Error,
                    label: "~/.orbit directory".to_owned(),
                    message: "Orbit data directory is read-only.".to_owned(),
                    details: Some(orbit_dir.display().to_string()),
                    recovery: None,
                };
            }

            PreflightCheck {
                id: "orbit_dir".to_owned(),
                category: CheckCategory::Environment,
                status: CheckStatus::Ok,
                label: "~/.orbit directory".to_owned(),
                message: "Orbit data directory is writable.".to_owned(),
                details: Some(orbit_dir.display().to_string()),
                recovery: None,
            }
        },
        Err(error) => PreflightCheck {
            id: "orbit_dir".to_owned(),
            category: CheckCategory::Environment,
            status: CheckStatus::Error,
            label: "~/.orbit directory".to_owned(),
            message: "Failed to prepare the Orbit data directory.".to_owned(),
            details: Some(error.to_string()),
            recovery: None,
        },
    }
}

/// Run the startup preflight checks.
#[must_use]
pub fn run_preflight(sidecar_path: &Path) -> PreflightReport {
    let mut checks = Vec::new();

    checks.push(binary_check(
        "agent_bridge",
        "Agent bridge",
        sidecar_path,
        true,
        RecoveryAction {
            label: "Run bun run build:sidecar".to_owned(),
            details: None,
        },
    ));

    let claude_path = providers::resolve_claude_binary_path().unwrap_or_else(|| {
        sidecar_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("claude")
    });
    checks.push(binary_check(
        "claude_cli",
        "Claude CLI",
        &claude_path,
        true,
        RecoveryAction {
            label: "Run bun run build:sidecar".to_owned(),
            details: Some("The sidecar build also bundles the Claude CLI.".to_owned()),
        },
    ));

    let orbit_server_path = resolve_opencode_binary_path().ok();
    if let Some(path) = orbit_server_path.as_deref() {
        checks.push(binary_check(
            "orbit_server",
            "Orbit Server",
            path,
            false,
            RecoveryAction {
                label: "Run bun run build:opencode".to_owned(),
                details: None,
            },
        ));
    } else {
        checks.push(PreflightCheck {
            id: "orbit_server".to_owned(),
            category: CheckCategory::Binary,
            status: CheckStatus::Warn,
            label: "Orbit Server".to_owned(),
            message: "Orbit Server binary is missing.".to_owned(),
            details: Some("OpenCode features will stay unavailable until it is built.".to_owned()),
            recovery: Some(RecoveryAction {
                label: "Run bun run build:opencode".to_owned(),
                details: None,
            }),
        });
    }

    checks.push(credential_check());
    checks.push(home_check());
    checks.push(orbit_dir_check());

    let overall_status = if checks
        .iter()
        .any(|check| check.status == CheckStatus::Error)
    {
        CheckStatus::Error
    } else if checks.iter().any(|check| check.status == CheckStatus::Warn) {
        CheckStatus::Warn
    } else {
        CheckStatus::Ok
    };

    PreflightReport {
        generated_at: now_ms(),
        overall_status,
        checks,
    }
}
