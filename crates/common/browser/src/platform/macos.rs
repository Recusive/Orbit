//! macOS browser window operations using AppleScript.
//!
//! # How it works
//!
//! Uses AppleScript via `osascript` to:
//! - Find Playwright-spawned browser windows
//! - Position windows through System Events
//!
//! # Requirements
//!
//! The app needs Accessibility permissions to control other apps.
//! Users will be prompted to grant access in System Settings > Privacy > Accessibility.

use std::process::Command;

use super::WindowBounds;
use crate::{BrowserError, Result};

/// Find a browser window spawned by Playwright (or Safari for testing).
///
/// Searches for processes that match Playwright's browser naming patterns.
/// Also supports Safari (WebKit) for manual testing.
pub(super) fn find_playwright_window() -> Option<u32> {
    // AppleScript to find browser process
    // Priority: Playwright WebKit > Safari (for testing - also WebKit)
    let script = r#"
        tell application "System Events"
            -- Try to find Playwright process first
            set playwrightProcs to every process whose name contains "Playwright"
            if (count of playwrightProcs) > 0 then
                return unix id of first item of playwrightProcs
            end if

            -- Look for Safari (WebKit - for testing)
            set safariProcs to every process whose name is "Safari"
            if (count of safariProcs) > 0 then
                return unix id of first item of safariProcs
            end if

            return ""
        end tell
    "#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;

    if !output.status.success() {
        log::debug!("osascript find_playwright_window failed");
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let pid_str = stdout.trim();

    if pid_str.is_empty() {
        log::debug!("No Playwright browser window found");
        return None;
    }

    pid_str.parse::<u32>().ok()
}

/// Set window position and size by PID using AppleScript.
pub(super) fn set_window_bounds(pid: u32, bounds: WindowBounds) -> Result<()> {
    let script = format!(
        r#"
        tell application "System Events"
            try
                set targetProcess to first process whose unix id is {pid}
                tell targetProcess
                    if (count of windows) > 0 then
                        set frontWindow to first window
                        set position of frontWindow to {{{x}, {y}}}
                        set size of frontWindow to {{{width}, {height}}}
                        -- Bring to front
                        set frontmost to true
                        return "positioned"
                    else
                        return "no windows"
                    end if
                end tell
            on error errMsg
                return "error: " & errMsg
            end try
        end tell
        "#,
        pid = pid,
        x = bounds.x,
        y = bounds.y,
        width = bounds.width,
        height = bounds.height
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| BrowserError::PositioningFailed(format!("Failed to run osascript: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();

    if !output.status.success() || stdout.starts_with("error:") || stdout == "no windows" {
        log::warn!("Window positioning issue: stdout={stdout}, stderr={stderr}");
    } else {
        log::debug!("Window positioned successfully");
    }

    Ok(())
}
