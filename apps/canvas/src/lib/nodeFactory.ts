/**
 * Node Factory Functions
 *
 * Creates DesignNode instances for the design canvas.
 * Each factory produces a properly typed node with sensible defaults.
 */

import type {
  LayerNode,
  FrameNode,
  RectangleNode,
  EllipseNode,
  TextNode,
  DesignNode,
} from '../types/designNodeTypes';

// Generate unique node IDs
let nodeIdCounter = 0;

export function generateNodeId(prefix: string): string {
  nodeIdCounter++;
  return `${prefix}-${String(Date.now())}-${String(nodeIdCounter)}`;
}

// Reset counter (useful for testing)
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

/**
 * Rect type for node creation
 */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize rect to handle negative width/height from drag direction
 */
export function normalizeRect(rect: NodeRect): NodeRect {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Create a Layer node - page container that holds frames
 */
export function createLayerNode(rect: NodeRect, name?: string): LayerNode {
  const normalized = normalizeRect(rect);

  return {
    id: generateNodeId('layer'),
    name: name ?? 'Layer',
    type: 'layer',
    parentId: null,
    children: [],
    x: normalized.x,
    y: normalized.y,
    width: Math.max(normalized.width, 1),
    height: Math.max(normalized.height, 1),
    rotation: 0,
    constraints: { horizontal: 'left', vertical: 'top' },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#f5f5f5', opacity: 1 }],
    strokes: [{ color: '#d4d4d4', width: 1, opacity: 1, style: 'dashed' }],
    cornerRadius: 0,
    effects: { shadows: [] },
    clipContent: false,
  };
}

/**
 * Create a Frame node - section/component within a layer
 */
export function createFrameNode(rect: NodeRect, name?: string): FrameNode {
  const normalized = normalizeRect(rect);

  return {
    id: generateNodeId('frame'),
    name: name ?? 'Frame',
    type: 'frame',
    parentId: null,
    children: [],
    x: normalized.x,
    y: normalized.y,
    width: Math.max(normalized.width, 1),
    height: Math.max(normalized.height, 1),
    rotation: 0,
    constraints: { horizontal: 'left', vertical: 'top' },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#ffffff', opacity: 1 }],
    strokes: [{ color: '#e5e5e5', width: 1, opacity: 1 }],
    cornerRadius: 0,
    effects: { shadows: [] },
    clipContent: true,
  };
}

/**
 * Create a Rectangle node - basic shape
 */
export function createRectangleNode(rect: NodeRect, name?: string): RectangleNode {
  const normalized = normalizeRect(rect);

  return {
    id: generateNodeId('rect'),
    name: name ?? 'Rectangle',
    type: 'rectangle',
    parentId: null,
    children: [],
    x: normalized.x,
    y: normalized.y,
    width: Math.max(normalized.width, 1),
    height: Math.max(normalized.height, 1),
    rotation: 0,
    constraints: { horizontal: 'left', vertical: 'top' },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#d4d4d4', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { shadows: [] },
    clipContent: false,
  };
}

/**
 * Create an Ellipse node - circle/oval shape
 */
export function createEllipseNode(rect: NodeRect, name?: string): EllipseNode {
  const normalized = normalizeRect(rect);

  return {
    id: generateNodeId('ellipse'),
    name: name ?? 'Ellipse',
    type: 'ellipse',
    parentId: null,
    children: [],
    x: normalized.x,
    y: normalized.y,
    width: Math.max(normalized.width, 1),
    height: Math.max(normalized.height, 1),
    rotation: 0,
    constraints: { horizontal: 'left', vertical: 'top' },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#a3a3a3', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { shadows: [] },
    clipContent: false,
  };
}

/**
 * Create a Text node
 */
export function createTextNode(
  position: { x: number; y: number },
  content?: string,
  name?: string
): TextNode {
  return {
    id: generateNodeId('text'),
    name: name ?? 'Text',
    type: 'text',
    parentId: null,
    children: [],
    x: position.x,
    y: position.y,
    width: 100,
    height: 24,
    rotation: 0,
    constraints: { horizontal: 'left', vertical: 'top' },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#171717', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { shadows: [] },
    clipContent: false,
    textProperties: {
      content: content ?? 'Text',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 'auto',
      letterSpacing: 0,
      textAlign: 'left',
      textAlignVertical: 'top',
      textDecoration: 'none',
    },
  };
}

/**
 * Create a node based on tool type
 */
export type DrawingTool = 'select' | 'layer' | 'frame' | 'rectangle' | 'ellipse' | 'text';

export function createNodeFromTool(tool: DrawingTool, rect: NodeRect): DesignNode | null {
  if (tool === 'layer') {
    return createLayerNode(rect);
  } else if (tool === 'frame') {
    return createFrameNode(rect);
  } else if (tool === 'rectangle') {
    return createRectangleNode(rect);
  } else if (tool === 'ellipse') {
    return createEllipseNode(rect);
  } else if (tool === 'text') {
    return createTextNode({ x: rect.x, y: rect.y });
  }
  return null;
}

/**
 * Minimum size for drawn shapes (prevents accidental tiny shapes)
 */
export const MIN_SHAPE_SIZE = 10;

/**
 * Check if a rect meets minimum size requirements
 */
export function isValidShapeSize(rect: NodeRect): boolean {
  const normalized = normalizeRect(rect);
  return normalized.width >= MIN_SHAPE_SIZE || normalized.height >= MIN_SHAPE_SIZE;
}
