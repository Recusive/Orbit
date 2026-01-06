/**
 * Hook for handling canvas tool executions from the AI agent
 */
import { useCallback } from 'react';

import type { SandpackNodeData } from '../sandpack/SandpackNode';
import type {
  CanvasToolData,
  AriaSnapshotResult,
  ComputedStylesResult,
  ElementBoundsResult,
  VerifyResult,
} from '../types/ipcProtocol';
import type { PageNodeData } from '../types/pageTypes';
import type { Node, Edge } from '@xyflow/react';

export interface UseCanvasToolExecutionOptions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  sendPerceptionRequest: (
    nodeId: string,
    requestType: string,
    params: Record<string, unknown>
  ) => Promise<unknown>;
  sendPerceptionResult: (
    requestId: string,
    toolName: string,
    nodeId: string,
    result: unknown
  ) => void;
}

export interface UseCanvasToolExecutionReturn {
  handleCanvasToolExecute: (toolData: CanvasToolData) => void;
}

export function useCanvasToolExecution({
  setNodes,
  setEdges,
  sendPerceptionRequest,
  sendPerceptionResult,
}: UseCanvasToolExecutionOptions): UseCanvasToolExecutionReturn {
  const handleCanvasToolExecute = useCallback(
    (toolData: CanvasToolData): void => {
      switch (toolData.tool) {
        case 'create_component': {
          const { nodeId, name, code, position } = toolData.data;
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
          break;
        }

        case 'update_component': {
          const { nodeId, code, name } = toolData.data;
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
          break;
        }

        case 'delete_component': {
          const { nodeId } = toolData.data;
          setNodes((nds) => nds.filter((n) => n.id !== nodeId));
          setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
          break;
        }

        case 'connect_components': {
          const { edgeId, sourceId, targetId } = toolData.data;
          const newEdge: Edge = {
            id: edgeId,
            source: sourceId,
            target: targetId,
          };
          setEdges((eds) => [...eds, newEdge]);
          break;
        }

        case 'move_component': {
          const { nodeId, position } = toolData.data;
          setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, position } : n)));
          break;
        }

        // === Perception Tools ===
        // These tools query the rendered Sandpack iframe for DOM/accessibility information

        case 'get_aria_snapshot': {
          const { nodeId, includeHidden, requestId } = toolData.data;
          void sendPerceptionRequest(nodeId, 'get-aria-snapshot', { includeHidden })
            .then((result) => {
              sendPerceptionResult(
                requestId,
                'get_aria_snapshot',
                nodeId,
                result as AriaSnapshotResult
              );
            })
            .catch((error: unknown) => {
              sendPerceptionResult(requestId, 'get_aria_snapshot', nodeId, {
                ariaTree: { role: 'generic' },
                textRepresentation: `Error: ${error instanceof Error ? error.message : String(error)}`,
                elementCount: 0,
              } as AriaSnapshotResult);
            });
          break;
        }

        case 'get_computed_styles': {
          const { nodeId, selector, properties, requestId } = toolData.data;
          void sendPerceptionRequest(nodeId, 'get-computed-styles', { selector, properties })
            .then((result) => {
              sendPerceptionResult(
                requestId,
                'get_computed_styles',
                nodeId,
                result as ComputedStylesResult
              );
            })
            .catch(() => {
              sendPerceptionResult(requestId, 'get_computed_styles', nodeId, {
                selector: selector ?? ':root',
                matchCount: 0,
                styles: {},
              } as ComputedStylesResult);
            });
          break;
        }

        case 'get_element_bounds': {
          const { nodeId, selector, includeChildren, requestId } = toolData.data;
          void sendPerceptionRequest(nodeId, 'get-element-bounds', { selector, includeChildren })
            .then((result) => {
              sendPerceptionResult(
                requestId,
                'get_element_bounds',
                nodeId,
                result as ElementBoundsResult
              );
            })
            .catch(() => {
              sendPerceptionResult(requestId, 'get_element_bounds', nodeId, {
                elements: [],
                viewport: { width: 0, height: 0 },
              } as ElementBoundsResult);
            });
          break;
        }

        case 'verify_component': {
          const { nodeId, expectedElements, requestId } = toolData.data;
          void sendPerceptionRequest(nodeId, 'verify-component', { expectedElements })
            .then((result) => {
              sendPerceptionResult(requestId, 'verify_component', nodeId, result as VerifyResult);
            })
            .catch((error: unknown) => {
              sendPerceptionResult(requestId, 'verify_component', nodeId, {
                rendered: false,
                errors: [error instanceof Error ? error.message : String(error)],
                ariaSummary: 'Verification failed',
              } as VerifyResult);
            });
          break;
        }

        // === Page Composition Tools ===

        case 'create_page': {
          const { pageId, name, layout, layoutOptions, viewport, background, position } =
            toolData.data;
          const pageData: PageNodeData = {
            name: name ?? 'New Page',
            layout: {
              type: layout ?? 'flex',
              direction: layoutOptions?.direction ?? 'column',
              gap: layoutOptions?.gap ?? '16px',
              padding: layoutOptions?.padding ?? '24px',
              ...(layoutOptions?.alignItems !== undefined
                ? { alignItems: layoutOptions.alignItems }
                : {}),
              ...(layoutOptions?.justifyContent !== undefined
                ? { justifyContent: layoutOptions.justifyContent }
                : {}),
              ...(layout === 'grid' && layoutOptions?.gridColumns
                ? {
                    gridTemplate: {
                      columns: layoutOptions.gridColumns,
                      rows: layoutOptions.gridRows ?? 'auto',
                      ...(layoutOptions.gridAreas !== undefined
                        ? { areas: layoutOptions.gridAreas }
                        : {}),
                    },
                  }
                : {}),
            },
            viewport: viewport ?? 'desktop',
            ...(background !== undefined
              ? {
                  background: {
                    ...(background.color !== undefined ? { color: background.color } : {}),
                    ...(background.gradient !== undefined ? { gradient: background.gradient } : {}),
                  },
                }
              : {}),
            slots: [],
          };
          const newPage: Node = {
            id: pageId,
            type: 'page',
            position: (position as { x: number; y: number } | undefined) ?? { x: 100, y: 100 },
            data: pageData,
          };
          setNodes((nds) => [...nds, newPage]);
          break;
        }

        case 'add_to_page': {
          const { pageId, componentId, slotId, position: slotPosition, zIndex } = toolData.data;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== pageId || n.type !== 'page') return n;
              const pageData = n.data as PageNodeData;
              const newSlot = {
                id: slotId ?? `slot-${String(Date.now())}`,
                layerId: `layer-${componentId}`,
                componentId: componentId,
                position: {
                  mode: slotPosition?.mode ?? 'flow',
                  gridArea: slotPosition?.gridArea,
                  flexGrow: slotPosition?.flexGrow,
                  x: slotPosition?.x,
                  y: slotPosition?.y,
                  width: slotPosition?.width,
                  height: slotPosition?.height,
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
          break;
        }

        case 'remove_from_page': {
          const { pageId, slotId } = toolData.data;
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
          break;
        }

        case 'reorder_layers': {
          const { pageId, slotId, newIndex, zIndex: newZIndex } = toolData.data;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== pageId || n.type !== 'page') return n;
              const pageData = n.data as PageNodeData;
              const slotIndex = pageData.slots.findIndex((s) => s.id === slotId);
              if (slotIndex === -1) return n;

              const slots = [...pageData.slots];
              const [slot] = slots.splice(slotIndex, 1);
              if (slot !== undefined) {
                slot.zIndex = newZIndex ?? newIndex;
                slots.splice(newIndex, 0, slot);
              }

              // Recompute z-indices based on order if not explicitly set
              if (newZIndex === undefined) {
                slots.forEach((s, i) => {
                  s.zIndex = i;
                });
              }

              return { ...n, data: { ...pageData, slots } };
            })
          );
          break;
        }

        case 'update_layout': {
          const { pageId, layout, layoutOptions } = toolData.data;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== pageId || n.type !== 'page') return n;
              const pageData = n.data as PageNodeData;
              const updatedLayout = { ...pageData.layout };

              if (layout) updatedLayout.type = layout;
              if (layoutOptions?.direction) updatedLayout.direction = layoutOptions.direction;
              if (layoutOptions?.gap) updatedLayout.gap = layoutOptions.gap;
              if (layoutOptions?.padding) updatedLayout.padding = layoutOptions.padding;
              if (layoutOptions?.alignItems) updatedLayout.alignItems = layoutOptions.alignItems;
              if (layoutOptions?.justifyContent)
                updatedLayout.justifyContent = layoutOptions.justifyContent;
              if (layoutOptions?.wrap !== undefined) updatedLayout.wrap = layoutOptions.wrap;
              if (layoutOptions?.gridColumns || layoutOptions?.gridRows) {
                const areas = layoutOptions.gridAreas ?? pageData.layout.gridTemplate?.areas;
                updatedLayout.gridTemplate = {
                  columns:
                    layoutOptions.gridColumns ?? pageData.layout.gridTemplate?.columns ?? '1fr',
                  rows: layoutOptions.gridRows ?? pageData.layout.gridTemplate?.rows ?? 'auto',
                  ...(areas !== undefined ? { areas } : {}),
                };
              }

              return { ...n, data: { ...pageData, layout: updatedLayout } };
            })
          );
          break;
        }

        case 'update_page_slot': {
          const { pageId, slotId, position: slotPosition, zIndex, visible } = toolData.data;
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
          break;
        }
      }
    },
    [setNodes, setEdges, sendPerceptionRequest, sendPerceptionResult]
  );

  return { handleCanvasToolExecute };
}
