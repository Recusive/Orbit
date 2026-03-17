import { beforeEach, describe, expect, it } from 'bun:test';

import { createIOSMcpServer } from '../ios/ios-mcp-server.js';

import type { SnapshotResponse } from '../browser/types.js';
import type { IOSService } from '../ios/ios-service.js';
import type {
  IOSConsoleLogsResult,
  IOSDevice,
  IOSLaunchResult,
  IOSManagerLike,
  IOSScrollResult,
  IOSScreenshotResult,
  IOSTargetInput,
} from '../ios/types.js';

interface McpToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface RegisteredTool {
  handler: (
    args: Record<string, unknown>,
    context: Record<string, unknown>
  ) => Promise<McpToolResponse>;
}

interface McpServerInternal {
  _registeredTools: Record<string, RegisteredTool>;
}

const TEST_DEVICE: IOSDevice = {
  name: 'iPhone 16 Pro',
  udid: 'TEST-UDID-1',
  state: 'Booted',
  runtime: 'iOS 18.2',
  isAvailable: true,
};

const TEST_LAUNCH_RESULT: IOSLaunchResult = {
  udid: TEST_DEVICE.udid,
  name: TEST_DEVICE.name,
  runtime: TEST_DEVICE.runtime,
  appiumPort: 4723,
};

const TEST_SNAPSHOT: SnapshotResponse = {
  epoch: 2,
  snapshot: '- button "Continue" [ref=e12]',
  refCount: 1,
  totalElements: 5,
  emittedElements: 5,
  truncated: false,
  url: 'https://example.com',
  title: 'Example',
  durationMs: 12,
};

const TEST_SCREENSHOT: IOSScreenshotResult = {
  image:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3ZyXcAAAAASUVORK5CYII=',
  format: 'png',
};

class FakeIOSManager implements IOSManagerLike {
  readonly state = 'ready';

  lastTapTarget: IOSTargetInput | null = null;
  lastSwipe: {
    direction: string;
    target?: IOSTargetInput;
    duration?: number;
  } | null = null;
  lastSnapshotArgs: Record<string, unknown> | null = null;

  listDevices(): Promise<IOSDevice[]> {
    return Promise.resolve([TEST_DEVICE]);
  }

  launch(): Promise<IOSLaunchResult> {
    return Promise.resolve(TEST_LAUNCH_RESULT);
  }

  navigate(): Promise<{ success: true }> {
    return Promise.resolve({ success: true });
  }

  back(): Promise<{ success: true }> {
    return Promise.resolve({ success: true });
  }

  forward(): Promise<{ success: true }> {
    return Promise.resolve({ success: true });
  }

  reload(): Promise<{ success: true }> {
    return Promise.resolve({ success: true });
  }

  snapshot(options: Record<string, unknown>): Promise<SnapshotResponse> {
    this.lastSnapshotArgs = options;
    return Promise.resolve(TEST_SNAPSHOT);
  }

  getText(): Promise<{ text: string }> {
    return Promise.resolve({ text: 'Continue' });
  }

  getHtml(): Promise<{ html: string }> {
    return Promise.resolve({ html: '<button>Continue</button>' });
  }

  screenshot(): Promise<IOSScreenshotResult> {
    return Promise.resolve(TEST_SCREENSHOT);
  }

  tap(target: IOSTargetInput): Promise<{ tapped: true }> {
    this.lastTapTarget = target;
    return Promise.resolve({ tapped: true });
  }

  fill(): Promise<{ filled: true }> {
    return Promise.resolve({ filled: true });
  }

  type(): Promise<{ typed: true }> {
    return Promise.resolve({ typed: true });
  }

  select(): Promise<{ selected: true }> {
    return Promise.resolve({ selected: true });
  }

  check(): Promise<{ checked: true }> {
    return Promise.resolve({ checked: true });
  }

  uncheck(): Promise<{ unchecked: true }> {
    return Promise.resolve({ unchecked: true });
  }

  swipe(direction: string, target?: IOSTargetInput, duration?: number): Promise<{ swiped: true }> {
    this.lastSwipe = { direction, target, duration };
    return Promise.resolve({ swiped: true });
  }

  scroll(): Promise<IOSScrollResult> {
    return Promise.resolve({ scrollX: 0, scrollY: 320 });
  }

  evaluate(): Promise<{ result: unknown }> {
    return Promise.resolve({ result: { ok: true } });
  }

  waitForSelector(): Promise<{ matched: true }> {
    return Promise.resolve({ matched: true });
  }

  consoleLogs(): Promise<IOSConsoleLogsResult> {
    return Promise.resolve({ logs: [] });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  assertUsable(): void {
    // no-op
  }

  getLaunchResult(): IOSLaunchResult | null {
    return TEST_LAUNCH_RESULT;
  }
}

class FakeIOSService {
  hasLeaseValue = true;
  listDevicesCalls = 0;
  releaseCalls: string[] = [];
  acquireCalls: { sessionId: string; device?: string }[] = [];
  manager: FakeIOSManager;

  constructor(manager: FakeIOSManager) {
    this.manager = manager;
  }

  listDevices(): Promise<IOSDevice[]> {
    this.listDevicesCalls += 1;
    return Promise.resolve([TEST_DEVICE]);
  }

  acquire(sessionId: string, device?: string): Promise<FakeIOSManager> {
    this.acquireCalls.push({ sessionId, device });
    this.hasLeaseValue = true;
    return Promise.resolve(this.manager);
  }

  getManager(): Promise<FakeIOSManager> {
    if (!this.hasLeaseValue) {
      return Promise.reject(new Error('No iOS lease for session'));
    }
    return Promise.resolve(this.manager);
  }

  hasLease(): boolean {
    return this.hasLeaseValue;
  }

  release(sessionId: string): Promise<void> {
    this.releaseCalls.push(sessionId);
    this.hasLeaseValue = false;
    return Promise.resolve();
  }
}

function getToolHandler(service: IOSService, toolName: string): RegisteredTool['handler'] {
  const server = createIOSMcpServer(service, 'session-1');
  const internal = server.instance as unknown as McpServerInternal;
  const tool = internal._registeredTools[toolName];
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}`);
  }
  return tool.handler;
}

function parseJsonContent(result: McpToolResponse): unknown {
  const text = result.content[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Expected MCP text content');
  }
  return JSON.parse(text) as unknown;
}

describe('iOS MCP server', () => {
  let manager: FakeIOSManager;
  let service: FakeIOSService;

  beforeEach(() => {
    manager = new FakeIOSManager();
    service = new FakeIOSService(manager);
  });

  it('returns available devices without requiring a lease', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_device_list');
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({
      devices: [TEST_DEVICE],
      executionTarget: 'ios',
    });
    expect(service.listDevicesCalls).toBe(1);
  });

  it('launches iOS and returns the simulator metadata', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_launch');
    const result = await handler({ device: 'iPhone 16 Pro' }, {});

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({ ...TEST_LAUNCH_RESULT, executionTarget: 'ios' });
    expect(service.acquireCalls).toEqual([{ sessionId: 'session-1', device: 'iPhone 16 Pro' }]);
  });

  it('returns the same snapshot shape as desktop snapshot tools', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_snapshot');
    const result = await handler({ interactive: false, compact: true }, {});

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({ ...TEST_SNAPSHOT, executionTarget: 'ios' });
    expect(manager.lastSnapshotArgs).toEqual({
      interactive: false,
      cursor: false,
      compact: true,
    });
  });

  it('routes ios_tap through the manager using the provided ref target', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_tap');
    const result = await handler({ ref: 'e12' }, {});

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({ tapped: true, executionTarget: 'ios' });
    expect(manager.lastTapTarget).toEqual({ ref: 'e12' });
  });

  it('returns base64 PNG screenshot payloads', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_screenshot');
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({ ...TEST_SCREENSHOT, executionTarget: 'ios' });
  });

  it('passes default swipe duration and optional target through the manager', async () => {
    const handler = getToolHandler(service as unknown as IOSService, 'ios_swipe');
    const result = await handler(
      {
        direction: 'up',
        target: { selector: '#feed' },
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent(result)).toEqual({ swiped: true, executionTarget: 'ios' });
    expect(manager.lastSwipe).toEqual({
      direction: 'up',
      target: { selector: '#feed' },
      duration: 300,
    });
  });

  it('returns exact no-lease errors without a wrapper prefix', async () => {
    service.hasLeaseValue = false;

    const handler = getToolHandler(service as unknown as IOSService, 'ios_snapshot');
    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'No iOS lease for session' }]);
  });
});
