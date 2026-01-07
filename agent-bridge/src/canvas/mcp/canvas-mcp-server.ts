/**
 * Canvas MCP Server - Custom tools for canvas operations
 *
 * Uses Claude Agent SDK's createSdkMcpServer for in-process tool execution.
 * All tool calls are routed through CanvasToolBridge to the webview.
 *
 * Ported from Orbit's canvasMcpServer.ts
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { createLogger } from '../../common/logging/logger.js';

import type { CanvasToolBridge } from './canvas-tool-bridge.js';
import type {
  CreateComponentResult,
  UpdateComponentResult,
  DeleteComponentResult,
  ConnectComponentsResult,
  GetCanvasStateResult,
  MoveComponentResult,
  GetAriaSnapshotResult,
  GetComputedStylesResult,
  GetElementBoundsResult,
  VerifyComponentResult,
  CreatePageResult,
  AddToPageResult,
  RemoveFromPageResult,
  ReorderLayersResult,
  UpdateLayoutResult,
  UpdatePageSlotResult,
  GenerateVariantsResult,
  IterateDesignResult,
  CreateLayoutResult,
} from '../types/schemas.js';

const logger = createLogger('CanvasMcpServer');

/**
 * Create the Canvas MCP server with all canvas tools.
 *
 * Tool calls are routed through the bridge to the webview for execution.
 * The webview handles the actual canvas manipulation and returns results.
 *
 * @param bridge - CanvasToolBridge instance for communicating with webview
 * @returns MCP server configuration for Claude Agent SDK
 */
export function createCanvasMcpServer(
  bridge: CanvasToolBridge
): ReturnType<typeof createSdkMcpServer> {
  const tools = [
    // ============ Component Tools ============
    tool(
      'create_component',
      'Create a new React component on the canvas. The component must be a complete, self-contained React component that exports a default function App(). Use Tailwind CSS for styling. The component will be rendered live in Sandpack.',
      {
        name: z
          .string()
          .describe('Human-readable name for the component (e.g., "Login Form", "Product Card")'),
        code: z
          .string()
          .describe(
            'Complete React component code. Must export default function App() and use Tailwind CSS.'
          ),
        position: z
          .object({
            x: z.number().describe('X coordinate on canvas'),
            y: z.number().describe('Y coordinate on canvas'),
          })
          .optional()
          .describe('Position on canvas. Optional - auto-positioned if omitted.'),
      },
      async (args) => {
        logger.info({ name: args.name }, 'Creating component');
        try {
          const result = await bridge.sendRequest<CreateComponentResult>('create_component', args);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Created component "${args.name}" with ID: ${result.nodeId}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to create component: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'update_component',
      'Update the code of an existing component. Provide complete new code - it fully replaces the existing code.',
      {
        node_id: z.string().describe('ID of the component to update (from canvas state)'),
        code: z.string().describe('Complete new React component code'),
        name: z.string().optional().describe('Optional new name for the component'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id }, 'Updating component');
        try {
          await bridge.sendRequest<UpdateComponentResult>('update_component', args);
          return {
            content: [{ type: 'text' as const, text: `Updated component ${args.node_id}` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to update component: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'delete_component',
      'Delete a component from the canvas. Also removes all edges connected to it.',
      {
        node_id: z.string().describe('ID of the component to delete'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id }, 'Deleting component');
        try {
          await bridge.sendRequest<DeleteComponentResult>('delete_component', args);
          return {
            content: [{ type: 'text' as const, text: `Deleted component ${args.node_id}` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to delete component: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'connect_components',
      'Create an import/composition relationship between two components.',
      {
        source_id: z.string().describe('ID of the parent component that imports'),
        target_id: z.string().describe('ID of the child component being imported'),
      },
      async (args) => {
        logger.info(
          { sourceId: args.source_id, targetId: args.target_id },
          'Connecting components'
        );
        try {
          const result = await bridge.sendRequest<ConnectComponentsResult>(
            'connect_components',
            args
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Connected ${args.source_id} → ${args.target_id} (edge: ${result.edgeId})`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to connect components: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'move_component',
      'Move a component to a new position on the canvas.',
      {
        node_id: z.string().describe('ID of the component to move'),
        position: z
          .object({
            x: z.number().describe('New X coordinate'),
            y: z.number().describe('New Y coordinate'),
          })
          .describe('New position for the component'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id, position: args.position }, 'Moving component');
        try {
          await bridge.sendRequest<MoveComponentResult>('move_component', args);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Moved component ${args.node_id} to (${String(args.position.x)}, ${String(args.position.y)})`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to move component: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'get_canvas_state',
      'Get current state of all components on the canvas, including their code.',
      {},
      async () => {
        logger.info('Getting canvas state');
        try {
          const state = await bridge.sendRequest<GetCanvasStateResult>('get_canvas_state', {});
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get canvas state: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // ============ Perception Tools ============
    tool(
      'get_aria_snapshot',
      'Get the ARIA accessibility tree of a rendered component for understanding structure and verifying accessibility.',
      {
        node_id: z.string().describe('ID of the component to analyze'),
        include_hidden: z.boolean().optional().describe('Include hidden elements. Default: false'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id }, 'Getting ARIA snapshot');
        try {
          const result = await bridge.sendRequest<GetAriaSnapshotResult>('get_aria_snapshot', args);
          return {
            content: [{ type: 'text' as const, text: result.textRepresentation }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get ARIA snapshot: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'get_computed_styles',
      'Get computed CSS styles for elements in a rendered component.',
      {
        node_id: z.string().describe('ID of the component'),
        selector: z.string().optional().describe('CSS selector to target element'),
        properties: z.array(z.string()).optional().describe('Specific CSS properties to retrieve'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id, selector: args.selector }, 'Getting computed styles');
        try {
          const result = await bridge.sendRequest<GetComputedStylesResult>(
            'get_computed_styles',
            args
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result.styles, null, 2) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get computed styles: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'get_element_bounds',
      'Get bounding rectangles for elements in a rendered component.',
      {
        node_id: z.string().describe('ID of the component'),
        selector: z.string().optional().describe('CSS selector to target elements'),
        include_children: z.boolean().optional().describe('Include child elements. Default: false'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id, selector: args.selector }, 'Getting element bounds');
        try {
          const result = await bridge.sendRequest<GetElementBoundsResult>(
            'get_element_bounds',
            args
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get element bounds: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'verify_component',
      'Verify a component renders correctly after modification.',
      {
        node_id: z.string().describe('ID of the component to verify'),
        expected_elements: z.array(z.string()).optional().describe('Elements expected to exist'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id }, 'Verifying component');
        try {
          const result = await bridge.sendRequest<VerifyComponentResult>('verify_component', args);
          const status = result.rendered ? 'SUCCESS' : 'FAILED';
          let text = `Verification ${status}\n${result.ariaSummary}`;
          if (result.errors && result.errors.length > 0) {
            text += `\nErrors: ${result.errors.join(', ')}`;
          }
          return {
            content: [{ type: 'text' as const, text }],
            isError: !result.rendered,
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to verify component: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // ============ Page Composition Tools ============
    tool(
      'create_page',
      'Create a new page composition container for multiple components.',
      {
        name: z.string().describe('Name for the page'),
        layout: z
          .enum(['flex', 'grid', 'absolute'])
          .optional()
          .describe('Layout type. Default: flex'),
        layout_options: z
          .object({
            direction: z.enum(['row', 'column']).optional(),
            gap: z.string().optional(),
            padding: z.string().optional(),
            grid_columns: z.string().optional(),
            grid_rows: z.string().optional(),
            align_items: z.string().optional(),
            justify_content: z.string().optional(),
          })
          .optional()
          .describe('Layout configuration'),
        viewport: z
          .enum(['mobile', 'tablet', 'desktop'])
          .optional()
          .describe('Target viewport. Default: desktop'),
        background: z
          .object({
            color: z.string().optional(),
            gradient: z.string().optional(),
          })
          .optional()
          .describe('Page background'),
        position: z
          .object({
            x: z.number(),
            y: z.number(),
          })
          .optional()
          .describe('Position on canvas'),
      },
      async (args) => {
        logger.info({ name: args.name }, 'Creating page');
        try {
          const result = await bridge.sendRequest<CreatePageResult>('create_page', args);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Created page "${args.name}" with ID: ${result.pageId}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to create page: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'add_to_page',
      'Add an existing component to a page composition.',
      {
        page_id: z.string().describe('ID of the page'),
        component_id: z.string().describe('ID of the component to add'),
        position: z
          .object({
            mode: z.enum(['flow', 'absolute']).optional(),
            grid_area: z.string().optional(),
            flex_grow: z.number().optional(),
            x: z.number().optional(),
            y: z.number().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          })
          .optional()
          .describe('Position within the page'),
        z_index: z.number().optional().describe('Stacking order'),
      },
      async (args) => {
        logger.info({ pageId: args.page_id, componentId: args.component_id }, 'Adding to page');
        try {
          const result = await bridge.sendRequest<AddToPageResult>('add_to_page', args);
          return {
            content: [
              { type: 'text' as const, text: `Added component to page (slot: ${result.slotId})` },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to add to page: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'remove_from_page',
      'Remove a component from a page composition.',
      {
        page_id: z.string().describe('ID of the page'),
        slot_id: z.string().describe('ID of the slot to remove'),
      },
      async (args) => {
        logger.info({ pageId: args.page_id, slotId: args.slot_id }, 'Removing from page');
        try {
          await bridge.sendRequest<RemoveFromPageResult>('remove_from_page', args);
          return {
            content: [{ type: 'text' as const, text: `Removed slot ${args.slot_id} from page` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to remove from page: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'reorder_layers',
      'Change the order of layers within a page.',
      {
        page_id: z.string().describe('ID of the page'),
        slot_id: z.string().describe('ID of the slot to reorder'),
        new_index: z.number().describe('New position index (0 = first/bottom)'),
        z_index: z.number().optional().describe('Optional explicit z-index'),
      },
      async (args) => {
        logger.info(
          { pageId: args.page_id, slotId: args.slot_id, newIndex: args.new_index },
          'Reordering layers'
        );
        try {
          await bridge.sendRequest<ReorderLayersResult>('reorder_layers', args);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Reordered slot ${args.slot_id} to index ${String(args.new_index)}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to reorder layers: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'update_layout',
      'Update the layout configuration of a page.',
      {
        page_id: z.string().describe('ID of the page'),
        layout: z.enum(['flex', 'grid', 'absolute']).optional().describe('New layout type'),
        layout_options: z
          .object({
            direction: z.enum(['row', 'column']).optional(),
            gap: z.string().optional(),
            padding: z.string().optional(),
            grid_columns: z.string().optional(),
            grid_rows: z.string().optional(),
            align_items: z.string().optional(),
            justify_content: z.string().optional(),
            wrap: z.boolean().optional(),
          })
          .optional()
          .describe('Layout options to update'),
      },
      async (args) => {
        logger.info({ pageId: args.page_id }, 'Updating layout');
        try {
          await bridge.sendRequest<UpdateLayoutResult>('update_layout', args);
          return {
            content: [{ type: 'text' as const, text: `Updated layout for page ${args.page_id}` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to update layout: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'update_page_slot',
      'Update position or properties of a component slot within a page.',
      {
        page_id: z.string().describe('ID of the page'),
        slot_id: z.string().describe('ID of the slot'),
        position: z
          .object({
            mode: z.enum(['flow', 'absolute']).optional(),
            grid_area: z.string().optional(),
            flex_grow: z.number().optional(),
            x: z.number().optional(),
            y: z.number().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          })
          .optional()
          .describe('New position configuration'),
        z_index: z.number().optional().describe('New z-index'),
        visible: z.boolean().optional().describe('Visibility toggle'),
      },
      async (args) => {
        logger.info({ pageId: args.page_id, slotId: args.slot_id }, 'Updating page slot');
        try {
          await bridge.sendRequest<UpdatePageSlotResult>('update_page_slot', args);
          return {
            content: [{ type: 'text' as const, text: `Updated slot ${args.slot_id}` }],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to update page slot: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // ============ AI Design Generation Tools ============
    tool(
      'generate_variants',
      'Generate 3 distinct design variants of a UI concept. Creates 3 separate, fully complete React components positioned side-by-side on the canvas.',
      {
        concept: z.string().describe('What to design (e.g., "pricing card", "login form")'),
        context: z
          .string()
          .optional()
          .describe('Optional context about the product, brand, or use case'),
        styles: z.array(z.string()).optional().describe('Optional: 3 style directions to explore'),
        base_position: z
          .object({
            x: z.number().describe('Starting X position for first variant'),
            y: z.number().describe('Y position for all variants'),
          })
          .optional()
          .describe('Optional starting position. Variants will be placed 420px apart.'),
      },
      async (args) => {
        logger.info({ concept: args.concept }, 'Generating variants');
        try {
          const result = await bridge.sendRequest<GenerateVariantsResult>(
            'generate_variants',
            args
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Generated 3 variants: ${result.nodeIds.join(', ')}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to generate variants: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'iterate_design',
      'Create an improved version of an existing component based on natural language feedback.',
      {
        node_id: z.string().describe('ID of the component to iterate on'),
        instruction: z.string().describe('Natural language instruction for improvement'),
        create_new: z
          .boolean()
          .optional()
          .describe('If true (default), creates a new component next to the original'),
      },
      async (args) => {
        logger.info({ nodeId: args.node_id, instruction: args.instruction }, 'Iterating design');
        try {
          const result = await bridge.sendRequest<IterateDesignResult>('iterate_design', args);
          const action = result.createdNew ? 'Created new iteration' : 'Updated';
          return {
            content: [
              {
                type: 'text' as const,
                text: `${action} ${result.nodeId} from ${args.node_id}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to iterate design: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    tool(
      'create_layout',
      'Create a complete page layout with multiple components at once.',
      {
        type: z
          .enum([
            'landing',
            'dashboard',
            'auth',
            'settings',
            'profile',
            'pricing',
            'blog',
            'custom',
          ])
          .describe('Type of layout to create'),
        sections: z.array(z.string()).optional().describe('Sections to include'),
        style: z.string().optional().describe('Overall style direction'),
        context: z.string().optional().describe('Context about the product/brand'),
      },
      async (args) => {
        logger.info({ type: args.type }, 'Creating layout');
        try {
          const result = await bridge.sendRequest<CreateLayoutResult>('create_layout', args);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Created ${args.type} layout with ${String(result.nodeIds.length)} sections: ${result.sections.join(', ')}`,
              },
            ],
          };
        } catch (error: unknown) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to create layout: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),
  ];

  logger.info({ toolCount: tools.length }, 'Creating Canvas MCP server');

  return createSdkMcpServer({
    name: 'snowflake-canvas',
    version: '1.0.0',
    tools,
  });
}

/**
 * Get list of canvas tool names for SDK allowedTools configuration
 */
export function getCanvasToolNames(): string[] {
  return [
    'mcp__snowflake-canvas__create_component',
    'mcp__snowflake-canvas__update_component',
    'mcp__snowflake-canvas__delete_component',
    'mcp__snowflake-canvas__connect_components',
    'mcp__snowflake-canvas__move_component',
    'mcp__snowflake-canvas__get_canvas_state',
    'mcp__snowflake-canvas__get_aria_snapshot',
    'mcp__snowflake-canvas__get_computed_styles',
    'mcp__snowflake-canvas__get_element_bounds',
    'mcp__snowflake-canvas__verify_component',
    'mcp__snowflake-canvas__create_page',
    'mcp__snowflake-canvas__add_to_page',
    'mcp__snowflake-canvas__remove_from_page',
    'mcp__snowflake-canvas__reorder_layers',
    'mcp__snowflake-canvas__update_layout',
    'mcp__snowflake-canvas__update_page_slot',
    'mcp__snowflake-canvas__generate_variants',
    'mcp__snowflake-canvas__iterate_design',
    'mcp__snowflake-canvas__create_layout',
  ];
}
