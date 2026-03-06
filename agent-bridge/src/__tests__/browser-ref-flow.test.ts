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

function getToolHandler(bridge: BrowserToolBridge, toolName: string): RegisteredTool['handler'] {
  const server = createBrowserMcpServer(bridge);
  const internal = server.instance as unknown as McpServerInternal;
  const tool = internal._registeredTools[toolName];
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}`);
  }
  return tool.handler;
}

async function flushBridgeQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Browser ref flow', () => {
  let bridge: BrowserToolBridge;

  beforeEach(() => {
    bridge = new BrowserToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('serializes stateful requests so snapshot completes before click is emitted', async () => {
    const requests: McpToolRequest[] = [];

    bridge.onToolRequest((request) => {
      requests.push(request);
    });

    const snapshotPromise = bridge.sendRequest<{ epoch: number }>('browser_snapshot', {});
    const clickPromise = bridge.sendRequest<{ clicked: boolean }>('browser_click', { ref: 'e1' });

    await flushBridgeQueue();
    expect(requests.map((request) => request.toolName)).toEqual(['browser_snapshot']);

    const firstRequest = requests[0];
    if (!firstRequest) {
      throw new Error('Expected the snapshot request to be emitted first');
    }
    bridge.handleResponse({
      requestId: firstRequest.requestId,
      success: true,
      result: { epoch: 1 },
    });

    const snapshotResult = await snapshotPromise;
    await flushBridgeQueue();
    expect(requests.map((request) => request.toolName)).toEqual([
      'browser_snapshot',
      'browser_click',
    ]);

    const secondRequest = requests[1];
    if (!secondRequest) {
      throw new Error('Expected the click request to be emitted after snapshot completion');
    }
    bridge.handleResponse({
      requestId: secondRequest.requestId,
      success: true,
      result: { clicked: true },
    });

    const clickResult = await clickPromise;
    expect(snapshotResult).toEqual({ epoch: 1 });
    expect(clickResult).toEqual({ clicked: true });
  });

  it('allows read-only requests to be emitted concurrently', async () => {
    const requests: McpToolRequest[] = [];

    bridge.onToolRequest((request) => {
      requests.push(request);
    });

    const urlPromise = bridge.sendRequest<{ url: string }>('browser_get_url', {});
    const titlePromise = bridge.sendRequest<{ title: string }>('browser_get_title', {});

    await flushBridgeQueue();
    expect(requests.map((request) => request.toolName)).toEqual([
      'browser_get_url',
      'browser_get_title',
    ]);

    const urlRequest = requests[0];
    const titleRequest = requests[1];
    if (!urlRequest || !titleRequest) {
      throw new Error('Expected both read-only requests to be emitted immediately');
    }
    bridge.handleResponse({
      requestId: urlRequest.requestId,
      success: true,
      result: { url: 'https://example.com' },
    });
    bridge.handleResponse({
      requestId: titleRequest.requestId,
      success: true,
      result: { title: 'Example Domain' },
    });

    const urlResult = await urlPromise;
    const titleResult = await titlePromise;
    expect(urlResult).toEqual({ url: 'https://example.com' });
    expect(titleResult).toEqual({ title: 'Example Domain' });
  });

  it('forwards ref and selector inputs through the MCP click tool', async () => {
    const requests: McpToolRequest[] = [];
    bridge.onToolRequest((request) => {
      requests.push(request);
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { clicked: true },
      });
    });

    const handler = getToolHandler(bridge, 'browser_click');
    const result = await handler({ ref: 'e12', selector: '#submit' }, {});

    const emittedClickRequest = requests[0];
    if (!emittedClickRequest) {
      throw new Error('Expected browser_click to emit a bridge request');
    }
    expect(emittedClickRequest.toolInput).toEqual({ ref: 'e12', selector: '#submit' });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: '{"clicked":true,"executionTarget":"desktop"}' },
    ]);
  });

  it('keeps browser_get_text target optional for backward compatibility', async () => {
    const requests: McpToolRequest[] = [];
    bridge.onToolRequest((request) => {
      requests.push(request);
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: 'Example body text',
      });
    });

    const handler = getToolHandler(bridge, 'browser_get_text');
    const result = await handler({}, {});

    const emittedGetTextRequest = requests[0];
    if (!emittedGetTextRequest) {
      throw new Error('Expected browser_get_text to emit a bridge request');
    }
    expect(emittedGetTextRequest.toolInput).toEqual({});
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: 'Example body text\nexecutionTarget: desktop' },
    ]);
  });
});
