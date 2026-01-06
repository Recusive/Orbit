/**
 * Layer Management Hook for Design System Canvas
 *
 * Manages layer state, selection, hierarchy, and synchronization with canvas nodes.
 */

import { useCallback, useReducer, useMemo } from 'react';

import {
  createLayer,
  computeZIndices,
  getDescendants,
  canMoveTo,
  reorderSiblings,
  getLayerRange,
  flattenTree,
  syncLayersWithNodes,
} from '../lib/layerUtils';

import type {
  LayerItem,
  LayerState,
  LayerAction,
  LayerDragState,
  LayerType,
} from '../types/layerTypes';

/**
 * Initial layer state
 */
function createInitialState(): LayerState {
  return {
    tree: {
      root: null,
      items: new Map(),
    },
    selection: {
      selectedIds: [],
      focusedId: null,
    },
    dragState: {
      isDragging: false,
      draggedId: null,
      targetId: null,
      dropPosition: null,
    },
  };
}

/**
 * Layer reducer for state management
 */
function layerReducer(state: LayerState, action: LayerAction): LayerState {
  switch (action.type) {
    case 'SET_LAYERS': {
      const items = new Map<string, LayerItem>();
      for (const layer of action.layers) {
        items.set(layer.id, layer);
      }
      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'CREATE_LAYER': {
      const items = new Map(state.tree.items);
      const layer = action.layer;

      // If layer has a parent, add to parent's children
      if (layer.parentId !== null) {
        const parent = items.get(layer.parentId);
        if (parent !== undefined) {
          items.set(layer.parentId, {
            ...parent,
            children: [...parent.children, layer.id],
          });
        }
      }

      // Set order based on sibling count
      const siblings = layer.parentId
        ? (items.get(layer.parentId)?.children.length ?? 0)
        : Array.from(items.values()).filter((l) => l.parentId === null).length;

      items.set(layer.id, { ...layer, order: siblings });

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'DELETE_LAYER': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      // Get all descendants to delete
      const toDelete = new Set([action.layerId, ...getDescendants(state.tree, action.layerId)]);

      // Remove from parent's children
      if (layer.parentId !== null) {
        const parent = items.get(layer.parentId);
        if (parent !== undefined) {
          items.set(layer.parentId, {
            ...parent,
            children: parent.children.filter((id) => id !== action.layerId),
          });
        }
      }

      // Delete all layers
      for (const id of toDelete) {
        items.delete(id);
      }

      // Update selection
      const newSelection = state.selection.selectedIds.filter((id) => !toDelete.has(id));

      return {
        ...state,
        tree: { ...state.tree, items },
        selection: {
          selectedIds: newSelection,
          focusedId:
            state.selection.focusedId && toDelete.has(state.selection.focusedId)
              ? null
              : state.selection.focusedId,
        },
      };
    }

    case 'UPDATE_LAYER': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      items.set(action.layerId, { ...layer, ...action.updates });

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'MOVE_LAYER': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      // Check if move is valid
      if (!canMoveTo(state.tree, action.layerId, action.newParentId)) {
        return state;
      }

      // Remove from old parent
      if (layer.parentId !== null) {
        const oldParent = items.get(layer.parentId);
        if (oldParent !== undefined) {
          items.set(layer.parentId, {
            ...oldParent,
            children: oldParent.children.filter((id) => id !== action.layerId),
          });
        }
      }

      // Add to new parent
      if (action.newParentId !== null) {
        const newParent = items.get(action.newParentId);
        if (newParent !== undefined) {
          const children = [...newParent.children];
          children.splice(action.newIndex, 0, action.layerId);
          items.set(action.newParentId, { ...newParent, children });
        }
      }

      // Update layer's parent
      items.set(action.layerId, { ...layer, parentId: action.newParentId });

      // Reorder siblings
      const orderUpdates = reorderSiblings(
        { ...state.tree, items },
        action.newParentId,
        action.layerId,
        action.newIndex
      );

      for (const [id, order] of orderUpdates) {
        const l = items.get(id);
        if (l !== undefined) {
          items.set(id, { ...l, order });
        }
      }

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'SELECT_LAYER': {
      if (action.multi) {
        // Toggle selection
        const isSelected = state.selection.selectedIds.includes(action.layerId);
        const selectedIds = isSelected
          ? state.selection.selectedIds.filter((id) => id !== action.layerId)
          : [...state.selection.selectedIds, action.layerId];

        return {
          ...state,
          selection: {
            selectedIds,
            focusedId: action.layerId,
          },
        };
      }

      // Single selection
      return {
        ...state,
        selection: {
          selectedIds: [action.layerId],
          focusedId: action.layerId,
        },
      };
    }

    case 'SELECT_RANGE': {
      const range = getLayerRange(state.tree, action.fromId, action.toId);
      return {
        ...state,
        selection: {
          selectedIds: range,
          focusedId: action.toId,
        },
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selection: {
          selectedIds: [],
          focusedId: null,
        },
      };
    }

    case 'TOGGLE_VISIBILITY': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      items.set(action.layerId, { ...layer, visible: !layer.visible });

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'TOGGLE_LOCK': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      items.set(action.layerId, { ...layer, locked: !layer.locked });

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'TOGGLE_EXPAND': {
      const items = new Map(state.tree.items);
      const layer = items.get(action.layerId);
      if (!layer) return state;

      items.set(action.layerId, { ...layer, expanded: !layer.expanded });

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    case 'SET_DRAG_STATE': {
      return {
        ...state,
        dragState: { ...state.dragState, ...action.dragState },
      };
    }

    case 'SYNC_FROM_NODES': {
      const { added, removed, updated } = syncLayersWithNodes(state.tree, action.nodes);
      const items = new Map(state.tree.items);

      // Add new layers
      for (const layer of added) {
        items.set(layer.id, layer);
      }

      // Remove deleted layers
      for (const layerId of removed) {
        items.delete(layerId);
      }

      // Update changed layers
      for (const [layerId, updates] of updated) {
        const layer = items.get(layerId);
        if (layer !== undefined) {
          items.set(layerId, { ...layer, ...updates });
        }
      }

      return {
        ...state,
        tree: { ...state.tree, items },
      };
    }

    default:
      return state;
  }
}

/**
 * Hook return type
 */
export interface UseLayerManagement {
  // State
  layers: LayerItem[];
  selectedLayers: LayerItem[];
  focusedLayer: LayerItem | null;
  dragState: LayerDragState;

  // Selection
  selectLayer: (id: string, multi?: boolean) => void;
  selectRange: (fromId: string, toId: string) => void;
  clearSelection: () => void;

  // CRUD
  createLayer: (
    type: LayerType,
    name: string,
    parentId?: string | null,
    nodeId?: string
  ) => LayerItem;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => LayerItem | null;

  // Hierarchy
  moveLayer: (id: string, newParentId: string | null, index: number) => void;
  nestLayer: (id: string, targetId: string) => void;
  unnestLayer: (id: string) => void;

  // Properties
  updateLayer: (id: string, updates: Partial<LayerItem>) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  toggleExpand: (id: string) => void;
  rename: (id: string, name: string) => void;

  // Z-Index
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // Drag and drop
  startDrag: (id: string) => void;
  updateDragTarget: (
    targetId: string | null,
    position: 'before' | 'after' | 'inside' | null
  ) => void;
  endDrag: () => void;

  // Sync
  syncFromNodes: (nodes: { id: string; data: { label?: string } }[]) => void;

  // Utilities
  getLayerById: (id: string) => LayerItem | undefined;
  getLayerByNodeId: (nodeId: string) => LayerItem | undefined;
  getZIndices: () => Map<string, number>;
}

/**
 * Layer management hook
 */
export function useLayerManagement(): UseLayerManagement {
  const [state, dispatch] = useReducer(layerReducer, undefined, createInitialState);

  // Memoized flattened layers for display
  const layers = useMemo(() => flattenTree(state.tree), [state.tree]);

  // Memoized selected layers
  const selectedLayers = useMemo(() => {
    return state.selection.selectedIds
      .map((id) => state.tree.items.get(id))
      .filter((l): l is LayerItem => l !== undefined);
  }, [state.tree.items, state.selection.selectedIds]);

  // Memoized focused layer
  const focusedLayer = useMemo(() => {
    return state.selection.focusedId
      ? (state.tree.items.get(state.selection.focusedId) ?? null)
      : null;
  }, [state.tree.items, state.selection.focusedId]);

  // Selection
  const selectLayer = useCallback((id: string, multi?: boolean) => {
    dispatch({ type: 'SELECT_LAYER', layerId: id, ...(multi !== undefined ? { multi } : {}) });
  }, []);

  const selectRange = useCallback((fromId: string, toId: string) => {
    dispatch({ type: 'SELECT_RANGE', fromId, toId });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  // CRUD
  const createLayerFn = useCallback(
    (type: LayerType, name: string, parentId?: string | null, nodeId?: string): LayerItem => {
      const layer = createLayer(type, name, parentId, nodeId);
      dispatch({ type: 'CREATE_LAYER', layer });
      return layer;
    },
    []
  );

  const deleteLayer = useCallback((id: string) => {
    dispatch({ type: 'DELETE_LAYER', layerId: id });
  }, []);

  const duplicateLayer = useCallback(
    (id: string): LayerItem | null => {
      const original = state.tree.items.get(id);
      if (!original) return null;

      const newLayer = createLayer(
        original.type,
        `${original.name} Copy`,
        original.parentId,
        undefined
      );
      dispatch({ type: 'CREATE_LAYER', layer: newLayer });
      return newLayer;
    },
    [state.tree.items]
  );

  // Hierarchy
  const moveLayer = useCallback((id: string, newParentId: string | null, index: number) => {
    dispatch({ type: 'MOVE_LAYER', layerId: id, newParentId, newIndex: index });
  }, []);

  const nestLayer = useCallback(
    (id: string, targetId: string) => {
      const target = state.tree.items.get(targetId);
      if (!target) return;

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: targetId,
        newIndex: target.children.length,
      });
    },
    [state.tree.items]
  );

  const unnestLayer = useCallback(
    (id: string) => {
      const layer = state.tree.items.get(id);
      if (!layer?.parentId) return;

      const parent = state.tree.items.get(layer.parentId);
      if (!parent) return;

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: parent.parentId,
        newIndex: parent.order + 1,
      });
    },
    [state.tree.items]
  );

  // Properties
  const updateLayer = useCallback((id: string, updates: Partial<LayerItem>) => {
    dispatch({ type: 'UPDATE_LAYER', layerId: id, updates });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_VISIBILITY', layerId: id });
  }, []);

  const toggleLock = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_LOCK', layerId: id });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPAND', layerId: id });
  }, []);

  const rename = useCallback((id: string, name: string) => {
    dispatch({ type: 'UPDATE_LAYER', layerId: id, updates: { name } });
  }, []);

  // Z-Index
  const bringToFront = useCallback(
    (id: string) => {
      const layer = state.tree.items.get(id);
      if (!layer) return;

      const siblings = layer.parentId
        ? (state.tree.items.get(layer.parentId)?.children ?? [])
        : Array.from(state.tree.items.values())
            .filter((l) => l.parentId === null)
            .map((l) => l.id);

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: layer.parentId,
        newIndex: siblings.length - 1,
      });
    },
    [state.tree.items]
  );

  const sendToBack = useCallback(
    (id: string) => {
      const layer = state.tree.items.get(id);
      if (!layer) return;

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: layer.parentId,
        newIndex: 0,
      });
    },
    [state.tree.items]
  );

  const bringForward = useCallback(
    (id: string) => {
      const layer = state.tree.items.get(id);
      if (!layer) return;

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: layer.parentId,
        newIndex: layer.order + 1,
      });
    },
    [state.tree.items]
  );

  const sendBackward = useCallback(
    (id: string) => {
      const layer = state.tree.items.get(id);
      if (!layer || layer.order === 0) return;

      dispatch({
        type: 'MOVE_LAYER',
        layerId: id,
        newParentId: layer.parentId,
        newIndex: layer.order - 1,
      });
    },
    [state.tree.items]
  );

  // Drag and drop
  const startDrag = useCallback((id: string) => {
    dispatch({
      type: 'SET_DRAG_STATE',
      dragState: { isDragging: true, draggedId: id },
    });
  }, []);

  const updateDragTarget = useCallback(
    (targetId: string | null, position: 'before' | 'after' | 'inside' | null) => {
      dispatch({
        type: 'SET_DRAG_STATE',
        dragState: { targetId, dropPosition: position },
      });
    },
    []
  );

  const endDrag = useCallback(() => {
    const { draggedId, targetId, dropPosition } = state.dragState;

    if (draggedId !== null && targetId !== null && dropPosition !== null) {
      const target = state.tree.items.get(targetId);
      if (target !== undefined) {
        let newParentId: string | null;
        let newIndex: number;

        if (dropPosition === 'inside') {
          newParentId = targetId;
          newIndex = target.children.length;
        } else {
          newParentId = target.parentId;
          newIndex = dropPosition === 'before' ? target.order : target.order + 1;
        }

        dispatch({
          type: 'MOVE_LAYER',
          layerId: draggedId,
          newParentId,
          newIndex,
        });
      }
    }

    dispatch({
      type: 'SET_DRAG_STATE',
      dragState: { isDragging: false, draggedId: null, targetId: null, dropPosition: null },
    });
  }, [state.dragState, state.tree.items]);

  // Sync
  const syncFromNodes = useCallback((nodes: { id: string; data: { label?: string } }[]) => {
    dispatch({ type: 'SYNC_FROM_NODES', nodes });
  }, []);

  // Utilities
  const getLayerById = useCallback(
    (id: string): LayerItem | undefined => {
      return state.tree.items.get(id);
    },
    [state.tree.items]
  );

  const getLayerByNodeId = useCallback(
    (nodeId: string): LayerItem | undefined => {
      for (const layer of state.tree.items.values()) {
        if (layer.nodeId === nodeId) {
          return layer;
        }
      }
      return undefined;
    },
    [state.tree.items]
  );

  const getZIndices = useCallback((): Map<string, number> => {
    return computeZIndices(state.tree);
  }, [state.tree]);

  return {
    // State
    layers,
    selectedLayers,
    focusedLayer,
    dragState: state.dragState,

    // Selection
    selectLayer,
    selectRange,
    clearSelection,

    // CRUD
    createLayer: createLayerFn,
    deleteLayer,
    duplicateLayer,

    // Hierarchy
    moveLayer,
    nestLayer,
    unnestLayer,

    // Properties
    updateLayer,
    toggleVisibility,
    toggleLock,
    toggleExpand,
    rename,

    // Z-Index
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,

    // Drag and drop
    startDrag,
    updateDragTarget,
    endDrag,

    // Sync
    syncFromNodes,

    // Utilities
    getLayerById,
    getLayerByNodeId,
    getZIndices,
  };
}
