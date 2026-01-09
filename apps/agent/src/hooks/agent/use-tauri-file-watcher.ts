import { watchPath, onFileChange } from '@/lib/api';

// ═══════════════════════════════════════════════════════════════
// File Watcher Singleton
// NOTE: Terminal and agent listeners are now initialized by TauriProvider
// This ensures proper React lifecycle management and HMR support
// ═══════════════════════════════════════════════════════════════

let fileWatcherInitialized = false;
let watchedWorkspacePath: string | null = null;

/** Paths to ignore for file watching (reduces noise) */
const IGNORED_PATH_PATTERNS = [
  '/.git/',
  '/node_modules/',
  '/.next/',
  '/target/',
  '/dist/',
  '/__pycache__/',
  '/.cache/',
];

/** Check if a path should be ignored */
function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATH_PATTERNS.some((pattern) => path.includes(pattern));
}

/** Debounce file change events to avoid rapid re-fetches */
const pendingFileChanges = new Map<
  string,
  { type: string; timeout: ReturnType<typeof setTimeout> }
>();
const DEBOUNCE_MS = 150;

function emitFileChanged(path: string, changeType: string): void {
  // Clear any pending event for this path
  const pending = pendingFileChanges.get(path);
  if (pending) {
    clearTimeout(pending.timeout);
  }

  // Schedule the event with debouncing
  const timeout = setTimeout(() => {
    pendingFileChanges.delete(path);
    window.postMessage(
      {
        type: 'file:changed',
        uuid: crypto.randomUUID(),
        path,
        change_type: changeType,
      },
      '*'
    );
  }, DEBOUNCE_MS);

  pendingFileChanges.set(path, { type: changeType, timeout });
}

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
      console.warn('[Orbit] Unwatched old workspace:', watchedWorkspacePath);
    } catch (err) {
      console.warn('[Orbit] Failed to unwatch old workspace:', err);
    }
  }

  // Set up file change listener (once)
  if (!fileWatcherInitialized) {
    fileWatcherInitialized = true;

    try {
      await onFileChange((event) => {
        // Filter: ignore if not in current workspace
        if (watchedWorkspacePath && !event.path.startsWith(watchedWorkspacePath)) {
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
            event.newPath.startsWith(watchedWorkspacePath) &&
            !shouldIgnorePath(event.newPath)
          ) {
            emitFileChanged(event.path, 'deleted');
            emitFileChanged(event.newPath, 'created');
          } else {
            // Just treat as delete if renamed outside workspace
            emitFileChanged(event.path, 'deleted');
          }
        } else {
          // Forward as-is for created/modified/deleted
          emitFileChanged(event.path, event.type);
        }
      });

      console.warn('[Orbit] File change listener initialized');
    } catch (err) {
      console.error('[Orbit] Failed to set up file change listener:', err);
      fileWatcherInitialized = false;
      return;
    }
  }

  // Start watching the workspace path
  try {
    await watchPath(workspacePath);
    watchedWorkspacePath = workspacePath;
    console.warn('[Orbit] Watching workspace:', workspacePath);
  } catch (err) {
    console.error('[Orbit] Failed to watch workspace:', err);
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
