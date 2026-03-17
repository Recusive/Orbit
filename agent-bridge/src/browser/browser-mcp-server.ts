/**
 * Browser MCP Server - Custom tools for embedded browser automation
 *
 * Uses Claude Agent SDK's createSdkMcpServer for in-process tool execution.
 * All tool calls are routed through BrowserToolBridge to the webview.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { createLogger } from '../common/logging/logger.js';

import {
  BrowserConsoleLogLevels,
  BrowserScrollDirections,
  BrowserStorageStores,
  BrowserTargetShape,
  BrowserWaitForSelectorStates,
  validateTargetInput,
} from './types.js';

import type { BrowserToolBridge } from './browser-tool-bridge.js';

const logger = createLogger('BrowserMcpServer');
const MCP_SERVER_NAME = 'orbit-browser';
const MCP_SERVER_VERSION = '1.0.0';
const SNAPSHOT_WORKFLOW_GUIDANCE =
  'WORKFLOW: Call browser_snapshot first -> inspect the returned tree -> use ref handles for click/fill/type/check/select. If a ref is stale or the page changed, call browser_snapshot again. CSS selectors remain supported as a fallback.';
const BROWSER_TOOL_NAMES = [
  'browser_open',
  'browser_close',
  'browser_navigate',
  'browser_back',
  'browser_forward',
  'browser_reload',
  'browser_get_url',
  'browser_get_title',
  'browser_snapshot',
  'browser_get_text',
  'browser_get_html',
  'browser_screenshot',
  'browser_is_visible',
  'browser_is_enabled',
  'browser_get_attribute',
  'browser_bounding_box',
  'browser_count',
  'browser_click',
  'browser_type',
  'browser_fill',
  'browser_select',
  'browser_check',
  'browser_uncheck',
  'browser_hover',
  'browser_focus',
  'browser_scroll',
  'browser_scroll_into_view',
  'browser_wait_for_selector',
  'browser_wait_for_url',
  'browser_eval',
  'browser_cookies_get',
  'browser_cookies_clear',
  'browser_storage_get',
  'browser_storage_set',
  'browser_storage_clear',
  'browser_network_requests',
  'browser_console_logs',
  'browser_runtime_info',
] as const;

type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];
type ToolSchemaShape = Record<string, z.ZodType>;
type ToolArgs = Record<string, unknown>;

/**
 * Safely stringify a result for MCP text content.
 * Handles edge cases that would break MCP validation:
 * - undefined (JSON.stringify returns undefined, not a string)
 * - Circular references (throws an error)
 * - BigInt values (not serializable)
 */
function safeStringify(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
      return '[Unserializable Object]';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }
    if (typeof value === 'symbol') {
      return value.description ?? 'Symbol()';
    }
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }
    return 'null';
  }
}

function addExecutionTarget(text: string, target: 'desktop' | 'ios'): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), executionTarget: target });
    }
  } catch {
    // Not JSON — append as text line
  }
  return `${text}\nexecutionTarget: ${target}`;
}

function createSuccessResponse(text: string): {
  content: [{ type: 'text'; text: string }];
} {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

function createErrorResponse(
  prefix: string,
  error: unknown
): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

async function runBridgeRequest(
  bridge: BrowserToolBridge,
  toolName: BrowserToolName,
  args: ToolArgs,
  options: {
    errorPrefix: string;
    formatResult?: (result: unknown) => string;
    validateArgs?: (args: ToolArgs) => void;
  }
): Promise<{
  content: [{ type: 'text'; text: string }];
  isError?: true;
}> {
  try {
    options.validateArgs?.(args);
    const result = await bridge.sendRequest(toolName, args);
    const formatted = options.formatResult ? options.formatResult(result) : safeStringify(result);
    return createSuccessResponse(addExecutionTarget(formatted, 'desktop'));
  } catch (error: unknown) {
    return createErrorResponse(options.errorPrefix, error);
  }
}

function validateRequiredTarget(args: ToolArgs): void {
  validateTargetInput(args);
}

function stringResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result === null || result === undefined) {
    return '';
  }
  return safeStringify(result);
}

function createBridgeTool(
  bridge: BrowserToolBridge,
  toolName: BrowserToolName,
  description: string,
  shape: ToolSchemaShape,
  options: {
    errorPrefix: string;
    formatResult?: (result: unknown) => string;
    validateArgs?: (args: ToolArgs) => void;
  }
): ReturnType<typeof tool> {
  return tool(toolName, description, shape, async (args) => {
    logger.debug({ toolName }, 'Running browser MCP tool');
    return runBridgeRequest(bridge, toolName, args, options);
  });
}

/**
 * Create the Browser MCP server with all browser tools.
 *
 * [warning] TESTED: This server is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test files: src/__tests__/browser-mcp-screenshot.test.ts, src/__tests__/browser-ref-flow.test.ts
 */
export function createBrowserMcpServer(
  bridge: BrowserToolBridge
): ReturnType<typeof createSdkMcpServer> {
  const tools = [
    createBridgeTool(
      bridge,
      'browser_open',
      `Open the embedded browser panel and optionally navigate to a URL. ${SNAPSHOT_WORKFLOW_GUIDANCE}`,
      {
        url: z.string().optional().describe('URL to open'),
      },
      {
        errorPrefix: 'Failed to open browser',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_navigate',
      'Navigate the browser to a URL. After navigation, call browser_snapshot again before using old refs.',
      {
        url: z.string().describe('The URL to navigate to'),
      },
      {
        errorPrefix: 'Failed to navigate',
        formatResult: () => 'Navigated successfully',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_click',
      'Click an element by snapshot ref (preferred) or CSS selector (legacy fallback). Call browser_snapshot first to obtain refs.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to click',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_type',
      'Type text into a focusable element by snapshot ref (preferred) or CSS selector. This appends to the existing value character-by-character. Use browser_fill to replace the value.',
      {
        ...BrowserTargetShape,
        text: z.string().describe('Text to type'),
      },
      {
        errorPrefix: 'Failed to type',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_fill',
      'Fill a text input, textarea, or contenteditable element by snapshot ref (preferred) or CSS selector. This replaces the existing value.',
      {
        ...BrowserTargetShape,
        value: z.string().describe('Replacement value'),
      },
      {
        errorPrefix: 'Failed to fill',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_get_text',
      'Get the trimmed text content of the page or a specific element. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to get text',
        formatResult: stringResult,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_get_html',
      'Get the HTML content of the page or a specific element. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
        outer: z.boolean().optional().describe('Return outerHTML instead of innerHTML'),
      },
      {
        errorPrefix: 'Failed to get HTML',
        formatResult: stringResult,
      }
    ),

    tool(
      'browser_screenshot',
      'Take a screenshot of the current browser page. Saves a JPEG to a temp file and returns the path. Use the Read tool on the returned file path to view the image.',
      {},
      async () => {
        logger.debug({ toolName: 'browser_screenshot' }, 'Running browser MCP tool');
        try {
          const result = await bridge.sendRequest<{
            filePath?: string | null;
            metadata: Record<string, unknown>;
          }>('browser_screenshot', {});

          const parts: string[] = [];
          if (typeof result.filePath === 'string' && result.filePath.length > 0) {
            parts.push(`Screenshot saved to: ${result.filePath}`);
            parts.push(
              'Use the Read tool to view this image. Read the file BEFORE closing or recreating the browser - the file is cleaned up on close.'
            );
          } else {
            parts.push('Screenshot capture returned metadata only (no image file).');
          }

          parts.push(`Metadata: ${safeStringify(result.metadata)}`);
          return createSuccessResponse(addExecutionTarget(parts.join('\n'), 'desktop'));
        } catch (error: unknown) {
          return createErrorResponse('Failed', error);
        }
      }
    ),

    createBridgeTool(
      bridge,
      'browser_console_logs',
      'Get console logs captured from the current browser page. Useful after interactions fail or a page behaves unexpectedly.',
      {
        level: z.enum(BrowserConsoleLogLevels).optional().describe('Optional log level filter'),
      },
      {
        errorPrefix: 'Failed to get console logs',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_back',
      'Go back in browser history.',
      {},
      {
        errorPrefix: 'Failed to navigate back',
        formatResult: () => 'Navigated back',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_forward',
      'Go forward in browser history.',
      {},
      {
        errorPrefix: 'Failed to navigate forward',
        formatResult: () => 'Navigated forward',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_reload',
      'Reload the current page.',
      {},
      {
        errorPrefix: 'Failed to reload',
        formatResult: () => 'Page reloaded',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_close',
      'Close the browser panel.',
      {},
      {
        errorPrefix: 'Failed to close browser',
        formatResult: () => 'Browser closed',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_eval',
      'Execute JavaScript in the browser and return the result. Use `return` to output a value.',
      {
        script: z.string().describe('JavaScript code to execute'),
      },
      {
        errorPrefix: 'Failed to evaluate script',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_snapshot',
      'Capture an accessibility snapshot of the current page. This is the primary inspection tool: it returns a semantic tree with stable ref handles for later actions.',
      {
        interactive: z
          .boolean()
          .optional()
          .describe('When false, include refs on all elements, not only interactive ones'),
        cursor: z
          .boolean()
          .optional()
          .describe('Include cursor:pointer or tabindex elements as ref targets'),
        compact: z
          .boolean()
          .optional()
          .describe('Omit non-ref-bearing nodes from the snapshot output'),
      },
      {
        errorPrefix: 'Failed to capture snapshot',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_get_url',
      'Get the current page URL. Useful after navigation or redirects.',
      {},
      {
        errorPrefix: 'Failed to get URL',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_get_title',
      'Get the current page title.',
      {},
      {
        errorPrefix: 'Failed to get title',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_check',
      'Check a checkbox or switch by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to check element',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_uncheck',
      'Uncheck a checkbox or switch by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to uncheck element',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_select',
      'Select option values on a dropdown by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
        values: z.array(z.string()).min(1).describe('Option values to select'),
      },
      {
        errorPrefix: 'Failed to select option',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_hover',
      'Hover over an element by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to hover element',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_focus',
      'Focus an element by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to focus element',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_scroll',
      'Scroll the page or a specific element. Optional ref targets a specific scroll container; otherwise the page is scrolled.',
      {
        ...BrowserTargetShape,
        direction: z
          .enum(BrowserScrollDirections)
          .describe('Scroll direction: up, down, left, or right'),
        amount: z.number().positive().optional().describe('Optional scroll amount in pixels'),
      },
      {
        errorPrefix: 'Failed to scroll',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_scroll_into_view',
      'Scroll an element into view by snapshot ref (preferred) or CSS selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to scroll element into view',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_wait_for_selector',
      'Wait for a CSS selector to reach the requested state. Use this when content appears asynchronously and no ref exists yet.',
      {
        selector: z.string().describe('CSS selector to wait for'),
        state: z
          .enum(BrowserWaitForSelectorStates)
          .optional()
          .describe('Desired selector state (default: visible)'),
        timeout: z
          .number()
          .int()
          .positive()
          .max(120000)
          .optional()
          .describe('Timeout in milliseconds (max 120000)'),
      },
      {
        errorPrefix: 'Failed to wait for selector',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_wait_for_url',
      'Wait for the current page URL to match an exact string or a regex pattern written as /pattern/flags.',
      {
        url: z.string().describe('Exact URL or regex string in /pattern/flags form'),
        timeout: z
          .number()
          .int()
          .positive()
          .max(120000)
          .optional()
          .describe('Timeout in milliseconds (max 120000)'),
      },
      {
        errorPrefix: 'Failed to wait for URL',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_is_visible',
      'Check whether an element is visible. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to inspect visibility',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_is_enabled',
      'Check whether an element is enabled. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to inspect enabled state',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_get_attribute',
      'Get an attribute from an element. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
        name: z.string().describe('Attribute name'),
      },
      {
        errorPrefix: 'Failed to get attribute',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_bounding_box',
      'Get the bounding box of an element. Supports ref (preferred) or selector.',
      {
        ...BrowserTargetShape,
      },
      {
        errorPrefix: 'Failed to get bounding box',
        validateArgs: validateRequiredTarget,
      }
    ),

    createBridgeTool(
      bridge,
      'browser_count',
      'Count the number of elements matching a CSS selector.',
      {
        selector: z.string().describe('CSS selector to count'),
      },
      {
        errorPrefix: 'Failed to count elements',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_cookies_get',
      'Get cookies for the current page, optionally filtered by name or domain.',
      {
        name: z.string().optional().describe('Optional cookie name filter'),
        domain: z.string().optional().describe('Optional cookie domain filter'),
      },
      {
        errorPrefix: 'Failed to get cookies',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_cookies_clear',
      'Clear cookies for the current page, optionally filtered by name or domain.',
      {
        name: z.string().optional().describe('Optional cookie name filter'),
        domain: z.string().optional().describe('Optional cookie domain filter'),
      },
      {
        errorPrefix: 'Failed to clear cookies',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_storage_get',
      'Get a value from localStorage or sessionStorage.',
      {
        key: z.string().describe('Storage key'),
        store: z
          .enum(BrowserStorageStores)
          .optional()
          .describe('Storage type: local (default) or session'),
      },
      {
        errorPrefix: 'Failed to get storage value',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_storage_set',
      'Set a value in localStorage or sessionStorage.',
      {
        key: z.string().describe('Storage key'),
        value: z.string().describe('Storage value'),
        store: z
          .enum(BrowserStorageStores)
          .optional()
          .describe('Storage type: local (default) or session'),
      },
      {
        errorPrefix: 'Failed to set storage value',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_storage_clear',
      'Clear localStorage or sessionStorage.',
      {
        store: z
          .enum(BrowserStorageStores)
          .optional()
          .describe('Storage type: local (default) or session'),
      },
      {
        errorPrefix: 'Failed to clear storage',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_network_requests',
      'Get captured network requests since the last read or page load. Useful for debugging failed page loads, APIs, or redirects.',
      {
        filter: z
          .object({
            url: z.string().optional(),
            method: z.string().optional(),
            status: z.number().int().optional(),
          })
          .optional()
          .describe('Optional request filter'),
      },
      {
        errorPrefix: 'Failed to get network requests',
      }
    ),

    createBridgeTool(
      bridge,
      'browser_runtime_info',
      'Get the injected browser runtime version, epoch, and capability state. Use this to debug runtime injection issues such as CSP blocking.',
      {},
      {
        errorPrefix: 'Failed to get runtime info',
      }
    ),
  ];

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    tools,
  });
}

/**
 * Get full tool names with MCP prefix.
 */
export function getBrowserToolNames(): string[] {
  return BROWSER_TOOL_NAMES.map((toolName) => `mcp__${MCP_SERVER_NAME}__${toolName}`);
}
