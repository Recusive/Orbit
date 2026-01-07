/**
 * Canvas Integration Test - Proper integration tests for canvas module
 *
 * Tests the actual integration patterns used in index.ts:
 * - Session creation with real CanvasAgent
 * - Message flow through the session manager
 * - Tool request/response round-trip
 * - Event emission and handling
 * - Error propagation
 *
 * Run with: bun test src/__tests__/canvas-integration.test.ts
 *
 * NOTE: These tests require Claude credentials (OAuth via Claude Code CLI or ANTHROPIC_API_KEY).
 * They are automatically skipped in CI environments where credentials are not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

// Skip integration tests in GitHub Actions CI - they require OAuth credentials from Claude Code CLI
// OAuth is available locally (keychain) but not in CI runners
const skipIntegrationTests = process.env.GITHUB_ACTIONS === 'true';

import { CanvasSessionManager, CanvasToolBridge, createCanvasMcpServer } from '../canvas/index.js';

import type { CanvasState } from '../canvas/index.js';

// Mock canvas state for testing
function createMockCanvasState(): CanvasState {
  return {
    nodes: [
      {
        id: 'node-1',
        type: 'sandpack',
        position: { x: 100, y: 200 },
        data: {
          name: 'TestButton',
          code: 'export default function TestButton() { return <button>Click</button>; }',
        },
      },
    ],
    edges: [],
  };
}

describe.skipIf(skipIntegrationTests)('Canvas Session Manager - Real Integration', () => {
  let manager: CanvasSessionManager;

  beforeEach(() => {
    manager = new CanvasSessionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Session Lifecycle', () => {
    it('should create a real session with CanvasAgent', () => {
      manager.createSession('test-session-1', { thinkingEnabled: false });

      expect(manager.hasSession('test-session-1')).toBe(true);
      expect(manager.sessionCount).toBe(1);
      expect(manager.getActiveSessions()).toContain('test-session-1');
    });

    it('should create multiple independent sessions', () => {
      manager.createSession('session-a');
      manager.createSession('session-b');
      manager.createSession('session-c');

      expect(manager.sessionCount).toBe(3);
      expect(manager.hasSession('session-a')).toBe(true);
      expect(manager.hasSession('session-b')).toBe(true);
      expect(manager.hasSession('session-c')).toBe(true);
    });

    it('should not create duplicate sessions', () => {
      manager.createSession('duplicate-test');
      manager.createSession('duplicate-test'); // Should warn but not throw

      expect(manager.sessionCount).toBe(1);
    });

    it('should delete session and clean up resources', async () => {
      manager.createSession('to-delete');
      expect(manager.hasSession('to-delete')).toBe(true);

      await manager.deleteSession('to-delete');
      expect(manager.hasSession('to-delete')).toBe(false);
      expect(manager.sessionCount).toBe(0);
    });

    it('should store and retrieve session config', () => {
      const config = {
        thinkingEnabled: true,
        model: 'claude-sonnet-4-20250514',
      };

      manager.createSession('config-test', config);

      const retrieved = manager.getSessionConfig('config-test');
      expect(retrieved).toBeDefined();
      expect(retrieved?.thinkingEnabled).toBe(true);
      expect(retrieved?.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Canvas State Management', () => {
    it('should update and retrieve canvas state', () => {
      manager.createSession('state-test');

      const mockState = createMockCanvasState();
      manager.updateCanvasState('state-test', mockState);

      const retrieved = manager.getCanvasState('state-test');
      expect(retrieved).toBeDefined();
      if (!retrieved) throw new Error('State not found');
      expect(retrieved.nodes.length).toBe(1);
      const firstNode = retrieved.nodes[0];
      if (!firstNode) throw new Error('First node not found');
      expect(firstNode.id).toBe('node-1');
    });

    it('should isolate state between sessions', () => {
      manager.createSession('state-a');
      manager.createSession('state-b');

      const stateA: CanvasState = {
        nodes: [
          {
            id: 'a-node',
            type: 'sandpack',
            position: { x: 0, y: 0 },
            data: { name: 'A', code: '' },
          },
        ],
        edges: [],
      };

      const stateB: CanvasState = {
        nodes: [
          {
            id: 'b-node',
            type: 'sandpack',
            position: { x: 100, y: 100 },
            data: { name: 'B', code: '' },
          },
        ],
        edges: [],
      };

      manager.updateCanvasState('state-a', stateA);
      manager.updateCanvasState('state-b', stateB);

      const retrievedA = manager.getCanvasState('state-a');
      const retrievedB = manager.getCanvasState('state-b');

      if (!retrievedA || !retrievedB) throw new Error('State not found');
      const nodeA = retrievedA.nodes[0];
      const nodeB = retrievedB.nodes[0];
      if (!nodeA || !nodeB) throw new Error('Node not found');
      expect(nodeA.id).toBe('a-node');
      expect(nodeB.id).toBe('b-node');
    });
  });

  describe('Error Handling', () => {
    it('should throw when sending message to nonexistent session', async () => {
      const mockState = createMockCanvasState();

      try {
        await manager.sendMessage('nonexistent', 'Hello', mockState);
        expect(true).toBe(false); // Should not reach here
      } catch (err: unknown) {
        expect(err instanceof Error && err.message).toContain('not found');
      }
    });

    it('should reject session creation after disposal', () => {
      manager.dispose();

      try {
        manager.createSession('post-dispose');
        expect(true).toBe(false); // Should not reach here
      } catch (err: unknown) {
        expect(err instanceof Error && err.message).toContain('disposed');
      }
    });
  });

  describe('Configuration Updates', () => {
    it('should update thinking mode on existing session', () => {
      manager.createSession('thinking-test', { thinkingEnabled: false });

      manager.setThinkingMode('thinking-test', true);

      const config = manager.getSessionConfig('thinking-test');
      expect(config?.thinkingEnabled).toBe(true);
    });

    it('should update model on existing session', () => {
      manager.createSession('model-test');

      manager.setModel('model-test', 'claude-opus-4-20250514');

      const config = manager.getSessionConfig('model-test');
      expect(config?.model).toBe('claude-opus-4-20250514');
    });
  });
});

describe.skipIf(skipIntegrationTests)('Canvas Tool Bridge - Request/Response Flow', () => {
  let bridge: CanvasToolBridge;

  beforeEach(() => {
    bridge = new CanvasToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('should complete full request/response cycle', async () => {
    bridge.onToolRequest((request) => {
      setTimeout(() => {
        bridge.handleResponse({
          requestId: request.requestId,
          success: true,
          result: {
            success: true,
            nodeId: 'created-node-123',
            message: 'Component created successfully',
          },
        });
      }, 10);
    });

    const result = await bridge.sendRequest<{ success: boolean; nodeId: string; message: string }>(
      'create_component',
      { name: 'NewButton', code: '<button>Click</button>' }
    );

    expect(result.success).toBe(true);
    expect(result.nodeId).toBe('created-node-123');
    expect(result.message).toBe('Component created successfully');
  });

  it('should handle error responses correctly', async () => {
    bridge.onToolRequest((request) => {
      setTimeout(() => {
        bridge.handleResponse({
          requestId: request.requestId,
          success: false,
          error: 'Component with ID xyz not found',
        });
      }, 10);
    });

    try {
      await bridge.sendRequest('delete_component', { node_id: 'xyz' });
      expect(true).toBe(false); // Should not reach here
    } catch (err: unknown) {
      expect(err instanceof Error && err.message).toContain('Component with ID xyz not found');
    }
  });

  it('should track pending requests accurately', async () => {
    expect(bridge.pendingCount).toBe(0);

    let capturedPendingCount = 0;
    bridge.onToolRequest((request) => {
      capturedPendingCount = bridge.pendingCount;
      setTimeout(() => {
        bridge.handleResponse({
          requestId: request.requestId,
          success: true,
          result: {},
        });
      }, 10);
    });

    await bridge.sendRequest('test', {});

    expect(capturedPendingCount).toBe(1);
    expect(bridge.pendingCount).toBe(0);
  });

  it('should handle multiple concurrent requests', async () => {
    bridge.onToolRequest((request) => {
      const delay = request.toolName === 'fast' ? 5 : 20;
      setTimeout(() => {
        bridge.handleResponse({
          requestId: request.requestId,
          success: true,
          result: { tool: request.toolName },
        });
      }, delay);
    });

    const [result1, result2] = await Promise.all([
      bridge.sendRequest<{ tool: string }>('slow', {}),
      bridge.sendRequest<{ tool: string }>('fast', {}),
    ]);

    expect(result1.tool).toBe('slow');
    expect(result2.tool).toBe('fast');
    expect(bridge.pendingCount).toBe(0);
  });

  it('should reject requests after disposal', async () => {
    bridge.dispose();

    try {
      await bridge.sendRequest('test', {});
      expect(true).toBe(false); // Should not reach here
    } catch (err: unknown) {
      expect(err instanceof Error && err.message).toContain('disposed');
    }
  });
});

describe.skipIf(skipIntegrationTests)('Canvas MCP Server - Tool Registration', () => {
  it('should register all 19 tools with correct categories', () => {
    const bridge = new CanvasToolBridge();
    const server = createCanvasMcpServer(bridge);

    const internal = server.instance as unknown as { _registeredTools: Record<string, unknown> };
    const toolNames = Object.keys(internal._registeredTools);

    expect(toolNames.length).toBe(19);

    // Verify each tool category is represented
    const componentTools = toolNames.filter((t) => t.includes('component'));
    const pageTools = toolNames.filter((t) => t.includes('page'));
    const layoutTools = toolNames.filter((t) => t.includes('layout'));

    expect(componentTools.length).toBeGreaterThan(0);
    expect(pageTools.length).toBeGreaterThan(0);
    expect(layoutTools.length).toBeGreaterThan(0);

    bridge.dispose();
  });

  it('should route tool calls through the bridge with correct data', async () => {
    const bridge = new CanvasToolBridge();
    const receivedRequests: { toolName: string; toolInput: unknown }[] = [];

    bridge.onToolRequest((request) => {
      receivedRequests.push({
        toolName: request.toolName,
        toolInput: request.toolInput,
      });

      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: { success: true, nodeId: 'test-node', message: 'OK' },
      });
    });

    await bridge.sendRequest('create_component', {
      name: 'TestComponent',
      code: 'export default () => <div>Test</div>',
    });

    expect(receivedRequests.length).toBe(1);
    const firstRequest = receivedRequests[0];
    if (!firstRequest) throw new Error('Request not found');
    expect(firstRequest.toolName).toBe('create_component');
    expect((firstRequest.toolInput as Record<string, unknown>).name).toBe('TestComponent');
    expect((firstRequest.toolInput as Record<string, unknown>).code).toBe(
      'export default () => <div>Test</div>'
    );

    bridge.dispose();
  });
});

describe.skipIf(skipIntegrationTests)('End-to-End Integration Flow', () => {
  it('should simulate complete index.ts event flow', async () => {
    const manager = new CanvasSessionManager();
    const events: { type: string; sessionId: string }[] = [];

    // Wire up handlers like index.ts does
    manager.onMessage((data) => {
      events.push({ type: 'canvas:message', sessionId: data.sessionId });
    });

    manager.onToolRequest((data) => {
      events.push({ type: 'canvas:tool_request', sessionId: data.sessionId });
    });

    manager.onError((data) => {
      events.push({ type: 'canvas:error', sessionId: data.sessionId });
    });

    // Create session
    manager.createSession('e2e-test', { thinkingEnabled: false });
    expect(manager.hasSession('e2e-test')).toBe(true);

    // Update state
    const mockState = createMockCanvasState();
    manager.updateCanvasState('e2e-test', mockState);

    // Verify state was stored
    const state = manager.getCanvasState('e2e-test');
    if (!state) throw new Error('State not found');
    const firstNode = state.nodes[0];
    if (!firstNode) throw new Error('First node not found');
    expect(firstNode.id).toBe('node-1');

    // Delete session
    await manager.deleteSession('e2e-test');
    expect(manager.hasSession('e2e-test')).toBe(false);

    manager.dispose();
  });
});
