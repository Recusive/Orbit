import { describe, expect, it } from 'bun:test';

import { IOSManager } from '../ios/ios-manager.js';

import type { BrowserConsoleLogEntry, SnapshotResponse } from '../browser/types.js';
import type {
  IOSConsoleLogLevel,
  IOSAppiumProcess,
  IOSAutomationSession,
  IOSDevice,
  IOSScreenshotResult,
  IOSManagerDependencies,
  IOSScrollDirection,
  IOSScrollResult,
  IOSSnapshotOptions,
  IOSSwipeDirection,
  IOSTargetInput,
  IOSWaitForSelectorState,
} from '../ios/types.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

interface RuntimeHarness {
  appium: FakeAppiumProcess;
  automationSession: FakeAutomationSession;
  dependencies: IOSManagerDependencies;
  shutdowns: string[];
}

const TEST_DEVICE: IOSDevice = {
  name: 'iPhone 16 Pro',
  udid: 'TEST-UDID-1',
  state: 'Shutdown',
  runtime: 'iOS 18.2',
  isAvailable: true,
};

class FakeAutomationSession implements IOSAutomationSession {
  deleteCount = 0;

  deleteSession(): Promise<void> {
    this.deleteCount += 1;
    return Promise.resolve();
  }

  navigate(): Promise<void> {
    return Promise.resolve();
  }

  back(): Promise<void> {
    return Promise.resolve();
  }

  forward(): Promise<void> {
    return Promise.resolve();
  }

  reload(): Promise<void> {
    return Promise.resolve();
  }

  snapshot(options: IOSSnapshotOptions): Promise<SnapshotResponse> {
    void options;
    return Promise.resolve({
      epoch: 1,
      snapshot: '- document',
      refCount: 0,
      totalElements: 0,
      emittedElements: 0,
      truncated: false,
      url: 'about:blank',
      title: '',
      durationMs: 0,
    });
  }

  getText(target: IOSTargetInput): Promise<string> {
    void target;
    return Promise.resolve('');
  }

  getHtml(target: IOSTargetInput, outer?: boolean): Promise<string> {
    void target;
    void outer;
    return Promise.resolve('');
  }

  screenshot(): Promise<IOSScreenshotResult> {
    return Promise.resolve({ image: '', format: 'png' });
  }

  tap(target: IOSTargetInput): Promise<void> {
    void target;
    return Promise.resolve();
  }

  fill(target: IOSTargetInput, value: string): Promise<void> {
    void target;
    void value;
    return Promise.resolve();
  }

  type(target: IOSTargetInput, text: string): Promise<void> {
    void target;
    void text;
    return Promise.resolve();
  }

  select(target: IOSTargetInput, values: string[]): Promise<void> {
    void target;
    void values;
    return Promise.resolve();
  }

  check(target: IOSTargetInput): Promise<void> {
    void target;
    return Promise.resolve();
  }

  uncheck(target: IOSTargetInput): Promise<void> {
    void target;
    return Promise.resolve();
  }

  swipe(direction: IOSSwipeDirection, target?: IOSTargetInput, duration?: number): Promise<void> {
    void direction;
    void target;
    void duration;
    return Promise.resolve();
  }

  scroll(direction: IOSScrollDirection, amount?: number): Promise<IOSScrollResult> {
    void direction;
    void amount;
    return Promise.resolve({ scrollX: 0, scrollY: 0 });
  }

  evaluate(script: string): Promise<unknown> {
    void script;
    return Promise.resolve(null);
  }

  waitForSelector(
    selector: string,
    state?: IOSWaitForSelectorState,
    timeout?: number
  ): Promise<void> {
    void selector;
    void state;
    void timeout;
    return Promise.resolve();
  }

  consoleLogs(level?: IOSConsoleLogLevel): Promise<BrowserConsoleLogEntry[]> {
    void level;
    return Promise.resolve([]);
  }
}

class FakeAppiumProcess implements IOSAppiumProcess {
  readonly port: number;
  readonly pid: number;

  terminateSignals: ('SIGTERM' | 'SIGKILL')[] = [];
  waitTimeouts: number[] = [];

  private exitCode: number | null = null;
  private readonly listeners = new Set<(code: number | null) => void>();
  private readonly exitOnSigterm: boolean;

  constructor(options: { port?: number; pid?: number; exitOnSigterm?: boolean } = {}) {
    this.port = options.port ?? 4723;
    this.pid = options.pid ?? 4242;
    this.exitOnSigterm = options.exitOnSigterm ?? true;
  }

  onExit(callback: (code: number | null) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  terminate(signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
    this.terminateSignals.push(signal);

    if (signal === 'SIGTERM' && this.exitOnSigterm) {
      this.simulateExit(0);
    }

    if (signal === 'SIGKILL') {
      this.simulateExit(9);
    }

    return Promise.resolve();
  }

  waitForExit(timeoutMs: number): Promise<number | null> {
    this.waitTimeouts.push(timeoutMs);
    return Promise.resolve(this.exitCode);
  }

  simulateExit(code: number): void {
    this.exitCode = code;
    for (const listener of this.listeners) {
      listener(code);
    }
  }
}

function createRuntimeHarness(
  options: {
    exitOnSigterm?: boolean;
    bootDeferred?: Deferred<void>;
    bootRejectOnAbort?: boolean;
  } = {}
): RuntimeHarness {
  const appium = new FakeAppiumProcess({
    exitOnSigterm: options.exitOnSigterm,
  });
  const automationSession = new FakeAutomationSession();
  const shutdowns: string[] = [];

  const dependencies: IOSManagerDependencies = {
    listDevices(): Promise<IOSDevice[]> {
      return Promise.resolve([TEST_DEVICE]);
    },
    async bootDevice(_device: IOSDevice, signal: AbortSignal): Promise<void> {
      if (options.bootRejectOnAbort) {
        await new Promise<void>((_resolve, reject) => {
          const abortHandler = (): void => {
            reject(new Error('IOSManager launch aborted'));
          };

          if (signal.aborted) {
            abortHandler();
            return;
          }

          signal.addEventListener('abort', abortHandler, { once: true });
        });
        return;
      }

      if (options.bootDeferred !== undefined) {
        await new Promise<void>((resolve, reject) => {
          const abortHandler = (): void => {
            reject(new Error('IOSManager launch aborted'));
          };

          if (signal.aborted) {
            abortHandler();
            return;
          }

          signal.addEventListener('abort', abortHandler, { once: true });
          void options.bootDeferred?.promise.then(
            () => {
              signal.removeEventListener('abort', abortHandler);
              resolve();
            },
            (error: unknown) => {
              signal.removeEventListener('abort', abortHandler);
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          );
        });
      }
    },
    shutdownDevice(device: IOSDevice): Promise<void> {
      shutdowns.push(device.udid);
      return Promise.resolve();
    },
    startAppium(): Promise<IOSAppiumProcess> {
      return Promise.resolve(appium);
    },
    createAutomationSession(): Promise<IOSAutomationSession> {
      return Promise.resolve(automationSession);
    },
  };

  return {
    appium,
    automationSession,
    dependencies,
    shutdowns,
  };
}

async function expectErrorMessage(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected promise to reject with: ${message}`);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    expect(error.message).toBe(message);
  }
}

describe('IOSManager lifecycle', () => {
  it('launches, closes, and disposes with idempotent cleanup', async () => {
    const runtime = createRuntimeHarness();
    const manager = new IOSManager({ dependencies: runtime.dependencies });

    const launchResult = await manager.launch('iPhone 16 Pro');

    expect(launchResult).toEqual({
      udid: TEST_DEVICE.udid,
      name: TEST_DEVICE.name,
      runtime: TEST_DEVICE.runtime,
      appiumPort: 4723,
    });
    expect(manager.state).toBe('ready');

    await manager.close();
    expect(manager.state).toBe('idle');
    expect(runtime.automationSession.deleteCount).toBe(1);
    expect(runtime.appium.terminateSignals).toEqual(['SIGTERM']);
    expect(runtime.shutdowns).toEqual([TEST_DEVICE.udid]);

    await manager.close();
    expect(runtime.automationSession.deleteCount).toBe(1);

    await manager.dispose();
    expect(manager.state).toBe('disposed');

    await expectErrorMessage(manager.listDevices(), 'IOSManager disposed');
  });

  it('escalates to SIGKILL if Appium does not exit after SIGTERM', async () => {
    const runtime = createRuntimeHarness({ exitOnSigterm: false });
    const manager = new IOSManager({ dependencies: runtime.dependencies });

    await manager.launch();
    await manager.close();

    expect(runtime.appium.terminateSignals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('aborts an in-flight launch when close is called', async () => {
    const runtime = createRuntimeHarness({ bootRejectOnAbort: true });
    const manager = new IOSManager({ dependencies: runtime.dependencies });

    const launchPromise = manager.launch();
    await Promise.resolve();

    expect(manager.state).toBe('launching');

    await manager.close();
    await expectErrorMessage(launchPromise, 'IOSManager launch aborted');
    expect(manager.state).toBe('idle');
  });

  it('reports the exact Appium crash message after an unexpected exit', async () => {
    const runtime = createRuntimeHarness();
    const manager = new IOSManager({ dependencies: runtime.dependencies });

    await manager.launch();
    runtime.appium.simulateExit(11);

    expect(() => {
      manager.assertUsable();
    }).toThrow('Appium process exited unexpectedly (code 11). Call ios_launch to restart.');
  });
});
