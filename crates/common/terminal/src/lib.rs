//! Orbit Terminal - PTY management and terminal emulation
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
use std::io::{ErrorKind, Read as _, Write};
use std::mem;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use hashbrown::HashMap;
use orbit_core::{Error, Result, TerminalInfo};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
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
// Foreground Process Tracking
// ============================================

/// Information about the current foreground process in the terminal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ForegroundProcess {
    /// Process ID.
    pub pid: u32,
    /// Process name (e.g., "zsh", "node", "python").
    pub name: String,
}

impl ForegroundProcess {
    /// Create a new foreground process info.
    #[must_use]
    pub fn new(pid: u32, name: String) -> Self {
        Self { pid, name }
    }
}

/// Tracker for foreground process changes.
#[derive(Debug)]
struct ForegroundProcessTracker {
    /// System info for process queries.
    system: Mutex<System>,
    /// Last known foreground process.
    last_process: Mutex<Option<ForegroundProcess>>,
    /// Shell PID (the main process we spawned).
    shell_pid: u32,
    /// Shell name extracted from path.
    shell_name: String,
}

impl ForegroundProcessTracker {
    /// Create a new tracker for the given shell process.
    fn new(shell_pid: u32, shell_path: &str) -> Self {
        // Extract shell name from path (e.g., "/bin/zsh" -> "zsh")
        let shell_name = Path::new(shell_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("shell")
            .to_owned();

        Self {
            system: Mutex::new(System::new()),
            last_process: Mutex::new(Some(ForegroundProcess::new(shell_pid, shell_name.clone()))),
            shell_pid,
            shell_name,
        }
    }

    /// Get the current foreground process.
    ///
    /// This looks for child processes of the shell and returns the most recently
    /// started one, or the shell itself if no children are running.
    #[allow(
        clippy::iter_over_hash_type,
        reason = "iteration order doesn't matter for finding child processes"
    )]
    fn get_foreground_process(&self) -> ForegroundProcess {
        let start = Instant::now();
        debug!(target: "orbit::perf", "[TERMINAL:get_foreground] START - shell_pid={}", self.shell_pid);

        let mut system = self.system.lock();

        // Refresh all processes to find children of our shell
        // We need to refresh all because children may not be in the cache yet
        let _refreshed = system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cmd(sysinfo::UpdateKind::Always),
        );

        let shell_pid = Pid::from_u32(self.shell_pid);

        // Find the foreground process (the most recently started child, or shell itself)
        // We look for direct children of our shell process
        let mut foreground_pid = self.shell_pid;
        let mut foreground_name = self.shell_name.clone();
        let mut processes_checked: usize = 0;

        // Iterate through all processes to find children of our shell
        for (pid, process) in system.processes() {
            processes_checked += 1;
            if let Some(parent_pid) = process.parent() {
                if parent_pid == shell_pid {
                    // This is a child of our shell - use it as the foreground
                    // In practice, we take the last one we find (could be improved
                    // by tracking start time, but this is good enough for now)
                    let pid_val = pid.as_u32();
                    foreground_pid = pid_val;
                    foreground_name = process.name().to_string_lossy().into_owned();
                }
            }
        }

        let elapsed = start.elapsed().as_millis();
        debug!(
            target: "orbit::perf",
            "[TERMINAL:get_foreground] END ({elapsed}ms) - {processes_checked} processes checked, fg={foreground_name:?}"
        );

        ForegroundProcess::new(foreground_pid, foreground_name)
    }

    /// Check if the foreground process has changed since last check.
    ///
    /// Returns `Some(new_process)` if changed, `None` if unchanged.
    #[allow(
        clippy::if_then_some_else_none,
        reason = "bool::then doesn't work well with mutable state and returning a different value"
    )]
    fn check_for_change(&self) -> Option<ForegroundProcess> {
        let current = self.get_foreground_process();

        let mut last = self.last_process.lock();
        if last.as_ref() != Some(&current) {
            *last = Some(current.clone());
            Some(current)
        } else {
            None
        }
    }

    /// Get the last known foreground process without refreshing.
    fn last_known(&self) -> Option<ForegroundProcess> {
        self.last_process.lock().clone()
    }
}

// ============================================
// Terminal Session
// ============================================

/// Signal types that can be sent to a terminal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
#[non_exhaustive]
pub enum Signal {
    /// Interrupt signal (Ctrl+C)
    Sigint,
    /// Termination signal
    Sigterm,
    /// Kill signal (cannot be caught)
    Sigkill,
}

/// Writer handle for the PTY master.
struct PtyWriter {
    writer: Box<dyn Write + Send>,
}

impl fmt::Debug for PtyWriter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PtyWriter").finish_non_exhaustive()
    }
}

/// PTY master handle wrapper for resize operations.
struct PtyMaster {
    master: Box<dyn MasterPty + Send>,
}

impl fmt::Debug for PtyMaster {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PtyMaster").finish_non_exhaustive()
    }
}

/// Child process wrapper.
struct ChildProcess {
    child: Box<dyn Child + Send + Sync>,
}

impl fmt::Debug for ChildProcess {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ChildProcess").finish_non_exhaustive()
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
    /// PTY master for resize operations.
    master: Arc<Mutex<PtyMaster>>,
    /// Child process for signal handling.
    child: Arc<Mutex<ChildProcess>>,
    /// Flag indicating if terminal is still running.
    running: Arc<Mutex<bool>>,
    /// Channel receiver for output data.
    output_rx: Mutex<Option<mpsc::UnboundedReceiver<Vec<u8>>>>,
    /// Bytes written to output (for flow control).
    bytes_written: AtomicU64,
    /// Bytes acknowledged by consumer (for flow control).
    bytes_acknowledged: AtomicU64,
    /// Foreground process tracker.
    process_tracker: ForegroundProcessTracker,
}

impl Terminal {
    /// Create a new terminal with the given configuration.
    #[allow(
        clippy::iter_over_hash_type,
        reason = "iteration order doesn't matter for environment variables"
    )]
    #[allow(
        clippy::too_many_lines,
        reason = "PTY setup requires sequential initialization that shouldn't be split"
    )]
    #[allow(
        clippy::cognitive_complexity,
        reason = "UTF-8 boundary detection logic in reader thread adds necessary complexity"
    )]
    pub fn new(id: String, config: TerminalConfig) -> Result<Self> {
        let start = Instant::now();
        debug!(target: "orbit::perf", "[TERMINAL:create] START - id={id:?}");

        // Validate dimensions - PTY systems don't accept zero dimensions
        let cols = if config.cols == 0 { 80 } else { config.cols };
        let rows = if config.rows == 0 { 24 } else { config.rows };

        let shell = config.shell.unwrap_or_else(detect_shell);
        // Default to home directory if no cwd specified (like a normal terminal)
        let cwd = config
            .cwd
            .clone()
            .or_else(dirs::home_dir)
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

        // Always set working directory (uses home directory as default)
        cmd.cwd(&cwd);

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

        // Store the master for resize operations
        let master = pair.master;

        // Create output channel
        let (output_tx, output_rx) = mpsc::unbounded_channel();

        let running = Arc::new(Mutex::new(true));
        let running_clone = Arc::clone(&running);
        let id_clone = id.clone();
        let bytes_written = Arc::new(AtomicU64::new(0));
        let bytes_written_clone = Arc::clone(&bytes_written);

        // Spawn a thread to read PTY output
        let _handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            // Buffer for incomplete UTF-8 sequences at chunk boundaries
            let mut utf8_buffer: Vec<u8> = Vec::with_capacity(4);

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - terminal closed
                        // Flush any remaining buffer (may be incomplete UTF-8)
                        if !utf8_buffer.is_empty() {
                            let _ = bytes_written_clone
                                .fetch_add(utf8_buffer.len() as u64, Ordering::Relaxed);
                            let _send = output_tx.send(mem::take(&mut utf8_buffer));
                        }
                        debug!(terminal_id = %id_clone, "PTY reader got EOF");
                        break;
                    },
                    Ok(n) => {
                        #[expect(clippy::indexing_slicing, reason = "n is bounded by buf.len()")]
                        let data = &buf[..n];

                        // Prepend any incomplete UTF-8 from previous read
                        let full_data = if utf8_buffer.is_empty() {
                            data.to_vec()
                        } else {
                            let mut combined = mem::take(&mut utf8_buffer);
                            combined.extend_from_slice(data);
                            combined
                        };

                        // Find the longest valid UTF-8 prefix
                        // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
                        // Lead bytes: 0xxxxxxx (ASCII), 110xxxxx, 1110xxxx, 11110xxx
                        let mut valid_len = full_data.len();

                        // Check if the last bytes might be an incomplete UTF-8 sequence
                        // Walk backwards to find potential incomplete sequence
                        for i in 1..=4.min(full_data.len()) {
                            #[expect(
                                clippy::indexing_slicing,
                                reason = "i <= full_data.len() is checked"
                            )]
                            let byte = full_data[full_data.len() - i];

                            // If this is a lead byte, check if we have enough bytes
                            if byte >= 0xC0 {
                                // 110xxxxx (2-byte) or higher
                                let expected_len = if byte >= 0xF0 {
                                    4 // 11110xxx
                                } else if byte >= 0xE0 {
                                    3 // 1110xxxx
                                } else {
                                    2 // 110xxxxx
                                };

                                if i < expected_len {
                                    // Incomplete sequence - don't send these bytes yet
                                    valid_len = full_data.len() - i;
                                }
                                break;
                            } else if byte < 0x80 {
                                // ASCII byte - no incomplete sequence
                                break;
                            }
                            // else: continuation byte (10xxxxxx), keep looking
                        }

                        // Split into complete and incomplete parts
                        let (complete, incomplete) = full_data.split_at(valid_len);

                        // Buffer incomplete bytes for next iteration
                        if !incomplete.is_empty() {
                            utf8_buffer.extend_from_slice(incomplete);
                        }

                        // Send complete data
                        if !complete.is_empty() {
                            let _ = bytes_written_clone
                                .fetch_add(complete.len() as u64, Ordering::Relaxed);
                            if output_tx.send(complete.to_vec()).is_err() {
                                // Receiver dropped
                                debug!(terminal_id = %id_clone, "Output receiver dropped");
                                break;
                            }
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

        // Extract the inner AtomicU64 from the Arc for storage
        let bytes_written_inner = Arc::try_unwrap(bytes_written)
            .unwrap_or_else(|arc| AtomicU64::new(arc.load(Ordering::Relaxed)));

        // Create foreground process tracker
        let process_tracker = ForegroundProcessTracker::new(pid, &shell);

        let elapsed = start.elapsed().as_millis();
        debug!(
            target: "orbit::perf",
            "[TERMINAL:create] END ({elapsed}ms) - pid={pid}, shell={shell:?}"
        );

        Ok(Self {
            id,
            pid,
            shell,
            cwd,
            writer: Arc::new(Mutex::new(PtyWriter { writer })),
            master: Arc::new(Mutex::new(PtyMaster { master })),
            child: Arc::new(Mutex::new(ChildProcess { child })),
            running,
            output_rx: Mutex::new(Some(output_rx)),
            bytes_written: bytes_written_inner,
            bytes_acknowledged: AtomicU64::new(0),
            process_tracker,
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
    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        // Validate dimensions
        let cols = if cols == 0 { 80 } else { cols };
        let rows = if rows == 0 { 24 } else { rows };

        let master_guard = self.master.lock();
        master_guard
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Terminal(format!("Failed to resize terminal: {e}")))
    }

    /// Send a signal to the terminal process.
    ///
    /// - `SIGINT` - Sends interrupt (Ctrl+C) by writing `\x03` to the PTY
    /// - `SIGTERM` - Attempts graceful termination
    /// - `SIGKILL` - Forces immediate termination
    pub fn send_signal(&self, signal: Signal) -> Result<()> {
        match signal {
            Signal::Sigint => {
                // For SIGINT, write Ctrl+C character to the PTY
                // This is the standard way terminals send interrupt
                self.write(&[0x03])?;
                debug!(terminal_id = %self.id, "Sent SIGINT (Ctrl+C)");
                Ok(())
            },
            Signal::Sigterm | Signal::Sigkill => {
                // For SIGTERM/SIGKILL, we kill the child process
                let mut child_guard = self.child.lock();
                child_guard.child.kill().map_err(|e| {
                    Error::Terminal(format!("Failed to kill terminal process: {e}"))
                })?;
                debug!(terminal_id = %self.id, signal = ?signal, "Sent kill signal");
                Ok(())
            },
        }
    }

    /// Acknowledge that the consumer has processed a certain number of bytes.
    ///
    /// This is used for flow control to prevent the terminal from overwhelming
    /// the consumer with output data.
    pub fn acknowledge_data(&self, byte_count: u64) {
        let _ = self
            .bytes_acknowledged
            .fetch_add(byte_count, Ordering::Relaxed);
    }

    /// Get the number of bytes written but not yet acknowledged.
    ///
    /// This can be used to implement backpressure.
    #[must_use]
    pub fn pending_bytes(&self) -> u64 {
        let written = self.bytes_written.load(Ordering::Relaxed);
        let acknowledged = self.bytes_acknowledged.load(Ordering::Relaxed);
        written.saturating_sub(acknowledged)
    }

    /// Get total bytes written to output.
    #[must_use]
    pub fn bytes_written(&self) -> u64 {
        self.bytes_written.load(Ordering::Relaxed)
    }

    /// Get total bytes acknowledged by consumer.
    #[must_use]
    pub fn bytes_acknowledged(&self) -> u64 {
        self.bytes_acknowledged.load(Ordering::Relaxed)
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

    /// Get the current foreground process.
    ///
    /// This queries the system for the current foreground process in this terminal.
    /// The foreground process is typically the currently running command, or the
    /// shell itself if no command is running.
    #[must_use]
    pub fn get_foreground_process(&self) -> ForegroundProcess {
        self.process_tracker.get_foreground_process()
    }

    /// Check if the foreground process has changed since last check.
    ///
    /// Returns `Some(new_process)` if the foreground process changed,
    /// `None` if it's the same as before. This is useful for polling.
    pub fn check_foreground_change(&self) -> Option<ForegroundProcess> {
        self.process_tracker.check_for_change()
    }

    /// Get the last known foreground process without refreshing.
    ///
    /// This returns the cached value from the last check, avoiding
    /// the overhead of querying the system.
    #[must_use]
    pub fn last_foreground_process(&self) -> Option<ForegroundProcess> {
        self.process_tracker.last_known()
    }

    /// Get the shell name (extracted from the shell path).
    ///
    /// For example, if the shell is `/bin/zsh`, this returns `"zsh"`.
    #[must_use]
    pub fn shell_name(&self) -> &str {
        &self.process_tracker.shell_name
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

    /// Send a signal to a terminal.
    pub fn send_signal(&self, id: &str, signal: Signal) -> Result<()> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        terminal.send_signal(signal)
    }

    /// Acknowledge data received from a terminal.
    pub fn acknowledge_data(&self, id: &str, byte_count: u64) -> Result<()> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        terminal.acknowledge_data(byte_count);
        Ok(())
    }

    /// Get pending bytes for a terminal (bytes written but not acknowledged).
    pub fn pending_bytes(&self, id: &str) -> Result<u64> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        Ok(terminal.pending_bytes())
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

    /// Get the current foreground process for a terminal.
    pub fn get_foreground_process(&self, id: &str) -> Result<ForegroundProcess> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        Ok(terminal.get_foreground_process())
    }

    /// Check if the foreground process has changed for a terminal.
    ///
    /// Returns `Ok(Some(new_process))` if changed, `Ok(None)` if unchanged.
    pub fn check_foreground_change(&self, id: &str) -> Result<Option<ForegroundProcess>> {
        let terminals = self.terminals.lock();
        let terminal = terminals
            .get(id)
            .ok_or_else(|| Error::Terminal(format!("Terminal not found: {id}")))?;
        Ok(terminal.check_foreground_change())
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
