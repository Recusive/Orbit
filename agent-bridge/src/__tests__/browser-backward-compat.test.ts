import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createBrowserMcpServer, getBrowserToolNames } from '../browser/browser-mcp-server.js';
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

function getRegisteredToolNames(bridge: BrowserToolBridge): string[] {
  const server = createBrowserMcpServer(bridge);
  const internal = server.instance as unknown as McpServerInternal;
  return Object.keys(internal._registeredTools);
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

interface ToolCase {
  tool: string;
  args: Record<string, unknown>;
}

describe('Browser backward compatibility', () => {
  let bridge: BrowserToolBridge;

  beforeEach(() => {
    bridge = new BrowserToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('registers all 38 desktop browser tools', () => {
    const toolNames = getRegisteredToolNames(bridge);
    expect(toolNames.length).toBe(38);
  });

  it('includes all original 13 tools from the pre-upgrade baseline', () => {
    const original13 = [
      'browser_open',
      'browser_close',
      'browser_navigate',
      'browser_back',
      'browser_forward',
      'browser_reload',
      'browser_click',
      'browser_type',
      'browser_get_text',
      'browser_get_html',
      'browser_screenshot',
      'browser_eval',
      'browser_console_logs',
    ];

    const toolNames = getRegisteredToolNames(bridge);
    for (const name of original13) {
      expect(toolNames).toContain(name);
    }
  });

  it('exports prefixed tool names via getBrowserToolNames()', () => {
    const prefixed = getBrowserToolNames();
    expect(prefixed).toContain('mcp__orbit-browser__browser_click');
    expect(prefixed).toContain('mcp__orbit-browser__browser_snapshot');
    expect(prefixed).toContain('mcp__orbit-browser__browser_runtime_info');
    expect(prefixed.length).toBe(38);
  });

  describe('4 element-targeting tools accept selector-only (no ref)', () => {
    const elementTools: ToolCase[] = [
      { tool: 'browser_click', args: { selector: '#submit' } },
      { tool: 'browser_fill', args: { selector: '#email', value: 'test@example.com' } },
      { tool: 'browser_type', args: { selector: '#search', text: 'hello' } },
      { tool: 'browser_hover', args: { selector: '.menu-item' } },
    ];

    for (const { tool, args } of elementTools) {
      it(`${tool} accepts selector-only input`, async () => {
        bridge.onToolRequest((request) => {
          expect(request.toolInput.selector).toBe(args.selector);
          bridge.handleResponse({
            requestId: request.requestId,
            success: true,
            result: { ok: true },
          });
        });

        const handler = getToolHandler(bridge, tool);
        const result = await handler(args, {});
        expect(result.isError).toBeUndefined();
      });
    }
  });

  describe('element-targeting tools accept ref-only input (new path)', () => {
    const elementTools: ToolCase[] = [
      { tool: 'browser_click', args: { ref: 'e1' } },
      { tool: 'browser_fill', args: { ref: 'e3', value: 'hello' } },
      { tool: 'browser_type', args: { ref: 'e5', text: 'world' } },
      { tool: 'browser_hover', args: { ref: 'e7' } },
    ];

    for (const { tool, args } of elementTools) {
      it(`${tool} accepts ref-only input`, async () => {
        bridge.onToolRequest((request) => {
          expect(request.toolInput.ref).toBe(args.ref);
          bridge.handleResponse({
            requestId: request.requestId,
            success: true,
            result: { ok: true },
          });
        });

        const handler = getToolHandler(bridge, tool);
        const result = await handler(args, {});
        expect(result.isError).toBeUndefined();
      });
    }
  });

  describe('non-element tools do not require ref or selector', () => {
    const nonElementTools = [
      'browser_navigate',
      'browser_back',
      'browser_forward',
      'browser_reload',
      'browser_close',
      'browser_eval',
      'browser_screenshot',
      'browser_get_url',
      'browser_get_title',
    ];

    for (const toolName of nonElementTools) {
      it(`${toolName} works without ref or selector`, async () => {
        bridge.onToolRequest((request) => {
          bridge.handleResponse({
            requestId: request.requestId,
            success: true,
            result: { ok: true },
          });
        });

        const handler = getToolHandler(bridge, toolName);

        const args: Record<string, unknown> = {};
        if (toolName === 'browser_navigate') {
          args.url = 'https://example.com';
        }
        if (toolName === 'browser_eval') {
          args.script = 'return 1';
        }

        const result = await handler(args, {});
        expect(result.isError).toBeUndefined();
      });
    }
  });

  it('browser_type uses text param (append semantics)', async () => {
    bridge.onToolRequest((request) => {
      expect(request.toolInput).toMatchObject({
        ref: 'e1',
        text: 'appended text',
      });
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { typed: true },
      });
    });

    const handler = getToolHandler(bridge, 'browser_type');
    const result = await handler({ ref: 'e1', text: 'appended text' }, {});
    expect(result.isError).toBeUndefined();
  });

  it('browser_fill uses value param (replace semantics)', async () => {
    bridge.onToolRequest((request) => {
      expect(request.toolInput).toMatchObject({
        ref: 'e2',
        value: 'replaced text',
      });
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { filled: true },
      });
    });

    const handler = getToolHandler(bridge, 'browser_fill');
    const result = await handler({ ref: 'e2', value: 'replaced text' }, {});
    expect(result.isError).toBeUndefined();
  });

  it('browser_get_text works with no target (whole page)', async () => {
    bridge.onToolRequest((request) => {
      expect(request.toolInput).toEqual({});
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: 'Full page text content',
      });
    });

    const handler = getToolHandler(bridge, 'browser_get_text');
    const result = await handler({}, {});
    expect(result.isError).toBeUndefined();
    expect(getResponseText(result)).toBe('Full page text content\nexecutionTarget: desktop');
  });

  it('browser_get_html works with no target (whole page)', async () => {
    bridge.onToolRequest((request) => {
      expect(request.toolInput).toEqual({});
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: '<div>Hello</div>',
      });
    });

    const handler = getToolHandler(bridge, 'browser_get_html');
    const result = await handler({}, {});
    expect(result.isError).toBeUndefined();
    expect(getResponseText(result)).toBe('<div>Hello</div>\nexecutionTarget: desktop');
  });
});
