//! OpenCode lifecycle commands for managing the sidecar process.

#![expect(
    clippy::unreachable,
    reason = "Tauri command macro generates unreachable!() for exhaustive match arms"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]
#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri State<'_> is a thin reference wrapper passed by value by design"
)]

use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter as _, State};
use tokio::time::sleep;

use crate::opencode::process::{
    current_status, find_available_port, graceful_terminate, request_dispose,
    resolve_opencode_binary_path, spawn_log_readers, start_monitor, OpenCodeProcessState,
    OpenCodeReadyEvent, OpenCodeStatus,
};

async fn wait_for_health(port: u16) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/global/health");

    for _ in 0_i32..40_i32 {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }

        sleep(Duration::from_millis(250)).await;
    }

    Err(format!(
        "OpenCode health check timed out for http://127.0.0.1:{port}/global/health"
    ))
}

/// Start the managed OpenCode sidecar and wait for it to become healthy.
#[tauri::command]
pub async fn opencode_start(
    app: AppHandle,
    state: State<'_, OpenCodeProcessState>,
) -> Result<u16, String> {
    {
        let mut guard = state.process.lock();
        if let Some(child) = (*guard).as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    let port_value = *state.port.lock();
                    if let Some(port) = port_value {
                        return Ok(port);
                    }
                },
                Ok(Some(_)) | Err(_) => {
                    drop(guard.take());
                    *state.port.lock() = None;
                    state.healthy.store(false, Ordering::SeqCst);
                },
            }
        }
    }

    let binary_path = {
        let existing = state.binary_path.lock().clone();
        if let Some(path) = existing {
            path
        } else {
            let resolved = resolve_opencode_binary_path()?;
            *state.binary_path.lock() = Some(resolved.clone());
            resolved
        }
    };

    let mut last_error: Option<String> = None;

    for _ in 0_i32..5_i32 {
        let port: u16 = match find_available_port() {
            Some(port) => port,
            None => {
                last_error = Some("No available port found for OpenCode".to_owned());
                continue;
            },
        };

        let mut child = Command::new(&binary_path)
            .args(["serve", "--port", &port.to_string()])
            .env("OPENCODE_DISABLE_CHANNEL_DB", "1")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to spawn OpenCode: {error}"))?;

        let pid = child.id();
        spawn_log_readers(&mut child);

        {
            let mut guard = state.process.lock();
            *guard = Some(child);
            *state.port.lock() = Some(port);
            state.healthy.store(false, Ordering::SeqCst);
        }

        match wait_for_health(port).await {
            Ok(()) => {
                state.healthy.store(true, Ordering::SeqCst);
                start_monitor(
                    app.clone(),
                    Arc::clone(&state.process),
                    Arc::clone(&state.port),
                    Arc::clone(&state.healthy),
                    pid,
                );
                app.emit("opencode:ready", OpenCodeReadyEvent { port })
                    .map_err(|error| format!("Failed to emit OpenCode ready event: {error}"))?;
                return Ok(port);
            },
            Err(error) => {
                last_error = Some(error);
                let child_value = state.process.lock().take();
                if let Some(mut child) = child_value {
                    graceful_terminate(&mut child);
                }
                *state.port.lock() = None;
                state.healthy.store(false, Ordering::SeqCst);
            },
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to start OpenCode".to_owned()))
}

/// Stop the managed OpenCode sidecar and dispose server resources.
#[tauri::command]
pub async fn opencode_stop(state: State<'_, OpenCodeProcessState>) -> Result<(), String> {
    let port = state.port.lock().take();
    if let Some(port) = port {
        request_dispose(port).await;
    }

    let child_value = state.process.lock().take();
    if let Some(mut child) = child_value {
        graceful_terminate(&mut child);
    }

    state.healthy.store(false, Ordering::SeqCst);
    Ok(())
}

/// Return the current OpenCode process status.
#[tauri::command]
pub fn opencode_status(state: State<'_, OpenCodeProcessState>) -> Result<OpenCodeStatus, String> {
    Ok(current_status(&state))
}
