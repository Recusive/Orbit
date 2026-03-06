import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createBrowserMcpServer } from '../browser/browser-mcp-server.js';
import { BrowserToolBridge } from '../browser/browser-tool-bridge.js';

import type { McpToolRequest } from '../browser/types.js';

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

interface SnapshotParsed {
  epoch: number;
  refCount: number;
  snapshot: string;
  totalElements: number;
  emittedElements: number;
  truncated: boolean;
  url: string;
  title: string;
  durationMs: number;
}

function getToolHandler(bridge: BrowserToolBridge, toolName: string): RegisteredTool['handler'] {
  const server = createBrowserMcpServer(bridge);
  const internal = server.instance as unknown as McpServerInternal;
  const tool = internal._registeredTools[toolName];
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}`);
  }
  return tool.handler;
}

function getResponseText(result: McpToolResponse): string {
  const first = result.content[0];
  if (!first) {
    throw new Error('Expected response to have at least one content block');
  }
  return first.text;
}

describe('Browser ref epoch handling', () => {
  let bridge: BrowserToolBridge;

  beforeEach(() => {
    bridge = new BrowserToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('passes snapshot epoch through the MCP tool response', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: 7,
          snapshot: '- button "Submit" [ref=e1]',
          refCount: 1,
          totalElements: 5,
          emittedElements: 5,
          truncated: false,
          url: 'https://example.com',
          title: 'Example',
          durationMs: 12,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(getResponseText(result)) as SnapshotParsed;
    expect(parsed).toMatchObject({
      epoch: 7,
      refCount: 1,
      snapshot: '- button "Submit" [ref=e1]',
    });
  });

  it('surfaces stale ref error from the runtime through browser_click', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: false,
        error: 'Ref is stale (epoch 3, current 4). Call browser_snapshot again.',
      });
    });

    const handler = getToolHandler(bridge, 'browser_click');
    const result = await handler({ ref: 'e2' }, {});

    expect(result.isError).toBe(true);
    expect(getResponseText(result)).toContain('stale');
    expect(getResponseText(result)).toContain('browser_snapshot');
  });

  it('surfaces stale ref error through browser_fill', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: false,
        error: 'Ref is stale (epoch 1, current 2). Call browser_snapshot again.',
      });
    });

    const handler = getToolHandler(bridge, 'browser_fill');
    const result = await handler({ ref: 'e5', value: 'test@example.com' }, {});

    expect(result.isError).toBe(true);
    expect(getResponseText(result)).toContain('stale');
  });

  it('returns incrementing epochs across consecutive snapshots', async () => {
    let snapshotCount = 0;

    bridge.onToolRequest((request) => {
      snapshotCount += 1;
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: snapshotCount,
          snapshot: `- document (snapshot ${String(snapshotCount)})`,
          refCount: 0,
          totalElements: 1,
          emittedElements: 1,
          truncated: false,
          url: 'https://example.com',
          title: 'Example',
          durationMs: 5,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');

    const result1 = await handler({}, {});
    const result2 = await handler({}, {});
    const result3 = await handler({}, {});

    const parsed1 = JSON.parse(getResponseText(result1)) as SnapshotParsed;
    const parsed2 = JSON.parse(getResponseText(result2)) as SnapshotParsed;
    const parsed3 = JSON.parse(getResponseText(result3)) as SnapshotParsed;

    expect(parsed1.epoch).toBe(1);
    expect(parsed2.epoch).toBe(2);
    expect(parsed3.epoch).toBe(3);
  });

  it('epoch resets after navigation because snapshot is called fresh', async () => {
    const requests: McpToolRequest[] = [];

    bridge.onToolRequest((request) => {
      requests.push(request);

      if (request.toolName === 'browser_navigate') {
        bridge.handleResponse({
          requestId: request.requestId,
          success: true,
          result: { navigated: true },
        });
      } else if (request.toolName === 'browser_snapshot') {
        bridge.handleResponse({
          requestId: request.requestId,
          success: true,
          result: {
            epoch: 1,
            snapshot: '- document',
            refCount: 0,
            totalElements: 1,
            emittedElements: 1,
            truncated: false,
            url: 'https://other.com',
            title: '',
            durationMs: 3,
          },
        });
      }
    });

    const navHandler = getToolHandler(bridge, 'browser_navigate');
    const snapHandler = getToolHandler(bridge, 'browser_snapshot');

    await navHandler({ url: 'https://other.com' }, {});
    await snapHandler({}, {});

    expect(requests.map((r) => r.toolName)).toEqual(['browser_navigate', 'browser_snapshot']);
  });
});
