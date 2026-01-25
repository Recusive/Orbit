import { createLogger } from '@orbit/common/lib';

import { watchPath, onFileChange } from '@/lib/api';

const logger = createLogger('FileWatcher');

// ═══════════════════════════════════════════════════════════════
// File Watcher Singleton
// NOTE: Terminal and agent listeners are now initialized by TauriProvider
// This ensures proper React lifecycle management and HMR support
// ═══════════════════════════════════════════════════════════════

let fileWatcherInitialized = false;
let watchedWorkspacePath: string | null = null;

/**
 * Normalize path separators for cross-platform compatibility.
 * Converts Windows backslashes to forward slashes.
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Paths to ignore for file watching (reduces noise) */
const IGNORED_PATH_PATTERNS = [
  // Version control
  '/.git/',
  // JavaScript/Node
  '/node_modules/',
  '/.next/',
  '/dist/',
  '/build/',
  '/.turbo/',
  '/.parcel-cache/',
  // Python
  '/venv/',
  '/.venv/',
  '/site-packages/',
  '/__pycache__/',
  '/.mypy_cache/',
  '/.pytest_cache/',
  '/env/',
  '/.env/',
  // Rust
  '/target/',
  // General
  '/.cache/',
  '/.DS_Store',
  '/coverage/',
  '/.idea/',
  '/.vscode/',
];

/**
 * Check if a path should be ignored.
 * Normalizes path separators and handles case-insensitivity on macOS/Windows.
 */
function shouldIgnorePath(path: string): boolean {
  const normalized = normalizePath(path);
  // Use case-insensitive matching on macOS/Windows (isLinux is set after platform detection)
  const comparePath = isLinux ? normalized : normalized.toLowerCase();
  return IGNORED_PATH_PATTERNS.some((pattern) => {
    const comparePattern = isLinux ? pattern : pattern.toLowerCase();
    return comparePath.includes(comparePattern);
  });
}

// ═══════════════════════════════════════════════════════════════
// VS Code-style Event Batching & Coalescing
// Architecture: Events → 75ms batch → coalesce → throttle → emit
// Source: vscode/src/vs/platform/files/node/watcher/
// ═══════════════════════════════════════════════════════════════

interface FileChangeEvent {
  path: string;
  type: string;
}

// Platform detection for case sensitivity (VS Code: watcher.ts:384-388)
// Uses modern userAgentData API with fallback to userAgent parsing
function detectPlatform(): { isMac: boolean; isWindows: boolean; isLinux: boolean } {
  if (typeof navigator === 'undefined') {
    return { isMac: false, isWindows: false, isLinux: true }; // SSR fallback: case-sensitive
  }
  // Modern API (Chrome 90+, Edge 90+, Opera 76+)
  // userAgentData is not in standard TS types yet, but supported in Chromium
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform: string = nav.userAgentData?.platform?.toLowerCase() ?? '';
  if (platform) {
    return {
      isMac: platform.includes('mac'),
      isWindows: platform.includes('win'),
      isLinux: !platform.includes('mac') && !platform.includes('win'),
    };
  }
  // Fallback to userAgent (deprecated but widely supported)
  const ua = navigator.userAgent.toLowerCase();
  return {
    isMac: ua.includes('mac'),
    isWindows: ua.includes('win'),
    isLinux: !ua.includes('mac') && !ua.includes('win'),
  };
}

const { isLinux } = detectPlatform();

/**
 * Get map key for path (case-insensitive on macOS/Windows)
 * Source: VS Code watcher.ts:383-389
 */
function toKey(path: string): string {
  return isLinux ? path : path.toLowerCase();
}

/**
 * Check if parent is a parent path of child
 * Source: VS Code watcher.ts:460
 * Normalizes path separators and handles case-insensitivity on macOS/Windows.
 */
function isParentPath(parent: string, child: string): boolean {
  // Normalize path separators for cross-platform support
  const normalizedParent = normalizePath(parent.endsWith('/') ? parent : parent + '/');
  const normalizedChild = normalizePath(child);
  // Case-insensitive on macOS/Windows
  const parentCmp = isLinux ? normalizedParent : normalizedParent.toLowerCase();
  const childCmp = isLinux ? normalizedChild : normalizedChild.toLowerCase();
  return childCmp.startsWith(parentCmp);
}

/**
 * Check if a path is within the watched workspace.
 * Uses case-insensitive comparison on macOS/Windows.
 */
function isInWorkspace(eventPath: string, workspace: string): boolean {
  return isParentPath(workspace, eventPath);
}

/**
 * Filter out child delete events when parent is deleted
 * Source: VS Code watcher.ts:438-468
 */
function filterChildDeletes(events: FileChangeEvent[]): FileChangeEvent[] {
  const addOrChange: FileChangeEvent[] = [];
  const deletedPaths: string[] = [];

  // Split ADD/CHANGE and DELETE events
  const deletes = events.filter((e) => {
    if (e.type !== 'deleted') {
      addOrChange.push(e);
      return false;
    }
    return true;
  });

  // Sort deletes by path length (shortest first)
  deletes.sort((a, b) => a.path.length - b.path.length);

  // Filter child deletes - if parent is deleted, skip child deletes
  const filteredDeletes = deletes.filter((e) => {
    const isChildOfDeleted = deletedPaths.some((deletedPath) => isParentPath(deletedPath, e.path));
    if (isChildOfDeleted) return false;

    deletedPaths.push(e.path);
    return true;
  });

  return [...filteredDeletes, ...addOrChange];
}

/**
 * Coalesce events using VS Code's exact rules
 * Source: VS Code watcher.ts:378-469
 *
 * Rules:
 * - ADDED + DELETED → remove both (cancelled out)
 * - DELETED + ADDED → UPDATED (atomic save)
 * - ADDED + UPDATED → keep as ADDED
 * - Case rename (macOS/Windows) → keep both events
 * - Parent delete absorbs child deletes
 */
function coalesceEvents(events: FileChangeEvent[]): FileChangeEvent[] {
  const coalesced = new Set<FileChangeEvent>();
  const mapPathToChange = new Map<string, FileChangeEvent>();

  for (const event of events) {
    const key = toKey(event.path);
    const existing = mapPathToChange.get(key);

    let keepEvent = false;

    if (existing) {
      // Case rename: paths differ in case only (macOS/Windows)
      // Keep both events for case-sensitive rename detection
      if (existing.path !== event.path && (event.type === 'deleted' || event.type === 'created')) {
        keepEvent = true;
      }
      // ADDED + DELETED → remove both (file created and deleted in same batch)
      else if (existing.type === 'created' && event.type === 'deleted') {
        mapPathToChange.delete(key);
        coalesced.delete(existing);
      }
      // DELETED + ADDED → UPDATED (atomic save pattern)
      else if (existing.type === 'deleted' && event.type === 'created') {
        existing.type = 'modified';
      }
      // ADDED + UPDATED → keep as ADDED (new file being modified)
      else if (existing.type === 'created' && event.type === 'modified') {
        // Do nothing, keep original ADDED event
      }
      // Otherwise use latest type
      else {
        existing.type = event.type;
      }
    } else {
      keepEvent = true;
    }

    if (keepEvent) {
      coalesced.add(event);
      mapPathToChange.set(key, event);
    }
  }

  // Parent folder optimization: filter child deletes
  return filterChildDeletes(Array.from(coalesced));
}

// ═══════════════════════════════════════════════════════════════
// ThrottledWorker - Spam Prevention
// Source: VS Code parcelWatcher.ts:181-188
// Config: maxWorkChunkSize=500, throttleDelay=200ms, maxBufferedWork=30000
// ═══════════════════════════════════════════════════════════════

interface ThrottledWorkerConfig {
  maxWorkChunkSize: number; // Max events per batch
  throttleDelay: number; // Rest time between batches (ms)
  maxBufferedWork: number; // Max queue size before dropping
}

class ThrottledWorker {
  private buffer: FileChangeEvent[] = [];
  private pending = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private config: ThrottledWorkerConfig = {
    maxWorkChunkSize: 500, // VS Code: process up to 500 changes at once
    throttleDelay: 200, // VS Code: rest for 200ms between batches
    maxBufferedWork: 30000, // VS Code: never buffer more than 30000 events
  };

  work(events: FileChangeEvent[]): void {
    // Drop if buffer is full (prevents memory explosion)
    if (this.buffer.length >= this.config.maxBufferedWork) {
      logger.warn('Buffer full, dropping events');
      return;
    }

    this.buffer.push(...events);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.pending) return;
    this.pending = true;

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.flush();
    }, this.config.throttleDelay);
  }

  private flush(): void {
    this.pending = false;

    // Process up to maxWorkChunkSize
    const chunk = this.buffer.splice(0, this.config.maxWorkChunkSize);

    // Emit chunk
    for (const event of chunk) {
      window.postMessage(
        {
          type: 'file:changed',
          uuid: crypto.randomUUID(),
          path: event.path,
          change_type: event.type,
        },
        '*'
      );
    }

    // If more in buffer, schedule next flush
    if (this.buffer.length > 0) {
      this.scheduleFlush();
    }
  }

  /** Cleanup for HMR - clears pending timers and buffer */
  dispose(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.buffer = [];
    this.pending = false;
  }
}

const throttledWorker = new ThrottledWorker();

// ═══════════════════════════════════════════════════════════════
// RunOnceWorker - 75ms Event Batching
// Source: VS Code parcelWatcher.ts:177
// "Parcel internally uses 50ms as delay, so we use 75ms"
// ═══════════════════════════════════════════════════════════════

/** VS Code's magic number - aggregate events for 75ms before processing */
const FILE_CHANGES_HANDLER_DELAY = 75;

/** Batch of pending events waiting to be coalesced and emitted */
let batchedEvents: FileChangeEvent[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue a file change event for batched processing.
 * Events are collected for 75ms, then coalesced and throttle-emitted.
 */
function queueFileChange(path: string, changeType: string): void {
  batchedEvents.push({ path, type: changeType });

  // Start batch timer if not already running
  batchTimeout ??= setTimeout(() => {
    const events = batchedEvents;
    batchedEvents = [];
    batchTimeout = null;

    // Coalesce events (dedupe, merge, parent optimization)
    const coalesced = coalesceEvents(events);

    // Throttle emit (max 500/batch, 200ms rest)
    if (coalesced.length > 0) {
      throttledWorker.work(coalesced);
    }
  }, FILE_CHANGES_HANDLER_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// File Watcher Initialization
// ═══════════════════════════════════════════════════════════════

export async function initFileWatcher(workspacePath: string): Promise<void> {
  // If already watching this path, skip
  if (fileWatcherInitialized && watchedWorkspacePath === workspacePath) {
    return;
  }

  // If watching a different path, we're switching workspaces
  if (fileWatcherInitialized && watchedWorkspacePath && watchedWorkspacePath !== workspacePath) {
    // Unwatch old workspace
    try {
      const { unwatchPath } = await import('@/lib/api');
      await unwatchPath(watchedWorkspacePath);
      logger.info('Unwatched old workspace', { path: watchedWorkspacePath });
    } catch (err) {
      logger.warn('Failed to unwatch old workspace', { error: err });
    }
  }

  // Set up file change listener (once)
  if (!fileWatcherInitialized) {
    fileWatcherInitialized = true;

    try {
      await onFileChange((event) => {
        // Filter: ignore if not in current workspace (case-insensitive on macOS/Windows)
        if (watchedWorkspacePath && !isInWorkspace(event.path, watchedWorkspacePath)) {
          return;
        }

        // Filter: ignore .git, node_modules, etc.
        if (shouldIgnorePath(event.path)) {
          return;
        }

        // Convert file:change event to file:changed message format
        // Handle 'renamed' by emitting delete + create
        if (event.type === 'renamed' && event.newPath) {
          // Only emit if newPath is also in workspace and not ignored
          if (
            watchedWorkspacePath &&
            isInWorkspace(event.newPath, watchedWorkspacePath) &&
            !shouldIgnorePath(event.newPath)
          ) {
            queueFileChange(event.path, 'deleted');
            queueFileChange(event.newPath, 'created');
          } else {
            // Just treat as delete if renamed outside workspace
            queueFileChange(event.path, 'deleted');
          }
        } else {
          // Forward as-is for created/modified/deleted
          queueFileChange(event.path, event.type);
        }
      });

      logger.info('File change listener initialized (VS Code-style batching)');
    } catch (err) {
      logger.error('Failed to set up file change listener', { error: err });
      fileWatcherInitialized = false;
      return;
    }
  }

  // Start watching the workspace path
  try {
    await watchPath(workspacePath);
    watchedWorkspacePath = workspacePath;
    logger.info('Watching workspace', { path: workspacePath });
  } catch (err) {
    logger.error('Failed to watch workspace', { error: err });
  }
}

/** Get the currently watched workspace path */
export function getWatchedWorkspacePath(): string | null {
  return watchedWorkspacePath;
}

/** Check if file watcher is initialized */
export function isFileWatcherInitialized(): boolean {
  return fileWatcherInitialized;
}

/** Cleanup for HMR - clears all pending timers and buffers */
export function disposeFileWatcher(): void {
  if (batchTimeout !== null) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  batchedEvents = [];
  throttledWorker.dispose();
}
