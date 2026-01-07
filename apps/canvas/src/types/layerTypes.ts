/**
 * Layer System Types for Design System Canvas
 *
 * Figma-like layer management with hierarchy, visibility, and z-index control.
 */

/**
 * Layer type identifier
 */
export type LayerType = 'page' | 'section' | 'component';

/**
 * Layer positioning mode
 */
export type PositionMode = 'flow' | 'absolute';

/**
 * Layer position configuration
 */
export interface LayerPosition {
  mode: PositionMode;
  // For flow mode
  flexOrder?: number;
  gridArea?: string;
  // For absolute mode
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Single layer item in the layer tree
 */
export interface LayerItem {
  id: string;
  name: string;
  type: LayerType;

  // Hierarchy
  parentId: string | null;
  children: string[]; // Child layer IDs
  order: number; // Position among siblings

  // Visual state
  visible: boolean;
  locked: boolean;
  expanded: boolean; // Tree expansion state

  // Positioning
  position: LayerPosition;

  // Z-index (computed from tree position + manual overrides)
  zIndex: number;
  zIndexOverride?: number;

  // Reference to canvas node
  nodeId?: string; // Links to ReactFlow node
}

/**
 * Layer tree structure
 */
export interface LayerTree {
  root: string | null; // Root layer ID (usually a page)
  items: Map<string, LayerItem>;
}

/**
 * Layer selection state
 */
export interface LayerSelection {
  selectedIds: string[];
  focusedId: string | null;
}

/**
 * Layer drag state for reordering
 */
export interface LayerDragState {
  isDragging: boolean;
  draggedId: string | null;
  targetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
}

/**
 * Layer operation for undo/redo
 */
export type LayerOperation =
  | { type: 'create'; layer: LayerItem }
  | { type: 'delete'; layer: LayerItem; parentId: string | null; index: number }
  | { type: 'update'; layerId: string; before: Partial<LayerItem>; after: Partial<LayerItem> }
  | {
      type: 'move';
      layerId: string;
      fromParent: string | null;
      toParent: string | null;
      fromIndex: number;
      toIndex: number;
    }
  | { type: 'reorder'; parentId: string | null; fromIndex: number; toIndex: number };

/**
 * Complete layer state
 */
export interface LayerState {
  tree: LayerTree;
  selection: LayerSelection;
  dragState: LayerDragState;
}

/**
 * Layer action types for reducer
 */
export type LayerAction =
  | { type: 'SET_LAYERS'; layers: LayerItem[] }
  | { type: 'CREATE_LAYER'; layer: LayerItem }
  | { type: 'DELETE_LAYER'; layerId: string }
  | { type: 'UPDATE_LAYER'; layerId: string; updates: Partial<LayerItem> }
  | { type: 'MOVE_LAYER'; layerId: string; newParentId: string | null; newIndex: number }
  | { type: 'SELECT_LAYER'; layerId: string; multi?: boolean }
  | { type: 'SELECT_RANGE'; fromId: string; toId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'TOGGLE_VISIBILITY'; layerId: string }
  | { type: 'TOGGLE_LOCK'; layerId: string }
  | { type: 'TOGGLE_EXPAND'; layerId: string }
  | { type: 'SET_DRAG_STATE'; dragState: Partial<LayerDragState> }
  | { type: 'SYNC_FROM_NODES'; nodes: { id: string; data: { label?: string } }[] };

/**
 * Icon type for layers
 */
export type LayerIcon =
  | 'page'
  | 'section'
  | 'component'
  | 'button'
  | 'input'
  | 'card'
  | 'form'
  | 'text'
  | 'image';
