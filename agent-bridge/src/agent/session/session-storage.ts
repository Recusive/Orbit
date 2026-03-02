/*---------------------------------------------------------------------------------------------
 *  Session Storage - Persists SDK session IDs for resume functionality
 *
 *  PERFORMANCE: Uses in-memory caching to prevent repeated disk I/O.
 *  Sessions are loaded from disk once on first access, then operated on in memory.
 *  Disk writes only occur when data is modified (save, delete, touch, cleanup).
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { formatZodError } from '@orbit/shared-schemas';

import { createLogger } from '../../common/logging/logger.js';
import { SessionStorageDataSchema } from '../../protocol/schemas.js';

import type { SessionStorageData, StoredSession } from '../../protocol/schemas.js';

const logger = createLogger('SessionStorage');

// Re-export StoredSession type for external use
export type { StoredSession } from '../../protocol/schemas.js';

const STORAGE_VERSION = 1;
const STORAGE_FILENAME = 'orbit-sessions.json';
const REPAIR_V2_FLAG = '.orbit-sessions-repaired-v2';
const MAX_SESSIONS = 50; // Limit stored sessions to prevent unbounded growth

// ============================================
// In-memory cache
// ============================================

/** In-memory cache of sessions - null means not yet loaded from disk */
let sessionsCache: StoredSession[] | null = null;

/**
 * Overridable homedir for tests — avoids cross-module spy issues with
 * `os.homedir()` in Bun's test runner (spies on built-in modules don't
 * reliably intercept calls from other modules on Linux).
 */
let homeDirOverride: string | null = null;

function getHomeDir(): string {
  return homeDirOverride ?? os.homedir();
}

/**
 * Get the storage directory path.
 *
 * When `homeDirOverride` is set (test mode), environment variables like
 * `XDG_CONFIG_HOME` and `APPDATA` are ignored so each test gets an isolated
 * storage directory under its own tmpHome. Without this, tests on Linux CI
 * share a single storage dir and leak repair flags / session data.
 */
function getStorageDir(): string {
  const homeDir = getHomeDir();
  const platform = process.platform;

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Orbit');
  }

  if (platform === 'win32') {
    if (homeDirOverride !== null) {
      return path.join(homeDir, 'AppData', 'Roaming', 'Orbit');
    }
    return path.join(process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming'), 'Orbit');
  }

  // Linux and other Unix-like systems
  if (homeDirOverride !== null) {
    return path.join(homeDir, '.config', 'orbit');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config'), 'orbit');
}

/**
 * Get the full path to the storage file
 */
function getStoragePath(): string {
  return path.join(getStorageDir(), STORAGE_FILENAME);
}

/**
 * Ensure the storage directory exists
 */
function ensureStorageDir(): void {
  const dir = getStorageDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check whether one-time repair has already run.
 */
function hasRepairRun(): boolean {
  try {
    return fs.existsSync(path.join(getStorageDir(), REPAIR_V2_FLAG));
  } catch {
    // If the check fails, retry repair on startup. The migration is idempotent.
    return false;
  }
}

/**
 * Mark one-time repair complete.
 */
function markRepairComplete(): boolean {
  try {
    ensureStorageDir();
    fs.writeFileSync(path.join(getStorageDir(), REPAIR_V2_FLAG), '', 'utf-8');
    return true;
  } catch (error) {
    logger.warn({ error }, 'Failed to write repair flag file');
    return false;
  }
}

function hasJsonlForSessionId(sessionId: string): { found: boolean; scanError: boolean } {
  const projectsDir = path.join(getHomeDir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return { found: false, scanError: false };
  }

  let scanError = false;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const jsonlPath = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
        if (fs.existsSync(jsonlPath)) {
          return { found: true, scanError };
        }
      } catch (error) {
        scanError = true;
        logger.warn(
          { error, sessionId, directory: dir.name },
          'Failed to scan project directory for JSONL during repair'
        );
      }
    }
  } catch (error) {
    logger.warn({ error, sessionId }, 'Failed to read projects directory during repair');
    return { found: false, scanError: true };
  }

  return { found: false, scanError };
}

interface RepairResult {
  sessions: StoredSession[] | null;
  repairedCount: number;
  hadScanFailures: boolean;
}

function repairOverwrittenParentMappings(sessions: StoredSession[]): RepairResult {
  let repairedCount = 0;
  let hadScanFailures = false;
  const now = Date.now();

  // Collect fork records to add after iteration (avoid mutating while iterating)
  const forkRecordsToAdd: StoredSession[] = [];

  for (const session of sessions) {
    // Self-mapped sessions are already correct.
    if (session.sessionId === session.sdkSessionId) continue;

    const { found, scanError } = hasJsonlForSessionId(session.sessionId);
    if (scanError) {
      hadScanFailures = true;
    }
    if (!found) continue;

    // Save the old sdkSessionId (the fork's ID) before overwriting
    const forkSdkId = session.sdkSessionId;

    // Restore parent mapping
    session.sdkSessionId = session.sessionId;
    session.lastActiveAt = now;
    repairedCount += 1;

    // Preserve fork: add a self-mapped record so the fork session can still be
    // resolved by getSDKSessionIdForSession(). Only add if the fork's JSONL exists
    // and no self-mapped record already exists for it.
    const forkAlreadyExists = sessions.some((s) => s.sessionId === forkSdkId);
    if (!forkAlreadyExists) {
      const { found: forkJsonlExists } = hasJsonlForSessionId(forkSdkId);
      if (forkJsonlExists) {
        forkRecordsToAdd.push({
          sessionId: forkSdkId,
          sdkSessionId: forkSdkId,
          createdAt: now,
          lastActiveAt: now,
        });
      }
    }
  }

  // Add fork records
  for (const record of forkRecordsToAdd) {
    sessions.push(record);
  }

  const totalRepaired = repairedCount + forkRecordsToAdd.length;

  if (totalRepaired > 0) {
    logger.warn(
      { repairedCount, forksPreserved: forkRecordsToAdd.length },
      'Repaired overwritten parent session mappings in storage'
    );
  }

  if (hadScanFailures) {
    logger.warn(
      { repairedCount },
      'JSONL scan had failures during repair; repair flag will not be written'
    );
  }

  return {
    sessions: totalRepaired > 0 ? sessions : null,
    repairedCount,
    hadScanFailures,
  };
}

function sortAndLimitSessions(sessions: StoredSession[]): StoredSession[] {
  const sortedSessions = [...sessions]
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, MAX_SESSIONS);

  if (sessions.length > MAX_SESSIONS) {
    logger.debug(
      { total: sessions.length, pruned: sessions.length - MAX_SESSIONS },
      'Pruned sessions exceeding MAX_SESSIONS limit'
    );
  }

  return sortedSessions;
}

/**
 * Load sessions from disk into cache (only called once)
 */
function loadSessionsFromDisk(): StoredSession[] {
  try {
    const storagePath = getStoragePath();
    if (!fs.existsSync(storagePath)) {
      // Mark as checked to avoid repeated scans on clean installs.
      if (!hasRepairRun()) {
        markRepairComplete();
      }
      return [];
    }

    const data = fs.readFileSync(storagePath, 'utf-8');
    const json: unknown = JSON.parse(data);

    // Validate with Zod schema
    const result = SessionStorageDataSchema.safeParse(json);
    if (!result.success) {
      logger.warn(
        { error: formatZodError(result.error) },
        'Session storage validation failed, returning empty'
      );
      return [];
    }

    const parsed = result.data;

    // Version check - if incompatible, return empty
    if (parsed.version !== STORAGE_VERSION) {
      logger.warn(
        { version: parsed.version, expected: STORAGE_VERSION },
        'Session storage version mismatch, ignoring stored sessions'
      );
      return [];
    }

    /**
     * [warning] TESTED: This startup migration is covered by integration tests.
     *     If you modify this, run: cd agent-bridge && bun test session-storage-migration
     *     Test file: src/__tests__/session-storage-migration.test.ts
     */
    if (!hasRepairRun()) {
      const result = repairOverwrittenParentMappings(parsed.sessions);
      const sessions = result.sessions ?? parsed.sessions;
      const normalized = sortAndLimitSessions(sessions);
      const persisted = result.sessions !== null ? persistSessions(sessions) : true;

      if (!persisted) {
        logger.warn(
          'Skipping repair flag write because repaired sessions were not persisted; startup will retry'
        );
      } else if (result.hadScanFailures) {
        logger.warn(
          'Skipping repair flag write because JSONL scan had failures; startup will retry'
        );
      } else {
        const flagWritten = markRepairComplete();
        if (!flagWritten) {
          logger.warn(
            { flagPath: path.join(getStorageDir(), REPAIR_V2_FLAG) },
            'Repair completed but flag could not be written; startup will keep retrying'
          );
        }
      }

      logger.info(
        { count: normalized.length, repaired: result.repairedCount },
        'Loaded sessions from storage (initial load, repair pass)'
      );
      return normalized;
    }

    logger.info({ count: parsed.sessions.length }, 'Loaded sessions from storage (initial load)');
    return parsed.sessions;
  } catch (error) {
    logger.error({ error }, 'Failed to load sessions from storage');
    return [];
  }
}

/**
 * Get sessions from cache (lazy-loads from disk on first access)
 */
function getSessions(): StoredSession[] {
  sessionsCache ??= loadSessionsFromDisk();
  return sessionsCache;
}

/**
 * Save sessions to disk and update cache
 */
function persistSessions(sessions: StoredSession[]): boolean {
  try {
    ensureStorageDir();

    const sortedSessions = sortAndLimitSessions(sessions);

    // Update cache
    sessionsCache = sortedSessions;

    const data: SessionStorageData = {
      version: STORAGE_VERSION,
      sessions: sortedSessions,
    };

    const storagePath = getStoragePath();
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug({ count: sortedSessions.length, path: storagePath }, 'Saved sessions to storage');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to save sessions to storage');
    return false;
  }
}

/**
 * Session:init persistence event for collision-aware storage writes.
 */
interface SessionInitPersistenceEvent {
  sessionId: string;
  sdkSessionId: string;
  isForked: boolean;
}

function upsertBySessionId(sessions: StoredSession[], record: StoredSession): void {
  const existingIndex = sessions.findIndex((s) => s.sessionId === record.sessionId);
  if (existingIndex >= 0) {
    sessions[existingIndex] = record;
  } else {
    sessions.push(record);
  }
}

function makeRecord(
  existing: StoredSession | undefined,
  sessionId: string,
  sdkSessionId: string,
  now: number
): StoredSession {
  return {
    sessionId,
    sdkSessionId,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
    workspacePath: existing?.workspacePath,
    displayName: existing?.displayName,
  };
}

/**
 * Collision-aware persistence for session:init events.
 *
 * [warning] TESTED: This function is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test session-storage-init-mapping session-storage-bridge
 *     Test files: src/__tests__/session-storage-init-mapping.test.ts, src/__tests__/session-storage-bridge.test.ts
 */
export function saveSessionInitMapping(event: SessionInitPersistenceEvent): void {
  const sessions = getSessions();
  const now = Date.now();

  const existingOrbit = sessions.find((s) => s.sessionId === event.sessionId);
  const existingSdk = sessions.find((s) => s.sessionId === event.sdkSessionId);
  const existingBySdk =
    existingOrbit === undefined
      ? sessions.find((s) => s.sdkSessionId === event.sessionId)
      : undefined;

  const wouldOverwriteExistingOrbitMapping =
    event.isForked &&
    existingOrbit !== undefined &&
    existingOrbit.sdkSessionId !== event.sdkSessionId;

  const wouldCreateShadowEntry =
    event.isForked && existingOrbit === undefined && existingBySdk !== undefined;

  if (wouldOverwriteExistingOrbitMapping || wouldCreateShadowEntry) {
    const parentEntry = existingOrbit ?? existingBySdk;
    if (parentEntry !== undefined) {
      parentEntry.lastActiveAt = now;
    }

    upsertBySessionId(
      sessions,
      makeRecord(existingSdk, event.sdkSessionId, event.sdkSessionId, now)
    );
    persistSessions(sessions);
    return;
  }

  upsertBySessionId(sessions, makeRecord(existingOrbit, event.sessionId, event.sdkSessionId, now));

  if (event.isForked) {
    upsertBySessionId(
      sessions,
      makeRecord(existingSdk, event.sdkSessionId, event.sdkSessionId, now)
    );
  }

  persistSessions(sessions);
}

/**
 * Save or update a single session.
 *
 * NOTE: Prefer `saveSessionInitMapping` for session:init events — it performs
 * fork collision detection. This function is a low-level write used by tests.
 */
export function saveSession(session: StoredSession): void {
  const sessions = getSessions();
  upsertBySessionId(sessions, session);
  persistSessions(sessions);
}

/**
 * Get a session by session ID (from cache)
 */
function getSession(sessionId: string): StoredSession | undefined {
  const sessions = getSessions();
  return sessions.find((s) => s.sessionId === sessionId);
}

/**
 * Get the SDK session ID for a given session ID.
 *
 * Supports dual-key lookup: first tries sessionId as the stored session key,
 * then falls back to checking if the caller is already passing an SDK ID
 * (common after app restart when in-memory alias maps are empty).
 */
export function getSDKSessionIdForSession(sessionId: string): string | undefined {
  const session = getSession(sessionId);
  if (session) return session.sdkSessionId;

  // Fallback: caller may be passing the SDK ID directly (after app restart,
  // in-memory sessionIdAliases are empty, so the frontend uses the SDK ID it persisted)
  const sessions = getSessions();
  const bySDK = sessions.find((s) => s.sdkSessionId === sessionId);
  return bySDK?.sdkSessionId;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  const sessions = getSessions();
  const filtered = sessions.filter((s) => s.sessionId !== sessionId);
  persistSessions(filtered);
}

/**
 * Update the last active timestamp for a session.
 *
 * Supports dual-key lookup: tries sessionId first, then falls back to
 * matching by sdkSessionId (for post-restart scenarios where the frontend
 * uses the SDK ID directly).
 */
export function touchSession(sessionId: string): void {
  const sessions = getSessions();
  let session = sessions.find((s) => s.sessionId === sessionId);

  // Fallback: caller may be passing the SDK ID (after app restart)
  session ??= sessions.find((s) => s.sdkSessionId === sessionId);

  if (session) {
    session.lastActiveAt = Date.now();
    persistSessions(sessions);
  } else {
    // Session not found - this can happen if message is sent before system:init completes
    logger.debug(
      { sessionId },
      'touchSession: session not found in storage (may not be initialized yet)'
    );
  }
}

/**
 * Clean up old sessions (older than specified days)
 */
export function cleanupOldSessions(maxAgeDays = 30): number {
  const sessions = getSessions();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const filtered = sessions.filter((s) => s.lastActiveAt >= cutoff);
  const removed = sessions.length - filtered.length;

  if (removed > 0) {
    persistSessions(filtered);
    logger.info({ removed, remaining: filtered.length }, 'Cleaned up old sessions');
  }

  return removed;
}

/** Read-only snapshot of stored sessions for external repair code. */
export function getStoredSessionsSnapshot(): readonly StoredSession[] {
  return [...getSessions()];
}

/**
 * Get the storage directory path (exported for flag-file consumers).
 */
export function getStorageDirPath(): string {
  return getStorageDir();
}

/**
 * Invalidate the cache (for testing or forced reload)
 * This will cause the next operation to reload from disk
 */
export function invalidateCache(): void {
  sessionsCache = null;
  logger.debug('Session storage cache invalidated');
}

/**
 * Override `os.homedir()` for testing. Pass `null` to clear.
 *
 * Bun's `jest.spyOn(os, 'homedir')` doesn't reliably intercept calls
 * from other modules on Linux. This provides a direct override that
 * works cross-platform without relying on cross-module spy behavior.
 */
export function _setHomeDirForTest(dir: string | null): void {
  homeDirOverride = dir;
}
