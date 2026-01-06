/**
 * useDrawingMode Hook
 *
 * Orchestrates drawing tool interactions on the canvas.
 * Extracted from CanvasApp.tsx for better separation of concerns.
 *
 * Responsibilities:
 * - Handle node creation with frame containment enforcement
 * - Mouse event handlers for drawing shapes
 * - Keyboard shortcuts for tool selection
 * - Inline text editing state management
 */

import { useCallback, useEffect, useState } from 'react';

import { findContainingFrameForRect, isShapeType, toFrameRelative } from '../lib/frameDetection';

import type { UseDesignTreeReturn } from './useDesignTree';
import type { UseDrawingToolsReturn } from './useDrawingTools';
import type { DesignNode, TextNode as DesignTextNode } from '../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface UseDrawingModeOptions {
  /** Design tree state and actions */
  designTree: UseDesignTreeReturn;
  /** Drawing tools hook */
  drawingTools: UseDrawingToolsReturn;
  /** Function to convert screen coordinates to flow position */
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
}

export interface UseDrawingModeReturn {
  /** Currently editing text node (for inline editor) */
  editingTextNode: DesignTextNode | null;
  /** Start editing a text node */
  handleStartTextEdit: (nodeId: string) => void;
  /** Save text edits */
  handleSaveTextEdit: (nodeId: string, newContent: string) => void;
  /** Cancel text editing */
  handleCancelTextEdit: () => void;
  /** Handle mouse down on canvas for drawing */
  handleCanvasMouseDown: (event: React.MouseEvent) => void;
  /** Handle mouse move for drawing preview */
  handleCanvasMouseMove: (event: React.MouseEvent) => void;
  /** Handle mouse up to finish drawing */
  handleCanvasMouseUp: () => void;
  /** Callback for when a node is created by drawing tools */
  handleNodeCreated: (node: DesignNode) => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useDrawingMode(options: UseDrawingModeOptions): UseDrawingModeReturn {
  const { designTree, drawingTools, screenToFlowPosition } = options;

  // Inline text editing state
  const [editingTextNode, setEditingTextNode] = useState<DesignTextNode | null>(null);

  // =========================================================================
  // NODE CREATION WITH FRAME ENFORCEMENT
  // =========================================================================

  /**
   * Handle node creation from drawing tools.
   * Enforces hierarchy: shapes must be inside frames.
   */
  const handleNodeCreated = useCallback(
    (node: DesignNode): void => {
      // Hierarchy enforcement: shapes must be inside frames
      if (isShapeType(node.type)) {
        const containingFrame = findContainingFrameForRect(designTree.tree, {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        });

        if (containingFrame !== null) {
          // Convert to frame-relative coordinates
          const relativeRect = toFrameRelative(
            designTree.tree,
            {
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
            },
            containingFrame.id
          );

          if (relativeRect !== null) {
            const nodeWithParent: DesignNode = {
              ...node,
              x: relativeRect.x,
              y: relativeRect.y,
              parentId: containingFrame.id,
            };
            designTree.dispatch({
              type: 'ADD_NODE',
              node: nodeWithParent,
              parentId: containingFrame.id,
            });
            designTree.selectNode(node.id);
            return;
          }
        }

        // No containing frame found - warn but still allow creation for now
        console.warn(
          `Shape "${node.name}" created outside of a frame. Create a frame first, then draw shapes inside it.`
        );
      }

      // For non-shapes (layer, frame) or fallback, add as root
      designTree.dispatch({ type: 'ADD_NODE', node });
      designTree.selectNode(node.id);
    },
    [designTree]
  );

  // =========================================================================
  // TEXT EDITING
  // =========================================================================

  /**
   * Start editing a text node.
   */
  const handleStartTextEdit = useCallback(
    (nodeId: string): void => {
      const designNode = designTree.tree.nodes.get(nodeId);
      if (designNode?.type === 'text') {
        setEditingTextNode(designNode);
      }
    },
    [designTree.tree.nodes]
  );

  /**
   * Save text edits.
   */
  const handleSaveTextEdit = useCallback(
    (nodeId: string, newContent: string): void => {
      const designNode = designTree.tree.nodes.get(nodeId);
      if (designNode?.type === 'text') {
        designTree.updateNode(nodeId, {
          textProperties: {
            ...designNode.textProperties,
            content: newContent,
          },
        });
      }
      setEditingTextNode(null);
    },
    [designTree]
  );

  /**
   * Cancel text editing.
   */
  const handleCancelTextEdit = useCallback((): void => {
    setEditingTextNode(null);
  }, []);

  // =========================================================================
  // DRAWING MOUSE HANDLERS
  // =========================================================================

  /**
   * Handle mouse down on canvas for drawing.
   */
  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // Only handle drawing when a drawing tool is selected (not select tool)
      if (drawingTools.activeTool === 'select') return;

      // Don't start drawing if clicking on a node or control
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__controls')) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      drawingTools.startDrawing(position);
    },
    [drawingTools, screenToFlowPosition]
  );

  /**
   * Handle mouse move for drawing preview.
   */
  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent): void => {
      if (!drawingTools.isDrawing) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      drawingTools.updateDrawing(position);
    },
    [drawingTools, screenToFlowPosition]
  );

  /**
   * Handle mouse up to finish drawing.
   */
  const handleCanvasMouseUp = useCallback((): void => {
    if (!drawingTools.isDrawing) return;

    const node = drawingTools.finishDrawing();

    // After creating a shape, revert to select tool
    if (node !== null) {
      drawingTools.setActiveTool('select');
    }
  }, [drawingTools]);

  // =========================================================================
  // KEYBOARD SHORTCUTS
  // =========================================================================

  /**
   * Handle keyboard shortcuts for tool selection.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Don't intercept if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;

      const toolFromKey = drawingTools.toolShortcuts[event.key];
      if (toolFromKey !== undefined) {
        event.preventDefault();
        drawingTools.setActiveTool(toolFromKey);
      }

      // Escape to cancel drawing or switch to select
      if (event.key === 'Escape') {
        if (drawingTools.isDrawing) {
          drawingTools.cancelDrawing();
        } else {
          drawingTools.setActiveTool('select');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawingTools]);

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    editingTextNode,
    handleStartTextEdit,
    handleSaveTextEdit,
    handleCancelTextEdit,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleNodeCreated,
  };
}
