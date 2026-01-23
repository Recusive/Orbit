/**
 * Unified Design Node Type System
 *
 * This is the single source of truth for all design objects in the canvas.
 * Layers and visual properties are unified in a single node architecture.
 *
 * Key principles:
 * - Every visual element is a DesignNode
 * - Nodes form a tree hierarchy (parent/children)
 * - Frames can contain any other nodes
 * - Constraints define how children respond to parent resize
 * - Auto Layout provides smart flex-based layout
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Node type identifiers
 */
export type DesignNodeType =
  | 'layer' // Page container - holds frames, previewable unit
  | 'frame' // Section/component within a layer, holds shapes
  | 'text' // Text element
  | 'rectangle' // Basic shape
  | 'ellipse' // Circle/oval shape
  | 'component' // React component instance
  | 'instance'; // Instance of a component definition

/**
 * Constraint types for horizontal positioning relative to parent
 */
export type HorizontalConstraint =
  | 'left' // Fixed distance from left edge
  | 'right' // Fixed distance from right edge
  | 'center' // Centered horizontally
  | 'scale' // Scale proportionally with parent
  | 'left-right'; // Fixed distance from both edges (stretches)

/**
 * Constraint types for vertical positioning relative to parent
 */
export type VerticalConstraint =
  | 'top' // Fixed distance from top edge
  | 'bottom' // Fixed distance from bottom edge
  | 'center' // Centered vertically
  | 'scale' // Scale proportionally with parent
  | 'top-bottom'; // Fixed distance from both edges (stretches)

/**
 * Constraints define how a node responds when its parent is resized
 */
export interface Constraints {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
}

// =============================================================================
// AUTO LAYOUT (Smart flex layout)
// =============================================================================

/**
 * Auto Layout direction
 */
export type AutoLayoutDirection = 'horizontal' | 'vertical';

/**
 * Primary axis sizing mode for auto-layout frames
 */
export type PrimarySizing = 'hug' | 'fill' | 'fixed';

/**
 * Counter axis sizing mode for auto-layout frames
 */
export type CounterSizing = 'hug' | 'fill' | 'fixed';

/**
 * Alignment on the primary axis
 */
export type PrimaryAxisAlign = 'start' | 'center' | 'end' | 'space-between';

/**
 * Alignment on the counter axis
 */
export type CounterAxisAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/**
 * Individual side padding
 */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Auto Layout configuration for frames
 */
export interface AutoLayout {
  enabled: boolean;
  direction: AutoLayoutDirection;
  spacing: number; // Gap between children
  padding: Padding; // Internal padding
  primaryAxisAlign: PrimaryAxisAlign; // Main axis alignment (justify-content)
  counterAxisAlign: CounterAxisAlign; // Cross axis alignment (align-items)
  primarySizing: PrimarySizing; // How frame sizes on main axis
  counterSizing: CounterSizing; // How frame sizes on cross axis
  wrap: boolean; // Allow wrapping
}

/**
 * Child sizing within auto-layout parent
 */
export interface AutoLayoutChildSizing {
  // How this child sizes on the parent's primary axis
  primaryAxisSizing: 'hug' | 'fill' | 'fixed';
  // How this child sizes on the parent's counter axis
  counterAxisSizing: 'hug' | 'fill' | 'fixed';
}

// =============================================================================
// VISUAL PROPERTIES
// =============================================================================

/**
 * Fill types
 */
export type FillType = 'solid' | 'gradient' | 'image';

/**
 * Gradient stop
 */
export interface GradientStop {
  position: number; // 0-1
  color: string;
}

/**
 * Fill configuration
 */
export interface Fill {
  type: FillType;
  color?: string;
  opacity?: number;
  // Gradient
  gradientType?: 'linear' | 'radial';
  gradientAngle?: number;
  gradientStops?: GradientStop[];
  // Image
  imageUrl?: string;
  imageScaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
}

/**
 * Stroke configuration
 */
export interface Stroke {
  color: string;
  width: number;
  opacity?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  position?: 'inside' | 'center' | 'outside';
}

/**
 * Corner radius configuration
 */
export interface CornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Shadow/effect configuration
 */
export interface Shadow {
  type: 'drop' | 'inner';
  color: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  opacity?: number;
}

/**
 * Blur effect
 */
export interface BlurEffect {
  type: 'layer' | 'background';
  radius: number;
}

/**
 * Combined effects
 */
export interface Effects {
  shadows: Shadow[];
  blur?: BlurEffect;
}

// =============================================================================
// TEXT PROPERTIES
// =============================================================================

/**
 * Text alignment
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Vertical text alignment
 */
export type TextAlignVertical = 'top' | 'center' | 'bottom';

/**
 * Text decoration
 */
export type TextDecoration = 'none' | 'underline' | 'line-through';

/**
 * Text properties for text nodes
 */
export interface TextProperties {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | 'auto';
  letterSpacing: number;
  textAlign: TextAlign;
  textAlignVertical: TextAlignVertical;
  textDecoration: TextDecoration;
  textCase?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

// =============================================================================
// COMPONENT PROPERTIES
// =============================================================================

/**
 * Properties for component nodes (React components)
 */
export interface ComponentProperties {
  code: string; // React component code
  props: Record<string, unknown>; // Component props
  dependencies?: Record<string, string>; // npm dependencies
}

/**
 * Properties for component instances
 */
export interface InstanceProperties {
  componentId: string; // Reference to component definition
  overrides: Record<string, unknown>; // Property overrides
}

// =============================================================================
// DESIGN NODE (Core unified type)
// =============================================================================

/**
 * Base properties shared by all design nodes
 */
export interface DesignNodeBase {
  id: string;
  name: string;
  type: DesignNodeType;

  // Hierarchy
  parentId: string | null;
  children: string[];

  // Transform
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // Constraints (how node responds to parent resize)
  constraints: Constraints;

  // Auto-layout child sizing (when inside auto-layout parent)
  autoLayoutChild?: AutoLayoutChildSizing;

  // Visual state
  visible: boolean;
  locked: boolean;
  opacity: number;

  // Layer panel state
  expanded: boolean; // Whether children are shown in layer panel

  // Visual properties
  fills: Fill[];
  strokes: Stroke[];
  cornerRadius: CornerRadius | number; // number for uniform radius
  effects: Effects;

  // Blend mode
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

  // Clipping
  clipContent: boolean; // Whether to clip children to frame bounds
}

/**
 * Layer node - page container that holds frames
 * Represents a complete page that can be previewed
 */
export interface LayerNode extends DesignNodeBase {
  type: 'layer';
  // Layers are primarily containers, no special visual properties
  // They group frames together into a previewable page
}

/**
 * Frame node - section/component within a layer, with optional auto-layout
 */
export interface FrameNode extends DesignNodeBase {
  type: 'frame';
  autoLayout?: AutoLayout;
}

/**
 * Text node
 */
export interface TextNode extends DesignNodeBase {
  type: 'text';
  textProperties: TextProperties;
}

/**
 * Rectangle node (basic shape)
 */
export interface RectangleNode extends DesignNodeBase {
  type: 'rectangle';
}

/**
 * Ellipse node (circle/oval)
 */
export interface EllipseNode extends DesignNodeBase {
  type: 'ellipse';
  // Arc properties for partial ellipses
  arcStartAngle?: number;
  arcEndAngle?: number;
  innerRadius?: number; // For donuts
}

/**
 * Component node (contains React code)
 */
export interface ComponentNode extends DesignNodeBase {
  type: 'component';
  componentProps: ComponentProperties;
}

/**
 * Instance node (instance of a component)
 */
export interface InstanceNode extends DesignNodeBase {
  type: 'instance';
  instanceProps: InstanceProperties;
}

/**
 * Union type for all design nodes
 */
export type DesignNode =
  | LayerNode
  | FrameNode
  | TextNode
  | RectangleNode
  | EllipseNode
  | ComponentNode
  | InstanceNode;

// =============================================================================
// DESIGN TREE
// =============================================================================

/**
 * Selection state
 */
export interface DesignSelection {
  nodeIds: string[];
  focusedId: string | null;
}

/**
 * The design tree holds all nodes
 */
export interface DesignTree {
  nodes: Map<string, DesignNode>;
  rootIds: string[]; // Top-level node IDs (nodes with no parent)
}

/**
 * Complete design state
 */
export interface DesignState {
  tree: DesignTree;
  selection: DesignSelection;
  // Canvas viewport
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

// =============================================================================
// HISTORY / UNDO-REDO
// =============================================================================

/**
 * A single change to the design tree
 */
export interface DesignChange {
  nodeId: string;
  before: Partial<DesignNode> | null; // null means node was created
  after: Partial<DesignNode> | null; // null means node was deleted
}

/**
 * A transaction groups multiple changes into one undo step
 */
export interface DesignTransaction {
  id: string;
  timestamp: number;
  description: string;
  changes: DesignChange[];
}

/**
 * History state for undo/redo
 */
export interface DesignHistory {
  past: DesignTransaction[];
  future: DesignTransaction[];
  maxSize: number;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `node-${String(Date.now())}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Default constraints
 */
export const DEFAULT_CONSTRAINTS: Constraints = {
  horizontal: 'left',
  vertical: 'top',
};

/**
 * Default auto-layout configuration
 */
export const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  enabled: false,
  direction: 'vertical',
  spacing: 8,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  primaryAxisAlign: 'start',
  counterAxisAlign: 'start',
  primarySizing: 'hug',
  counterSizing: 'hug',
  wrap: false,
};

/**
 * Default corner radius
 */
export const DEFAULT_CORNER_RADIUS: CornerRadius = {
  topLeft: 0,
  topRight: 0,
  bottomRight: 0,
  bottomLeft: 0,
};

/**
 * Default effects
 */
export const DEFAULT_EFFECTS: Effects = {
  shadows: [],
};

/**
 * Create a new frame node
 */
export function createFrame(name = 'Frame', options?: Partial<FrameNode>): FrameNode {
  return {
    id: generateId(),
    name,
    type: 'frame',
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    constraints: { ...DEFAULT_CONSTRAINTS },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { ...DEFAULT_EFFECTS },
    clipContent: true,
    ...options,
  };
}

/**
 * Create a new text node
 */
export function createText(content = 'Text', options?: Partial<TextNode>): TextNode {
  return {
    id: generateId(),
    name: content.substring(0, 20) !== '' ? content.substring(0, 20) : 'Text',
    type: 'text',
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    rotation: 0,
    constraints: { ...DEFAULT_CONSTRAINTS },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: false,
    fills: [{ type: 'solid', color: '#000000', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { ...DEFAULT_EFFECTS },
    clipContent: false,
    textProperties: {
      content,
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      textAlign: 'left',
      textAlignVertical: 'top',
      textDecoration: 'none',
    },
    ...options,
  };
}

/**
 * Create a new rectangle node
 */
export function createRectangle(
  name = 'Rectangle',
  options?: Partial<RectangleNode>
): RectangleNode {
  return {
    id: generateId(),
    name,
    type: 'rectangle',
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    constraints: { ...DEFAULT_CONSTRAINTS },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: false,
    fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
    strokes: [],
    cornerRadius: 0,
    effects: { ...DEFAULT_EFFECTS },
    clipContent: false,
    ...options,
  };
}

/**
 * Create a new component node
 */
export function createComponent(
  name = 'Component',
  code = '',
  options?: Partial<ComponentNode>
): ComponentNode {
  return {
    id: generateId(),
    name,
    type: 'component',
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    rotation: 0,
    constraints: { ...DEFAULT_CONSTRAINTS },
    visible: true,
    locked: false,
    opacity: 1,
    expanded: true,
    fills: [],
    strokes: [],
    cornerRadius: 0,
    effects: { ...DEFAULT_EFFECTS },
    clipContent: true,
    componentProps: {
      code,
      props: {},
    },
    ...options,
  };
}

/**
 * Create an empty design tree
 */
export function createDesignTree(): DesignTree {
  return {
    nodes: new Map(),
    rootIds: [],
  };
}

/**
 * Create initial design state
 */
export function createDesignState(): DesignState {
  return {
    tree: createDesignTree(),
    selection: {
      nodeIds: [],
      focusedId: null,
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  };
}

/**
 * Create initial history state
 */
export function createDesignHistory(maxSize = 100): DesignHistory {
  return {
    past: [],
    future: [],
    maxSize,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get all descendants of a node (recursive)
 */
export function getDescendants(tree: DesignTree, nodeId: string): string[] {
  const node = tree.nodes.get(nodeId);
  if (node === undefined) {
    return [];
  }

  const descendants: string[] = [];
  for (const childId of node.children) {
    descendants.push(childId);
    descendants.push(...getDescendants(tree, childId));
  }
  return descendants;
}

/**
 * Get all ancestors of a node (from immediate parent to root)
 */
export function getAncestors(tree: DesignTree, nodeId: string): string[] {
  const ancestors: string[] = [];
  let node = tree.nodes.get(nodeId);

  while (node !== undefined && node.parentId !== null) {
    ancestors.push(node.parentId);
    node = tree.nodes.get(node.parentId);
  }

  return ancestors;
}

/**
 * Check if a node is a descendant of another
 */
export function isDescendant(
  tree: DesignTree,
  nodeId: string,
  potentialAncestorId: string
): boolean {
  const ancestors = getAncestors(tree, nodeId);
  return ancestors.includes(potentialAncestorId);
}

/**
 * Get depth of a node in the tree
 */
export function getNodeDepth(tree: DesignTree, nodeId: string): number {
  return getAncestors(tree, nodeId).length;
}

/**
 * Flatten tree to array in display order (depth-first)
 */
export function flattenTree(tree: DesignTree, expandedIds?: Set<string>): DesignNode[] {
  const result: DesignNode[] = [];

  function traverse(nodeId: string): void {
    const node = tree.nodes.get(nodeId);
    if (node === undefined) {
      return;
    }

    result.push(node);

    // Only traverse children if expanded (or if expandedIds not specified)
    const isExpanded = expandedIds === undefined || expandedIds.has(nodeId) || node.expanded;
    if (isExpanded && node.children.length > 0) {
      for (const childId of node.children) {
        traverse(childId);
      }
    }
  }

  // Start from root nodes
  for (const rootId of tree.rootIds) {
    traverse(rootId);
  }

  return result;
}

/**
 * Compute bounding box of multiple nodes
 */
export function computeBoundingBox(
  tree: DesignTree,
  nodeIds: string[]
): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const nodes = nodeIds
    .map((id) => tree.nodes.get(id))
    .filter((n): n is DesignNode => n !== undefined);

  if (nodes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
