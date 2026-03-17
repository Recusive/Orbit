/**
 * iOS MCP server.
 *
 * [warning] TESTED: This server is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test file: src/__tests__/ios-mcp-server.test.ts
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { createLogger } from '../common/logging/logger.js';

import { executeIOSAction } from './ios-actions.js';
import {
  IOSConsoleLogLevelSchema,
  IOSScrollDirectionSchema,
  IOSSwipeDirectionSchema,
  IOSTargetShape,
  IOSToolNames,
  IOSWaitForSelectorStateSchema,
} from './types.js';

import type { IOSService } from './ios-service.js';
import type { IOSToolName } from './types.js';

const logger = createLogger('IOSMcpServer');
const MCP_SERVER_NAME = 'orbit-ios';
const MCP_SERVER_VERSION = '1.0.0';

type ToolSchemaShape = Record<string, z.ZodType>;

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
    return 'null';
  }
}

function createSuccessResponse(text: string): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

function createExactErrorResponse(error: unknown): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

function createIOSTool(
  service: IOSService,
  sessionId: string,
  toolName: IOSToolName,
  description: string,
  shape: ToolSchemaShape
): ReturnType<typeof tool> {
  return tool(toolName, description, shape, async (args) => {
    logger.debug({ toolName, sessionId }, 'Running iOS MCP tool');
    try {
      const result = await executeIOSAction(service, sessionId, toolName, args);
      return createSuccessResponse(addExecutionTarget(safeStringify(result), 'ios'));
    } catch (error: unknown) {
      return createExactErrorResponse(error);
    }
  });
}

/**
 * Create the iOS MCP server for a specific session.
 */
export function createIOSMcpServer(
  service: IOSService,
  sessionId: string
): ReturnType<typeof createSdkMcpServer> {
  const tools = [
    createIOSTool(
      service,
      sessionId,
      'ios_device_list',
      'List available iOS simulators via xcrun simctl.',
      {}
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_launch',
      'Boot the iOS simulator, start Appium, and acquire an iOS lease for this session.',
      {
        device: z.string().describe('Simulator device name or UDID, for example "iPhone 16 Pro"'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_close',
      "Release this session's iOS lease. If it is the last lease, the simulator and Appium shut down.",
      {}
    ),
    createIOSTool(service, sessionId, 'ios_navigate', 'Navigate mobile Safari to a URL.', {
      url: z.string().describe('URL to load in mobile Safari'),
    }),
    createIOSTool(service, sessionId, 'ios_back', 'Navigate back in mobile Safari history.', {}),
    createIOSTool(
      service,
      sessionId,
      'ios_forward',
      'Navigate forward in mobile Safari history.',
      {}
    ),
    createIOSTool(service, sessionId, 'ios_reload', 'Reload the current mobile Safari page.', {}),
    createIOSTool(
      service,
      sessionId,
      'ios_snapshot',
      'Capture an accessibility snapshot from iOS Safari using the same ref system as browser_snapshot.',
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
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_get_text',
      'Get trimmed text content from an element targeted by snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_get_html',
      'Get HTML content from an element targeted by snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
        outer: z.boolean().optional().describe('Return outerHTML instead of innerHTML'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_screenshot',
      'Capture a base64-encoded PNG screenshot of the iOS Safari viewport.',
      {}
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_tap',
      'Tap an element using a snapshot ref (preferred) or CSS selector.',
      {
        ...IOSTargetShape,
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_fill',
      'Clear an input field and replace its value using a snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
        value: z.string().describe('Replacement value'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_type',
      'Append text to an input field using a snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
        text: z.string().describe('Text to append'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_select',
      'Select one or more option values on a dropdown using a snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
        values: z.array(z.string()).min(1).describe('Option values to select'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_check',
      'Check a checkbox or switch using a snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_uncheck',
      'Uncheck a checkbox or switch using a snapshot ref or CSS selector.',
      {
        ...IOSTargetShape,
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_swipe',
      'Perform a native iOS swipe gesture in the given direction. Optional target narrows the gesture origin.',
      {
        direction: IOSSwipeDirectionSchema.describe('Swipe direction: up, down, left, or right'),
        target: z
          .object(IOSTargetShape)
          .optional()
          .describe('Optional target element to anchor the swipe'),
        duration: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Gesture duration in milliseconds (default: 300)'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_scroll',
      'Scroll the page in iOS Safari via JavaScript window.scrollBy.',
      {
        direction: IOSScrollDirectionSchema.describe('Scroll direction: up, down, left, or right'),
        amount: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Scroll amount in pixels (default: 300)'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_eval',
      'Execute JavaScript in the iOS Safari page context and return the result.',
      {
        script: z.string().describe('JavaScript code to execute'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_wait_for_selector',
      'Wait for a CSS selector to reach the requested state in iOS Safari.',
      {
        selector: z.string().describe('CSS selector to wait for'),
        state: IOSWaitForSelectorStateSchema.optional().describe(
          'Desired selector state (default: visible)'
        ),
        timeout: z
          .number()
          .int()
          .positive()
          .max(120000)
          .optional()
          .describe('Timeout in milliseconds (default: 30000, max: 120000)'),
      }
    ),
    createIOSTool(
      service,
      sessionId,
      'ios_console_logs',
      'Read captured console logs from the current iOS Safari session.',
      {
        level: IOSConsoleLogLevelSchema.optional().describe('Optional log level filter'),
      }
    ),
  ];

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    tools,
  });
}

export function getIOSToolNames(): string[] {
  return IOSToolNames.map((toolName) => `mcp__${MCP_SERVER_NAME}__${toolName}`);
}
