/**
 * Canvas Module - Terminal Test
 *
 * TESTED: 2026-01-05 via Bun + Terminal
 * Method: bun run src/__tests__/canvas-terminal-test.ts
 * Result: Quick integration verification
 *
 * This is a quick terminal test for rapid verification.
 * For structured tests, use: bun test src/__tests__/canvas-mcp-server.test.ts
 */

import { createCanvasMcpServer, getCanvasToolNames } from '../canvas/mcp/canvas-mcp-server.js';
import { CanvasToolBridge } from '../canvas/mcp/canvas-tool-bridge.js';
import { CreateComponentResultSchema, getJsonSchema } from '../canvas/types/schemas.js';
import { createLogger } from '../common/logging/logger.js';

// Type for accessing private McpServer internals (for testing only)
interface McpServerInternal {
  _registeredTools: Record<string, unknown>;
}

const logger = createLogger('CanvasTerminalTest');

logger.info('=== Canvas Module Terminal Test ===\n');

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

// Test 1: MCP Server
logger.info('1. MCP Server:');
const bridge = new CanvasToolBridge();
const mcpServer = createCanvasMcpServer(bridge);

test('Server type is sdk', mcpServer.type.includes('sdk'));
test('Server name is snowflake-canvas', mcpServer.name === 'snowflake-canvas');
const mcpInternal = mcpServer.instance as unknown as McpServerInternal;
test('Registered 19 tools', Object.keys(mcpInternal._registeredTools).length === 19);

// Test 2: Tool Names
logger.info('\n2. Tool Names:');
const toolNames = getCanvasToolNames();
test('19 tool names', toolNames.length === 19);
test(
  'mcp__ prefix',
  toolNames.every((n) => n.startsWith('mcp__'))
);

// Test 3: Bridge Flow
logger.info('\n3. Bridge Flow:');
bridge.onToolRequest((req) => {
  setTimeout(() => {
    bridge.handleResponse({
      requestId: req.requestId,
      success: true,
      result: { success: true, nodeId: 'test-node', message: 'OK' },
    });
  }, 5);
});

const result = await bridge.sendRequest<{ success: boolean; nodeId: string }>('create_component', {
  name: 'Test',
});
test('Request returns result', result.success);
test('Result has nodeId', result.nodeId === 'test-node');

// Test 4: Schema Validation
logger.info('\n4. Schema Validation:');
const validData = { success: true, nodeId: 'x', message: 'ok' };
const invalidData = { success: true, nodeId: 'x', message: 'ok', extra: 'bad' };

test('Valid data accepted', CreateComponentResultSchema.safeParse(validData).success);
test('Extra fields rejected', !CreateComponentResultSchema.safeParse(invalidData).success);

// Test 5: JSON Schema
logger.info('\n5. JSON Schema:');
const jsonSchema = getJsonSchema(CreateComponentResultSchema);
test('Has type object', jsonSchema.type === 'object');
test('Has additionalProperties false', jsonSchema.additionalProperties === false);

// Cleanup
bridge.dispose();
test('Bridge disposed', bridge.isDisposed);

// Summary
logger.info('\n=== Summary ===');
logger.info(`Passed: ${String(passed)}`);
logger.info(`Failed: ${String(failed)}`);
logger.info(`Result: ${failed === 0 ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗'}`);

if (failed > 0) {
  process.exit(1);
}
