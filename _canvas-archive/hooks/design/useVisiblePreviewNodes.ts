/**
 * useVisiblePreviewNodes - Track which preview nodes are visible in the viewport
 *
 * Uses ReactFlow viewport changes and node positions to determine
 * which nodes are currently visible and should be active.
 */
import { useReactFlow, useStore } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';

import type { Node } from '@xyflow/react';

interface UseVisiblePreviewNodesOptions {
  /** Extra margin around viewport for preloading (default: 100px) */
  margin?: number;
  /** Debounce delay for visibility updates (default: 100ms) */
  debounceMs?: number;
}

interface VisiblePreviewNodesResult {
  /** Set of node IDs that are currently visible */
  visibleNodeIds: Set<string>;
  /** Check if a specific node is visible */
  isNodeVisible: (nodeId: string) => boolean;
}

/**
 * Hook to track which Sandpack/preview nodes are visible in the ReactFlow viewport
 */
export function useVisiblePreviewNodes(
  options: UseVisiblePreviewNodesOptions = {}
): VisiblePreviewNodesResult {
  const { margin = 100, debounceMs = 100 } = options;

  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set());
  const { getViewport, getNodes } = useReactFlow();

  // Subscribe to viewport and node changes
  const viewportSelector = useStore((state) => ({
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
  }));

  const nodesSelector = useStore((state) => state.nodes);

  const calculateVisibleNodes = useCallback(() => {
    const nodes = getNodes();
    const viewport = getViewport();

    // Get viewport bounds in flow coordinates
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Convert screen bounds to flow coordinates
    const viewportBounds = {
      left: (-viewport.x - margin) / viewport.zoom,
      top: (-viewport.y - margin) / viewport.zoom,
      right: (viewportWidth - viewport.x + margin) / viewport.zoom,
      bottom: (viewportHeight - viewport.y + margin) / viewport.zoom,
    };

    const visible = new Set<string>();

    for (const node of nodes) {
      // Only track sandpack/live preview nodes
      if (node.type !== 'sandpack' && node.type !== 'live-sandpack') {
        continue;
      }

      const nodeWidth = node.measured?.width ?? node.width ?? 300;
      const nodeHeight = node.measured?.height ?? node.height ?? 200;

      // Check if node overlaps with viewport
      const nodeLeft = node.position.x;
      const nodeTop = node.position.y;
      const nodeRight = nodeLeft + nodeWidth;
      const nodeBottom = nodeTop + nodeHeight;

      const isVisible =
        nodeRight >= viewportBounds.left &&
        nodeLeft <= viewportBounds.right &&
        nodeBottom >= viewportBounds.top &&
        nodeTop <= viewportBounds.bottom;

      if (isVisible) {
        visible.add(node.id);
      }
    }

    setVisibleNodeIds(visible);
  }, [getNodes, getViewport, margin]);

  // Debounced visibility calculation
  useEffect(() => {
    const timeoutId = setTimeout(calculateVisibleNodes, debounceMs);
    return (): void => {
      clearTimeout(timeoutId);
    };
  }, [
    viewportSelector.x,
    viewportSelector.y,
    viewportSelector.zoom,
    nodesSelector,
    calculateVisibleNodes,
    debounceMs,
  ]);

  // Initial calculation
  useEffect(() => {
    calculateVisibleNodes();
  }, [calculateVisibleNodes]);

  const isNodeVisible = useCallback(
    (nodeId: string): boolean => visibleNodeIds.has(nodeId),
    [visibleNodeIds]
  );

  return {
    visibleNodeIds,
    isNodeVisible,
  };
}

/**
 * Get visible nodes from a node array (for use outside ReactFlow context)
 */
export function getVisibleNodes(
  nodes: Node[],
  viewport: { x: number; y: number; zoom: number },
  screenWidth: number,
  screenHeight: number,
  margin = 100
): Set<string> {
  const viewportBounds = {
    left: (-viewport.x - margin) / viewport.zoom,
    top: (-viewport.y - margin) / viewport.zoom,
    right: (screenWidth - viewport.x + margin) / viewport.zoom,
    bottom: (screenHeight - viewport.y + margin) / viewport.zoom,
  };

  const visible = new Set<string>();

  for (const node of nodes) {
    if (node.type !== 'sandpack' && node.type !== 'live-sandpack') {
      continue;
    }

    const nodeWidth = node.measured?.width ?? node.width ?? 300;
    const nodeHeight = node.measured?.height ?? node.height ?? 200;

    const nodeLeft = node.position.x;
    const nodeTop = node.position.y;
    const nodeRight = nodeLeft + nodeWidth;
    const nodeBottom = nodeTop + nodeHeight;

    const isVisible =
      nodeRight >= viewportBounds.left &&
      nodeLeft <= viewportBounds.right &&
      nodeBottom >= viewportBounds.top &&
      nodeTop <= viewportBounds.bottom;

    if (isVisible) {
      visible.add(node.id);
    }
  }

  return visible;
}
