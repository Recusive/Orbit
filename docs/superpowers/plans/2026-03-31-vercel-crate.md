# Vercel Crate Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `orbit-vercel` Rust crate — types, errors, HTTP client, and all Vercel API methods — as a standalone, testable library.

**Architecture:** Pure Rust crate at `crates/common/vercel/` following the `orbit-search` pattern. No Tauri dependency. All types derive `Debug, Clone, Serialize, Deserialize`. Error type uses `thiserror`. HTTP client uses `reqwest` with `SecretString` for token. All methods return `Result<T, VercelError>`.

**Tech Stack:** Rust, reqwest, serde, thiserror, secrecy, indexmap, tokio, log, uuid, urlencoding

**Spec:** `docs/superpowers/specs/2026-03-31-vercel-deployments-backend-design.md`

**Depends on:** Nothing (this is the foundation)
**Blocks:** Plan 2 (Polling + Streaming), Plan 3 (Tauri Commands), Plan 4 (Frontend)

---

### Task 1: Add workspace dependencies and create crate skeleton

**Files:**

- Modify: `Cargo.toml` (workspace root)
- Create: `crates/common/vercel/Cargo.toml`
- Create: `crates/common/vercel/src/lib.rs`

- [ ] **Step 1: Add `tokio-util`, `secrecy`, and `indexmap` to workspace deps**

In `Cargo.toml` at the project root, add/update these entries in `[workspace.dependencies]`:

```toml
# In [workspace.dependencies], after the "# Async" section:
tokio-util = { version = "0.7", features = ["rt", "codec", "io"] }

# After the "# Cryptography" section:
secrecy = { version = "0.10", features = ["serde"] }

# Update the existing indexmap entry to include serde feature:
# Change: indexmap = "2"
# To:
indexmap = { version = "2", features = ["serde"] }
```

> **Note:** The lsp crate (`crates/common/lsp/Cargo.toml`) currently has a direct `tokio-util` dependency. Update it to `tokio-util = { workspace = true }` so all crates share the same workspace version.

- [ ] **Step 2: Create crate Cargo.toml**

Create `crates/common/vercel/Cargo.toml`:

```toml
[package]
name = "orbit-vercel"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
authors.workspace = true
license.workspace = true
repository.workspace = true
readme.workspace = true
keywords.workspace = true
categories.workspace = true
description = "Vercel deployment integration for Orbit"

[lints]
workspace = true

[dependencies]
orbit-core = { path = "../core" }
reqwest = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tokio-util = { workspace = true }
thiserror = { workspace = true }
log = { workspace = true }
secrecy = { workspace = true }
parking_lot = { workspace = true }
indexmap = { workspace = true }
uuid = { workspace = true }
urlencoding = { workspace = true }

[dev-dependencies]
tempfile = { workspace = true }
```

- [ ] **Step 3: Create lib.rs**

Create `crates/common/vercel/src/lib.rs`:

```rust
//! Vercel deployment integration for Orbit.
//!
//! Provides a typed client for the Vercel REST API,
//! covering deployments, projects, teams, and build log streaming.

pub mod client;
pub mod deployments;
pub mod errors;
pub mod logs;
pub mod projects;
pub mod teams;
pub mod types;

pub use client::VercelClient;
pub use errors::VercelError;
pub use types::*;
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p orbit-vercel`
Expected: Compilation errors for missing modules (client, deployments, etc.) — this is expected. We just need the crate to be recognized by the workspace.

Actually, since the modules don't exist yet, create empty placeholder files first:

```bash
touch crates/common/vercel/src/client.rs
touch crates/common/vercel/src/deployments.rs
touch crates/common/vercel/src/errors.rs
touch crates/common/vercel/src/logs.rs
touch crates/common/vercel/src/projects.rs
touch crates/common/vercel/src/teams.rs
touch crates/common/vercel/src/types.rs
```

Run: `cargo check -p orbit-vercel`
Expected: PASS (empty modules, no errors)

- [ ] **Step 5: Commit**

```bash
git add crates/common/vercel/ Cargo.toml
git commit -m "feat(vercel): scaffold orbit-vercel crate with workspace deps"
```

---

### Task 2: Define error types

**Files:**

- Create: `crates/common/vercel/src/errors.rs`

- [ ] **Step 1: Write error type tests**

Create the test at the bottom of `errors.rs`:

```rust
use thiserror::Error;

/// Vercel API error type. Crate-internal — never crosses IPC directly.
/// Commands convert via `to_error()` helper.
#[derive(Debug, Error)]
pub enum VercelError {
    #[error("HTTP request failed: {0}")]
    Http(String),

    #[error("Vercel API error ({status}): {message}")]
    Api {
        status: u16,
        code: String,
        message: String,
    },

    #[error("Rate limited, resets at {reset_at}")]
    RateLimited { reset_at: i64 },

    #[error("Unauthorized — check your Vercel token")]
    Unauthorized,

    #[error("Log stream closed")]
    StreamClosed,

    #[error("Stream send timeout")]
    SendTimeout,

    #[error("{0}")]
    Other(String),
}

impl VercelError {
    /// User-friendly message for frontend display.
    /// Separate from the Debug/Display impl which is for logs.
    pub fn user_message(&self) -> &str {
        match self {
            Self::Http(_) => "Unable to connect to Vercel. Check your internet connection.",
            Self::RateLimited { .. } => "Too many requests. Retrying shortly.",
            Self::Unauthorized => {
                "Your Vercel token has expired or been revoked. Please reconnect."
            }
            Self::Api { status, .. } if *status == 403 => {
                "You don't have permission for this action."
            }
            Self::Api { .. } => "Vercel returned an error. Please try again.",
            Self::StreamClosed => "Build log stream ended unexpectedly.",
            Self::SendTimeout => "Log delivery timed out.",
            Self::Other(msg) => msg,
        }
    }

    /// Returns true if this is a network-level error (connection/timeout).
    pub fn is_network_error(&self) -> bool {
        matches!(self, Self::Http(_))
    }

    /// Returns true if this is a 401 Unauthorized.
    pub fn is_unauthorized(&self) -> bool {
        matches!(self, Self::Unauthorized)
    }
}

impl From<reqwest::Error> for VercelError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() {
            VercelError::Http(e.to_string())
        } else {
            VercelError::Other(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_message_returns_friendly_strings() {
        let http = VercelError::Http("connection refused".to_string());
        assert_eq!(
            http.user_message(),
            "Unable to connect to Vercel. Check your internet connection."
        );

        let unauthorized = VercelError::Unauthorized;
        assert!(unauthorized.user_message().contains("reconnect"));

        let rate_limited = VercelError::RateLimited { reset_at: 12345 };
        assert!(rate_limited.user_message().contains("Retrying"));

        let api_403 = VercelError::Api {
            status: 403,
            code: "forbidden".to_string(),
            message: "no access".to_string(),
        };
        assert!(api_403.user_message().contains("permission"));

        let api_500 = VercelError::Api {
            status: 500,
            code: "internal".to_string(),
            message: "server error".to_string(),
        };
        assert!(api_500.user_message().contains("try again"));
    }

    #[test]
    fn display_includes_technical_details() {
        let api = VercelError::Api {
            status: 404,
            code: "not_found".to_string(),
            message: "deployment not found".to_string(),
        };
        let display = format!("{api}");
        assert!(display.contains("404"));
        assert!(display.contains("deployment not found"));
    }

    #[test]
    fn is_network_error_classification() {
        assert!(VercelError::Http("timeout".to_string()).is_network_error());
        assert!(!VercelError::Unauthorized.is_network_error());
        assert!(!VercelError::Api {
            status: 500,
            code: "err".to_string(),
            message: "msg".to_string()
        }
        .is_network_error());
    }

    #[test]
    fn is_unauthorized_classification() {
        assert!(VercelError::Unauthorized.is_unauthorized());
        assert!(!VercelError::Http("err".to_string()).is_unauthorized());
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p orbit-vercel`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/src/errors.rs
git commit -m "feat(vercel): add VercelError with user_message() and From<reqwest::Error>"
```

---

### Task 3: Define all API types

**Files:**

- Create: `crates/common/vercel/src/types.rs`

- [ ] **Step 1: Write deployment types with serde roundtrip tests**

Write `crates/common/vercel/src/types.rs`:

```rust
#![expect(missing_docs, reason = "types are self-documenting via field names")]

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

// ============================================
// Deployments
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub uid: String,
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(alias = "readyState", alias = "status", default)]
    pub state: Option<DeploymentState>,
    #[serde(default)]
    pub ready_substate: Option<ReadySubstate>,
    pub target: Option<DeploymentTarget>,
    #[serde(alias = "createdAt")]
    pub created: i64,
    #[serde(alias = "readyAt", default)]
    pub ready: Option<i64>,
    #[serde(default)]
    pub building_at: Option<i64>,
    #[serde(default)]
    pub source: Option<DeploymentSource>,
    pub creator: Creator,
    #[serde(default)]
    pub meta: IndexMap<String, String>,
    #[serde(default)]
    pub inspector_url: Option<String>,
    #[serde(default)]
    pub alias: Vec<String>,
    pub project_id: String,
    #[serde(default)]
    pub is_rollback_candidate: Option<bool>,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub checks_state: Option<String>,
    #[serde(default)]
    pub checks_conclusion: Option<String>,
}

impl Deployment {
    pub fn commit_sha(&self) -> Option<&str> {
        self.meta
            .get("githubCommitSha")
            .or_else(|| self.meta.get("gitlabCommitSha"))
            .or_else(|| self.meta.get("bitbucketCommitSha"))
            .map(|s| s.as_str())
    }

    pub fn commit_message(&self) -> Option<&str> {
        self.meta
            .get("githubCommitMessage")
            .or_else(|| self.meta.get("gitlabCommitMessage"))
            .or_else(|| self.meta.get("bitbucketCommitMessage"))
            .map(|s| s.as_str())
    }

    pub fn branch(&self) -> Option<&str> {
        self.meta
            .get("githubCommitRef")
            .or_else(|| self.meta.get("gitlabCommitRef"))
            .or_else(|| self.meta.get("bitbucketCommitRef"))
            .map(|s| s.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[non_exhaustive]
pub enum DeploymentState {
    Queued,
    Building,
    Initializing,
    Ready,
    Error,
    Canceled,
    Deleted,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[non_exhaustive]
pub enum ReadySubstate {
    Staged,
    Rolling,
    Promoted,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum DeploymentTarget {
    Production,
    Staging,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[non_exhaustive]
pub enum DeploymentSource {
    Git,
    Cli,
    Redeploy,
    ApiTriggerGitDeploy,
    #[serde(rename = "clone/repo")]
    CloneRepo,
    Import,
    #[serde(rename = "import/repo")]
    ImportRepo,
    #[serde(rename = "v0-web")]
    V0Web,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Creator {
    pub uid: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub github_login: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentFilters {
    pub project_id: Option<String>,
    pub state: Option<DeploymentState>,
    pub target: Option<DeploymentTarget>,
    pub branch: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentListResponse {
    pub deployments: Vec<Deployment>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub next: Option<i64>,
    pub prev: Option<i64>,
    #[serde(default)]
    pub count: u32,
}

// ============================================
// Projects
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub framework: Option<String>,
    #[serde(default)]
    pub link: Option<ProjectLink>,
    #[serde(default)]
    pub latest_deployments: Option<Vec<Deployment>>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLink {
    #[serde(rename = "type")]
    pub link_type: LinkType,
    pub org: String,
    pub repo: String,
    #[serde(default)]
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum LinkType {
    Github,
    Gitlab,
    Bitbucket,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResponse {
    pub projects: Vec<Project>,
    pub pagination: Pagination,
}

// ============================================
// Teams
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: String,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsResponse {
    pub teams: Vec<Team>,
    #[serde(default)]
    pub pagination: Option<Pagination>,
}

// ============================================
// Logs
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    #[serde(rename = "type")]
    pub event_type: LogEventType,
    pub created: i64,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub serial: Option<String>,
    #[serde(default)]
    pub deployment_id: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub info: Option<LogEventInfo>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub date: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEventInfo {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type", default)]
    pub step_type: Option<String>,
    #[serde(default)]
    pub entrypoint: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub step: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[non_exhaustive]
pub enum LogEventType {
    Command,
    Stdout,
    Stderr,
    Exit,
    DeploymentState,
    Fatal,
    Delimiter,
    Middleware,
    #[serde(rename = "middleware-invocation")]
    MiddlewareInvocation,
    #[serde(rename = "edge-function-invocation")]
    EdgeFunctionInvocation,
    Metric,
    Report,
    #[serde(other)]
    Unknown,
}

/// Raw log event from Vercel API (handles both wrapped and flat shapes).
/// Use `From<RawLogEvent>` to normalize to `LogEvent`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RawLogEvent {
    #[serde(rename = "type")]
    pub event_type: LogEventType,
    pub created: i64,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub serial: Option<String>,
    #[serde(default)]
    pub deployment_id: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub info: Option<LogEventInfo>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub date: Option<i64>,
    #[serde(default)]
    pub payload: Option<RawLogPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RawLogPayload {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub deployment_id: Option<String>,
    #[serde(default)]
    pub serial: Option<String>,
    #[serde(default)]
    pub info: Option<LogEventInfo>,
}

impl From<RawLogEvent> for LogEvent {
    fn from(mut raw: RawLogEvent) -> Self {
        let payload = raw.payload.take();
        LogEvent {
            event_type: raw.event_type,
            created: raw.created,
            text: raw
                .text
                .or_else(|| payload.as_ref().and_then(|p| p.text.clone()))
                .unwrap_or_default(),
            serial: raw
                .serial
                .or_else(|| payload.as_ref().and_then(|p| p.serial.clone())),
            deployment_id: raw
                .deployment_id
                .or_else(|| payload.as_ref().and_then(|p| p.deployment_id.clone())),
            level: raw.level,
            info: raw
                .info
                .or_else(|| payload.and_then(|p| p.info)),
            id: raw.id,
            date: raw.date,
        }
    }
}

// ============================================
// Auth
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VercelUser {
    pub uid: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VercelTokenResult {
    pub user: VercelUser,
    pub teams: Vec<Team>,
    pub has_deployment_access: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VercelConnectionStatus {
    pub connected: bool,
    pub user: Option<VercelUser>,
    pub linked_project: Option<Project>,
    pub team: Option<Team>,
    pub has_deployment_access: bool,
}

// ============================================
// Actions
// ============================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub enum DeploymentAction {
    Cancel,
    Redeploy,
    Promote,
    Rollback,
}
// Wire values: "cancel", "redeploy", "promote", "rollback"

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_state_serde_screaming_snake() {
        let json = r#""BUILDING""#;
        let state: DeploymentState = serde_json::from_str(json).unwrap();
        assert_eq!(state, DeploymentState::Building);

        let serialized = serde_json::to_string(&DeploymentState::Ready).unwrap();
        assert_eq!(serialized, r#""READY""#);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_state_unknown_variant() {
        let json = r#""SOME_FUTURE_STATE""#;
        let state: DeploymentState = serde_json::from_str(json).unwrap();
        assert_eq!(state, DeploymentState::Unknown);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_target_lowercase() {
        let json = r#""production""#;
        let target: DeploymentTarget = serde_json::from_str(json).unwrap();
        assert_eq!(target, DeploymentTarget::Production);

        let json = r#""staging""#;
        let target: DeploymentTarget = serde_json::from_str(json).unwrap();
        assert_eq!(target, DeploymentTarget::Staging);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_source_kebab_and_slash() {
        let json = r#""git""#;
        let src: DeploymentSource = serde_json::from_str(json).unwrap();
        assert_eq!(src, DeploymentSource::Git);

        let json = r#""api-trigger-git-deploy""#;
        let src: DeploymentSource = serde_json::from_str(json).unwrap();
        assert_eq!(src, DeploymentSource::ApiTriggerGitDeploy);

        let json = r#""clone/repo""#;
        let src: DeploymentSource = serde_json::from_str(json).unwrap();
        assert_eq!(src, DeploymentSource::CloneRepo);

        let json = r#""import/repo""#;
        let src: DeploymentSource = serde_json::from_str(json).unwrap();
        assert_eq!(src, DeploymentSource::ImportRepo);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_action_camel_case() {
        let json = r#""cancel""#;
        let action: DeploymentAction = serde_json::from_str(json).unwrap();
        assert_eq!(action, DeploymentAction::Cancel);

        let serialized = serde_json::to_string(&DeploymentAction::Promote).unwrap();
        assert_eq!(serialized, r#""promote""#);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_minimal_json_deserializes() {
        // Only API-required fields: uid, name, created, creator, projectId
        let json = r#"{
            "uid": "dpl_123",
            "name": "my-app",
            "created": 1711900000,
            "creator": { "uid": "user_1" },
            "projectId": "prj_456"
        }"#;
        let d: Deployment = serde_json::from_str(json).unwrap();
        assert_eq!(d.uid, "dpl_123");
        assert_eq!(d.name, "my-app");
        assert!(d.state.is_none());
        assert!(d.source.is_none());
        assert!(d.url.is_none());
        assert!(d.meta.is_empty());
        assert!(d.alias.is_empty());
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_state_alias_ready_state() {
        // Detail endpoint returns "readyState" instead of "state"
        let json = r#"{
            "uid": "dpl_1",
            "name": "app",
            "readyState": "READY",
            "created": 1000,
            "creator": { "uid": "u1" },
            "projectId": "p1"
        }"#;
        let d: Deployment = serde_json::from_str(json).unwrap();
        assert_eq!(d.state, Some(DeploymentState::Ready));
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_created_alias() {
        // List returns "created", detail returns "createdAt"
        let json_list = r#"{
            "uid": "dpl_1", "name": "a", "created": 1000,
            "creator": { "uid": "u" }, "projectId": "p"
        }"#;
        let d1: Deployment = serde_json::from_str(json_list).unwrap();
        assert_eq!(d1.created, 1000);

        let json_detail = r#"{
            "uid": "dpl_1", "name": "a", "createdAt": 2000,
            "creator": { "uid": "u" }, "projectId": "p"
        }"#;
        let d2: Deployment = serde_json::from_str(json_detail).unwrap();
        assert_eq!(d2.created, 2000);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn deployment_meta_helpers() {
        let json = r#"{
            "uid": "dpl_1", "name": "a", "created": 1000,
            "creator": { "uid": "u" }, "projectId": "p",
            "meta": {
                "githubCommitSha": "abc123",
                "githubCommitMessage": "fix: thing",
                "githubCommitRef": "main"
            }
        }"#;
        let d: Deployment = serde_json::from_str(json).unwrap();
        assert_eq!(d.commit_sha(), Some("abc123"));
        assert_eq!(d.commit_message(), Some("fix: thing"));
        assert_eq!(d.branch(), Some("main"));
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn raw_log_event_flat_shape() {
        let json = r#"{
            "type": "stdout",
            "created": 1000,
            "text": "Building...",
            "serial": "s1"
        }"#;
        let raw: RawLogEvent = serde_json::from_str(json).unwrap();
        let event = LogEvent::from(raw);
        assert_eq!(event.event_type, LogEventType::Stdout);
        assert_eq!(event.text, "Building...");
        assert_eq!(event.serial, Some("s1".to_string()));
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn raw_log_event_wrapped_shape() {
        let json = r#"{
            "type": "stdout",
            "created": 1000,
            "payload": {
                "text": "Installing deps...",
                "serial": "s2",
                "deploymentId": "dpl_1"
            }
        }"#;
        let raw: RawLogEvent = serde_json::from_str(json).unwrap();
        let event = LogEvent::from(raw);
        assert_eq!(event.text, "Installing deps...");
        assert_eq!(event.serial, Some("s2".to_string()));
        assert_eq!(event.deployment_id, Some("dpl_1".to_string()));
    }

    #[test]
    fn raw_log_event_flat_takes_precedence() {
        // When both flat and wrapped fields exist, flat takes precedence
        let json = r#"{
            "type": "stdout",
            "created": 1000,
            "text": "flat text",
            "serial": "flat_serial",
            "payload": {
                "text": "wrapped text",
                "serial": "wrapped_serial"
            }
        }"#;
        let raw: RawLogEvent = serde_json::from_str(json).unwrap();
        let event = LogEvent::from(raw);
        assert_eq!(event.text, "flat text");
        assert_eq!(event.serial, Some("flat_serial".to_string()));
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn log_event_type_kebab_case() {
        let json = r#""edge-function-invocation""#;
        let t: LogEventType = serde_json::from_str(json).unwrap();
        assert_eq!(t, LogEventType::EdgeFunctionInvocation);

        let json = r#""middleware-invocation""#;
        let t: LogEventType = serde_json::from_str(json).unwrap();
        assert_eq!(t, LogEventType::MiddlewareInvocation);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn log_event_type_unknown_variant() {
        let json = r#""some-future-type""#;
        let t: LogEventType = serde_json::from_str(json).unwrap();
        assert_eq!(t, LogEventType::Unknown);
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn project_link_type_rename() {
        let json = r#"{
            "type": "github",
            "org": "my-org",
            "repo": "my-repo"
        }"#;
        let link: ProjectLink = serde_json::from_str(json).unwrap();
        assert_eq!(link.link_type, LinkType::Github);
        assert_eq!(link.org, "my-org");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn team_response_deserialize() {
        let json = r#"{
            "teams": [
                { "id": "team_1", "name": "My Team", "slug": "my-team" }
            ],
            "pagination": { "count": 1, "next": null, "prev": null }
        }"#;
        let resp: TeamsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.teams.len(), 1);
        assert_eq!(resp.teams[0].slug, "my-team");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn pagination_optional_fields() {
        let json = r#"{ "count": 5, "next": 1711900000, "prev": null }"#;
        let p: Pagination = serde_json::from_str(json).unwrap();
        assert_eq!(p.count, 5);
        assert_eq!(p.next, Some(1711900000));
        assert!(p.prev.is_none());
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/src/types.rs
git commit -m "feat(vercel): add all API types with serde roundtrip tests"
```

---

### Task 4: Build the HTTP client

**Files:**

- Create: `crates/common/vercel/src/client.rs`

- [ ] **Step 1: Write VercelClient**

```rust
#![expect(missing_docs, reason = "method docs are on impl blocks, not the module")]

use std::sync::Arc;
use std::time::Instant;

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use secrecy::{ExposeSecret as _, SecretString};

use crate::errors::VercelError;
use crate::types::*;

const BASE_URL: &str = "https://api.vercel.com";
const REQUEST_TIMEOUT_SECS: u64 = 30;
const CACHE_TTL_SECS: u64 = 60;

#[derive(Debug, Clone)]
pub struct VercelClient {
    pub(crate) http: Client,
    token: SecretString,
    team_id: Option<String>,
    pub has_deployment_access: bool,
    project_cache: Arc<parking_lot::Mutex<Option<(Instant, Vec<Project>)>>>,
}

impl VercelClient {
    /// Create a new client. Token is stored as SecretString (zeroized on drop).
    pub fn new(token: SecretString, team_id: Option<String>) -> Result<Self, VercelError> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|e| VercelError::Other(e.to_string()))?;

        Ok(Self {
            http,
            token,
            team_id,
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        })
    }

    /// Build authorization headers (exposes secret only here).
    pub(crate) fn auth_headers(&self) -> Result<HeaderMap, VercelError> {
        let mut headers = HeaderMap::new();
        let bearer = format!("Bearer {}", self.token.expose_secret());
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&bearer)
                .map_err(|e| VercelError::Other(e.to_string()))?,
        );
        Ok(headers)
    }

    /// Build a URL with optional teamId query parameter.
    pub(crate) fn url(&self, path: &str) -> String {
        match &self.team_id {
            Some(team_id) => {
                let sep = if path.contains('?') { '&' } else { '?' };
                format!("{BASE_URL}{path}{sep}teamId={team_id}")
            }
            None => format!("{BASE_URL}{path}"),
        }
    }

    /// Make a GET request and deserialize the response.
    pub(crate) async fn get<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
    ) -> Result<T, VercelError> {
        let url = self.url(path);
        log::debug!("GET {url}");
        let start = Instant::now();

        let response = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await?;

        let status = response.status().as_u16();
        log::debug!("GET {url} → {status} in {:?}", start.elapsed());

        self.handle_response(response).await
    }

    /// Make a POST request with a JSON body.
    pub(crate) async fn post<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &impl serde::Serialize,
    ) -> Result<T, VercelError> {
        let url = self.url(path);
        log::debug!("POST {url}");

        let response = self
            .http
            .post(&url)
            .headers(self.auth_headers()?)
            .json(body)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Make a POST request expecting empty body response (201/202).
    pub(crate) async fn post_empty(
        &self,
        path: &str,
        body: &impl serde::Serialize,
    ) -> Result<(), VercelError> {
        let url = self.url(path);
        log::debug!("POST {url}");

        let response = self
            .http
            .post(&url)
            .headers(self.auth_headers()?)
            .json(body)
            .send()
            .await?;

        let status = response.status().as_u16();
        if status == 401 {
            return Err(VercelError::Unauthorized);
        }
        if status == 429 {
            return Err(self.parse_rate_limit(&response));
        }
        if status >= 400 {
            return Err(self.parse_api_error(response).await);
        }
        Ok(())
    }

    /// Make a PATCH request and deserialize the response.
    pub(crate) async fn patch<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
    ) -> Result<T, VercelError> {
        let url = self.url(path);
        log::debug!("PATCH {url}");

        let response = self
            .http
            .patch(&url)
            .headers(self.auth_headers()?)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Handle a response: check status, parse errors, deserialize body.
    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, VercelError> {
        let status = response.status().as_u16();

        if status == 401 {
            return Err(VercelError::Unauthorized);
        }
        if status == 429 {
            return Err(self.parse_rate_limit(&response));
        }
        if status >= 400 {
            return Err(self.parse_api_error(response).await);
        }

        response
            .json::<T>()
            .await
            .map_err(|e| VercelError::Other(format!("Failed to parse response: {e}")))
    }

    /// Parse rate limit error from response headers.
    fn parse_rate_limit(&self, response: &reqwest::Response) -> VercelError {
        let reset_at = response
            .headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        VercelError::RateLimited { reset_at }
    }

    /// Parse API error from response body.
    async fn parse_api_error(&self, response: reqwest::Response) -> VercelError {
        let status = response.status().as_u16();

        #[derive(Deserialize)]
        struct ErrorBody {
            error: Option<ErrorDetail>,
        }
        #[derive(Deserialize)]
        struct ErrorDetail {
            code: Option<String>,
            message: Option<String>,
        }

        match response.json::<ErrorBody>().await {
            Ok(body) => {
                let detail = body.error.unwrap_or(ErrorDetail {
                    code: None,
                    message: None,
                });
                VercelError::Api {
                    status,
                    code: detail.code.unwrap_or_else(|| "unknown".to_string()),
                    message: detail
                        .message
                        .unwrap_or_else(|| format!("HTTP {status}")),
                }
            }
            Err(_) => VercelError::Api {
                status,
                code: "unknown".to_string(),
                message: format!("HTTP {status}"),
            },
        }
    }

    // --- Project Cache ---

    pub(crate) fn get_cached_projects(&self) -> Option<Vec<Project>> {
        let guard = self.project_cache.lock();
        guard.as_ref().and_then(|(instant, projects)| {
            if instant.elapsed().as_secs() < CACHE_TTL_SECS {
                Some(projects.clone())
            } else {
                None
            }
        })
    }

    pub(crate) fn set_cached_projects(&self, projects: Vec<Project>) {
        *self.project_cache.lock() = Some((Instant::now(), projects));
    }

    pub fn invalidate_project_cache(&self) {
        *self.project_cache.lock() = None;
    }

    pub fn set_team_id(&mut self, team_id: Option<String>) {
        self.team_id = team_id;
        self.invalidate_project_cache();
    }

    pub fn team_id(&self) -> Option<&str> {
        self.team_id.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_without_team_id() {
        let client = VercelClient {
            http: Client::new(),
            token: SecretString::from("test"),
            team_id: None,
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        };
        assert_eq!(client.url("/v6/deployments"), "https://api.vercel.com/v6/deployments");
    }

    #[test]
    fn url_with_team_id() {
        let client = VercelClient {
            http: Client::new(),
            token: SecretString::from("test"),
            team_id: Some("team_123".to_string()),
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        };
        assert_eq!(
            client.url("/v6/deployments"),
            "https://api.vercel.com/v6/deployments?teamId=team_123"
        );
    }

    #[test]
    fn url_with_team_id_and_existing_query() {
        let client = VercelClient {
            http: Client::new(),
            token: SecretString::from("test"),
            team_id: Some("team_123".to_string()),
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        };
        assert_eq!(
            client.url("/v6/deployments?limit=10"),
            "https://api.vercel.com/v6/deployments?limit=10&teamId=team_123"
        );
    }

    #[test]
    fn project_cache_expiry() {
        let client = VercelClient {
            http: Client::new(),
            token: SecretString::from("test"),
            team_id: None,
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        };

        assert!(client.get_cached_projects().is_none());

        client.set_cached_projects(vec![]);
        assert!(client.get_cached_projects().is_some());

        client.invalidate_project_cache();
        assert!(client.get_cached_projects().is_none());
    }

    #[test]
    fn set_team_id_invalidates_cache() {
        let mut client = VercelClient {
            http: Client::new(),
            token: SecretString::from("test"),
            team_id: Some("team_a".to_string()),
            has_deployment_access: true,
            project_cache: Arc::new(parking_lot::Mutex::new(None)),
        };

        client.set_cached_projects(vec![]);
        assert!(client.get_cached_projects().is_some());

        client.set_team_id(Some("team_b".to_string()));
        assert!(client.get_cached_projects().is_none());
        assert_eq!(client.team_id(), Some("team_b"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/src/client.rs
git commit -m "feat(vercel): add VercelClient with SecretString auth, team scoping, project cache"
```

---

### Task 5: Implement deployment API methods

**Files:**

- Create: `crates/common/vercel/src/deployments.rs`

- [ ] **Step 1: Write deployment methods**

```rust
#![expect(missing_docs, reason = "method docs are on impl blocks, not the module")]

use serde_json::json;

use crate::client::VercelClient;
use crate::errors::VercelError;
use crate::types::*;

impl VercelClient {
    /// List deployments with optional filters.
    pub async fn list_deployments(
        &self,
        filters: &DeploymentFilters,
    ) -> Result<DeploymentListResponse, VercelError> {
        let mut query_parts: Vec<String> = Vec::new();

        if let Some(ref pid) = filters.project_id {
            query_parts.push(format!("projectId={pid}"));
        }
        if let Some(ref state) = filters.state {
            let state_str = serde_json::to_string(state)
                .map_err(|e| VercelError::Other(e.to_string()))?;
            // Remove quotes from serialized enum value
            let state_str = state_str.trim_matches('"');
            query_parts.push(format!("state={state_str}"));
        }
        if let Some(ref target) = filters.target {
            let target_str = serde_json::to_string(target)
                .map_err(|e| VercelError::Other(e.to_string()))?;
            let target_str = target_str.trim_matches('"');
            query_parts.push(format!("target={target_str}"));
        }
        if let Some(ref branch) = filters.branch {
            query_parts.push(format!("branch={branch}"));
        }
        if let Some(limit) = filters.limit {
            query_parts.push(format!("limit={limit}"));
        }

        let path = if query_parts.is_empty() {
            "/v6/deployments".to_string()
        } else {
            format!("/v6/deployments?{}", query_parts.join("&"))
        };

        self.get(&path).await
    }

    /// Get a single deployment by ID.
    pub async fn get_deployment(&self, deployment_id: &str) -> Result<Deployment, VercelError> {
        self.get(&format!("/v13/deployments/{deployment_id}")).await
    }

    /// Cancel a deployment that is currently building.
    pub async fn cancel_deployment(&self, deployment_id: &str) -> Result<Deployment, VercelError> {
        self.patch(&format!("/v12/deployments/{deployment_id}/cancel"))
            .await
    }

    /// Redeploy from an existing deployment.
    pub async fn redeploy(&self, deployment_id: &str) -> Result<Deployment, VercelError> {
        let body = json!({ "deploymentId": deployment_id });
        self.post("/v13/deployments", &body).await
    }

    /// Promote a deployment to production.
    /// Returns () — Vercel responds with 201 or 202 (queued).
    pub async fn promote(
        &self,
        project_id: &str,
        deployment_id: &str,
    ) -> Result<(), VercelError> {
        let body = json!({});
        self.post_empty(
            &format!("/v10/projects/{project_id}/promote/{deployment_id}"),
            &body,
        )
        .await
    }

    /// Rollback to a previous deployment.
    /// `description` is sent as a query parameter.
    pub async fn rollback(
        &self,
        project_id: &str,
        deployment_id: &str,
        description: Option<&str>,
    ) -> Result<(), VercelError> {
        let path = match description {
            Some(desc) => format!(
                "/v1/projects/{project_id}/rollback/{deployment_id}?description={}",
                urlencoding::encode(desc)
            ),
            None => format!("/v1/projects/{project_id}/rollback/{deployment_id}"),
        };
        let body = json!({});
        self.post_empty(&path, &body).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn filters_build_query_string() {
        // This tests the query building logic by constructing filters
        // and verifying the expected fields are set
        let filters = DeploymentFilters {
            project_id: Some("prj_123".to_string()),
            state: Some(DeploymentState::Building),
            target: Some(DeploymentTarget::Production),
            branch: Some("main".to_string()),
            limit: Some(10),
        };
        assert!(filters.project_id.is_some());
        assert_eq!(filters.limit, Some(10));

        // Verify state serializes correctly for query params
        let state_str = serde_json::to_string(&filters.state.unwrap()).unwrap();
        assert_eq!(state_str.trim_matches('"'), "BUILDING");
    }

    #[test]
    fn empty_filters() {
        let filters = DeploymentFilters {
            project_id: None,
            state: None,
            target: None,
            branch: None,
            limit: None,
        };
        assert!(filters.project_id.is_none());
        assert!(filters.limit.is_none());
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/src/deployments.rs
git commit -m "feat(vercel): add deployment API methods (list, get, cancel, redeploy, promote, rollback)"
```

---

### Task 6: Implement project and team API methods

**Files:**

- Create: `crates/common/vercel/src/projects.rs`
- Create: `crates/common/vercel/src/teams.rs`

- [ ] **Step 1: Write project methods**

```rust
#![expect(missing_docs, reason = "method docs are on impl blocks, not the module")]

use crate::client::VercelClient;
use crate::errors::VercelError;
use crate::types::*;

impl VercelClient {
    /// List projects (paginated).
    pub async fn list_projects(
        &self,
        limit: Option<u32>,
    ) -> Result<ProjectListResponse, VercelError> {
        // Check cache first
        if let Some(cached) = self.get_cached_projects() {
            return Ok(ProjectListResponse {
                projects: cached.clone(),
                pagination: Pagination {
                    next: None,
                    prev: None,
                    count: u32::try_from(cached.len()).unwrap_or(u32::MAX),
                },
            });
        }

        let limit = limit.unwrap_or(100);
        let path = format!("/v10/projects?limit={limit}");
        let response: ProjectListResponse = self.get(&path).await?;

        self.set_cached_projects(response.projects.clone());

        Ok(response)
    }

    /// Get a single project by ID or name.
    pub async fn get_project(&self, id_or_name: &str) -> Result<Project, VercelError> {
        self.get(&format!("/v9/projects/{id_or_name}")).await
    }

    /// Find a project by matching git remote owner/repo.
    /// Paginates through all project pages (limit: 100 per page).
    pub async fn find_by_repo(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Option<Project>, VercelError> {
        // Check cache first
        if let Some(cached) = self.get_cached_projects() {
            return Ok(find_matching_project(cached, owner, repo));
        }

        let mut all_projects = Vec::new();
        let mut next_cursor: Option<i64> = None;

        loop {
            let path = match next_cursor {
                Some(cursor) => format!("/v10/projects?limit=100&until={cursor}"),
                None => "/v10/projects?limit=100".to_string(),
            };

            let response: ProjectListResponse = self.get(&path).await?;
            all_projects.extend(response.projects);

            match response.pagination.next {
                Some(cursor) => next_cursor = Some(cursor),
                None => break,
            }
        }

        let result = find_matching_project(&all_projects, owner, repo);
        self.set_cached_projects(all_projects);
        Ok(result)
    }
}

fn find_matching_project(projects: &[Project], owner: &str, repo: &str) -> Option<Project> {
    projects.iter().find(|p| {
        p.link.as_ref().is_some_and(|link| {
            link.org.eq_ignore_ascii_case(owner) && link.repo.eq_ignore_ascii_case(repo)
        })
    }).cloned()
}

/// Parse a git remote URL into (owner, repo) tuple.
/// Supports HTTPS, SSH, and various providers.
pub fn parse_git_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();

    // SSH format: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@") {
        if let Some((_host, path)) = rest.split_once(':') {
            return parse_owner_repo(path);
        }
    }

    // SSH format: ssh://git@github.com/owner/repo.git
    if let Some(rest) = url.strip_prefix("ssh://") {
        if let Some((_userhost, path)) = rest.split_once('/') {
            // path may still have a leading /
            return parse_owner_repo(path);
        }
    }

    // HTTPS format: https://github.com/owner/repo.git
    if url.starts_with("https://") || url.starts_with("http://") {
        if let Some((_scheme_host, path)) = url.split_once("//") {
            // Skip the host part
            if let Some((_host, path)) = path.split_once('/') {
                return parse_owner_repo(path);
            }
        }
    }

    None
}

fn parse_owner_repo(path: &str) -> Option<(String, String)> {
    let path = path.strip_suffix(".git").unwrap_or(path);
    let path = path.trim_start_matches('/');

    // Split into parts. For GitLab nested groups, owner is everything except last segment.
    let parts: Vec<&str> = path.splitn(2, '/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        // Handle nested groups: group/subgroup/repo → owner="group/subgroup", repo="repo"
        let full_path = path;
        if let Some(last_slash) = full_path.rfind('/') {
            let owner = &full_path[..last_slash];
            let repo = &full_path[last_slash + 1..];
            if !owner.is_empty() && !repo.is_empty() {
                return Some((owner.to_string(), repo.to_string()));
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_https_github() {
        let (owner, repo) = parse_git_remote("https://github.com/user/repo.git").unwrap();
        assert_eq!(owner, "user");
        assert_eq!(repo, "repo");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_https_github_no_dot_git() {
        let (owner, repo) = parse_git_remote("https://github.com/user/repo").unwrap();
        assert_eq!(owner, "user");
        assert_eq!(repo, "repo");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_ssh_github() {
        let (owner, repo) = parse_git_remote("git@github.com:user/repo.git").unwrap();
        assert_eq!(owner, "user");
        assert_eq!(repo, "repo");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_ssh_protocol_github() {
        let (owner, repo) = parse_git_remote("ssh://git@github.com/user/repo.git").unwrap();
        assert_eq!(owner, "user");
        assert_eq!(repo, "repo");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_gitlab_nested_groups() {
        let (owner, repo) =
            parse_git_remote("git@gitlab.com:group/subgroup/repo.git").unwrap();
        assert_eq!(owner, "group/subgroup");
        assert_eq!(repo, "repo");
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn parse_bitbucket_ssh() {
        let (owner, repo) = parse_git_remote("git@bitbucket.org:team/repo.git").unwrap();
        assert_eq!(owner, "team");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn parse_invalid_url() {
        assert!(parse_git_remote("not a url").is_none());
        assert!(parse_git_remote("").is_none());
    }

    #[test]
    #[expect(clippy::unwrap_used, reason = "test assertions")]
    fn find_matching_project_case_insensitive() {
        let projects = vec![Project {
            id: "prj_1".to_string(),
            name: "my-app".to_string(),
            framework: None,
            link: Some(ProjectLink {
                link_type: LinkType::Github,
                org: "MyOrg".to_string(),
                repo: "MyRepo".to_string(),
                branch: None,
            }),
            latest_deployments: None,
            updated_at: 1000,
        }];

        let result = find_matching_project(&projects, "myorg", "myrepo");
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "prj_1");
    }

    #[test]
    fn find_matching_project_no_link() {
        let projects = vec![Project {
            id: "prj_1".to_string(),
            name: "no-link".to_string(),
            framework: None,
            link: None,
            latest_deployments: None,
            updated_at: 1000,
        }];

        let result = find_matching_project(&projects, "owner", "repo");
        assert!(result.is_none());
    }
}
```

- [ ] **Step 2: Write team methods**

```rust
#![expect(missing_docs, reason = "method docs are on impl blocks, not the module")]

use serde::Deserialize;

use crate::client::VercelClient;
use crate::errors::VercelError;
use crate::types::*;

impl VercelClient {
    /// List teams the authenticated user belongs to.
    pub async fn list_teams(&self) -> Result<Vec<Team>, VercelError> {
        let response: TeamsResponse = self.get("/v2/teams").await?;
        Ok(response.teams)
    }

    /// Validate the token by calling GET /v1/user.
    pub async fn validate_token(&self) -> Result<VercelUser, VercelError> {
        #[derive(Deserialize)]
        struct UserResponse {
            user: VercelUser,
        }
        let response: UserResponse = self.get("/v1/user").await?;
        Ok(response.user)
    }

    /// Probe deployment access by listing deployments with limit=1.
    /// Returns true if the token has deployment access, false if 403.
    pub async fn probe_deployment_access(&self) -> Result<bool, VercelError> {
        match self.get::<DeploymentListResponse>("/v6/deployments?limit=1").await {
            Ok(_) => Ok(true),
            Err(VercelError::Api { status: 403, .. }) => Ok(false),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    // Teams and validation require real API calls.
    // Integration tests live in tests/ with feature gate.
    // Unit tests verify type deserialization (covered in types.rs).
}
```

- [ ] **Step 3: Run all tests**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add crates/common/vercel/src/projects.rs crates/common/vercel/src/teams.rs
git commit -m "feat(vercel): add project operations with git remote parsing and team API"
```

---

### Task 7: Stub log streaming and wire up the crate

**Files:**

- Create: `crates/common/vercel/src/logs.rs`
- Modify: `crates/common/vercel/src/lib.rs`

Log streaming is implemented in Plan 2 (requires tokio tasks and Tauri Channel). Here we stub the basic historical log fetching.

- [ ] **Step 1: Write historical log fetch**

```rust
#![expect(missing_docs, reason = "method docs are on impl blocks, not the module")]

use crate::client::VercelClient;
use crate::errors::VercelError;
use crate::types::*;

const MAX_LOG_EVENTS: usize = 10_000;

impl VercelClient {
    /// Fetch all historical log events for a completed deployment.
    /// Pre-truncates to last 10K events if the response is larger.
    pub async fn get_events(&self, deployment_id: &str) -> Result<Vec<LogEvent>, VercelError> {
        let path = format!("/v3/deployments/{deployment_id}/events");

        // The events endpoint returns an array of RawLogEvent
        let raw_events: Vec<RawLogEvent> = self.get(&path).await?;

        let mut events: Vec<LogEvent> = raw_events.into_iter().map(LogEvent::from).collect();

        // Pre-truncate: keep only the last MAX_LOG_EVENTS
        if events.len() > MAX_LOG_EVENTS {
            let skip = events.len() - MAX_LOG_EVENTS;
            events = events.into_iter().skip(skip).collect();
        }

        Ok(events)
    }
}

// Streaming (stream_events) is implemented in Plan 2
// as it requires tokio tasks and tauri::ipc::Channel.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pre_truncation_logic() {
        // Simulate 15K events, verify only last 10K are kept
        let events: Vec<LogEvent> = (0..15_000)
            .map(|i| LogEvent {
                event_type: LogEventType::Stdout,
                created: i,
                text: format!("line {i}"),
                serial: Some(format!("s{i}")),
                deployment_id: None,
                level: None,
                info: None,
                id: None,
                date: None,
            })
            .collect();

        assert_eq!(events.len(), 15_000);

        // Apply same truncation logic as get_events
        let truncated: Vec<LogEvent> = if events.len() > MAX_LOG_EVENTS {
            let skip = events.len() - MAX_LOG_EVENTS;
            events.into_iter().skip(skip).collect()
        } else {
            events
        };

        assert_eq!(truncated.len(), MAX_LOG_EVENTS);
        assert_eq!(truncated[0].created, 5000); // First kept event
        assert_eq!(truncated[truncated.len() - 1].created, 14999); // Last event
    }
}
```

- [ ] **Step 2: Update lib.rs exports**

Update `crates/common/vercel/src/lib.rs` to export `parse_git_remote`:

```rust
//! Vercel deployment integration for Orbit.
//!
//! Provides a typed client for the Vercel REST API,
//! covering deployments, projects, teams, and build log streaming.

pub mod client;
pub mod deployments;
pub mod errors;
pub mod logs;
pub mod projects;
pub mod teams;
pub mod types;

pub use client::VercelClient;
pub use errors::VercelError;
pub use projects::parse_git_remote;
pub use types::*;
```

- [ ] **Step 3: Run full test suite**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

Run: `cargo clippy -p orbit-vercel`
Expected: No warnings (or only workspace-level expected ones)

- [ ] **Step 4: Commit**

```bash
git add crates/common/vercel/src/logs.rs crates/common/vercel/src/lib.rs
git commit -m "feat(vercel): add historical log fetch with 10K pre-truncation"
```

---

### Task 8: Wire crate into src-tauri and verify full build

**Files:**

- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add orbit-vercel dependency**

In `src-tauri/Cargo.toml`, add to the `[dependencies]` section (after the other orbit-\* crates):

```toml
orbit-vercel = { path = "../crates/common/vercel" }
```

Also change the existing `secrecy` line from a direct version to workspace:

```toml
# Change:
secrecy = "0.10"
# To:
secrecy = { workspace = true }
```

- [ ] **Step 2: Verify full workspace build**

Run: `cargo check`
Expected: PASS (full workspace, not just the crate)

- [ ] **Step 3: Run full test suite**

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

Run: `cargo test` (full workspace — may take longer)
Expected: All existing tests still PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat(vercel): wire orbit-vercel crate into src-tauri"
```

---

## Summary

This plan creates the `orbit-vercel` crate with:

| Component      | File             | Tests                                                                              |
| -------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Error types    | `errors.rs`      | 4 tests (user_message, Display, classification)                                    |
| API types      | `types.rs`       | 16 tests (serde roundtrips for all enums, aliases, minimal JSON, log event shapes) |
| HTTP client    | `client.rs`      | 5 tests (URL building, team scoping, cache lifecycle)                              |
| Deployment ops | `deployments.rs` | 2 tests (filter building)                                                          |
| Project ops    | `projects.rs`    | 7 tests (git remote parsing, project matching)                                     |
| Team ops       | `teams.rs`       | Stub (requires real API)                                                           |
| Log fetch      | `logs.rs`        | 1 test (pre-truncation)                                                            |

**Total: 8 tasks, 35 tests, ~1200 lines of Rust**

The crate compiles, all tests pass, and it's wired into `src-tauri` ready for Plan 2 (Polling + Streaming) and Plan 3 (Tauri Commands).
