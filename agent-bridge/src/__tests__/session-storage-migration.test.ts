import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';

import {
  _setHomeDirForTest,
  getSDKSessionIdForSession,
  getStorageDirPath,
  invalidateCache,
  saveSessionInitMapping,
} from '../agent/session/session-storage.js';

import type { StoredSession } from '../agent/session/session-storage.js';

const STORAGE_FILENAME = 'orbit-sessions.json';
const REPAIR_FLAG = '.orbit-sessions-repaired-v1';

function getStoragePath(): string {
  return path.join(getStorageDirPath(), STORAGE_FILENAME);
}

function getRepairFlagPath(): string {
  return path.join(getStorageDirPath(), REPAIR_FLAG);
}

function makeSession(sessionId: string, sdkSessionId: string, at = Date.now()): StoredSession {
  return {
    sessionId,
    sdkSessionId,
    createdAt: at,
    lastActiveAt: at,
  };
}

function writeStorage(sessions: StoredSession[]): void {
  const storageDir = getStorageDirPath();
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(getStoragePath(), JSON.stringify({ version: 1, sessions }, null, 2), 'utf-8');
}

function readStorage(): StoredSession[] {
  const data = JSON.parse(fs.readFileSync(getStoragePath(), 'utf-8')) as {
    sessions: StoredSession[];
  };
  return data.sessions;
}

function createJsonl(homeDir: string, sessionId: string, projectDirName = 'project-a'): void {
  const projectDir = path.join(homeDir, '.claude', 'projects', projectDirName);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '{"type":"system"}\n', 'utf-8');
}

describe('session-storage migration repair', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-migration-'));
    invalidateCache();
    _setHomeDirForTest(tmpHome);
  });

  afterEach(() => {
    invalidateCache();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('repairs overwritten parent mapping without fork self-map entry', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');

    const sessions = readStorage();
    expect(sessions.find((s) => s.sessionId === 'parent-id')?.sdkSessionId).toBe('parent-id');
  });

  it('repairs overwritten parent mapping when fork self-map entry exists', () => {
    writeStorage([makeSession('parent-id', 'fork-id'), makeSession('fork-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(getSDKSessionIdForSession('fork-id')).toBe('fork-id');
  });

  it('does not modify already self-mapped entries', () => {
    writeStorage([makeSession('session-id', 'session-id')]);
    createJsonl(tmpHome, 'session-id');

    expect(getSDKSessionIdForSession('session-id')).toBe('session-id');
    const sessions = readStorage();
    expect(sessions[0]).toMatchObject({ sessionId: 'session-id', sdkSessionId: 'session-id' });
  });

  it('does not repair alias when sessionId has no JSONL on disk', () => {
    writeStorage([makeSession('orbit-id', 'sdk-id')]);

    expect(getSDKSessionIdForSession('orbit-id')).toBe('sdk-id');
    const sessions = readStorage();
    expect(sessions[0]).toMatchObject({ sessionId: 'orbit-id', sdkSessionId: 'sdk-id' });
  });

  it('persists repaired mapping so reload stays correct', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    invalidateCache();
    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
  });

  it('does not write session storage file when no repairs are needed', () => {
    writeStorage([makeSession('clean-id', 'clean-id')]);
    createJsonl(tmpHome, 'clean-id');
    const storagePath = getStoragePath();

    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    const before = fs.readFileSync(storagePath, 'utf-8');
    const result = getSDKSessionIdForSession('clean-id');
    const after = fs.readFileSync(storagePath, 'utf-8');

    const wroteSessionFile = writeSpy.mock.calls.some(([file]) => String(file) === storagePath);
    writeSpy.mockRestore();

    expect(result).toBe('clean-id');
    expect(wroteSessionFile).toBe(false);
    expect(after).toBe(before);
    expect(fs.existsSync(getRepairFlagPath())).toBe(true);
  });

  it('skips repair entirely when repair flag already exists', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');
    fs.mkdirSync(getStorageDirPath(), { recursive: true });
    fs.writeFileSync(getRepairFlagPath(), '', 'utf-8');

    expect(getSDKSessionIdForSession('parent-id')).toBe('fork-id');
    const sessions = readStorage();
    expect(sessions.find((s) => s.sessionId === 'parent-id')?.sdkSessionId).toBe('fork-id');
  });

  it('preserves legitimate resume aliases on subsequent startups when flag exists', () => {
    writeStorage([makeSession('f275658a', '9541b1e0')]);
    createJsonl(tmpHome, 'f275658a');
    fs.mkdirSync(getStorageDirPath(), { recursive: true });
    fs.writeFileSync(getRepairFlagPath(), '', 'utf-8');

    expect(getSDKSessionIdForSession('f275658a')).toBe('9541b1e0');
  });

  it('does not mark repair complete when persisting repaired sessions fails', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    const storagePath = getStoragePath();
    const originalWrite = fs.writeFileSync;
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(((
      file: fs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
      options?: unknown
    ) => {
      if (String(file) === storagePath) {
        throw new Error('simulated storage write failure');
      }
      originalWrite(file, data, options as Parameters<typeof fs.writeFileSync>[2]);
    }) as typeof fs.writeFileSync);

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(fs.existsSync(getRepairFlagPath())).toBe(false);

    writeSpy.mockRestore();
    invalidateCache();

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(fs.existsSync(getRepairFlagPath())).toBe(true);
  });

  it('does not mark repair complete when JSONL scan has failures', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id', '1-good');
    fs.mkdirSync(path.join(tmpHome, '.claude', 'projects', '0-bad'), { recursive: true });

    const projectsDir = path.join(tmpHome, '.claude', 'projects');
    const originalReaddir = fs.readdirSync;
    const originalExists = fs.existsSync;

    const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(((
      targetPath: fs.PathLike,
      options?: unknown
    ) => {
      if (String(targetPath) === projectsDir) {
        return [
          { name: '0-bad', isDirectory: () => true },
          { name: '1-good', isDirectory: () => true },
        ] as unknown as ReturnType<typeof fs.readdirSync>;
      }
      return originalReaddir(targetPath, options as Parameters<typeof fs.readdirSync>[1]);
    }) as typeof fs.readdirSync);

    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((targetPath: fs.PathLike) => {
      const asPath = String(targetPath);
      if (asPath.includes(`${path.sep}0-bad${path.sep}`) && asPath.endsWith('parent-id.jsonl')) {
        throw new Error('simulated scan failure');
      }
      return originalExists(targetPath);
    });

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(fs.existsSync(getRepairFlagPath())).toBe(false);

    existsSpy.mockRestore();
    readdirSpy.mockRestore();
    invalidateCache();

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(fs.existsSync(getRepairFlagPath())).toBe(true);
  });

  it('treats flag existence check I/O errors as not-yet-repaired', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    const flagPath = getRepairFlagPath();
    const originalExists = fs.existsSync;
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath) === flagPath) {
        throw new Error('simulated flag check failure');
      }
      return originalExists(targetPath);
    });

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    existsSpy.mockRestore();
    expect(fs.existsSync(flagPath)).toBe(true);
  });

  it('does not re-run repair after normal saveSessionInitMapping calls', () => {
    writeStorage([makeSession('parent-id', 'fork-id')]);
    createJsonl(tmpHome, 'parent-id');

    expect(getSDKSessionIdForSession('parent-id')).toBe('parent-id');
    expect(fs.existsSync(getRepairFlagPath())).toBe(true);

    saveSessionInitMapping({
      sessionId: 'parent-id',
      sdkSessionId: 'resume-sdk-id',
      isForked: false,
    });

    invalidateCache();
    expect(getSDKSessionIdForSession('parent-id')).toBe('resume-sdk-id');
  });

  it('is idempotent when forced to re-run on already repaired data', () => {
    writeStorage([makeSession('clean-a', 'clean-a'), makeSession('clean-b', 'clean-b')]);
    createJsonl(tmpHome, 'clean-a');
    createJsonl(tmpHome, 'clean-b');

    expect(getSDKSessionIdForSession('clean-a')).toBe('clean-a');
    const beforeSecondRun = fs.readFileSync(getStoragePath(), 'utf-8');

    fs.rmSync(getRepairFlagPath(), { force: true });
    invalidateCache();

    expect(getSDKSessionIdForSession('clean-a')).toBe('clean-a');
    const afterSecondRun = fs.readFileSync(getStoragePath(), 'utf-8');
    expect(afterSecondRun).toBe(beforeSecondRun);
    expect(fs.existsSync(getRepairFlagPath())).toBe(true);
  });
});
