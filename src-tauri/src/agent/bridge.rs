//! Agent Bridge - Spawns and communicates with the Node.js sidecar
//!
//! Uses stdin/stdout JSON IPC to communicate with the agent-bridge Node.js process.
//!
//! # Sidecar Lifecycle
//!
//! The sidecar is spawned **once** on first use and kept alive for the lifetime of the app.
//! It is NOT spawned per-request. This amortizes the ~1-2 second startup cost across all
//! subsequent requests, which then only incur write/read latency.

use std::fmt;
use std::io::{BufRead as _, BufReader, Write as _};
use std::iter::repeat_n;
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::result;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use serde_json::error::Category;

use super::protocol::{BridgeEvent, BridgeRequest, BridgeResponse, CommandResponse};

const MAX_TOP_LEVEL_KEYS: usize = 20;
const SAFE_REQUEST_TYPES: &[&str] = &[
    "browser:tool_response",
    "cleanup_sessions",
    "create_agent",
    "create_command",
    "create_session",
    "delete_agent",
    "delete_command",
    "delete_session",
    "enhance_bug_report",
    "fork_session",
    "fork_session_at",
    "generate_agent_definition",
    "generate_command_definition",
    "generate_title",
    "get_accept_mode",
    "get_agent",
    "get_command",
    "get_plan_mode",
    "get_sdk_session_id",
    "get_stored_session",
    "get_thinking_mode",
    "interrupt",
    "is_session_ready",
    "list_agents",
    "list_commands",
    "list_skills",
    "permission_response",
    "rewind_files",
    "send_message",
    "set_accept_mode",
    "set_effort_level",
    "set_model",
    "set_plan_mode",
    "set_thinking_mode",
    "shutdown",
    "update_agent",
    "update_command",
    "update_credentials",
];
const SAFE_RESPONSE_TYPES: &[&str] = &[
    "accept_mode_changed",
    "agent",
    "agent_list",
    "agent_message",
    "auth_error",
    "boolean",
    "browser:tool_request",
    "checkpoint",
    "command",
    "command_list",
    "compact_complete",
    "error",
    "error_event",
    "fork_result",
    "number",
    "permission_request",
    "plan_mode_changed",
    "ready",
    "session_init",
    "skill_list",
    "string",
    "success",
];
const SAFE_TOP_LEVEL_KEYS: &[&str] = &[
    "type",
    "requestType",
    "sessionId",
    "message",
    "request",
    "event",
    "error",
    "success",
    "value",
    "agent",
    "agents",
    "command",
    "commands",
    "skills",
    "result",
    "checkpointId",
    "category",
    "recoverable",
];

/// Error type for bridge operations
#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    /// Failed to spawn sidecar process
    #[error("Failed to spawn sidecar: {0}")]
    SpawnError(String),
    /// Sidecar is not running
    #[error("Sidecar not running")]
    NotRunning,
    /// Failed to send request to sidecar
    #[error("Failed to send request: {0}")]
    SendError(String),
    /// Failed to receive response from sidecar
    #[error("Failed to receive response: {0}")]
    ReceiveError(String),
    /// Sidecar returned an error
    #[error("Sidecar returned error: {0}")]
    SidecarError(String),
    /// Timeout waiting for response
    #[error("Timeout waiting for response")]
    Timeout,
    /// JSON serialization error
    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// Result type alias for bridge operations
pub type Result<T> = result::Result<T, BridgeError>;

/// Callback for handling events from the sidecar
pub type EventCallback = Arc<dyn Fn(BridgeEvent) + Send + Sync>;

fn format_malformed_response_line(line: &str, parse_category: Category) -> String {
    let trimmed = line.trim();
    let mut parts = vec![
        format!("line_bytes={}", line.len()),
        format!("trimmed_bytes={}", trimmed.len()),
        format!("parse_category={}", format_parse_category(parse_category)),
    ];

    match serde_json::from_str::<serde_json::Value>(line) {
        Ok(value) => {
            parts.push(format!("parsed_kind={}", parsed_kind(&value)));

            if let serde_json::Value::Object(map) = value {
                if let Some(response_type) =
                    summarize_safe_string(map.get("type"), SAFE_RESPONSE_TYPES)
                {
                    parts.push(format!("response_type={response_type}"));
                }

                if let Some(request_type) =
                    summarize_safe_string(map.get("requestType"), SAFE_REQUEST_TYPES)
                {
                    parts.push(format!("request_type={request_type}"));
                }

                parts.push(format!("top_level_key_count={}", map.len()));
                parts.push(format!(
                    "top_level_keys=[{}]",
                    summarize_top_level_keys(&map).join(",")
                ));
            }
        },
        Err(_) => {
            parts.push("parsed_kind=invalid_json".to_owned());
        },
    }

    parts.join(" ")
}

fn format_parse_category(category: Category) -> &'static str {
    match category {
        Category::Io => "io",
        Category::Syntax => "syntax",
        Category::Data => "data",
        Category::Eof => "eof",
    }
}

fn parsed_kind(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

fn summarize_safe_string(
    value: Option<&serde_json::Value>,
    safe_values: &'static [&'static str],
) -> Option<&'static str> {
    match value {
        Some(serde_json::Value::String(raw)) => Some(
            safe_values
                .iter()
                .copied()
                .find(|safe| *safe == raw)
                .unwrap_or("[unrecognized]"),
        ),
        Some(value) => Some(parsed_kind(value)),
        None => None,
    }
}

fn summarize_top_level_keys(map: &serde_json::Map<String, serde_json::Value>) -> Vec<&'static str> {
    let mut keys = Vec::new();

    for key in SAFE_TOP_LEVEL_KEYS {
        if map.contains_key(*key) {
            keys.push(*key);
            if keys.len() == MAX_TOP_LEVEL_KEYS {
                return keys;
            }
        }
    }

    let unrecognized_count = map
        .keys()
        .filter(|key| !SAFE_TOP_LEVEL_KEYS.contains(&key.as_str()))
        .count();
    let remaining = MAX_TOP_LEVEL_KEYS.saturating_sub(keys.len());
    keys.extend(repeat_n(
        "[unrecognized-key]",
        unrecognized_count.min(remaining),
    ));

    keys
}

/// Agent Bridge - manages the Node.js sidecar process
pub struct AgentBridge {
    /// Child process handle
    child: Option<Child>,
    /// Stdin for sending requests (wrapped in Mutex for interior mutability)
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    /// Channel for receiving responses
    response_rx: Option<Receiver<BridgeResponse>>,
    /// Event callback
    event_callback: Option<EventCallback>,
    /// Whether the bridge is ready
    ready: bool,
}

impl AgentBridge {
    /// Create a new bridge (does not spawn yet)
    #[must_use]
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            response_rx: None,
            event_callback: None,
            ready: false,
        }
    }

    /// Set the event callback for handling async events
    pub fn set_event_callback(&mut self, callback: EventCallback) {
        self.event_callback = Some(callback);
    }

    /// Spawn the sidecar process
    ///
    /// # Errors
    ///
    /// Returns an error if the sidecar cannot be spawned or doesn't become ready.
    pub fn spawn(&mut self, sidecar_path: &str) -> Result<()> {
        self.spawn_with_extra_env(sidecar_path, |_| {})
    }

    /// Spawn the sidecar process with additional environment injection.
    ///
    /// # Errors
    ///
    /// Returns an error if the sidecar cannot be spawned or doesn't become ready.
    pub fn spawn_with_extra_env<F: FnOnce(&mut Command)>(
        &mut self,
        sidecar_path: &str,
        env_fn: F,
    ) -> Result<()> {
        if self.child.is_some() {
            return Ok(()); // Already running
        }

        log::info!("Spawning agent bridge sidecar: {sidecar_path}");

        // Derive claude binary path from sidecar path (same directory)
        let sidecar_dir = Path::new(sidecar_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let claude_path = format!("{sidecar_dir}/claude");

        log::info!("Claude CLI path: {claude_path}");

        // Spawn the compiled sidecar binary directly
        // Pass CLAUDE_CLI_PATH env var so the sidecar can find the bundled claude binary
        // Pass CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING to enable file checkpointing for rewind
        let mut child_cmd = Command::new(sidecar_path);
        let _ = child_cmd.env("CLAUDE_CLI_PATH", &claude_path);
        let _ = child_cmd.env("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING", "1");
        env_fn(&mut child_cmd);
        let mut child = child_cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // Let stderr go to parent's stderr for debugging
            .spawn()
            .map_err(|e| BridgeError::SpawnError(format!("{e} (path: {sidecar_path})")))?;

        // Take ownership of stdin
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| BridgeError::SpawnError("Failed to get stdin".to_owned()))?;

        // Take ownership of stdout
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| BridgeError::SpawnError("Failed to get stdout".to_owned()))?;

        // Create channel for responses (bounded to prevent memory issues)
        let (tx, rx) = bounded(1000);
        self.response_rx = Some(rx);

        // Spawn reader thread
        let event_callback = self.event_callback.clone();
        drop(thread::spawn(move || {
            Self::reader_thread(stdout, &tx, event_callback.as_ref());
        }));

        self.child = Some(child);
        self.stdin = Some(Arc::new(Mutex::new(stdin)));

        // Wait for ready event
        self.wait_for_ready()?;

        log::info!("Agent bridge sidecar ready");
        Ok(())
    }

    /// Check whether the sidecar process is still alive and clear stale state if it exited.
    #[must_use]
    pub fn check_and_recover(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(None) => return true,
                Ok(Some(status)) => {
                    log::warn!("Agent bridge sidecar exited with status: {status}");
                },
                Err(error) => {
                    log::warn!("Failed to check agent bridge sidecar status: {error}");
                },
            }
        } else {
            return false;
        }

        self.child = None;
        self.stdin = None;
        self.response_rx = None;
        self.ready = false;
        false
    }

    /// Reader thread - reads JSON lines from stdout
    fn reader_thread(
        stdout: ChildStdout,
        tx: &Sender<BridgeResponse>,
        event_callback: Option<&EventCallback>,
    ) {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if line.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<BridgeResponse>(&line) {
                        Ok(response) => {
                            // Check if it's an event or command response
                            if let Some(event) = response.as_event() {
                                // Fire event callback if set
                                if let Some(callback) = event_callback {
                                    callback(event.clone());
                                }
                            }

                            // Always send through channel for request-response matching
                            if tx.send(response).is_err() {
                                log::debug!("Response channel closed, exiting reader thread");
                                break;
                            }
                        },
                        Err(e) => {
                            let summary = format_malformed_response_line(&line, e.classify());
                            log::error!("Failed to parse response: {summary}");
                        },
                    }
                },
                Err(e) => {
                    log::error!("Failed to read line: {e}");
                    break;
                },
            }
        }

        log::debug!("Reader thread exiting");
    }

    /// Wait for the ready event
    fn wait_for_ready(&mut self) -> Result<()> {
        let rx = self.response_rx.as_ref().ok_or(BridgeError::NotRunning)?;

        // Wait up to 30 seconds for ready
        let timeout = Duration::from_secs(30);

        loop {
            match rx.recv_timeout(timeout) {
                Ok(response) => {
                    if response.is_ready() {
                        self.ready = true;
                        return Ok(());
                    }
                    // Ignore other events during startup
                },
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    return Err(BridgeError::Timeout);
                },
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    return Err(BridgeError::ReceiveError("Channel disconnected".to_owned()));
                },
            }
        }
    }

    /// Send a request and wait for response
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be sent or response cannot be received.
    pub fn send_request(&self, request: &BridgeRequest) -> Result<CommandResponse> {
        if !self.ready {
            return Err(BridgeError::NotRunning);
        }

        let stdin = self.stdin.as_ref().ok_or(BridgeError::NotRunning)?;
        let rx = self.response_rx.as_ref().ok_or(BridgeError::NotRunning)?;

        // Serialize and send request (lock stdin)
        {
            let mut stdin_guard = stdin.lock();
            let json = serde_json::to_string(request)?;
            writeln!(stdin_guard, "{json}").map_err(|e| BridgeError::SendError(e.to_string()))?;
            stdin_guard
                .flush()
                .map_err(|e| BridgeError::SendError(e.to_string()))?;
        }

        // Wait for response (with timeout)
        let timeout = Duration::from_secs(300); // 5 minutes for long operations

        loop {
            match rx.recv_timeout(timeout) {
                Ok(response) => {
                    // Check if it's a command response (not an event)
                    if let Some(cmd) = response.as_command() {
                        return Ok(cmd.clone());
                    }
                    // Skip events, continue waiting for command response
                },
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    return Err(BridgeError::Timeout);
                },
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    return Err(BridgeError::ReceiveError("Channel disconnected".to_owned()));
                },
            }
        }
    }

    /// Send a request without waiting for response (fire and forget)
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be sent.
    pub fn send_request_async(&self, request: &BridgeRequest) -> Result<()> {
        if !self.ready {
            return Err(BridgeError::NotRunning);
        }

        let stdin = self.stdin.as_ref().ok_or(BridgeError::NotRunning)?;

        let mut stdin_guard = stdin.lock();
        let json = serde_json::to_string(request)?;
        writeln!(stdin_guard, "{json}").map_err(|e| BridgeError::SendError(e.to_string()))?;
        stdin_guard
            .flush()
            .map_err(|e| BridgeError::SendError(e.to_string()))?;

        Ok(())
    }

    /// Check if the bridge is running
    #[must_use]
    pub fn is_running(&mut self) -> bool {
        self.ready && self.check_and_recover()
    }

    /// Shutdown the bridge
    ///
    /// # Errors
    ///
    /// Returns an error if shutdown fails.
    #[expect(
        clippy::disallowed_methods,
        reason = "sync thread sleep is intentional for shutdown cleanup"
    )]
    pub fn shutdown(&mut self) -> Result<()> {
        if !self.is_running() {
            return Ok(());
        }

        log::info!("Shutting down agent bridge");

        // Send shutdown request (ignore result - process may already be dead)
        drop(self.send_request(&BridgeRequest::Shutdown));

        // Give it a moment to clean up
        thread::sleep(Duration::from_millis(100));

        // Force kill if still running
        if let Some(mut child) = self.child.take() {
            drop(child.kill());
            drop(child.wait());
        }

        self.stdin = None;
        self.response_rx = None;
        self.ready = false;

        log::info!("Agent bridge shutdown complete");
        Ok(())
    }
}

impl Drop for AgentBridge {
    fn drop(&mut self) {
        drop(self.shutdown());
    }
}

impl Default for AgentBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for AgentBridge {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AgentBridge")
            .field("ready", &self.ready)
            .field("running", &self.child.is_some())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_response_summary_omits_payload_values() {
        let line = r#"{"type":"agent_message","requestType":"send_message","sessionId":"session-secret","message":"LEAK_ME","apiKey":"sk-secret","nested":{"repo":"SECRET_REPO"}}"#;
        let summary = format_malformed_response_line(line, Category::Data);

        assert!(summary.contains("line_bytes="));
        assert!(summary.contains("trimmed_bytes="));
        assert!(summary.contains("parse_category=data"));
        assert!(summary.contains("parsed_kind=object"));
        assert!(summary.contains("response_type=agent_message"));
        assert!(summary.contains("request_type=send_message"));
        assert!(summary.contains("top_level_key_count=6"));
        assert!(summary.contains(
            "top_level_keys=[type,requestType,sessionId,message,[unrecognized-key],[unrecognized-key]]"
        ));

        for leaked in [
            "LEAK_ME",
            "SECRET_REPO",
            "session-secret",
            "sk-secret",
            "apiKey",
            "nested",
        ] {
            assert!(
                !summary.contains(leaked),
                "summary leaked payload value or unsafe key: {leaked}"
            );
        }
    }

    #[test]
    fn malformed_response_summary_omits_invalid_json_text() {
        let line = "not json with SECRET_TOKEN and repository text";
        let summary = format_malformed_response_line(line, Category::Syntax);

        assert!(summary.contains("parse_category=syntax"));
        assert!(summary.contains("parsed_kind=invalid_json"));
        assert!(!summary.contains("SECRET_TOKEN"));
        assert!(!summary.contains("repository text"));
    }
}
