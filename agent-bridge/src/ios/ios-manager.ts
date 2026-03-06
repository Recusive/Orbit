/**
 * iOS simulator/Appium lifecycle manager.
 *
 * [warning] TESTED: This class is covered by integration-style lifecycle tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test file: src/__tests__/ios-manager-lifecycle.test.ts
 */

import { createLogger } from '../common/logging/logger.js';

import type {
  IOSAppiumProcess,
  IOSAutomationSession,
  IOSCheckResult,
  IOSConsoleLogLevel,
  IOSConsoleLogsResult,
  IOSDevice,
  IOSFillResult,
  IOSHtmlResult,
  IOSEvalResult,
  IOSLaunchResult,
  IOSLifecycleState,
  IOSManagerDependencies,
  IOSManagerLike,
  IOSManagerOptions,
  IOSScrollDirection,
  IOSScrollResult,
  IOSSelectResult,
  IOSSnapshotOptions,
  IOSScreenshotResult,
  IOSSuccessResult,
  IOSSwipeDirection,
  IOSSwipeResult,
  IOSTapResult,
  IOSTargetInput,
  IOSTextResult,
  IOSTypeResult,
  IOSUncheckResult,
  IOSWaitForSelectorState,
  IOSWaitForSelectorResult,
} from './types.js';
import type { SnapshotResponse } from '../browser/types.js';

const logger = createLogger('IOSManager');
const APPIUM_EXIT_TIMEOUT_MS = 5000;
const APPIUM_RESTART_MESSAGE_PREFIX = 'Appium process exited unexpectedly';

function createUnconfiguredDependencies(): IOSManagerDependencies {
  const error = (): Error => new Error('IOSManager dependencies are not configured');

  return {
    listDevices(): Promise<IOSDevice[]> {
      return Promise.reject(error());
    },
    bootDevice(): Promise<void> {
      return Promise.reject(error());
    },
    shutdownDevice(): Promise<void> {
      return Promise.reject(error());
    },
    startAppium(): Promise<IOSAppiumProcess> {
      return Promise.reject(error());
    },
    createAutomationSession(): Promise<IOSAutomationSession> {
      return Promise.reject(error());
    },
  };
}

function normalizeExitCode(code: number | null): number {
  return code ?? -1;
}

function createLaunchAbortError(): Error {
  return new Error('IOSManager launch aborted');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createLaunchAbortError();
  }
}

function isMatchingDevice(device: IOSDevice, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedName = device.name.trim().toLowerCase();
  const normalizedUdid = device.udid.trim().toLowerCase();
  return (
    normalizedName === normalizedQuery ||
    normalizedName.includes(normalizedQuery) ||
    normalizedUdid === normalizedQuery
  );
}

export class IOSManager implements IOSManagerLike {
  private readonly dependencies: IOSManagerDependencies;

  private appiumProcess: IOSAppiumProcess | null = null;
  private automationSession: IOSAutomationSession | null = null;
  private activeDevice: IOSDevice | null = null;
  private launchResult: IOSLaunchResult | null = null;
  private appiumExitUnsubscribe: (() => void) | null = null;
  private appiumExitCode: number | null = null;
  private closePromise: Promise<void> | null = null;
  private launchAbortController: AbortController | null = null;
  private _state: IOSLifecycleState = 'idle';

  constructor(options: IOSManagerOptions = {}) {
    this.dependencies = options.dependencies ?? createUnconfiguredDependencies();
  }

  get state(): IOSLifecycleState {
    return this._state;
  }

  getLaunchResult(): IOSLaunchResult | null {
    return this.launchResult;
  }

  async listDevices(): Promise<IOSDevice[]> {
    this.assertNotDisposed();
    const controller = new AbortController();
    return this.dependencies.listDevices(controller.signal);
  }

  assertUsable(): void {
    if (this._state === 'disposed') {
      throw new Error('IOSManager disposed');
    }

    if (this._state !== 'ready') {
      throw new Error('iOS not ready');
    }

    if (this.appiumExitCode !== null) {
      throw new Error(
        `${APPIUM_RESTART_MESSAGE_PREFIX} (code ${String(this.appiumExitCode)}). Call ios_launch to restart.`
      );
    }
  }

  async launch(deviceQuery?: string): Promise<IOSLaunchResult> {
    this.assertNotDisposed();

    if (this._state === 'ready' && this.launchResult !== null) {
      return this.launchResult;
    }

    if (this._state === 'launching') {
      throw new Error('IOSManager launch already in progress');
    }

    if (this._state === 'closing') {
      throw new Error('IOSManager is closing');
    }

    this._state = 'launching';
    this.appiumExitCode = null;

    const abortController = new AbortController();
    this.launchAbortController = abortController;

    try {
      const device = await this.findDevice(deviceQuery, abortController.signal);
      throwIfAborted(abortController.signal);

      await this.dependencies.bootDevice(device, abortController.signal);
      throwIfAborted(abortController.signal);

      const appiumProcess = await this.dependencies.startAppium(abortController.signal);
      throwIfAborted(abortController.signal);

      this.appiumProcess = appiumProcess;
      this.appiumExitUnsubscribe = appiumProcess.onExit((code) => {
        this.appiumExitCode = normalizeExitCode(code);
      });

      const automationSession = await this.dependencies.createAutomationSession(
        device,
        appiumProcess.port,
        abortController.signal
      );
      throwIfAborted(abortController.signal);

      this.automationSession = automationSession;
      this.activeDevice = device;
      this.launchResult = {
        udid: device.udid,
        name: device.name,
        runtime: device.runtime,
        appiumPort: appiumProcess.port,
      };
      this._state = 'ready';

      return this.launchResult;
    } catch (error) {
      await this.close().catch((closeError: unknown) => {
        logger.warn({ error: closeError }, 'Failed to clean up after iOS launch error');
      });
      throw error;
    } finally {
      if (this.launchAbortController === abortController) {
        this.launchAbortController = null;
      }
    }
  }

  async close(): Promise<void> {
    if (this._state === 'disposed' || this._state === 'idle') {
      return;
    }

    if (this.closePromise !== null) {
      return this.closePromise;
    }

    this._state = 'closing';

    const launchAbortController = this.launchAbortController;
    this.launchAbortController = null;

    const automationSession = this.automationSession;
    this.automationSession = null;

    const appiumProcess = this.appiumProcess;
    this.appiumProcess = null;

    const appiumExitUnsubscribe = this.appiumExitUnsubscribe;
    this.appiumExitUnsubscribe = null;

    const activeDevice = this.activeDevice;
    this.activeDevice = null;
    this.launchResult = null;

    this.closePromise = (async () => {
      launchAbortController?.abort();

      if (automationSession !== null) {
        try {
          await automationSession.deleteSession();
        } catch (error) {
          logger.warn({ error }, 'Failed to delete iOS automation session');
        }
      }

      appiumExitUnsubscribe?.();

      if (appiumProcess !== null) {
        await this.stopAppiumProcess(appiumProcess);
      }

      if (activeDevice !== null) {
        try {
          await this.dependencies.shutdownDevice(activeDevice);
        } catch (error) {
          logger.warn({ error, udid: activeDevice.udid }, 'Failed to shut down iOS simulator');
        }
      }

      this.appiumExitCode = null;

      if (this._state !== 'disposed') {
        this._state = 'idle';
      }
    })().finally(() => {
      this.closePromise = null;
    });

    return this.closePromise;
  }

  async dispose(): Promise<void> {
    if (this._state === 'disposed') {
      return;
    }

    await this.close();
    this._state = 'disposed';
  }

  async navigate(url: string): Promise<IOSSuccessResult> {
    await this.getAutomationSession().navigate(url);
    return { success: true };
  }

  async back(): Promise<IOSSuccessResult> {
    await this.getAutomationSession().back();
    return { success: true };
  }

  async forward(): Promise<IOSSuccessResult> {
    await this.getAutomationSession().forward();
    return { success: true };
  }

  async reload(): Promise<IOSSuccessResult> {
    await this.getAutomationSession().reload();
    return { success: true };
  }

  async snapshot(options: IOSSnapshotOptions): Promise<SnapshotResponse> {
    return this.getAutomationSession().snapshot(options);
  }

  async getText(target: IOSTargetInput): Promise<IOSTextResult> {
    const text = await this.getAutomationSession().getText(target);
    return { text };
  }

  async getHtml(target: IOSTargetInput, outer?: boolean): Promise<IOSHtmlResult> {
    const html = await this.getAutomationSession().getHtml(target, outer);
    return { html };
  }

  async screenshot(): Promise<IOSScreenshotResult> {
    return this.getAutomationSession().screenshot();
  }

  async tap(target: IOSTargetInput): Promise<IOSTapResult> {
    await this.getAutomationSession().tap(target);
    return { tapped: true };
  }

  async fill(target: IOSTargetInput, value: string): Promise<IOSFillResult> {
    await this.getAutomationSession().fill(target, value);
    return { filled: true };
  }

  async type(target: IOSTargetInput, text: string): Promise<IOSTypeResult> {
    await this.getAutomationSession().type(target, text);
    return { typed: true };
  }

  async select(target: IOSTargetInput, values: string[]): Promise<IOSSelectResult> {
    await this.getAutomationSession().select(target, values);
    return { selected: true };
  }

  async check(target: IOSTargetInput): Promise<IOSCheckResult> {
    await this.getAutomationSession().check(target);
    return { checked: true };
  }

  async uncheck(target: IOSTargetInput): Promise<IOSUncheckResult> {
    await this.getAutomationSession().uncheck(target);
    return { unchecked: true };
  }

  async swipe(
    direction: IOSSwipeDirection,
    target?: IOSTargetInput,
    duration?: number
  ): Promise<IOSSwipeResult> {
    await this.getAutomationSession().swipe(direction, target, duration);
    return { swiped: true };
  }

  async scroll(direction: IOSScrollDirection, amount?: number): Promise<IOSScrollResult> {
    return this.getAutomationSession().scroll(direction, amount);
  }

  async evaluate(script: string): Promise<IOSEvalResult> {
    const result = await this.getAutomationSession().evaluate(script);
    return { result };
  }

  async waitForSelector(
    selector: string,
    state?: IOSWaitForSelectorState,
    timeout?: number
  ): Promise<IOSWaitForSelectorResult> {
    await this.getAutomationSession().waitForSelector(selector, state, timeout);
    return { matched: true };
  }

  async consoleLogs(level?: IOSConsoleLogLevel): Promise<IOSConsoleLogsResult> {
    const logs = await this.getAutomationSession().consoleLogs(level);
    return { logs };
  }

  private assertNotDisposed(): void {
    if (this._state === 'disposed') {
      throw new Error('IOSManager disposed');
    }
  }

  private getAutomationSession(): IOSAutomationSession {
    this.assertUsable();
    const session = this.automationSession;
    if (session === null) {
      throw new Error('iOS not ready');
    }
    return session;
  }

  private async findDevice(query: string | undefined, signal: AbortSignal): Promise<IOSDevice> {
    const devices = await this.dependencies.listDevices(signal);
    const availableDevices = devices.filter((device) => device.isAvailable);

    if (query === undefined || query.trim() === '') {
      const bootedDevice = availableDevices.find((device) => device.state === 'Booted');
      if (bootedDevice !== undefined) {
        return bootedDevice;
      }

      const firstDevice = availableDevices[0];
      if (firstDevice !== undefined) {
        return firstDevice;
      }
    } else {
      const matchedDevice = availableDevices.find((device) => isMatchingDevice(device, query));
      if (matchedDevice !== undefined) {
        return matchedDevice;
      }
    }

    throwIfAborted(signal);

    const availableNames = availableDevices.map((device) => device.name).join(', ') || 'none';
    const requestedDevice = query ?? 'default';
    throw new Error(
      `No simulator found matching '${requestedDevice}'. Available: ${availableNames}`
    );
  }

  private async stopAppiumProcess(appiumProcess: IOSAppiumProcess): Promise<void> {
    try {
      await appiumProcess.terminate('SIGTERM');
    } catch (error) {
      logger.warn({ error, pid: appiumProcess.pid }, 'Failed to send SIGTERM to Appium');
    }

    const exitCode = await appiumProcess.waitForExit(APPIUM_EXIT_TIMEOUT_MS);
    if (exitCode !== null) {
      return;
    }

    try {
      await appiumProcess.terminate('SIGKILL');
    } catch (error) {
      logger.warn({ error, pid: appiumProcess.pid }, 'Failed to send SIGKILL to Appium');
    }

    await appiumProcess.waitForExit(APPIUM_EXIT_TIMEOUT_MS);
  }
}
