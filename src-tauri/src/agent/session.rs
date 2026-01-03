//! Session Manager - High-level API for managing agent sessions
//!
//! Wraps the bridge and provides a clean API for the Tauri commands.

use super::bridge::{AgentBridge, BridgeError, EventCallback, Result};
use super::protocol::{
    AttachmentContentBlock, BridgeRequest, CommandResponse, CommandScope, ForkSessionOptions,
    ForkSessionResult, Model, PermissionResponse, SessionConfig, SlashCommandDefinition,
    SubagentDefinition,
};
use parking_lot::Mutex;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

/// Session Manager - manages the agent bridge and sessions
#[derive(Debug)]
pub struct SessionManager {
    /// The agent bridge (mutex for thread-safe access)
    bridge: Mutex<AgentBridge>,
    /// Path to the sidecar script
    sidecar_path: PathBuf,
    /// Active session IDs
    active_sessions: Mutex<HashSet<String>>,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new(sidecar_path: PathBuf) -> Self {
        Self {
            bridge: Mutex::new(AgentBridge::new()),
            sidecar_path,
            active_sessions: Mutex::new(HashSet::new()),
        }
    }

    /// Set the event callback for handling async events
    pub fn set_event_callback(&self, callback: EventCallback) {
        let mut bridge = self.bridge.lock();
        bridge.set_event_callback(callback);
    }

    /// Ensure the bridge is running
    fn ensure_running(&self) -> Result<()> {
        let mut bridge = self.bridge.lock();
        if !bridge.is_running() {
            let path = self.sidecar_path.to_str().unwrap_or("agent-bridge");
            bridge.spawn(path)?;
        }
        Ok(())
    }

    /// Check response for errors, returning Ok(()) on success
    fn check_response(response: CommandResponse) -> Result<()> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            _ => Ok(()),
        }
    }

    /// Check response for bool value
    fn check_response_bool(response: CommandResponse) -> Result<bool> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::Boolean { value, .. } => Ok(value),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for optional string value
    fn check_response_string(response: CommandResponse) -> Result<Option<String>> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::String { value, .. } => Ok(value),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for number value
    fn check_response_number(response: CommandResponse) -> Result<i64> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::Number { value, .. } => Ok(value),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for agent list
    fn check_response_agent_list(response: CommandResponse) -> Result<Vec<SubagentDefinition>> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::AgentList { agents, .. } => Ok(agents),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for single agent
    fn check_response_agent(response: CommandResponse) -> Result<Option<SubagentDefinition>> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::Agent { agent, .. } => Ok(agent),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for command list
    fn check_response_command_list(
        response: CommandResponse,
    ) -> Result<Vec<SlashCommandDefinition>> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::CommandList { commands, .. } => Ok(commands),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for single command
    fn check_response_command(response: CommandResponse) -> Result<Option<SlashCommandDefinition>> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::Command { command, .. } => Ok(command),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Check response for fork result
    fn check_response_fork_result(response: CommandResponse) -> Result<ForkSessionResult> {
        match response {
            CommandResponse::Error { error, .. } => Err(BridgeError::SidecarError(error)),
            CommandResponse::ForkResult { result, .. } => Ok(result),
            _ => Err(BridgeError::ReceiveError(
                "Unexpected response type".to_owned(),
            )),
        }
    }

    /// Create a new session
    pub fn create_session(&self, session_id: &str, config: Option<SessionConfig>) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::CreateSession {
            session_id: session_id.to_owned(),
            config,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)?;

        // Track session
        let _ = self.active_sessions.lock().insert(session_id.to_owned());

        Ok(())
    }

    /// Delete a session
    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        let request = BridgeRequest::DeleteSession {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        if bridge.is_running() {
            let response = bridge.send_request(&request)?;
            Self::check_response(response)?;
        }

        // Untrack session
        let _ = self.active_sessions.lock().remove(session_id);

        Ok(())
    }

    /// Send a message to a session
    pub fn send_message(
        &self,
        session_id: &str,
        message: &str,
        attachments: Option<Vec<AttachmentContentBlock>>,
    ) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::SendMessage {
            session_id: session_id.to_owned(),
            message: message.to_owned(),
            attachments,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Interrupt a session
    pub fn interrupt(&self, session_id: &str) -> Result<()> {
        let request = BridgeRequest::Interrupt {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        if bridge.is_running() {
            let response = bridge.send_request(&request)?;
            Self::check_response(response)?;
        }

        Ok(())
    }

    /// Respond to a permission request
    pub fn respond_to_permission(&self, response: PermissionResponse) -> Result<()> {
        let request = BridgeRequest::PermissionResponse { response };

        let bridge = self.bridge.lock();
        if bridge.is_running() {
            let resp = bridge.send_request(&request)?;
            Self::check_response(resp)?;
        }

        Ok(())
    }

    /// Set thinking mode for a session
    pub fn set_thinking_mode(
        &self,
        session_id: &str,
        enabled: bool,
        max_tokens: Option<u32>,
    ) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::SetThinkingMode {
            session_id: session_id.to_owned(),
            enabled,
            max_tokens,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Get thinking mode for a session
    pub fn get_thinking_mode(&self, session_id: &str) -> Result<bool> {
        self.ensure_running()?;

        let request = BridgeRequest::GetThinkingMode {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_bool(response)
    }

    /// Set model for a session
    pub fn set_model(&self, session_id: &str, model: Model) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::SetModel {
            session_id: session_id.to_owned(),
            model,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Set plan mode for a session
    pub fn set_plan_mode(&self, session_id: &str, enabled: bool) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::SetPlanMode {
            session_id: session_id.to_owned(),
            enabled,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Get plan mode for a session
    pub fn get_plan_mode(&self, session_id: &str) -> Result<bool> {
        self.ensure_running()?;

        let request = BridgeRequest::GetPlanMode {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_bool(response)
    }

    /// Set accept mode for a session
    pub fn set_accept_mode(&self, session_id: &str, enabled: bool) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::SetAcceptMode {
            session_id: session_id.to_owned(),
            enabled,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Get accept mode for a session
    pub fn get_accept_mode(&self, session_id: &str) -> Result<bool> {
        self.ensure_running()?;

        let request = BridgeRequest::GetAcceptMode {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_bool(response)
    }

    /// Check if a session is ready
    pub fn is_session_ready(&self, session_id: &str) -> Result<bool> {
        let bridge = self.bridge.lock();
        if !bridge.is_running() {
            return Ok(false);
        }

        let request = BridgeRequest::IsSessionReady {
            session_id: session_id.to_owned(),
        };

        let response = bridge.send_request(&request)?;
        Self::check_response_bool(response)
    }

    /// Get the SDK session ID
    pub fn get_sdk_session_id(&self, session_id: &str) -> Result<Option<String>> {
        let bridge = self.bridge.lock();
        if !bridge.is_running() {
            return Ok(None);
        }

        let request = BridgeRequest::GetSdkSessionId {
            session_id: session_id.to_owned(),
        };

        let response = bridge.send_request(&request)?;
        Self::check_response_string(response)
    }

    /// Check if a session exists
    pub fn has_session(&self, session_id: &str) -> bool {
        self.active_sessions.lock().contains(session_id)
    }

    /// Get all active session IDs
    pub fn get_active_sessions(&self) -> Vec<String> {
        self.active_sessions.lock().iter().cloned().collect()
    }

    // ========================================================================
    // Session Storage Operations
    // ========================================================================

    /// Get stored SDK session ID for resume functionality
    pub fn get_stored_session(&self, session_id: &str) -> Result<Option<String>> {
        self.ensure_running()?;

        let request = BridgeRequest::GetStoredSession {
            session_id: session_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_string(response)
    }

    /// Cleanup old sessions
    pub fn cleanup_sessions(&self, max_age_days: Option<u32>) -> Result<i64> {
        self.ensure_running()?;

        let request = BridgeRequest::CleanupSessions { max_age_days };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_number(response)
    }

    // ========================================================================
    // Agent Definition Operations
    // ========================================================================

    /// List all agents in workspace
    pub fn list_agents(&self, workspace_path: &str) -> Result<Vec<SubagentDefinition>> {
        self.ensure_running()?;

        let request = BridgeRequest::ListAgents {
            workspace_path: workspace_path.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_agent_list(response)
    }

    /// Get a single agent by name
    pub fn get_agent(
        &self,
        workspace_path: &str,
        name: &str,
    ) -> Result<Option<SubagentDefinition>> {
        self.ensure_running()?;

        let request = BridgeRequest::GetAgent {
            workspace_path: workspace_path.to_owned(),
            name: name.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_agent(response)
    }

    /// Create a new agent
    pub fn create_agent(
        &self,
        workspace_path: &str,
        agent: SubagentDefinition,
    ) -> Result<SubagentDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::CreateAgent {
            workspace_path: workspace_path.to_owned(),
            agent,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_agent(response)?
            .ok_or_else(|| BridgeError::SidecarError("Agent creation returned null".to_owned()))
    }

    /// Update an existing agent
    pub fn update_agent(
        &self,
        workspace_path: &str,
        original_name: &str,
        agent: SubagentDefinition,
    ) -> Result<SubagentDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::UpdateAgent {
            workspace_path: workspace_path.to_owned(),
            original_name: original_name.to_owned(),
            agent,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_agent(response)?
            .ok_or_else(|| BridgeError::SidecarError("Agent update returned null".to_owned()))
    }

    /// Delete an agent
    pub fn delete_agent(&self, workspace_path: &str, name: &str) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::DeleteAgent {
            workspace_path: workspace_path.to_owned(),
            name: name.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    // ========================================================================
    // Command Definition Operations
    // ========================================================================

    /// List all commands in workspace
    pub fn list_commands(&self, workspace_path: &str) -> Result<Vec<SlashCommandDefinition>> {
        self.ensure_running()?;

        let request = BridgeRequest::ListCommands {
            workspace_path: workspace_path.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_command_list(response)
    }

    /// Get a single command by name and scope
    pub fn get_command(
        &self,
        workspace_path: &str,
        name: &str,
        scope: CommandScope,
    ) -> Result<Option<SlashCommandDefinition>> {
        self.ensure_running()?;

        let request = BridgeRequest::GetCommand {
            workspace_path: workspace_path.to_owned(),
            name: name.to_owned(),
            scope,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_command(response)
    }

    /// Create a new command
    pub fn create_command(
        &self,
        workspace_path: &str,
        command: SlashCommandDefinition,
    ) -> Result<SlashCommandDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::CreateCommand {
            workspace_path: workspace_path.to_owned(),
            command,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_command(response)?
            .ok_or_else(|| BridgeError::SidecarError("Command creation returned null".to_owned()))
    }

    /// Update an existing command
    pub fn update_command(
        &self,
        workspace_path: &str,
        original_name: &str,
        command: SlashCommandDefinition,
    ) -> Result<SlashCommandDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::UpdateCommand {
            workspace_path: workspace_path.to_owned(),
            original_name: original_name.to_owned(),
            command,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_command(response)?
            .ok_or_else(|| BridgeError::SidecarError("Command update returned null".to_owned()))
    }

    /// Delete a command
    pub fn delete_command(
        &self,
        workspace_path: &str,
        name: &str,
        scope: CommandScope,
    ) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::DeleteCommand {
            workspace_path: workspace_path.to_owned(),
            name: name.to_owned(),
            scope,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    // ========================================================================
    // Fork and Generate Operations
    // ========================================================================

    /// Fork a session (create a checkpoint/branch)
    pub fn fork_session(
        &self,
        session_id: &str,
        options: Option<ForkSessionOptions>,
    ) -> Result<ForkSessionResult> {
        self.ensure_running()?;

        let request = BridgeRequest::ForkSession {
            session_id: session_id.to_owned(),
            options,
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_fork_result(response)
    }

    /// Rewind files to a specific checkpoint.
    /// This restores all files modified by Write, Edit, NotebookEdit tools
    /// to their state at the given checkpoint UUID.
    pub fn rewind_files(&self, session_id: &str, checkpoint_id: &str) -> Result<()> {
        self.ensure_running()?;

        let request = BridgeRequest::RewindFiles {
            session_id: session_id.to_owned(),
            checkpoint_id: checkpoint_id.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response(response)
    }

    /// Generate an agent definition from a natural language description
    pub fn generate_agent_definition(&self, description: &str) -> Result<SubagentDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::GenerateAgentDefinition {
            description: description.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_agent(response)?
            .ok_or_else(|| BridgeError::SidecarError("Generation returned null".to_owned()))
    }

    /// Generate a command definition from a natural language description
    pub fn generate_command_definition(&self, description: &str) -> Result<SlashCommandDefinition> {
        self.ensure_running()?;

        let request = BridgeRequest::GenerateCommandDefinition {
            description: description.to_owned(),
        };

        let bridge = self.bridge.lock();
        let response = bridge.send_request(&request)?;
        Self::check_response_command(response)?
            .ok_or_else(|| BridgeError::SidecarError("Generation returned null".to_owned()))
    }

    /// Shutdown the session manager
    pub fn shutdown(&self) -> Result<()> {
        let mut bridge = self.bridge.lock();
        bridge.shutdown()?;
        self.active_sessions.lock().clear();
        Ok(())
    }
}

/// Create a global session manager
pub fn create_session_manager(sidecar_path: PathBuf) -> Arc<SessionManager> {
    Arc::new(SessionManager::new(sidecar_path))
}
