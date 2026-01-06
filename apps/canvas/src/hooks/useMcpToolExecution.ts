/**
 * Hook for handling MCP tool execution requests from the extension
 * This is the new architecture that properly integrates with Claude Agent SDK
 */
import { useCallback, useRef, useEffect } from 'react';

import type { SandpackNodeData } from '../sandpack/SandpackNode';
import type { McpToolRequest } from '../types/ipcProtocol';
import type { PageNodeData } from '../types/pageTypes';
import type { Node, Edge } from '@xyflow/react';

export interface UseMcpToolExecutionOptions {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  sendMcpToolResponse: (
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: string
  ) => void;
  sendPerceptionRequest: (
    nodeId: string,
    requestType: string,
    params: Record<string, unknown>
  ) => Promise<unknown>;
}

export interface UseMcpToolExecutionReturn {
  handleMcpToolRequest: (request: McpToolRequest) => void;
}

export function useMcpToolExecution({
  nodes,
  edges,
  setNodes,
  setEdges,
  sendMcpToolResponse,
  sendPerceptionRequest,
}: UseMcpToolExecutionOptions): UseMcpToolExecutionReturn {
  // Use refs to access current state without causing callback recreation
  // This prevents the infinite loop where state changes → callback recreates → effects trigger
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const sendMcpToolResponseRef = useRef(sendMcpToolResponse);
  const sendPerceptionRequestRef = useRef(sendPerceptionRequest);

  // Keep refs in sync with current values
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    sendMcpToolResponseRef.current = sendMcpToolResponse;
  }, [sendMcpToolResponse]);

  useEffect(() => {
    sendPerceptionRequestRef.current = sendPerceptionRequest;
  }, [sendPerceptionRequest]);

  const handleMcpToolRequest = useCallback(
    (request: McpToolRequest): void => {
      const { requestId, tool: rawTool, args } = request;

      // Normalize tool name - strip MCP prefix if present (e.g., "mcp__orbit-canvas__create_component" -> "create_component")
      const tool = rawTool.replace(/^mcp__[^_]+__/, '');

      try {
        switch (tool) {
          // ============ Component Tools ============
          case 'create_component': {
            const nodeId = `sandpack-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
            const name = args['name'] as string;
            const code = args['code'] as string;
            const position =
              (args['position'] as { x: number; y: number } | undefined) ??
              calculateSmartPosition(nodesRef.current);

            const newNode: Node = {
              id: nodeId,
              type: 'sandpack',
              position,
              data: {
                label: name,
                code,
                viewport: 'desktop',
                showCode: false,
              } as SandpackNodeData,
            };
            setNodes((nds) => [...nds, newNode]);
            sendMcpToolResponseRef.current(requestId, true, { nodeId });
            break;
          }

          case 'update_component': {
            const nodeId = args['node_id'] as string;
            const code = args['code'] as string;
            const name = args['name'] as string | undefined;

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        code,
                        ...(name ? { label: name } : {}),
                      },
                    }
                  : n
              )
            );
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'delete_component': {
            const nodeId = args['node_id'] as string;
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'connect_components': {
            const edgeId = `edge-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
            const sourceId = args['source_id'] as string;
            const targetId = args['target_id'] as string;

            const newEdge: Edge = {
              id: edgeId,
              source: sourceId,
              target: targetId,
            };
            setEdges((eds) => [...eds, newEdge]);
            sendMcpToolResponseRef.current(requestId, true, { edgeId });
            break;
          }

          case 'move_component': {
            const nodeId = args['node_id'] as string;
            const position = args['position'] as { x: number; y: number };

            setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, position } : n)));
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'get_canvas_state': {
            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;
            const componentNodes = currentNodes.filter((n) => n.type === 'sandpack' || !n.type);
            const pageNodes = currentNodes.filter((n) => n.type === 'page');

            const stateResult = {
              nodes: componentNodes.map((n) => {
                const data = n.data as SandpackNodeData;
                return {
                  id: n.id,
                  name: (data.label as string | undefined) ?? 'Component',
                  position: n.position,
                  code: (data.code as string | undefined) ?? '',
                };
              }),
              edges: currentEdges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
              })),
              pages: pageNodes.map((n) => {
                const data = n.data as PageNodeData;
                return {
                  id: n.id,
                  name: (data.name as string | undefined) ?? 'Page',
                  position: n.position,
                  layout: {
                    type: (data.layout.type as 'flex' | 'grid' | 'stack' | undefined) ?? 'flex',
                    direction: data.layout.direction,
                    gap: data.layout.gap,
                    padding: data.layout.padding,
                  },
                  viewport: (data.viewport as string | undefined) ?? 'desktop',
                  slots: ((data.slots as typeof data.slots | undefined) ?? []).map((slot) => ({
                    id: slot.id,
                    componentId: slot.componentId,
                    zIndex: (slot.zIndex as number | undefined) ?? 0,
                  })),
                };
              }),
            };
            sendMcpToolResponseRef.current(requestId, true, stateResult);
            break;
          }

          // ============ Perception Tools ============
          case 'get_aria_snapshot': {
            const nodeId = args['node_id'] as string;
            const includeHidden = (args['include_hidden'] as boolean | undefined) ?? false;

            void sendPerceptionRequestRef
              .current(nodeId, 'get-aria-snapshot', { includeHidden })
              .then((result) => {
                sendMcpToolResponseRef.current(requestId, true, result);
              })
              .catch((error: unknown) => {
                sendMcpToolResponseRef.current(
                  requestId,
                  false,
                  undefined,
                  error instanceof Error ? error.message : String(error)
                );
              });
            break;
          }

          case 'get_computed_styles': {
            const nodeId = args['node_id'] as string;
            const selector = args['selector'] as string | undefined;
            const properties = args['properties'] as string[] | undefined;

            void sendPerceptionRequestRef
              .current(nodeId, 'get-computed-styles', { selector, properties })
              .then((result) => {
                sendMcpToolResponseRef.current(requestId, true, result);
              })
              .catch((error: unknown) => {
                sendMcpToolResponseRef.current(
                  requestId,
                  false,
                  undefined,
                  error instanceof Error ? error.message : String(error)
                );
              });
            break;
          }

          case 'get_element_bounds': {
            const nodeId = args['node_id'] as string;
            const selector = args['selector'] as string | undefined;
            const includeChildren = (args['include_children'] as boolean | undefined) ?? false;

            void sendPerceptionRequestRef
              .current(nodeId, 'get-element-bounds', { selector, includeChildren })
              .then((result) => {
                sendMcpToolResponseRef.current(requestId, true, result);
              })
              .catch((error: unknown) => {
                sendMcpToolResponseRef.current(
                  requestId,
                  false,
                  undefined,
                  error instanceof Error ? error.message : String(error)
                );
              });
            break;
          }

          case 'verify_component': {
            const nodeId = args['node_id'] as string;
            const expectedElements = args['expected_elements'] as string[] | undefined;

            void sendPerceptionRequestRef
              .current(nodeId, 'verify-component', { expectedElements })
              .then((result) => {
                sendMcpToolResponseRef.current(requestId, true, result);
              })
              .catch((error: unknown) => {
                sendMcpToolResponseRef.current(
                  requestId,
                  false,
                  undefined,
                  error instanceof Error ? error.message : String(error)
                );
              });
            break;
          }

          // ============ Page Composition Tools ============
          case 'create_page': {
            const pageId = `page-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
            const name = (args['name'] as string | undefined) ?? 'New Page';
            const layout = (args['layout'] as string | undefined) ?? 'flex';
            const layoutOptions =
              (args['layout_options'] as Record<string, unknown> | undefined) ?? {};
            const viewport = (args['viewport'] as string | undefined) ?? 'desktop';
            const background = args['background'] as Record<string, unknown> | undefined;
            const position =
              (args['position'] as { x: number; y: number } | undefined) ??
              calculateSmartPosition(nodesRef.current);

            const pageData: PageNodeData = {
              name,
              layout: {
                type: layout as 'flex' | 'grid' | 'stack',
                ...(layoutOptions['direction'] !== undefined && {
                  direction: layoutOptions['direction'] as 'row' | 'column',
                }),
                ...(layoutOptions['gap'] !== undefined && { gap: layoutOptions['gap'] as string }),
                ...(layoutOptions['padding'] !== undefined && {
                  padding: layoutOptions['padding'] as string,
                }),
                ...(layoutOptions['align_items'] !== undefined && {
                  alignItems: layoutOptions['align_items'] as string,
                }),
                ...(layoutOptions['justify_content'] !== undefined && {
                  justifyContent: layoutOptions['justify_content'] as string,
                }),
              },
              viewport: viewport as 'mobile' | 'tablet' | 'desktop',
              ...(background && {
                background: {
                  ...(background['color'] !== undefined && {
                    color: background['color'] as string,
                  }),
                  ...(background['gradient'] !== undefined && {
                    gradient: background['gradient'] as string,
                  }),
                },
              }),
              slots: [],
            };

            const newPage: Node = {
              id: pageId,
              type: 'page',
              position,
              data: pageData,
            };
            setNodes((nds) => [...nds, newPage]);
            sendMcpToolResponseRef.current(requestId, true, { pageId });
            break;
          }

          case 'add_to_page': {
            const pageId = args['page_id'] as string;
            const componentId = args['component_id'] as string;
            const slotPosition = args['position'] as Record<string, unknown> | undefined;
            const zIndex = args['z_index'] as number | undefined;
            const slotId = `slot-${String(Date.now())}`;

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== pageId || n.type !== 'page') return n;
                const pageData = n.data as PageNodeData;
                const newSlot = {
                  id: slotId,
                  layerId: `layer-${componentId}`,
                  componentId,
                  position: {
                    mode: (slotPosition?.['mode'] as 'flow' | 'absolute' | undefined) ?? 'flow',
                    gridArea: slotPosition?.['grid_area'] as string | undefined,
                    flexGrow: slotPosition?.['flex_grow'] as number | undefined,
                    x: slotPosition?.['x'] as number | undefined,
                    y: slotPosition?.['y'] as number | undefined,
                    width: slotPosition?.['width'] as string | undefined,
                    height: slotPosition?.['height'] as string | undefined,
                  },
                  zIndex: zIndex ?? pageData.slots.length,
                  visible: true,
                };
                return {
                  ...n,
                  data: {
                    ...pageData,
                    slots: [...pageData.slots, newSlot],
                  },
                };
              })
            );
            sendMcpToolResponseRef.current(requestId, true, { slotId });
            break;
          }

          case 'remove_from_page': {
            const pageId = args['page_id'] as string;
            const slotId = args['slot_id'] as string;

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== pageId || n.type !== 'page') return n;
                const pageData = n.data as PageNodeData;
                return {
                  ...n,
                  data: {
                    ...pageData,
                    slots: pageData.slots.filter((s) => s.id !== slotId),
                  },
                };
              })
            );
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'reorder_layers': {
            const pageId = args['page_id'] as string;
            const slotId = args['slot_id'] as string;
            const newIndex = args['new_index'] as number;
            const newZIndex = args['z_index'] as number | undefined;

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== pageId || n.type !== 'page') return n;
                const pageData = n.data as PageNodeData;
                const slotIndex = pageData.slots.findIndex((s) => s.id === slotId);
                if (slotIndex === -1) return n;

                const slots = [...pageData.slots];
                const [slot] = slots.splice(slotIndex, 1);
                if (slot === undefined)
                  throw new Error(`Slot not found at index ${String(slotIndex)}`);
                slot.zIndex = newZIndex ?? newIndex;
                slots.splice(newIndex, 0, slot);

                if (newZIndex === undefined) {
                  slots.forEach((s, i) => {
                    s.zIndex = i;
                  });
                }

                return { ...n, data: { ...pageData, slots } };
              })
            );
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'update_layout': {
            const pageId = args['page_id'] as string;
            const layout = args['layout'] as string | undefined;
            const layoutOptions = args['layout_options'] as Record<string, unknown> | undefined;

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== pageId || n.type !== 'page') return n;
                const pageData = n.data as PageNodeData;
                const updatedLayout = { ...pageData.layout };

                if (layout !== undefined) updatedLayout.type = layout as 'flex' | 'grid' | 'stack';
                if (layoutOptions?.['direction'] !== undefined)
                  updatedLayout.direction = layoutOptions['direction'] as 'row' | 'column';
                if (layoutOptions?.['gap'] !== undefined)
                  updatedLayout.gap = layoutOptions['gap'] as string;
                if (layoutOptions?.['padding'] !== undefined)
                  updatedLayout.padding = layoutOptions['padding'] as string;
                if (layoutOptions?.['align_items'] !== undefined)
                  updatedLayout.alignItems = layoutOptions['align_items'] as string;
                if (layoutOptions?.['justify_content'] !== undefined)
                  updatedLayout.justifyContent = layoutOptions['justify_content'] as string;
                if (layoutOptions?.['wrap'] !== undefined)
                  updatedLayout.wrap = layoutOptions['wrap'] as boolean;
                if (
                  (layoutOptions?.['grid_columns'] !== undefined &&
                    layoutOptions['grid_columns'] !== null) ||
                  (layoutOptions?.['grid_rows'] !== undefined &&
                    layoutOptions['grid_rows'] !== null)
                ) {
                  const gridAreas =
                    (layoutOptions['grid_areas'] as string[] | undefined) ??
                    pageData.layout.gridTemplate?.areas;
                  updatedLayout.gridTemplate = {
                    columns: (layoutOptions['grid_columns'] ??
                      pageData.layout.gridTemplate?.columns ??
                      '1fr') as string,
                    rows: (layoutOptions['grid_rows'] ??
                      pageData.layout.gridTemplate?.rows ??
                      'auto') as string,
                    ...(gridAreas !== undefined && { areas: gridAreas }),
                  };
                }

                return { ...n, data: { ...pageData, layout: updatedLayout } };
              })
            );
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          case 'update_page_slot': {
            const pageId = args['page_id'] as string;
            const slotId = args['slot_id'] as string;
            const slotPosition = args['position'] as Record<string, unknown> | undefined;
            const zIndex = args['z_index'] as number | undefined;
            const visible = args['visible'] as boolean | undefined;

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== pageId || n.type !== 'page') return n;
                const pageData = n.data as PageNodeData;
                return {
                  ...n,
                  data: {
                    ...pageData,
                    slots: pageData.slots.map((s) => {
                      if (s.id !== slotId) return s;
                      return {
                        ...s,
                        ...(slotPosition ? { position: { ...s.position, ...slotPosition } } : {}),
                        ...(zIndex !== undefined ? { zIndex } : {}),
                        ...(visible !== undefined ? { visible } : {}),
                      };
                    }),
                  },
                };
              })
            );
            sendMcpToolResponseRef.current(requestId, true, { success: true });
            break;
          }

          // ============ AI Design Generation Tools ============
          // These tools return instructions for the AI to follow

          case 'generate_variants': {
            const concept = args['concept'] as string;
            const context = args['context'] as string | undefined;
            const styles = args['styles'] as string[] | undefined;
            const basePosition = args['base_position'] as { x: number; y: number } | undefined;

            const baseX = basePosition?.x ?? 100;
            const baseY = basePosition?.y ?? 100;
            const spacing = 420;

            const styleDirections = styles ?? ['Minimal', 'Bold', 'Creative'];

            sendMcpToolResponseRef.current(requestId, true, {
              success: true,
              message: `Generate 3 variants for "${concept}"`,
              instructions: {
                action: 'Create 3 separate components using create_component',
                variants: [
                  {
                    name: `${concept} - ${styleDirections[0] ?? 'Minimal'}`,
                    position: { x: baseX, y: baseY },
                    style: styleDirections[0],
                    guidance:
                      'Clean, minimal design with lots of whitespace, subtle colors, thin borders',
                  },
                  {
                    name: `${concept} - ${styleDirections[1] ?? 'Bold'}`,
                    position: { x: baseX + spacing, y: baseY },
                    style: styleDirections[1],
                    guidance:
                      'Bold, expressive design with strong colors, gradients, prominent shadows',
                  },
                  {
                    name: `${concept} - ${styleDirections[2] ?? 'Creative'}`,
                    position: { x: baseX + spacing * 2, y: baseY },
                    style: styleDirections[2],
                    guidance: 'Creative, unique design with unexpected layout, distinctive colors',
                  },
                ],
                context: context ?? 'General purpose component',
              },
            });
            break;
          }

          case 'iterate_design': {
            const nodeId = args['node_id'] as string;
            const instruction = args['instruction'] as string;
            const createNew = (args['create_new'] as boolean | undefined) ?? true;

            const targetNode = nodesRef.current.find((n) => n.id === nodeId);
            if (!targetNode) {
              sendMcpToolResponseRef.current(
                requestId,
                false,
                undefined,
                `Component not found: ${nodeId}`
              );
              break;
            }

            const nodeData = targetNode.data as SandpackNodeData;
            const currentCode = nodeData.code;

            sendMcpToolResponseRef.current(requestId, true, {
              success: true,
              message: `Iterate on component with instruction: "${instruction}"`,
              instructions: {
                action: createNew
                  ? 'Create new component using create_component'
                  : 'Update using update_component',
                sourceNodeId: nodeId,
                sourceCode: currentCode,
                sourceName: nodeData.label,
                modification: instruction,
                position: createNew
                  ? { x: targetNode.position.x + 420, y: targetNode.position.y }
                  : undefined,
                newName: createNew ? `${nodeData.label} - Iterated` : undefined,
              },
            });
            break;
          }

          case 'create_layout': {
            const layoutType = args['type'] as string;
            const sections = args['sections'] as string[] | undefined;
            const style = args['style'] as string | undefined;
            const context = args['context'] as string | undefined;

            const defaultSections: Record<string, string[]> = {
              landing: ['Header', 'Hero', 'Features', 'Testimonials', 'CTA', 'Footer'],
              dashboard: ['Sidebar', 'TopNav', 'Stats', 'Chart', 'Table'],
              auth: ['Login Form', 'Social Buttons', 'Footer Links'],
              settings: ['Settings Nav', 'Profile Section', 'Preferences', 'Actions'],
              profile: ['Profile Header', 'Stats', 'Activity', 'Settings'],
              pricing: ['Header', 'Pricing Cards', 'FAQ', 'CTA'],
              blog: ['Header', 'Featured Post', 'Post Grid', 'Sidebar', 'Footer'],
            };

            const fallback = ['Section 1', 'Section 2', 'Section 3'];
            const layoutSections = sections ?? defaultSections[layoutType] ?? fallback;

            sendMcpToolResponseRef.current(requestId, true, {
              success: true,
              message: `Create ${layoutType} layout with ${String(layoutSections.length)} sections`,
              instructions: {
                action:
                  'Create multiple components using create_component, then optionally compose with create_page',
                layoutType,
                sections: layoutSections.map((section, index) => ({
                  name: section,
                  position: { x: 100 + (index % 3) * 420, y: 100 + Math.floor(index / 3) * 350 },
                  order: index,
                })),
                style: style ?? 'Clean and modern',
                context: context ?? `${layoutType} page`,
                designSystemGuidance:
                  'Use consistent colors, typography, border-radius, and spacing across all sections',
              },
            });
            break;
          }

          default:
            sendMcpToolResponseRef.current(requestId, false, undefined, `Unknown tool: ${tool}`);
        }
      } catch (error) {
        sendMcpToolResponseRef.current(requestId, false, undefined, String(error));
      }
    },
    [setNodes, setEdges]
  ); // Removed nodes, edges, sendMcpToolResponse, sendPerceptionRequest - using refs instead

  return { handleMcpToolRequest };
}

/**
 * Calculate a smart position for new nodes based on existing nodes
 */
function calculateSmartPosition(nodes: Node[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 100, y: 100 };
  }

  // Find the rightmost node and place new node to its right
  let maxX = 0;
  let avgY = 0;

  for (const node of nodes) {
    maxX = Math.max(maxX, node.position.x + 400);
    avgY += node.position.y;
  }

  avgY = avgY / nodes.length;

  return {
    x: maxX + 50,
    y: avgY,
  };
}
