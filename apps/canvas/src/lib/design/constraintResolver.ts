/**
 * Constraint Resolver
 *
 * Computes new positions and sizes for child nodes when their parent is resized,
 * based on the constraints defined on each child.
 *
 * This is a core part of the design system where elements can be
 * "pinned" to edges or set to scale with their parent.
 */

import type { Rect } from './frameDetection';
import type {
  DesignNode,
  DesignTree,
  Constraints,
  HorizontalConstraint,
  VerticalConstraint,
} from '../../types/designNodeTypes';

// Re-export Rect for backwards compatibility
export type { Rect } from './frameDetection';

// =============================================================================
// TYPES
// =============================================================================

export interface ConstraintResolution {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// CONSTRAINT RESOLUTION
// =============================================================================

/**
 * Resolve horizontal constraint when parent resizes
 *
 * @param childRect - Child's current rect (relative to parent)
 * @param constraint - The horizontal constraint type
 * @param oldParentWidth - Parent's previous width
 * @param newParentWidth - Parent's new width
 * @returns New x position and width for the child
 */
function resolveHorizontalConstraint(
  childRect: Rect,
  constraint: HorizontalConstraint,
  oldParentWidth: number,
  newParentWidth: number
): { x: number; width: number } {
  const { x, width } = childRect;
  const deltaWidth = newParentWidth - oldParentWidth;

  switch (constraint) {
    case 'left':
      // Fixed distance from left edge - no change needed
      return { x, width };

    case 'right':
      // Fixed distance from right edge - move x by delta
      return { x: x + deltaWidth, width };

    case 'center': {
      // Centered horizontally - adjust x to maintain center position
      const oldCenter = x + width / 2;
      const oldCenterRatio = oldCenter / oldParentWidth;
      const newCenter = oldCenterRatio * newParentWidth;
      return { x: newCenter - width / 2, width };
    }

    case 'scale': {
      // Scale proportionally with parent
      const xRatio = x / oldParentWidth;
      const widthRatio = width / oldParentWidth;
      return {
        x: xRatio * newParentWidth,
        width: widthRatio * newParentWidth,
      };
    }

    case 'left-right': {
      // Fixed distance from both edges - stretch width
      const rightMargin = oldParentWidth - (x + width);
      return {
        x,
        width: newParentWidth - x - rightMargin,
      };
    }
  }
}

/**
 * Resolve vertical constraint when parent resizes
 *
 * @param childRect - Child's current rect (relative to parent)
 * @param constraint - The vertical constraint type
 * @param oldParentHeight - Parent's previous height
 * @param newParentHeight - Parent's new height
 * @returns New y position and height for the child
 */
function resolveVerticalConstraint(
  childRect: Rect,
  constraint: VerticalConstraint,
  oldParentHeight: number,
  newParentHeight: number
): { y: number; height: number } {
  const { y, height } = childRect;
  const deltaHeight = newParentHeight - oldParentHeight;

  switch (constraint) {
    case 'top':
      // Fixed distance from top edge - no change needed
      return { y, height };

    case 'bottom':
      // Fixed distance from bottom edge - move y by delta
      return { y: y + deltaHeight, height };

    case 'center': {
      // Centered vertically - adjust y to maintain center position
      const oldCenter = y + height / 2;
      const oldCenterRatio = oldCenter / oldParentHeight;
      const newCenter = oldCenterRatio * newParentHeight;
      return { y: newCenter - height / 2, height };
    }

    case 'scale': {
      // Scale proportionally with parent
      const yRatio = y / oldParentHeight;
      const heightRatio = height / oldParentHeight;
      return {
        y: yRatio * newParentHeight,
        height: heightRatio * newParentHeight,
      };
    }

    case 'top-bottom': {
      // Fixed distance from both edges - stretch height
      const bottomMargin = oldParentHeight - (y + height);
      return {
        y,
        height: newParentHeight - y - bottomMargin,
      };
    }
  }
}

/**
 * Resolve constraints for a single child node when parent resizes
 */
export function resolveNodeConstraints(
  child: DesignNode,
  oldParentRect: Rect,
  newParentRect: Rect
): ConstraintResolution {
  const childRect: Rect = {
    x: child.x,
    y: child.y,
    width: child.width,
    height: child.height,
  };

  const { x, width } = resolveHorizontalConstraint(
    childRect,
    child.constraints.horizontal,
    oldParentRect.width,
    newParentRect.width
  );

  const { y, height } = resolveVerticalConstraint(
    childRect,
    child.constraints.vertical,
    oldParentRect.height,
    newParentRect.height
  );

  return {
    nodeId: child.id,
    x,
    y,
    width: Math.max(1, width), // Ensure minimum size
    height: Math.max(1, height),
  };
}

/**
 * Resolve constraints for all children of a node when the node resizes
 *
 * @param tree - The design tree
 * @param parentId - ID of the parent node that was resized
 * @param oldParentRect - Parent's previous rect
 * @param newParentRect - Parent's new rect
 * @returns Array of constraint resolutions for all affected children
 */
export function resolveChildrenConstraints(
  tree: DesignTree,
  parentId: string,
  oldParentRect: Rect,
  newParentRect: Rect
): ConstraintResolution[] {
  const parent = tree.nodes.get(parentId);
  if (!parent) return [];

  // Skip if parent has auto-layout enabled (auto-layout handles its own positioning)
  if (parent.type === 'frame' && parent.autoLayout?.enabled) {
    return [];
  }

  const resolutions: ConstraintResolution[] = [];

  for (const childId of parent.children) {
    const child = tree.nodes.get(childId);
    if (!child) continue;

    // Skip locked children
    if (child.locked) continue;

    const resolution = resolveNodeConstraints(child, oldParentRect, newParentRect);
    resolutions.push(resolution);
  }

  return resolutions;
}

/**
 * Apply constraint resolutions to the tree
 * Returns a new Map with updated nodes
 */
export function applyConstraintResolutions(
  nodes: Map<string, DesignNode>,
  resolutions: ConstraintResolution[]
): Map<string, DesignNode> {
  const newNodes = new Map(nodes);

  for (const resolution of resolutions) {
    const node = newNodes.get(resolution.nodeId);
    if (!node) continue;

    newNodes.set(resolution.nodeId, {
      ...node,
      x: resolution.x,
      y: resolution.y,
      width: resolution.width,
      height: resolution.height,
    });
  }

  return newNodes;
}

// =============================================================================
// CONSTRAINT HELPERS
// =============================================================================

/**
 * Get default constraints based on position in parent
 *
 * This can be used to automatically set sensible constraints
 * when a node is first placed.
 */
export function inferConstraints(child: Rect, parent: Rect): Constraints {
  const horizontal = inferHorizontalConstraint(child, parent);
  const vertical = inferVerticalConstraint(child, parent);

  return { horizontal, vertical };
}

function inferHorizontalConstraint(child: Rect, parent: Rect): HorizontalConstraint {
  const leftDist = child.x;
  const rightDist = parent.width - (child.x + child.width);
  const centerDist = Math.abs(child.x + child.width / 2 - parent.width / 2);

  // If very close to center, use center constraint
  if (centerDist < 10) {
    return 'center';
  }

  // If close to both edges, use left-right
  if (leftDist < 50 && rightDist < 50) {
    return 'left-right';
  }

  // Otherwise pin to nearest edge
  return leftDist < rightDist ? 'left' : 'right';
}

function inferVerticalConstraint(child: Rect, parent: Rect): VerticalConstraint {
  const topDist = child.y;
  const bottomDist = parent.height - (child.y + child.height);
  const centerDist = Math.abs(child.y + child.height / 2 - parent.height / 2);

  // If very close to center, use center constraint
  if (centerDist < 10) {
    return 'center';
  }

  // If close to both edges, use top-bottom
  if (topDist < 50 && bottomDist < 50) {
    return 'top-bottom';
  }

  // Otherwise pin to nearest edge
  return topDist < bottomDist ? 'top' : 'bottom';
}

/**
 * Get constraint icon/label for UI display
 */
export function getConstraintLabel(constraints: Constraints): string {
  const h = constraints.horizontal;
  const v = constraints.vertical;

  // Common combinations
  if (h === 'left' && v === 'top') return 'Top Left';
  if (h === 'right' && v === 'top') return 'Top Right';
  if (h === 'left' && v === 'bottom') return 'Bottom Left';
  if (h === 'right' && v === 'bottom') return 'Bottom Right';
  if (h === 'center' && v === 'center') return 'Center';
  if (h === 'left-right' && v === 'top-bottom') return 'Scale';
  if (h === 'scale' && v === 'scale') return 'Scale';

  // Custom
  return `${h} / ${v}`;
}

/**
 * Check if constraints would cause issues (e.g., negative size)
 */
export function validateConstraints(
  child: Rect,
  parent: Rect,
  constraints: Constraints
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check horizontal
  if (constraints.horizontal === 'left-right') {
    const rightMargin = parent.width - (child.x + child.width);
    if (child.x + rightMargin >= parent.width) {
      warnings.push('Horizontal stretch constraint may result in zero or negative width');
    }
  }

  // Check vertical
  if (constraints.vertical === 'top-bottom') {
    const bottomMargin = parent.height - (child.y + child.height);
    if (child.y + bottomMargin >= parent.height) {
      warnings.push('Vertical stretch constraint may result in zero or negative height');
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
