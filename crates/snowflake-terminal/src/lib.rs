//! Snowflake Terminal - PTY management and terminal emulation
//!
//! This crate provides pseudo-terminal (PTY) support for running shell sessions.
//! It uses `portable-pty` for cross-platform PTY spawning and management.

#![allow(
    clippy::significant_drop_tightening,
    reason = "false positives with Mutex guards"
)]
#![allow(
    clippy::allow_attributes,
    reason = "need allow instead of expect for lints that don't fire on hashbrown types"
)]

use std::fmt;
use std::io::{ErrorKind, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use hashbrown::HashMap;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use snowflake_core::{Error, Result, TerminalInfo};
use tokio::sync::mpsc;
use tracing::{debug, error, warn};

// ============================================
// Configuration
// ============================================

/// Configuration for creating a new terminal session.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalConfig {
    /// Shell executable path. If None, uses platform default.
    pub shell: Option<String>,
    /// Working directory. If None, uses current directory.
    pub cwd: Option<PathBuf>,
    /// Additional environment variables.
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Terminal columns (default: 80).
    #[serde(default = "default_cols")]
    pub cols: u16,
    /// Terminal rows (default: 24).
    #[serde(default = "default_rows")]
    pub rows: u16,
}

const fn default_cols() -> u16 {
    80
}

const fn default_rows() -> u16 {
    24
}

impl TerminalConfig {
    /// Create a new terminal config with default values.
    #[must_use]
    pub fn new() -> Self {
        Self {
            shell: None,
            cwd: None,
            env: HashMap::new(),
            cols: 80,
            rows: 24,
        }
    }

    /// Set the shell executable.
    #[must_use]
    #[expect(
        clippy::impl_trait_in_params,
        reason = "ergonomic API for builder pattern"
    )]
    pub fn with_shell(mut self, shell: impl Into<String>) -> Self {
        self.shell = Some(shell.into());
        self
    }

    /// Set the working directory.
    #[must_use]
    #[expect(
        clippy::impl_trait_in_params,
        reason = "ergonomic API for builder pattern"
    )]
    pub fn with_cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Set terminal dimensions.
    #[must_use]
    pub const fn with_size(mut self, cols: u16, rows: u16) -> Self {
        self.cols = cols;
        self.rows = rows;
        self
    }

    /// Add an environment variable.
    #[must_use]
    #[expect(
        clippy::impl_trait_in_params,
        reason = "ergonomic API for builder pattern"
    )]
    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let _prev = self.env.insert(key.into(), value.into());
        self
    }
}

// ============================================
// Terminal Session
// ============================================

/// Writer handle for the PTY master.
struct PtyWriter {
    writer: Box<dyn Write + Send>,
}

impl fmt::Debug for PtyWriter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PtyWriter").finish_non_exhaustive()
    }
}

/// A terminal session wrapping a PTY process.
#[derive(Debug)]
pub struct Terminal {
    /// Unique terminal identifier.
    id: String,
    /// Process ID of the shell.
    pid: u32,
    /// Shell command that was spawned.
    shell: String,
    /// Working directory.
    cwd: String,
    /// PTY writer for sending input.
    writer: Arc<Mutex<PtyWriter>>,
    /// Flag indicating if terminal is still running.
    running: Arc<Mutex<bool>>,
    /// Channel receiver for output data.
    output_rx: Mutex<Option<mpsc::UnboundedReceiver<Vec<u8>>>>,
}

impl Terminal {
    /// Create a new terminal with the given configuration.
    #[allow(
        clippy::iter_over_hash_type,
        reason = "iteration order doesn't matter for environment variables"
    )]
    pub fn new(id: String, config: TerminalConfig) -> Result<Self> {
        // Validate dimensions - PTY systems don't accept zero dimensions
        let cols = if config.cols == 0 { 80 } else { config.cols };
        let rows = if config.rows == 0 { 24 } else { config.rows };

        let shell = config.shell.unwrap_or_else(detect_shell);
        let cwd = config
            .cwd
            .clone()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .to_string();

        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Terminal(format!("Failed to open PTY: {e}")))?;

        let mut cmd = CommandBuilder::new(&shell);

        // Set working directory
        if let Some(cwd) = &config.cwd {
            cmd.cwd(cwd);
        }

        // Add custom environment variables
        for (key, value) in &config.env {
            cmd.env(key, value);
        }

        // Set TERM for proper terminal handling
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| Error::Terminal(format!("Failed to spawn shell '{shell}': {e}")))?;

        let pid = child.process_id().unwrap_or(0);

        debug!(terminal_id = %id, shell = %shell, pid = pid, "Terminal created");

        // Get reader for the reader thread
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| Error::Terminal(format!("Failed to clone PTY reader: {e}")))?;

        // Get writer for sending input
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| Error::Terminal(format!("Failed to get PTY writer: {e}")))?;

        // Create output channel
        let (output_tx, output_rx) = mpsc::unbounded_channel();

        let running = Arc::new(Mutex::new(true));
        let running_clone = Arc::clone(&running);
        let id_clone = id.clone();

        // Spawn a thread to read PTY output
        let _handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - terminal closed
                        debug!(terminal_id = %id_clone, "PTY reader got EOF");
                        break;
                    },
                    Ok(n) => {
                        #[expect(clippy::indexing_slicing, reason = "n is bounded by buf.len()")]
                        if output_tx.send(buf[..n].to_vec()).is_err() {
                            // Receiver dropped
                            debug!(terminal_id = %id_clone, "Output receiver dropped");
                            break;
                        }
                    },
                    Err(e) => {
                        // Check if it's a "would block" or similar non-fatal error
                        if e.kind() == ErrorKind::WouldBlock {
                            continue;
                        }
                        warn!(terminal_id = %id_clone, error = %e, "PTY read error");
                        break;
                    },
                }
            }
            *running_clone.lock() = false;
        });

        Ok(Self {
            id,
            pid,
            shell,
            cwd,
            writer: Arc::new(Mutex::new(PtyWriter { writer })),
            running,
            output_rx: Mutex::new(Some(output_rx)),
        })
    }

    /// Get the terminal ID.
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get terminal info.
    #[must_use]
    pub fn info(&self) -> TerminalInfo {
        TerminalInfo {
            id: self.id.clone(),
            pid: self.pid,
            shell: self.shell.clone(),
            cwd: self.cwd.clone(),
        }
    }

    /// Write data to the terminal.
    ///
    /// Returns an error if the terminal is no longer running.
    pub fn write(&self, data: &[u8]) -> Result<()> {
        // Check if terminal is still running
        if !self.is_running() {
            return Err(Error::Terminal(format!(
                "Terminal '{}' is no longer running",
                self.id
            )));
        }

        // Empty writes are no-ops
        if data.is_empty() {
            return Ok(());
        }

        let mut writer_guard = self.writer.lock();
        writer_guard
            .writer
            .write_all(data)
            .map_err(|e| Error::Terminal(format!("Failed to write to terminal: {e}")))?;
        writer_guard
            .writer
            .flush()
            .map_err(|e| Error::Terminal(format!("Failed to flush terminal: {e}")))
    }

    /// Resize the terminal.
    ///
    /// Note: Resizing requires the master PTY handle which we don't store.
    /// This is a no-op for now. A full implementation would need to store
    /// the master handle or use platform-specific resize methods.
    #[allow(clippy::unused_self, reason = "API consistency")]
    pub fn resize(&self, _cols: u16, _rows: u16) -> Result<()> {
        // TODO: Implement resize when we have access to the master handle
        // For now, this is a no-op since we can't resize through the writer
        Ok(())
    }

    /// Take the output receiver channel.
    ///
    /// This can only be called once - subsequent calls return None.
    pub fn take_output_receiver(&self) -> Option<mpsc::UnboundedReceiver<Vec<u8>>> {
        self.output_rx.lock().take()
    }

    /// Check if the terminal is still running.
    #[must_use]
    pub fn is_running(&self) -> bool {
        *self.running.lock()
    }

    /// Close the terminal.
    pub fn close(&self) -> Result<()> {
        *self.running.lock() = false;
        // The PTY will be closed when dropped
        debug!(terminal_id = %self.id, "Terminal closed");
        Ok(())
    }
}

// ============================================
// Terminal Manager
// ============================================

/// Manager for multiple terminal sessions.
#[derive(Debug, Default)]
pub struct TerminalManager {
    terminals: Mutex<HashMap<String, Arc<Terminal>>>,
}

impl TerminalManager {
    /// Create a new terminal manager.
    #[must_use]
    pub fn new() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
        }
    }

    /// Create a new terminal session.
    pub fn create(&self, id: String, config: TerminalConfig) -> Result<Arc<Terminal>> {
        let mut terminals = self.terminals.lock();

        if terminals.contains_key(&id) {
            return Err(Error::Terminal(format!("Terminal already exists: {id}")));
        }

        let terminal = Arc::new(Terminal::new(id.clone(), config)?);
        let _prev = terminals.insert(id, Arc::clone(&terminal));

        Ok(terminal)
    }

    /// Get a terminal by ID.
    #[must_use]
    pub fn get(&self, id: &str) -> Option<Arc<Terminal>> {
        self.terminals.lock().get(id).cloned()
    }

    /// Write data to a terminal.
    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        terminal.write(data)
    }

    /// Resize a terminal.
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        terminal.resize(cols, rows)
    }

    /// Close a terminal.
    pub fn close(&self, id: &str) -> Result<()> {
        let mut terminals = self.terminals.lock();
        let terminal = terminals
            .remove(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        terminal.close()
    }

    /// Close all terminals.
    #[allow(
        clippy::iter_over_hash_type,
        reason = "iteration order doesn't matter for shutdown"
    )]
    pub fn close_all(&self) {
        let mut terminals = self.terminals.lock();
        for (id, terminal) in terminals.drain() {
            if let Err(e) = terminal.close() {
                error!(terminal_id = %id, error = %e, "Failed to close terminal");
            }
        }
    }

    /// List all terminal IDs.
    #[allow(
        clippy::iter_over_hash_type,
        reason = "iteration order doesn't matter for listing"
    )]
    #[must_use]
    pub fn list(&self) -> Vec<String> {
        self.terminals.lock().keys().cloned().collect()
    }
}

// ============================================
// Shell Detection
// ============================================

/// Detect the default shell for the current platform.
#[expect(
    clippy::disallowed_methods,
    reason = "env::var needed for shell detection"
)]
#[must_use]
pub fn detect_shell() -> String {
    use std::env;

    // Check SHELL environment variable first
    if let Ok(shell) = env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }

    // Platform-specific fallbacks
    #[cfg(target_os = "windows")]
    {
        // Check for PowerShell Core first, then Windows PowerShell
        if let Ok(pwsh) = env::var("PROGRAMFILES") {
            let pwsh_path = format!("{pwsh}\\PowerShell\\7\\pwsh.exe");
            if std::path::Path::new(&pwsh_path).exists() {
                return pwsh_path;
            }
        }
        "powershell.exe".to_owned()
    }

    #[cfg(target_os = "macos")]
    {
        // macOS defaults to zsh since Catalina
        "/bin/zsh".to_owned()
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        // Linux and other Unix-like systems
        "/bin/bash".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_config_builder() {
        let config = TerminalConfig::new()
            .with_shell("/bin/zsh")
            .with_cwd("/tmp")
            .with_size(120, 40)
            .with_env("MY_VAR", "my_value");

        assert_eq!(config.shell, Some("/bin/zsh".to_owned()));
        assert_eq!(config.cwd, Some(PathBuf::from("/tmp")));
        assert_eq!(config.cols, 120);
        assert_eq!(config.rows, 40);
        assert_eq!(config.env.get("MY_VAR"), Some(&"my_value".to_owned()));
    }

    #[test]
    fn test_detect_shell() {
        let shell = detect_shell();
        assert!(!shell.is_empty());
    }

    #[test]
    fn test_terminal_manager_new() {
        let manager = TerminalManager::new();
        assert!(manager.list().is_empty());
    }
}
