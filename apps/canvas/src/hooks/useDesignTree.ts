/**
 * useDesignTree Hook
 *
 * Manages the design tree state with full undo/redo support.
 * This is the single source of truth for all design nodes.
 */

import { useCallback, useReducer, useMemo } from 'react';

import {
  createDesignState,
  createDesignHistory,
  generateId,
  getDescendants,
  getAncestors,
  isDescendant,
  flattenTree,
  computeBoundingBox,
  createFrame,
  createText,
  createRectangle,
  createComponent,
  DEFAULT_AUTO_LAYOUT,
} from '../types/designNodeTypes';

import type {
  DesignNode,
  DesignTree,
  DesignState,
  DesignSelection,
  DesignHistory,
  DesignTransaction,
  DesignChange,
  Constraints,
  AutoLayout,
} from '../types/designNodeTypes';

// =============================================================================
// ACTION TYPES
// =============================================================================

export type DesignAction =
  // Node CRUD
  | { type: 'ADD_NODE'; node: DesignNode; parentId?: string; index?: number }
  | { type: 'DELETE_NODES'; nodeIds: string[] }
  | { type: 'UPDATE_NODE'; nodeId: string; updates: Partial<DesignNode> }
  | { type: 'MOVE_NODE'; nodeId: string; newParentId: string | null; index: number }
  | { type: 'REORDER_CHILDREN'; parentId: string | null; fromIndex: number; toIndex: number }
  | { type: 'DUPLICATE_NODES'; nodeIds: string[] }

  // Selection
  | { type: 'SELECT_NODE'; nodeId: string; addToSelection?: boolean }
  | { type: 'SELECT_NODES'; nodeIds: string[] }
  | { type: 'DESELECT_NODE'; nodeId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SELECT_ALL' }

  // Visibility & Lock
  | { type: 'TOGGLE_VISIBILITY'; nodeId: string }
  | { type: 'TOGGLE_LOCK'; nodeId: string }
  | { type: 'TOGGLE_EXPAND'; nodeId: string }

  // Grouping
  | { type: 'GROUP_NODES'; nodeIds: string[]; groupName?: string }
  | { type: 'UNGROUP_NODE'; nodeId: string }

  // Z-ordering
  | { type: 'BRING_TO_FRONT'; nodeId: string }
  | { type: 'SEND_TO_BACK'; nodeId: string }
  | { type: 'BRING_FORWARD'; nodeId: string }
  | { type: 'SEND_BACKWARD'; nodeId: string }

  // Transform
  | { type: 'SET_POSITION'; nodeId: string; x: number; y: number }
  | { type: 'SET_SIZE'; nodeId: string; width: number; height: number }
  | { type: 'SET_TRANSFORM'; nodeId: string; x: number; y: number; width: number; height: number }

  // Auto Layout
  | { type: 'ENABLE_AUTO_LAYOUT'; nodeId: string; direction?: 'horizontal' | 'vertical' }
  | { type: 'DISABLE_AUTO_LAYOUT'; nodeId: string }
  | { type: 'UPDATE_AUTO_LAYOUT'; nodeId: string; updates: Partial<AutoLayout> }

  // Constraints
  | { type: 'SET_CONSTRAINTS'; nodeId: string; constraints: Constraints }

  // History
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_HISTORY' }

  // Viewport
  | { type: 'SET_VIEWPORT'; x: number; y: number; zoom: number }

  // Bulk operations
  | { type: 'SET_TREE'; tree: DesignTree }
  | { type: 'RESET' };

// =============================================================================
// STATE INTERFACE
// =============================================================================

interface DesignTreeState {
  design: DesignState;
  history: DesignHistory;
  // Track current transaction for batching
  pendingTransaction: DesignTransaction | null;
}

// =============================================================================
// REDUCER
// =============================================================================

function createInitialState(): DesignTreeState {
  return {
    design: createDesignState(),
    history: createDesignHistory(100),
    pendingTransaction: null,
  };
}

function designTreeReducer(state: DesignTreeState, action: DesignAction): DesignTreeState {
  const { design, history } = state;
  const { tree, selection } = design;

  // Helper to record change for undo/redo
  const recordChange = (changes: DesignChange[], description: string): DesignTreeState => {
    const transaction: DesignTransaction = {
      id: generateId(),
      timestamp: Date.now(),
      description,
      changes,
    };

    const newPast = [...history.past, transaction];
    // Limit history size
    while (newPast.length > history.maxSize) {
      newPast.shift();
    }

    return {
      ...state,
      history: {
        ...history,
        past: newPast,
        future: [], // Clear redo stack on new action
      },
    };
  };

  switch (action.type) {
    // =========================================================================
    // NODE CRUD
    // =========================================================================

    case 'ADD_NODE': {
      const { node, parentId, index } = action;
      const newNodes = new Map(tree.nodes);
      const nodeWithParent = { ...node, parentId: parentId ?? null };
      newNodes.set(node.id, nodeWithParent);

      const newRootIds = [...tree.rootIds];

      if (parentId !== undefined) {
        // Add to parent's children
        const parent = newNodes.get(parentId);
        if (parent !== undefined) {
          const children = [...parent.children];
          const insertIndex = index ?? children.length;
          children.splice(insertIndex, 0, node.id);
          newNodes.set(parentId, { ...parent, children });
        }
      } else {
        // Add to root
        const insertIndex = index ?? newRootIds.length;
        newRootIds.splice(insertIndex, 0, node.id);
      }

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
        },
      };

      const historyUpdate = recordChange(
        [{ nodeId: node.id, before: null, after: nodeWithParent }],
        `Add ${node.name}`
      );

      return {
        ...baseState,
        history: historyUpdate.history,
      };
    }

    case 'DELETE_NODES': {
      const { nodeIds } = action;
      const newNodes = new Map(tree.nodes);
      let newRootIds = [...tree.rootIds];
      const changes: DesignChange[] = [];

      // Collect all nodes to delete (including descendants)
      const allToDelete = new Set<string>();
      for (const nodeId of nodeIds) {
        allToDelete.add(nodeId);
        for (const descendantId of getDescendants(tree, nodeId)) {
          allToDelete.add(descendantId);
        }
      }

      // Delete each node
      for (const nodeId of allToDelete) {
        const node = newNodes.get(nodeId);
        if (!node) continue;

        changes.push({ nodeId, before: node, after: null });

        // Remove from parent's children
        if (node.parentId !== null) {
          const parent = newNodes.get(node.parentId);
          if (parent !== undefined) {
            newNodes.set(node.parentId, {
              ...parent,
              children: parent.children.filter((id) => id !== nodeId),
            });
          }
        } else {
          newRootIds = newRootIds.filter((id) => id !== nodeId);
        }

        newNodes.delete(nodeId);
      }

      // Clear selection if deleted nodes were selected
      const newSelection: DesignSelection = {
        nodeIds: selection.nodeIds.filter((id) => !allToDelete.has(id)),
        focusedId:
          selection.focusedId && allToDelete.has(selection.focusedId) ? null : selection.focusedId,
      };

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
          selection: newSelection,
        },
      };

      return {
        ...baseState,
        ...recordChange(changes, `Delete ${String(nodeIds.length)} node(s)`),
      };
    }

    case 'UPDATE_NODE': {
      const { nodeId, updates } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      const updatedNode = { ...node, ...updates } as DesignNode;
      newNodes.set(nodeId, updatedNode);

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };

      return {
        ...baseState,
        ...recordChange([{ nodeId, before: node, after: updatedNode }], `Update ${node.name}`),
      };
    }

    case 'MOVE_NODE': {
      const { nodeId, newParentId, index } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      // Prevent moving into self or descendants
      if (newParentId && (newParentId === nodeId || isDescendant(tree, newParentId, nodeId))) {
        return state;
      }

      const newNodes = new Map(tree.nodes);
      let newRootIds = [...tree.rootIds];

      // Remove from old parent
      if (node.parentId !== null) {
        const oldParent = newNodes.get(node.parentId);
        if (oldParent !== undefined) {
          newNodes.set(node.parentId, {
            ...oldParent,
            children: oldParent.children.filter((id) => id !== nodeId),
          });
        }
      } else {
        newRootIds = newRootIds.filter((id) => id !== nodeId);
      }

      // Add to new parent
      if (newParentId !== null) {
        const newParent = newNodes.get(newParentId);
        if (newParent !== undefined) {
          const children = [...newParent.children];
          children.splice(index, 0, nodeId);
          newNodes.set(newParentId, { ...newParent, children });
        }
      } else {
        newRootIds.splice(index, 0, nodeId);
      }

      // Update node's parent reference
      newNodes.set(nodeId, { ...node, parentId: newParentId });

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
        },
      };

      return {
        ...baseState,
        ...recordChange(
          [{ nodeId, before: node, after: { ...node, parentId: newParentId } }],
          `Move ${node.name}`
        ),
      };
    }

    case 'DUPLICATE_NODES': {
      const { nodeIds } = action;
      const newNodes = new Map(tree.nodes);
      const newRootIds = [...tree.rootIds];
      const changes: DesignChange[] = [];
      const idMap = new Map<string, string>(); // Old ID -> New ID

      // First pass: create new IDs for all nodes being duplicated
      for (const nodeId of nodeIds) {
        const descendants = getDescendants(tree, nodeId);
        idMap.set(nodeId, generateId());
        for (const descId of descendants) {
          idMap.set(descId, generateId());
        }
      }

      // Second pass: duplicate nodes with updated references
      for (const nodeId of nodeIds) {
        const node = tree.nodes.get(nodeId);
        if (!node) continue;

        // Duplicate node and descendants
        const toDuplicate = [nodeId, ...getDescendants(tree, nodeId)];
        for (const oldId of toDuplicate) {
          const oldNode = tree.nodes.get(oldId);
          if (!oldNode) continue;

          const newId = idMap.get(oldId);
          if (!newId) continue;
          const isRoot = oldId === nodeId;

          const newNode: DesignNode = {
            ...oldNode,
            id: newId,
            name: isRoot ? `${oldNode.name} Copy` : oldNode.name,
            parentId: oldNode.parentId ? (idMap.get(oldNode.parentId) ?? oldNode.parentId) : null,
            children: oldNode.children.map((childId) => idMap.get(childId) ?? childId),
            // Offset position slightly for root duplicates
            x: isRoot ? oldNode.x + 20 : oldNode.x,
            y: isRoot ? oldNode.y + 20 : oldNode.y,
          };

          newNodes.set(newId, newNode);
          changes.push({ nodeId: newId, before: null, after: newNode });

          // Add root duplicates to parent or rootIds
          if (isRoot) {
            if (node.parentId !== null) {
              const parent = newNodes.get(node.parentId);
              if (parent !== undefined) {
                const idx = parent.children.indexOf(nodeId);
                const children = [...parent.children];
                children.splice(idx + 1, 0, newId);
                newNodes.set(node.parentId, { ...parent, children });
              }
            } else {
              const idx = newRootIds.indexOf(nodeId);
              newRootIds.splice(idx + 1, 0, newId);
            }
          }
        }
      }

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
          selection: {
            nodeIds: nodeIds
              .map((id) => idMap.get(id))
              .filter((id): id is string => id !== undefined),
            focusedId: (nodeIds[0] !== undefined ? idMap.get(nodeIds[0]) : undefined) ?? null,
          },
        },
      };

      return {
        ...baseState,
        ...recordChange(changes, `Duplicate ${String(nodeIds.length)} node(s)`),
      };
    }

    // =========================================================================
    // SELECTION
    // =========================================================================

    case 'SELECT_NODE': {
      const { nodeId, addToSelection } = action;
      const newNodeIds = addToSelection
        ? selection.nodeIds.includes(nodeId)
          ? selection.nodeIds.filter((id) => id !== nodeId)
          : [...selection.nodeIds, nodeId]
        : [nodeId];

      return {
        ...state,
        design: {
          ...design,
          selection: { nodeIds: newNodeIds, focusedId: nodeId },
        },
      };
    }

    case 'SELECT_NODES': {
      return {
        ...state,
        design: {
          ...design,
          selection: {
            nodeIds: action.nodeIds,
            focusedId: action.nodeIds[0] ?? null,
          },
        },
      };
    }

    case 'DESELECT_NODE': {
      const newNodeIds = selection.nodeIds.filter((id) => id !== action.nodeId);
      return {
        ...state,
        design: {
          ...design,
          selection: {
            nodeIds: newNodeIds,
            focusedId: newNodeIds[0] ?? null,
          },
        },
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        design: {
          ...design,
          selection: { nodeIds: [], focusedId: null },
        },
      };
    }

    case 'SELECT_ALL': {
      const allNodeIds = Array.from(tree.nodes.keys());
      return {
        ...state,
        design: {
          ...design,
          selection: {
            nodeIds: allNodeIds,
            focusedId: allNodeIds[0] ?? null,
          },
        },
      };
    }

    // =========================================================================
    // VISIBILITY & LOCK
    // =========================================================================

    case 'TOGGLE_VISIBILITY': {
      const node = tree.nodes.get(action.nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(action.nodeId, { ...node, visible: !node.visible });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    case 'TOGGLE_LOCK': {
      const node = tree.nodes.get(action.nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(action.nodeId, { ...node, locked: !node.locked });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    case 'TOGGLE_EXPAND': {
      const node = tree.nodes.get(action.nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(action.nodeId, { ...node, expanded: !node.expanded });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    // =========================================================================
    // GROUPING
    // =========================================================================

    case 'GROUP_NODES': {
      const { nodeIds, groupName } = action;
      if (nodeIds.length === 0) return state;

      const newNodes = new Map(tree.nodes);
      let newRootIds = [...tree.rootIds];

      // Find common parent
      const firstNodeId = nodeIds[0];
      if (firstNodeId === undefined) return state;
      const firstNode = tree.nodes.get(firstNodeId);
      if (!firstNode) return state;
      const commonParentId = firstNode.parentId;

      // Calculate bounding box
      const bbox = computeBoundingBox(tree, nodeIds);
      if (!bbox) return state;

      // Create group frame
      const groupFrame = createFrame(groupName ?? 'Group', {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        parentId: commonParentId,
        children: nodeIds,
      });

      // Add group to tree
      newNodes.set(groupFrame.id, groupFrame);

      // Update children to point to new group
      for (const nodeId of nodeIds) {
        const node = newNodes.get(nodeId);
        if (node !== undefined) {
          // Convert to relative position
          newNodes.set(nodeId, {
            ...node,
            parentId: groupFrame.id,
            x: node.x - bbox.x,
            y: node.y - bbox.y,
          });
        }
      }

      // Update parent's children or rootIds
      if (commonParentId !== null) {
        const parent = newNodes.get(commonParentId);
        if (parent !== undefined) {
          const newChildren = parent.children.filter((id) => !nodeIds.includes(id));
          // Insert group at position of first node
          const firstIndex = parent.children.indexOf(firstNodeId);
          newChildren.splice(firstIndex, 0, groupFrame.id);
          newNodes.set(commonParentId, { ...parent, children: newChildren });
        }
      } else {
        newRootIds = newRootIds.filter((id) => !nodeIds.includes(id));
        const firstIndex = tree.rootIds.indexOf(firstNodeId);
        newRootIds.splice(firstIndex, 0, groupFrame.id);
      }

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
          selection: { nodeIds: [groupFrame.id], focusedId: groupFrame.id },
        },
      };

      return {
        ...baseState,
        ...recordChange(
          [{ nodeId: groupFrame.id, before: null, after: groupFrame }],
          'Group nodes'
        ),
      };
    }

    case 'UNGROUP_NODE': {
      const { nodeId } = action;
      const node = tree.nodes.get(nodeId);
      if (node?.type !== 'frame' || node.children.length === 0) return state;

      const newNodes = new Map(tree.nodes);
      const newRootIds = [...tree.rootIds];
      const changes: DesignChange[] = [];

      // Move children to parent level with absolute positions
      for (const childId of node.children) {
        const child = newNodes.get(childId);
        if (child !== undefined) {
          const updatedChild = {
            ...child,
            parentId: node.parentId,
            x: child.x + node.x,
            y: child.y + node.y,
          };
          newNodes.set(childId, updatedChild);
          changes.push({ nodeId: childId, before: child, after: updatedChild });
        }
      }

      // Add children to parent's children or rootIds
      if (node.parentId !== null) {
        const parent = newNodes.get(node.parentId);
        if (parent !== undefined) {
          const idx = parent.children.indexOf(nodeId);
          const newChildren = [...parent.children];
          newChildren.splice(idx, 1, ...node.children);
          newNodes.set(node.parentId, { ...parent, children: newChildren });
        }
      } else {
        const idx = newRootIds.indexOf(nodeId);
        newRootIds.splice(idx, 1, ...node.children);
      }

      // Delete the group
      changes.push({ nodeId, before: node, after: null });
      newNodes.delete(nodeId);

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
          selection: { nodeIds: node.children, focusedId: node.children[0] ?? null },
        },
      };

      return {
        ...baseState,
        ...recordChange(changes, 'Ungroup'),
      };
    }

    // =========================================================================
    // Z-ORDERING
    // =========================================================================

    case 'BRING_TO_FRONT':
    case 'SEND_TO_BACK':
    case 'BRING_FORWARD':
    case 'SEND_BACKWARD': {
      const { nodeId } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      let siblings: string[];
      let currentIndex: number;

      if (node.parentId !== null) {
        const parent = newNodes.get(node.parentId);
        if (parent === undefined) return state;
        siblings = [...parent.children];
        currentIndex = siblings.indexOf(nodeId);
      } else {
        siblings = [...tree.rootIds];
        currentIndex = siblings.indexOf(nodeId);
      }

      // Calculate new index
      let newIndex: number;
      switch (action.type) {
        case 'BRING_TO_FRONT':
          newIndex = siblings.length - 1;
          break;
        case 'SEND_TO_BACK':
          newIndex = 0;
          break;
        case 'BRING_FORWARD':
          newIndex = Math.min(currentIndex + 1, siblings.length - 1);
          break;
        case 'SEND_BACKWARD':
          newIndex = Math.max(currentIndex - 1, 0);
          break;
      }

      if (newIndex === currentIndex) return state;

      // Reorder
      siblings.splice(currentIndex, 1);
      siblings.splice(newIndex, 0, nodeId);

      if (node.parentId !== null) {
        const parent = newNodes.get(node.parentId);
        if (parent !== undefined) {
          newNodes.set(node.parentId, { ...parent, children: siblings });
        }
      }

      return {
        ...state,
        design: {
          ...design,
          tree: {
            nodes: newNodes,
            rootIds: node.parentId ? tree.rootIds : siblings,
          },
        },
      };
    }

    // =========================================================================
    // TRANSFORM
    // =========================================================================

    case 'SET_POSITION': {
      const { nodeId, x, y } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(nodeId, { ...node, x, y });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    case 'SET_SIZE': {
      const { nodeId, width, height } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(nodeId, { ...node, width, height });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    case 'SET_TRANSFORM': {
      const { nodeId, x, y, width, height } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(nodeId, { ...node, x, y, width, height });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    // =========================================================================
    // AUTO LAYOUT
    // =========================================================================

    case 'ENABLE_AUTO_LAYOUT': {
      const { nodeId, direction } = action;
      const node = tree.nodes.get(nodeId);
      if (node?.type !== 'frame') return state;

      const newNodes = new Map(tree.nodes);
      const frameNode = node;
      newNodes.set(nodeId, {
        ...frameNode,
        autoLayout: {
          ...DEFAULT_AUTO_LAYOUT,
          enabled: true,
          direction: direction ?? 'vertical',
        },
      });

      const baseState: DesignTreeState = {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };

      return {
        ...baseState,
        ...recordChange(
          [{ nodeId, before: node, after: newNodes.get(nodeId) ?? node }],
          'Enable Auto Layout'
        ),
      };
    }

    case 'DISABLE_AUTO_LAYOUT': {
      const { nodeId } = action;
      const node = tree.nodes.get(nodeId);
      if (node?.type !== 'frame') return state;

      const newNodes = new Map(tree.nodes);
      const frameNode = node;
      newNodes.set(nodeId, {
        ...frameNode,
        ...(frameNode.autoLayout !== undefined
          ? {
              autoLayout: { ...frameNode.autoLayout, enabled: false },
            }
          : {}),
      });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    case 'UPDATE_AUTO_LAYOUT': {
      const { nodeId, updates } = action;
      const node = tree.nodes.get(nodeId);
      if (node?.type !== 'frame') return state;

      const newNodes = new Map(tree.nodes);
      const frameNode = node;
      newNodes.set(nodeId, {
        ...frameNode,
        autoLayout: {
          ...(frameNode.autoLayout ?? DEFAULT_AUTO_LAYOUT),
          ...updates,
        },
      });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    // =========================================================================
    // CONSTRAINTS
    // =========================================================================

    case 'SET_CONSTRAINTS': {
      const { nodeId, constraints } = action;
      const node = tree.nodes.get(nodeId);
      if (!node) return state;

      const newNodes = new Map(tree.nodes);
      newNodes.set(nodeId, { ...node, constraints });

      return {
        ...state,
        design: {
          ...design,
          tree: { ...tree, nodes: newNodes },
        },
      };
    }

    // =========================================================================
    // HISTORY
    // =========================================================================

    case 'UNDO': {
      if (history.past.length === 0) return state;

      const lastTransaction = history.past[history.past.length - 1];
      const newNodes = new Map(tree.nodes);
      let newRootIds = [...tree.rootIds];

      // Apply changes in reverse
      if (lastTransaction) {
        for (let i = lastTransaction.changes.length - 1; i >= 0; i--) {
          const change = lastTransaction.changes[i];
          if (!change) continue;

          if (change.before === null) {
            // Node was created, delete it
            newNodes.delete(change.nodeId);
            newRootIds = newRootIds.filter((id) => id !== change.nodeId);
          } else if (change.after === null) {
            // Node was deleted, restore it
            newNodes.set(change.nodeId, change.before as DesignNode);
            if (!(change.before as DesignNode).parentId) {
              newRootIds.push(change.nodeId);
            }
          } else {
            // Node was modified, restore previous state
            const currentNode = newNodes.get(change.nodeId);
            if (currentNode !== undefined) {
              newNodes.set(change.nodeId, { ...currentNode, ...change.before } as DesignNode);
            }
          }
        }
      }

      return {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
        },
        history: {
          ...history,
          past: history.past.slice(0, -1),
          ...(lastTransaction && { future: [lastTransaction, ...history.future] }),
        },
      };
    }

    case 'REDO': {
      if (history.future.length === 0) return state;

      const nextTransaction = history.future[0];
      const newNodes = new Map(tree.nodes);
      let newRootIds = [...tree.rootIds];

      // Apply changes forward
      if (nextTransaction) {
        for (const change of nextTransaction.changes) {
          if (change.after === null) {
            // Node should be deleted
            newNodes.delete(change.nodeId);
            newRootIds = newRootIds.filter((id) => id !== change.nodeId);
          } else if (change.before === null) {
            // Node should be created
            newNodes.set(change.nodeId, change.after as DesignNode);
            if (!(change.after as DesignNode).parentId) {
              newRootIds.push(change.nodeId);
            }
          } else {
            // Node should be modified
            const currentNode = newNodes.get(change.nodeId);
            if (currentNode !== undefined) {
              newNodes.set(change.nodeId, { ...currentNode, ...change.after } as DesignNode);
            }
          }
        }
      }

      return {
        ...state,
        design: {
          ...design,
          tree: { nodes: newNodes, rootIds: newRootIds },
        },
        history: {
          ...history,
          ...(nextTransaction && { past: [...history.past, nextTransaction] }),
          future: history.future.slice(1),
        },
      };
    }

    case 'CLEAR_HISTORY': {
      return {
        ...state,
        history: createDesignHistory(history.maxSize),
      };
    }

    // =========================================================================
    // VIEWPORT
    // =========================================================================

    case 'SET_VIEWPORT': {
      return {
        ...state,
        design: {
          ...design,
          viewport: { x: action.x, y: action.y, zoom: action.zoom },
        },
      };
    }

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    case 'SET_TREE': {
      return {
        ...state,
        design: {
          ...design,
          tree: action.tree,
        },
      };
    }

    case 'RESET': {
      return createInitialState();
    }

    case 'REORDER_CHILDREN': {
      const { parentId, fromIndex, toIndex } = action;
      const newNodes = new Map(tree.nodes);

      if (parentId !== null) {
        // Reorder within a parent's children
        const parent = newNodes.get(parentId);
        if (parent !== undefined) {
          const children = [...parent.children];
          const [movedChild] = children.splice(fromIndex, 1);
          if (movedChild !== undefined) {
            children.splice(toIndex, 0, movedChild);
          }
          newNodes.set(parentId, { ...parent, children });
        }
      } else {
        // Reorder root nodes
        const newRootIds = [...tree.rootIds];
        const [movedRoot] = newRootIds.splice(fromIndex, 1);
        if (movedRoot !== undefined) {
          newRootIds.splice(toIndex, 0, movedRoot);
        }
        return {
          ...state,
          design: {
            ...design,
            tree: {
              ...tree,
              rootIds: newRootIds,
            },
          },
        };
      }

      return {
        ...state,
        design: {
          ...design,
          tree: {
            ...tree,
            nodes: newNodes,
          },
        },
      };
    }

    default:
      return state;
  }
}

// =============================================================================
// HOOK
// =============================================================================

export interface UseDesignTreeReturn {
  // State
  tree: DesignTree;
  selection: DesignSelection;
  viewport: { x: number; y: number; zoom: number };

  // Computed
  selectedNodes: DesignNode[];
  flattenedNodes: DesignNode[];
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  dispatch: React.Dispatch<DesignAction>;

  // Convenience methods
  addFrame: (name?: string, parentId?: string) => DesignNode;
  addText: (content?: string, parentId?: string) => DesignNode;
  addRectangle: (name?: string, parentId?: string) => DesignNode;
  addComponent: (name: string, code: string, parentId?: string) => DesignNode;

  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: (name?: string) => void;
  ungroupSelected: () => void;

  selectNode: (nodeId: string, addToSelection?: boolean) => void;
  clearSelection: () => void;

  updateNode: (nodeId: string, updates: Partial<DesignNode>) => void;
  setPosition: (nodeId: string, x: number, y: number) => void;
  setSize: (nodeId: string, width: number, height: number) => void;

  undo: () => void;
  redo: () => void;

  // Queries
  getNode: (nodeId: string) => DesignNode | undefined;
  getParent: (nodeId: string) => DesignNode | undefined;
  getChildren: (nodeId: string) => DesignNode[];
  getAncestors: (nodeId: string) => DesignNode[];
  getDescendants: (nodeId: string) => DesignNode[];
}

export function useDesignTree(): UseDesignTreeReturn {
  const [state, dispatch] = useReducer(designTreeReducer, undefined, createInitialState);
  const { design, history } = state;
  const { tree, selection, viewport } = design;

  // Computed values
  const selectedNodes = useMemo(
    () =>
      selection.nodeIds
        .map((id) => tree.nodes.get(id))
        .filter((n): n is DesignNode => n !== undefined),
    [tree.nodes, selection.nodeIds]
  );

  const flattenedNodes = useMemo(() => flattenTree(tree), [tree]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // Convenience methods
  const addFrame = useCallback((name?: string, parentId?: string): DesignNode => {
    const frame = createFrame(name);
    dispatch({ type: 'ADD_NODE', node: frame, ...(parentId !== undefined && { parentId }) });
    return frame;
  }, []);

  const addText = useCallback((content?: string, parentId?: string): DesignNode => {
    const text = createText(content);
    dispatch({ type: 'ADD_NODE', node: text, ...(parentId !== undefined && { parentId }) });
    return text;
  }, []);

  const addRectangle = useCallback((name?: string, parentId?: string): DesignNode => {
    const rect = createRectangle(name);
    dispatch({ type: 'ADD_NODE', node: rect, ...(parentId !== undefined && { parentId }) });
    return rect;
  }, []);

  const addComponent = useCallback((name: string, code: string, parentId?: string): DesignNode => {
    const component = createComponent(name, code);
    dispatch({ type: 'ADD_NODE', node: component, ...(parentId !== undefined && { parentId }) });
    return component;
  }, []);

  const deleteSelected = useCallback(() => {
    if (selection.nodeIds.length > 0) {
      dispatch({ type: 'DELETE_NODES', nodeIds: selection.nodeIds });
    }
  }, [selection.nodeIds]);

  const duplicateSelected = useCallback(() => {
    if (selection.nodeIds.length > 0) {
      dispatch({ type: 'DUPLICATE_NODES', nodeIds: selection.nodeIds });
    }
  }, [selection.nodeIds]);

  const groupSelected = useCallback(
    (name?: string) => {
      if (selection.nodeIds.length > 1) {
        dispatch({
          type: 'GROUP_NODES',
          nodeIds: selection.nodeIds,
          ...(name !== undefined && { groupName: name }),
        });
      }
    },
    [selection.nodeIds]
  );

  const ungroupSelected = useCallback(() => {
    const firstNodeId = selection.nodeIds[0];
    if (selection.nodeIds.length === 1 && firstNodeId !== undefined) {
      dispatch({ type: 'UNGROUP_NODE', nodeId: firstNodeId });
    }
  }, [selection.nodeIds]);

  const selectNode = useCallback((nodeId: string, addToSelection?: boolean) => {
    dispatch({
      type: 'SELECT_NODE',
      nodeId,
      ...(addToSelection !== undefined && { addToSelection }),
    });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<DesignNode>) => {
    dispatch({ type: 'UPDATE_NODE', nodeId, updates });
  }, []);

  const setPosition = useCallback((nodeId: string, x: number, y: number) => {
    dispatch({ type: 'SET_POSITION', nodeId, x, y });
  }, []);

  const setSize = useCallback((nodeId: string, width: number, height: number) => {
    dispatch({ type: 'SET_SIZE', nodeId, width, height });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  // Query methods
  const getNode = useCallback((nodeId: string) => tree.nodes.get(nodeId), [tree.nodes]);

  const getParent = useCallback(
    (nodeId: string) => {
      const node = tree.nodes.get(nodeId);
      return node?.parentId ? tree.nodes.get(node.parentId) : undefined;
    },
    [tree.nodes]
  );

  const getChildren = useCallback(
    (nodeId: string) => {
      const node = tree.nodes.get(nodeId);
      if (!node) return [];
      return node.children
        .map((id) => tree.nodes.get(id))
        .filter((n): n is DesignNode => n !== undefined);
    },
    [tree.nodes]
  );

  const getAncestorsNodes = useCallback(
    (nodeId: string) => {
      return getAncestors(tree, nodeId)
        .map((id) => tree.nodes.get(id))
        .filter((n): n is DesignNode => n !== undefined);
    },
    [tree]
  );

  const getDescendantsNodes = useCallback(
    (nodeId: string) => {
      return getDescendants(tree, nodeId)
        .map((id) => tree.nodes.get(id))
        .filter((n): n is DesignNode => n !== undefined);
    },
    [tree]
  );

  return {
    tree,
    selection,
    viewport,

    selectedNodes,
    flattenedNodes,
    canUndo,
    canRedo,

    dispatch,

    addFrame,
    addText,
    addRectangle,
    addComponent,

    deleteSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,

    selectNode,
    clearSelection,

    updateNode,
    setPosition,
    setSize,

    undo,
    redo,

    getNode,
    getParent,
    getChildren,
    getAncestors: getAncestorsNodes,
    getDescendants: getDescendantsNodes,
  };
}
