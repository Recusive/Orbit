//! Sidecar credential synchronization helpers.

use std::process::Command;

use parking_lot::Mutex;
use secrecy::{ExposeSecret as _, SecretString};

use super::bridge::Result;
use super::protocol::BridgeRequest;
use super::AgentBridge;

/// Synchronizes the stored Settings API key with the running sidecar.
#[derive(Debug)]
pub struct CredentialBridge {
    api_key: Mutex<Option<SecretString>>,
    /// Guards concurrent read-modify-write operations on `credentials.enc`.
    file_lock: Mutex<()>,
}

impl CredentialBridge {
    /// Create an empty credential bridge.
    #[must_use]
    pub fn new() -> Self {
        Self {
            api_key: Mutex::new(None),
            file_lock: Mutex::new(()),
        }
    }

    /// Replace the stored API key value.
    pub fn set_api_key(&self, key: Option<String>) {
        *self.api_key.lock() = key.map(SecretString::from);
    }

    /// Whether a Settings API key is currently loaded.
    #[must_use]
    pub fn has_api_key(&self) -> bool {
        self.api_key.lock().is_some()
    }

    /// Acquire the file lock for coordinating `credentials.enc` access.
    pub fn lock_file(&self) -> parking_lot::MutexGuard<'_, ()> {
        self.file_lock.lock()
    }

    /// Inject the stored Settings API key into a sidecar command at spawn time.
    pub fn inject_at_spawn(&self, cmd: &mut Command) {
        let guard = self.api_key.lock();
        if let Some(secret) = guard.as_ref() {
            let _ = cmd.env("ANTHROPIC_API_KEY", secret.expose_secret());
            let _ = cmd.env("ORBIT_SETTINGS_API_KEY", "1");
        }
    }

    /// Push the current credential state to a running sidecar synchronously.
    ///
    /// # Errors
    ///
    /// Returns an error if the sidecar rejects the credential update request.
    pub fn push_to_running(&self, bridge: &AgentBridge) -> Result<()> {
        let guard = self.api_key.lock();
        let api_key = guard
            .as_ref()
            .map(|secret| secret.expose_secret().to_owned());
        drop(guard);

        let _ = bridge.send_request(&BridgeRequest::UpdateCredentials { api_key })?;
        Ok(())
    }
}

impl Default for CredentialBridge {
    fn default() -> Self {
        Self::new()
    }
}
