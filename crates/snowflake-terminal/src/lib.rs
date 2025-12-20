//! Snowflake Terminal - PTY management and terminal emulation
//!
//! This crate provides pseudo-terminal (PTY) support for running shell sessions.

use std::collections::HashMap;
use std::sync::Arc;

use snowflake_core::{Error, Result, TerminalInfo};
use tokio::sync::RwLock;

/// Terminal manager for handling PTY sessions
pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, TerminalSession>>>,
}

struct TerminalSession {
    id: String,
    pid: u32,
    shell: String,
    cwd: String,
    // Will hold PTY handle
}

impl TerminalManager {
    /// Create a new terminal manager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new terminal session
    pub async fn create(
        &self,
        id: &str,
        cwd: Option<&str>,
        shell: Option<&str>,
    ) -> Result<TerminalInfo> {
        let shell = shell.unwrap_or(Self::default_shell());
        let cwd = cwd.unwrap_or(".");

        // TODO: Actually spawn PTY
        let session = TerminalSession {
            id: id.to_string(),
            pid: 0, // Will be actual PID
            shell: shell.to_string(),
            cwd: cwd.to_string(),
        };

        let info = TerminalInfo {
            id: session.id.clone(),
            pid: session.pid,
            shell: session.shell.clone(),
            cwd: session.cwd.clone(),
        };

        self.sessions.write().await.insert(id.to_string(), session);

        Ok(info)
    }

    /// Write data to a terminal
    pub async fn write(&self, id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.read().await;
        if !sessions.contains_key(id) {
            return Err(Error::Terminal(format!("Terminal not found: {}", id)));
        }

        // TODO: Actually write to PTY
        let _ = data;

        Ok(())
    }

    /// Resize a terminal
    pub async fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.read().await;
        if !sessions.contains_key(id) {
            return Err(Error::Terminal(format!("Terminal not found: {}", id)));
        }

        // TODO: Actually resize PTY
        let _ = (cols, rows);

        Ok(())
    }

    /// Close a terminal session
    pub async fn close(&self, id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if sessions.remove(id).is_none() {
            return Err(Error::Terminal(format!("Terminal not found: {}", id)));
        }

        // TODO: Kill PTY process

        Ok(())
    }

    /// Get default shell for the platform
    fn default_shell() -> &'static str {
        #[cfg(target_os = "windows")]
        {
            "powershell.exe"
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("SHELL")
                .ok()
                .map(|_| "/bin/zsh")
                .unwrap_or("/bin/bash")
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
