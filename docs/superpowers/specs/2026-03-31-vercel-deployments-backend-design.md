# Vercel Deployments Backend Infrastructure

**Date:** 2026-03-31
**Status:** Final draft (revised after 3 review cycles — 20 agents total)
**Scope:** Backend infrastructure only — Rust crate, Tauri commands, frontend data layer. UI is deferred (settings UI contract in Section 9).

## Overview

Add a Vercel integration to Orbit that lets users view deployments, stream build logs, cancel builds, redeploy, promote, and rollback — all from within the app. The backend communicates directly with the Vercel REST API (no CLI dependency). Credentials are stored per-workspace inside the existing encrypted credential system. All Vercel API calls go through the Rust backend (`reqwest`), not the frontend — no CSP changes are needed.

## Decisions

| Decision                        | Choice                                                            | Rationale                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth method                     | Personal Access Token now, OAuth later                            | OAuth API permissions are in Vercel private beta (confirmed March 2026). Tokens work today. Alternative: register as a Vercel Integration (provides `deployment` scope today) but requires marketplace publishing. |
| API calls location              | Rust backend (`crates/common/vercel/`)                            | Matches existing crate pattern. Credentials stay in Rust. Testable with `cargo test`.                                                                                                                              |
| Architecture                    | Vercel crate + thin Tauri command layer                           | Same separation as all other Orbit domain crates.                                                                                                                                                                  |
| Credential scope                | Per-workspace, stored in existing `StoredCredentials`             | Users may have personal + work Vercel accounts. Reuses existing AES-256-GCM encryption, process-level Mutex lock, and version field.                                                                               |
| Project linking                 | Auto-detect from git remote, manual fallback                      | Zero-config when possible. Falls back to project picker.                                                                                                                                                           |
| Real-time updates               | Adaptive polling + streaming logs                                 | Polling at 5s during builds, 60s idle. Streaming via `follow=1`.                                                                                                                                                   |
| Destructive action confirmation | Confirm promote and rollback                                      | Both are production-affecting. Cancel/redeploy on preview fire immediately.                                                                                                                                        |
| Log delivery                    | `tauri::ipc::Channel<T>` for log batches, Tauri events for status | Channel is new to Orbit — first use. Provides ordered, high-throughput, per-invocation streaming. Events for broadcast status.                                                                                     |
| Team context                    | Resolve after token validation                                    | Vercel API scopes ops via `?teamId=`. Without it, team users see zero projects.                                                                                                                                    |
| State architecture              | Single `RwLock<VercelStateInner>`                                 | Eliminates multi-lock deadlock risk. Fields change together infrequently.                                                                                                                                          |
| Logging                         | `log` crate (`log::info!`, `log::warn!`, etc.)                    | Matches codebase — routes through `tauri-plugin-log`. NOT `tracing`.                                                                                                                                               |
| Command return type             | `Result<T, String>` with `map_err(to_error)`                      | Matches `lifecycle.rs` (largest command module, 40+ commands). Spec uses `to_error` helper.                                                                                                                        |

## v1 Scope

| Operation             | Included | Vercel Endpoint                                         |
| --------------------- | -------- | ------------------------------------------------------- |
| List deployments      | Yes      | `GET /v6/deployments`                                   |
| Deployment details    | Yes      | `GET /v13/deployments/{id}`                             |
| Stream build logs     | Yes      | `GET /v3/deployments/{id}/events?follow=1`              |
| Cancel deployment     | Yes      | `PATCH /v12/deployments/{id}/cancel`                    |
| Redeploy              | Yes      | `POST /v13/deployments` with `deploymentId` in body     |
| Promote               | Yes      | `POST /v10/projects/{projectId}/promote/{deploymentId}` |
| Rollback              | Yes      | `POST /v1/projects/{projectId}/rollback/{deploymentId}` |
| List projects         | Yes      | `GET /v10/projects`                                     |
| List teams            | Yes      | `GET /v2/teams`                                         |
| Environment variables | No (v2)  | —                                                       |
| Delete deployment     | No (v2)  | —                                                       |
| File-based deploy     | No (v2)  | —                                                       |

**Note:** Promote returns HTTP 201 or 202 (promotion may be queued/async) with empty body; send `{}` as request body. Accept both as success. Rollback returns HTTP 201 with empty body; `description` is a **query parameter** (not request body).

---

## 1. Credential Storage

### 1.1 Storage

Vercel credentials are stored inside the existing `StoredCredentials` struct in `~/.orbit/credentials.enc`. A new field stores per-workspace credentials:

```rust
pub vercel_credentials: Option<HashMap<String, VercelWorkspaceCredential>>,
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VercelWorkspaceCredential {
    pub token: String,                    // encrypted at rest, SecretString in memory
    pub team_id: Option<String>,          // persisted team selection
}
```

The HashMap key is the canonical workspace path (`std::fs::canonicalize`). This inherits all existing protections: AES-256-GCM encryption, machine-specific key derivation, process-level Mutex lock (not filesystem lock — see Section 10 note 7), version field for migration.

**Backward compatibility:** Adding `Option<HashMap<...>>` to `StoredCredentials` is safe — serde deserializes missing fields as `None`. Verified by existing backward-compat test pattern (`stored_credentials_backwards_compatible_without_preference`). Add a new test covering the four-to-five field transition.

**Token in memory:** `VercelClient` holds the token as `secrecy::SecretString` (zeroized on drop). Exposed only at HTTP header construction via `expose_secret()`.

**Token transmission discipline:** Plaintext token passes through Tauri IPC exactly once during `vercel_store_token`. NEVER logged — only `token[..8]` for correlation. Frontend clears from React state immediately after `invoke()`. Zustand stores never hold the raw token.

### 1.2 Validation and Team Resolution

1. User enters Vercel Personal Access Token in settings
2. `vercel_store_token` validates via `GET /v1/user`
3. **Access probe:** Call `GET /v6/deployments?limit=1` — if 403, token lacks deployment access. Surface as `has_deployment_access: bool` (not `read_only` — the probe tests resource access, not read-vs-write). Note: PATs don't have fine-grained read/write scopes today. When OAuth graduates with finer scopes, this probe will need updating.
4. **Team resolution:** Call `GET /v2/teams` to get user's team list:
   - **Zero teams (Hobby plan):** Skip team selection. `team_id` stays `None`. All API calls target personal scope. Frontend shows username in team slot, not a picker.
   - **One team:** Auto-select it.
   - **Multiple teams:** Return the list. Frontend shows team picker. Auto-detection is deferred until team is selected.
5. Token + team_id encrypted and stored as `VercelWorkspaceCredential`
6. Token loaded on workspace open

### 1.3 Token Revalidation on App Restart

On workspace open, after loading the encrypted token:

1. Call `GET /v1/user` as a background fire-and-forget task (does not block workspace init)
2. If 200: construct `VercelClient`, set connected state
3. If 401: do NOT construct client. Emit `vercel:needs_revalidation`. Frontend shows "reconnect" prompt instead of false-positive connected state
4. If network error: construct client optimistically (token may still be valid). First poll will surface any issues

### 1.4 401 Lifecycle (Token Revocation)

When any API call returns 401 Unauthorized:

1. Stop the poller immediately
2. Stop all active log streams
3. Clear `VercelStateInner.client` to `None`
4. Emit `vercel:auth_revoked` event
5. Do NOT delete the encrypted credential (could be transient Vercel incident). Mark as "needs revalidation"

One 401 is sufficient — auth failures are not transient. This applies everywhere: poller, log streaming, actions, AND log stream reconnection (Section 4.6 — reconnection short-circuits on 401 instead of counting it as a retry failure).

### 1.5 Tauri Commands (Credential)

| Command              | Signature                                                             | Output                                   |
| -------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `vercel_store_token` | `app: AppHandle, state: State<'_, Arc<VercelState>>, token: String`   | `Result<VercelTokenResult, String>`      |
| `vercel_get_status`  | `state: State<'_, Arc<VercelState>>`                                  | `Result<VercelConnectionStatus, String>` |
| `vercel_disconnect`  | `app: AppHandle, state: State<'_, Arc<VercelState>>`                  | `Result<(), String>`                     |
| `vercel_select_team` | `app: AppHandle, state: State<'_, Arc<VercelState>>, team_id: String` | `Result<(), String>`                     |

`vercel_select_team` validates `team_id` is not empty (rejects with error if so). Performs a full teardown before switching: (1) stop poller, (2) clear deployment store (emit `vercel:deployments_cleared`), (3) stop log streams, (4) invalidate project cache, (5) update `team_id` on client, (6) re-run auto-detection with new team context, (7) if project found, restart poller.

### 1.6 Future OAuth Path

When Vercel graduates OAuth API permissions:

1. Bind local HTTP server on `127.0.0.1` (not `localhost` — avoids DNS rebinding) with random port
2. Construct auth URL with actual bound port as redirect URI
3. PKCE (S256). **Caveat:** Vercel integration OAuth requires `client_secret`. "Sign In with Vercel" supports PKCE without secret but lacks API permissions (private beta). Likely path: register as Vercel Integration.
4. Verify `state` parameter in callback (CSRF protection)
5. 120-second timeout on listener. No `SO_REUSEPORT`.
6. Access token: 1 hour (refresh before expiry). Refresh token: 30 days (rotates on use, requires `offline_access` scope).

---

## 2. Vercel API Client Crate

**Location:** `crates/common/vercel/`

```
crates/common/vercel/
├── Cargo.toml
├── src/
│   ├── lib.rs            # Public re-exports
│   ├── client.rs         # VercelClient
│   ├── types.rs          # All request/response types
│   ├── errors.rs         # VercelError enum
│   ├── deployments.rs    # Deployment CRUD
│   ├── projects.rs       # Project operations
│   ├── teams.rs          # Team operations
│   ├── logs.rs           # Build log streaming
│   └── polling.rs        # DeploymentPoller
```

**Dependencies** (all `{ workspace = true }` — add `tokio-util` and `secrecy` to `[workspace.dependencies]` in root `Cargo.toml` if not present):

- `reqwest` (with `stream` feature), `serde` + `serde_json`, `tokio`, `thiserror`, `log`, `secrecy`, `parking_lot`, `indexmap`
- `tokio-util` (for `CancellationToken`) — add `tokio-util = { version = "0.7", features = ["rt"] }` to workspace deps

### 2.1 VercelClient

```rust
#[derive(Debug)]
pub struct VercelClient {
    http: reqwest::Client,          // reuses connections via internal pool
    token: SecretString,            // zeroized on drop
    team_id: Option<String>,
    has_deployment_access: bool,
    project_cache: Option<(Instant, Vec<Project>)>,  // 60s TTL, dropped with client
}
```

- `Authorization: Bearer <token>` via `expose_secret()` at header construction only.
- Appends `?teamId={team_id}` when `Some`.
- Reads `X-RateLimit-Remaining` from response headers.
- On 401: returns `VercelError::Unauthorized` — caller handles lifecycle.
- Base URL: `https://api.vercel.com`. Default TLS verification (no `danger_accept_invalid_certs`).

### 2.2 Deployment Operations (`deployments.rs`)

| Method     | Endpoint                                                | Input                                                  | Output                     |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------ | -------------------------- |
| `list`     | `GET /v6/deployments`                                   | `DeploymentFilters`                                    | `DeploymentListResponse`   |
| `get`      | `GET /v13/deployments/{id}`                             | `deployment_id`                                        | `Deployment`               |
| `cancel`   | `PATCH /v12/deployments/{id}/cancel`                    | `deployment_id`                                        | `Deployment`               |
| `redeploy` | `POST /v13/deployments`                                 | `deployment_id` (as `deploymentId` in body)            | `Deployment`               |
| `promote`  | `POST /v10/projects/{projectId}/promote/{deploymentId}` | `project_id, deployment_id`                            | `()` (202, send `{}` body) |
| `rollback` | `POST /v1/projects/{projectId}/rollback/{deploymentId}` | `project_id, deployment_id, description: Option<&str>` | `()` (201)                 |

**Stale-state actions:** When cancel returns error because deployment finished, map to user-friendly message. Trigger immediate poll after action response (not concurrently — see Section 3.5).

### 2.3 Project Operations (`projects.rs`)

| Method         | Endpoint                        | Input                | Output                            |
| -------------- | ------------------------------- | -------------------- | --------------------------------- |
| `list`         | `GET /v10/projects`             | `limit: Option<u32>` | `ProjectListResponse` (paginated) |
| `get`          | `GET /v9/projects/{id}`         | `id_or_name`         | `Project`                         |
| `find_by_repo` | `GET /v10/projects` (paginated) | `owner, repo`        | `Option<Project>`                 |

`find_by_repo` paginates through all pages (`limit: 100` per page). Uses the project cache on `VercelClient` (60s TTL). Cache is invalidated on `vercel_select_team` and dropped with the client on disconnect.

### 2.4 Team Operations (`teams.rs`)

| Method | Endpoint        | Input | Output                                              |
| ------ | --------------- | ----- | --------------------------------------------------- |
| `list` | `GET /v2/teams` | —     | `Vec<Team>` (first page; most users have 1-3 teams) |

### 2.5 Build Log Streaming (`logs.rs`)

| Method          | Endpoint                                                     | Input                                                        | Output                    |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------- |
| `stream_events` | `GET /v3/deployments/{id}/events?follow=1&direction=forward` | `deployment_id, channel: tauri::ipc::Channel<Vec<LogEvent>>` | `Result<(), VercelError>` |
| `get_events`    | `GET /v3/deployments/{id}/events`                            | `deployment_id`                                              | `Vec<LogEvent>`           |

**Streaming protocol:** Vercel sends `application/stream+json` — newline-delimited JSON. Each line is a `RawLogEvent` (handles both wrapped `payload.text` and flat shapes). Normalized to `LogEvent` via `From<RawLogEvent>` (moves fields, no cloning since `raw` is consumed).

**Batching:** Events accumulated into `Vec<LogEvent>`, flushed directly through `tauri::ipc::Channel` every 100ms or 50 lines. No intermediate `mpsc` channel — the Channel IS the delivery mechanism (Channel.send() is non-blocking from Rust's perspective; it serializes and posts to the webview).

**Historical log pre-truncation:** `get_events` returns all logs. If the result exceeds 10,000 entries, Rust pre-truncates to the last 10K before sending to the frontend. This prevents dumping 50K+ monorepo build logs to the frontend only to immediately discard 40K.

### 2.6 Types (`types.rs`)

All types derive `#[derive(Debug, Clone, Serialize, Deserialize)]`. Enums additionally derive `Copy, PartialEq, Eq` and use `#[non_exhaustive]`.

```rust
// --- Deployments ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub uid: String,
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,                   // null for incomplete (still uploading) deployments
    #[serde(alias = "readyState", alias = "status", default)]
    pub state: Option<DeploymentState>,        // list: "state", detail: "readyState"/"status"; not required by API
    #[serde(default)]
    pub ready_substate: Option<ReadySubstate>,
    pub target: Option<DeploymentTarget>,      // nullable (null = preview)
    #[serde(alias = "createdAt")]
    pub created: i64,
    #[serde(alias = "readyAt", default)]
    pub ready: Option<i64>,
    #[serde(default)]
    pub building_at: Option<i64>,
    #[serde(default)]
    pub source: Option<DeploymentSource>,      // not required by API
    pub creator: Creator,
    #[serde(default)]
    pub meta: IndexMap<String, String>,        // not required by API; ordered map avoids iter_over_hash_type lint
    #[serde(default)]
    pub inspector_url: Option<String>,
    #[serde(default)]
    pub alias: Vec<String>,
    pub project_id: String,
    #[serde(default)]
    pub is_rollback_candidate: Option<bool>,   // only in list response, not detail
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub checks_state: Option<String>,
    #[serde(default)]
    pub checks_conclusion: Option<String>,
}
// API required fields: created, creator, inspectorUrl, name, projectId, type, uid, url.
// All other fields use #[serde(default)] for safe deserialization.

// Well-known meta keys for git-connected deployments:
// githubCommitSha, githubCommitMessage, githubCommitRef, githubOrg, githubRepo
// gitlabCommitSha, gitlabCommitMessage, gitlabCommitRef
// bitbucketCommitSha, etc.
impl Deployment {
    pub fn commit_sha(&self) -> Option<&str> { /* check github/gitlab/bitbucket meta keys */ }
    pub fn commit_message(&self) -> Option<&str> { /* same pattern */ }
    pub fn branch(&self) -> Option<&str> { /* same pattern */ }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[non_exhaustive]
pub enum DeploymentState {
    Queued, Building, Initializing, Ready, Error, Canceled,
    Deleted, // only in list response, not detail
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[non_exhaustive]
pub enum ReadySubstate { Staged, Rolling, Promoted, #[serde(other)] Unknown }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum DeploymentTarget { Production, Staging, #[serde(other)] Unknown }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[non_exhaustive]
pub enum DeploymentSource {
    Git, Cli, Redeploy, ApiTriggerGitDeploy,
    #[serde(rename = "clone/repo")] CloneRepo,
    Import,
    #[serde(rename = "import/repo")] ImportRepo,
    #[serde(rename = "v0-web")] V0Web,
    #[serde(other)] Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Creator {
    pub uid: String,
    #[serde(default)] pub email: Option<String>,
    #[serde(default)] pub username: Option<String>,
    #[serde(default)] pub github_login: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentFilters {
    pub project_id: Option<String>,
    pub state: Option<DeploymentState>,       // API accepts single string, not array
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
    pub count: u32,
}

// --- Projects ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default)] pub framework: Option<String>,
    #[serde(default)] pub link: Option<ProjectLink>,
    #[serde(default)] pub latest_deployments: Option<Vec<Deployment>>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLink {
    #[serde(rename = "type")] pub link_type: LinkType,
    pub org: String,
    pub repo: String,
    #[serde(default)] pub branch: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum LinkType { Github, Gitlab, Bitbucket, #[serde(other)] Unknown }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResponse { pub projects: Vec<Project>, pub pagination: Pagination }

// --- Teams ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team { pub id: String, pub name: String, pub slug: String }

// --- Logs ---
// Vercel log events have two shapes (wrapped payload and flat).
// RawLogEvent handles both; From<RawLogEvent> normalizes to LogEvent by moving (not cloning).

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    #[serde(rename = "type")] pub event_type: LogEventType,
    pub created: i64,
    #[serde(default)] pub text: String,
    #[serde(default)] pub serial: Option<String>,     // for reconnection deduplication
    #[serde(default)] pub deployment_id: Option<String>,
    #[serde(default)] pub level: Option<String>,       // "error" / "warning"
    #[serde(default)] pub info: Option<LogEventInfo>,
    #[serde(default)] pub id: Option<String>,          // event ID
    #[serde(default)] pub date: Option<i64>,           // alternate timestamp
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEventInfo {
    #[serde(default)] pub name: Option<String>,
    #[serde(rename = "type", default)] pub step_type: Option<String>,
    #[serde(default)] pub entrypoint: Option<String>,
    #[serde(default)] pub path: Option<String>,
    #[serde(default)] pub step: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[non_exhaustive]
pub enum LogEventType {
    Command, Stdout, Stderr, Exit, DeploymentState, Fatal, Delimiter,
    Middleware,
    #[serde(rename = "middleware-invocation")] MiddlewareInvocation,
    #[serde(rename = "edge-function-invocation")] EdgeFunctionInvocation,
    Metric, Report,
    #[serde(other)] Unknown,
}

// RawLogEvent and From<RawLogEvent> impl handle both shapes.
// The From impl destructures and moves fields (no cloning) since raw is consumed.
// See previous revision for full implementation.

// --- Auth ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VercelUser {
    pub uid: String,
    #[serde(default)] pub email: Option<String>,
    #[serde(default)] pub username: Option<String>,
    #[serde(default)] pub name: Option<String>,
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

// --- Actions ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub enum DeploymentAction { Cancel, Redeploy, Promote, Rollback }
// Wire values: "cancel", "redeploy", "promote", "rollback" (camelCase = lowercase for single words)
// Frontend Zod: z.enum(["cancel", "redeploy", "promote", "rollback"])
```

### 2.7 Errors (`errors.rs`)

`VercelError` is crate-internal — never crosses IPC. Commands convert via `to_error` helper (`.map_err(to_error)`).

```rust
#[derive(Debug, thiserror::Error)]
pub enum VercelError {
    #[error("HTTP request failed: {0}")]
    Http(String),                    // from reqwest::Error, not raw reqwest::Error (not Serialize)

    #[error("Vercel API error ({status}): {message}")]
    Api { status: u16, code: String, message: String },

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
    /// User-friendly message for frontend display (not the Debug/Display impl).
    pub fn user_message(&self) -> &str {
        match self {
            Self::Http(_) => "Unable to connect to Vercel. Check your internet connection.",
            Self::RateLimited { .. } => "Too many requests. Retrying shortly.",
            Self::Unauthorized => "Your Vercel token has expired or been revoked. Please reconnect.",
            Self::Api { status, .. } if *status == 403 => "You don't have permission for this action.",
            Self::Api { .. } => "Vercel returned an error. Please try again.",
            Self::StreamClosed => "Build log stream ended unexpectedly.",
            Self::SendTimeout => "Log delivery timed out.",
            Self::Other(msg) => msg,
        }
    }
}

impl From<reqwest::Error> for VercelError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() { VercelError::Http(e.to_string()) }
        else { VercelError::Other(e.to_string()) }
    }
}
```

Commands send `user_message()` to the frontend and `Display` format to logs.

---

## 3. Polling Manager (`polling.rs`)

### 3.1 Core Struct

```rust
pub struct DeploymentPoller {
    cancel: CancellationToken,
    poll_now: tokio::sync::Notify,          // for immediate poll after actions
    handle: Option<JoinHandle<()>>,
    project_id: String,
}

struct PollerState {
    previous_states: HashMap<String, DeploymentState>,  // for diff detection only
    active_count: usize,
    last_successful_poll: Instant,
    last_updated_at: i64,                   // epoch ms, exposed to frontend
    interval: Duration,
    consecutive_failures: u32,
}
```

`previous_states` stores deployment-id → state for diff detection (~76 bytes per deployment). After each poll, entries not in the current response are pruned to prevent stale comparisons.

### 3.2 Adaptive Interval Logic

Interval re-evaluated **after each poll response** (post-poll evaluation).

| Condition                            | Interval   | Filters                                              |
| ------------------------------------ | ---------- | ---------------------------------------------------- |
| `active_count > 0` (BUILDING/QUEUED) | 5 seconds  | `limit: 10, state: [BUILDING, QUEUED, INITIALIZING]` |
| Last build finished < 5 minutes ago  | 15 seconds | `limit: 20`                                          |
| Page visible, nothing building       | 60 seconds | `limit: 20`                                          |
| Page not visible                     | No polling | —                                                    |

Minimum 1-second floor on sleep duration (prevents instant-failure loops after macOS sleep/wake).

### 3.3 Network Error Recovery

| Error Type                            | Behavior                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `VercelError::Http` (network/timeout) | Backoff: 5s → 10s → 20s → 60s → 120s. After 10 consecutive failures, stop and emit `vercel:polling_suspended`. |
| `VercelError::Unauthorized` (401)     | Stop immediately. Trigger 401 lifecycle (Section 1.4).                                                         |
| `VercelError::Api` (4xx/5xx)          | Log, continue at current interval. Emit `vercel:polling_error` with `user_message()`.                          |
| First success after failures          | Reset `consecutive_failures` to 0, restore normal interval.                                                    |

### 3.4 Poller Loop

```rust
loop {
    tokio::select! {
        _ = cancel.cancelled() => break,                    // graceful shutdown
        _ = poll_now.notified() => { /* immediate poll */ },
        _ = tokio::time::sleep(interval) => { /* regular poll */ },
    }
    // acquire state read lock, clone client, drop lock
    // make HTTP call
    // acquire state write lock, update previous_states, compute diffs, drop lock
    // emit events AFTER lock is released
}
```

### 3.5 Lifecycle

| Event                                  | Action                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| User opens deployments view            | `vercel_start_polling` — **idempotent**: stop existing poller first, then start new.                                     |
| User navigates away                    | `vercel_stop_polling` — cancels via `CancellationToken`.                                                                 |
| User triggers action (cancel/redeploy) | Action command returns → then calls `poller.poll_now.notify_one()`. Poll fires AFTER action completes, not concurrently. |
| Workspace closes                       | `Drop` impl cancels and aborts.                                                                                          |

### 3.6 Events

| Event                             | Payload                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `vercel:deployments_updated`      | `{ deployments, last_updated_at }`                        |
| `vercel:deployment_state_changed` | `{ deployment_id, old_state, new_state }`                 |
| `vercel:new_deployment`           | `{ deployment }` (not in previous poll — teammate pushed) |
| `vercel:polling_error`            | `{ message }` (user-friendly via `user_message()`)        |
| `vercel:polling_suspended`        | `{ consecutive_failures }`                                |

**Critical:** State lock released BEFORE emitting events. Pattern: lock → update → compute diffs → release → emit.

### 3.7 Drop

```rust
impl Drop for DeploymentPoller {
    fn drop(&mut self) {
        self.cancel.cancel();       // cooperative shutdown (primary)
        if let Some(handle) = self.handle.take() {
            handle.abort();         // safety net
        }
    }
}
```

---

## 4. Build Log Streaming

### 4.1 Flow

```
User opens deployment detail
  → useVercelLogStream hook mounts
  → invoke('vercel_stream_logs', { deploymentId, onEvent: channel })
  → Rust enforces single stream (aborts any existing)
  → Spawns tokio task with CancellationToken
  → reqwest opens HTTP stream (application/stream+json)
  → RawLogEvent → LogEvent normalization (move, not clone)
  → batches: flush every 100ms or 50 lines
  → send batch through tauri::ipc::Channel<Vec<LogEvent>>
  → frontend appendLogBatch to log store (capped at 10K)
```

### 4.2 Communication

| Mechanism                            | Purpose                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauri::ipc::Channel<Vec<LogEvent>>` | High-throughput log batches (first use of Channel in Orbit — import: Rust `use tauri::ipc::Channel;`, TS `import { Channel } from '@tauri-apps/api/core';`) |
| Event: `vercel:log_stream_ended`     | Build finished or stream closed normally                                                                                                                    |
| Event: `vercel:log_stream_error`     | Stream dropped (distinct from ended). Includes `user_message()`.                                                                                            |

### 4.3 Single Stream Enforcement and Stream IDs

`vercel_stream_logs` returns a unique `stream_id: String` (UUID). `VercelStateInner.log_streams` stores the active stream's `(stream_id, CancellationToken)`. At most one entry. Any existing stream is aborted before starting a new one.

`vercel_stop_log_stream` accepts `stream_id: String` (not `deployment_id`). This prevents React strict mode double-mount from killing streams: mount₁ starts stream A, unmount₁ sends stop(A), mount₂ starts stream B (which aborts A), then stop(A) arrives but A is already gone — no effect on B. Without stream IDs, stop(deployment_id) would kill B.

### 4.4 Reconnection (Internal to Task)

Reconnection happens **inside the existing tokio task**, NOT via a new `vercel_stream_logs` command invocation (which would self-abort via single-stream enforcement).

When the HTTP stream drops mid-build:

1. Emit `vercel:log_stream_error` with error reason
2. **Check error type:** If `VercelError::Unauthorized` (401), abort immediately → trigger 401 lifecycle (Section 1.4). Do NOT count as retry.
3. Wait 2 seconds
4. Fetch historical logs via `get_events`
5. **Deduplicate:** Use `serial` field when present. For events without serial (structural events like `Delimiter`, `Exit`), use composite key `(created, event_type)` as fallback. Drop events with `created <= last_seen_created`.
6. If deployment still `Building`, create a **child CancellationToken** for the new HTTP connection. Atomically swap the token in `log_streams` so `vercel_stop_log_stream` cancels the latest attempt.
7. Resume streaming
8. After 3 failed reconnection attempts, give up and surface error

### 4.5 Historical vs Live

| Deployment State                       | Method          | Behavior                                        |
| -------------------------------------- | --------------- | ----------------------------------------------- |
| `Building` / `Queued` / `Initializing` | `stream_events` | Live stream                                     |
| `Ready` / `Error` / `Canceled`         | `get_events`    | All logs at once (pre-truncated to 10K in Rust) |

---

## 5. Tauri Command Layer

**Module:** `src-tauri/src/commands/integrations/vercel.rs`

### 5.1 State Architecture

Single lock wrapping all state — eliminates multi-lock deadlock risk:

```rust
#[derive(Default)]
pub struct VercelState {
    inner: tokio::sync::RwLock<VercelStateInner>,
}
// tokio::sync::RwLock<T> implements Default when T: Default.
// VercelStateInner derives Default (all fields are Option/HashMap).

#[derive(Default)]
pub(crate) struct VercelStateInner {
    client: Option<VercelClient>,
    poller: Option<DeploymentPoller>,
    log_streams: HashMap<String, CancellationToken>,
    linked_project: Option<Project>,
    team: Option<Team>,
}
```

Wrapped in `Arc` at registration: `.manage(Arc::new(VercelState::default()))`.

**Access pattern:** Commands acquire the lock, clone/extract what they need, drop the lock, THEN make async HTTP calls. Never hold the lock across `.await`.

**Drop:** `VercelState` implements `Drop` using `self.inner.get_mut()` (takes `&mut self`, no lock needed — exclusive access guaranteed):

```rust
impl Drop for VercelState {
    fn drop(&mut self) {
        let inner = self.inner.get_mut();
        for token in inner.log_streams.values() { token.cancel(); }
        // Poller's own Drop handles its cleanup
    }
}
```

### 5.2 Commands

All return `Result<T, String>` using `map_err(to_error)` (matching `lifecycle.rs` pattern). Sentry: report only 5xx and deserialization failures via `.capture("vercel_*")`. Do NOT report 401, 403, 404, 429, or network errors.

| Command                    | Signature (key params)                                                | Output                                         |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `vercel_store_token`       | `app: AppHandle, state: State<'_, Arc<VercelState>>, token: String`   | `Result<VercelTokenResult, String>`            |
| `vercel_get_status`        | `state: State<'_, Arc<VercelState>>`                                  | `Result<VercelConnectionStatus, String>`       |
| `vercel_disconnect`        | `app: AppHandle, state: State<'_, Arc<VercelState>>`                  | `Result<(), String>`                           |
| `vercel_select_team`       | `app: AppHandle, state: State<'_, Arc<VercelState>>, team_id: String` | `Result<(), String>`                           |
| `vercel_list_deployments`  | `state, project_id, filters`                                          | `Result<DeploymentListResponse, String>`       |
| `vercel_get_deployment`    | `state, deployment_id`                                                | `Result<Deployment, String>`                   |
| `vercel_deployment_action` | `app, state, deployment_id, action, confirmed`                        | `Result<Option<Deployment>, String>`           |
| `vercel_list_projects`     | `state`                                                               | `Result<ProjectListResponse, String>`          |
| `vercel_start_polling`     | `app, state, project_id`                                              | `Result<(), String>`                           |
| `vercel_stop_polling`      | `state`                                                               | `Result<(), String>`                           |
| `vercel_stream_logs`       | `app, state, deployment_id, on_event: Channel<Vec<LogEvent>>`         | `Result<String, String>` (returns `stream_id`) |
| `vercel_stop_log_stream`   | `state, stream_id`                                                    | `Result<(), String>`                           |
| `vercel_auto_detect`       | `app, state`                                                          | `Result<Option<Project>, String>`              |
| `vercel_link_project`      | `app, state, project_id: String`                                      | `Result<Project, String>`                      |

### 5.3 Auto-Detection

**Triggered by frontend** via `vercel_auto_detect` after event listeners are ready (called from `useVercelEvents` after listener registration). NOT at Tauri startup.

**Guard for multi-team:** If user has multiple teams and `team_id` is `None`, return `Ok(None)` — auto-detection deferred until team is selected.

**Git remote parsing:** HTTPS, SSH, GitLab nested groups, Bitbucket, custom domains. Strip `.git` suffix. Check `origin` first, fall back to other remotes. Identify provider (github/gitlab/bitbucket) for matching against `ProjectLink.link_type`.

`find_by_repo` paginates through all projects. If match found, store in `linked_project` and return. If no match, emit `vercel:project_not_linked`.

### 5.4 Registration

```rust
// In src-tauri/src/lib.rs:
use commands::integrations::vercel as vercel_cmd;

// generate_handler![...]:
vercel_cmd::vercel_store_token,
vercel_cmd::vercel_get_status,
vercel_cmd::vercel_disconnect,
vercel_cmd::vercel_select_team,
vercel_cmd::vercel_list_deployments,
vercel_cmd::vercel_get_deployment,
vercel_cmd::vercel_deployment_action,
vercel_cmd::vercel_list_projects,
vercel_cmd::vercel_start_polling,
vercel_cmd::vercel_stop_polling,
vercel_cmd::vercel_stream_logs,
vercel_cmd::vercel_stop_log_stream,
vercel_cmd::vercel_auto_detect,
vercel_cmd::vercel_link_project,

// setup:
.manage(Arc::new(vercel_cmd::VercelState::default()))
```

Add `pub mod integrations;` to `src-tauri/src/commands/mod.rs`.

---

## 6. Frontend Data Layer

### 6.1 Zod Schemas

**Location:** `packages/shared-schemas/src/vercel/vercel.ts`

Schemas use `.strict()` (Rust strips unknown fields). Field names: **camelCase** (matching `#[serde(rename_all = "camelCase")]`). Note: Rust's `#[serde(alias)]` normalization means the frontend always receives `created` (never `createdAt`) and `state` (never `readyState`). Document this in the schema file.

### 6.2 API Wrapper

**Location:** `apps/agent/src/lib/api/vercel.ts`

Thin `invoke<T>()` pass-through. No Zod validation on responses (consistent with codebase — Rust is source of truth).

### 6.3 Zustand Stores (3 stores)

**`vercel-connection-store.ts`** — changes rarely:

| Field                 | Type                                              |
| --------------------- | ------------------------------------------------- |
| `status`              | `'disconnected' \| 'revalidating' \| 'connected'` |
| `user`                | `VercelUser \| null`                              |
| `teams`               | `Team[]`                                          |
| `selectedTeam`        | `Team \| null`                                    |
| `linkedProject`       | `Project \| null`                                 |
| `hasDeploymentAccess` | `boolean`                                         |
| `error`               | `string \| null`                                  |

`status` is tri-state: `disconnected` (no token or revoked), `revalidating` (token loaded from disk, background `GET /v1/user` in flight — frontend shows skeleton, NOT "connected"), `connected` (validated). This prevents the flash of connected→disconnected on app restart if the token was revoked overnight.

Actions: `setRevalidating`, `setConnected`, `setDisconnected`, `setTeam`, `setLinkedProject`, `setError`, `reset`.

**`vercel-deployment-store.ts`** — changes on poll (5-60s):

| Field                  | Type             |
| ---------------------- | ---------------- |
| `deployments`          | `Deployment[]`   |
| `selectedDeploymentId` | `string \| null` |
| `isLoading`            | `boolean`        |
| `isPolling`            | `boolean`        |
| `lastUpdatedAt`        | `number \| null` |
| `pollError`            | `string \| null` |

Actions: `setDeployments` (full-replace sorted by `created` descending — simpler than merge for single-page polling), `setSelectedDeployment`, `updateDeploymentState` (targeted update from `deployment_state_changed` event), `setIsPolling`, `setPollError`, `reset`. Deployments that age off page 1 are removed from the store on next poll — this is acceptable for v1 since there is no "load more."

**`vercel-log-store.ts`** — changes rapidly during streaming:

| Field                | Type                         |
| -------------------- | ---------------------------- |
| `logEvents`          | `LogEvent[]` (capped at 10K) |
| `isStreamingLogs`    | `boolean`                    |
| `activeDeploymentId` | `string \| null`             |
| `streamError`        | `string \| null`             |
| `truncatedCount`     | `number`                     |

Actions: `appendLogBatch` (cap at 10K, truncate front, increment `truncatedCount`), `clearLogs`, `setStreamingLogs`, `setActiveDeployment`, `setStreamError`.

Stable empty constants: `EMPTY_DEPLOYMENTS`, `EMPTY_LOG_EVENTS`.

### 6.4 Selector Hooks

Each store exports granular selectors (one per field). Components needing data from multiple stores use multiple independent selectors — each triggers re-render only when its specific value changes.

### 6.5 Event Listener Hook

**`use-vercel-events.ts`** — uses `ListenerAbortController` pattern (extract from `tauri-provider.tsx` to shared utility `apps/agent/src/lib/tauri-listener-controller.ts`).

**Connected-state guard:** The `vercel:deployments_updated` handler checks `useVercelConnectionStore.getState().connected` before processing. If disconnected (race between auth revocation and in-flight poll response), the update is dropped.

After all listeners are registered, calls `invoke('vercel_auto_detect')` to trigger project linking.

### 6.6 Log Stream Hook

**`use-vercel-log-stream.ts`** — manages Channel lifecycle:

```typescript
export function useVercelLogStream(deploymentId: string | null): void {
  useEffect(() => {
    if (!deploymentId) return;

    let streamId: string | null = null;

    const channel = new Channel<LogEvent[]>();
    channel.onmessage = (batch) => {
      useVercelLogStore.getState().appendLogBatch(batch);
    };

    useVercelLogStore.getState().clearLogs();
    useVercelLogStore.getState().setActiveDeployment(deploymentId);

    // invoke returns the stream_id for cleanup
    invoke<string>('vercel_stream_logs', { deploymentId, onEvent: channel }).then((id) => {
      streamId = id;
    });

    return () => {
      // Stop by stream_id, not deployment_id — prevents React strict mode
      // double-mount from killing the second stream with a late stop from the first
      if (streamId) {
        invoke('vercel_stop_log_stream', { streamId });
      }
    };
  }, [deploymentId]);
}
```

Backend single-stream enforcement is the safety net, not the primary cleanup.

---

## 7. Logging Strategy

All Rust logging uses `log` crate (`log::info!`, `log::warn!`, `log::error!`). Routes through `tauri-plugin-log`. Frontend uses `createLogger` from `@orbit/common/lib`.

| Operation             | Level    | What                                   |
| --------------------- | -------- | -------------------------------------- |
| Token validation      | `info!`  | Attempt + outcome (token[..8] only)    |
| Team resolution       | `info!`  | Team count, auto-selected name         |
| Poller lifecycle      | `info!`  | Start/stop/suspend, project_id         |
| Interval changes      | `debug!` | Old → new interval, active_count       |
| Rate limit backoff    | `warn!`  | Remaining count, new interval          |
| Network failures      | `warn!`  | Consecutive count, next retry          |
| 401 detected          | `warn!`  | "Token revoked/expired, disconnecting" |
| Log stream open/close | `info!`  | deployment_id, duration                |
| API call timing       | `debug!` | Endpoint, duration_ms, status          |

**Sentry:** Report 5xx + deserialization failures only. NOT 401, 403, 404, 429, network errors.

---

## 8. Security Notes

1. All Vercel API calls go through Rust `reqwest` — no CSP changes needed.
2. No new Tauri ACL entries needed (`core:default` covers custom commands).
3. Token: `SecretString`, zeroized on drop, never logged, never in Zustand.
4. `app.emit()` broadcasts to all windows. Currently single-window; migrate to `emit_to("main")` for multi-window.
5. Build logs may contain secrets (env vars printed during build). Logs are ephemeral (in-memory, capped at 10K, cleared on disconnect). If log persistence is added in v2, evaluate secret scanning.
6. Log stream reconnection short-circuits on 401 (does not retry with revoked token).

---

## 9. Settings UI Contract

The UI implementation is deferred but requires these elements (derived from command signatures and events):

| Element           | Data Source                                         | Behavior                                                             |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Token input field | —                                                   | Clears from React state after `invoke()` returns                     |
| Connection status | `VercelConnectionStatus.connected`                  | Connected / disconnected / needs revalidation                        |
| User info display | `VercelConnectionStatus.user`                       | Username, email                                                      |
| Team selector     | `VercelTokenResult.teams`                           | Dropdown when > 1 team. Hidden when 0 teams (show username instead). |
| Linked project    | `VercelConnectionStatus.linked_project`             | Auto-detected or manual. Change button triggers project picker.      |
| Access warning    | `has_deployment_access: false`                      | Banner: "Token lacks deployment access. Some actions are disabled."  |
| Disconnect button | `vercel_disconnect`                                 | Clears everything                                                    |
| Reconnect prompt  | `vercel:auth_revoked` / `vercel:needs_revalidation` | Shown after token revocation or failed revalidation                  |

---

## 10. Known Limitations

1. **Single-workspace state:** `VercelState` is app-global (one instance). If multi-window ships, must scope by workspace using `HashMap<PathBuf, VercelStateInner>`. Documented as TODO.
2. **Credential lock is process-level** (`parking_lot::Mutex`), not filesystem-level (`flock`). Two Orbit processes writing `credentials.enc` simultaneously causes last-write-wins. Migrate to `fs2::FileExt::lock_exclusive()` for multi-process safety.
3. **Deployment list is ephemeral.** No cache across app restarts. Cold open shows loading skeleton until first poll (up to 60s for idle projects). Consider workspace-scoped JSON cache in v2.
4. **Pagination is one-page.** Poller fetches first page only. No "load more" for older deployments in v1. Add pagination store fields (`hasMore`, `nextCursor`) in v2 alongside an `appendOlderDeployments` action.
5. **Log event `serial` may not be globally unique.** Reconnection dedup uses composite fallback `(created, event_type)` for events without serial.
6. **Channel<T> is a new pattern** in this codebase. Import: Rust `use tauri::ipc::Channel;`, TS `import { Channel } from '@tauri-apps/api/core';`. No existing precedent to reference.
7. **`ListenerAbortController`** is file-scoped in `tauri-provider.tsx`. Must extract to shared utility at `apps/agent/src/lib/tauri-listener-controller.ts`.

---

## Rate Limits Reference

| Operation             | Vercel Limit                       | Our Usage                                 |
| --------------------- | ---------------------------------- | ----------------------------------------- |
| List deployments      | 1000/min per user                  | 12/min max (5s fast polling, `limit: 10`) |
| Get deployment        | 500/min per user (2000 Enterprise) | On-demand                                 |
| Promote/rollback      | Varies                             | User-initiated, confirmed                 |
| Get deployment events | 60/min per user                    | 1 stream, on-demand                       |
| List projects         | ~500/min (approximate)             | Once on connect + cache                   |
| List teams            | Low frequency                      | Once during validation                    |

---

## File Inventory

### New Files

| File                                                            | Purpose                                           |
| --------------------------------------------------------------- | ------------------------------------------------- |
| `crates/common/vercel/Cargo.toml`                               | Crate manifest                                    |
| `crates/common/vercel/src/lib.rs`                               | Public re-exports                                 |
| `crates/common/vercel/src/client.rs`                            | `VercelClient` with `SecretString`                |
| `crates/common/vercel/src/types.rs`                             | All types with full derives                       |
| `crates/common/vercel/src/errors.rs`                            | `VercelError` with `thiserror` + `user_message()` |
| `crates/common/vercel/src/deployments.rs`                       | Deployment CRUD                                   |
| `crates/common/vercel/src/projects.rs`                          | Project ops with cache                            |
| `crates/common/vercel/src/teams.rs`                             | Team list                                         |
| `crates/common/vercel/src/logs.rs`                              | Build log streaming                               |
| `crates/common/vercel/src/polling.rs`                           | `DeploymentPoller` with `Notify`                  |
| `src-tauri/src/commands/integrations/vercel.rs`                 | 13 Tauri commands                                 |
| `src-tauri/src/commands/integrations/mod.rs`                    | Module declaration                                |
| `packages/shared-schemas/src/vercel/vercel.ts`                  | Zod schemas (`.strict()`, camelCase)              |
| `packages/shared-schemas/src/vercel/index.ts`                   | Barrel export                                     |
| `apps/agent/src/lib/api/vercel.ts`                              | Invoke wrappers                                   |
| `apps/agent/src/lib/tauri-listener-controller.ts`               | Extracted `ListenerAbortController`               |
| `apps/agent/src/stores/integrations/vercel-connection-store.ts` | Auth state                                        |
| `apps/agent/src/stores/integrations/vercel-deployment-store.ts` | Deployment state                                  |
| `apps/agent/src/stores/integrations/vercel-log-store.ts`        | Log state (10K cap)                               |
| `apps/agent/src/hooks/integrations/use-vercel-events.ts`        | Event listeners                                   |
| `apps/agent/src/hooks/integrations/use-vercel-log-stream.ts`    | Channel lifecycle hook                            |
| `apps/agent/src/types/vercel.ts`                                | Re-export shared types                            |
| `apps/agent/src/stores/integrations/index.ts`                   | Barrel export for integration stores              |
| `apps/agent/src/hooks/integrations/index.ts`                    | Barrel export for integration hooks               |

### Modified Files

| File                                           | Change                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cargo.toml` (workspace root)                  | Add `crates/common/vercel` to members. Add `tokio-util` and `secrecy` to `[workspace.dependencies]`.                                                                         |
| `src-tauri/Cargo.toml`                         | Add `orbit-vercel` dep. Change `secrecy` to `{ workspace = true }`.                                                                                                          |
| `src-tauri/src/lib.rs`                         | Register 14 commands, add `Arc<VercelState>` to managed state.                                                                                                               |
| `src-tauri/src/commands/mod.rs`                | Add `pub mod integrations;`                                                                                                                                                  |
| `src-tauri/src/commands/common/credentials.rs` | Add `vercel_credentials: Option<HashMap<String, VercelWorkspaceCredential>>` to `StoredCredentials`. Add `VercelWorkspaceCredential` struct. Add backward-compat serde test. |
| `packages/shared-schemas/src/index.ts`         | Export vercel schemas                                                                                                                                                        |
| `apps/agent/src/stores/index.ts`               | Add `export * from './integrations';`                                                                                                                                        |
| `apps/agent/src/hooks/index.ts`                | Add `export * from './integrations';`                                                                                                                                        |
| `apps/agent/src/providers/tauri-provider.tsx`  | Extract `ListenerAbortController` to shared utility                                                                                                                          |

---

## Testing Strategy

| Layer                   | What to Test                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crate unit tests        | Type serde roundtrips (both log shapes), `From<RawLogEvent>` normalization, filter/URL building, error mapping, git remote parsing (HTTPS/SSH/GitLab nested/Bitbucket), `user_message()` strings, project cache TTL |
| Crate integration tests | Real API calls (list, get, stream, teams). Feature-gated, skipped in CI.                                                                                                                                            |
| Polling tests           | Adaptive intervals, backoff on failures, Notify-based immediate poll, CancellationToken + Drop cleanup, `previous_states` pruning                                                                                   |
| Error recovery tests    | 401 lifecycle (poller stops, client clears), network backoff, log reconnection with 401 short-circuit, reconnection dedup (with and without serial)                                                                 |
| Credential tests        | `StoredCredentials` backward-compat (4→5 field), `VercelWorkspaceCredential` serde, canonical path normalization                                                                                                    |
| Tauri command tests     | Argument validation, state transitions, `AppHandle` event emission, `Channel` log delivery                                                                                                                          |
| Frontend store tests    | Store splits (3 stores independent), log cap (10K), `reset()`, `updateDeploymentState`, connected-state guard on deployments_updated                                                                                |
| Schema tests            | Zod `.strict()` against real API fixtures                                                                                                                                                                           |
| Hook tests              | `useVercelLogStream` cleanup on unmount, `ListenerAbortController` rapid mount/unmount                                                                                                                              |
