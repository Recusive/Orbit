/**
 * SmartGuidesOverlay - Visual alignment guides overlay
 *
 * Renders SVG guides for element alignment during drag operations.
 * Uses fixed positioning to overlay on top of ReactFlow canvas.
 */

import React, { memo, useMemo } from 'react';

// Guide colors come from CSS variables in globals.css
const guideColor = 'var(--primary)';

import type { Guide } from '../../hooks/design/useSmartGuides';

interface SmartGuidesOverlayProps {
  guides: Guide[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * Convert flow coordinates to screen coordinates
 */
function flowToScreen(
  flowX: number,
  flowY: number,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  return {
    x: flowX * viewport.zoom + viewport.x,
    y: flowY * viewport.zoom + viewport.y,
  };
}

/**
 * SmartGuidesOverlay component
 * Renders alignment guides as SVG lines
 */
export const SmartGuidesOverlay = memo(function SmartGuidesOverlay({
  guides,
  viewport,
}: SmartGuidesOverlayProps) {
  // useMemo MUST be called before any early returns
  const guideElements = useMemo(() => {
    return guides.map((guide, index) => {
      if (guide.type === 'vertical') {
        // Vertical guide (x position is fixed)
        const start = flowToScreen(guide.position, guide.start, viewport);
        const end = flowToScreen(guide.position, guide.end, viewport);

        return (
          <line
            key={`v-${String(index)}-${String(guide.position)}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={guideColor}
            strokeWidth={1}
            strokeDasharray={guide.alignType === 'center' ? 'none' : '4 2'}
          />
        );
      } else {
        // Horizontal guide (y position is fixed)
        const start = flowToScreen(guide.start, guide.position, viewport);
        const end = flowToScreen(guide.end, guide.position, viewport);

        return (
          <line
            key={`h-${String(index)}-${String(guide.position)}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={guideColor}
            strokeWidth={1}
            strokeDasharray={guide.alignType === 'center' ? 'none' : '4 2'}
          />
        );
      }
    });
  }, [guides, viewport]);

  // Add distance indicators at intersection points
  const intersectionMarkers = useMemo(() => {
    const markers: React.ReactNode[] = [];

    // For each guide, add a small marker at alignment point
    guides.forEach((guide, index) => {
      let markerPos: { x: number; y: number };

      if (guide.type === 'vertical') {
        // Marker in the middle of the vertical line
        const midY = (guide.start + guide.end) / 2;
        markerPos = flowToScreen(guide.position, midY, viewport);
      } else {
        // Marker in the middle of the horizontal line
        const midX = (guide.start + guide.end) / 2;
        markerPos = flowToScreen(midX, guide.position, viewport);
      }

      // Small circle at alignment point
      markers.push(
        <circle
          key={`marker-${String(index)}`}
          cx={markerPos.x}
          cy={markerPos.y}
          r={3}
          fill={guideColor}
          opacity={0.8}
        />
      );
    });

    return markers;
  }, [guides, viewport]);

  // Early return AFTER all hooks
  if (guides.length === 0) return null;

  return (
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }}
    >
      {guideElements}
      {intersectionMarkers}
    </svg>
  );
});

export default SmartGuidesOverlay;
