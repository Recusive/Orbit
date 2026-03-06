import { describe, expect, it } from 'bun:test';

import { canEnableIOS } from '../ios/ios-service.js';

describe('canEnableIOS', () => {
  it('returns false on non-macOS without running prerequisite checks', async () => {
    let calls = 0;

    const enabled = await canEnableIOS({
      platform: 'linux',
      env: { ORBIT_ENABLE_IOS_TOOLS: '1' },
      execFile: (): Promise<{ stdout: string; stderr: string }> => {
        calls += 1;
        return Promise.resolve({ stdout: '', stderr: '' });
      },
    });

    expect(enabled).toBe(false);
    expect(calls).toBe(0);
  });

  it('returns false when the iOS feature flag is disabled', async () => {
    let calls = 0;

    const enabled = await canEnableIOS({
      platform: 'darwin',
      env: {},
      execFile: (): Promise<{ stdout: string; stderr: string }> => {
        calls += 1;
        return Promise.resolve({ stdout: '', stderr: '' });
      },
    });

    expect(enabled).toBe(false);
    expect(calls).toBe(0);
  });

  it('returns false when prerequisite checks fail', async () => {
    const enabled = await canEnableIOS({
      platform: 'darwin',
      env: { ORBIT_ENABLE_IOS_TOOLS: '1' },
      execFile: (): Promise<{ stdout: string; stderr: string }> => {
        return Promise.reject(new Error('missing dependency'));
      },
    });

    expect(enabled).toBe(false);
  });

  it('returns true on macOS when the flag is enabled and prerequisites exist', async () => {
    const commands: string[] = [];

    const enabled = await canEnableIOS({
      platform: 'darwin',
      env: { ORBIT_ENABLE_IOS_TOOLS: '1' },
      execFile: (
        file: string,
        args: readonly string[]
      ): Promise<{ stdout: string; stderr: string }> => {
        commands.push([file, ...args].join(' '));
        return Promise.resolve({ stdout: '', stderr: '' });
      },
    });

    expect(enabled).toBe(true);
    expect(commands).toEqual(['xcrun simctl help', 'which appium']);
  });
});
