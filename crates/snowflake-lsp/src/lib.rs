//! Snowflake LSP - Language Server Protocol integration
//!
//! This crate manages LSP servers for different languages and provides
//! IDE features like completion, hover, and go-to-definition.

// Allow certain clippy lints for LSP protocol code which has specific requirements
#![allow(
    clippy::impl_trait_in_params,
    reason = "ergonomic API for builder pattern"
)]
#![allow(
    clippy::iter_over_hash_type,
    reason = "iteration order doesn't matter for shutdown"
)]
#![allow(
    clippy::cast_possible_truncation,
    reason = "LSP protocol values fit in u32/i32"
)]
#![allow(clippy::str_to_string, reason = "common pattern for JSON parsing")]
#![allow(
    clippy::uninlined_format_args,
    reason = "more readable for error messages"
)]
#![allow(clippy::indexing_slicing, reason = "bounds checked before slicing")]
#![allow(clippy::absolute_paths, reason = "std types are clear with full paths")]
#![allow(
    clippy::trait_duplication_in_bounds,
    reason = "serde derive requires this"
)]
#![allow(
    clippy::significant_drop_tightening,
    reason = "mutex guards need to be held"
)]
#![allow(clippy::type_complexity, reason = "LSP protocol types are complex")]
#![allow(
    clippy::redundant_closure_for_method_calls,
    reason = "clearer with explicit closures"
)]
#![allow(
    clippy::let_underscore_must_use,
    reason = "send results are intentionally ignored"
)]
#![allow(clippy::future_not_send, reason = "LSP client is single-threaded")]
#![allow(clippy::map_err_ignore, reason = "original error context not needed")]
#![allow(
    clippy::needless_pass_by_value,
    reason = "JSON values are consumed during parsing"
)]
#![allow(
    clippy::option_if_let_else,
    reason = "if-let-else is clearer for this pattern"
)]
#![allow(clippy::map_unwrap_or, reason = "map().unwrap_or() is clearer here")]
#![allow(
    clippy::default_numeric_fallback,
    reason = "type is clear from context"
)]

use bytes::BytesMut;
use futures::channel::mpsc;
use hashbrown::HashMap;
use serde::{de::DeserializeOwned, Serialize};
use snowflake_core::{
    CompletionItem, Diagnostic, DiagnosticSeverity, Error, HoverInfo, Location, Position, Range,
    Result, SignatureHelp, SignatureInfo,
};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};
use tokio_util::codec::Decoder;
use tracing::{debug, error, info, warn};

// ============================================
// Server Configuration
// ============================================

/// Configuration for a language server
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Language identifier (e.g., "rust", "typescript")
    pub language_id: String,
    /// Command to run the language server
    pub command: String,
    /// Arguments to pass to the command
    pub args: Vec<String>,
    /// Environment variables to set
    pub env: HashMap<String, String>,
}

impl ServerConfig {
    /// Create a new server configuration
    #[must_use]
    pub fn new(language_id: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            language_id: language_id.into(),
            command: command.into(),
            args: Vec::new(),
            env: HashMap::new(),
        }
    }

    /// Add arguments to the configuration
    #[must_use]
    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = args;
        self
    }

    /// Add an environment variable
    #[must_use]
    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let _prev = self.env.insert(key.into(), value.into());
        self
    }
}

// ============================================
// Built-in Configurations
// ============================================

/// Configuration for rust-analyzer
#[must_use]
pub fn rust_analyzer() -> ServerConfig {
    ServerConfig::new("rust", "rust-analyzer")
}

/// Configuration for TypeScript language server
#[must_use]
pub fn typescript_language_server() -> ServerConfig {
    ServerConfig::new("typescript", "typescript-language-server").with_args(vec!["--stdio".into()])
}

/// Configuration for Pyright (Python)
#[must_use]
pub fn pyright() -> ServerConfig {
    ServerConfig::new("python", "pyright-langserver").with_args(vec!["--stdio".into()])
}

/// Configuration for gopls (Go)
#[must_use]
pub fn gopls() -> ServerConfig {
    ServerConfig::new("go", "gopls")
}

/// Get the default server configuration for a language
#[must_use]
pub fn default_config_for_language(language: &str) -> Option<ServerConfig> {
    match language {
        "rust" => Some(rust_analyzer()),
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            Some(typescript_language_server())
        },
        "python" => Some(pyright()),
        "go" => Some(gopls()),
        _ => None,
    }
}

/// Detect language from file extension
#[must_use]
pub fn language_from_path(path: &Path) -> Option<&'static str> {
    path.extension().and_then(|ext| match ext.to_str() {
        Some("rs") => Some("rust"),
        Some("ts") => Some("typescript"),
        Some("tsx") => Some("typescriptreact"),
        Some("js") => Some("javascript"),
        Some("jsx") => Some("javascriptreact"),
        Some("py") => Some("python"),
        Some("go") => Some("go"),
        Some("json") => Some("json"),
        Some("html") => Some("html"),
        Some("css") => Some("css"),
        Some("md") => Some("markdown"),
        Some("toml") => Some("toml"),
        Some("yaml" | "yml") => Some("yaml"),
        _ => None,
    })
}

/// Convert a file path to a URI string
fn path_to_uri(path: &Path) -> Result<String> {
    let abs_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| Error::Lsp(e.to_string()))?
            .join(path)
    };

    // On Windows, paths need special handling
    #[cfg(windows)]
    {
        Ok(format!(
            "file:///{}",
            abs_path
                .to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches('/')
        ))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("file://{}", abs_path.to_string_lossy()))
    }
}

/// Convert a URI string to a file path
fn uri_to_path(uri: &str) -> Option<PathBuf> {
    if !uri.starts_with("file://") {
        return None;
    }

    let path_str = uri.strip_prefix("file://")?;

    #[cfg(windows)]
    {
        // Windows paths in URIs have a leading slash that needs to be removed
        let path_str = path_str.trim_start_matches('/');
        Some(PathBuf::from(path_str.replace('/', "\\")))
    }
    #[cfg(not(windows))]
    {
        Some(PathBuf::from(path_str))
    }
}

// ============================================
// JSON-RPC Types
// ============================================

/// JSON-RPC request
#[derive(Debug, Serialize)]
struct JsonRpcRequest<T: Serialize> {
    jsonrpc: &'static str,
    id: i64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<T>,
}

/// JSON-RPC notification (no id, no response expected)
#[derive(Debug, Serialize)]
struct JsonRpcNotification<T: Serialize> {
    jsonrpc: &'static str,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<T>,
}

// Note: Response parsing is done via serde_json::Value for flexibility
// with different LSP server implementations.

// ============================================
// LSP Codec (Content-Length framing)
// ============================================

/// Codec for LSP messages with Content-Length headers
struct LspCodec;

impl Decoder for LspCodec {
    type Item = serde_json::Value;
    type Error = std::io::Error;

    fn decode(
        &mut self,
        src: &mut BytesMut,
    ) -> std::result::Result<Option<Self::Item>, Self::Error> {
        // Look for the header/content separator
        let header_end = src.windows(4).position(|w| w == b"\r\n\r\n");

        if let Some(header_end) = header_end {
            // Parse headers
            let header_bytes = &src[..header_end];
            let header_str = std::str::from_utf8(header_bytes)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

            // Find Content-Length
            let content_length = header_str
                .lines()
                .find_map(|line| {
                    let line = line.trim();
                    if line.to_lowercase().starts_with("content-length:") {
                        line.split(':')
                            .nth(1)
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Missing Content-Length header",
                    )
                })?;

            // Check if we have the full message
            let total_len = header_end + 4 + content_length;
            if src.len() >= total_len {
                // Skip headers
                let _headers = src.split_to(header_end + 4);
                let content = src.split_to(content_length);

                // Parse JSON
                let value: serde_json::Value = serde_json::from_slice(&content)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

                return Ok(Some(value));
            }
        }

        Ok(None)
    }
}

// ============================================
// Response Channel Management
// ============================================

/// Thread-safe pending request storage
struct PendingRequests {
    requests: Mutex<HashMap<i64, tokio::sync::oneshot::Sender<serde_json::Value>>>,
}

impl PendingRequests {
    fn new() -> Self {
        Self {
            requests: Mutex::new(HashMap::new()),
        }
    }

    async fn insert(&self, id: i64, sender: tokio::sync::oneshot::Sender<serde_json::Value>) {
        let _prev = self.requests.lock().await.insert(id, sender);
    }

    async fn remove(&self, id: i64) -> Option<tokio::sync::oneshot::Sender<serde_json::Value>> {
        self.requests.lock().await.remove(&id)
    }
}

// ============================================
// LSP Client
// ============================================

/// Client for a single language server process
pub struct LspClient {
    /// Server configuration
    config: ServerConfig,
    /// Child process handle
    process: Mutex<Option<Child>>,
    /// Stdin writer
    stdin: Mutex<Option<tokio::process::ChildStdin>>,
    /// Request ID counter
    next_id: AtomicI64,
    /// Pending requests waiting for responses
    pending: Arc<PendingRequests>,
    /// Diagnostics channel sender
    diagnostics_tx: mpsc::UnboundedSender<(PathBuf, Vec<Diagnostic>)>,
    /// Diagnostics channel receiver (for external consumption)
    diagnostics_rx: Mutex<Option<mpsc::UnboundedReceiver<(PathBuf, Vec<Diagnostic>)>>>,
    /// Workspace root path
    root_path: PathBuf,
    /// Whether the server is initialized
    initialized: RwLock<bool>,
    /// Open documents (path -> version)
    open_documents: RwLock<HashMap<PathBuf, i32>>,
}

impl std::fmt::Debug for LspClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LspClient")
            .field("config", &self.config)
            .field("root_path", &self.root_path)
            .finish_non_exhaustive()
    }
}

impl LspClient {
    /// Create a new LSP client
    pub fn new(config: ServerConfig, root_path: impl Into<PathBuf>) -> Self {
        let (diagnostics_tx, diagnostics_rx) = mpsc::unbounded();
        Self {
            config,
            process: Mutex::new(None),
            stdin: Mutex::new(None),
            next_id: AtomicI64::new(1),
            pending: Arc::new(PendingRequests::new()),
            diagnostics_tx,
            diagnostics_rx: Mutex::new(Some(diagnostics_rx)),
            root_path: root_path.into(),
            initialized: RwLock::new(false),
            open_documents: RwLock::new(HashMap::new()),
        }
    }

    /// Start the language server process
    pub async fn start(&self) -> Result<()> {
        let mut process = self.process.lock().await;
        if process.is_some() {
            return Ok(());
        }

        info!(
            "Starting language server: {} {}",
            self.config.command,
            self.config.args.join(" ")
        );

        let mut cmd = Command::new(&self.config.command);
        let _ = cmd
            .args(&self.config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        for (key, value) in &self.config.env {
            let _ = cmd.env(key, value);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| Error::Lsp(format!("Failed to start {}: {}", self.config.command, e)))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| Error::Lsp("Failed to get stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::Lsp("Failed to get stdout".into()))?;

        // Store handles
        *self.stdin.lock().await = Some(stdin);
        *process = Some(child);

        // Start reading responses in background
        let pending = Arc::clone(&self.pending);
        let diagnostics_tx = self.diagnostics_tx.clone();

        drop(tokio::spawn(Self::read_responses(
            stdout,
            pending,
            diagnostics_tx,
        )));

        // Send initialize request
        self.initialize().await?;

        Ok(())
    }

    /// Initialize the language server
    async fn initialize(&self) -> Result<()> {
        let root_uri = path_to_uri(&self.root_path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct InitParams {
            process_id: u32,
            root_uri: String,
            capabilities: Capabilities,
            client_info: ClientInfo,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Capabilities {
            text_document: TextDocumentCapabilities,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct TextDocumentCapabilities {
            completion: CompletionCapabilities,
            hover: HoverCapabilities,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct CompletionCapabilities {
            completion_item: CompletionItemCapabilities,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct CompletionItemCapabilities {
            snippet_support: bool,
            documentation_format: Vec<String>,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct HoverCapabilities {
            content_format: Vec<String>,
        }

        #[derive(Serialize)]
        struct ClientInfo {
            name: String,
            version: String,
        }

        let params = InitParams {
            process_id: std::process::id(),
            root_uri,
            capabilities: Capabilities {
                text_document: TextDocumentCapabilities {
                    completion: CompletionCapabilities {
                        completion_item: CompletionItemCapabilities {
                            snippet_support: false,
                            documentation_format: vec!["markdown".into(), "plaintext".into()],
                        },
                    },
                    hover: HoverCapabilities {
                        content_format: vec!["markdown".into(), "plaintext".into()],
                    },
                },
            },
            client_info: ClientInfo {
                name: "Snowflake".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
        };

        let _result: serde_json::Value = self.request("initialize", params).await?;

        // Send initialized notification
        self.notify::<()>("initialized", None).await?;
        *self.initialized.write().await = true;

        info!(
            "Language server initialized for {}",
            self.config.language_id
        );
        Ok(())
    }

    /// Read responses from the language server
    async fn read_responses(
        stdout: tokio::process::ChildStdout,
        pending: Arc<PendingRequests>,
        diagnostics_tx: mpsc::UnboundedSender<(PathBuf, Vec<Diagnostic>)>,
    ) {
        let mut reader = BufReader::new(stdout);
        let mut buffer = BytesMut::with_capacity(8192);

        loop {
            // Read more data
            let mut chunk = [0u8; 4096];
            match reader.read(&mut chunk).await {
                Ok(0) => {
                    debug!("Language server stdout closed");
                    break;
                },
                Ok(n) => {
                    buffer.extend_from_slice(&chunk[..n]);
                },
                Err(e) => {
                    error!("Error reading from language server: {}", e);
                    break;
                },
            }

            // Try to decode messages
            let mut codec = LspCodec;
            while let Ok(Some(message)) = codec.decode(&mut buffer) {
                Self::handle_message(&message, &pending, &diagnostics_tx).await;
            }
        }
    }

    /// Handle an incoming message from the server
    async fn handle_message(
        message: &serde_json::Value,
        pending: &PendingRequests,
        diagnostics_tx: &mpsc::UnboundedSender<(PathBuf, Vec<Diagnostic>)>,
    ) {
        // Check if it's a response (has id but no method)
        if let Some(id) = message.get("id").and_then(|v| v.as_i64()) {
            if message.get("method").is_none() {
                // It's a response
                if let Some(sender) = pending.remove(id).await {
                    let _ = sender.send(message.clone());
                }
                return;
            }
        }

        // Check if it's a notification
        if let Some(method) = message.get("method").and_then(|v| v.as_str()) {
            match method {
                "textDocument/publishDiagnostics" => {
                    if let Some(params) = message.get("params") {
                        Self::handle_diagnostics(params, diagnostics_tx);
                    }
                },
                "window/logMessage" | "window/showMessage" => {
                    if let Some(params) = message.get("params") {
                        if let Some(msg) = params.get("message").and_then(|v| v.as_str()) {
                            debug!("LSP: {}", msg);
                        }
                    }
                },
                _ => {
                    debug!("Unhandled notification: {}", method);
                },
            }
        }
    }

    /// Handle diagnostics notification
    fn handle_diagnostics(
        params: &serde_json::Value,
        diagnostics_tx: &mpsc::UnboundedSender<(PathBuf, Vec<Diagnostic>)>,
    ) {
        let uri = params.get("uri").and_then(|v| v.as_str());
        let diagnostics_json = params.get("diagnostics").and_then(|v| v.as_array());

        if let (Some(uri), Some(diagnostics_arr)) = (uri, diagnostics_json) {
            if let Some(path) = uri_to_path(uri) {
                let diagnostics: Vec<Diagnostic> = diagnostics_arr
                    .iter()
                    .filter_map(Self::convert_diagnostic)
                    .collect();

                let _ = diagnostics_tx.unbounded_send((path, diagnostics));
            }
        }
    }

    /// Convert an LSP diagnostic to our format
    fn convert_diagnostic(value: &serde_json::Value) -> Option<Diagnostic> {
        let message = value.get("message")?.as_str()?.to_string();
        let severity = value
            .get("severity")
            .and_then(|v| v.as_i64())
            .map(|s| match s {
                1 => DiagnosticSeverity::Error,
                2 => DiagnosticSeverity::Warning,
                3 => DiagnosticSeverity::Info,
                _ => DiagnosticSeverity::Hint,
            })
            .unwrap_or(DiagnosticSeverity::Error);

        let range = value.get("range")?;
        let start = range.get("start")?;
        let end = range.get("end")?;

        Some(Diagnostic {
            message,
            severity,
            range: Range {
                start: Position {
                    line: start.get("line")?.as_u64()? as u32,
                    column: start.get("character")?.as_u64()? as u32,
                },
                end: Position {
                    line: end.get("line")?.as_u64()? as u32,
                    column: end.get("character")?.as_u64()? as u32,
                },
            },
            source: value
                .get("source")
                .and_then(|v| v.as_str())
                .map(String::from),
            code: value.get("code").and_then(|v| {
                v.as_str()
                    .map(String::from)
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            }),
        })
    }

    /// Send a request and wait for response
    async fn request<P: Serialize, R: DeserializeOwned>(
        &self,
        method: &str,
        params: P,
    ) -> Result<R> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params: Some(params),
        };

        // Create response channel
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.pending.insert(id, tx).await;

        // Send request
        self.send_message(&request).await?;

        // Wait for response with timeout
        let response = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
            .await
            .map_err(|_| Error::Lsp("Request timed out".into()))?
            .map_err(|_| Error::Lsp("Response channel closed".into()))?;

        // Check for error
        if let Some(error) = response.get("error") {
            let msg = error
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error");
            return Err(Error::Lsp(msg.into()));
        }

        // Parse result
        let result = response
            .get("result")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        serde_json::from_value(result).map_err(|e| Error::Lsp(e.to_string()))
    }

    /// Send a notification (no response expected)
    async fn notify<P: Serialize>(&self, method: &str, params: Option<P>) -> Result<()> {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
        };

        self.send_message(&notification).await
    }

    /// Send a message to the language server
    async fn send_message<T: Serialize>(&self, message: &T) -> Result<()> {
        let json = serde_json::to_string(message).map_err(|e| Error::Lsp(e.to_string()))?;
        let content = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);

        let mut stdin = self.stdin.lock().await;
        if let Some(ref mut stdin) = *stdin {
            stdin
                .write_all(content.as_bytes())
                .await
                .map_err(|e| Error::Lsp(e.to_string()))?;
            stdin.flush().await.map_err(|e| Error::Lsp(e.to_string()))?;
        }

        Ok(())
    }

    /// Check if the server is running
    pub async fn is_running(&self) -> bool {
        self.process.lock().await.is_some()
    }

    /// Shutdown the language server
    pub async fn shutdown(&self) -> Result<()> {
        if !self.is_running().await {
            return Ok(());
        }

        info!("Shutting down language server: {}", self.config.language_id);

        // Send shutdown request
        let _: serde_json::Value = self.request("shutdown", serde_json::Value::Null).await?;

        // Send exit notification
        self.notify::<()>("exit", None).await?;

        // Wait for process to exit
        let mut process = self.process.lock().await;
        if let Some(ref mut child) = *process {
            let _ = child.wait().await;
        }
        *process = None;

        Ok(())
    }

    // ============================================
    // Document Synchronization
    // ============================================

    /// Notify that a document was opened
    pub async fn did_open(&self, path: &Path, language: &str, content: &str) -> Result<()> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DidOpenParams {
            text_document: TextDocumentItem,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct TextDocumentItem {
            uri: String,
            language_id: String,
            version: i32,
            text: String,
        }

        let params = DidOpenParams {
            text_document: TextDocumentItem {
                uri,
                language_id: language.to_string(),
                version: 1,
                text: content.to_string(),
            },
        };

        let _prev = self
            .open_documents
            .write()
            .await
            .insert(path.to_path_buf(), 1);
        self.notify("textDocument/didOpen", Some(params)).await
    }

    /// Notify that a document changed
    pub async fn did_change(&self, path: &Path, content: &str, version: i32) -> Result<()> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DidChangeParams {
            text_document: VersionedTextDocumentId,
            content_changes: Vec<ContentChange>,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct VersionedTextDocumentId {
            uri: String,
            version: i32,
        }

        #[derive(Serialize)]
        struct ContentChange {
            text: String,
        }

        let params = DidChangeParams {
            text_document: VersionedTextDocumentId { uri, version },
            content_changes: vec![ContentChange {
                text: content.to_string(),
            }],
        };

        let _prev = self
            .open_documents
            .write()
            .await
            .insert(path.to_path_buf(), version);
        self.notify("textDocument/didChange", Some(params)).await
    }

    /// Notify that a document was saved
    pub async fn did_save(&self, path: &Path) -> Result<()> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DidSaveParams {
            text_document: TextDocumentId,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        let params = DidSaveParams {
            text_document: TextDocumentId { uri },
        };

        self.notify("textDocument/didSave", Some(params)).await
    }

    /// Notify that a document was closed
    pub async fn did_close(&self, path: &Path) -> Result<()> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DidCloseParams {
            text_document: TextDocumentId,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        let params = DidCloseParams {
            text_document: TextDocumentId { uri },
        };

        let _prev = self.open_documents.write().await.remove(path);
        self.notify("textDocument/didClose", Some(params)).await
    }

    // ============================================
    // LSP Requests
    // ============================================

    /// Get completions at a position
    pub async fn completion(
        &self,
        path: &Path,
        line: u32,
        col: u32,
    ) -> Result<Vec<CompletionItem>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct CompletionParams {
            text_document: TextDocumentId,
            position: LspPosition,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        struct LspPosition {
            line: u32,
            character: u32,
        }

        let params = CompletionParams {
            text_document: TextDocumentId { uri },
            position: LspPosition {
                line,
                character: col,
            },
        };

        let result: Option<serde_json::Value> =
            self.request("textDocument/completion", params).await?;

        // Parse completion response
        let items = match result {
            Some(serde_json::Value::Array(arr)) => arr,
            Some(serde_json::Value::Object(obj)) => obj
                .get("items")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default(),
            _ => Vec::new(),
        };

        Ok(items
            .iter()
            .filter_map(Self::convert_completion_item)
            .collect())
    }

    /// Convert LSP completion item to our format
    fn convert_completion_item(item: &serde_json::Value) -> Option<CompletionItem> {
        let label = item.get("label")?.as_str()?.to_string();
        let kind = item.get("kind").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let detail = item
            .get("detail")
            .and_then(|v| v.as_str())
            .map(String::from);
        let documentation = item.get("documentation").and_then(|d| {
            if let Some(s) = d.as_str() {
                Some(s.to_string())
            } else if let Some(obj) = d.as_object() {
                obj.get("value").and_then(|v| v.as_str()).map(String::from)
            } else {
                None
            }
        });
        let insert_text = item
            .get("insertText")
            .and_then(|v| v.as_str())
            .map(String::from)
            .or_else(|| {
                item.get("textEdit")
                    .and_then(|te| te.get("newText").and_then(|v| v.as_str()).map(String::from))
            });
        let sort_text = item
            .get("sortText")
            .and_then(|v| v.as_str())
            .map(String::from);

        Some(CompletionItem {
            label,
            kind,
            detail,
            documentation,
            insert_text,
            sort_text,
        })
    }

    /// Get hover information at a position
    pub async fn hover(&self, path: &Path, line: u32, col: u32) -> Result<Option<HoverInfo>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct HoverParams {
            text_document: TextDocumentId,
            position: LspPosition,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        struct LspPosition {
            line: u32,
            character: u32,
        }

        let params = HoverParams {
            text_document: TextDocumentId { uri },
            position: LspPosition {
                line,
                character: col,
            },
        };

        let result: Option<serde_json::Value> = self.request("textDocument/hover", params).await?;

        Ok(result.and_then(Self::convert_hover))
    }

    /// Convert LSP hover to our format
    fn convert_hover(value: serde_json::Value) -> Option<HoverInfo> {
        let contents = value.get("contents")?;

        let contents_str = if let Some(s) = contents.as_str() {
            s.to_string()
        } else if let Some(obj) = contents.as_object() {
            // MarkupContent
            obj.get("value")?.as_str()?.to_string()
        } else if let Some(arr) = contents.as_array() {
            // MarkedString[]
            arr.iter()
                .filter_map(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s.to_string())
                    } else if let Some(obj) = v.as_object() {
                        let lang = obj.get("language")?.as_str()?;
                        let value = obj.get("value")?.as_str()?;
                        Some(format!("```{}\n{}\n```", lang, value))
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        } else {
            return None;
        };

        let range = value.get("range").and_then(|r| {
            let start = r.get("start")?;
            let end = r.get("end")?;
            Some(Range {
                start: Position {
                    line: start.get("line")?.as_u64()? as u32,
                    column: start.get("character")?.as_u64()? as u32,
                },
                end: Position {
                    line: end.get("line")?.as_u64()? as u32,
                    column: end.get("character")?.as_u64()? as u32,
                },
            })
        });

        Some(HoverInfo {
            contents: contents_str,
            range,
        })
    }

    /// Go to definition
    pub async fn definition(&self, path: &Path, line: u32, col: u32) -> Result<Option<Location>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DefinitionParams {
            text_document: TextDocumentId,
            position: LspPosition,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        struct LspPosition {
            line: u32,
            character: u32,
        }

        let params = DefinitionParams {
            text_document: TextDocumentId { uri },
            position: LspPosition {
                line,
                character: col,
            },
        };

        let result: Option<serde_json::Value> =
            self.request("textDocument/definition", params).await?;

        Ok(result.and_then(|v| {
            // Can be Location, Location[], or LocationLink[]
            if v.is_array() {
                v.as_array()
                    .and_then(|arr| arr.first())
                    .and_then(Self::convert_location)
            } else {
                Self::convert_location(&v)
            }
        }))
    }

    /// Find all references
    pub async fn references(&self, path: &Path, line: u32, col: u32) -> Result<Vec<Location>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ReferenceParams {
            text_document: TextDocumentId,
            position: LspPosition,
            context: ReferenceContext,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        struct LspPosition {
            line: u32,
            character: u32,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ReferenceContext {
            include_declaration: bool,
        }

        let params = ReferenceParams {
            text_document: TextDocumentId { uri },
            position: LspPosition {
                line,
                character: col,
            },
            context: ReferenceContext {
                include_declaration: true,
            },
        };

        let result: Option<Vec<serde_json::Value>> =
            self.request("textDocument/references", params).await?;

        Ok(result
            .unwrap_or_default()
            .iter()
            .filter_map(Self::convert_location)
            .collect())
    }

    /// Format document
    pub async fn format(&self, path: &Path) -> Result<Vec<TextEdit>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FormattingParams {
            text_document: TextDocumentId,
            options: FormattingOptions,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FormattingOptions {
            tab_size: u32,
            insert_spaces: bool,
        }

        let params = FormattingParams {
            text_document: TextDocumentId { uri },
            options: FormattingOptions {
                tab_size: 4,
                insert_spaces: true,
            },
        };

        let result: Option<Vec<serde_json::Value>> =
            self.request("textDocument/formatting", params).await?;

        Ok(result
            .unwrap_or_default()
            .iter()
            .filter_map(Self::convert_text_edit)
            .collect())
    }

    /// Get signature help
    pub async fn signature_help(
        &self,
        path: &Path,
        line: u32,
        col: u32,
    ) -> Result<Option<SignatureHelp>> {
        let uri = path_to_uri(path)?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct SignatureHelpParams {
            text_document: TextDocumentId,
            position: LspPosition,
        }

        #[derive(Serialize)]
        struct TextDocumentId {
            uri: String,
        }

        #[derive(Serialize)]
        struct LspPosition {
            line: u32,
            character: u32,
        }

        let params = SignatureHelpParams {
            text_document: TextDocumentId { uri },
            position: LspPosition {
                line,
                character: col,
            },
        };

        let result: Option<serde_json::Value> =
            self.request("textDocument/signatureHelp", params).await?;

        Ok(result.and_then(Self::convert_signature_help))
    }

    /// Convert LSP signature help to our format
    fn convert_signature_help(value: serde_json::Value) -> Option<SignatureHelp> {
        let signatures = value.get("signatures")?.as_array()?;

        let signatures: Vec<SignatureInfo> = signatures
            .iter()
            .filter_map(|sig| {
                let label = sig.get("label")?.as_str()?.to_string();
                let documentation = sig.get("documentation").and_then(|d| {
                    if let Some(s) = d.as_str() {
                        Some(s.to_string())
                    } else if let Some(obj) = d.as_object() {
                        obj.get("value").and_then(|v| v.as_str()).map(String::from)
                    } else {
                        None
                    }
                });
                let parameters: Vec<snowflake_core::ParameterInfo> = sig
                    .get("parameters")
                    .and_then(|p| p.as_array())
                    .map(|params| {
                        params
                            .iter()
                            .filter_map(|p| {
                                let label = if let Some(s) = p.get("label")?.as_str() {
                                    s.to_string()
                                } else {
                                    String::new()
                                };
                                let documentation = p.get("documentation").and_then(|d| {
                                    if let Some(s) = d.as_str() {
                                        Some(s.to_string())
                                    } else if let Some(obj) = d.as_object() {
                                        obj.get("value").and_then(|v| v.as_str()).map(String::from)
                                    } else {
                                        None
                                    }
                                });
                                Some(snowflake_core::ParameterInfo {
                                    label,
                                    documentation,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                Some(SignatureInfo {
                    label,
                    documentation,
                    parameters,
                })
            })
            .collect();

        let active_signature = value
            .get("activeSignature")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let active_parameter = value
            .get("activeParameter")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        Some(SignatureHelp {
            signatures,
            active_signature,
            active_parameter,
        })
    }

    /// Convert LSP location to our format
    fn convert_location(value: &serde_json::Value) -> Option<Location> {
        // Handle both Location and LocationLink
        let uri = value
            .get("uri")
            .or_else(|| value.get("targetUri"))
            .and_then(|v| v.as_str())?;

        let range = value
            .get("range")
            .or_else(|| value.get("targetSelectionRange"))
            .or_else(|| value.get("targetRange"))?;

        let start = range.get("start")?;

        let path = uri_to_path(uri)?;

        Some(Location {
            path: path.to_string_lossy().into(),
            line: start.get("line")?.as_u64()? as u32,
            column: start.get("character")?.as_u64()? as u32,
        })
    }

    /// Convert LSP text edit to our format
    fn convert_text_edit(value: &serde_json::Value) -> Option<TextEdit> {
        let range = value.get("range")?;
        let start = range.get("start")?;
        let end = range.get("end")?;
        let new_text = value.get("newText")?.as_str()?.to_string();

        Some(TextEdit {
            range: Range {
                start: Position {
                    line: start.get("line")?.as_u64()? as u32,
                    column: start.get("character")?.as_u64()? as u32,
                },
                end: Position {
                    line: end.get("line")?.as_u64()? as u32,
                    column: end.get("character")?.as_u64()? as u32,
                },
            },
            new_text,
        })
    }

    /// Take the diagnostics receiver (can only be called once)
    pub async fn take_diagnostics_receiver(
        &self,
    ) -> Option<mpsc::UnboundedReceiver<(PathBuf, Vec<Diagnostic>)>> {
        self.diagnostics_rx.lock().await.take()
    }
}

/// Text edit from formatting
#[derive(Debug, Clone)]
pub struct TextEdit {
    /// Range to replace
    pub range: Range,
    /// New text to insert
    pub new_text: String,
}

// ============================================
// LSP Manager
// ============================================

/// Manager for multiple language server instances
#[derive(Debug)]
pub struct LspManager {
    /// Active clients by language
    clients: RwLock<HashMap<String, Arc<LspClient>>>,
    /// Workspace root path
    workspace_root: RwLock<Option<PathBuf>>,
    /// Cached diagnostics by file path
    diagnostics_cache: RwLock<HashMap<PathBuf, Vec<Diagnostic>>>,
}

impl LspManager {
    /// Create a new LSP manager
    #[must_use]
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            workspace_root: RwLock::new(None),
            diagnostics_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Set the workspace root path
    pub async fn set_workspace_root(&self, path: PathBuf) {
        *self.workspace_root.write().await = Some(path);
    }

    /// Get or start a language server for the given language
    pub async fn get_or_start(&self, language: &str, root_path: &Path) -> Result<Arc<LspClient>> {
        // Check if we already have a client
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.get(language) {
                if client.is_running().await {
                    return Ok(Arc::clone(client));
                }
            }
        }

        // Get configuration for this language
        let config = default_config_for_language(language).ok_or_else(|| {
            Error::Lsp(format!("No language server configured for: {}", language))
        })?;

        // Create and start client
        let client = Arc::new(LspClient::new(config, root_path));
        client.start().await?;

        // Store client
        let _prev = self
            .clients
            .write()
            .await
            .insert(language.to_string(), Arc::clone(&client));

        Ok(client)
    }

    /// Get the client for a file path
    async fn get_client_for_path(&self, path: &str) -> Result<Arc<LspClient>> {
        let path = Path::new(path);
        let language = language_from_path(path)
            .ok_or_else(|| Error::Lsp(format!("Unknown file type: {}", path.display())))?;

        let workspace_root = self.workspace_root.read().await;
        let root = workspace_root
            .as_ref()
            .ok_or_else(|| Error::Lsp("No workspace root set".into()))?;

        self.get_or_start(language, root).await
    }

    /// Get completions at a position
    pub async fn get_completions(
        &self,
        path: &str,
        line: u32,
        column: u32,
    ) -> Result<Vec<CompletionItem>> {
        let client = self.get_client_for_path(path).await?;
        client.completion(Path::new(path), line, column).await
    }

    /// Get hover information at a position
    pub async fn get_hover(&self, path: &str, line: u32, column: u32) -> Result<Option<HoverInfo>> {
        let client = self.get_client_for_path(path).await?;
        client.hover(Path::new(path), line, column).await
    }

    /// Go to definition
    pub async fn goto_definition(
        &self,
        path: &str,
        line: u32,
        column: u32,
    ) -> Result<Option<Location>> {
        let client = self.get_client_for_path(path).await?;
        client.definition(Path::new(path), line, column).await
    }

    /// Find all references
    pub async fn find_references(
        &self,
        path: &str,
        line: u32,
        column: u32,
    ) -> Result<Vec<Location>> {
        let client = self.get_client_for_path(path).await?;
        client.references(Path::new(path), line, column).await
    }

    /// Format document
    pub async fn format_document(&self, path: &str) -> Result<String> {
        let client = self.get_client_for_path(path).await?;
        let edits = client.format(Path::new(path)).await?;

        // For now, just return a message about the edits
        // In a full implementation, we'd apply the edits to the document
        if edits.is_empty() {
            Ok("No formatting changes needed".into())
        } else {
            Ok(format!("{} formatting changes", edits.len()))
        }
    }

    /// Get diagnostics for a file
    pub async fn get_diagnostics(&self, path: &str) -> Result<Vec<Diagnostic>> {
        let cache = self.diagnostics_cache.read().await;
        Ok(cache.get(Path::new(path)).cloned().unwrap_or_default())
    }

    /// Get signature help
    pub async fn get_signature_help(
        &self,
        path: &str,
        line: u32,
        column: u32,
    ) -> Result<Option<SignatureHelp>> {
        let client = self.get_client_for_path(path).await?;
        client.signature_help(Path::new(path), line, column).await
    }

    /// Notify that a document was opened
    pub async fn did_open(&self, path: &str, language: &str, content: &str) -> Result<()> {
        let client = self.get_client_for_path(path).await?;
        client.did_open(Path::new(path), language, content).await
    }

    /// Notify that a document changed
    pub async fn did_change(&self, path: &str, content: &str, version: i32) -> Result<()> {
        let client = self.get_client_for_path(path).await?;
        client.did_change(Path::new(path), content, version).await
    }

    /// Notify that a document was saved
    pub async fn did_save(&self, path: &str) -> Result<()> {
        let client = self.get_client_for_path(path).await?;
        client.did_save(Path::new(path)).await
    }

    /// Notify that a document was closed
    pub async fn did_close(&self, path: &str) -> Result<()> {
        let client = self.get_client_for_path(path).await?;
        client.did_close(Path::new(path)).await
    }

    /// Start a language server for the given language.
    ///
    /// If the server is already running, returns Ok without restarting.
    /// If a stale client exists (crashed server), it will be cleaned up first.
    pub async fn start_server(&self, language: &str, root_path: &str) -> Result<()> {
        let root = PathBuf::from(root_path);

        // Get configuration first (before acquiring lock)
        let config = default_config_for_language(language)
            .ok_or_else(|| Error::Lsp(format!("Unsupported language: {}", language)))?;

        // Use write lock for entire operation to prevent race conditions
        let mut clients = self.clients.write().await;

        // Check if already running
        if let Some(existing) = clients.get(language) {
            if existing.is_running().await {
                info!(
                    "Language server for {} already running, skipping start",
                    language
                );
                return Ok(());
            }
            // Stale client exists (server crashed) - remove it
            info!("Cleaning up stale {} language server", language);
            let _removed = clients.remove(language);
        }

        // Create and start client
        let client = Arc::new(LspClient::new(config, &root));
        client.start().await?;

        // Store client
        let _prev = clients.insert(language.to_string(), Arc::clone(&client));

        info!("Started language server for {} at {}", language, root_path);
        Ok(())
    }

    /// Stop a language server for the given language.
    pub async fn stop_server(&self, language: &str) -> Result<()> {
        let client = {
            let mut clients = self.clients.write().await;
            clients.remove(language)
        };

        if let Some(client) = client {
            client.shutdown().await?;
            info!("Stopped language server for {}", language);
        }

        Ok(())
    }

    /// Check if a language server is running.
    pub async fn is_server_running(&self, language: &str) -> bool {
        let clients = self.clients.read().await;
        if let Some(client) = clients.get(language) {
            client.is_running().await
        } else {
            false
        }
    }

    /// Get list of running language servers.
    pub async fn running_servers(&self) -> Vec<String> {
        // Collect clients first, then check status outside the lock
        let clients_snapshot: Vec<(String, Arc<LspClient>)> = {
            let clients = self.clients.read().await;
            clients
                .iter()
                .map(|(lang, client)| (lang.clone(), Arc::clone(client)))
                .collect()
        };

        let mut running = Vec::new();
        for (language, client) in clients_snapshot {
            if client.is_running().await {
                running.push(language);
            }
        }
        running
    }

    /// Stop all language servers.
    pub async fn stop_all(&self) {
        let clients = {
            let mut clients = self.clients.write().await;
            std::mem::take(&mut *clients)
        };

        for (language, client) in clients {
            if let Err(e) = client.shutdown().await {
                warn!("Error shutting down {} language server: {}", language, e);
            }
        }
        info!("Stopped all language servers");
    }

    /// Shutdown all language servers
    pub async fn shutdown_all(&self) -> Result<()> {
        let clients = self.clients.read().await;
        for client in clients.values() {
            if let Err(e) = client.shutdown().await {
                warn!("Error shutting down language server: {}", e);
            }
        }
        Ok(())
    }

    /// Update diagnostics cache
    pub async fn update_diagnostics(&self, path: PathBuf, diagnostics: Vec<Diagnostic>) {
        let _prev = self
            .diagnostics_cache
            .write()
            .await
            .insert(path, diagnostics);
    }
}

impl Default for LspManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "test code can panic")]
mod tests {
    use super::*;

    #[test]
    fn test_language_detection() {
        assert_eq!(language_from_path(Path::new("test.rs")), Some("rust"));
        assert_eq!(language_from_path(Path::new("test.ts")), Some("typescript"));
        assert_eq!(
            language_from_path(Path::new("test.tsx")),
            Some("typescriptreact")
        );
        assert_eq!(language_from_path(Path::new("test.py")), Some("python"));
        assert_eq!(language_from_path(Path::new("test.go")), Some("go"));
        assert_eq!(language_from_path(Path::new("test.txt")), None);
    }

    #[test]
    fn test_default_configs() {
        assert!(default_config_for_language("rust").is_some());
        assert!(default_config_for_language("typescript").is_some());
        assert!(default_config_for_language("python").is_some());
        assert!(default_config_for_language("go").is_some());
        assert!(default_config_for_language("unknown").is_none());
    }

    #[test]
    fn test_server_config() {
        let config = ServerConfig::new("rust", "rust-analyzer")
            .with_args(vec!["--log-file".into(), "/tmp/ra.log".into()])
            .with_env("RUST_LOG", "debug");

        assert_eq!(config.language_id, "rust");
        assert_eq!(config.command, "rust-analyzer");
        assert_eq!(config.args.len(), 2);
        assert_eq!(config.env.get("RUST_LOG"), Some(&"debug".to_string()));
    }

    #[test]
    fn test_path_to_uri() {
        let path = Path::new("/Users/test/file.rs");
        let uri = path_to_uri(path).unwrap();
        assert!(uri.starts_with("file://"));
        assert!(uri.contains("file.rs"));
    }

    #[test]
    fn test_uri_to_path() {
        let uri = "file:///Users/test/file.rs";
        let path = uri_to_path(uri).unwrap();
        assert_eq!(path, PathBuf::from("/Users/test/file.rs"));
    }
}
