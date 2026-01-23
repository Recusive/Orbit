/**
 * Layer Utilities for Design System Canvas
 *
 * Utilities for z-index computation, tree traversal, and layer operations.
 */

import type { LayerItem, LayerTree, LayerType } from '../../types/layerTypes';

/**
 * Generate a unique layer ID
 */
export function generateLayerId(type: LayerType): string {
  return `layer-${type}-${String(Date.now())}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new layer item with defaults
 */
export function createLayer(
  type: LayerType,
  name: string,
  parentId: string | null = null,
  nodeId?: string
): LayerItem {
  return {
    id: generateLayerId(type),
    name,
    type,
    parentId,
    children: [],
    order: 0,
    visible: true,
    locked: false,
    expanded: true,
    position: { mode: 'flow' },
    zIndex: 0,
    nodeId: nodeId ?? '',
  };
}

/**
 * Compute z-index values for all layers based on tree position
 * Layers higher in the tree (later siblings) have higher z-index
 */
export function computeZIndices(tree: LayerTree): Map<string, number> {
  const zIndices = new Map<string, number>();
  let currentZ = 0;

  function traverse(layerId: string): void {
    const layer = tree.items.get(layerId);
    if (layer === undefined) return;

    // Assign z-index (can be overridden by zIndexOverride)
    zIndices.set(layerId, layer.zIndexOverride ?? currentZ);
    currentZ++;

    // Process children in order
    const sortedChildren = [...layer.children].sort((a, b) => {
      const layerA = tree.items.get(a);
      const layerB = tree.items.get(b);
      const orderA = layerA?.order;
      const orderB = layerB?.order;
      return (orderA ?? 0) - (orderB ?? 0);
    });

    for (const childId of sortedChildren) {
      traverse(childId);
    }
  }

  // Start from root if exists
  if (tree.root !== null) {
    traverse(tree.root);
  } else {
    // No root, traverse all top-level layers
    const topLevel = Array.from(tree.items.values())
      .filter((l) => l.parentId === null)
      .sort((a, b) => a.order - b.order);

    for (const layer of topLevel) {
      traverse(layer.id);
    }
  }

  return zIndices;
}

/**
 * Get all descendants of a layer (recursive)
 */
export function getDescendants(tree: LayerTree, layerId: string): string[] {
  const descendants: string[] = [];
  const layer = tree.items.get(layerId);
  if (layer === undefined) return descendants;

  function collect(id: string): void {
    const l = tree.items.get(id);
    if (l === undefined) return;

    for (const childId of l.children) {
      descendants.push(childId);
      collect(childId);
    }
  }

  collect(layerId);
  return descendants;
}

/**
 * Get all ancestors of a layer (from parent to root)
 */
export function getAncestors(tree: LayerTree, layerId: string): string[] {
  const ancestors: string[] = [];
  let current = tree.items.get(layerId);

  while (current?.parentId) {
    ancestors.push(current.parentId);
    current = tree.items.get(current.parentId);
  }

  return ancestors;
}

/**
 * Get siblings of a layer (layers with same parent)
 */
export function getSiblings(tree: LayerTree, layerId: string): LayerItem[] {
  const layer = tree.items.get(layerId);
  if (!layer) return [];

  if (layer.parentId === null) {
    // Top-level layer - siblings are other top-level layers
    return Array.from(tree.items.values())
      .filter((l) => l.parentId === null && l.id !== layerId)
      .sort((a, b) => a.order - b.order);
  }

  const parent = tree.items.get(layer.parentId);
  if (!parent) return [];

  return parent.children
    .filter((id) => id !== layerId)
    .map((id) => tree.items.get(id))
    .filter((l): l is LayerItem => l !== undefined)
    .sort((a, b) => a.order - b.order);
}

/**
 * Flatten tree to array in display order (depth-first)
 */
export function flattenTree(tree: LayerTree): LayerItem[] {
  const result: LayerItem[] = [];

  function traverse(layerId: string, depth: number): void {
    const layer = tree.items.get(layerId);
    if (layer === undefined) return;

    result.push(layer);

    if (layer.expanded) {
      const sortedChildren = [...layer.children].sort((a, b) => {
        const la = tree.items.get(a);
        const lb = tree.items.get(b);
        const orderA = la?.order;
        const orderB = lb?.order;
        return (orderA ?? 0) - (orderB ?? 0);
      });

      for (const childId of sortedChildren) {
        traverse(childId, depth + 1);
      }
    }
  }

  // Get top-level layers sorted by order
  const topLevel = Array.from(tree.items.values())
    .filter((l) => l.parentId === null)
    .sort((a, b) => a.order - b.order);

  for (const layer of topLevel) {
    traverse(layer.id, 0);
  }

  return result;
}

/**
 * Get the depth of a layer in the tree
 */
export function getLayerDepth(tree: LayerTree, layerId: string): number {
  return getAncestors(tree, layerId).length;
}

/**
 * Check if a layer can be moved to a target (prevents circular references)
 */
export function canMoveTo(tree: LayerTree, layerId: string, targetId: string | null): boolean {
  if (targetId === null) {
    return true; // Can always move to root
  }
  if (layerId === targetId) {
    return false; // Can't move to self
  }

  // Can't move to a descendant
  const descendants = getDescendants(tree, layerId);
  return !descendants.includes(targetId);
}

/**
 * Reorder siblings after a move operation
 */
export function reorderSiblings(
  tree: LayerTree,
  parentId: string | null,
  movedId: string,
  newIndex: number
): Map<string, number> {
  const orderUpdates = new Map<string, number>();

  // Get siblings including the moved layer
  let siblings: LayerItem[];
  if (parentId === null) {
    siblings = Array.from(tree.items.values())
      .filter((l) => l.parentId === null)
      .sort((a, b) => a.order - b.order);
  } else {
    const parent = tree.items.get(parentId);
    if (!parent) return orderUpdates;

    siblings = parent.children
      .map((id) => tree.items.get(id))
      .filter((l): l is LayerItem => l !== undefined)
      .sort((a, b) => a.order - b.order);
  }

  // Remove moved layer from current position
  const currentIndex = siblings.findIndex((l) => l.id === movedId);
  if (currentIndex !== -1) {
    siblings.splice(currentIndex, 1);
  }

  // Insert at new position
  const movedLayer = tree.items.get(movedId);
  if (movedLayer !== undefined) {
    siblings.splice(Math.min(newIndex, siblings.length), 0, movedLayer);
  }

  // Update order values
  siblings.forEach((layer, index) => {
    if (layer.order !== index) {
      orderUpdates.set(layer.id, index);
    }
  });

  return orderUpdates;
}

/**
 * Get the range of layers between two layers for range selection
 */
export function getLayerRange(tree: LayerTree, fromId: string, toId: string): string[] {
  const flattened = flattenTree(tree);
  const fromIndex = flattened.findIndex((l) => l.id === fromId);
  const toIndex = flattened.findIndex((l) => l.id === toId);

  if (fromIndex === -1 || toIndex === -1) return [];

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);

  return flattened.slice(start, end + 1).map((l) => l.id);
}

/**
 * Determine the icon to display for a layer based on its type and associated node
 */
export function getLayerIcon(layer: LayerItem, nodeType?: string): string {
  if (layer.type === 'page') return 'page';
  if (layer.type === 'section') return 'section';

  // Map node types to icons
  const iconMap: Record<string, string> = {
    button: 'button',
    input: 'input',
    card: 'card',
    form: 'form',
    text: 'text',
    image: 'image',
    container: 'section',
    sandpack: 'component',
  };

  return iconMap[nodeType ?? ''] ?? 'component';
}

/**
 * Sync layers with ReactFlow nodes
 * Creates layers for new nodes and removes layers for deleted nodes
 */
export function syncLayersWithNodes(
  tree: LayerTree,
  nodes: { id: string; data: { label?: string } }[]
): { added: LayerItem[]; removed: string[]; updated: Map<string, Partial<LayerItem>> } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const existingNodeIds = new Set<string>();

  // Find layers that have nodeIds
  for (const layer of tree.items.values()) {
    if (layer.nodeId !== undefined) {
      existingNodeIds.add(layer.nodeId);
    }
  }

  // Find new nodes (need to create layers)
  const added: LayerItem[] = [];
  for (const node of nodes) {
    if (!existingNodeIds.has(node.id)) {
      const layer = createLayer('component', node.data.label ?? 'Component', null, node.id);
      added.push(layer);
    }
  }

  // Find removed nodes (need to delete layers)
  const removed: string[] = [];
  for (const layer of tree.items.values()) {
    if (layer.nodeId !== undefined && !nodeIds.has(layer.nodeId)) {
      removed.push(layer.id);
    }
  }

  // Find updated names
  const updated = new Map<string, Partial<LayerItem>>();
  for (const node of nodes) {
    for (const layer of tree.items.values()) {
      if (
        layer.nodeId === node.id &&
        layer.name !== node.data.label &&
        node.data.label !== undefined
      ) {
        updated.set(layer.id, { name: node.data.label });
      }
    }
  }

  return { added, removed, updated };
}
