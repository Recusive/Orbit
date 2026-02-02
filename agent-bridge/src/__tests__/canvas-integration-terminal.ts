/**
 * Canvas Integration - Terminal Test
 *
 * Proper integration tests that exercise real functionality.
 * Run with: bun run src/__tests__/canvas-integration-terminal.ts
 */

import { CanvasSessionManager, CanvasToolBridge, createCanvasMcpServer } from '../canvas/index.js';
import { createLogger } from '../common/logging/logger.js';

import type { CanvasState } from '../canvas/index.js';

const logger = createLogger('CanvasIntegrationTest');

logger.info('=== Canvas Integration Terminal Test ===\n');

let passed = 0;
let failed = 0;

function test(name: string, condition: boolean): void {
  if (condition) {
    logger.info('✓ ' + name);
    passed++;
  } else {
    logger.error('✗ ' + name);
    failed++;
  }
}

async function testAsync(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const result = await fn();
    test(name, result);
  } catch (e) {
    logger.error('✗ ' + name + ' (threw: ' + (e instanceof Error ? e.message : String(e)) + ')');
    failed++;
  }
}

function createMockState(): CanvasState {
  return {
    nodes: [
      {
        id: 'btn-1',
        type: 'sandpack',
        position: { x: 100, y: 200 },
        data: {
          name: 'PrimaryButton',
          code: 'export default () => <button className="primary">Click me</button>',
        },
      },
      {
        id: 'card-1',
        type: 'sandpack',
        position: { x: 300, y: 200 },
        data: {
          name: 'Card',
          code: 'export default ({ children }) => <div className="card">{children}</div>',
        },
      },
    ],
    edges: [{ id: 'edge-1', source: 'btn-1', target: 'card-1' }],
  };
}

// ============================================================================
// TEST 1: Session Lifecycle
// ============================================================================
logger.info('1. Session Lifecycle:');

const manager1 = new CanvasSessionManager();

await manager1.createSession('lifecycle-test', { thinkingEnabled: false });
test(
  'Create session succeeds',
  manager1.hasSession('lifecycle-test') && manager1.sessionCount === 1
);

await manager1.createSession('lifecycle-test-2');
test('Create second session', manager1.sessionCount === 2);

await manager1.deleteSession('lifecycle-test');
test(
  'Delete session cleans up',
  !manager1.hasSession('lifecycle-test') && manager1.sessionCount === 1
);

await manager1.createSession('lifecycle-test-2');
test('Duplicate session is idempotent', manager1.sessionCount === 1);

manager1.dispose();

// ============================================================================
// TEST 2: Canvas State Management
// ============================================================================
logger.info('\n2. Canvas State Management:');

const manager2 = new CanvasSessionManager();
await manager2.createSession('state-test');

const mockState = createMockState();
manager2.updateCanvasState('state-test', mockState);

const retrieved = manager2.getCanvasState('state-test');
test(
  'State stored and retrieved correctly',
  retrieved?.nodes.length === 2 && retrieved.edges.length === 1
);

// Test state isolation
await manager2.createSession('state-test-2');
const isolatedState: CanvasState = {
  nodes: [
    {
      id: 'isolated',
      type: 'sandpack',
      position: { x: 0, y: 0 },
      data: { name: 'Isolated', code: '' },
    },
  ],
  edges: [],
};
manager2.updateCanvasState('state-test-2', isolatedState);

const state1 = manager2.getCanvasState('state-test');
const state2 = manager2.getCanvasState('state-test-2');
const node1 = state1?.nodes[0];
const node2 = state2?.nodes[0];
test(
  'States isolated between sessions',
  node1 !== undefined && node2 !== undefined && node1.id === 'btn-1' && node2.id === 'isolated'
);

manager2.dispose();

// ============================================================================
// TEST 3: Tool Bridge Request/Response
// ============================================================================
logger.info('\n3. Tool Bridge Request/Response:');

const bridge = new CanvasToolBridge();

bridge.onToolRequest((request) => {
  setTimeout(() => {
    if (request.toolName === 'should_fail') {
      bridge.handleResponse({
        requestId: request.requestId,
        success: false,
        error: 'Intentional test failure',
      });
    } else {
      bridge.handleResponse({
        requestId: request.requestId,
        success: true,
        result: {
          success: true,
          nodeId: 'created-' + request.toolName,
          message: 'Tool executed: ' + request.toolName,
        },
      });
    }
  }, 5);
});

await testAsync('Request/response cycle completes with correct data', async () => {
  const result = await bridge.sendRequest<{ success: boolean; nodeId: string }>(
    'create_component',
    {
      name: 'Test',
    }
  );
  return result.success && result.nodeId === 'created-create_component';
});

await testAsync('Error response propagates correctly', async () => {
  try {
    await bridge.sendRequest('should_fail', {});
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes('Intentional test failure');
  }
});

await testAsync('Concurrent requests resolve independently', async () => {
  const [r1, r2, r3] = await Promise.all([
    bridge.sendRequest<{ nodeId: string }>('tool_a', {}),
    bridge.sendRequest<{ nodeId: string }>('tool_b', {}),
    bridge.sendRequest<{ nodeId: string }>('tool_c', {}),
  ]);
  return (
    r1.nodeId === 'created-tool_a' &&
    r2.nodeId === 'created-tool_b' &&
    r3.nodeId === 'created-tool_c'
  );
});

bridge.dispose();

await testAsync('Requests rejected after disposal', async () => {
  try {
    await bridge.sendRequest('test', {});
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes('disposed');
  }
});

// ============================================================================
// TEST 4: MCP Server Integration
// ============================================================================
logger.info('\n4. MCP Server Integration:');

const mcpBridge = new CanvasToolBridge();
const server = createCanvasMcpServer(mcpBridge);

interface McpInternal {
  _registeredTools: Record<string, unknown>;
}
const internal = server.instance as unknown as McpInternal;
const registeredTools = Object.keys(internal._registeredTools);

test('Server registers all 19 tools', registeredTools.length === 19);

const hasComponentTools = registeredTools.some((t) => t.includes('component'));
const hasPageTools = registeredTools.some((t) => t.includes('page'));
const hasLayoutTools = registeredTools.some((t) => t.includes('layout'));
test('Tool categories represented', hasComponentTools && hasPageTools && hasLayoutTools);

mcpBridge.dispose();

// ============================================================================
// TEST 5: Error Handling
// ============================================================================
logger.info('\n5. Error Handling:');

const manager5 = new CanvasSessionManager();

await testAsync('sendMessage to nonexistent session throws', async () => {
  try {
    await manager5.sendMessage('nonexistent', 'Hello', createMockState());
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes('not found');
  }
});

manager5.dispose();

void testAsync('createSession after dispose throws', async () => {
  try {
    await manager5.createSession('post-dispose');
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes('disposed');
  }
});

// ============================================================================
// TEST 6: Configuration Updates
// ============================================================================
logger.info('\n6. Configuration Updates:');

const manager6 = new CanvasSessionManager();
await manager6.createSession('config-test', {
  thinkingEnabled: false,
  model: 'claude-sonnet-4-20250514',
});

const initialConfig = manager6.getSessionConfig('config-test');
test(
  'Initial config stored',
  initialConfig?.thinkingEnabled === false && initialConfig.model === 'claude-sonnet-4-20250514'
);

manager6.setThinkingMode('config-test', true);
manager6.setModel('config-test', 'claude-opus-4-20250514');

const updatedConfig = manager6.getSessionConfig('config-test');
test(
  'Config updates applied',
  updatedConfig?.thinkingEnabled === true && updatedConfig.model === 'claude-opus-4-20250514'
);

manager6.dispose();

// ============================================================================
// TEST 7: End-to-End Flow (simulating index.ts)
// ============================================================================
logger.info('\n7. End-to-End Flow (index.ts simulation):');

const e2eManager = new CanvasSessionManager();

// Wire up like index.ts (no-op callbacks for test)
e2eManager.onMessage(() => {
  /* no-op */
});
e2eManager.onToolRequest(() => {
  /* no-op */
});
e2eManager.onError(() => {
  /* no-op */
});

void testAsync('E2E: Full session lifecycle', async () => {
  // Create
  await e2eManager.createSession('e2e-session', { thinkingEnabled: false });
  if (!e2eManager.hasSession('e2e-session')) return false;

  // Update state
  e2eManager.updateCanvasState('e2e-session', createMockState());
  const state = e2eManager.getCanvasState('e2e-session');
  if (state?.nodes.length !== 2) return false;

  // Interrupt
  await e2eManager.interrupt('e2e-session');

  // Delete
  await e2eManager.deleteSession('e2e-session');
  if (e2eManager.hasSession('e2e-session')) return false;

  return true;
});

e2eManager.dispose();

// ============================================================================
// Summary
// ============================================================================
logger.info('\n=== Summary ===');
logger.info(`Passed: ${String(passed)}`);
logger.info(`Failed: ${String(failed)}`);
logger.info(`Result: ${failed === 0 ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗'}`);

if (failed > 0) {
  process.exit(1);
}
