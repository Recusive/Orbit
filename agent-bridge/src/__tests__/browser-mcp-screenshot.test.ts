import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { createBrowserMcpServer } from '../browser/browser-mcp-server.js';

import type { BrowserToolBridge } from '../browser/browser-tool-bridge.js';

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

describe('Browser MCP screenshot tool', () => {
  const sendRequestMock = mock(
    (): Promise<{ filePath?: string | null; metadata: Record<string, unknown> }> =>
      Promise.resolve({
        filePath: null,
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

  it('returns file path + metadata text when image file is available', async () => {
    sendRequestMock.mockResolvedValue({
      filePath: '/tmp/orbit-screenshot-12345.jpg',
      metadata: { url: 'https://example.com', captureMethod: 'native_wkwebview' },
    });

    const handler = getScreenshotHandler();
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Screenshot saved to: /tmp/orbit-screenshot-12345.jpg');
    expect(text).toContain('Use the Read tool to view this image.');
    expect(text).toContain(
      'Metadata: {"url":"https://example.com","captureMethod":"native_wkwebview"}'
    );
  });

  it('returns metadata-only text when file path is null', async () => {
    sendRequestMock.mockResolvedValue({
      filePath: null,
      metadata: { captureMethod: 'metadata_fallback', url: 'about:blank' },
    });

    const handler = getScreenshotHandler();
    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('metadata only');
    expect(text).toContain('Metadata: {"captureMethod":"metadata_fallback","url":"about:blank"}');
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
