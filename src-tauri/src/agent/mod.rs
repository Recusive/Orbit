//! Agent module for Claude Agent SDK integration
//!
//! This module provides a bridge to the Node.js sidecar that runs the Claude Agent SDK.
//!
//! # Architecture
//!
//! The agent module uses a sidecar pattern where a Node.js process runs the Claude Agent SDK
//! and communicates with the Rust backend via stdin/stdout JSON IPC.
//!
//! - [`bridge`] - Low-level IPC with the Node.js sidecar
//! - [`protocol`] - Message types for IPC communication
//! - [`session`] - High-level session management API

// Internal IPC types - not a public library API
#![expect(clippy::exhaustive_enums, reason = "internal IPC protocol types")]

pub mod bridge;
pub mod credential_bridge;
pub mod protocol;
pub mod session;

pub use bridge::AgentBridge;
pub use credential_bridge::CredentialBridge;
pub use protocol::*;
pub use session::SessionManager;
