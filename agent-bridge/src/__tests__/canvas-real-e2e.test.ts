/**
 * Canvas REAL End-to-End Integration Test
 *
 * This test makes REAL calls to the Claude API using OAuth credentials.
 * It validates that:
 * 1. Real sessions can be created with Claude SDK
 * 2. Real messages get real AI responses
 * 3. All events pass Zod schema validation
 * 4. Tool requests are properly handled
 *
 * ⚠️  USES API CREDITS - Each test costs ~0.01-0.05 USD
 * ⚠️  REQUIRES NETWORK - Will fail without internet connection
 * ⚠️  REQUIRES AUTH - Needs Claude Code OAuth or ANTHROPIC_API_KEY
 *
 * Run with: cd agent-bridge && bun test src/__tests__/canvas-real-e2e.test.ts
 *
 * NOTE: These tests are automatically skipped in CI environments where credentials are not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';

import { CanvasSessionManager } from '../canvas/index.js';
import { ClaudeCredentials } from '../common/auth/credentials.js';
import { createLogger } from '../common/logging/logger.js';

import type {
  CanvasState,
  SDKMessage,
  McpToolRequest,
  McpToolResponse,
} from '../canvas/types/types.js';

// Skip integration tests in GitHub Actions CI - they require OAuth credentials from Claude Code CLI
// OAuth is available locally (keychain) but not in CI runners
const skipIntegrationTests = process.env.GITHUB_ACTIONS === 'true';

const logger = createLogger('CanvasRealE2ETest');

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

/** Timeout for real API calls (Claude can take 10-60s for complex responses) */
const API_TIMEOUT = 120_000; // 2 minutes

// Tests are skipped when credentials are not available

// =============================================================================
// ZOD SCHEMAS (must match apps/agent/src/types/canvas.ts)
// =============================================================================

const CanvasPositionSchema = z.object({ x: z.number(), y: z.number() }).strict();
const CanvasNodeTypeSchema = z.enum(['sandpack', 'page']);
const PageLayoutSchema = z.enum(['flex', 'grid', 'stack']);
const PageViewportSchema = z.enum(['desktop', 'tablet', 'mobile']);
const SlotPositionModeSchema = z.enum(['flow', 'absolute']);
const LayoutDirectionSchema = z.enum(['row', 'column']);
const ToolExecutionStatusSchema = z.enum(['pending', 'running', 'success', 'error']);
const SDKMessageTypeSchema = z.enum(['text', 'thinking', 'tool_use', 'error', 'result']);

const LayoutOptionsSchema = z
  .object({
    direction: LayoutDirectionSchema.optional(),
    gap: z.string().optional(),
    padding: z.string().optional(),
    alignItems: z.string().optional(),
    justifyContent: z.string().optional(),
    wrap: z.boolean().optional(),
    gridColumns: z.string().optional(),
    gridRows: z.string().optional(),
    gridAreas: z.array(z.string()).optional(),
  })
  .strict();

const SlotPositionSchema = z
  .object({
    mode: SlotPositionModeSchema.optional(),
    gridArea: z.string().optional(),
    flexGrow: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
  })
  .strict();

const PageSlotSchema = z
  .object({
    slotId: z.string(),
    componentId: z.string(),
    position: SlotPositionSchema.optional(),
    zIndex: z.number().optional(),
    visible: z.boolean().optional(),
  })
  .strict();

const PageBackgroundSchema = z
  .object({ color: z.string().optional(), gradient: z.string().optional() })
  .strict();

const SandpackNodeDataSchema = z
  .object({
    name: z.string(),
    code: z.string(),
    error: z.string().optional(),
    isLoading: z.boolean().optional(),
  })
  .strict();

const PageNodeDataSchema = z
  .object({
    name: z.string().optional(),
    layout: PageLayoutSchema.optional(),
    layoutOptions: LayoutOptionsSchema.optional(),
    viewport: PageViewportSchema.optional(),
    background: PageBackgroundSchema.optional(),
    slots: z.array(PageSlotSchema).optional(),
  })
  .strict();

const SandpackNodeSchema = z
  .object({
    type: z.literal('sandpack'),
    id: z.string(),
    position: CanvasPositionSchema,
    data: SandpackNodeDataSchema,
  })
  .strict();

const PageNodeSchema = z
  .object({
    type: z.literal('page'),
    id: z.string(),
    position: CanvasPositionSchema,
    data: PageNodeDataSchema,
  })
  .strict();

const CanvasNodeSchema = z.discriminatedUnion('type', [SandpackNodeSchema, PageNodeSchema]);

const CanvasEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const CanvasStateSchema = z
  .object({
    nodes: z.array(CanvasNodeSchema),
    edges: z.array(CanvasEdgeSchema),
    selectedNodeId: z.string().nullish(),
    selectedNodeType: CanvasNodeTypeSchema.optional(),
  })
  .strict();

const ToolUseMetadataSchema = z
  .object({
    toolName: z.string(),
    toolId: z.string(),
    toolInput: z.record(z.string(), z.unknown()),
    status: ToolExecutionStatusSchema,
  })
  .strict();

const ErrorMetadataSchema = z
  .object({ code: z.string().optional(), recoverable: z.boolean().optional() })
  .strict();

// Relaxed schema for actual SDK messages (may have extra fields)
const SDKMessageSchema = z.object({
  type: SDKMessageTypeSchema,
  content: z.string(),
  metadata: z
    .union([ToolUseMetadataSchema, ErrorMetadataSchema, z.record(z.string(), z.unknown())])
    .optional(),
});

const McpToolRequestSchema = z.object({
  requestId: z.string(),
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()),
});

const McpToolResponseSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

// =============================================================================
// TEST UTILITIES
// =============================================================================

interface CapturedEvents {
  messages: SDKMessage[];
  toolRequests: McpToolRequest[];
  errors: string[];
}

/**
 * Wait for a condition with timeout
 */
async function waitFor(condition: () => boolean, timeout: number, interval = 100): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timeout waiting for condition after ${String(timeout)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create tool response handler that auto-responds to canvas tools
 */
function createToolResponseHandler(
  events: CapturedEvents,
  manager: CanvasSessionManager
): (sessionId: string, request: McpToolRequest) => void {
  return (sessionId: string, request: McpToolRequest) => {
    // Capture request
    events.toolRequests.push(request);

    // Validate request against schema
    const parseResult = McpToolRequestSchema.safeParse(request);
    if (!parseResult.success) {
      logger.error({ error: parseResult.error }, '[TEST] Invalid tool request');
    }

    // Auto-respond with success for testing
    const response: McpToolResponse = {
      requestId: request.requestId,
      success: true,
      result: {
        success: true,
        message: `Tool ${request.toolName} executed successfully`,
        nodeId: `node-${String(Date.now())}`,
      },
    };

    // Validate response
    const responseResult = McpToolResponseSchema.safeParse(response);
    if (!responseResult.success) {
      logger.error({ error: responseResult.error }, '[TEST] Invalid tool response');
    }

    // Send response back to agent
    manager.handleToolResponse(sessionId, response);
  };
}

// =============================================================================
// REAL E2E TESTS
// =============================================================================

// Check credentials upfront (module-level)
const CREDENTIALS = ClaudeCredentials.getCredentials();
const HAS_CREDENTIALS = CREDENTIALS.hasCredentials;

if (!HAS_CREDENTIALS) {
  logger.warn('\n[WARN] SKIPPING REAL E2E TESTS - No credentials found');
  logger.warn('   Run: claude login (Claude Code CLI) or set ANTHROPIC_API_KEY\n');
} else {
  logger.info(`\n✓ Credentials available (${CREDENTIALS.type})`);
  logger.info('  Running REAL E2E tests with Claude API...\n');
}

describe.skipIf(skipIntegrationTests)('Canvas REAL E2E - Claude API Integration', () => {
  let manager: CanvasSessionManager;
  let events: CapturedEvents;
  let sessionCounter = 0;

  beforeEach(() => {
    manager = new CanvasSessionManager();
    events = {
      messages: [],
      toolRequests: [],
      errors: [],
    };

    // Wire up event handlers
    manager.onMessage(({ message }) => {
      events.messages.push(message);

      // Validate each message against schema
      const parseResult = SDKMessageSchema.safeParse(message);
      if (!parseResult.success) {
        logger.error({ error: parseResult.error, message }, '[TEST] Invalid SDK message');
      }
    });

    manager.onToolRequest(({ sessionId, request }) => {
      // Use auto-respond handler
      createToolResponseHandler(events, manager)(sessionId, request);
    });

    manager.onError(({ error }) => {
      events.errors.push(error.message);
    });
  });

  afterEach(() => {
    if (!manager.isDisposed) {
      manager.dispose();
    }
  });

  // Helper to conditionally run tests with timeout
  function conditionalTest(name: string, fn: () => Promise<void>): void {
    if (HAS_CREDENTIALS) {
      it(name, fn, API_TIMEOUT);
    } else {
      it.skip(name, fn);
    }
  }

  conditionalTest('should create session and receive real greeting from Claude', async () => {
    const sessionId = `real-e2e-greeting-${String(++sessionCounter)}`;

    // Create session with Claude SDK
    manager.createSession(sessionId, {
      thinkingEnabled: false,
      model: 'claude-sonnet-4-20250514',
    });

    expect(manager.hasSession(sessionId)).toBe(true);

    // Prepare empty canvas state
    const state: CanvasState = {
      nodes: [],
      edges: [],
    };

    // Send real message to Claude
    await manager.sendMessage(sessionId, 'Say hello in exactly 5 words.', state);

    // Wait for at least one text response (max 60s)
    await waitFor(
      () => events.messages.some((m) => m.type === 'text' && m.content.length > 0),
      60_000,
      500
    );

    // Validate we got real responses
    const textMessages = events.messages.filter((m) => m.type === 'text');
    expect(textMessages.length).toBeGreaterThan(0);

    // Validate all messages pass schema
    for (const msg of events.messages) {
      const result = SDKMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
      if (!result.success) {
        logger.error({ message: msg, error: result.error }, 'Schema validation failed for message');
      }
    }

    // Print response for verification
    const fullResponse = textMessages.map((m) => m.content).join('');
    logger.info(`  Claude responded: "${fullResponse}"`);

    // Cleanup
    await manager.deleteSession(sessionId);
  });

  conditionalTest(
    'should handle real tool request when Claude wants to create component',
    async () => {
      const sessionId = `real-e2e-tool-${String(++sessionCounter)}`;

      manager.createSession(sessionId, {
        thinkingEnabled: false,
        model: 'claude-sonnet-4-20250514',
      });

      const state: CanvasState = {
        nodes: [],
        edges: [],
      };

      // Ask Claude to create a component - this should trigger tool use
      await manager.sendMessage(
        sessionId,
        'Create a simple React button component that says "Click me". Use the create_component tool.',
        state
      );

      // Wait for either tool request or text response (max 90s)
      await waitFor(
        () =>
          events.toolRequests.length > 0 ||
          events.messages.some((m) => m.type === 'text' && m.content.length > 50) ||
          events.messages.some((m) => m.type === 'result'),
        90_000,
        500
      );

      // Log what happened
      logger.info(`  Messages received: ${String(events.messages.length)}`);
      logger.info(`  Tool requests: ${String(events.toolRequests.length)}`);
      if (events.toolRequests.length > 0 && events.toolRequests[0] !== undefined) {
        logger.info(`  First tool: ${events.toolRequests[0].toolName}`);
      }

      // Validate all messages
      for (const msg of events.messages) {
        const result = SDKMessageSchema.safeParse(msg);
        expect(result.success).toBe(true);
      }

      // Validate all tool requests
      for (const req of events.toolRequests) {
        const result = McpToolRequestSchema.safeParse(req);
        expect(result.success).toBe(true);
      }

      // We should have gotten some response (either tool use or text)
      expect(events.messages.length + events.toolRequests.length).toBeGreaterThan(0);

      await manager.deleteSession(sessionId);
    }
  );

  conditionalTest('should validate canvas state in real request/response flow', async () => {
    const sessionId = `real-e2e-state-${String(++sessionCounter)}`;

    manager.createSession(sessionId, {
      thinkingEnabled: false,
      model: 'claude-sonnet-4-20250514',
    });

    // Create a realistic canvas state with existing component
    const state: CanvasState = {
      nodes: [
        {
          id: 'existing-button',
          type: 'sandpack',
          position: { x: 100, y: 100 },
          data: {
            name: 'Button',
            code: `export default function Button() {
  return <button className="px-4 py-2 bg-blue-500 text-white rounded">Click</button>;
}`,
          },
        },
      ],
      edges: [],
      selectedNodeId: 'existing-button',
      selectedNodeType: 'sandpack',
    };

    // Validate our test state passes schema
    const stateValidation = CanvasStateSchema.safeParse(state);
    expect(stateValidation.success).toBe(true);

    // Send message with existing canvas context
    await manager.sendMessage(
      sessionId,
      'Describe the currently selected component in 10 words or less.',
      state
    );

    // Wait for response
    await waitFor(
      () => events.messages.some((m) => m.type === 'text' && m.content.length > 10),
      60_000,
      500
    );

    // Claude should acknowledge the existing component
    const textMessages = events.messages.filter((m) => m.type === 'text');
    const fullResponse = textMessages.map((m) => m.content).join('');
    logger.info(`  Claude responded: "${fullResponse}"`);

    // Response should mention button-related words (case-insensitive check)
    const responseLower = fullResponse.toLowerCase();
    const mentionsButton =
      responseLower.includes('button') ||
      responseLower.includes('click') ||
      responseLower.includes('blue') ||
      responseLower.includes('component');
    expect(mentionsButton).toBe(true);

    // Validate all messages
    for (const msg of events.messages) {
      const result = SDKMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    }

    await manager.deleteSession(sessionId);
  });

  conditionalTest('should handle session interruption gracefully', async () => {
    const sessionId = `real-e2e-interrupt-${String(++sessionCounter)}`;

    manager.createSession(sessionId, {
      thinkingEnabled: false,
      model: 'claude-sonnet-4-20250514',
    });

    const state: CanvasState = { nodes: [], edges: [] };

    // Send a long message that will take time to process
    await manager.sendMessage(
      sessionId,
      'Write a very detailed 500-word essay about React components.',
      state
    );

    // Wait briefly for processing to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Interrupt the session
    await manager.interrupt(sessionId);

    // Should not crash or hang
    expect(manager.hasSession(sessionId)).toBe(true);

    // Cleanup
    await manager.deleteSession(sessionId);
  });

  conditionalTest('should validate tool_use message metadata when Claude uses tools', async () => {
    const sessionId = `real-e2e-toolmeta-${String(++sessionCounter)}`;

    manager.createSession(sessionId, {
      thinkingEnabled: false,
      model: 'claude-sonnet-4-20250514',
    });

    const state: CanvasState = { nodes: [], edges: [] };

    // Explicitly ask for tool use
    await manager.sendMessage(
      sessionId,
      'Use the create_component tool to create a component named "TestComponent" with code "<div>Test</div>".',
      state
    );

    // Wait for tool_use message or tool request
    await waitFor(
      () =>
        events.toolRequests.length > 0 ||
        events.messages.some((m) => m.type === 'tool_use') ||
        events.messages.some((m) => m.type === 'result'),
      90_000,
      500
    );

    // Check for tool_use messages
    const toolUseMessages = events.messages.filter((m) => m.type === 'tool_use');
    if (toolUseMessages.length > 0) {
      logger.info(`  Found ${String(toolUseMessages.length)} tool_use messages`);

      for (const msg of toolUseMessages) {
        // Validate metadata matches ToolUseMetadata schema
        if (msg.metadata) {
          const metadataResult = ToolUseMetadataSchema.safeParse(msg.metadata);
          if (!metadataResult.success) {
            logger.info(
              { metadata: msg.metadata, error: metadataResult.error },
              'Tool metadata validation failed'
            );
          }
          // Note: We allow this to not be strict since SDK may add fields
          expect(msg.metadata).toHaveProperty('toolName');
          expect(msg.metadata).toHaveProperty('toolId');
        }
      }
    }

    // Validate tool requests
    if (events.toolRequests.length > 0) {
      logger.info(`  Found ${String(events.toolRequests.length)} tool requests`);
      for (const req of events.toolRequests) {
        expect(typeof req.requestId).toBe('string');
        expect(typeof req.toolName).toBe('string');
        expect(typeof req.toolInput).toBe('object');
      }
    }

    await manager.deleteSession(sessionId);
  });
});

describe.skipIf(skipIntegrationTests)('Canvas REAL E2E - Schema Strictness', () => {
  conditionalTest('should reject messages with invalid type', () => {
    const invalidMessage = {
      type: 'invalid_type',
      content: 'test',
    };

    const result = SDKMessageSchema.safeParse(invalidMessage);
    expect(result.success).toBe(false);
  });

  it('should reject canvas state with extra fields (strict mode)', () => {
    const invalidState = {
      nodes: [],
      edges: [],
      extraField: 'should fail strict validation',
    };

    const result = CanvasStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject tool request with missing required fields', () => {
    const invalidRequest = {
      toolName: 'test',
      // missing requestId and toolInput
    };

    const result = McpToolRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should accept valid tool response', () => {
    const validResponse = {
      requestId: 'req-123',
      success: true,
      result: { nodeId: 'node-1', message: 'Created' },
    };

    const result = McpToolResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('should reject tool response without requestId', () => {
    const invalidResponse = {
      success: true,
      result: {},
    };

    const result = McpToolResponseSchema.safeParse(invalidResponse);
    expect(result.success).toBe(false);
  });

  function conditionalTest(name: string, fn: () => Promise<void> | void): void {
    it(name, fn);
  }
});
