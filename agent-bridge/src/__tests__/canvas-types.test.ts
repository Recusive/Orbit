/**
 * Canvas Types Integration Test
 *
 * Validates Zod schemas against REAL data flowing through the canvas system.
 * Uses actual CanvasSessionManager, CanvasToolBridge, and event handlers.
 *
 * Run with: cd agent-bridge && bun test src/__tests__/canvas-types.test.ts
 *
 * NOTE: These tests require Claude credentials (OAuth via Claude Code CLI or ANTHROPIC_API_KEY).
 * They are automatically skipped in CI environments where credentials are not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';

import { CanvasSessionManager, CanvasToolBridge } from '../canvas/index.js';

import type {
  CanvasState,
  CanvasSessionConfig,
  SDKMessage,
  McpToolRequest,
  McpToolResponse,
} from '../canvas/types/types.js';

// Skip integration tests in GitHub Actions CI - they require OAuth credentials from Claude Code CLI
// OAuth is available locally (keychain) but not in CI runners
const skipIntegrationTests = process.env.GITHUB_ACTIONS === 'true';

// =============================================================================
// ZOD SCHEMAS (must match apps/agent/src/types/canvas.ts)
// =============================================================================

const CanvasPositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

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
  .object({
    color: z.string().optional(),
    gradient: z.string().optional(),
  })
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

const CanvasSessionConfigSchema = z
  .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    model: z.string().optional(),
    thinkingEnabled: z.boolean().optional(),
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
  .object({
    code: z.string().optional(),
    recoverable: z.boolean().optional(),
  })
  .strict();

const SDKMessageSchema = z
  .object({
    type: SDKMessageTypeSchema,
    content: z.string(),
    metadata: z
      .union([ToolUseMetadataSchema, ErrorMetadataSchema, z.record(z.string(), z.unknown())])
      .optional(),
  })
  .strict();

const McpToolRequestSchema = z
  .object({
    requestId: z.string(),
    toolName: z.string(),
    toolInput: z.record(z.string(), z.unknown()),
  })
  .strict();

const McpToolResponseSchema = z
  .object({
    requestId: z.string(),
    success: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .strict();

const CanvasMessagePayloadSchema = z
  .object({
    sessionId: z.string(),
    message: SDKMessageSchema,
  })
  .strict();

const CanvasToolRequestPayloadSchema = z
  .object({
    sessionId: z.string(),
    request: McpToolRequestSchema,
  })
  .strict();

const CanvasErrorPayloadSchema = z
  .object({
    sessionId: z.string(),
    error: z.string(),
  })
  .strict();

// =============================================================================
// INTEGRATION TESTS - Real Data Flow with Schema Validation
// =============================================================================

// Skip integration tests in CI without credentials
describe.skipIf(skipIntegrationTests)('Canvas Types Integration - Real Session Manager', () => {
  let manager: CanvasSessionManager;

  beforeEach(() => {
    manager = new CanvasSessionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should validate real canvas state stored in session manager', async () => {
    // Create a real session
    await manager.createSession('schema-test-1', { thinkingEnabled: false });

    // Create state that will flow through the system
    const realState: CanvasState = {
      nodes: [
        {
          id: 'component-1',
          type: 'sandpack',
          position: { x: 100, y: 200 },
          data: {
            name: 'RealButton',
            code: 'export default function RealButton() { return <button>Real</button>; }',
          },
        },
      ],
      edges: [],
    };

    // Store state through the real manager
    manager.updateCanvasState('schema-test-1', realState);

    // Retrieve state from the real manager
    const retrievedState = manager.getCanvasState('schema-test-1');
    expect(retrievedState).toBeDefined();

    // Validate the REAL retrieved data against Zod schema
    const result = CanvasStateSchema.safeParse(retrievedState);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Schema validation failed:', z.treeifyError(result.error));
    }
  });

  it('should validate real session config from session manager', async () => {
    const config: CanvasSessionConfig = {
      thinkingEnabled: true,
      model: 'claude-sonnet-4-20250514',
    };

    // Create session with real config
    await manager.createSession('config-schema-test', config);

    // Retrieve config from real manager
    const retrievedConfig = manager.getSessionConfig('config-schema-test');
    expect(retrievedConfig).toBeDefined();

    // Validate REAL config against schema
    const result = CanvasSessionConfigSchema.safeParse(retrievedConfig);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Config schema validation failed:', z.treeifyError(result.error));
    }
  });

  it('should validate complex canvas state with page nodes and edges', async () => {
    await manager.createSession('complex-state-test');

    // Complex state with multiple node types
    const complexState: CanvasState = {
      nodes: [
        {
          id: 'header-component',
          type: 'sandpack',
          position: { x: 0, y: 0 },
          data: { name: 'Header', code: 'export default () => <header>Header</header>' },
        },
        {
          id: 'main-page',
          type: 'page',
          position: { x: 200, y: 0 },
          data: {
            name: 'MainPage',
            layout: 'flex',
            layoutOptions: { direction: 'column', gap: '16px', padding: '24px' },
            viewport: 'desktop',
            background: { color: '#ffffff' },
            slots: [
              { slotId: 'slot-1', componentId: 'header-component', zIndex: 1, visible: true },
            ],
          },
        },
      ],
      edges: [{ id: 'edge-1', source: 'header-component', target: 'main-page' }],
      selectedNodeId: 'header-component',
      selectedNodeType: 'sandpack',
    };

    manager.updateCanvasState('complex-state-test', complexState);
    const retrieved = manager.getCanvasState('complex-state-test');

    // Validate REAL complex state
    const result = CanvasStateSchema.safeParse(retrieved);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Complex state validation failed:', z.treeifyError(result.error));
    }

    // Validate individual nodes
    if (retrieved) {
      for (const node of retrieved.nodes) {
        const nodeResult = CanvasNodeSchema.safeParse(node);
        expect(nodeResult.success).toBe(true);
      }

      for (const edge of retrieved.edges) {
        const edgeResult = CanvasEdgeSchema.safeParse(edge);
        expect(edgeResult.success).toBe(true);
      }
    }
  });
});

describe.skipIf(skipIntegrationTests)('Canvas Types Integration - Real Tool Bridge', () => {
  let bridge: CanvasToolBridge;

  beforeEach(() => {
    bridge = new CanvasToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('should validate real tool request flowing through bridge', async () => {
    const capturedRequests: McpToolRequest[] = [];

    // Capture real requests as they flow through
    bridge.onToolRequest((request) => {
      capturedRequests.push(request);

      // Respond to complete the cycle
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { nodeId: 'created-123' },
      });
    });

    // Send a real request through the bridge
    await bridge.sendRequest('create_component', {
      name: 'IntegrationTestButton',
      code: '<button>Test</button>',
      position: { x: 50, y: 100 },
    });

    // Validate the REAL captured request
    expect(capturedRequests.length).toBe(1);
    const realRequest = capturedRequests[0];
    if (!realRequest) throw new Error('Request not found');

    const result = McpToolRequestSchema.safeParse(realRequest);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Tool request validation failed:', z.treeifyError(result.error));
    }

    // Verify specific fields
    expect(realRequest.toolName).toBe('create_component');
    expect(realRequest.requestId).toBeDefined();
    expect(typeof realRequest.requestId).toBe('string');
  });

  it('should validate real tool response flowing through bridge', async () => {
    const capturedResponses: McpToolResponse[] = [];

    bridge.onToolRequest((request) => {
      // Create a real response
      const response: McpToolResponse = {
        requestId: request.requestId,
        success: true,
        result: {
          success: true,
          nodeId: 'node-abc-123',
          message: 'Component created successfully',
        },
      };

      capturedResponses.push(response);
      bridge.handleResponse(response);
    });

    await bridge.sendRequest('create_component', { name: 'Test', code: '' });

    // Validate REAL response
    expect(capturedResponses.length).toBe(1);
    const realResponse = capturedResponses[0];
    if (!realResponse) throw new Error('Response not found');

    const result = McpToolResponseSchema.safeParse(realResponse);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Tool response validation failed:', z.treeifyError(result.error));
    }
  });

  it('should validate real error response flowing through bridge', () => {
    bridge.onToolRequest((request) => {
      const errorResponse: McpToolResponse = {
        requestId: request.requestId,
        success: false,
        error: 'Component not found: invalid-id',
      };

      // Validate before sending
      const result = McpToolResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);

      bridge.handleResponse(errorResponse);
    });

    expect(bridge.sendRequest('delete_component', { node_id: 'invalid-id' })).rejects.toThrow(
      'Component not found'
    );
  });

  it('should validate multiple concurrent requests', async () => {
    const allRequests: McpToolRequest[] = [];

    bridge.onToolRequest((request) => {
      allRequests.push(request);
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { tool: request.toolName },
      });
    });

    // Send multiple real requests concurrently
    await Promise.all([
      bridge.sendRequest('create_component', { name: 'A', code: '' }),
      bridge.sendRequest('update_component', { node_id: 'x', code: 'new' }),
      bridge.sendRequest('delete_component', { node_id: 'y' }),
    ]);

    // Validate ALL real requests
    expect(allRequests.length).toBe(3);
    for (const request of allRequests) {
      const result = McpToolRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    }
  });
});

describe.skipIf(skipIntegrationTests)('Canvas Types Integration - Real Event Flow', () => {
  it('should validate real event payloads from session manager', async () => {
    const manager = new CanvasSessionManager();
    const capturedMessages: { sessionId: string; message: SDKMessage }[] = [];
    const capturedToolRequests: { sessionId: string; request: McpToolRequest }[] = [];
    const capturedErrors: { sessionId: string; error: Error }[] = [];

    // Wire up real event handlers
    manager.onMessage((data) => {
      capturedMessages.push(data);

      // Validate real message payload
      const result = CanvasMessagePayloadSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    manager.onToolRequest((data) => {
      capturedToolRequests.push(data);

      // Validate real tool request payload
      const result = CanvasToolRequestPayloadSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    manager.onError((data) => {
      capturedErrors.push(data);

      // Validate real error payload
      const result = CanvasErrorPayloadSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    // Create session and update state
    await manager.createSession('event-test', { thinkingEnabled: false });

    const state: CanvasState = {
      nodes: [
        {
          id: 'event-node',
          type: 'sandpack',
          position: { x: 0, y: 0 },
          data: { name: 'EventTest', code: '' },
        },
      ],
      edges: [],
    };

    manager.updateCanvasState('event-test', state);

    // Verify state validates
    const retrieved = manager.getCanvasState('event-test');
    const stateResult = CanvasStateSchema.safeParse(retrieved);
    expect(stateResult.success).toBe(true);

    await manager.deleteSession('event-test');
    manager.dispose();
  });

  it('should validate state isolation between sessions', async () => {
    const manager = new CanvasSessionManager();

    await manager.createSession('session-a');
    await manager.createSession('session-b');

    const stateA: CanvasState = {
      nodes: [
        {
          id: 'node-a',
          type: 'sandpack',
          position: { x: 0, y: 0 },
          data: { name: 'A', code: 'a' },
        },
      ],
      edges: [],
      selectedNodeId: 'node-a',
    };

    const stateB: CanvasState = {
      nodes: [
        {
          id: 'node-b',
          type: 'page',
          position: { x: 100, y: 100 },
          data: { name: 'B', layout: 'grid', viewport: 'tablet' },
        },
      ],
      edges: [],
      selectedNodeId: 'node-b',
      selectedNodeType: 'page',
    };

    manager.updateCanvasState('session-a', stateA);
    manager.updateCanvasState('session-b', stateB);

    // Retrieve and validate BOTH real states
    const retrievedA = manager.getCanvasState('session-a');
    const retrievedB = manager.getCanvasState('session-b');

    expect(CanvasStateSchema.safeParse(retrievedA).success).toBe(true);
    expect(CanvasStateSchema.safeParse(retrievedB).success).toBe(true);

    // Verify isolation
    expect(retrievedA?.nodes[0]?.id).toBe('node-a');
    expect(retrievedB?.nodes[0]?.id).toBe('node-b');

    manager.dispose();
  });
});

describe.skipIf(skipIntegrationTests)('Canvas Types Integration - Schema Strictness', () => {
  let manager: CanvasSessionManager;

  beforeEach(() => {
    manager = new CanvasSessionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should reject state with extra fields when validated', async () => {
    await manager.createSession('strict-test');

    // This state is valid TypeScript but has extra fields
    const stateWithExtra = {
      nodes: [
        {
          id: 'test',
          type: 'sandpack' as const,
          position: { x: 0, y: 0 },
          data: { name: 'Test', code: '' },
        },
      ],
      edges: [],
      extraFieldThatShouldFail: 'this should cause validation to fail',
    };

    // Store it (TypeScript allows this)
    manager.updateCanvasState('strict-test', stateWithExtra as CanvasState);

    // Retrieve it
    const retrieved = manager.getCanvasState('strict-test');

    // Strict schema should REJECT extra fields
    const result = CanvasStateSchema.safeParse(retrieved);
    expect(result.success).toBe(false);
  });

  it('should validate that real session manager produces valid data', async () => {
    // Create multiple sessions with various configs
    const configs: CanvasSessionConfig[] = [
      { thinkingEnabled: true },
      { thinkingEnabled: false, model: 'claude-opus-4-20250514' },
      { cwd: '/some/path' },
      {},
    ];

    for (let i = 0; i < configs.length; i++) {
      const sessionId = `validation-test-${String(i)}`;
      await manager.createSession(sessionId, configs[i]);

      const retrievedConfig = manager.getSessionConfig(sessionId);
      const result = CanvasSessionConfigSchema.safeParse(retrievedConfig);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error(`Config ${String(i)} failed validation:`, z.treeifyError(result.error));
      }
    }
  });
});
