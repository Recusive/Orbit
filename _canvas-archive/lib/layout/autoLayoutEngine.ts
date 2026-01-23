/**
 * Auto Layout Engine
 *
 * Computes positions and sizes for children in an auto-layout frame.
 * Implements flexbox-based layout with hug/fill/fixed sizing.
 */

import type { DesignNode, DesignTree, FrameNode, Padding } from '../../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodeId: string;
  rect: LayoutRect;
}

export interface ComputedLayout {
  frameRect: LayoutRect;
  childLayouts: LayoutResult[];
}

// =============================================================================
// MAIN LAYOUT ENGINE
// =============================================================================

/**
 * Compute layout for all children of an auto-layout frame
 */
export function computeAutoLayout(
  frame: FrameNode,
  children: DesignNode[],
  options?: {
    containerWidth?: number;
    containerHeight?: number;
  }
): ComputedLayout {
  const autoLayout = frame.autoLayout;

  // If auto-layout is not enabled, return children as-is
  if (!autoLayout?.enabled) {
    return {
      frameRect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      childLayouts: children
        .filter((child) => child.visible)
        .map((child) => ({
          nodeId: child.id,
          rect: { x: child.x, y: child.y, width: child.width, height: child.height },
        })),
    };
  }

  const {
    direction,
    spacing,
    padding,
    primaryAxisAlign,
    counterAxisAlign,
    primarySizing,
    counterSizing,
  } = autoLayout;
  const isHorizontal = direction === 'horizontal';

  // Filter visible children
  const visibleChildren = children.filter((child) => child.visible);

  if (visibleChildren.length === 0) {
    // Empty frame - size based on padding only
    const frameWidth =
      primarySizing === 'fixed' || !isHorizontal ? frame.width : padding.left + padding.right;
    const frameHeight =
      primarySizing === 'fixed' || isHorizontal ? frame.height : padding.top + padding.bottom;

    return {
      frameRect: { x: frame.x, y: frame.y, width: frameWidth, height: frameHeight },
      childLayouts: [],
    };
  }

  // Get child sizing info
  const childSizingInfo = visibleChildren.map((child) => getChildSizing(child));

  // Step 1: Calculate content sizes
  const contentSizes = calculateContentSizes(
    visibleChildren,
    childSizingInfo,
    isHorizontal,
    spacing
  );

  // Step 2: Determine frame size
  const frameSize = calculateFrameSize(
    frame,
    contentSizes,
    padding,
    isHorizontal,
    primarySizing,
    counterSizing,
    options?.containerWidth,
    options?.containerHeight
  );

  // Step 3: Calculate available space for children
  const availableSpace = calculateAvailableSpace(frameSize, padding, isHorizontal);

  // Step 4: Resolve "fill" children sizes
  const resolvedSizes = resolveFillSizes(
    visibleChildren,
    childSizingInfo,
    availableSpace,
    contentSizes
  );

  // Step 5: Position children
  const childLayouts = positionChildren(
    visibleChildren,
    resolvedSizes,
    frameSize,
    padding,
    spacing,
    isHorizontal,
    primaryAxisAlign,
    counterAxisAlign
  );

  return {
    frameRect: { x: frame.x, y: frame.y, ...frameSize },
    childLayouts,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ChildSizing {
  primarySizing: 'hug' | 'fill' | 'fixed';
  counterSizing: 'hug' | 'fill' | 'fixed';
}

/**
 * Get sizing behavior for a child
 */
function getChildSizing(child: DesignNode): ChildSizing {
  const defaultSizing: ChildSizing = {
    primarySizing: 'hug',
    counterSizing: 'hug',
  };

  if (child.autoLayoutChild === undefined) {
    return defaultSizing;
  }

  return {
    primarySizing: child.autoLayoutChild.primaryAxisSizing,
    counterSizing: child.autoLayoutChild.counterAxisSizing,
  };
}

interface ContentSizes {
  totalPrimary: number; // Total size along primary axis
  maxCounter: number; // Max size along counter axis
  childPrimary: number[]; // Individual child sizes along primary axis
  childCounter: number[]; // Individual child sizes along counter axis
}

/**
 * Calculate content sizes based on child intrinsic sizes
 */
function calculateContentSizes(
  children: DesignNode[],
  sizingInfo: ChildSizing[],
  isHorizontal: boolean,
  spacing: number
): ContentSizes {
  let totalPrimary = 0;
  let maxCounter = 0;
  const childPrimary: number[] = [];
  const childCounter: number[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const sizing = sizingInfo[i];
    if (child === undefined || sizing === undefined) continue;

    // Get intrinsic sizes
    const primarySize = isHorizontal ? child.width : child.height;
    const counterSize = isHorizontal ? child.height : child.width;

    // For "fill" children, use 0 for now (will be calculated later)
    const effectivePrimary = sizing.primarySizing === 'fill' ? 0 : primarySize;
    const effectiveCounter = sizing.counterSizing === 'fill' ? 0 : counterSize;

    childPrimary.push(effectivePrimary);
    childCounter.push(effectiveCounter);

    totalPrimary += effectivePrimary;
    maxCounter = Math.max(maxCounter, effectiveCounter);
  }

  // Add spacing between children
  if (children.length > 1) {
    totalPrimary += spacing * (children.length - 1);
  }

  return { totalPrimary, maxCounter, childPrimary, childCounter };
}

interface FrameSize {
  width: number;
  height: number;
}

/**
 * Calculate frame size based on content and sizing mode
 */
function calculateFrameSize(
  frame: FrameNode,
  contentSizes: ContentSizes,
  padding: Padding,
  isHorizontal: boolean,
  primarySizing: string,
  counterSizing: string,
  containerWidth?: number,
  containerHeight?: number
): FrameSize {
  // Primary axis size
  let primaryAxisSize: number;
  switch (primarySizing) {
    case 'hug':
      primaryAxisSize =
        contentSizes.totalPrimary +
        (isHorizontal ? padding.left + padding.right : padding.top + padding.bottom);
      break;
    case 'fill':
      primaryAxisSize = isHorizontal
        ? (containerWidth ?? frame.width)
        : (containerHeight ?? frame.height);
      break;
    case 'fixed':
    default:
      primaryAxisSize = isHorizontal ? frame.width : frame.height;
  }

  // Counter axis size
  let counterAxisSize: number;
  switch (counterSizing) {
    case 'hug':
      counterAxisSize =
        contentSizes.maxCounter +
        (isHorizontal ? padding.top + padding.bottom : padding.left + padding.right);
      break;
    case 'fill':
      counterAxisSize = isHorizontal
        ? (containerHeight ?? frame.height)
        : (containerWidth ?? frame.width);
      break;
    case 'fixed':
    default:
      counterAxisSize = isHorizontal ? frame.height : frame.width;
  }

  return isHorizontal
    ? { width: primaryAxisSize, height: counterAxisSize }
    : { width: counterAxisSize, height: primaryAxisSize };
}

interface AvailableSpace {
  primary: number;
  counter: number;
}

/**
 * Calculate available space for children after padding
 */
function calculateAvailableSpace(
  frameSize: FrameSize,
  padding: Padding,
  isHorizontal: boolean
): AvailableSpace {
  return isHorizontal
    ? {
        primary: frameSize.width - padding.left - padding.right,
        counter: frameSize.height - padding.top - padding.bottom,
      }
    : {
        primary: frameSize.height - padding.top - padding.bottom,
        counter: frameSize.width - padding.left - padding.right,
      };
}

interface ResolvedSizes {
  primary: number[];
  counter: number[];
}

/**
 * Resolve "fill" children to actual sizes
 */
function resolveFillSizes(
  children: DesignNode[],
  sizingInfo: ChildSizing[],
  availableSpace: AvailableSpace,
  contentSizes: ContentSizes
): ResolvedSizes {
  const primary: number[] = [...contentSizes.childPrimary];
  const counter: number[] = [...contentSizes.childCounter];

  // Count "fill" children along primary axis
  const fillChildren = sizingInfo.filter((s) => s.primarySizing === 'fill').length;

  if (fillChildren > 0) {
    // Calculate remaining space
    const fixedSize = contentSizes.totalPrimary;
    const remainingSpace = Math.max(0, availableSpace.primary - fixedSize);
    const fillSize = remainingSpace / fillChildren;

    // Distribute to fill children
    for (let i = 0; i < children.length; i++) {
      const info = sizingInfo[i];
      if (info?.primarySizing === 'fill') {
        primary[i] = fillSize;
      }
    }
  }

  // Handle counter axis "fill" children
  for (let i = 0; i < children.length; i++) {
    const info = sizingInfo[i];
    if (info?.counterSizing === 'fill') {
      counter[i] = availableSpace.counter;
    }
  }

  return { primary, counter };
}

/**
 * Position children within the frame
 */
function positionChildren(
  children: DesignNode[],
  sizes: ResolvedSizes,
  frameSize: FrameSize,
  padding: Padding,
  spacing: number,
  isHorizontal: boolean,
  primaryAlign: string,
  counterAlign: string
): LayoutResult[] {
  const results: LayoutResult[] = [];

  // Calculate total content size
  const totalPrimary =
    sizes.primary.reduce((sum, s) => sum + s, 0) + spacing * (children.length - 1);

  // Calculate available space
  const availablePrimary = isHorizontal
    ? frameSize.width - padding.left - padding.right
    : frameSize.height - padding.top - padding.bottom;
  const availableCounter = isHorizontal
    ? frameSize.height - padding.top - padding.bottom
    : frameSize.width - padding.left - padding.right;

  // Calculate starting position along primary axis
  let primaryStart: number;
  let spaceBetween = spacing;

  switch (primaryAlign) {
    case 'center':
      primaryStart = (availablePrimary - totalPrimary) / 2;
      break;
    case 'end':
      primaryStart = availablePrimary - totalPrimary;
      break;
    case 'space-between':
      primaryStart = 0;
      if (children.length > 1) {
        const totalChildSize = sizes.primary.reduce((sum, s) => sum + s, 0);
        spaceBetween = (availablePrimary - totalChildSize) / (children.length - 1);
      }
      break;
    case 'start':
    default:
      primaryStart = 0;
  }

  // Position each child
  let currentPrimary = primaryStart;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child === undefined) continue;
    const primarySize = sizes.primary[i] ?? 0;
    const counterSize = sizes.counter[i] ?? 0;

    // Calculate counter axis position
    let counterStart: number;
    switch (counterAlign) {
      case 'center':
        counterStart = (availableCounter - counterSize) / 2;
        break;
      case 'end':
        counterStart = availableCounter - counterSize;
        break;
      case 'stretch':
        counterStart = 0;
        // For stretch, override the counter size
        break;
      case 'baseline':
      case 'start':
      default:
        counterStart = 0;
    }

    // Convert to x, y coordinates
    const x = isHorizontal ? padding.left + currentPrimary : padding.left + counterStart;
    const y = isHorizontal ? padding.top + counterStart : padding.top + currentPrimary;
    const width = isHorizontal
      ? primarySize
      : counterAlign === 'stretch'
        ? availableCounter
        : counterSize;
    const height = isHorizontal
      ? counterAlign === 'stretch'
        ? availableCounter
        : counterSize
      : primarySize;

    results.push({
      nodeId: child.id,
      rect: { x, y, width, height },
    });

    // Move to next position
    currentPrimary += primarySize + spaceBetween;
  }

  return results;
}

// =============================================================================
// APPLY LAYOUT
// =============================================================================

/**
 * Apply computed layout to nodes in the tree
 * Returns a new Map with updated nodes
 */
export function applyAutoLayout(
  nodes: Map<string, DesignNode>,
  layout: ComputedLayout,
  frameId: string
): Map<string, DesignNode> {
  const newNodes = new Map(nodes);

  // Update frame if needed
  const frame = newNodes.get(frameId);
  if (frame !== undefined) {
    newNodes.set(frameId, {
      ...frame,
      width: layout.frameRect.width,
      height: layout.frameRect.height,
    });
  }

  // Update children
  for (const childLayout of layout.childLayouts) {
    const child = newNodes.get(childLayout.nodeId);
    if (child !== undefined) {
      newNodes.set(childLayout.nodeId, {
        ...child,
        x: childLayout.rect.x,
        y: childLayout.rect.y,
        width: childLayout.rect.width,
        height: childLayout.rect.height,
      });
    }
  }

  return newNodes;
}

/**
 * Compute and apply auto-layout for a frame
 */
export function computeAndApplyAutoLayout(
  tree: DesignTree,
  frameId: string
): Map<string, DesignNode> {
  const frame = tree.nodes.get(frameId);
  if (frame?.type !== 'frame') {
    return tree.nodes;
  }

  const frameNode = frame;
  if (!frameNode.autoLayout?.enabled) {
    return tree.nodes;
  }

  // Get children
  const children = frameNode.children
    .map((id) => tree.nodes.get(id))
    .filter((n): n is DesignNode => n !== undefined);

  // Compute layout
  const layout = computeAutoLayout(frameNode, children);

  // Apply layout
  return applyAutoLayout(tree.nodes, layout, frameId);
}

/**
 * Recursively compute auto-layout for all frames in the tree
 * Processes from leaves to root (bottom-up) to handle nested auto-layouts
 */
export function computeAllAutoLayouts(tree: DesignTree): Map<string, DesignNode> {
  let nodes = new Map(tree.nodes);

  // Find all frames with auto-layout enabled
  const autoLayoutFrames: string[] = [];

  function collectAutoLayoutFrames(nodeId: string): void {
    const node = nodes.get(nodeId);
    if (node === undefined) return;

    // Process children first (bottom-up)
    for (const childId of node.children) {
      collectAutoLayoutFrames(childId);
    }

    // Then process this node if it's an auto-layout frame
    if (node.type === 'frame' && node.autoLayout?.enabled) {
      autoLayoutFrames.push(nodeId);
    }
  }

  // Start from root nodes
  for (const rootId of tree.rootIds) {
    collectAutoLayoutFrames(rootId);
  }

  // Apply auto-layout to each frame (already in bottom-up order)
  for (const frameId of autoLayoutFrames) {
    const frame = nodes.get(frameId);
    if (frame?.type !== 'frame') continue;

    const frameNode = frame;
    const children = frameNode.children
      .map((id) => nodes.get(id))
      .filter((n): n is DesignNode => n !== undefined);

    const layout = computeAutoLayout(frameNode, children);
    nodes = applyAutoLayout(nodes, layout, frameId);
  }

  return nodes;
}
