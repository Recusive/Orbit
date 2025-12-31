/**
 * Batched JSONL storage for dev-monitor.
 *
 * Collects events in memory and periodically flushes them to disk.
 * Uses Tauri commands for file I/O to write to the workspace directory.
 */

import { flushAllDedup, processForDedup } from './dedup';

import type { CaptureInput, DevLogEntry, InitOptions } from './types';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

let config: Required<Pick<InitOptions, 'outputDir' | 'flushInterval' | 'maxBatchSize'>> = {
  outputDir: '.dev-monitor',
  flushInterval: 1000,
  maxBatchSize: 100,
};

/** Batch of pending events */
let batch: DevLogEntry[] = [];

/** Flush timer ID */
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Whether storage is initialized */
let initialized = false;

/** Workspace path (set during init) */
let workspacePath: string | null = null;

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize storage with options.
 */
export async function initStorage(options: InitOptions = {}): Promise<void> {
  if (initialized) return;

  config = {
    outputDir: options.outputDir ?? '.dev-monitor',
    flushInterval: options.flushInterval ?? 1000,
    maxBatchSize: options.maxBatchSize ?? 100,
  };

  try {
    // Get workspace path
    const { getWorkspacePath } = await import('@/lib/backend');
    workspacePath = await getWorkspacePath();

    if (workspacePath) {
      // Ensure output directory exists
      await ensureOutputDir();
    }

    // Start flush timer
    flushTimer = setInterval(() => {
      void flushBatch();
    }, config.flushInterval);

    initialized = true;
  } catch (err: unknown) {
    console.error('[DevMonitor] Storage init failed:', err);
  }
}

/**
 * Shutdown storage, flushing remaining events.
 */
export async function shutdownStorage(): Promise<void> {
  if (!initialized) return;

  // Stop timer
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Final flush
  await flushBatch();

  initialized = false;
}

// ═══════════════════════════════════════════════════════════════
// Event Capture
// ═══════════════════════════════════════════════════════════════

/**
 * Capture an event for logging.
 *
 * This is the main entry point for all wrappers to log events.
 * Events are batched and periodically flushed to disk.
 */
export function captureEvent(input: CaptureInput): void {
  if (!initialized) {
    // Before init, just buffer (will be flushed after init)
    const entry: DevLogEntry = {
      ts: new Date().toISOString(),
      ...input,
    };
    batch.push(entry);
    return;
  }

  try {
    // Create full entry with timestamp
    const entry: DevLogEntry = {
      ts: new Date().toISOString(),
      ...input,
    };

    // Process through dedup
    const dedupedEntry = processForDedup(entry);

    if (dedupedEntry) {
      batch.push(dedupedEntry);

      // Force flush if batch is full
      if (batch.length >= config.maxBatchSize) {
        void flushBatch();
      }
    }
  } catch (err: unknown) {
    console.error('[DevMonitor] captureEvent error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// File Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure the output directory exists.
 */
async function ensureOutputDir(): Promise<void> {
  if (!workspacePath) return;

  try {
    const { devMonitorEnsureDir } = await import('@/lib/backend');
    const dirPath = `${workspacePath}/${config.outputDir}`;
    await devMonitorEnsureDir(dirPath);
  } catch (err: unknown) {
    console.error('[DevMonitor] ensureOutputDir error:', err);
  }
}

/**
 * Get the path for today's events file.
 */
function getEventsFilePath(): string | null {
  if (!workspacePath) return null;

  const isoDate = new Date().toISOString();
  const date = isoDate.split('T')[0] ?? isoDate.substring(0, 10);
  return `${workspacePath}/${config.outputDir}/events-${date}.jsonl`;
}

/**
 * Flush the current batch to disk.
 */
async function flushBatch(): Promise<void> {
  // Get dedup summaries
  const dedupEntries = flushAllDedup();

  // Combine with current batch
  const toFlush = [...batch, ...dedupEntries];

  if (toFlush.length === 0) return;

  // Clear batch immediately (before async operations)
  batch = [];

  const filePath = getEventsFilePath();
  if (!filePath) return;

  try {
    // Convert entries to backend format (timestamp as number)
    const { devMonitorWriteBatch } = await import('@/lib/backend');
    const backendEntries = toFlush.map((entry) => {
      // Build the backend entry, only including optional fields if defined
      const backendEntry: {
        timestamp: number;
        severity: string;
        category: string;
        file: string;
        title: string;
        function?: string;
        details?: string;
        context?: Record<string, unknown>;
        dedupCount?: number;
      } = {
        timestamp: new Date(entry.ts).getTime(),
        severity: entry.severity,
        category: entry.category,
        file: entry.file,
        title: entry.title,
      };

      // Only include optional fields if they have values
      if (entry.function !== undefined) {
        backendEntry.function = entry.function;
      }
      if (entry.details !== undefined) {
        backendEntry.details = entry.details;
      }
      // Context is always defined in CaptureInput, so always include it
      backendEntry.context = entry.context;
      if (entry.dedupCount !== undefined) {
        backendEntry.dedupCount = entry.dedupCount;
      }

      return backendEntry;
    });

    await devMonitorWriteBatch(filePath, backendEntries);
  } catch (err: unknown) {
    console.error('[DevMonitor] flushBatch error:', err);
    // Put events back in batch to retry later
    batch = [...toFlush, ...batch];
  }
}

// ═══════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════

/** Storage statistics */
export interface StorageStats {
  /** Whether storage is initialized */
  initialized: boolean;
  /** Number of events in current batch */
  pendingEvents: number;
  /** Current output directory */
  outputDir: string;
  /** Workspace path */
  workspacePath: string | null;
}

/**
 * Get current storage statistics.
 */
export function getStorageStats(): StorageStats {
  return {
    initialized,
    pendingEvents: batch.length,
    outputDir: config.outputDir,
    workspacePath,
  };
}
