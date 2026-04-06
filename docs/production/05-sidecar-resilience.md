# Mission 05: Sidecar Resilience

> Health checks, auto-restart, graceful degradation.

---

## Why This Matters

The agent-bridge sidecar is the single point of communication between Orbit and Claude. If it dies silently, the user sees a frozen UI with no error message and no way to recover except force-quitting the app. Today, the sidecar has no health monitoring between requests, no automatic restart, a fire-and-forget shutdown with only 100ms grace period, and stderr output that vanishes into the void. A production code editor cannot have a single-process SPOF with no recovery path.

---

## Current State

### No Health Check Between Requests (bridge.rs:108-110)

The Rust side only discovers the sidecar is dead when it tries to send a request and gets an error. There is no periodic health check. If the sidecar crashes between conversations, the user won't know until they type their next message and get a cryptic error.

```rust
// Current: only checks on request
pub async fn send_request(&self, request: BridgeRequest) -> Result<BridgeResponse, String> {
    let child = self.child.lock().await;
    // If child is dead, this fails here -- no earlier detection
}
```

### check_and_recover() Detects but Doesn't Respawn (bridge.rs:169-191)

There is a `check_and_recover()` function that can detect a dead sidecar, but it only logs the death. It does not attempt to restart:

```rust
// Current: detect death, log it, return error
pub async fn check_and_recover(&self) -> Result<(), String> {
    let child = self.child.lock().await;
    match child.try_wait() {
        Ok(Some(status)) => {
            // Sidecar exited
            Err(format!("Sidecar exited with status: {}", status))
            // No restart attempt
        }
        _ => Ok(()),
    }
}
```

### Fire-and-Forget Shutdown (bridge.rs:355)

Shutdown sends a kill signal and waits only 100ms before moving on:

```rust
// Current: 100ms grace period, then abandon
pub async fn shutdown(&self) -> Result<(), String> {
    let mut child = self.child.lock().await;
    child.kill()?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(())
}
```

If the sidecar is mid-write (saving a file checkpoint), 100ms may not be enough. Data corruption is possible.

### Stderr Not Captured

Sidecar stderr is inherited from the parent process, meaning it goes to the Tauri console during development but vanishes entirely in production builds. Crash diagnostics are lost.

---

## What To Add

### Heartbeat System

```rust
// agent/health.rs

use tokio::time::{interval, Duration};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(5);

pub struct SidecarHealth {
    bridge: Arc<AgentBridge>,
    status: Arc<RwLock<HealthStatus>>,
}

#[derive(Clone, Debug)]
pub enum HealthStatus {
    Healthy,
    Degraded { last_error: String, since: Instant },
    Dead { exit_code: Option<i32>, since: Instant },
}

impl SidecarHealth {
    pub async fn start_monitoring(&self) {
        let mut tick = interval(HEARTBEAT_INTERVAL);
        loop {
            tick.tick().await;
            match self.ping().await {
                Ok(latency) => {
                    *self.status.write().await = HealthStatus::Healthy;
                    // Emit health event to frontend
                    self.emit_health(latency).await;
                }
                Err(e) => {
                    self.handle_failure(e).await;
                }
            }
        }
    }

    async fn ping(&self) -> Result<Duration, String> {
        let start = Instant::now();
        tokio::time::timeout(
            HEARTBEAT_TIMEOUT,
            self.bridge.send_request(BridgeRequest::Ping)
        )
        .await
        .map_err(|_| "Heartbeat timeout".to_string())?
        .map(|_| start.elapsed())
    }
}
```

### Auto-Restart with Exponential Backoff

```rust
// agent/restart.rs

const MAX_RESTART_ATTEMPTS: u32 = 5;
const BASE_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

pub struct RestartPolicy {
    attempts: u32,
    last_restart: Option<Instant>,
}

impl RestartPolicy {
    pub async fn restart_sidecar(&mut self, bridge: &AgentBridge) -> Result<(), String> {
        if self.attempts >= MAX_RESTART_ATTEMPTS {
            return Err(format!(
                "Sidecar restart failed after {} attempts. Manual restart required.",
                MAX_RESTART_ATTEMPTS
            ));
        }

        let backoff = std::cmp::min(
            BASE_BACKOFF * 2u32.pow(self.attempts),
            MAX_BACKOFF,
        );

        tokio::time::sleep(backoff).await;

        match bridge.spawn_sidecar().await {
            Ok(()) => {
                self.attempts = 0;
                self.last_restart = Some(Instant::now());
                Ok(())
            }
            Err(e) => {
                self.attempts += 1;
                Err(format!("Restart attempt {} failed: {}", self.attempts, e))
            }
        }
    }

    /// Reset attempt counter if sidecar has been stable for 5 minutes
    pub fn maybe_reset(&mut self) {
        if let Some(last) = self.last_restart {
            if last.elapsed() > Duration::from_secs(300) {
                self.attempts = 0;
            }
        }
    }
}
```

### Session State Preservation

```rust
// Before restart, save session state so the new sidecar can resume

pub struct SessionState {
    pub conversation_id: Option<String>,
    pub working_directory: PathBuf,
    pub environment: HashMap<String, String>,
}

impl AgentBridge {
    pub async fn save_session_state(&self) -> Result<SessionState, String> {
        // Capture current session from sidecar before it dies
        // or reconstruct from frontend state
    }

    pub async fn restore_session_state(&self, state: SessionState) -> Result<(), String> {
        // After restart, re-initialize sidecar with saved state
        self.send_request(BridgeRequest::RestoreSession(state)).await
    }
}
```

### Graceful Drain Shutdown

```rust
// Replace fire-and-forget with graceful drain

pub async fn shutdown_graceful(&self) -> Result<(), String> {
    // Phase 1: Signal drain (stop accepting new requests)
    self.send_request(BridgeRequest::Drain).await.ok();

    // Phase 2: Wait for in-flight operations (up to 5 seconds)
    let drain_timeout = Duration::from_secs(5);
    let drain_start = Instant::now();
    while drain_start.elapsed() < drain_timeout {
        if self.in_flight_count().await == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // Phase 3: SIGTERM with 2-second grace
    self.send_signal(Signal::Term)?;
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Phase 4: SIGKILL if still alive
    if self.is_alive().await {
        self.send_signal(Signal::Kill)?;
    }

    Ok(())
}
```

### Stderr Capture

```rust
// Redirect sidecar stderr to log file

use std::fs::OpenOptions;

fn create_stderr_log() -> Result<std::fs::File, String> {
    let log_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".orbit")
        .join("logs");
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log dir: {}", e))?;

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("sidecar.log"))
        .map_err(|e| format!("Failed to open sidecar log: {}", e))
}

// In sidecar spawn:
let stderr_log = create_stderr_log()?;
let child = Command::new(sidecar_path)
    .stderr(stderr_log)
    .spawn()?;
```

---

## What We Get

| Metric                               | Before                                 | After                                         |
| ------------------------------------ | -------------------------------------- | --------------------------------------------- |
| Time to detect dead sidecar          | Next user request (seconds to minutes) | 30 seconds (heartbeat)                        |
| Recovery from sidecar crash          | Manual app restart                     | Automatic with backoff (1-30s)                |
| Shutdown data loss risk              | High (100ms grace)                     | Low (5s drain + 2s SIGTERM)                   |
| Crash diagnostics                    | None (stderr lost)                     | Full stderr log at ~/.orbit/logs/sidecar.log  |
| Session continuity after crash       | Lost (start fresh)                     | Preserved (state save/restore)                |
| User-visible impact of sidecar crash | Frozen UI, cryptic error               | Brief "Reconnecting..." banner, auto-recovery |

---

## Estimated Complexity

**Large (3-5 days)**

- Day 1: Heartbeat system + health status enum + frontend health indicator
- Day 2: Auto-restart with exponential backoff + stability reset
- Day 3: Graceful drain shutdown + stderr capture
- Day 4: Session state preservation and restore after restart
- Day 5: Integration testing (kill sidecar during streaming, during shutdown, during idle)

---

## Dependencies

- Mission #06 (Error Resilience) provides the frontend error display for "Reconnecting..." state.
- Mission #10 (Observability) benefits from stderr capture -- sidecar logs become part of the observability story.

---

## Risks

| Risk                                                       | Mitigation                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Heartbeat adds overhead to idle sidecar                    | 30s interval is negligible. Ping payload is <100 bytes.                                                               |
| Auto-restart loops if sidecar has a persistent startup bug | MAX_RESTART_ATTEMPTS (5) caps the loop. After exhaustion, show "Manual restart required" with a button.               |
| Session restore may not be possible for all states         | Restore is best-effort. Active streaming can't resume -- show "Previous response was interrupted" and let user retry. |
| Graceful drain delays app quit                             | 5s timeout is the maximum. Most drains complete in <100ms. SIGKILL is the hard backstop.                              |
| Log file grows unbounded                                   | Rotate on startup: keep last 3 logs, delete older. Each log capped at 10MB.                                           |
