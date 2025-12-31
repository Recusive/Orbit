/**
 * Event deduplication for dev-monitor.
 *
 * Reduces log noise by detecting duplicate events and incrementing
 * counts instead of creating new entries.
 *
 * Fingerprint generation uses: category + file + function + title
 * (NOT timestamp or full context)
 */

import type { DevLogEntry, Severity } from './types';

// ═══════════════════════════════════════════════════════════════
// Fingerprint Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a fingerprint for deduplication.
 *
 * Uses: category + file + function + title
 * Does NOT use: timestamp, full context
 */
function generateFingerprint(entry: DevLogEntry): string {
  const parts = [entry.category, entry.file, entry.function ?? '', entry.title];
  return parts.join('|');
}

// ═══════════════════════════════════════════════════════════════
// Dedup Entry with Count
// ═══════════════════════════════════════════════════════════════

interface DedupEntry {
  /** Original entry (first occurrence) */
  entry: DevLogEntry;
  /** Number of occurrences */
  count: number;
  /** Timestamp of first occurrence */
  firstSeen: string;
  /** Timestamp of last occurrence */
  lastSeen: string;
  /** Highest severity seen for this fingerprint */
  maxSeverity: Severity;
}

/** Severity ranking for comparison */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  error: 4,
  warning: 3,
  perf: 2,
  info: 1,
};

// ═══════════════════════════════════════════════════════════════
// Dedup Store
// ═══════════════════════════════════════════════════════════════

/** In-memory dedup store */
const dedupMap = new Map<string, DedupEntry>();

/** Time window for deduplication (5 minutes) */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Max entries to track before pruning oldest */
const MAX_DEDUP_ENTRIES = 1000;

/**
 * Process an entry for deduplication.
 *
 * @param entry - The log entry to process
 * @returns The entry to log (possibly with count info) or null if deduplicated
 */
export function processForDedup(entry: DevLogEntry): DevLogEntry | null {
  const fingerprint = generateFingerprint(entry);
  const now = Date.now();
  const existing = dedupMap.get(fingerprint);

  if (existing) {
    const lastSeenTime = new Date(existing.lastSeen).getTime();

    // Check if within dedup window
    if (now - lastSeenTime < DEDUP_WINDOW_MS) {
      // Update existing entry
      existing.count += 1;
      existing.lastSeen = entry.ts;

      // Track highest severity
      if (SEVERITY_RANK[entry.severity] > SEVERITY_RANK[existing.maxSeverity]) {
        existing.maxSeverity = entry.severity;
      }

      // Merge context (shallow, keep most recent values)
      existing.entry = {
        ...existing.entry,
        ts: entry.ts, // Update to latest timestamp
        context: {
          ...existing.entry.context,
          ...entry.context,
          _dedup_count: existing.count,
          _dedup_last_seen: existing.lastSeen,
        },
      };

      // Don't emit - it's a duplicate
      return null;
    }

    // Outside window - flush the old entry and start fresh
    const flushed = flushDedupEntry(existing);
    dedupMap.delete(fingerprint);

    // Create new entry for current occurrence
    dedupMap.set(fingerprint, {
      entry,
      count: 1,
      firstSeen: entry.ts,
      lastSeen: entry.ts,
      maxSeverity: entry.severity,
    });

    return flushed;
  }

  // New fingerprint
  dedupMap.set(fingerprint, {
    entry,
    count: 1,
    firstSeen: entry.ts,
    lastSeen: entry.ts,
    maxSeverity: entry.severity,
  });

  // Prune if too many entries
  if (dedupMap.size > MAX_DEDUP_ENTRIES) {
    pruneOldestEntries();
  }

  // Return the entry (will be batched by storage)
  return entry;
}

/**
 * Convert a dedup entry to a log entry with count info.
 */
function flushDedupEntry(dedup: DedupEntry): DevLogEntry {
  if (dedup.count === 1) {
    return dedup.entry;
  }

  return {
    ...dedup.entry,
    severity: dedup.maxSeverity, // Use highest severity seen
    context: {
      ...dedup.entry.context,
      _dedup_count: dedup.count,
      _dedup_first_seen: dedup.firstSeen,
      _dedup_last_seen: dedup.lastSeen,
    },
  };
}

/**
 * Flush all pending dedup entries with counts > 1.
 *
 * Call on shutdown or periodic flush to ensure counts are written.
 */
export function flushAllDedup(): DevLogEntry[] {
  const entries: DevLogEntry[] = [];

  for (const dedup of dedupMap.values()) {
    if (dedup.count > 1) {
      entries.push(flushDedupEntry(dedup));
    }
  }

  return entries;
}

/**
 * Clear dedup state.
 *
 * Call on session end or when switching contexts.
 */
export function clearDedup(): void {
  dedupMap.clear();
}

/**
 * Prune oldest entries when map exceeds max size.
 */
function pruneOldestEntries(): void {
  const entries = Array.from(dedupMap.entries());

  // Sort by lastSeen (oldest first)
  entries.sort((a, b) => {
    const timeA = new Date(a[1].lastSeen).getTime();
    const timeB = new Date(b[1].lastSeen).getTime();
    return timeA - timeB;
  });

  // Remove oldest 20%
  const removeCount = Math.floor(MAX_DEDUP_ENTRIES * 0.2);
  for (let i = 0; i < removeCount && i < entries.length; i++) {
    const pair = entries[i];
    if (pair) {
      dedupMap.delete(pair[0]);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════

/** Dedup statistics */
export interface DedupStats {
  /** Number of unique fingerprints being tracked */
  totalFingerprints: number;
  /** Total number of events that were deduplicated (not logged) */
  totalDedupedCount: number;
}

/**
 * Get current dedup statistics.
 */
export function getDedupStats(): DedupStats {
  let totalDedupedCount = 0;

  for (const entry of dedupMap.values()) {
    if (entry.count > 1) {
      // -1 because first occurrence is logged
      totalDedupedCount += entry.count - 1;
    }
  }

  return {
    totalFingerprints: dedupMap.size,
    totalDedupedCount,
  };
}
