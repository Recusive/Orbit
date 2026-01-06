/**
 * Canvas MCP Server - File Test
 *
 * TESTED: 2026-01-05 via Bun + Terminal
 * Method: bun test (file test) and bun -e (terminal test)
 * Result: 50/50 tests passed
 *
 * Run with: bun test src/__tests__/canvas-mcp-server.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { createCanvasMcpServer, getCanvasToolNames } from '../canvas/canvas-mcp-server.js';
import { CanvasToolBridge } from '../canvas/canvas-tool-bridge.js';
import {
  CreateComponentResultSchema,
  GetCanvasStateResultSchema,
  VerifyComponentResultSchema,
  GenerateVariantsResultSchema,
  getJsonSchema,
} from '../canvas/schemas.js';

// Type for accessing private McpServer internals (for testing only)
interface McpServerInternal {
  _registeredTools: Record<string, unknown>;
}

describe('Canvas MCP Server', () => {
  let bridge: CanvasToolBridge;

  beforeEach(() => {
    bridge = new CanvasToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  describe('Server Creation', () => {
    it('should create server with correct type', () => {
      const server = createCanvasMcpServer(bridge);
      expect(server.type).toBe('sdk');
    });

    it('should create server with correct name', () => {
      const server = createCanvasMcpServer(bridge);
      expect(server.name).toBe('snowflake-canvas');
    });

    it('should have instance with registered tools', () => {
      const server = createCanvasMcpServer(bridge);
      expect(server.instance).toBeDefined();
      const internal = server.instance as unknown as McpServerInternal;
      expect(internal._registeredTools).toBeDefined();
    });

    it('should register all 19 tools', () => {
      const server = createCanvasMcpServer(bridge);
      const internal = server.instance as unknown as McpServerInternal;
      const toolCount = Object.keys(internal._registeredTools).length;
      expect(toolCount).toBe(19);
    });
  });

  describe('Tool Registration', () => {
    const expectedTools = [
      'create_component',
      'update_component',
      'delete_component',
      'connect_components',
      'move_component',
      'get_canvas_state',
      'get_aria_snapshot',
      'get_computed_styles',
      'get_element_bounds',
      'verify_component',
      'create_page',
      'add_to_page',
      'remove_from_page',
      'reorder_layers',
      'update_layout',
      'update_page_slot',
      'generate_variants',
      'iterate_design',
      'create_layout',
    ];

    it.each(expectedTools)('should register tool: %s', (toolName) => {
      const server = createCanvasMcpServer(bridge);
      const internal = server.instance as unknown as McpServerInternal;
      const tools = Object.keys(internal._registeredTools);
      expect(tools).toContain(toolName);
    });
  });

  describe('Tool Names for SDK', () => {
    it('should return 19 tool names', () => {
      const names = getCanvasToolNames();
      expect(names.length).toBe(19);
    });

    it('should have mcp__ prefix', () => {
      const names = getCanvasToolNames();
      expect(names.every((n) => n.startsWith('mcp__'))).toBe(true);
    });

    it('should include snowflake-canvas', () => {
      const names = getCanvasToolNames();
      expect(names.every((n) => n.includes('snowflake-canvas'))).toBe(true);
    });

    it('should have correct first tool name', () => {
      const names = getCanvasToolNames();
      expect(names[0]).toBe('mcp__snowflake-canvas__create_component');
    });
  });
});

describe('Canvas Tool Bridge', () => {
  let bridge: CanvasToolBridge;

  beforeEach(() => {
    bridge = new CanvasToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  describe('Request/Response Flow', () => {
    it('should start with zero pending requests', () => {
      expect(bridge.pendingCount).toBe(0);
    });

    it('should track pending count correctly', async () => {
      let capturedCount = 0;
      bridge.onToolRequest((req) => {
        // Capture pending count BEFORE responding
        capturedCount = bridge.pendingCount;
        // Then respond
        bridge.handleResponse({ requestId: req.requestId, success: true, result: {} });
      });
      await bridge.sendRequest('test', {});
      // Pending count was 1 while request was in flight
      expect(capturedCount).toBe(1);
      // After response, pending count is 0
      expect(bridge.pendingCount).toBe(0);
    });

    it('should resolve request on success response', async () => {
      bridge.onToolRequest((req) => {
        setTimeout(() => {
          bridge.handleResponse({
            requestId: req.requestId,
            success: true,
            result: { success: true, nodeId: 'test-123', message: 'OK' },
          });
        }, 5);
      });

      const result = await bridge.sendRequest<{ success: boolean; nodeId: string }>(
        'create_component',
        { name: 'Test' }
      );
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('test-123');
    });

    it('should reject request on error response', async () => {
      bridge.onToolRequest((req) => {
        setTimeout(() => {
          bridge.handleResponse({
            requestId: req.requestId,
            success: false,
            error: 'Component not found',
          });
        }, 5);
      });

      try {
        await bridge.sendRequest('delete_component', { node_id: 'x' });
        expect(true).toBe(false); // Should not reach here
      } catch (err: unknown) {
        expect(err instanceof Error && err.message).toContain('Component not found');
      }
    });

    it('should clear pending count after response', async () => {
      bridge.onToolRequest((req) => {
        setTimeout(() => {
          bridge.handleResponse({
            requestId: req.requestId,
            success: true,
            result: {},
          });
        }, 5);
      });

      await bridge.sendRequest('test', {});
      expect(bridge.pendingCount).toBe(0);
    });
  });

  describe('Disposal', () => {
    it('should mark bridge as disposed', () => {
      bridge.dispose();
      expect(bridge.isDisposed).toBe(true);
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
});

describe('Canvas Schemas', () => {
  describe('Strict Validation', () => {
    it('should accept valid CreateComponentResult', () => {
      const data = { success: true, nodeId: 'node-123', message: 'Created' };
      const result = CreateComponentResultSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject extra fields', () => {
      const data = { success: true, nodeId: 'node-123', message: 'Created', extra: 'bad' };
      const result = CreateComponentResultSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const data = { success: true, nodeId: 'node-123' };
      const result = CreateComponentResultSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject wrong types', () => {
      const data = { success: 'yes', nodeId: 'node-123', message: 'Created' };
      const result = CreateComponentResultSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Complex Schema Validation', () => {
    it('should validate GetCanvasStateResult', () => {
      const data = {
        nodes: [
          {
            id: 'n1',
            name: 'Button',
            position: { x: 100, y: 200 },
            code: 'export default function App() {}',
          },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        pages: [
          {
            id: 'p1',
            name: 'Home',
            position: { x: 0, y: 0 },
            layout: { type: 'flex', direction: 'column', gap: '16px' },
            viewport: 'desktop',
            slots: [{ id: 's1', componentId: 'n1', zIndex: 1 }],
          },
        ],
      };
      const result = GetCanvasStateResultSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate VerifyComponentResult', () => {
      const data = {
        success: true,
        nodeId: 'node-123',
        rendered: true,
        ariaSummary: 'button[Click me]',
      };
      const result = VerifyComponentResultSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate GenerateVariantsResult with tuple', () => {
      const data = {
        success: true,
        nodeIds: ['a', 'b', 'c'],
        names: ['A', 'B', 'C'],
        message: 'Generated',
      };
      const result = GenerateVariantsResultSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject GenerateVariantsResult with wrong tuple size', () => {
      const data = {
        success: true,
        nodeIds: ['a', 'b'],
        names: ['A', 'B', 'C'],
        message: 'Generated',
      };
      const result = GenerateVariantsResultSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('JSON Schema Generation', () => {
    it('should generate JSON Schema with type object', () => {
      const schema = getJsonSchema(CreateComponentResultSchema);
      expect(schema.type).toBe('object');
    });

    it('should have properties in JSON Schema', () => {
      const schema = getJsonSchema(CreateComponentResultSchema);
      expect(schema.properties).toBeDefined();
    });

    it('should have required array in JSON Schema', () => {
      const schema = getJsonSchema(CreateComponentResultSchema);
      expect(Array.isArray(schema.required)).toBe(true);
    });

    it('should have additionalProperties false', () => {
      const schema = getJsonSchema(CreateComponentResultSchema);
      expect(schema.additionalProperties).toBe(false);
    });

    it('should work with SDK outputFormat pattern', () => {
      const outputFormat = {
        type: 'json_schema' as const,
        schema: getJsonSchema(CreateComponentResultSchema),
      };
      expect(outputFormat.type).toBe('json_schema');
      expect(outputFormat.schema.type).toBe('object');
    });
  });
});
