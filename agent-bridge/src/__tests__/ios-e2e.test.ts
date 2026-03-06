/**
 * iOS Simulator end-to-end tests.
 *
 * These tests require macOS + Xcode + Appium to be installed.
 * They auto-skip on non-macOS platforms and when dependencies are unavailable.
 *
 * Run: cd agent-bridge && bun test src/__tests__/ios-e2e.test.ts
 */

import { describe, expect, it } from 'bun:test';

import { canEnableIOS, IOSService } from '../ios/ios-service.js';

import type { IOSManagerLike } from '../ios/types.js';

const SKIP_REASON_NON_MACOS = 'iOS E2E tests require macOS (skipped on this platform)';
const SKIP_REASON_MISSING_DEPS =
  'iOS E2E tests require Xcode and Appium (set ORBIT_ENABLE_IOS_TOOLS=1 and install dependencies)';

async function shouldSkip(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return SKIP_REASON_NON_MACOS;
  }

  const enabled = await canEnableIOS({
    env: { ...process.env, ORBIT_ENABLE_IOS_TOOLS: '1' },
  });

  if (!enabled) {
    return SKIP_REASON_MISSING_DEPS;
  }

  return null;
}

describe('iOS Simulator E2E', () => {
  it('auto-skip gate: checks for macOS + Xcode + Appium', async () => {
    const skipReason = await shouldSkip();

    if (skipReason !== null) {
      console.warn(`[ios-e2e] ${skipReason}`);
      expect(skipReason).toBeString();
      return;
    }

    expect(process.platform).toBe('darwin');
  });

  it('canEnableIOS returns false on non-darwin platform', async () => {
    const result = await canEnableIOS({ platform: 'linux' });
    expect(result).toBe(false);
  });

  it('canEnableIOS returns false when ORBIT_ENABLE_IOS_TOOLS is unset', async () => {
    const result = await canEnableIOS({ platform: 'darwin', env: {} });
    expect(result).toBe(false);
  });

  it('canEnableIOS returns false when xcrun is not available', async () => {
    const result = await canEnableIOS({
      platform: 'darwin',
      env: { ORBIT_ENABLE_IOS_TOOLS: '1' },
      execFile: () => Promise.reject(new Error('not found')),
    });
    expect(result).toBe(false);
  });

  it('canEnableIOS returns true when all dependencies are available', async () => {
    const result = await canEnableIOS({
      platform: 'darwin',
      env: { ORBIT_ENABLE_IOS_TOOLS: '1' },
      execFile: () => Promise.resolve({ stdout: '', stderr: '' }),
    });
    expect(result).toBe(true);
  });

  it('full lifecycle: launch -> snapshot -> tap -> screenshot -> close (live)', async () => {
    const skipReason = await shouldSkip();
    if (skipReason !== null) {
      console.warn(`[ios-e2e] Skipping live test: ${skipReason}`);
      return;
    }

    const service = new IOSService();
    let manager: IOSManagerLike | undefined;

    try {
      manager = await service.acquire('e2e-session');
      expect(service.state).toBe('ready');
      expect(service.hasLease('e2e-session')).toBe(true);

      const launchResult = manager.getLaunchResult();
      if (launchResult === null) {
        throw new Error('Expected launch result to be non-null after acquire');
      }
      expect(launchResult.udid).toBeString();
      expect(launchResult.name).toBeString();

      await manager.navigate('https://example.com');

      const snapshot = await manager.snapshot({ interactive: true });
      expect(snapshot.epoch).toBeGreaterThanOrEqual(1);
      expect(snapshot.snapshot).toContain('document');
      expect(typeof snapshot.refCount).toBe('number');

      const screenshot = await manager.screenshot();
      expect(screenshot.image).toBeString();
      expect(screenshot.image.length).toBeGreaterThan(0);
      expect(screenshot.format).toBe('png');
    } finally {
      await service.release('e2e-session');
      expect(service.state).toBe('idle');
      expect(service.leaseCount).toBe(0);
    }
  });

  it('multi-session lease sharing (live)', async () => {
    const skipReason = await shouldSkip();
    if (skipReason !== null) {
      console.warn(`[ios-e2e] Skipping live test: ${skipReason}`);
      return;
    }

    const service = new IOSService();

    try {
      const managerA = await service.acquire('session-a');
      const managerB = await service.acquire('session-b');

      expect(service.leaseCount).toBe(2);
      expect(managerA).toBe(managerB);

      await service.release('session-a');
      expect(service.state).toBe('ready');
      expect(service.leaseCount).toBe(1);

      await service.release('session-b');
      expect(service.state).toBe('idle');
      expect(service.leaseCount).toBe(0);
    } finally {
      await service.dispose();
    }
  });
});
