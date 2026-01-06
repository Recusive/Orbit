/**
 * useDrawingTools Hook
 *
 * Manages drawing tool state and shape creation on the canvas.
 * Optimized for performance using refs for transient state.
 */

import { useState, useCallback, useRef, useMemo } from 'react';

import { createNodeFromTool, normalizeRect, isValidShapeSize } from '../lib/nodeFactory';

import type { DrawingTool, NodeRect } from '../lib/nodeFactory';
import type { DesignNode } from '../types/designNodeTypes';

export type { DrawingTool } from '../lib/nodeFactory';

/**
 * Drawing state (only what needs to trigger re-renders)
 */
export interface DrawingState {
  activeTool: DrawingTool;
  isDrawing: boolean;
}

/**
 * Preview rect for visual feedback during drawing
 */
export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  tool: DrawingTool;
}

/**
 * Options for the hook
 */
export interface UseDrawingToolsOptions {
  /** Callback when a new node is created */
  onNodeCreated?: (node: DesignNode) => void;
  /** Callback when tool changes */
  onToolChange?: (tool: DrawingTool) => void;
  /** Initial tool (default: 'select') */
  initialTool?: DrawingTool;
}

/**
 * Return type for the hook
 */
export interface UseDrawingToolsReturn {
  // State
  activeTool: DrawingTool;
  isDrawing: boolean;
  previewRect: PreviewRect | null;

  // Actions
  setActiveTool: (tool: DrawingTool) => void;
  startDrawing: (position: { x: number; y: number }) => void;
  updateDrawing: (position: { x: number; y: number }) => void;
  finishDrawing: () => DesignNode | null;
  cancelDrawing: () => void;

  // Keyboard shortcut map
  toolShortcuts: Record<string, DrawingTool>;

  // Cursor style based on active tool
  cursorStyle: string;
}

/**
 * Tool keyboard shortcuts
 */
const TOOL_SHORTCUTS: Record<string, DrawingTool> = {
  v: 'select',
  V: 'select',
  l: 'layer',
  L: 'layer',
  f: 'frame',
  F: 'frame',
  r: 'rectangle',
  R: 'rectangle',
  o: 'ellipse',
  O: 'ellipse',
  t: 'text',
  T: 'text',
};

/**
 * Cursor styles for each tool
 */
const TOOL_CURSORS: Record<DrawingTool, string> = {
  select: 'default',
  layer: 'crosshair',
  frame: 'crosshair',
  rectangle: 'crosshair',
  ellipse: 'crosshair',
  text: 'text',
};

export function useDrawingTools(options: UseDrawingToolsOptions = {}): UseDrawingToolsReturn {
  const { onNodeCreated, onToolChange, initialTool = 'select' } = options;

  // Only store what needs to trigger re-renders in state
  const [activeTool, setActiveToolState] = useState<DrawingTool>(initialTool);
  const [isDrawing, setIsDrawing] = useState(false);
  const [previewRect, setPreviewRect] = useState<PreviewRect | null>(null);

  // Use refs for transient drawing state (no re-renders during drag)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRectRef = useRef<NodeRect | null>(null);

  // Memoized tool setter with callback
  const setActiveTool = useCallback(
    (tool: DrawingTool) => {
      setActiveToolState(tool);
      onToolChange?.(tool);

      // Cancel any in-progress drawing when switching tools
      if (drawStartRef.current) {
        drawStartRef.current = null;
        currentRectRef.current = null;
        setIsDrawing(false);
        setPreviewRect(null);
      }
    },
    [onToolChange]
  );

  // Start drawing a new shape
  const startDrawing = useCallback(
    (position: { x: number; y: number }) => {
      // Only start drawing if a shape tool is selected
      if (activeTool === 'select') return;

      drawStartRef.current = position;
      currentRectRef.current = {
        x: position.x,
        y: position.y,
        width: 0,
        height: 0,
      };

      setIsDrawing(true);
      setPreviewRect({
        x: position.x,
        y: position.y,
        width: 0,
        height: 0,
        tool: activeTool,
      });
    },
    [activeTool]
  );

  // Update drawing as mouse moves
  const updateDrawing = useCallback(
    (position: { x: number; y: number }) => {
      if (!drawStartRef.current || !isDrawing) return;

      const start = drawStartRef.current;
      const rect: NodeRect = {
        x: start.x,
        y: start.y,
        width: position.x - start.x,
        height: position.y - start.y,
      };

      currentRectRef.current = rect;

      // Update preview (this triggers a re-render, but only for the preview)
      const normalized = normalizeRect(rect);
      setPreviewRect({
        x: normalized.x,
        y: normalized.y,
        width: normalized.width,
        height: normalized.height,
        tool: activeTool,
      });
    },
    [isDrawing, activeTool]
  );

  // Finish drawing and create the node
  const finishDrawing = useCallback((): DesignNode | null => {
    if (!currentRectRef.current || !isDrawing) {
      return null;
    }

    const rect = currentRectRef.current;
    let createdNode: DesignNode | null = null;

    // For text tool, we create on click (not drag)
    // For shape tools, check minimum size
    if (activeTool === 'text') {
      createdNode = createNodeFromTool(activeTool, rect);
    } else if (isValidShapeSize(rect)) {
      createdNode = createNodeFromTool(activeTool, rect);
    }

    // Reset state
    drawStartRef.current = null;
    currentRectRef.current = null;
    setIsDrawing(false);
    setPreviewRect(null);

    // Notify and return
    if (createdNode) {
      onNodeCreated?.(createdNode);
    }

    return createdNode;
  }, [isDrawing, activeTool, onNodeCreated]);

  // Cancel drawing without creating a node
  const cancelDrawing = useCallback(() => {
    drawStartRef.current = null;
    currentRectRef.current = null;
    setIsDrawing(false);
    setPreviewRect(null);
  }, []);

  // Memoize cursor style
  const cursorStyle = useMemo(() => {
    return TOOL_CURSORS[activeTool];
  }, [activeTool]);

  // Memoize the return object to prevent unnecessary re-renders in consumers
  return useMemo(
    () => ({
      // State
      activeTool,
      isDrawing,
      previewRect,

      // Actions
      setActiveTool,
      startDrawing,
      updateDrawing,
      finishDrawing,
      cancelDrawing,

      // Constants
      toolShortcuts: TOOL_SHORTCUTS,
      cursorStyle,
    }),
    [
      activeTool,
      isDrawing,
      previewRect,
      setActiveTool,
      startDrawing,
      updateDrawing,
      finishDrawing,
      cancelDrawing,
      cursorStyle,
    ]
  );
}

/**
 * Check if a key corresponds to a tool shortcut
 */
export function isToolShortcut(key: string): boolean {
  return key in TOOL_SHORTCUTS;
}

/**
 * Get tool from shortcut key
 */
export function getToolFromShortcut(key: string): DrawingTool | null {
  return TOOL_SHORTCUTS[key] ?? null;
}
