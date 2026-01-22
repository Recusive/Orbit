//! Search commands
//!
//! Errors are captured to Sentry for monitoring via the `SentryCapture` trait.
//!
//! # File Index
//!
//! The file index provides fast fuzzy search for @ mention file picking.
//! It indexes code files on workspace open and incrementally updates on changes.
//!
//! # File Watcher
//!
//! The file watcher monitors the workspace for file changes and updates the index
//! incrementally. Events are batched over a 100ms window to handle bulk operations
//! like `git checkout` or `npm install` efficiently.

#![expect(
    clippy::unreachable,
    reason = "Tauri command macro generates unreachable!() for exhaustive match arms"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::Duration;

use tokio::task::spawn_blocking;

use log::{debug, info, warn};
use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher as _};
use orbit_core::{FuzzySearchResult, Result, SearchOptions, SearchResult, TextSearchResult};
use orbit_search::{FileIndex, IndexEntry, SearchManager};
use parking_lot::{Mutex, RwLock};
use tauri::{AppHandle, State};

use crate::core::sentry_utils::SentryCapture as _;

static SEARCH_MANAGER: OnceLock<SearchManager> = OnceLock::new();

fn get_search_manager() -> &'static SearchManager {
    SEARCH_MANAGER.get_or_init(SearchManager::new)
}

// ============================================
// File Index State
// ============================================

/// Shared state for the file index.
///
/// Uses `RwLock` for concurrent reads during search (common case)
/// while allowing exclusive writes during index build/update.
pub type FileIndexState = Arc<RwLock<Option<FileIndex>>>;

// ============================================
// File Index Commands
// ============================================

/// Build the file index for a workspace.
///
/// This scans all indexable files in the workspace and stores them
/// in memory for fast fuzzy searching. The scan runs on a blocking
/// thread pool to avoid blocking the async runtime.
#[tauri::command]
pub async fn build_file_index(
    root_path: String,
    index: State<'_, FileIndexState>,
    app: AppHandle,
) -> Result<()> {
    let root = PathBuf::from(&root_path);
    let index_state = Arc::clone(&index);

    // Build index on blocking thread pool (filesystem walk is sync)
    let built_index = spawn_blocking(move || FileIndex::build(root))
        .await
        .map_err(|e| orbit_core::Error::Other(format!("Failed to build file index: {e}")))
        .capture("build_file_index")?;

    let entry_count = built_index.len();

    // Store in state
    {
        let mut guard = index_state.write();
        *guard = Some(built_index);
    }

    info!(
        target: "orbit::search",
        "File index built with {entry_count} files for {root_path}"
    );

    // Start file watcher for incremental updates
    // Ignore result - watcher failure shouldn't prevent index from being used
    drop(start_file_index_watcher(
        &root_path,
        Arc::clone(&index),
        &app,
    ));

    Ok(())
}

/// Fuzzy search for files matching a query.
///
/// Returns results sorted by match score (highest first).
/// For empty queries, returns initial files sorted alphabetically.
/// Uses a read lock for concurrent access during searches.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command signature requires owned types"
)]
pub fn fuzzy_search_files(
    query: String,
    max_results: Option<u32>,
    index: State<'_, FileIndexState>,
) -> Result<Vec<FuzzySearchResult>> {
    // Default to 50, cap at 100
    let limit = max_results.map_or(50, |n| n.min(100)) as usize;

    // Read lock for concurrent searches
    let guard = index.read();
    let file_index = guard
        .as_ref()
        .ok_or_else(|| orbit_core::Error::Other("File index not built".to_owned()))
        .capture("fuzzy_search_files")?;

    // search() handles empty query by returning initial files
    Ok(file_index.search(&query, limit))
}

/// Clear the file index and stop the file watcher.
///
/// Called when closing a workspace or switching to a different project.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command signature requires owned types"
)]
pub fn clear_file_index(index: State<'_, FileIndexState>) -> Result<()> {
    // Stop file watcher (stub for now)
    stop_file_index_watcher();

    // Clear index with write lock
    {
        let mut guard = index.write();
        *guard = None;
    }

    debug!(target: "orbit::search", "File index cleared");

    Ok(())
}

// ============================================
// File Watcher Implementation
// ============================================

/// Global storage for the file watcher.
///
/// Only one watcher can be active at a time (one workspace).
static FILE_INDEX_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

/// Batch window for collecting file events before flushing to the index.
///
/// This handles bulk operations like `git checkout` or `npm install` efficiently
/// by collecting all events over 100ms before applying them in one batch.
const BATCH_WINDOW: Duration = Duration::from_millis(100);

/// Batches file events and applies them to the index after a delay.
///
/// This prevents excessive index updates when many files change rapidly.
struct BatchedUpdater {
    /// Reference to the file index state.
    index: FileIndexState,
    /// Root path of the workspace (for rebuilding).
    root_path: PathBuf,
    /// Files to add to the index.
    pending_adds: Mutex<HashSet<PathBuf>>,
    /// Files to remove from the index.
    pending_removes: Mutex<HashSet<PathBuf>>,
    /// Whether a flush has been scheduled.
    flush_scheduled: AtomicBool,
}

impl BatchedUpdater {
    /// Create a new batched updater for the given index.
    fn new(index: FileIndexState, root_path: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            index,
            root_path,
            pending_adds: Mutex::new(HashSet::new()),
            pending_removes: Mutex::new(HashSet::new()),
            flush_scheduled: AtomicBool::new(false),
        })
    }

    /// Queue a file to be added to the index.
    ///
    /// If the file is in pending_removes, cancel the remove instead.
    fn queue_add(self: &Arc<Self>, path: PathBuf) {
        // Skip non-indexable files
        if !IndexEntry::is_indexable(&path) {
            return;
        }

        // If pending removal, just cancel the remove
        {
            let mut removes = self.pending_removes.lock();
            if removes.remove(&path) {
                return;
            }
        }

        // Add to pending adds
        {
            let mut adds = self.pending_adds.lock();
            let _ = adds.insert(path);
        }

        self.schedule_flush();
    }

    /// Queue a file to be removed from the index.
    ///
    /// If the file is in pending_adds, cancel the add instead.
    fn queue_remove(self: &Arc<Self>, path: PathBuf) {
        // If pending add, just cancel the add
        {
            let mut adds = self.pending_adds.lock();
            if adds.remove(&path) {
                return;
            }
        }

        // Add to pending removes
        {
            let mut removes = self.pending_removes.lock();
            let _ = removes.insert(path);
        }

        self.schedule_flush();
    }

    /// Schedule a flush after the batch window if not already scheduled.
    fn schedule_flush(self: &Arc<Self>) {
        // Already scheduled?
        if self.flush_scheduled.swap(true, Ordering::SeqCst) {
            return;
        }

        let updater = Arc::clone(self);
        let _ = thread::spawn(move || {
            // Using std::thread::sleep is intentional here - this is a dedicated OS
            // thread for batching file events, not async code. Using tokio::time::sleep
            // would require an async runtime which adds unnecessary complexity.
            #[expect(
                clippy::disallowed_methods,
                reason = "Intentional std::thread::sleep in dedicated OS thread, not async context"
            )]
            thread::sleep(BATCH_WINDOW);

            // Reset flag BEFORE flushing so new events can schedule another flush
            updater.flush_scheduled.store(false, Ordering::SeqCst);

            updater.flush();
        });
    }

    /// Flush pending changes to the index.
    fn flush(&self) {
        // Drain pending changes
        let adds: Vec<PathBuf> = {
            let mut guard = self.pending_adds.lock();
            guard.drain().collect()
        };
        let removes: Vec<PathBuf> = {
            let mut guard = self.pending_removes.lock();
            guard.drain().collect()
        };

        let add_count = adds.len();
        let remove_count = removes.len();

        if add_count == 0 && remove_count == 0 {
            return;
        }

        // Apply changes with write lock
        {
            let mut guard = self.index.write();
            if let Some(ref mut index) = *guard {
                // Remove first, then add (handles rename as remove+add)
                for path in removes {
                    index.remove(&path);
                }
                for path in adds {
                    index.add(path);
                }
            }
        }

        debug!(
            target: "orbit::search",
            "File index updated: +{add_count} -{remove_count} files"
        );
    }

    /// Rebuild the entire index (for .gitignore changes).
    fn rebuild(self: &Arc<Self>) {
        let root = self.root_path.clone();
        let index_state = Arc::clone(&self.index);

        let _ = thread::spawn(move || {
            debug!(target: "orbit::search", "Rebuilding file index due to ignore file change");

            let new_index = FileIndex::build(root);
            let entry_count = new_index.len();

            {
                let mut guard = index_state.write();
                *guard = Some(new_index);
            }

            info!(
                target: "orbit::search",
                "File index rebuilt with {entry_count} files"
            );
        });
    }
}

/// Start watching for file changes to keep the index updated.
///
/// The watcher monitors the workspace for file create/delete/rename events
/// and updates the index incrementally. Events are batched to handle bulk
/// operations efficiently.
fn start_file_index_watcher(
    root_path: &str,
    index: FileIndexState,
    _app: &AppHandle,
) -> Result<()> {
    let root = PathBuf::from(root_path);
    let updater = BatchedUpdater::new(index, root.clone());

    // Create the watcher with event callback
    let updater_for_callback = Arc::clone(&updater);
    let watcher_result = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let event = match res {
            Ok(e) => e,
            Err(e) => {
                warn!(target: "orbit::search", "File watcher error: {e}");
                return;
            },
        };

        match event.kind {
            // File created or rename "to" (new file appears)
            EventKind::Create(CreateKind::File)
            | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                for path in event.paths {
                    updater_for_callback.queue_add(path);
                }
            },

            // File deleted or rename "from" (file disappears)
            EventKind::Remove(RemoveKind::File)
            | EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                for path in event.paths {
                    updater_for_callback.queue_remove(path);
                }
            },

            // File renamed (both old and new path provided)
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                if let (Some(old_path), Some(new_path)) = (event.paths.first(), event.paths.get(1))
                {
                    updater_for_callback.queue_remove(old_path.clone());
                    updater_for_callback.queue_add(new_path.clone());
                }
            },

            // Data modified - check if it's an ignore file
            EventKind::Modify(ModifyKind::Data(_)) => {
                for path in &event.paths {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name == ".gitignore" || name == ".ignore" {
                            // Rebuild index when ignore files change
                            updater_for_callback.rebuild();
                            break;
                        }
                    }
                }
            },

            // Ignore other events
            _ => {},
        }
    });

    let mut watcher = watcher_result
        .map_err(|e| orbit_core::Error::Other(format!("Failed to create file watcher: {e}")))?;

    // Watch the workspace recursively
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| orbit_core::Error::Other(format!("Failed to watch workspace: {e}")))?;

    // Store watcher in global (drops any previous watcher)
    {
        let mut guard = FILE_INDEX_WATCHER.lock();
        *guard = Some(watcher);
    }

    debug!(
        target: "orbit::search",
        "File watcher started for {root_path}"
    );

    Ok(())
}

/// Stop the file watcher.
///
/// Drops the watcher which stops all file monitoring.
fn stop_file_index_watcher() {
    let was_present = {
        let mut guard = FILE_INDEX_WATCHER.lock();
        guard.take().is_some()
    };

    if was_present {
        debug!(target: "orbit::search", "File watcher stopped");
    }
}

/// Search for files matching a query
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command with many optional params"
)]
pub async fn search_files(
    root_path: String,
    query: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    regex: Option<bool>,
    include: Option<Vec<String>>,
    exclude: Option<Vec<String>>,
    max_results: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let options = SearchOptions {
        case_sensitive,
        whole_word,
        regex,
        include,
        exclude,
        max_results,
    };
    get_search_manager()
        .search_files(&root_path, &query, Some(options))
        .await
        .capture("search_files")
}

/// Search for text within files
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command with many optional params"
)]
pub async fn search_text(
    root_path: String,
    pattern: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    regex: Option<bool>,
    include: Option<Vec<String>>,
    exclude: Option<Vec<String>>,
    max_results: Option<u32>,
) -> Result<Vec<TextSearchResult>> {
    let options = SearchOptions {
        case_sensitive,
        whole_word,
        regex,
        include,
        exclude,
        max_results,
    };
    get_search_manager()
        .search_text(&root_path, &pattern, Some(options))
        .await
        .capture("search_text")
}
