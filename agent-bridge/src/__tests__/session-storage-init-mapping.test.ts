import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  _setHomeDirForTest,
  getSDKSessionIdForSession,
  getStorageDirPath,
  invalidateCache,
  saveSession,
  saveSessionInitMapping,
} from '../agent/session/session-storage.js';

import type { StoredSession } from '../agent/session/session-storage.js';

const STORAGE_FILENAME = 'orbit-sessions.json';
const MAX_SESSIONS = 50;

function getStoragePath(): string {
  return path.join(getStorageDirPath(), STORAGE_FILENAME);
}

function readStoredSessions(): StoredSession[] {
  const data = JSON.parse(fs.readFileSync(getStoragePath(), 'utf-8')) as {
    sessions: StoredSession[];
  };
  return data.sessions;
}

describe('session-storage init mapping', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-init-mapping-'));
    invalidateCache();
    _setHomeDirForTest(tmpHome);
  });

  afterEach(() => {
    invalidateCache();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('preserves parent mapping and adds fork self-map on collision', () => {
    saveSessionInitMapping({
      sessionId: 'parent-session',
      sdkSessionId: 'parent-session',
      isForked: false,
    });

    saveSessionInitMapping({
      sessionId: 'parent-session',
      sdkSessionId: 'fork-session',
      isForked: true,
    });

    expect(getSDKSessionIdForSession('parent-session')).toBe('parent-session');
    expect(getSDKSessionIdForSession('fork-session')).toBe('fork-session');
  });

  it('retains orbit->sdk mapping for non-colliding keepAlive fork IDs', () => {
    saveSessionInitMapping({
      sessionId: 'parent_fork_1700000000000',
      sdkSessionId: 'sdk-fork-uuid',
      isForked: true,
    });

    expect(getSDKSessionIdForSession('parent_fork_1700000000000')).toBe('sdk-fork-uuid');
    expect(getSDKSessionIdForSession('sdk-fork-uuid')).toBe('sdk-fork-uuid');
  });

  it('updates existing sdk self-map instead of accumulating duplicates', () => {
    const event = {
      sessionId: 'orbit-keepalive-fork',
      sdkSessionId: 'sdk-fork-stable',
      isForked: true,
    };

    saveSessionInitMapping(event);
    saveSessionInitMapping(event);

    const sessions = readStoredSessions();
    const orbitRecords = sessions.filter((s) => s.sessionId === event.sessionId);
    const sdkRecords = sessions.filter((s) => s.sessionId === event.sdkSessionId);

    expect(orbitRecords).toHaveLength(1);
    expect(sdkRecords).toHaveLength(1);
  });

  it('detects resumed parent collision via sdkSessionId lookup', () => {
    const now = Date.now();
    saveSession({
      sessionId: 'f275658a',
      sdkSessionId: '9541b1e0',
      createdAt: now,
      lastActiveAt: now,
    });

    saveSessionInitMapping({
      sessionId: '9541b1e0',
      sdkSessionId: '0efc7ca1',
      isForked: true,
    });

    const sessions = readStoredSessions();
    expect(sessions.find((s) => s.sessionId === '9541b1e0')).toBeUndefined();
    expect(getSDKSessionIdForSession('9541b1e0')).toBe('9541b1e0');
    expect(getSDKSessionIdForSession('0efc7ca1')).toBe('0efc7ca1');
    expect(getSDKSessionIdForSession('f275658a')).toBe('9541b1e0');
  });

  it('allows non-forked resume to update orbit mapping normally', () => {
    saveSessionInitMapping({
      sessionId: 'f275658a',
      sdkSessionId: 'f275658a',
      isForked: false,
    });

    saveSessionInitMapping({
      sessionId: 'f275658a',
      sdkSessionId: '9541b1e0',
      isForked: false,
    });

    expect(getSDKSessionIdForSession('f275658a')).toBe('9541b1e0');
  });

  it('handles fork self-map at MAX_SESSIONS boundary without losing parent', () => {
    const base = Date.now() - 100_000;

    saveSession({
      sessionId: 'evict-me',
      sdkSessionId: 'evict-me',
      createdAt: base,
      lastActiveAt: base,
    });

    saveSession({
      sessionId: 'parent-id',
      sdkSessionId: 'parent-id',
      createdAt: base + 1,
      lastActiveAt: 1,
    });

    for (let i = 0; i < MAX_SESSIONS - 2; i += 1) {
      saveSession({
        sessionId: `recent-${String(i)}`,
        sdkSessionId: `recent-${String(i)}`,
        createdAt: base + 2 + i,
        lastActiveAt: base + 2 + i,
      });
    }

    saveSessionInitMapping({
      sessionId: 'parent-id',
      sdkSessionId: 'fork-id',
      isForked: true,
    });

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(MAX_SESSIONS);
    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(getSDKSessionIdForSession('fork-id')).toBe('fork-id');
    expect(sessions.find((s) => s.sessionId === 'evict-me')).toBeUndefined();
  });

  it('evicts oldest non-active sessions first when fork causes overflow', () => {
    const base = Date.now() - 1_000_000;
    for (let i = 0; i < MAX_SESSIONS; i += 1) {
      saveSession({
        sessionId: `session-${String(i)}`,
        sdkSessionId: `session-${String(i)}`,
        createdAt: base + i,
        lastActiveAt: base + i,
      });
    }

    // Make this the collision parent but very old.
    saveSession({
      sessionId: 'session-0',
      sdkSessionId: 'session-0',
      createdAt: base,
      lastActiveAt: 1,
    });

    saveSessionInitMapping({
      sessionId: 'session-0',
      sdkSessionId: 'fork-z',
      isForked: true,
    });

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(MAX_SESSIONS);
    expect(getSDKSessionIdForSession('session-0')).toBe('session-0');
    expect(getSDKSessionIdForSession('fork-z')).toBe('fork-z');
    expect(sessions.find((s) => s.sessionId === 'session-1')).toBeUndefined();
  });

  it('touches parent lastActiveAt in collision path to prevent parent eviction', () => {
    const now = Date.now();

    saveSession({
      sessionId: 'parent-id',
      sdkSessionId: 'parent-id',
      createdAt: now - 1000,
      lastActiveAt: 1,
    });

    saveSession({
      sessionId: 'evict-me',
      sdkSessionId: 'evict-me',
      createdAt: now - 999,
      lastActiveAt: 0,
    });

    for (let i = 0; i < MAX_SESSIONS - 2; i += 1) {
      saveSession({
        sessionId: `active-${String(i)}`,
        sdkSessionId: `active-${String(i)}`,
        createdAt: now + i,
        lastActiveAt: now + i,
      });
    }

    saveSessionInitMapping({
      sessionId: 'parent-id',
      sdkSessionId: 'fork-child',
      isForked: true,
    });

    const sessions = readStoredSessions();
    const parent = sessions.find((s) => s.sessionId === 'parent-id');

    expect(parent).toBeDefined();
    expect(parent?.lastActiveAt).toBeGreaterThan(1);
    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(getSDKSessionIdForSession('fork-child')).toBe('fork-child');
    expect(sessions.find((s) => s.sessionId === 'evict-me')).toBeUndefined();
  });
});
