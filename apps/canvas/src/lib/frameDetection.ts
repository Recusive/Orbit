/**
 * Frame Detection Utilities
 *
 * Provides utilities for detecting containing frames and converting
 * coordinates between absolute and frame-relative systems.
 */

import type { DesignNode, DesignTree, FrameNode } from '../types/designNodeTypes';

/**
 * Rectangle type for point/bounds calculations
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if a point is inside a rectangle
 */
export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Check if one rectangle is fully contained within another
 */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Check if two rectangles overlap
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Get the absolute bounds of a node (accounting for parent chain)
 */
export function getAbsoluteBounds(tree: DesignTree, nodeId: string): Rect | null {
  const node = tree.nodes.get(nodeId);
  if (node === undefined) return null;

  let x = node.x;
  let y = node.y;

  // Walk up the parent chain to get absolute position
  let parentId = node.parentId;
  while (parentId !== null) {
    const parent = tree.nodes.get(parentId);
    if (parent === undefined) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }

  return { x, y, width: node.width, height: node.height };
}

/**
 * Find all frames at a given point (deepest first)
 * Returns frames that contain the point, sorted by depth (deepest first)
 */
export function findFramesAtPoint(tree: DesignTree, point: { x: number; y: number }): FrameNode[] {
  const frames: { node: FrameNode; depth: number }[] = [];

  function traverse(nodeId: string, depth: number, parentX: number, parentY: number): void {
    const node = tree.nodes.get(nodeId);
    if (!node?.visible) return;

    const absoluteX = parentX + node.x;
    const absoluteY = parentY + node.y;
    const bounds: Rect = {
      x: absoluteX,
      y: absoluteY,
      width: node.width,
      height: node.height,
    };

    // Check if point is inside this node
    if (node.type === 'frame' && pointInRect(point, bounds)) {
      frames.push({ node, depth });
    }

    // Traverse children
    for (const childId of node.children) {
      traverse(childId, depth + 1, absoluteX, absoluteY);
    }
  }

  // Start from root nodes
  for (const rootId of tree.rootIds) {
    traverse(rootId, 0, 0, 0);
  }

  // Sort by depth descending (deepest first)
  frames.sort((a, b) => b.depth - a.depth);

  return frames.map((f) => f.node);
}

/**
 * Find the containing frame for a given point
 * Returns the deepest (most nested) frame that contains the point
 */
export function findContainingFrame(
  tree: DesignTree,
  point: { x: number; y: number }
): FrameNode | null {
  const frames = findFramesAtPoint(tree, point);
  return frames[0] ?? null;
}

/**
 * Find the containing frame for a drawn rectangle
 * Returns the frame that fully contains the rect, preferring deeper frames
 */
export function findContainingFrameForRect(tree: DesignTree, rect: Rect): FrameNode | null {
  const containingFrames: { node: FrameNode; depth: number }[] = [];

  function traverse(nodeId: string, depth: number, parentX: number, parentY: number): void {
    const node = tree.nodes.get(nodeId);
    if (!node?.visible) return;

    const absoluteX = parentX + node.x;
    const absoluteY = parentY + node.y;
    const bounds: Rect = {
      x: absoluteX,
      y: absoluteY,
      width: node.width,
      height: node.height,
    };

    // Check if this frame fully contains the rect
    if (node.type === 'frame' && rectContainsRect(bounds, rect)) {
      containingFrames.push({ node, depth });
    }

    // Traverse children
    for (const childId of node.children) {
      traverse(childId, depth + 1, absoluteX, absoluteY);
    }
  }

  // Start from root nodes
  for (const rootId of tree.rootIds) {
    traverse(rootId, 0, 0, 0);
  }

  // Sort by depth descending and return deepest
  containingFrames.sort((a, b) => b.depth - a.depth);
  return containingFrames[0]?.node ?? null;
}

/**
 * Convert absolute coordinates to frame-relative coordinates
 */
export function toFrameRelative(
  tree: DesignTree,
  absoluteRect: Rect,
  frameId: string
): Rect | null {
  // Get frame's absolute position
  const frameBounds = getAbsoluteBounds(tree, frameId);
  if (frameBounds === null) return null;

  return {
    x: absoluteRect.x - frameBounds.x,
    y: absoluteRect.y - frameBounds.y,
    width: absoluteRect.width,
    height: absoluteRect.height,
  };
}

/**
 * Convert frame-relative coordinates to absolute coordinates
 */
export function toAbsolute(tree: DesignTree, relativeRect: Rect, frameId: string): Rect | null {
  // Get frame's absolute position
  const frameBounds = getAbsoluteBounds(tree, frameId);
  if (frameBounds === null) return null;

  return {
    x: relativeRect.x + frameBounds.x,
    y: relativeRect.y + frameBounds.y,
    width: relativeRect.width,
    height: relativeRect.height,
  };
}

/**
 * Check if a node type is a shape (must be inside a frame)
 */
export function isShapeType(type: DesignNode['type']): boolean {
  return type === 'rectangle' || type === 'ellipse' || type === 'text';
}

/**
 * Check if a node type is a container (can hold other nodes)
 */
export function isContainerType(type: DesignNode['type']): boolean {
  return type === 'layer' || type === 'frame';
}
