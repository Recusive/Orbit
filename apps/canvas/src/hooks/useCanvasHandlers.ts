/**
 * useCanvasHandlers Hook
 *
 * Handles ReactFlow canvas event handlers for the design canvas.
 * Extracted from CanvasApp.tsx for better separation of concerns.
 *
 * Responsibilities:
 * - Node drag stop handling (with reparenting logic)
 * - Connection creation
 * - Pane interactions (double-click, context menu)
 * - Drag and drop from component library
 */

import { addEdge } from '@xyflow/react';
import { useCallback } from 'react';

import {
  findContainingFrameForRect,
  isShapeType,
  toFrameRelative,
  getAbsoluteBounds,
} from '../lib/frameDetection';

import type { CanvasActions } from './useCanvasActions';
import type { UseDesignTreeReturn } from './useDesignTree';
import type { IndexedComponent } from '../lib/componentLibraryTypes';
import type { SandpackNodeData } from '../sandpack/SandpackNode';
import type { Connection, Node, Edge } from '@xyflow/react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCanvasHandlersOptions {
  /** Design tree state and actions */
  designTree: UseDesignTreeReturn;
  /** ReactFlow setNodes function */
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  /** ReactFlow setEdges function */
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** Canvas actions hook */
  canvasActions: CanvasActions;
  /** Function to convert screen coordinates to flow position */
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  /** Set component menu visibility */
  setShowComponentMenu: React.Dispatch<React.SetStateAction<boolean>>;
  /** Set component menu position */
  setMenuPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  /** Set context menu state */
  setContextMenu: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; position: { x: number; y: number }; nodeId?: string }>
  >;
}

export interface UseCanvasHandlersReturn {
  /** Handle node drag stop - updates position and handles reparenting */
  handleNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  /** Handle new connections between nodes */
  onConnect: (connection: Connection) => void;
  /** Handle double-click on canvas pane */
  handlePaneDoubleClick: (event: React.MouseEvent) => void;
  /** Handle right-click context menu on node */
  handleNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  /** Handle drag over for drop targets */
  handleDragOver: (event: React.DragEvent) => void;
  /** Handle drop from component library */
  handleDrop: (event: React.DragEvent) => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useCanvasHandlers(options: UseCanvasHandlersOptions): UseCanvasHandlersReturn {
  const {
    designTree,
    setNodes,
    setEdges,
    canvasActions,
    screenToFlowPosition,
    setShowComponentMenu,
    setMenuPosition,
    setContextMenu,
  } = options;

  /**
   * Handle node drag stop.
   * Converts absolute position back to relative for child nodes.
   * Also handles reparenting when shapes are dragged into different frames.
   */
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node): void => {
      // Only handle design nodes
      if (!node.id.startsWith('design-')) return;

      const designId = node.id.slice(7);
      const designNode = designTree.tree.nodes.get(designId);
      if (designNode === undefined) return;

      // Get the node's absolute bounds after drag
      const absoluteBounds = {
        x: node.position.x,
        y: node.position.y,
        width: designNode.width,
        height: designNode.height,
      };

      // For shapes, check if they need to be reparented
      if (isShapeType(designNode.type)) {
        // Find the containing frame at the new position
        const containingFrame = findContainingFrameForRect(designTree.tree, absoluteBounds);
        const newParentId = containingFrame?.id ?? null;

        // Check if parent changed
        if (newParentId !== designNode.parentId) {
          if (newParentId !== null) {
            // Reparent to new frame - convert to frame-relative coordinates
            const relativeCoords = toFrameRelative(designTree.tree, absoluteBounds, newParentId);
            if (relativeCoords !== null) {
              // First update position, then move
              designTree.updateNode(designId, {
                x: relativeCoords.x,
                y: relativeCoords.y,
              });
              // Move to new parent (at end of children list)
              const newParent = designTree.tree.nodes.get(newParentId);
              const insertIndex = newParent?.children.length ?? 0;
              designTree.dispatch({
                type: 'MOVE_NODE',
                nodeId: designId,
                newParentId,
                index: insertIndex,
              });
            }
          } else {
            // Shape dragged outside all frames - keep in current parent but update position
            // Shapes must stay in frames, so we don't allow moving to root
            if (designNode.parentId !== null) {
              const parentBounds = getAbsoluteBounds(designTree.tree, designNode.parentId);
              if (parentBounds !== null) {
                designTree.updateNode(designId, {
                  x: node.position.x - parentBounds.x,
                  y: node.position.y - parentBounds.y,
                });
              }
            }
          }
          return;
        }
      }

      // For containers (frames, layers) or shapes that didn't change parent,
      // just update position relative to current parent
      if (designNode.parentId !== null) {
        // Get parent's absolute position
        const parentBounds = getAbsoluteBounds(designTree.tree, designNode.parentId);
        if (parentBounds !== null) {
          designTree.updateNode(designId, {
            x: node.position.x - parentBounds.x,
            y: node.position.y - parentBounds.y,
          });
        }
      } else {
        // Root node - use absolute position directly
        designTree.updateNode(designId, {
          x: node.position.x,
          y: node.position.y,
        });
      }
    },
    [designTree]
  );

  /**
   * Handle new connections between nodes.
   */
  const onConnect = useCallback(
    (connection: Connection): void => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  /**
   * Handle double-click on canvas pane to open component menu.
   */
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent): void => {
      setMenuPosition({ x: event.clientX, y: event.clientY });
      setShowComponentMenu(true);
    },
    [setMenuPosition, setShowComponentMenu]
  );

  /**
   * Handle right-click context menu on a node.
   */
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node): void => {
      event.preventDefault();
      setContextMenu({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
        nodeId: node.id,
      });
    },
    [setContextMenu]
  );

  /**
   * Handle drag over for drop targets.
   */
  const handleDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Handle drop from component library or component menu.
   */
  const handleDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Check for library component drop first
      const libraryComponentData = event.dataTransfer.getData('application/component-library');
      if (libraryComponentData) {
        try {
          const component = JSON.parse(libraryComponentData) as IndexedComponent;
          // Add to design tree for sync
          designTree.addComponent(component.name, component.code);
          // Create sandpack node at drop position
          const newNode: Node = {
            id: `${component.id}-${String(Date.now())}`,
            type: 'sandpack',
            position,
            data: {
              label: component.name,
              code: component.code,
              viewport: 'desktop',
              showCode: false,
            } as SandpackNodeData,
          };
          setNodes((nds) => [...nds, newNode]);
          return;
        } catch {
          // Fall through to component menu handling if parsing fails
        }
      }

      // Fall back to component menu handling
      const componentType = event.dataTransfer.getData('application/reactflow');
      if (!componentType) return;

      canvasActions.handleAddNode(componentType, position);
    },
    [screenToFlowPosition, canvasActions, designTree, setNodes]
  );

  return {
    handleNodeDragStop,
    onConnect,
    handlePaneDoubleClick,
    handleNodeContextMenu,
    handleDragOver,
    handleDrop,
  };
}
