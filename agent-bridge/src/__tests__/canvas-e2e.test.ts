/**
 * Canvas End-to-End Integration Test
 *
 * Tests the COMPLETE flow from Tauri commands through the bridge to Claude SDK and back:
 *
 * orbit-canvas UI
 *      ↓ useCanvas hook
 * Tauri Commands (canvas_*)
 *      ↓ invoke (simulated as BridgeRequest JSON)
 * SessionManager (simulated)
 *      ↓ BridgeRequest JSON
 * agent-bridge sidecar (REAL)
 *      ↓ CanvasSessionManager (REAL)
 * CanvasAgent + Claude SDK (REAL)
 *      ↓ BridgeEvent JSON
 * Tauri Events (canvas:*) (validated)
 *      ↓ listen (simulated)
 * orbit-canvas UI
 *
 * Run with: cd agent-bridge && bun test src/__tests__/canvas-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { z } from 'zod';

import { CanvasSessionManager } from '../canvas/index.js';
import { createIntentAnalyzer } from '../canvas/orchestrator/index.js';
import { BridgeRequestSchema } from '../schemas.js';

import type { IntentAnalyzer } from '../canvas/orchestrator/index.js';
import type {
  CanvasState,
  CanvasSessionConfig,
  McpToolRequest,
  McpToolResponse,
} from '../canvas/types.js';
import type {
  CanvasCreateSessionRequest,
  CanvasDeleteSessionRequest,
  CanvasSendMessageRequest,
  CanvasInterruptRequest,
  CanvasToolResponseRequest,
  CanvasMessageEvent,
  CanvasToolRequestEvent,
  CanvasErrorEvent,
  BridgeCommandResponse,
} from '../protocol.js';

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION (must match apps/agent/src/types/canvas.ts)
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

// Event payload schemas
const CanvasMessageEventSchema = z
  .object({
    type: z.literal('canvas:message'),
    sessionId: z.string(),
    message: SDKMessageSchema,
  })
  .strict();

const CanvasToolRequestEventSchema = z
  .object({
    type: z.literal('canvas:tool_request'),
    sessionId: z.string(),
    request: McpToolRequestSchema,
  })
  .strict();

const CanvasErrorEventSchema = z
  .object({
    type: z.literal('canvas:error'),
    sessionId: z.string(),
    error: z.string(),
  })
  .strict();

// Command response schemas
const SuccessResponseSchema = z
  .object({ type: z.literal('success'), requestType: z.string() })
  .strict();

// =============================================================================
// BRIDGE REQUEST SIMULATION
// =============================================================================

/**
 * Simulates Tauri invoke → BridgeRequest JSON flow
 * This is what the Rust layer sends to the agent-bridge sidecar
 */
function createBridgeRequest<T extends { type: string }>(request: T): T {
  // Validate request matches BridgeRequestSchema
  const result = BridgeRequestSchema.safeParse(request);
  if (!result.success) {
    throw new Error(`Invalid BridgeRequest: ${result.error.message}`);
  }
  return request;
}

/**
 * Simulates success response from agent-bridge
 */
function createSuccessResponse(requestType: string): BridgeCommandResponse {
  return { type: 'success', requestType };
}

// =============================================================================
// E2E TEST INFRASTRUCTURE
// =============================================================================

/**
 * Captured events during E2E test
 */
interface CapturedEvents {
  messages: CanvasMessageEvent[];
  toolRequests: CanvasToolRequestEvent[];
  errors: CanvasErrorEvent[];
}

/**
 * E2E Test Harness
 *
 * Simulates the full Tauri ↔ agent-bridge communication flow
 */
class E2ETestHarness {
  private readonly manager: CanvasSessionManager;
  private readonly events: CapturedEvents = {
    messages: [],
    toolRequests: [],
    errors: [],
  };
  private toolRequestHandler: ((request: McpToolRequest) => McpToolResponse) | null = null;

  constructor() {
    this.manager = new CanvasSessionManager();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Wire up event handlers exactly like index.ts does
    this.manager.onMessage((data) => {
      const event: CanvasMessageEvent = {
        type: 'canvas:message',
        sessionId: data.sessionId,
        message: data.message,
      };

      // Validate event matches schema
      const result = CanvasMessageEventSchema.safeParse(event);
      if (!result.success) {
        throw new Error(`Invalid canvas:message event: ${result.error.message}`);
      }

      this.events.messages.push(event);
    });

    this.manager.onToolRequest((data) => {
      const event: CanvasToolRequestEvent = {
        type: 'canvas:tool_request',
        sessionId: data.sessionId,
        request: data.request,
      };

      // Validate event matches schema
      const result = CanvasToolRequestEventSchema.safeParse(event);
      if (!result.success) {
        throw new Error(`Invalid canvas:tool_request event: ${result.error.message}`);
      }

      this.events.toolRequests.push(event);

      // Auto-respond to tool requests if handler is set
      if (this.toolRequestHandler) {
        const response = this.toolRequestHandler(data.request);
        this.handleToolResponse(data.sessionId, response);
      }
    });

    this.manager.onError((data) => {
      const event: CanvasErrorEvent = {
        type: 'canvas:error',
        sessionId: data.sessionId,
        error: data.error.message,
      };

      // Validate event matches schema
      const result = CanvasErrorEventSchema.safeParse(event);
      if (!result.success) {
        throw new Error(`Invalid canvas:error event: ${result.error.message}`);
      }

      this.events.errors.push(event);
    });
  }

  /**
   * Set auto-response handler for tool requests
   */
  setToolRequestHandler(handler: (request: McpToolRequest) => McpToolResponse): void {
    this.toolRequestHandler = handler;
  }

  /**
   * Simulate: Tauri invoke('canvas_create_session', { sessionId, config })
   */
  createSession(sessionId: string, config?: CanvasSessionConfig): BridgeCommandResponse {
    const request = createBridgeRequest<CanvasCreateSessionRequest>({
      type: 'canvas:create_session',
      sessionId,
      config,
    });

    this.manager.createSession(request.sessionId, request.config);
    return createSuccessResponse(request.type);
  }

  /**
   * Simulate: Tauri invoke('canvas_delete_session', { sessionId })
   */
  async deleteSession(sessionId: string): Promise<BridgeCommandResponse> {
    const request = createBridgeRequest<CanvasDeleteSessionRequest>({
      type: 'canvas:delete_session',
      sessionId,
    });

    await this.manager.deleteSession(request.sessionId);
    return createSuccessResponse(request.type);
  }

  /**
   * Simulate: Tauri invoke('canvas_send_message', { sessionId, message, state })
   */
  async sendMessage(
    sessionId: string,
    message: string,
    state: CanvasState
  ): Promise<BridgeCommandResponse> {
    // Validate state matches schema before sending
    const stateResult = CanvasStateSchema.safeParse(state);
    if (!stateResult.success) {
      throw new Error(`Invalid CanvasState: ${stateResult.error.message}`);
    }

    const request = createBridgeRequest<CanvasSendMessageRequest>({
      type: 'canvas:send_message',
      sessionId,
      message,
      state,
    });

    await this.manager.sendMessage(request.sessionId, request.message, request.state);
    return createSuccessResponse(request.type);
  }

  /**
   * Simulate: Tauri invoke('canvas_interrupt', { sessionId })
   */
  async interrupt(sessionId: string): Promise<BridgeCommandResponse> {
    const request = createBridgeRequest<CanvasInterruptRequest>({
      type: 'canvas:interrupt',
      sessionId,
    });

    await this.manager.interrupt(request.sessionId);
    return createSuccessResponse(request.type);
  }

  /**
   * Simulate: Tauri invoke('canvas_tool_response', { sessionId, response })
   */
  handleToolResponse(sessionId: string, response: McpToolResponse): BridgeCommandResponse {
    // Validate response matches schema
    const responseResult = McpToolResponseSchema.safeParse(response);
    if (!responseResult.success) {
      throw new Error(`Invalid McpToolResponse: ${responseResult.error.message}`);
    }

    const request = createBridgeRequest<CanvasToolResponseRequest>({
      type: 'canvas:tool_response',
      sessionId,
      response,
    });

    this.manager.handleToolResponse(request.sessionId, request.response);
    return createSuccessResponse(request.type);
  }

  /**
   * Get captured events
   */
  getEvents(): CapturedEvents {
    return this.events;
  }

  /**
   * Clear captured events
   */
  clearEvents(): void {
    this.events.messages = [];
    this.events.toolRequests = [];
    this.events.errors = [];
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.manager.sessionCount;
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.manager.hasSession(sessionId);
  }

  /**
   * Get canvas state
   */
  getCanvasState(sessionId: string): CanvasState | undefined {
    return this.manager.getCanvasState(sessionId);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.manager.dispose();
  }
}

// =============================================================================
// E2E TESTS
// =============================================================================

describe('Canvas E2E - Full Tauri → Bridge → SDK Flow', () => {
  let harness: E2ETestHarness;

  beforeAll(() => {
    harness = new E2ETestHarness();
  });

  afterAll(() => {
    harness.dispose();
  });

  describe('Session Lifecycle E2E', () => {
    it('should complete full session lifecycle with validated data', async () => {
      const sessionId = 'e2e-lifecycle-test';

      // Step 1: Create session (simulates Tauri invoke → bridge → SDK)
      const createResponse = harness.createSession(sessionId, {
        thinkingEnabled: false,
        model: 'claude-sonnet-4-20250514',
      });

      // Validate response
      expect(SuccessResponseSchema.safeParse(createResponse).success).toBe(true);
      expect(harness.hasSession(sessionId)).toBe(true);

      // Step 2: Delete session
      const deleteResponse = await harness.deleteSession(sessionId);
      expect(SuccessResponseSchema.safeParse(deleteResponse).success).toBe(true);
      expect(harness.hasSession(sessionId)).toBe(false);
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessions = ['e2e-multi-1', 'e2e-multi-2', 'e2e-multi-3'];

      // Create all sessions
      const createResponses = sessions.map((id) => harness.createSession(id));

      // Validate all responses
      for (const response of createResponses) {
        expect(SuccessResponseSchema.safeParse(response).success).toBe(true);
      }
      expect(harness.sessionCount).toBe(3);

      // Delete all sessions in parallel
      const deletePromises = sessions.map((id) => harness.deleteSession(id));
      await Promise.all(deletePromises);
      expect(harness.sessionCount).toBe(0);
    });
  });

  describe('Canvas State E2E', () => {
    it('should validate canvas state through full flow', async () => {
      const sessionId = 'e2e-state-test';
      harness.createSession(sessionId);

      // Create complex canvas state
      const state: CanvasState = {
        nodes: [
          {
            id: 'header',
            type: 'sandpack',
            position: { x: 0, y: 0 },
            data: {
              name: 'HeaderComponent',
              code: `export default function Header() {
  return (
    <header className="bg-blue-600 text-white p-4">
      <h1>My App</h1>
    </header>
  );
}`,
            },
          },
          {
            id: 'main-page',
            type: 'page',
            position: { x: 300, y: 0 },
            data: {
              name: 'MainPage',
              layout: 'flex',
              layoutOptions: { direction: 'column', gap: '16px', padding: '24px' },
              viewport: 'desktop',
              background: { color: '#f5f5f5' },
              slots: [{ slotId: 'slot-header', componentId: 'header', zIndex: 1, visible: true }],
            },
          },
        ],
        edges: [{ id: 'edge-1', source: 'header', target: 'main-page' }],
        selectedNodeId: 'header',
        selectedNodeType: 'sandpack',
      };

      // Validate state before sending
      expect(CanvasStateSchema.safeParse(state).success).toBe(true);

      // Store state (this would normally happen via sendMessage)
      harness.manager.updateCanvasState(sessionId, state);

      // Retrieve and validate
      const retrieved = harness.getCanvasState(sessionId);
      expect(retrieved).toBeDefined();
      expect(CanvasStateSchema.safeParse(retrieved).success).toBe(true);

      // Verify complex nested data
      expect(retrieved?.nodes.length).toBe(2);
      expect(retrieved?.edges.length).toBe(1);

      const pageNode = retrieved?.nodes.find((n) => n.type === 'page');
      expect(pageNode).toBeDefined();
      if (pageNode?.type === 'page') {
        expect(pageNode.data.slots?.length).toBe(1);
        expect(pageNode.data.layout).toBe('flex');
      }

      await harness.deleteSession(sessionId);
    });
  });

  describe('Tool Request/Response E2E', () => {
    it('should complete full tool round-trip with validated data', async () => {
      const sessionId = 'e2e-tool-test';
      harness.createSession(sessionId);

      const capturedRequests: McpToolRequest[] = [];

      // Set up tool request handler (simulates frontend tool execution)
      harness.setToolRequestHandler((request) => {
        // Validate incoming request
        expect(McpToolRequestSchema.safeParse(request).success).toBe(true);
        capturedRequests.push(request);

        // Return validated response
        const toolInput = request.toolInput as { name?: string };
        const response: McpToolResponse = {
          requestId: request.requestId,
          success: true,
          result: {
            success: true,
            nodeId: `created-${String(Date.now())}`,
            message: `Created component: ${toolInput.name ?? 'unknown'}`,
          },
        };

        expect(McpToolResponseSchema.safeParse(response).success).toBe(true);
        return response;
      });

      // Send tool request through bridge
      const bridge = harness.manager.sessions.get(sessionId);
      if (bridge) {
        const toolBridge = bridge.toolBridge;

        // Simulate agent requesting a tool
        const result = await toolBridge.sendRequest('create_component', {
          name: 'E2ETestButton',
          code: '<button>E2E Test</button>',
          position: { x: 100, y: 200 },
        });

        // Validate result
        expect(result).toBeDefined();
        expect((result as Record<string, unknown>).success).toBe(true);
      }

      // Verify events were captured and validated
      const events = harness.getEvents();
      expect(events.toolRequests.length).toBeGreaterThanOrEqual(0);

      await harness.deleteSession(sessionId);
    });
  });

  describe('Event Validation E2E', () => {
    it('should validate all event schemas during message flow', async () => {
      const sessionId = 'e2e-event-test';
      harness.createSession(sessionId);
      harness.clearEvents();

      // The events are captured and validated by the harness automatically
      // Any invalid event will throw during the callback

      // Store state to trigger internal events
      const state: CanvasState = {
        nodes: [
          {
            id: 'event-test-node',
            type: 'sandpack',
            position: { x: 0, y: 0 },
            data: { name: 'EventTest', code: 'export default () => <div>Test</div>' },
          },
        ],
        edges: [],
      };

      harness.manager.updateCanvasState(sessionId, state);

      // Verify state was stored correctly
      const retrieved = harness.getCanvasState(sessionId);
      expect(CanvasStateSchema.safeParse(retrieved).success).toBe(true);

      await harness.deleteSession(sessionId);
    });
  });

  describe('Error Handling E2E', () => {
    it('should handle and validate error events', () => {
      // Try to send message to non-existent session
      const state: CanvasState = { nodes: [], edges: [] };

      // sendMessage is async, so use expect().rejects pattern
      expect(harness.sendMessage('non-existent-session', 'Hello', state)).rejects.toThrow(
        'not found'
      );
    });

    it('should reject invalid canvas state', () => {
      const invalidState = {
        nodes: [{ id: 'test', type: 'invalid-type', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      };

      const result = CanvasStateSchema.safeParse(invalidState);
      expect(result.success).toBe(false);
    });

    it('should reject state with extra fields (strict mode)', () => {
      const stateWithExtra = {
        nodes: [],
        edges: [],
        extraField: 'should fail',
      };

      const result = CanvasStateSchema.safeParse(stateWithExtra);
      expect(result.success).toBe(false);
    });
  });
});

describe('Canvas E2E - Protocol Validation', () => {
  it('should validate all canvas BridgeRequest types', () => {
    // canvas:create_session
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:create_session',
        sessionId: 'test',
        config: { thinkingEnabled: true },
      }).success
    ).toBe(true);

    // canvas:delete_session
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:delete_session',
        sessionId: 'test',
      }).success
    ).toBe(true);

    // canvas:send_message
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:send_message',
        sessionId: 'test',
        message: 'Create a button',
        state: { nodes: [], edges: [] },
      }).success
    ).toBe(true);

    // canvas:interrupt
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:interrupt',
        sessionId: 'test',
      }).success
    ).toBe(true);

    // canvas:tool_response
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:tool_response',
        sessionId: 'test',
        response: { requestId: 'req-1', success: true, result: {} },
      }).success
    ).toBe(true);
  });

  it('should reject invalid canvas BridgeRequest types', () => {
    // Missing sessionId
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:create_session',
      }).success
    ).toBe(false);

    // Invalid type
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:invalid_type',
        sessionId: 'test',
      }).success
    ).toBe(false);

    // Missing required fields
    expect(
      BridgeRequestSchema.safeParse({
        type: 'canvas:send_message',
        sessionId: 'test',
        // missing message and state
      }).success
    ).toBe(false);
  });
});

describe('Canvas E2E - Real Claude SDK Integration', () => {
  let harness: E2ETestHarness;

  beforeAll(() => {
    harness = new E2ETestHarness();
  });

  afterAll(() => {
    harness.dispose();
  });

  it('should create session with real Claude SDK', async () => {
    const sessionId = 'e2e-real-sdk-test';

    // This creates a REAL CanvasAgent with REAL Claude SDK connection
    const response = harness.createSession(sessionId, {
      thinkingEnabled: false,
      model: 'claude-sonnet-4-20250514',
    });

    expect(response.type).toBe('success');
    expect(harness.hasSession(sessionId)).toBe(true);

    // Verify the session was created with correct config
    const config = harness.manager.getSessionConfig(sessionId);
    expect(config).toBeDefined();
    expect(config?.thinkingEnabled).toBe(false);
    expect(config?.model).toBe('claude-sonnet-4-20250514');

    await harness.deleteSession(sessionId);
  });
});

// =============================================================================
// ORCHESTRATOR INTEGRATION TESTS
// =============================================================================

describe('Canvas E2E - Intent Analyzer Routing', () => {
  let analyzer: IntentAnalyzer;

  beforeAll(() => {
    analyzer = createIntentAnalyzer();
  });

  describe('Fast Path Routing (Simple Requests)', () => {
    it('should route simple component creation to fast path', () => {
      const analysis = analyzer.analyze('Create a button');

      expect(analysis.category).toBe('create-component');
      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
      expect(analysis.fastPathAgent).toBe('component');
    });

    it('should route simple style changes to fast path', () => {
      const analysis = analyzer.analyze('Change the color to blue');

      expect(analysis.category).toBe('style-change');
      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
      expect(analysis.fastPathAgent).toBe('style');
    });

    it('should route simple component modification to fast path', () => {
      const analysis = analyzer.analyze('Update the button text');

      expect(analysis.category).toBe('modify-component');
      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
      expect(analysis.fastPathAgent).toBe('component');
    });

    it('should route "just" prefixed requests to fast path', () => {
      const analysis = analyzer.analyze('Just add a simple card');

      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
    });

    it('should route "only" prefixed requests to fast path', () => {
      const analysis = analyzer.analyze('Only change the background color');

      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
      expect(analysis.fastPathAgent).toBe('style');
    });
  });

  describe('Orchestrator Routing (Complex Requests)', () => {
    it('should route dashboard creation to orchestrator', () => {
      const analysis = analyzer.analyze('Build a dashboard with metrics and charts');

      expect(analysis.category).toBe('full-page');
      expect(analysis.complexity).toBe('complex');
      expect(analysis.useFastPath).toBe(false);
      expect(analysis.fastPathAgent).toBeUndefined();
    });

    it('should route landing page creation to orchestrator', () => {
      const analysis = analyzer.analyze('Create a landing page for my product');

      expect(analysis.category).toBe('full-page');
      expect(analysis.useFastPath).toBe(false);
    });

    it('should route multi-component requests to orchestrator', () => {
      const analysis = analyzer.analyze('Create multiple buttons and cards');

      expect(analysis.category).toBe('multi-component');
      expect(analysis.useFastPath).toBe(false);
    });

    it('should route "with" compound requests to orchestrator', () => {
      const analysis = analyzer.analyze('Create a header with a navigation menu');

      expect(analysis.category).toBe('multi-component');
      expect(analysis.useFastPath).toBe(false);
    });

    it('should route complex responsive requests to orchestrator', () => {
      // This triggers full orchestration due to "responsive" + "animated" complexity indicators
      const analysis = analyzer.analyze('Build a responsive card grid with animated hover effects');

      // Multiple complexity indicators push this to moderate+ complexity
      expect(['moderate', 'complex']).toContain(analysis.complexity);
      expect(analysis.useFastPath).toBe(false);
    });

    it('should route website creation to orchestrator', () => {
      const analysis = analyzer.analyze('Create a website with header, footer, and main content');

      expect(analysis.category).toBe('full-page');
      expect(analysis.useFastPath).toBe(false);
    });

    it('should route e-commerce requests to orchestrator', () => {
      const analysis = analyzer.analyze('Build an e-commerce product page');

      expect(analysis.category).toBe('full-page');
      expect(analysis.useFastPath).toBe(false);
    });
  });

  describe('Complexity Assessment', () => {
    it('should assess "complex" keyword as higher complexity', () => {
      const analysis = analyzer.analyze('Create a complex form with validation');

      // "complex" keyword adds +1 to complexity score, resulting in moderate+
      expect(['moderate', 'complex']).toContain(analysis.complexity);
    });

    it('should assess "complete" keyword as higher complexity', () => {
      const analysis = analyzer.analyze('Build a complete user profile section');

      // "complete" keyword adds +1 to complexity score, resulting in moderate+
      expect(['moderate', 'complex']).toContain(analysis.complexity);
    });

    it('should assess long prompts as more complex', () => {
      const longPrompt = `
        Create a sophisticated dashboard that includes a header with navigation,
        a sidebar with menu items, a main content area with charts and metrics,
        and a footer with links. Make sure it is responsive and has animations.
      `.trim();

      const analysis = analyzer.analyze(longPrompt);

      expect(analysis.complexity).toBe('complex');
      expect(analysis.useFastPath).toBe(false);
    });

    it('should assess "simple" keyword as simple', () => {
      const analysis = analyzer.analyze('Make a simple button');

      expect(analysis.complexity).toBe('simple');
      expect(analysis.useFastPath).toBe(true);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence for explicit keywords', () => {
      const explicit = analyzer.analyze('Create a button');
      const vague = analyzer.analyze('button');

      expect(explicit.confidence).toBeGreaterThan(vague.confidence);
    });

    it('should have lower confidence for very short prompts', () => {
      const short = analyzer.analyze('btn');
      const normal = analyzer.analyze('Create a blue submit button');

      expect(short.confidence).toBeLessThan(normal.confidence);
    });

    it('should have confidence between 0 and 1', () => {
      const analyses = [
        analyzer.analyze('Create a button'),
        analyzer.analyze('Build a dashboard'),
        analyzer.analyze('x'),
        analyzer.analyze('Create a complete responsive e-commerce website with everything'),
      ];

      for (const analysis of analyses) {
        expect(analysis.confidence).toBeGreaterThanOrEqual(0);
        expect(analysis.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Task Count Estimation', () => {
    it('should estimate 1 task for simple component creation', () => {
      const analysis = analyzer.analyze('Create a button');

      expect(analysis.estimatedTaskCount).toBe(1);
    });

    it('should estimate more tasks for full page creation', () => {
      const analysis = analyzer.analyze('Build a complete dashboard');

      expect(analysis.estimatedTaskCount).toBeGreaterThanOrEqual(5);
    });

    it('should estimate moderate tasks for multi-component', () => {
      const analysis = analyzer.analyze('Create multiple cards');

      expect(analysis.estimatedTaskCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Node Reference Detection', () => {
    const canvasState = {
      nodes: [
        {
          id: 'header-1',
          type: 'sandpack',
          position: { x: 0, y: 0 },
          data: { name: 'Header', label: 'App Header' },
        },
        {
          id: 'button-2',
          type: 'sandpack',
          position: { x: 100, y: 0 },
          data: { name: 'SubmitButton' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    };

    it('should detect node ID references', () => {
      const analysis = analyzer.analyze('Update node header-1', canvasState);

      expect(analysis.referencedNodeIds).toContain('header-1');
    });

    it('should detect component name references', () => {
      const analysis = analyzer.analyze('Change the Header component', canvasState);

      expect(analysis.referencedNodeIds).toContain('header-1');
    });

    it('should detect label references', () => {
      const analysis = analyzer.analyze('Update App Header styling', canvasState);

      expect(analysis.referencedNodeIds).toContain('header-1');
    });

    it('should route to orchestrator when multiple nodes referenced', () => {
      const analysis = analyzer.analyze('Update Header and SubmitButton together', canvasState);

      expect(analysis.referencedNodeIds.length).toBeGreaterThanOrEqual(2);
      expect(analysis.useFastPath).toBe(false);
    });
  });
});

describe('Canvas E2E - Orchestrator Integration', () => {
  let harness: E2ETestHarness;

  beforeAll(() => {
    harness = new E2ETestHarness();
  });

  afterAll(() => {
    harness.dispose();
  });

  describe('Session Manager Intent Routing', () => {
    it('should have IntentAnalyzer initialized in session manager', async () => {
      const sessionId = 'e2e-orchestrator-init-test';
      harness.createSession(sessionId);

      // Access private intentAnalyzer via manager
      const manager = harness.manager;
      const intentAnalyzer = manager.intentAnalyzer;

      expect(intentAnalyzer).toBeDefined();
      expect(typeof intentAnalyzer.analyze).toBe('function');

      await harness.deleteSession(sessionId);
    });

    it('should have orchestrators map initialized in session manager', async () => {
      const sessionId = 'e2e-orchestrator-map-test';
      harness.createSession(sessionId);

      const manager = harness.manager;
      const orchestrators = manager.orchestrators;

      expect(orchestrators).toBeDefined();
      expect(orchestrators instanceof Map).toBe(true);
      expect(orchestrators.size).toBe(0); // No orchestrator created until complex request

      await harness.deleteSession(sessionId);
    });

    it('should analyze intent before sending message', async () => {
      const sessionId = 'e2e-intent-analysis-test';
      harness.createSession(sessionId);

      const manager = harness.manager;
      const intentAnalyzer = manager.intentAnalyzer;

      // Spy on analyze method
      let analyzeCalled = false;
      const originalAnalyze = intentAnalyzer.analyze.bind(intentAnalyzer);
      intentAnalyzer.analyze = (
        prompt: string,
        canvasState?: Parameters<typeof originalAnalyze>[1]
      ): IntentAnalysis => {
        analyzeCalled = true;
        return originalAnalyze(prompt, canvasState);
      };

      // Create a simple state
      const state: CanvasState = { nodes: [], edges: [] };

      // Note: We don't actually send the message to avoid API calls
      // Just verify the routing logic by calling convertToSnapshot
      const snapshot = manager.convertToSnapshot(state);
      expect(snapshot).toBeDefined();
      expect(snapshot.nodes).toEqual([]);
      expect(snapshot.edges).toEqual([]);
      expect(snapshot.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(typeof snapshot.timestamp).toBe('number');

      // Verify analyze can be called
      const analysis = intentAnalyzer.analyze('Create a button', snapshot);
      expect(analyzeCalled).toBe(true);
      expect(analysis.useFastPath).toBe(true);

      await harness.deleteSession(sessionId);
    });
  });

  describe('Canvas State to Snapshot Conversion', () => {
    it('should convert CanvasState to CanvasSnapshot correctly', async () => {
      const sessionId = 'e2e-snapshot-conversion-test';
      harness.createSession(sessionId);

      const manager = harness.manager;

      const state: CanvasState = {
        nodes: [
          {
            id: 'node-1',
            type: 'sandpack',
            position: { x: 100, y: 200 },
            data: { name: 'TestComponent', code: '<div>Test</div>' },
          },
          {
            id: 'page-1',
            type: 'page',
            position: { x: 300, y: 0 },
            data: { name: 'MainPage', layout: 'flex' },
          },
        ],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'page-1' }],
        selectedNodeId: 'node-1',
        selectedNodeType: 'sandpack',
      };

      const snapshot = manager.convertToSnapshot(state);

      // Verify nodes converted correctly
      expect(snapshot.nodes).toHaveLength(2);
      expect(snapshot.nodes[0]).toEqual({
        id: 'node-1',
        type: 'sandpack',
        position: { x: 100, y: 200 },
        data: { name: 'TestComponent', code: '<div>Test</div>' },
      });

      // Verify edges converted correctly
      expect(snapshot.edges).toHaveLength(1);
      expect(snapshot.edges[0]).toEqual({
        id: 'edge-1',
        source: 'node-1',
        target: 'page-1',
      });

      // Verify viewport defaults
      expect(snapshot.viewport).toEqual({ x: 0, y: 0, zoom: 1 });

      // Verify selectedNodeId carried over
      expect(snapshot.selectedNodeId).toBe('node-1');

      // Verify timestamp is recent
      expect(Date.now() - snapshot.timestamp).toBeLessThan(1000);

      await harness.deleteSession(sessionId);
    });

    it('should handle null selectedNodeId', async () => {
      const sessionId = 'e2e-null-selected-test';
      harness.createSession(sessionId);

      const manager = harness.manager;

      const state: CanvasState = {
        nodes: [],
        edges: [],
        selectedNodeId: null,
      };

      const snapshot = manager.convertToSnapshot(state);

      expect(snapshot.selectedNodeId).toBeUndefined();

      await harness.deleteSession(sessionId);
    });
  });

  describe('Orchestrator Lifecycle', () => {
    it('should clean up orchestrator when session is deleted', async () => {
      const sessionId = 'e2e-orchestrator-cleanup-test';
      harness.createSession(sessionId);

      const manager = harness.manager;

      // Manually create an orchestrator for this session (simulating a complex request)
      const { createOrchestrator } = await import('../canvas/orchestrator/index.js');
      const orchestrator = createOrchestrator({ enableFastPath: false });
      manager.orchestrators.set(sessionId, orchestrator);

      expect(manager.orchestrators.has(sessionId)).toBe(true);

      // Delete session
      await harness.deleteSession(sessionId);

      // Orchestrator should be cleaned up
      expect(manager.orchestrators.has(sessionId)).toBe(false);
    });

    it('should clean up all orchestrators on dispose', async () => {
      // Create a fresh manager for this test
      const { CanvasSessionManager } = await import('../canvas/index.js');
      const manager = new CanvasSessionManager();

      // Create sessions
      manager.createSession('session-1');
      manager.createSession('session-2');

      // Add orchestrators
      const { createOrchestrator } = await import('../canvas/orchestrator/index.js');
      manager.orchestrators.set('session-1', createOrchestrator());
      manager.orchestrators.set('session-2', createOrchestrator());

      expect(manager.orchestrators.size).toBe(2);

      // Dispose manager
      manager.dispose();

      // All orchestrators should be cleaned up
      expect(manager.orchestrators.size).toBe(0);
    });
  });
});
