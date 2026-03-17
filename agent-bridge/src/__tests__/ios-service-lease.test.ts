import { describe, expect, it } from 'bun:test';

import { IOSManager } from '../ios/ios-manager.js';
import { IOSService } from '../ios/ios-service.js';

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

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

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
  readonly port = 4723;
  readonly pid = 4242;

  terminateSignals: ('SIGTERM' | 'SIGKILL')[] = [];
  private exitCode: number | null = null;
  private readonly listeners = new Set<(code: number | null) => void>();

  onExit(callback: (code: number | null) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  terminate(signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
    this.terminateSignals.push(signal);

    if (signal === 'SIGTERM') {
      this.simulateExit(0);
    }

    if (signal === 'SIGKILL') {
      this.simulateExit(9);
    }

    return Promise.resolve();
  }

  waitForExit(): Promise<number | null> {
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
    bootDeferred?: Deferred<undefined>;
    bootRejectOnAbort?: boolean;
  } = {}
): RuntimeHarness {
  const appium = new FakeAppiumProcess();
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

describe('IOSService lease model', () => {
  it('shares a single manager across sessions and only shuts down on last release', async () => {
    const runtime = createRuntimeHarness();
    let managerCount = 0;

    const service = new IOSService({
      managerFactory: () => {
        managerCount += 1;
        return new IOSManager({ dependencies: runtime.dependencies });
      },
    });

    const managerA = await service.acquire('session-a', 'iPhone 16 Pro');
    const managerB = await service.acquire('session-b');

    expect(managerA).toBe(managerB);
    expect(managerCount).toBe(1);
    expect(service.state).toBe('ready');
    expect(service.leaseCount).toBe(2);

    await service.release('session-a');
    expect(service.state).toBe('ready');
    expect(runtime.automationSession.deleteCount).toBe(0);

    await service.release('session-b');
    expect(service.state).toBe('idle');
    expect(runtime.automationSession.deleteCount).toBe(1);
    expect(runtime.shutdowns).toEqual([TEST_DEVICE.udid]);
  });

  it('waits on a single in-flight launch for concurrent acquire calls', async () => {
    const bootDeferred = createDeferred<undefined>();
    const runtime = createRuntimeHarness({ bootDeferred });
    let managerCount = 0;

    const service = new IOSService({
      managerFactory: () => {
        managerCount += 1;
        return new IOSManager({ dependencies: runtime.dependencies });
      },
    });

    const acquireA = service.acquire('session-a');
    const acquireB = service.acquire('session-b');

    await Promise.resolve();
    expect(service.state).toBe('launching');
    expect(managerCount).toBe(1);

    bootDeferred.resolve(undefined);

    const [managerA, managerB] = await Promise.all([acquireA, acquireB]);
    expect(managerA).toBe(managerB);
    expect(service.state).toBe('ready');
    expect(service.leaseCount).toBe(2);
  });

  it('force releases the last lease during launch and aborts the pending startup', async () => {
    const runtime = createRuntimeHarness({ bootRejectOnAbort: true });
    const service = new IOSService({
      managerFactory: () => new IOSManager({ dependencies: runtime.dependencies }),
    });

    const acquirePromise = service.acquire('session-a');
    await Promise.resolve();

    expect(service.state).toBe('launching');
    await service.forceRelease('session-a');

    await expectErrorMessage(acquirePromise, 'IOSManager launch aborted');
    expect(service.state).toBe('idle');
    expect(service.leaseCount).toBe(0);

    await service.forceRelease('session-a');
  });

  it('invalidates all leases after an Appium crash on the next manager access', async () => {
    const runtime = createRuntimeHarness();
    const service = new IOSService({
      managerFactory: () => new IOSManager({ dependencies: runtime.dependencies }),
    });

    await service.acquire('session-a');
    await service.acquire('session-b');

    runtime.appium.simulateExit(13);

    await expectErrorMessage(
      service.getManager('session-a'),
      'Appium process exited unexpectedly (code 13). Call ios_launch to restart.'
    );
    expect(service.state).toBe('idle');
    expect(service.leaseCount).toBe(0);

    await expectErrorMessage(service.getManager('session-b'), 'No iOS lease for session');
  });
});
