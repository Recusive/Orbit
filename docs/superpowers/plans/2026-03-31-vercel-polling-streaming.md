# Vercel Polling + Streaming Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DeploymentPoller (adaptive polling with Notify-based immediate poll) and build log streaming (batched Channel delivery with reconnection logic).

**Architecture:** Both components live in the `orbit-vercel` crate (`polling.rs` and extending `logs.rs`). The poller uses `tokio::select!` over CancellationToken, Notify, and sleep. Log streaming uses `tauri::ipc::Channel<Vec<LogEvent>>` with 100ms/50-line batching. Reconnection uses child CancellationTokens and serial-based deduplication.

**Tech Stack:** Rust, tokio, tokio-util (CancellationToken), tauri::ipc::Channel, reqwest streaming

**Spec:** `docs/superpowers/specs/2026-03-31-vercel-deployments-backend-design.md` — Sections 3, 4

**Depends on:** Plan 1 (Vercel Crate — types, errors, client)
**Blocks:** Plan 3 (Tauri Commands)

---

### Task 1: Implement DeploymentPoller core struct and adaptive interval logic

**Files:**

- Create: `crates/common/vercel/src/polling.rs`
- Modify: `crates/common/vercel/src/lib.rs` (add `pub mod polling;`)

- [ ] **Step 1: Write PollerState and interval computation**

Create `crates/common/vercel/src/polling.rs`:

```rust
#![expect(missing_docs, reason = "documented in design spec")]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Notify;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::types::{DeploymentState, DeploymentFilters};

const FAST_INTERVAL: Duration = Duration::from_secs(5);
const COOLDOWN_INTERVAL: Duration = Duration::from_secs(15);
const IDLE_INTERVAL: Duration = Duration::from_secs(60);
const MIN_INTERVAL: Duration = Duration::from_secs(1);
const COOLDOWN_WINDOW: Duration = Duration::from_secs(300); // 5 minutes
const MAX_CONSECUTIVE_FAILURES: u32 = 10;

/// Manages adaptive polling of the Vercel deployments API.
pub struct DeploymentPoller {
    cancel: CancellationToken,
    pub poll_now: Arc<Notify>,
    handle: Option<JoinHandle<()>>,
    pub project_id: String,
}

pub struct PollerState {
    pub previous_states: HashMap<String, DeploymentState>,
    pub active_count: usize,
    pub last_successful_poll: Option<Instant>,
    pub last_build_finished: Option<Instant>,
    pub last_updated_at: i64,
    pub interval: Duration,
    pub consecutive_failures: u32,
}

impl Default for PollerState {
    fn default() -> Self {
        Self {
            previous_states: HashMap::new(),
            active_count: 0,
            last_successful_poll: None,
            last_build_finished: None,
            last_updated_at: 0,
            interval: IDLE_INTERVAL,
            consecutive_failures: 0,
        }
    }
}

impl PollerState {
    /// Compute the next polling interval based on current state.
    /// Called after each successful poll with fresh deployment data.
    pub fn compute_interval(&mut self) -> Duration {
        let interval = if self.active_count > 0 {
            FAST_INTERVAL
        } else if self
            .last_build_finished
            .is_some_and(|t| t.elapsed() < COOLDOWN_WINDOW)
        {
            COOLDOWN_INTERVAL
        } else {
            IDLE_INTERVAL
        };

        self.interval = interval.max(MIN_INTERVAL);
        self.interval
    }

    /// Compute backoff interval after a network failure.
    pub fn compute_backoff(&mut self) -> Duration {
        let backoff = match self.consecutive_failures {
            0..=1 => Duration::from_secs(5),
            2 => Duration::from_secs(10),
            3 => Duration::from_secs(20),
            4..=5 => Duration::from_secs(60),
            _ => Duration::from_secs(120),
        };
        self.interval = backoff.max(MIN_INTERVAL);
        self.interval
    }

    /// Returns the filters to use for the current poll based on state.
    pub fn poll_filters(&self, project_id: &str) -> DeploymentFilters {
        if self.active_count > 0 {
            // Fast poll: only active deployments, small limit
            DeploymentFilters {
                project_id: Some(project_id.to_string()),
                state: None, // API accepts single state, so we fetch all and filter client-side
                target: None,
                branch: None,
                limit: Some(10),
            }
        } else {
            // Idle poll: recent deployments
            DeploymentFilters {
                project_id: Some(project_id.to_string()),
                state: None,
                target: None,
                branch: None,
                limit: Some(20),
            }
        }
    }

    /// Update state after a successful poll. Prune entries not in current response.
    /// Returns (state_changes, new_deployments) for event emission.
    pub fn update_from_poll(
        &mut self,
        deployments: &[(String, Option<DeploymentState>)],
    ) -> (Vec<StateChange>, Vec<String>) {
        let mut state_changes = Vec::new();
        let mut new_deployment_ids = Vec::new();
        let current_ids: HashMap<&str, Option<DeploymentState>> = deployments
            .iter()
            .map(|(id, state)| (id.as_str(), *state))
            .collect();

        // Detect state changes and new deployments
        for (id, new_state) in deployments {
            match self.previous_states.get(id.as_str()) {
                Some(old_state) => {
                    if Some(*old_state) != *new_state {
                        if let Some(ns) = new_state {
                            state_changes.push(StateChange {
                                deployment_id: id.clone(),
                                old_state: *old_state,
                                new_state: *ns,
                            });
                        }
                    }
                }
                None => {
                    new_deployment_ids.push(id.clone());
                }
            }
        }

        // Prune entries not in current response
        self.previous_states
            .retain(|id, _| current_ids.contains_key(id.as_str()));

        // Update previous states
        for (id, state) in deployments {
            if let Some(s) = state {
                self.previous_states.insert(id.clone(), *s);
            }
        }

        // Capture previous active count BEFORE recomputing
        let previous_active_count = self.active_count;

        // Count active deployments
        self.active_count = deployments
            .iter()
            .filter(|(_, state)| {
                matches!(
                    state,
                    Some(DeploymentState::Building)
                        | Some(DeploymentState::Queued)
                        | Some(DeploymentState::Initializing)
                )
            })
            .count();

        // Track when builds finish (transition from active > 0 to active == 0)
        if previous_active_count > 0 && self.active_count == 0 {
            self.last_build_finished = Some(Instant::now());
        }

        self.last_successful_poll = Some(Instant::now());
        self.consecutive_failures = 0;

        (state_changes, new_deployment_ids)
    }

    /// Returns true if polling should be suspended (too many failures).
    pub fn should_suspend(&self) -> bool {
        self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES
    }
}

#[derive(Debug, Clone)]
pub struct StateChange {
    pub deployment_id: String,
    pub old_state: DeploymentState,
    pub new_state: DeploymentState,
}

impl Drop for DeploymentPoller {
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
    }
}

impl DeploymentPoller {
    pub fn new(project_id: String) -> Self {
        Self {
            cancel: CancellationToken::new(),
            poll_now: Arc::new(Notify::new()),
            handle: None,
            project_id,
        }
    }

    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel.clone()
    }

    pub fn set_handle(&mut self, handle: JoinHandle<()>) {
        self.handle = Some(handle);
    }

    /// Signal the poller to do an immediate poll (after an action completes).
    pub fn trigger_immediate_poll(&self) {
        self.poll_now.notify_one();
    }

    /// Check if the poller has been cancelled.
    pub fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_interval_active_builds() {
        let mut state = PollerState::default();
        state.active_count = 2;
        assert_eq!(state.compute_interval(), FAST_INTERVAL);
    }

    #[test]
    fn compute_interval_cooldown() {
        let mut state = PollerState::default();
        state.active_count = 0;
        state.last_build_finished = Some(Instant::now());
        assert_eq!(state.compute_interval(), COOLDOWN_INTERVAL);
    }

    #[test]
    fn compute_interval_idle() {
        let mut state = PollerState::default();
        state.active_count = 0;
        state.last_build_finished = None;
        assert_eq!(state.compute_interval(), IDLE_INTERVAL);
    }

    #[test]
    fn compute_interval_minimum_floor() {
        let mut state = PollerState::default();
        state.active_count = 1;
        let interval = state.compute_interval();
        assert!(interval >= MIN_INTERVAL);
    }

    #[test]
    fn compute_backoff_escalation() {
        let mut state = PollerState::default();

        state.consecutive_failures = 0;
        assert_eq!(state.compute_backoff(), Duration::from_secs(5));

        state.consecutive_failures = 2;
        assert_eq!(state.compute_backoff(), Duration::from_secs(10));

        state.consecutive_failures = 3;
        assert_eq!(state.compute_backoff(), Duration::from_secs(20));

        state.consecutive_failures = 5;
        assert_eq!(state.compute_backoff(), Duration::from_secs(60));

        state.consecutive_failures = 8;
        assert_eq!(state.compute_backoff(), Duration::from_secs(120));
    }

    #[test]
    fn should_suspend_after_max_failures() {
        let mut state = PollerState::default();
        state.consecutive_failures = 9;
        assert!(!state.should_suspend());

        state.consecutive_failures = 10;
        assert!(state.should_suspend());
    }

    #[test]
    fn update_from_poll_detects_state_changes() {
        let mut state = PollerState::default();

        // First poll: establish baseline
        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Building)),
            ("dpl_2".to_string(), Some(DeploymentState::Ready)),
        ];
        let (changes, new_ids) = state.update_from_poll(&deployments);
        assert!(changes.is_empty()); // No changes on first poll
        assert_eq!(new_ids.len(), 2); // Both are new

        // Second poll: dpl_1 changed from Building to Ready
        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Ready)),
            ("dpl_2".to_string(), Some(DeploymentState::Ready)),
        ];
        let (changes, new_ids) = state.update_from_poll(&deployments);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].deployment_id, "dpl_1");
        assert_eq!(changes[0].old_state, DeploymentState::Building);
        assert_eq!(changes[0].new_state, DeploymentState::Ready);
        assert!(new_ids.is_empty());
    }

    #[test]
    fn update_from_poll_detects_new_deployments() {
        let mut state = PollerState::default();

        let deployments = vec![("dpl_1".to_string(), Some(DeploymentState::Ready))];
        state.update_from_poll(&deployments);

        // New deployment appears
        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Ready)),
            ("dpl_2".to_string(), Some(DeploymentState::Building)),
        ];
        let (_, new_ids) = state.update_from_poll(&deployments);
        assert_eq!(new_ids, vec!["dpl_2"]);
    }

    #[test]
    fn update_from_poll_prunes_stale_entries() {
        let mut state = PollerState::default();

        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Ready)),
            ("dpl_2".to_string(), Some(DeploymentState::Ready)),
        ];
        state.update_from_poll(&deployments);
        assert_eq!(state.previous_states.len(), 2);

        // dpl_1 ages off the list
        let deployments = vec![("dpl_2".to_string(), Some(DeploymentState::Ready))];
        state.update_from_poll(&deployments);
        assert_eq!(state.previous_states.len(), 1);
        assert!(!state.previous_states.contains_key("dpl_1"));
    }

    #[test]
    fn update_from_poll_counts_active() {
        let mut state = PollerState::default();

        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Building)),
            ("dpl_2".to_string(), Some(DeploymentState::Queued)),
            ("dpl_3".to_string(), Some(DeploymentState::Ready)),
        ];
        state.update_from_poll(&deployments);
        assert_eq!(state.active_count, 2); // Building + Queued
    }

    #[test]
    fn update_from_poll_resets_failures() {
        let mut state = PollerState::default();
        state.consecutive_failures = 5;

        let deployments = vec![("dpl_1".to_string(), Some(DeploymentState::Ready))];
        state.update_from_poll(&deployments);
        assert_eq!(state.consecutive_failures, 0);
    }

    #[test]
    fn poll_filters_fast_vs_idle() {
        let mut state = PollerState::default();

        state.active_count = 1;
        let filters = state.poll_filters("prj_1");
        assert_eq!(filters.limit, Some(10));

        state.active_count = 0;
        let filters = state.poll_filters("prj_1");
        assert_eq!(filters.limit, Some(20));
    }

    #[test]
    fn compute_interval_cooldown_expired() {
        let mut state = PollerState::default();
        state.active_count = 0;
        // Set last_build_finished to well beyond the cooldown window
        state.last_build_finished = Some(Instant::now() - COOLDOWN_WINDOW - Duration::from_secs(1));
        assert_eq!(state.compute_interval(), IDLE_INTERVAL);
    }

    #[test]
    fn update_from_poll_handles_none_state() {
        let mut state = PollerState::default();

        let deployments = vec![
            ("dpl_1".to_string(), None), // state: None
            ("dpl_2".to_string(), Some(DeploymentState::Building)),
        ];
        let (changes, new_ids) = state.update_from_poll(&deployments);
        assert!(changes.is_empty());
        assert_eq!(new_ids.len(), 2);
        // None-state deployment should not be tracked in previous_states
        assert!(!state.previous_states.contains_key("dpl_1"));
        assert!(state.previous_states.contains_key("dpl_2"));
        // Only Building counts as active
        assert_eq!(state.active_count, 1);
    }

    #[test]
    fn update_from_poll_sets_last_build_finished_on_transition() {
        let mut state = PollerState::default();

        // First poll: one active build
        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Building)),
        ];
        state.update_from_poll(&deployments);
        assert_eq!(state.active_count, 1);
        assert!(state.last_build_finished.is_none());

        // Second poll: build finished (transition from active > 0 to active == 0)
        let deployments = vec![
            ("dpl_1".to_string(), Some(DeploymentState::Ready)),
        ];
        state.update_from_poll(&deployments);
        assert_eq!(state.active_count, 0);
        assert!(state.last_build_finished.is_some());
    }

    #[test]
    fn poller_drop_cancels() {
        let poller = DeploymentPoller::new("prj_1".to_string());
        let token = poller.cancel_token();
        assert!(!token.is_cancelled());

        drop(poller);
        assert!(token.is_cancelled());
    }
}
```

- [ ] **Step 2: Add `pub mod polling;` to lib.rs**

In `crates/common/vercel/src/lib.rs`, add:

```rust
pub mod polling;
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p orbit-vercel -- polling`
Expected: All 14 polling tests PASS

- [ ] **Step 4: Commit**

```bash
git add crates/common/vercel/src/polling.rs crates/common/vercel/src/lib.rs
git commit -m "feat(vercel): add DeploymentPoller with adaptive intervals, backoff, and state diffing"
```

---

### Task 2: Implement log streaming with batching

**Files:**

- Modify: `crates/common/vercel/src/logs.rs`

- [ ] **Step 1: Replace the contents of logs.rs**

> **Cross-plan dependency:** `stream_events` accesses `self.http`, `self.auth_headers()`, and `self.url()` which are defined in `client.rs` (Plan 1). Plan 1's `client.rs` must declare these as `pub(crate)` (not private) so they are accessible from `logs.rs` within the same crate. This has been applied in Plan 1.

Replace the contents of `logs.rs` with the following (includes `get_events`, `stream_events`, and `deduplicate_events`):

```rust
#![expect(missing_docs, reason = "documented in design spec")]

use std::time::{Duration, Instant};

use futures::StreamExt as _;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::sync::CancellationToken;

use crate::client::VercelClient;
use crate::errors::VercelError;
use crate::types::*;

const MAX_LOG_EVENTS: usize = 10_000;
const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(100);
const BATCH_MAX_LINES: usize = 50;

impl VercelClient {
    /// Fetch all historical log events for a completed deployment.
    /// Pre-truncates to last 10K events if the response is larger.
    pub async fn get_events(&self, deployment_id: &str) -> Result<Vec<LogEvent>, VercelError> {
        let path = format!("/v3/deployments/{deployment_id}/events");
        let raw_events: Vec<RawLogEvent> = self.get(&path).await?;

        let mut events: Vec<LogEvent> = raw_events.into_iter().map(LogEvent::from).collect();

        if events.len() > MAX_LOG_EVENTS {
            let skip = events.len() - MAX_LOG_EVENTS;
            events = events.into_iter().skip(skip).collect();
        }

        Ok(events)
    }

    /// Stream build log events from a deployment.
    /// Reads newline-delimited JSON from the Vercel API and sends batched
    /// LogEvents through the provided sender function.
    ///
    /// Batching: flushes every 100ms or 50 lines, whichever comes first.
    /// Cancellation: respects the provided CancellationToken.
    pub async fn stream_events<F>(
        &self,
        deployment_id: &str,
        cancel: CancellationToken,
        mut send_batch: F,
    ) -> Result<(), VercelError>
    where
        F: FnMut(Vec<LogEvent>) -> Result<(), VercelError>,
    {
        let url = self.url(&format!(
            "/v3/deployments/{deployment_id}/events?follow=1&direction=forward"
        ));

        log::info!("Opening log stream for deployment {deployment_id}");

        let response = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await?;

        let status = response.status().as_u16();
        if status == 401 {
            return Err(VercelError::Unauthorized);
        }
        if status >= 400 {
            return Err(VercelError::Api {
                status,
                code: "stream_error".to_string(),
                message: format!("Failed to open log stream: HTTP {status}"),
            });
        }

        let byte_stream = response.bytes_stream();
        let reader = BufReader::new(tokio_util::io::StreamReader::new(
            byte_stream.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
        ));
        let mut lines = reader.lines();

        let mut batch: Vec<LogEvent> = Vec::with_capacity(BATCH_MAX_LINES);
        let mut last_flush = Instant::now();

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    // Flush remaining batch before exit
                    if !batch.is_empty() {
                        let _ = send_batch(std::mem::take(&mut batch));
                    }
                    log::info!("Log stream cancelled for {deployment_id}");
                    return Ok(());
                }
                line_result = lines.next_line() => {
                    match line_result {
                        Ok(Some(line)) => {
                            if line.trim().is_empty() {
                                continue;
                            }
                            match serde_json::from_str::<RawLogEvent>(&line) {
                                Ok(raw) => {
                                    batch.push(LogEvent::from(raw));
                                }
                                Err(e) => {
                                    log::warn!("Failed to parse log event: {e}");
                                    continue;
                                }
                            }

                            // Flush if batch is full or interval elapsed
                            if batch.len() >= BATCH_MAX_LINES
                                || last_flush.elapsed() >= BATCH_FLUSH_INTERVAL
                            {
                                send_batch(std::mem::take(&mut batch))?;
                                last_flush = Instant::now();
                            }
                        }
                        Ok(None) => {
                            // Stream ended (build finished)
                            if !batch.is_empty() {
                                send_batch(std::mem::take(&mut batch))?;
                            }
                            log::info!("Log stream ended normally for {deployment_id}");
                            return Ok(());
                        }
                        Err(e) => {
                            // Flush before returning error
                            if !batch.is_empty() {
                                let _ = send_batch(std::mem::take(&mut batch));
                            }
                            return Err(VercelError::Http(e.to_string()));
                        }
                    }
                }
            }
        }
    }
}

/// Deduplicate log events from a reconnection fetch against already-delivered events.
/// Uses `serial` field when present, falls back to `(created, event_type)` composite key.
pub fn deduplicate_events(
    new_events: Vec<LogEvent>,
    last_seen_created: i64,
    seen_serials: &std::collections::HashSet<String>,
) -> Vec<LogEvent> {
    new_events
        .into_iter()
        .filter(|event| {
            // If we have a serial and it's already seen, skip
            if let Some(ref serial) = event.serial {
                if seen_serials.contains(serial) {
                    return false;
                }
            }
            // Fallback: skip events at or before last seen timestamp
            event.created > last_seen_created
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn pre_truncation_logic() {
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

        let truncated: Vec<LogEvent> = if events.len() > MAX_LOG_EVENTS {
            let skip = events.len() - MAX_LOG_EVENTS;
            events.into_iter().skip(skip).collect()
        } else {
            events
        };

        assert_eq!(truncated.len(), MAX_LOG_EVENTS);
        assert_eq!(truncated[0].created, 5000);
        assert_eq!(truncated[truncated.len() - 1].created, 14999);
    }

    #[test]
    fn dedup_by_serial() {
        let mut seen = HashSet::new();
        seen.insert("s1".to_string());
        seen.insert("s2".to_string());

        let events = vec![
            LogEvent {
                event_type: LogEventType::Stdout,
                created: 100,
                text: "old".to_string(),
                serial: Some("s1".to_string()),
                deployment_id: None,
                level: None,
                info: None,
                id: None,
                date: None,
            },
            LogEvent {
                event_type: LogEventType::Stdout,
                created: 200,
                text: "new".to_string(),
                serial: Some("s3".to_string()),
                deployment_id: None,
                level: None,
                info: None,
                id: None,
                date: None,
            },
        ];

        let result = deduplicate_events(events, 0, &seen);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].text, "new");
    }

    #[test]
    fn dedup_by_timestamp_fallback() {
        let seen = HashSet::new(); // No serials seen

        let events = vec![
            LogEvent {
                event_type: LogEventType::Delimiter,
                created: 50, // Before last_seen
                text: String::new(),
                serial: None, // No serial (structural event)
                deployment_id: None,
                level: None,
                info: None,
                id: None,
                date: None,
            },
            LogEvent {
                event_type: LogEventType::Stdout,
                created: 150, // After last_seen
                text: "new line".to_string(),
                serial: None,
                deployment_id: None,
                level: None,
                info: None,
                id: None,
                date: None,
            },
        ];

        let result = deduplicate_events(events, 100, &seen);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].created, 150);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p orbit-vercel -- logs`
Expected: All 3 log tests PASS

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/src/logs.rs
git commit -m "feat(vercel): add log streaming with batching and reconnection deduplication"
```

---

### Task 3: Add reqwest streaming imports and verify full build

**Files:**

- Modify: `crates/common/vercel/Cargo.toml`

- [ ] **Step 1: Ensure streaming dependencies are present**

The `stream_events` method uses `tokio_util::io::StreamReader` and `futures::StreamExt`. Add `futures` to the crate dependencies if not already present:

In `crates/common/vercel/Cargo.toml`, add to `[dependencies]`:

```toml
futures = { workspace = true }
```

- [ ] **Step 2: Verify full build**

Run: `cargo check -p orbit-vercel`
Expected: PASS

Run: `cargo test -p orbit-vercel`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/common/vercel/Cargo.toml
git commit -m "feat(vercel): add futures dep for stream processing"
```

---

## Summary

| Component             | File         | Tests                                                                                                |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| DeploymentPoller core | `polling.rs` | 14 tests (intervals, backoff, state diffing, pruning, Drop, cooldown expiry, None state, transition) |
| Log streaming + dedup | `logs.rs`    | 3 tests (truncation, serial dedup, timestamp dedup)                                                  |

**Total: 3 tasks, 17 tests**

The poller loop itself (the `tokio::select!` loop that calls the client and emits events) is wired up in Plan 3 (Tauri Commands) because it needs `AppHandle` for event emission and `Arc<VercelState>` for state access. This plan provides all the building blocks.
