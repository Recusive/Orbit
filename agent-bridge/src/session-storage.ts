/*---------------------------------------------------------------------------------------------
 *  Session Storage - Persists SDK session IDs for resume functionality
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { formatZodError } from '@snowflake/shared-schemas';

import { createLogger } from './logger.js';
import { SessionStorageDataSchema } from './schemas.js';

import type { SessionStorageData, StoredSession } from './schemas.js';

const logger = createLogger('SessionStorage');

// Re-export StoredSession type for external use
export type { StoredSession } from './schemas.js';

const STORAGE_VERSION = 1;
const STORAGE_FILENAME = 'snowflake-sessions.json';
const MAX_SESSIONS = 50; // Limit stored sessions to prevent unbounded growth

/**
 * Get the storage directory path
 */
function getStorageDir(): string {
  // Use standard app data location
  const homeDir = os.homedir();
  const platform = process.platform;

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Snowflake');
  }

  if (platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming'), 'Snowflake');
  }

  // Linux and other Unix-like systems
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config'), 'snowflake');
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
 * Load sessions from storage
 */
export function loadSessions(): StoredSession[] {
  try {
    const storagePath = getStoragePath();
    if (!fs.existsSync(storagePath)) {
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

    logger.info({ count: parsed.sessions.length }, 'Loaded sessions from storage');
    return parsed.sessions;
  } catch (error) {
    logger.error({ error }, 'Failed to load sessions from storage');
    return [];
  }
}

/**
 * Save sessions to storage
 */
export function saveSessions(sessions: StoredSession[]): void {
  try {
    ensureStorageDir();

    // Sort by lastActiveAt descending and limit to MAX_SESSIONS
    const sortedSessions = [...sessions]
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, MAX_SESSIONS);

    const data: SessionStorageData = {
      version: STORAGE_VERSION,
      sessions: sortedSessions,
    };

    const storagePath = getStoragePath();
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug({ count: sortedSessions.length, path: storagePath }, 'Saved sessions to storage');
  } catch (error) {
    logger.error({ error }, 'Failed to save sessions to storage');
  }
}

/**
 * Save or update a single session
 */
export function saveSession(session: StoredSession): void {
  const sessions = loadSessions();
  const existingIndex = sessions.findIndex((s) => s.sessionId === session.sessionId);

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  saveSessions(sessions);
}

/**
 * Get a session by session ID
 */
export function getSession(sessionId: string): StoredSession | undefined {
  const sessions = loadSessions();
  return sessions.find((s) => s.sessionId === sessionId);
}

/**
 * Get the SDK session ID for a given session ID
 */
export function getSDKSessionIdForSession(sessionId: string): string | undefined {
  const session = getSession(sessionId);
  return session?.sdkSessionId;
}

/**
 * Get sessions for a specific workspace
 */
export function getSessionsForWorkspace(workspacePath: string): StoredSession[] {
  const sessions = loadSessions();
  return sessions
    .filter((s) => s.workspacePath === workspacePath)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  const sessions = loadSessions();
  const filtered = sessions.filter((s) => s.sessionId !== sessionId);
  saveSessions(filtered);
}

/**
 * Update the last active timestamp for a session
 */
export function touchSession(sessionId: string): void {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (session) {
    session.lastActiveAt = Date.now();
    saveSessions(sessions);
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
  const sessions = loadSessions();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const filtered = sessions.filter((s) => s.lastActiveAt >= cutoff);
  const removed = sessions.length - filtered.length;

  if (removed > 0) {
    saveSessions(filtered);
    logger.info({ removed, remaining: filtered.length }, 'Cleaned up old sessions');
  }

  return removed;
}
