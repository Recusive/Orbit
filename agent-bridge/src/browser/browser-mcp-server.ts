/**
 * Browser MCP Server - Custom tools for embedded browser automation
 *
 * Uses Claude Agent SDK's createSdkMcpServer for in-process tool execution.
 * All tool calls are routed through BrowserToolBridge to the webview.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { createLogger } from '../common/logging/logger.js';

import type { BrowserToolBridge } from './browser-tool-bridge.js';

const logger = createLogger('BrowserMcpServer');

/**
 * Create the Browser MCP server with all browser tools.
 */
export function createBrowserMcpServer(
  bridge: BrowserToolBridge
): ReturnType<typeof createSdkMcpServer> {
  const tools = [
    tool(
      'browser_open',
      'Open the embedded browser panel. Optionally navigate to a URL.',
      {
        url: z.string().optional().describe('URL to open'),
      },
      async (args) => {
        logger.info({ url: args.url }, 'Opening browser');
        try {
          const result = await bridge.sendRequest('browser_open', args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_navigate',
      'Navigate the browser to a URL.',
      {
        url: z.string().describe('The URL to navigate to'),
      },
      async (args) => {
        logger.info({ url: args.url }, 'Navigating browser');
        try {
          await bridge.sendRequest('browser_navigate', args);
          return {
            content: [{ type: 'text' as const, text: `Navigated to ${args.url}` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to navigate: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_click',
      'Click an element on the page by CSS selector.',
      {
        selector: z.string().describe('CSS selector of element to click'),
      },
      async (args) => {
        logger.debug({ selector: args.selector }, 'Clicking element');
        try {
          const result = await bridge.sendRequest('browser_click', args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to click: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_type',
      'Type text into an input field.',
      {
        selector: z.string().describe('CSS selector of the input'),
        text: z.string().describe('Text to type'),
      },
      async (args) => {
        logger.debug({ selector: args.selector }, 'Typing into element');
        try {
          const result = await bridge.sendRequest('browser_type', args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to type: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_get_text',
      'Get the text content of the page or a specific element.',
      {
        selector: z.string().optional().describe('CSS selector (default: body)'),
      },
      async (args) => {
        logger.debug({ selector: args.selector }, 'Getting page text');
        try {
          const result = await bridge.sendRequest<string>('browser_get_text', args);
          return {
            content: [{ type: 'text' as const, text: result }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get text: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_get_html',
      'Get the HTML content of the page or a specific element.',
      {
        selector: z.string().optional().describe('CSS selector (default: body)'),
      },
      async (args) => {
        logger.debug({ selector: args.selector }, 'Getting page HTML');
        try {
          const result = await bridge.sendRequest<string>('browser_get_html', args);
          return {
            content: [{ type: 'text' as const, text: result }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get HTML: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'browser_screenshot',
      'Get information about the current page (URL, title, dimensions).',
      {},
      async () => {
        logger.debug('Getting browser screenshot info');
        try {
          const result = await bridge.sendRequest('browser_screenshot', {});
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get screenshot info: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool('browser_console_logs', 'Get console logs from the browser.', {}, async () => {
      logger.debug('Getting browser console logs');
      try {
        const result = await bridge.sendRequest('browser_console_logs', {});
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get console logs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }),

    tool('browser_back', 'Go back in browser history.', {}, async () => {
      logger.debug('Navigating back');
      try {
        await bridge.sendRequest('browser_back', {});
        return {
          content: [{ type: 'text' as const, text: 'Navigated back' }],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to navigate back: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }),

    tool('browser_forward', 'Go forward in browser history.', {}, async () => {
      logger.debug('Navigating forward');
      try {
        await bridge.sendRequest('browser_forward', {});
        return {
          content: [{ type: 'text' as const, text: 'Navigated forward' }],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to navigate forward: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }),

    tool('browser_reload', 'Reload the current page.', {}, async () => {
      logger.debug('Reloading page');
      try {
        await bridge.sendRequest('browser_reload', {});
        return {
          content: [{ type: 'text' as const, text: 'Page reloaded' }],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to reload: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }),

    tool('browser_close', 'Close the browser panel.', {}, async () => {
      logger.debug('Closing browser');
      try {
        await bridge.sendRequest('browser_close', {});
        return {
          content: [{ type: 'text' as const, text: 'Browser closed' }],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to close browser: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }),

    tool(
      'browser_eval',
      'Execute custom JavaScript in the browser and return the result.',
      {
        script: z.string().describe('JavaScript code to execute'),
      },
      async (args) => {
        logger.debug('Evaluating script');
        try {
          const result = await bridge.sendRequest('browser_eval', args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to evaluate script: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),
  ];

  return createSdkMcpServer({
    name: 'orbit-browser',
    version: '1.0.0',
    tools,
  });
}

/**
 * Get full tool names with MCP prefix.
 */
export function getBrowserToolNames(): string[] {
  return [
    'mcp__orbit-browser__browser_open',
    'mcp__orbit-browser__browser_navigate',
    'mcp__orbit-browser__browser_click',
    'mcp__orbit-browser__browser_type',
    'mcp__orbit-browser__browser_get_text',
    'mcp__orbit-browser__browser_get_html',
    'mcp__orbit-browser__browser_screenshot',
    'mcp__orbit-browser__browser_console_logs',
    'mcp__orbit-browser__browser_back',
    'mcp__orbit-browser__browser_forward',
    'mcp__orbit-browser__browser_reload',
    'mcp__orbit-browser__browser_close',
    'mcp__orbit-browser__browser_eval',
  ];
}
