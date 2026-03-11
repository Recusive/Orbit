use std::env;
use std::io::{BufRead as _, BufReader};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter as _};

const PORT_RANGE_START: u16 = 4096;
const PORT_RANGE_END: u16 = 4196;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS: u64 = 3_000;

#[derive(Debug)]
/// Managed state for the OpenCode sidecar process.
pub struct OpenCodeProcessState {
    /// Running child process, if present.
    pub process: Arc<Mutex<Option<Child>>>,
    /// Bound HTTP port for the running sidecar.
    pub port: Arc<Mutex<Option<u16>>>,
    /// Last known health state from the startup health check.
    pub healthy: Arc<AtomicBool>,
    /// Resolved path to the sidecar binary, if available.
    pub binary_path: Arc<Mutex<Option<PathBuf>>>,
}

impl OpenCodeProcessState {
    /// Create a new OpenCode process state container.
    pub fn new(binary_path: Option<PathBuf>) -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            port: Arc::new(Mutex::new(None)),
            healthy: Arc::new(AtomicBool::new(false)),
            binary_path: Arc::new(Mutex::new(binary_path)),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// Payload emitted when OpenCode becomes ready.
pub struct OpenCodeReadyEvent {
    /// Bound port for the healthy sidecar.
    pub port: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// Payload emitted when the OpenCode child process exits unexpectedly.
pub struct OpenCodeCrashedEvent {
    /// Human-readable crash description.
    pub error: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// Serializable snapshot of the OpenCode process state.
pub struct OpenCodeStatus {
    /// Whether the process is currently running.
    pub running: bool,
    /// Bound port when the process is running.
    pub port: Option<u16>,
    /// Whether the process last passed the health check.
    pub healthy: bool,
    /// Resolved binary path when available.
    pub binary_path: Option<String>,
    /// Human-readable status error, usually for missing binaries.
    pub error: Option<String>,
}

/// Resolve the bundled or development OpenCode binary path.
pub fn resolve_opencode_binary_path() -> Result<PathBuf, String> {
    let target_triple = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        }
    } else if cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let binary_name = format!("orbit-server-{target_triple}");

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled = exe_dir.join("orbit-server");
            if bundled.exists() {
                return Ok(bundled);
            }

            let bundled_named = exe_dir.join(&binary_name);
            if bundled_named.exists() {
                return Ok(bundled_named);
            }
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&binary_name);

    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("orbit-server binary not found. Run `bun run build:opencode` first.".to_owned())
}

/// Find an available TCP port for the OpenCode server.
pub fn find_available_port() -> Option<u16> {
    (PORT_RANGE_START..PORT_RANGE_END).find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

/// Forward child stdout and stderr to the Rust logger.
pub fn spawn_log_readers(child: &mut Child) {
    if let Some(stdout) = child.stdout.take() {
        drop(thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                log::info!("[opencode] {line}");
            }
        }));
    }

    if let Some(stderr) = child.stderr.take() {
        drop(thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if line.contains("error") || line.contains("Error") || line.contains("ERROR") {
                    log::error!("[opencode] {line}");
                } else {
                    log::warn!("[opencode] {line}");
                }
            }
        }));
    }
}

/// Gracefully terminate the OpenCode child process with a kill fallback.
pub fn graceful_terminate(child: &mut Child) {
    let pid = child.id().to_string();

    #[cfg(unix)]
    {
        drop(
            Command::new("kill")
                .args(["-TERM", &pid])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status(),
        );
    }

    #[cfg(windows)]
    {
        drop(
            Command::new("taskkill")
                .args(["/PID", &pid, "/T"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status(),
        );
    }

    let start = Instant::now();
    let timeout = Duration::from_millis(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    loop {
        match child.try_wait() {
            Ok(None) => {
                if start.elapsed() > timeout {
                    drop(child.kill());
                    drop(child.wait());
                    return;
                }
                #[expect(
                    clippy::disallowed_methods,
                    reason = "Intentional std::thread::sleep in synchronous shutdown polling loop"
                )]
                thread::sleep(Duration::from_millis(100));
            },
            Ok(Some(_)) | Err(_) => return,
        }
    }
}

/// Ask the OpenCode HTTP server to dispose itself before shutdown.
pub async fn request_dispose(port: u16) {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/global/dispose");
    drop(client.post(url).send().await);
}

/// Build a serializable status snapshot from the current process state.
pub fn current_status(state: &OpenCodeProcessState) -> OpenCodeStatus {
    let mut running = false;
    {
        let mut guard = state.process.lock();
        if let Some(child) = guard.as_mut() {
            running = matches!(child.try_wait(), Ok(None));
        }
    }

    let binary_path = state
        .binary_path
        .lock()
        .clone()
        .map(|path| path.display().to_string());

    OpenCodeStatus {
        running,
        port: *state.port.lock(),
        healthy: state.healthy.load(Ordering::SeqCst),
        error: binary_path.is_none().then(|| {
            "orbit-server binary not found. Run `bun run build:opencode` first.".to_owned()
        }),
        binary_path,
    }
}

/// Start a background monitor that emits a crash event if the child exits.
pub fn start_monitor(
    app: AppHandle,
    process: Arc<Mutex<Option<Child>>>,
    port: Arc<Mutex<Option<u16>>>,
    healthy: Arc<AtomicBool>,
    pid: u32,
) {
    drop(thread::spawn(move || loop {
        #[expect(
            clippy::disallowed_methods,
            reason = "Intentional std::thread::sleep in dedicated OS monitor thread, not async"
        )]
        thread::sleep(Duration::from_secs(1));

        let mut guard = process.lock();
        let Some(child) = guard.as_mut() else {
            break;
        };

        if child.id() != pid {
            break;
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                drop(guard.take());
                *port.lock() = None;
                healthy.store(false, Ordering::SeqCst);
                drop(app.emit(
                    "opencode:crashed",
                    OpenCodeCrashedEvent {
                        error: format!("OpenCode exited with status {status}"),
                    },
                ));
                break;
            },
            Ok(None) => {},
            Err(error) => {
                drop(guard.take());
                *port.lock() = None;
                healthy.store(false, Ordering::SeqCst);
                drop(app.emit(
                    "opencode:crashed",
                    OpenCodeCrashedEvent {
                        error: format!("Failed to poll OpenCode process: {error}"),
                    },
                ));
                break;
            },
        }
    }));
}
