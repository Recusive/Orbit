import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { createBrowserMcpServer } from '../browser/browser-mcp-server.js';

import type { BrowserToolBridge } from '../browser/browser-tool-bridge.js';

interface McpToolResponse {
  content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[];
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

describe('Browser MCP screenshot tool', () => {
  const sendRequestMock = mock(
    (): Promise<{ image: string | null; mimeType?: string; metadata: Record<string, unknown> }> =>
      Promise.resolve({
        image: null,
        metadata: {},
      })
  );

  const bridge = {
    sendRequest: sendRequestMock,
  } as unknown as BrowserToolBridge;

  beforeEach(() => {
    sendRequestMock.mockReset();
  });

  function getScreenshotHandler(): RegisteredTool['handler'] {
    const server = createBrowserMcpServer(bridge);
    const internal = server.instance as unknown as McpServerInternal;
    const tool = internal._registeredTools.browser_screenshot;
    if (!tool) throw new Error('browser_screenshot tool not registered');
    return tool.handler;
  }

  it('returns image + metadata text blocks when pixel data is available', async () => {
    sendRequestMock.mockResolvedValue({
      image: 'base64-image',
      mimeType: 'image/jpeg',
      metadata: { url: 'https://example.com', captureMethod: 'native_wkwebview' },
    });

    const handler = getScreenshotHandler();
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content.length).toBe(2);
    expect(result.content[0]).toEqual({
      type: 'image',
      data: 'base64-image',
      mimeType: 'image/jpeg',
    });
    expect(result.content[1]).toEqual({
      type: 'text',
      text: '{"url":"https://example.com","captureMethod":"native_wkwebview"}',
    });
  });

  it('returns metadata text only when image is null', async () => {
    sendRequestMock.mockResolvedValue({
      image: null,
      metadata: { captureMethod: 'metadata_fallback', url: 'about:blank' },
    });

    const handler = getScreenshotHandler();
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: 'text',
        text: '{"captureMethod":"metadata_fallback","url":"about:blank"}',
      },
    ]);
  });

  it('returns error content when bridge call fails', async () => {
    sendRequestMock.mockRejectedValue(new Error('bridge failed'));

    const handler = getScreenshotHandler();
    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Failed: bridge failed',
      },
    ]);
  });
});
