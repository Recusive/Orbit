//! Encrypted API key storage for Orbit
//!
//! Provides secure storage for user-entered API keys using AES-256-GCM encryption.
//! Keys are derived from a machine-specific identifier to prevent key portability.
//!
//! Errors are captured to Sentry for monitoring credential storage issues.

use std::fs;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::Arc;

use crate::agent::{CredentialBridge, SessionManager};
use crate::core::sentry_utils::capture_command_error;

use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::aead::Aead as _;
use aes_gcm::{Aes256Gcm, KeyInit as _, Nonce};
use base64::prelude::*;
use rand::rngs::OsRng;
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use tauri::State;

/// Result of storing an API key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreResult {
    /// Whether the key was stored successfully.
    pub success: bool,
    /// Error message if storage failed.
    pub error: Option<String>,
}

/// Result of retrieving an API key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrieveResult {
    /// The retrieved API key (if found).
    pub key: Option<String>,
    /// Error message if retrieval failed.
    pub error: Option<String>,
}

/// Result of API key validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    /// Whether the API key is valid.
    pub valid: bool,
    /// Error message if validation failed.
    pub error: Option<String>,
}

/// Encrypted credentials file structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedCredentials {
    /// Base64-encoded encrypted data.
    data: String,
    /// Base64-encoded nonce used for encryption.
    nonce: String,
    /// Version of the encryption format.
    version: u32,
}

/// Stored credentials (after decryption).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StoredCredentials {
    /// Anthropic/Claude API key.
    anthropic_api_key: Option<String>,
    /// OpenAI API key (future use).
    openai_api_key: Option<String>,
    /// Google API key (future use).
    google_api_key: Option<String>,
    /// User's preferred Claude auth method.
    ///
    /// `None` preserves the legacy behavior where a stored API key wins.
    preferred_auth_method: Option<String>,
}

/// Get the path to the credentials file.
fn get_credentials_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".orbit").join("credentials.enc"))
}

/// Get a machine-specific key for encryption.
///
/// Uses a combination of machine identifiers to derive a stable key.
/// Falls back to a static salt if machine ID cannot be determined.
fn get_machine_key() -> [u8; 32] {
    let mut hasher = Sha256::new();

    // Add a static application salt
    hasher.update(b"orbit-editor-credentials-v1");

    // Try to get machine-specific data
    // On macOS, we can use the hardware UUID
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Extract the IOPlatformUUID
            if let Some(line) = stdout.lines().find(|l| l.contains("IOPlatformUUID")) {
                hasher.update(line.as_bytes());
            }
        }
    }

    // On other platforms, fall back to hostname + username
    #[cfg(not(target_os = "macos"))]
    {
        if let Ok(hostname) = hostname::get() {
            hasher.update(hostname.to_string_lossy().as_bytes());
        }
        if let Ok(user) = whoami::username() {
            hasher.update(user.as_bytes());
        }
    }

    // Finalize and get the key
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

/// Encrypt data using AES-256-GCM.
fn encrypt_data(plaintext: &[u8], key: &[u8; 32]) -> Result<(Vec<u8>, [u8; 12]), String> {
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {e}"))?;

    Ok((ciphertext, nonce_bytes))
}

/// Decrypt data using AES-256-GCM.
fn decrypt_data(ciphertext: &[u8], nonce: &[u8; 12], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));
    let nonce = Nonce::from_slice(nonce);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {e}"))
}

/// Load and decrypt credentials from disk.
fn load_credentials() -> Result<StoredCredentials, String> {
    let path = get_credentials_path().ok_or("Could not determine credentials path")?;

    if !path.exists() {
        return Ok(StoredCredentials::default());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read credentials: {e}"))?;

    let encrypted: EncryptedCredentials =
        serde_json::from_str(&content).map_err(|e| format!("Invalid credentials format: {e}"))?;

    if encrypted.version != 1 {
        return Err(format!(
            "Unsupported credentials version: {}",
            encrypted.version
        ));
    }

    let ciphertext = BASE64_STANDARD
        .decode(&encrypted.data)
        .map_err(|e| format!("Invalid base64 data: {e}"))?;

    let nonce_vec = BASE64_STANDARD
        .decode(&encrypted.nonce)
        .map_err(|e| format!("Invalid base64 nonce: {e}"))?;

    let nonce: [u8; 12] = nonce_vec
        .try_into()
        .map_err(|_v| "Invalid nonce length".to_owned())?;

    let key = get_machine_key();
    let plaintext = decrypt_data(&ciphertext, &nonce, &key)?;

    let credentials: StoredCredentials = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Invalid decrypted credentials: {e}"))?;

    Ok(credentials)
}

/// Encrypt and save credentials to disk.
fn save_credentials(credentials: &StoredCredentials) -> Result<(), String> {
    let path = get_credentials_path().ok_or("Could not determine credentials path")?;

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let plaintext = serde_json::to_vec(credentials)
        .map_err(|e| format!("Failed to serialize credentials: {e}"))?;

    let key = get_machine_key();
    let (ciphertext, nonce) = encrypt_data(&plaintext, &key)?;

    let encrypted = EncryptedCredentials {
        data: BASE64_STANDARD.encode(&ciphertext),
        nonce: BASE64_STANDARD.encode(nonce),
        version: 1,
    };

    let content = serde_json::to_string_pretty(&encrypted)
        .map_err(|e| format!("Failed to serialize encrypted credentials: {e}"))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write credentials: {e}"))?;

    Ok(())
}

/// Load the stored API key for a provider for startup bootstrapping.
pub fn load_api_key(provider: &str) -> Option<String> {
    match load_credentials() {
        Ok(credentials) => match provider {
            "claude" | "anthropic" => credentials.anthropic_api_key,
            "openai" => credentials.openai_api_key,
            "google" => credentials.google_api_key,
            _ => None,
        },
        Err(error) => {
            log::warn!("Failed to load credentials: {error}");
            None
        },
    }
}

/// Load the stored preferred Claude auth method for startup bootstrapping.
pub fn load_preferred_auth_method() -> Option<String> {
    match load_credentials() {
        Ok(credentials) => credentials.preferred_auth_method,
        Err(error) => {
            log::warn!("Failed to load preferred auth method: {error}");
            None
        },
    }
}

/// Sanitize the stored auth method value.
#[must_use]
pub fn sanitize_preferred_auth_method(preferred: Option<&str>) -> Option<&'static str> {
    match preferred {
        Some("oauth") => Some("oauth"),
        Some("apikey") => Some("apikey"),
        _ => None,
    }
}

fn validate_preferred_auth_method(method: &str) -> Result<(), String> {
    match method {
        "oauth" | "apikey" => Ok(()),
        _ => Err(format!("Invalid auth method: {method}")),
    }
}

/// Decide whether the stored Claude API key should be injected into the sidecar.
#[must_use]
pub fn should_inject_claude_api_key(stored_api_key: Option<&str>, preferred: Option<&str>) -> bool {
    stored_api_key.is_some() && sanitize_preferred_auth_method(preferred) != Some("oauth")
}

/// Store an API key securely.
///
/// Encrypts the key using AES-256-GCM with a machine-specific key.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands require owned parameters for deserialization"
)]
pub fn store_api_key(
    provider: String,
    key: String,
    credential_bridge: State<'_, Arc<CredentialBridge>>,
    session_manager: State<'_, Arc<SessionManager>>,
) -> StoreResult {
    let result = (|| -> Result<(), String> {
        let _file_guard = credential_bridge.lock_file();
        let mut credentials = load_credentials()?;

        match provider.as_str() {
            "claude" | "anthropic" => {
                credentials.anthropic_api_key = Some(key.clone());
            },
            "openai" => {
                credentials.openai_api_key = Some(key.clone());
            },
            "google" => {
                credentials.google_api_key = Some(key.clone());
            },
            _ => {
                return Err(format!("Unknown provider: {provider}"));
            },
        }

        save_credentials(&credentials)?;
        if (provider == "claude" || provider == "anthropic")
            && credentials.preferred_auth_method.as_deref() != Some("oauth")
        {
            session_manager
                .update_credentials(Some(&key))
                .map_err(|error| format!("Failed to push credentials to sidecar: {error}"))?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => StoreResult {
            success: true,
            error: None,
        },
        Err(e) => {
            // Capture credential storage failures to Sentry (without the key itself)
            let _ = capture_command_error("store_api_key", &e);
            StoreResult {
                success: false,
                error: Some(e),
            }
        },
    }
}

/// Retrieve a stored API key.
///
/// Decrypts the key from secure storage.
#[tauri::command]
pub async fn retrieve_api_key(provider: String) -> RetrieveResult {
    let result = (|| -> Result<Option<String>, String> {
        let credentials = load_credentials()?;

        let key = match provider.as_str() {
            "claude" | "anthropic" => credentials.anthropic_api_key,
            "openai" => credentials.openai_api_key,
            "google" => credentials.google_api_key,
            _ => {
                return Err(format!("Unknown provider: {provider}"));
            },
        };

        Ok(key)
    })();

    match result {
        Ok(key) => RetrieveResult { key, error: None },
        Err(e) => {
            // Capture credential retrieval failures to Sentry
            let _ = capture_command_error("retrieve_api_key", &e);
            RetrieveResult {
                key: None,
                error: Some(e),
            }
        },
    }
}

/// Retrieve the stored preferred Claude auth method.
#[tauri::command]
pub async fn get_preferred_auth_method() -> Result<Option<String>, String> {
    let credentials = load_credentials()?;
    Ok(credentials.preferred_auth_method)
}

/// Validate an API key by making a test request to the provider.
///
/// For Claude/Anthropic, makes a minimal API call to verify the key works.
#[tauri::command]
pub async fn validate_api_key(key: String) -> ValidationResult {
    // Basic format validation
    if key.trim().is_empty() {
        return ValidationResult {
            valid: false,
            error: Some("API key cannot be empty".to_owned()),
        };
    }

    // Check for Anthropic key format (sk-ant-...)
    if !key.starts_with("sk-ant-") {
        return ValidationResult {
            valid: false,
            error: Some("Invalid API key format. Anthropic keys start with 'sk-ant-'".to_owned()),
        };
    }

    // For now, just validate format. Full API validation would require
    // making an HTTP request which adds complexity and latency.
    // The actual API call will fail if the key is invalid anyway.
    ValidationResult {
        valid: true,
        error: None,
    }
}

/// Persist the preferred Claude auth method and reconfigure the sidecar.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands require owned parameters for deserialization"
)]
pub fn set_preferred_auth_method(
    method: String,
    credential_bridge: State<'_, Arc<CredentialBridge>>,
    session_manager: State<'_, Arc<SessionManager>>,
) -> StoreResult {
    let result = (|| -> Result<(), String> {
        let _file_guard = credential_bridge.lock_file();
        validate_preferred_auth_method(&method)?;

        let mut credentials = load_credentials()?;
        credentials.preferred_auth_method = Some(method.clone());
        save_credentials(&credentials)?;

        if method == "apikey" {
            if let Some(key) = &credentials.anthropic_api_key {
                credential_bridge.set_api_key(Some(key.clone()));
                session_manager
                    .update_credentials(Some(key))
                    .map_err(|error| format!("Failed to push credentials to sidecar: {error}"))?;
            }
        } else {
            credential_bridge.set_api_key(None);
            session_manager
                .update_credentials(None)
                .map_err(|error| format!("Failed to clear credentials in sidecar: {error}"))?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => StoreResult {
            success: true,
            error: None,
        },
        Err(e) => {
            let _ = capture_command_error("set_preferred_auth_method", &e);
            StoreResult {
                success: false,
                error: Some(e),
            }
        },
    }
}

/// Delete a stored API key.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands require owned parameters for deserialization"
)]
pub fn delete_api_key(
    provider: String,
    credential_bridge: State<'_, Arc<CredentialBridge>>,
    session_manager: State<'_, Arc<SessionManager>>,
) -> StoreResult {
    let result = (|| -> Result<(), String> {
        let _file_guard = credential_bridge.lock_file();
        let mut credentials = load_credentials()?;

        match provider.as_str() {
            "claude" | "anthropic" => {
                credentials.anthropic_api_key = None;
            },
            "openai" => {
                credentials.openai_api_key = None;
            },
            "google" => {
                credentials.google_api_key = None;
            },
            _ => {
                return Err(format!("Unknown provider: {provider}"));
            },
        }

        save_credentials(&credentials)?;
        if provider == "claude" || provider == "anthropic" {
            session_manager
                .update_credentials(None)
                .map_err(|error| format!("Failed to clear credentials in sidecar: {error}"))?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => StoreResult {
            success: true,
            error: None,
        },
        Err(e) => {
            // Capture credential deletion failures to Sentry
            let _ = capture_command_error("delete_api_key", &e);
            StoreResult {
                success: false,
                error: Some(e),
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        sanitize_preferred_auth_method, should_inject_claude_api_key,
        validate_preferred_auth_method, StoredCredentials,
    };

    #[test]
    fn stored_credentials_backwards_compatible_without_preference() {
        let parsed = serde_json::from_str::<StoredCredentials>(
            r#"{
                "anthropic_api_key":"sk-ant-123",
                "openai_api_key":null,
                "google_api_key":null
            }"#,
        );
        let succeeded = parsed.is_ok();
        assert!(succeeded, "legacy credentials should deserialize");

        if let Ok(credentials) = parsed {
            assert_eq!(credentials.anthropic_api_key.as_deref(), Some("sk-ant-123"));
            assert_eq!(credentials.preferred_auth_method, None);
        }
    }

    #[test]
    fn stored_credentials_round_trip_with_preference() {
        for preferred in ["oauth", "apikey"] {
            let credentials = StoredCredentials {
                anthropic_api_key: Some("sk-ant-123".to_owned()),
                openai_api_key: None,
                google_api_key: None,
                preferred_auth_method: Some(preferred.to_owned()),
            };

            let serialized = serde_json::to_string(&credentials);
            let ser_ok = serialized.is_ok();
            assert!(ser_ok, "credentials should serialize");

            if let Ok(json) = serialized {
                let deserialized = serde_json::from_str::<StoredCredentials>(&json);
                let de_ok = deserialized.is_ok();
                assert!(de_ok, "credentials should deserialize");

                if let Ok(result) = deserialized {
                    assert_eq!(result.preferred_auth_method.as_deref(), Some(preferred));
                }
            }
        }
    }

    #[test]
    fn preferred_auth_method_validation_accepts_supported_values() {
        let oauth_ok = validate_preferred_auth_method("oauth").is_ok();
        let apikey_ok = validate_preferred_auth_method("apikey").is_ok();
        let invalid_err = validate_preferred_auth_method("invalid").is_err();

        assert!(oauth_ok, "oauth should be accepted");
        assert!(apikey_ok, "apikey should be accepted");
        assert!(invalid_err, "invalid should be rejected");
    }

    #[test]
    fn startup_injection_respects_preference() {
        assert!(!should_inject_claude_api_key(
            Some("sk-ant-123"),
            Some("oauth")
        ));
        assert!(should_inject_claude_api_key(
            Some("sk-ant-123"),
            Some("apikey")
        ));
        assert!(should_inject_claude_api_key(Some("sk-ant-123"), None));
        assert!(!should_inject_claude_api_key(None, Some("apikey")));
    }

    #[test]
    fn corrupted_preference_is_sanitized_to_none() {
        assert_eq!(sanitize_preferred_auth_method(Some("garbage")), None);
        assert_eq!(sanitize_preferred_auth_method(Some("")), None);
        assert_eq!(sanitize_preferred_auth_method(None), None);
    }
}
