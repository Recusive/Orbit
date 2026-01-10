//! Performance logging for Git operations
//!
//! Provides timing utilities and logging for git operations with item counts.
//! Output format: `[GIT:operation] END (150ms) - 47 files checked`

use std::time::Instant;
use tracing::info;

/// Start a performance measurement for a git operation.
#[must_use]
pub fn start(operation: &str) -> PerfTimer {
    info!(target: "git_perf", "[GIT:{operation}] START");
    PerfTimer {
        operation: operation.to_owned(),
        start: Instant::now(),
    }
}

/// A timer for measuring git operation performance.
#[derive(Debug)]
pub struct PerfTimer {
    operation: String,
    start: Instant,
}

impl PerfTimer {
    /// End the timer and log the duration.
    pub fn end(self) {
        let elapsed = self.start.elapsed();
        let ms = elapsed.as_millis();
        info!(target: "git_perf", "[GIT:{}] END ({}ms)", self.operation, ms);
    }

    /// End the timer and log the duration with an item count.
    pub fn end_with_count(self, count: usize, item_name: &str) {
        let elapsed = self.start.elapsed();
        let ms = elapsed.as_millis();
        info!(
            target: "git_perf",
            "[GIT:{}] END ({}ms) - {} {}",
            self.operation,
            ms,
            count,
            item_name
        );
    }
}

/// Macro for timing a git operation with optional item count.
///
/// # Usage
///
/// ```ignore
/// // Simple timing
/// git_perf!("status", {
///     do_status()
/// })
///
/// // With item count
/// git_perf!("status", result, {
///     let files = do_status()?;
///     (files.len(), "files checked", files)
/// })
/// ```
#[macro_export]
macro_rules! git_perf {
    // Simple timing without item count
    ($operation:expr, $block:block) => {{
        let __perf_timer = $crate::perf::start($operation);
        let __result = $block;
        __perf_timer.end();
        __result
    }};

    // Timing with item count - block returns (count, item_name, result)
    ($operation:expr, count, $block:block) => {{
        let __perf_timer = $crate::perf::start($operation);
        let (__count, __item_name, __result) = $block;
        __perf_timer.end_with_count(__count, __item_name);
        __result
    }};
}
