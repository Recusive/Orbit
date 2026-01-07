/**
 * useSmartGuides Hook
 *
 * Provides element-to-element snapping and alignment guides for design mode.
 * Optimized for performance - only computes guides during drag operations.
 */

import { useMemo, useRef, useCallback } from 'react';

/**
 * Guide types for different alignment scenarios
 */
export type GuideType = 'vertical' | 'horizontal';

/**
 * A single alignment guide
 */
export interface Guide {
  type: GuideType;
  /** Position on the axis (x for vertical, y for horizontal) */
  position: number;
  /** Start of the guide line (perpendicular axis) */
  start: number;
  /** End of the guide line (perpendicular axis) */
  end: number;
  /** Type of alignment: center, left/top edge, right/bottom edge */
  alignType: 'start' | 'center' | 'end';
}

/**
 * Bounding box for elements
 */
export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Snap result with delta adjustments
 */
export interface SnapResult {
  /** Adjusted x position after snapping */
  x: number;
  /** Adjusted y position after snapping */
  y: number;
  /** Delta applied to x */
  deltaX: number;
  /** Delta applied to y */
  deltaY: number;
  /** Active guides to display */
  guides: Guide[];
}

/**
 * Hook options
 */
export interface UseSmartGuidesOptions {
  /** Snap threshold in pixels (default: 5) */
  threshold?: number;
  /** Whether snapping is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook return type
 */
export interface UseSmartGuidesReturn {
  /** Calculate snap result for a moving element */
  calculateSnap: (movingBox: BoundingBox, otherBoxes: BoundingBox[]) => SnapResult;
  /** Get alignment points from a bounding box */
  getAlignmentPoints: (box: BoundingBox) => AlignmentPoints;
}

/**
 * Alignment points for an element
 */
export interface AlignmentPoints {
  // Vertical guides (x positions)
  left: number;
  centerX: number;
  right: number;
  // Horizontal guides (y positions)
  top: number;
  centerY: number;
  bottom: number;
}

/**
 * Extract alignment points from a bounding box
 */
function getAlignmentPointsFromBox(box: BoundingBox): AlignmentPoints {
  return {
    left: box.x,
    centerX: box.x + box.width / 2,
    right: box.x + box.width,
    top: box.y,
    centerY: box.y + box.height / 2,
    bottom: box.y + box.height,
  };
}

/**
 * Find the closest snap target for a given position
 */
function findClosestSnap(
  value: number,
  targets: { position: number; type: 'start' | 'center' | 'end'; sourceId: string }[],
  threshold: number
): { position: number; delta: number; type: 'start' | 'center' | 'end'; sourceId: string } | null {
  let closest: {
    position: number;
    delta: number;
    type: 'start' | 'center' | 'end';
    sourceId: string;
  } | null = null;
  let minDistance = threshold;

  for (const target of targets) {
    const distance = Math.abs(value - target.position);
    if (distance < minDistance) {
      minDistance = distance;
      closest = {
        position: target.position,
        delta: target.position - value,
        type: target.type,
        sourceId: target.sourceId,
      };
    }
  }

  return closest;
}

export function useSmartGuides(options: UseSmartGuidesOptions = {}): UseSmartGuidesReturn {
  const { threshold = 5, enabled = true } = options;

  // Cache alignment points computation
  const alignmentCacheRef = useRef<Map<string, AlignmentPoints>>(new Map());

  const getAlignmentPoints = useCallback((box: BoundingBox): AlignmentPoints => {
    // Check cache first
    const cached = alignmentCacheRef.current.get(box.id);
    if (cached !== undefined) {
      return cached;
    }

    const points = getAlignmentPointsFromBox(box);
    alignmentCacheRef.current.set(box.id, points);
    return points;
  }, []);

  const calculateSnap = useCallback(
    (movingBox: BoundingBox, otherBoxes: BoundingBox[]): SnapResult => {
      if (!enabled || otherBoxes.length === 0) {
        return {
          x: movingBox.x,
          y: movingBox.y,
          deltaX: 0,
          deltaY: 0,
          guides: [],
        };
      }

      const movingPoints = getAlignmentPointsFromBox(movingBox);
      const guides: Guide[] = [];

      // Collect all snap targets from other elements
      const verticalTargets: {
        position: number;
        type: 'start' | 'center' | 'end';
        sourceId: string;
        sourceBox: BoundingBox;
      }[] = [];
      const horizontalTargets: {
        position: number;
        type: 'start' | 'center' | 'end';
        sourceId: string;
        sourceBox: BoundingBox;
      }[] = [];

      for (const box of otherBoxes) {
        if (box.id === movingBox.id) continue;

        const points = getAlignmentPointsFromBox(box);

        // Vertical (x-axis) targets
        verticalTargets.push(
          { position: points.left, type: 'start', sourceId: box.id, sourceBox: box },
          { position: points.centerX, type: 'center', sourceId: box.id, sourceBox: box },
          { position: points.right, type: 'end', sourceId: box.id, sourceBox: box }
        );

        // Horizontal (y-axis) targets
        horizontalTargets.push(
          { position: points.top, type: 'start', sourceId: box.id, sourceBox: box },
          { position: points.centerY, type: 'center', sourceId: box.id, sourceBox: box },
          { position: points.bottom, type: 'end', sourceId: box.id, sourceBox: box }
        );
      }

      // Find snaps for left edge, center, and right edge
      const leftSnap = findClosestSnap(movingPoints.left, verticalTargets, threshold);
      const centerXSnap = findClosestSnap(movingPoints.centerX, verticalTargets, threshold);
      const rightSnap = findClosestSnap(movingPoints.right, verticalTargets, threshold);

      // Find snaps for top edge, center, and bottom edge
      const topSnap = findClosestSnap(movingPoints.top, horizontalTargets, threshold);
      const centerYSnap = findClosestSnap(movingPoints.centerY, horizontalTargets, threshold);
      const bottomSnap = findClosestSnap(movingPoints.bottom, horizontalTargets, threshold);

      // Pick the best vertical snap (smallest delta)
      let bestVerticalSnap: {
        delta: number;
        type: 'start' | 'center' | 'end';
        position: number;
        movingEdge: 'start' | 'center' | 'end';
      } | null = null;

      if (leftSnap !== null) {
        bestVerticalSnap = { ...leftSnap, movingEdge: 'start' };
      }
      if (centerXSnap !== null) {
        if (
          bestVerticalSnap === null ||
          Math.abs(centerXSnap.delta) < Math.abs(bestVerticalSnap.delta)
        ) {
          bestVerticalSnap = { ...centerXSnap, movingEdge: 'center' };
        }
      }
      if (rightSnap !== null) {
        if (
          bestVerticalSnap === null ||
          Math.abs(rightSnap.delta) < Math.abs(bestVerticalSnap.delta)
        ) {
          bestVerticalSnap = { ...rightSnap, movingEdge: 'end' };
        }
      }

      // Pick the best horizontal snap (smallest delta)
      let bestHorizontalSnap: {
        delta: number;
        type: 'start' | 'center' | 'end';
        position: number;
        movingEdge: 'start' | 'center' | 'end';
      } | null = null;

      if (topSnap !== null) {
        bestHorizontalSnap = { ...topSnap, movingEdge: 'start' };
      }
      if (centerYSnap !== null) {
        if (
          bestHorizontalSnap === null ||
          Math.abs(centerYSnap.delta) < Math.abs(bestHorizontalSnap.delta)
        ) {
          bestHorizontalSnap = { ...centerYSnap, movingEdge: 'center' };
        }
      }
      if (bottomSnap !== null) {
        if (
          bestHorizontalSnap === null ||
          Math.abs(bottomSnap.delta) < Math.abs(bestHorizontalSnap.delta)
        ) {
          bestHorizontalSnap = { ...bottomSnap, movingEdge: 'end' };
        }
      }

      // Calculate final position with snapping
      let finalX = movingBox.x;
      let deltaX = 0;
      let finalY = movingBox.y;
      let deltaY = 0;

      if (bestVerticalSnap !== null) {
        deltaX = bestVerticalSnap.delta;
        // Adjust final position based on which edge was snapped
        if (bestVerticalSnap.movingEdge === 'center') {
          finalX = bestVerticalSnap.position - movingBox.width / 2;
        } else if (bestVerticalSnap.movingEdge === 'end') {
          finalX = bestVerticalSnap.position - movingBox.width;
        } else {
          finalX = bestVerticalSnap.position;
        }

        // Create vertical guide
        guides.push({
          type: 'vertical',
          position: bestVerticalSnap.position,
          start: Math.min(movingBox.y, ...otherBoxes.map((b) => b.y)) - 20,
          end:
            Math.max(movingBox.y + movingBox.height, ...otherBoxes.map((b) => b.y + b.height)) + 20,
          alignType: bestVerticalSnap.type,
        });
      }

      if (bestHorizontalSnap !== null) {
        deltaY = bestHorizontalSnap.delta;
        // Adjust final position based on which edge was snapped
        if (bestHorizontalSnap.movingEdge === 'center') {
          finalY = bestHorizontalSnap.position - movingBox.height / 2;
        } else if (bestHorizontalSnap.movingEdge === 'end') {
          finalY = bestHorizontalSnap.position - movingBox.height;
        } else {
          finalY = bestHorizontalSnap.position;
        }

        // Create horizontal guide
        guides.push({
          type: 'horizontal',
          position: bestHorizontalSnap.position,
          start: Math.min(movingBox.x, ...otherBoxes.map((b) => b.x)) - 20,
          end:
            Math.max(movingBox.x + movingBox.width, ...otherBoxes.map((b) => b.x + b.width)) + 20,
          alignType: bestHorizontalSnap.type,
        });
      }

      return {
        x: finalX,
        y: finalY,
        deltaX,
        deltaY,
        guides,
      };
    },
    [enabled, threshold]
  );

  return useMemo(
    () => ({
      calculateSnap,
      getAlignmentPoints,
    }),
    [calculateSnap, getAlignmentPoints]
  );
}

/**
 * Clear the alignment cache when elements change significantly
 */
export function useSmartGuidesWithCache(): UseSmartGuidesReturn & { clearCache: () => void } {
  const cacheRef = useRef<Map<string, AlignmentPoints>>(new Map());
  const guides = useSmartGuides();

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    ...guides,
    clearCache,
  };
}
