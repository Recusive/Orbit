import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createBrowserMcpServer } from '../browser/browser-mcp-server.js';
import { BrowserToolBridge } from '../browser/browser-tool-bridge.js';

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
  snapshot: string;
  refCount: number;
  totalElements: number;
  emittedElements: number;
  truncated: boolean;
  url: string;
  title: string;
  durationMs: number;
  executionTarget?: string;
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

describe('Browser snapshot truncation', () => {
  let bridge: BrowserToolBridge;

  beforeEach(() => {
    bridge = new BrowserToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('includes truncation stats when snapshot is truncated', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: 1,
          snapshot: '- document\n  - main\n    - ... (truncated)',
          refCount: 15,
          totalElements: 5000,
          emittedElements: 200,
          truncated: true,
          url: 'https://heavy-page.example.com',
          title: 'Heavy Page',
          durationMs: 450,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(getResponseText(result)) as SnapshotParsed;

    expect(parsed.truncated).toBe(true);
    expect(parsed.totalElements).toBe(5000);
    expect(parsed.emittedElements).toBe(200);
    expect(typeof parsed.totalElements).toBe('number');
    expect(typeof parsed.emittedElements).toBe('number');
  });

  it('reports truncated=false when snapshot is complete', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: 1,
          snapshot: '- document\n  - button "Submit" [ref=e1]',
          refCount: 1,
          totalElements: 3,
          emittedElements: 3,
          truncated: false,
          url: 'https://simple.example.com',
          title: 'Simple',
          durationMs: 8,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    const result = await handler({}, {});

    const parsed = JSON.parse(getResponseText(result)) as SnapshotParsed;
    expect(parsed.truncated).toBe(false);
    expect(parsed.totalElements).toBe(3);
    expect(parsed.emittedElements).toBe(3);
  });

  it('includes durationMs in snapshot response', async () => {
    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: 2,
          snapshot: '- document',
          refCount: 0,
          totalElements: 1,
          emittedElements: 1,
          truncated: false,
          url: 'https://example.com',
          title: 'Example',
          durationMs: 42,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    const result = await handler({}, {});

    const parsed = JSON.parse(getResponseText(result)) as SnapshotParsed;
    expect(parsed.durationMs).toBe(42);
  });

  it('snapshot response payload stays under 500KB', async () => {
    const largeSnapshot = '- node [ref=e1]\n'.repeat(10000);

    bridge.onToolRequest((request) => {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          epoch: 1,
          snapshot: largeSnapshot,
          refCount: 10000,
          totalElements: 10000,
          emittedElements: 10000,
          truncated: false,
          url: 'https://example.com',
          title: '',
          durationMs: 500,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    const result = await handler({}, {});

    const responseText = getResponseText(result);
    const byteLength = new TextEncoder().encode(responseText).length;
    expect(byteLength).toBeLessThan(500000);
  });

  it('passes interactive, cursor, and compact flags to the bridge request', async () => {
    let capturedInput: Record<string, unknown> | null = null;

    bridge.onToolRequest((request) => {
      capturedInput = request.toolInput;
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
          url: 'https://example.com',
          title: '',
          durationMs: 3,
        },
      });
    });

    const handler = getToolHandler(bridge, 'browser_snapshot');
    await handler({ interactive: false, cursor: true, compact: true }, {});

    expect(capturedInput).toMatchObject({
      interactive: false,
      cursor: true,
      compact: true,
    });
  });
});
