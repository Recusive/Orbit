/**
 * Process-level iOS simulator lease service.
 *
 * [warning] TESTED: This service is covered by integration-style lease tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test files:
 *     - src/__tests__/ios-service-lease.test.ts
 *     - src/__tests__/ios-platform-gate.test.ts
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createLogger } from '../common/logging/logger.js';

import { IOSManager } from './ios-manager.js';

import type { IOSDevice, IOSManagerLike, IOSLifecycleState, IOSServiceOptions } from './types.js';

const logger = createLogger('IOSService');
const execFileAsync = promisify(execFile);
const IOS_CHECK_TIMEOUT_MS = 5000;
const APPIUM_EXIT_MESSAGE_PREFIX = 'Appium process exited unexpectedly';

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export interface CanEnableIOSOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execFile?: (
    file: string,
    args: readonly string[],
    options?: { timeout?: number }
  ) => Promise<ExecFileResult>;
}

async function defaultExecFile(
  file: string,
  args: readonly string[],
  options?: { timeout?: number }
): Promise<ExecFileResult> {
  const result = await execFileAsync(file, [...args], {
    timeout: options?.timeout,
    encoding: 'utf8',
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function canEnableIOS(options: CanEnableIOSOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (platform !== 'darwin') {
    return false;
  }

  if (env.ORBIT_ENABLE_IOS_TOOLS !== '1') {
    return false;
  }

  const runExecFile = options.execFile ?? defaultExecFile;

  try {
    await runExecFile('xcrun', ['simctl', 'help'], { timeout: IOS_CHECK_TIMEOUT_MS });
    await runExecFile('which', ['appium'], { timeout: IOS_CHECK_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export class IOSService {
  private readonly managerFactory: () => IOSManagerLike;
  private readonly leaseholders = new Set<string>();

  private manager: IOSManagerLike | null = null;
  private launchPromise: Promise<IOSManagerLike> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private _state: IOSLifecycleState = 'idle';
  private launchVersion = 0;

  constructor(options: IOSServiceOptions = {}) {
    this.managerFactory = options.managerFactory ?? (() => new IOSManager());
  }

  get state(): IOSLifecycleState {
    return this._state;
  }

  get leaseCount(): number {
    return this.leaseholders.size;
  }

  hasLease(sessionId: string): boolean {
    return this.leaseholders.has(sessionId);
  }

  async listDevices(): Promise<IOSDevice[]> {
    this.assertNotDisposed();

    const activeManager = this.manager;
    if (activeManager !== null) {
      return activeManager.listDevices();
    }

    const manager = this.managerFactory();
    try {
      return await manager.listDevices();
    } finally {
      await manager.dispose().catch((error: unknown) => {
        logger.warn({ error }, 'Failed to dispose temporary iOS manager after device list');
      });
    }
  }

  async acquire(sessionId: string, deviceQuery?: string): Promise<IOSManagerLike> {
    this.assertNotDisposed();

    if (this._state === 'closing' && this.shutdownPromise !== null) {
      await this.shutdownPromise;
    }

    this.assertNotDisposed();
    this.leaseholders.add(sessionId);

    if (this._state === 'ready') {
      return this.getManager(sessionId);
    }

    if (this._state === 'launching' && this.launchPromise !== null) {
      return this.launchPromise;
    }

    const manager = this.managerFactory();
    this.manager = manager;
    this._state = 'launching';

    const launchVersion = ++this.launchVersion;
    const currentLaunch = (async (): Promise<IOSManagerLike> => {
      try {
        await manager.launch(deviceQuery);
        if (this._state === 'disposed') {
          throw new Error('IOSService disposed');
        }
        this._state = 'ready';
        return await this.getManager(sessionId);
      } catch (error) {
        await this.handleLaunchFailure(manager, error);
        throw error;
      } finally {
        if (this.launchVersion === launchVersion) {
          this.launchPromise = null;
        }
      }
    })();

    this.launchPromise = currentLaunch;
    return currentLaunch;
  }

  async getManager(sessionId: string): Promise<IOSManagerLike> {
    if (!this.leaseholders.has(sessionId)) {
      throw new Error('No iOS lease for session');
    }

    if (this._state === 'launching' && this.launchPromise !== null) {
      return this.launchPromise;
    }

    const manager = this.manager;
    if (manager === null) {
      throw new Error('iOS not ready');
    }

    try {
      manager.assertUsable();
      return manager;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(APPIUM_EXIT_MESSAGE_PREFIX)) {
        await this.handleAppiumCrash(error);
      }
      throw error;
    }
  }

  async release(sessionId: string): Promise<void> {
    if (!this.leaseholders.delete(sessionId)) {
      return;
    }

    if (this.leaseholders.size === 0 && (this._state === 'ready' || this._state === 'launching')) {
      await this.shutdown();
    }
  }

  async forceRelease(sessionId: string): Promise<void> {
    if (!this.leaseholders.has(sessionId)) {
      return;
    }

    await this.release(sessionId);
  }

  async shutdown(): Promise<void> {
    if (this._state === 'disposed') {
      return;
    }

    if (this._state === 'idle') {
      this.leaseholders.clear();
      this.manager = null;
      this.launchPromise = null;
      return;
    }

    if (this.shutdownPromise !== null) {
      return this.shutdownPromise;
    }

    this._state = 'closing';
    const manager = this.manager;

    const currentShutdown = (async (): Promise<void> => {
      try {
        await manager?.close();
      } catch (error) {
        logger.warn({ error }, 'Failed to close iOS manager during shutdown');
      } finally {
        if (this.manager === manager) {
          this.manager = null;
        }
        this.launchPromise = null;
        this.leaseholders.clear();
        if (this._state !== 'disposed') {
          this._state = 'idle';
        }
      }
    })().finally(() => {
      if (this.shutdownPromise === currentShutdown) {
        this.shutdownPromise = null;
      }
    });

    this.shutdownPromise = currentShutdown;
    return currentShutdown;
  }

  async dispose(): Promise<void> {
    if (this._state === 'disposed') {
      return;
    }

    await this.shutdown();
    this._state = 'disposed';
  }

  private assertNotDisposed(): void {
    if (this._state === 'disposed') {
      throw new Error('IOSService disposed');
    }
  }

  private async handleLaunchFailure(manager: IOSManagerLike, error: unknown): Promise<void> {
    logger.warn({ error }, 'iOS launch failed');

    try {
      await manager.close();
    } catch (closeError) {
      logger.warn({ error: closeError }, 'Failed to clean up failed iOS launch');
    }

    if (this.manager === manager) {
      this.manager = null;
    }
    this.leaseholders.clear();
    if (this._state !== 'disposed') {
      this._state = 'idle';
    }
  }

  private async handleAppiumCrash(error: Error): Promise<void> {
    logger.warn({ error: error.message }, 'Appium exited unexpectedly, resetting iOS service');
    await this.shutdown();
  }
}
