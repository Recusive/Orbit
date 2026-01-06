/**
 * useDesignEffects Hook
 *
 * Handles synchronization between the Design Tree and ReactFlow canvas.
 * Extracted from CanvasApp.tsx for better separation of concerns.
 *
 * Responsibilities:
 * - Convert design tree nodes to ReactFlow nodes
 * - Sync ReactFlow nodes to design tree (component nodes)
 * - Bidirectional selection synchronization
 * - Canvas state sync to extension host
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { UseDesignTreeReturn } from './useDesignTree';
import type { SandpackNodeData } from '../../sandpack/SandpackNode';
import type { DesignNode } from '../../types/designNodeTypes';
import type { PageNodeData } from '../../types/pageTypes';
import type { UseTauriCanvasResult } from '../canvas/useTauriCanvas';
import type { Node, Edge } from '@xyflow/react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseDesignEffectsOptions {
  /** Design tree state and actions */
  designTree: UseDesignTreeReturn;
  /** ReactFlow nodes */
  nodes: Node[];
  /** ReactFlow edges */
  edges: Edge[];
  /** Currently selected node ID from canvas actions */
  selectedNodeId: string | null;
  /** Set selected node ID */
  setSelectedNodeId: (id: string | null) => void;
  /** Messaging hook for Tauri backend communication */
  messaging: UseTauriCanvasResult;
  /** Whether initial state has been loaded */
  isStateLoaded: boolean;
  /** Callback for design node updates (passed to ReactFlow nodes) */
  onDesignNodeUpdate: (nodeId: string, updates: Partial<DesignNode>) => void;
  /** Callback to start text editing */
  onStartTextEdit: (nodeId: string) => void;
}

export interface UseDesignEffectsReturn {
  /** ReactFlow nodes converted from design tree (design primitives only) */
  designNodesList: Node[];
  /** All nodes to render (Sandpack nodes + design nodes) */
  nodesToRender: Node[];
  /** Set of synced node IDs (Sandpack/Page nodes tracked in design tree) */
  syncedNodeIds: Set<string>;
  /** Get absolute position for a design node (walks parent chain) */
  getAbsolutePosition: (nodeId: string) => { x: number; y: number };
}

// =============================================================================
// HOOK
// =============================================================================

export function useDesignEffects(options: UseDesignEffectsOptions): UseDesignEffectsReturn {
  const {
    designTree,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    messaging,
    isStateLoaded,
    onDesignNodeUpdate,
    onStartTextEdit,
  } = options;

  // Track which ReactFlow node IDs have been synced to the design tree
  const syncedNodeIdsRef = useRef<Set<string>>(new Set());

  // Track last canvas selection to detect explicit clears
  const lastCanvasSelectionRef = useRef<string | null>(null);

  // Track last canvas state fingerprint to prevent duplicate sends
  const lastCanvasStateRef = useRef<string>('');

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Calculate absolute position by walking up the parent chain.
   * Design nodes store relative positions; this converts to canvas coordinates.
   */
  const getAbsolutePosition = useCallback(
    (nodeId: string): { x: number; y: number } => {
      const node = designTree.tree.nodes.get(nodeId);
      if (node === undefined) return { x: 0, y: 0 };

      let x = node.x;
      let y = node.y;
      let parentId = node.parentId;

      while (parentId !== null) {
        const parent = designTree.tree.nodes.get(parentId);
        if (parent === undefined) break;
        x += parent.x;
        y += parent.y;
        parentId = parent.parentId;
      }

      return { x, y };
    },
    [designTree.tree.nodes]
  );

  // =========================================================================
  // MEMOIZED NODE LISTS
  // =========================================================================

  /**
   * Convert design tree nodes to ReactFlow nodes (for design primitives).
   * Component nodes are handled separately via Sandpack nodes.
   */
  const designNodesList = useMemo((): Node[] => {
    const rfNodes: Node[] = [];
    for (const [id, designNode] of designTree.tree.nodes) {
      // Skip component nodes (they are synced to Sandpack nodes)
      if (designNode.type === 'component') continue;

      // Calculate absolute position for all nodes (including children)
      const absolutePos = getAbsolutePosition(id);

      rfNodes.push({
        id: `design-${id}`,
        type: 'design',
        position: absolutePos,
        data: {
          designNode,
          onUpdate: onDesignNodeUpdate,
          onStartEdit: onStartTextEdit,
        },
        style: { width: designNode.width, height: designNode.height },
        draggable: !designNode.locked,
        // Z-index: parents render behind children
        zIndex: designNode.parentId === null ? 0 : 1,
      });
    }
    return rfNodes;
  }, [designTree.tree.nodes, onDesignNodeUpdate, onStartTextEdit, getAbsolutePosition]);

  /**
   * Combine Sandpack/Page nodes with design nodes for unified rendering.
   * In workflow mode, this returns empty (WorkflowCanvas handles its own nodes).
   */
  const nodesToRender = useMemo((): Node[] => {
    // Code/Design mode: show both Sandpack nodes and design primitives
    return [...nodes, ...designNodesList];
  }, [nodes, designNodesList]);

  // =========================================================================
  // SYNC EFFECTS
  // =========================================================================

  /**
   * Sync ReactFlow nodes to Design Tree.
   * Creates DesignNodes for Sandpack/Page nodes so they appear in the layer tree.
   */
  useEffect(() => {
    const currentNodeIds = new Set(nodes.map((n) => n.id));

    // Add new nodes to design tree
    for (const node of nodes) {
      // Check both our tracking ref AND the actual design tree to prevent duplicates
      if (!syncedNodeIdsRef.current.has(node.id) && !designTree.tree.nodes.has(node.id)) {
        const data = node.data as SandpackNodeData | PageNodeData;
        const label: string =
          'label' in data && typeof data.label === 'string'
            ? data.label
            : 'name' in data && typeof data.name === 'string'
              ? data.name
              : '';

        // Get the code if this is a SandpackNode
        const code: string = 'code' in data && typeof data.code === 'string' ? data.code : '';

        designTree.dispatch({
          type: 'ADD_NODE',
          node: {
            id: node.id, // Use same ID as ReactFlow node
            name: label,
            type: 'component',
            parentId: null,
            children: [],
            x: node.position.x,
            y: node.position.y,
            width: 300,
            height: 200,
            rotation: 0,
            constraints: { horizontal: 'left', vertical: 'top' },
            visible: true,
            locked: false,
            opacity: 1,
            expanded: true,
            fills: [],
            strokes: [],
            cornerRadius: 0,
            effects: { shadows: [] },
            clipContent: false,
            componentProps: {
              code,
              props: {},
            },
          },
        });
        syncedNodeIdsRef.current.add(node.id);
      }
    }

    // Remove deleted nodes from design tree
    for (const id of syncedNodeIdsRef.current) {
      if (!currentNodeIds.has(id)) {
        designTree.dispatch({ type: 'DELETE_NODES', nodeIds: [id] });
        syncedNodeIdsRef.current.delete(id);
      }
    }
  }, [nodes, designTree]);

  /**
   * Sync selection: design tree → canvas.
   * When design tree selection changes, update canvas selection.
   */
  useEffect(() => {
    const { focusedId: designFocusedId } = designTree.selection;

    if (designFocusedId !== null) {
      // Determine the ReactFlow node ID for this design node
      const reactFlowId = syncedNodeIdsRef.current.has(designFocusedId)
        ? designFocusedId // Synced nodes (Sandpack/Page) use same ID
        : `design-${designFocusedId}`; // Design-only nodes have prefix

      if (selectedNodeId !== reactFlowId) {
        setSelectedNodeId(reactFlowId);
      }
    }
  }, [designTree.selection, selectedNodeId, setSelectedNodeId]);

  /**
   * Sync selection: canvas → design tree.
   * When canvas selection changes, update design tree selection.
   */
  useEffect(() => {
    const hadSelection = lastCanvasSelectionRef.current !== null;
    lastCanvasSelectionRef.current = selectedNodeId;

    if (selectedNodeId !== null) {
      // Canvas has a selection - sync to design tree
      // Strip 'design-' prefix for design nodes to get actual design tree ID
      const designId = selectedNodeId.startsWith('design-')
        ? selectedNodeId.slice(7)
        : selectedNodeId;

      if (designTree.selection.focusedId !== designId) {
        designTree.selectNode(designId);
      }
    } else if (hadSelection) {
      // Canvas selection was explicitly cleared (had selection, now null)
      designTree.clearSelection();
    }
  }, [selectedNodeId, designTree]);

  /**
   * Sync canvas state to extension host.
   * Debounced via fingerprint comparison to prevent rapid-fire updates.
   */
  useEffect(() => {
    if (!isStateLoaded) return;

    // Determine selected node type
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedNodeType = selectedNode?.type === 'page' ? 'page' : 'sandpack';

    // Create a fingerprint to detect actual changes (ignore position updates)
    const fingerprint = JSON.stringify({
      nodeIds: nodes.map((n) => n.id).sort(),
      edgeIds: edges.map((e) => e.id).sort(),
      selectedNodeId,
    });

    // Only send if state actually changed
    if (fingerprint === lastCanvasStateRef.current) {
      return;
    }
    lastCanvasStateRef.current = fingerprint;

    messaging.sendCanvasState(
      nodes,
      edges,
      selectedNodeId ?? undefined,
      selectedNodeId !== null ? selectedNodeType : undefined
    );
  }, [nodes, edges, selectedNodeId, isStateLoaded, messaging]);

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    designNodesList,
    nodesToRender,
    syncedNodeIds: syncedNodeIdsRef.current,
    getAbsolutePosition,
  };
}
