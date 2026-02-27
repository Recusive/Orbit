import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';

import {
  getSDKSessionIdForSession,
  invalidateCache,
  saveSessionInitMapping,
} from '../agent/session/session-storage.js';

describe('session-storage bridge lifecycle', () => {
  let tmpHome: string;
  let homedirSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-storage-bridge-'));
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    invalidateCache();
  });

  afterEach(() => {
    invalidateCache();
    homedirSpy.mockRestore();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('preserves parent mapping across fork init and restart cycle', () => {
    saveSessionInitMapping({
      sessionId: 'parent-aaa',
      sdkSessionId: 'parent-aaa',
      isForked: false,
    });
    expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa');

    saveSessionInitMapping({
      sessionId: 'parent-aaa',
      sdkSessionId: 'fork-bbb',
      isForked: true,
    });

    expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa');
    expect(getSDKSessionIdForSession('fork-bbb')).toBe('fork-bbb');

    invalidateCache();

    expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa');
    expect(getSDKSessionIdForSession('fork-bbb')).toBe('fork-bbb');
  });

  it('preserves resumed parent mapping when fork uses rekeyed SDK ID', () => {
    saveSessionInitMapping({
      sessionId: 'orbit-aaa',
      sdkSessionId: 'orbit-aaa',
      isForked: false,
    });

    saveSessionInitMapping({
      sessionId: 'orbit-aaa',
      sdkSessionId: 'sdk-bbb',
      isForked: false,
    });
    expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb');

    saveSessionInitMapping({
      sessionId: 'sdk-bbb',
      sdkSessionId: 'fork-ccc',
      isForked: true,
    });

    expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb');
    expect(getSDKSessionIdForSession('sdk-bbb')).toBe('sdk-bbb');
    expect(getSDKSessionIdForSession('fork-ccc')).toBe('fork-ccc');

    invalidateCache();

    expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb');
    expect(getSDKSessionIdForSession('sdk-bbb')).toBe('sdk-bbb');
    expect(getSDKSessionIdForSession('fork-ccc')).toBe('fork-ccc');
  });
});
