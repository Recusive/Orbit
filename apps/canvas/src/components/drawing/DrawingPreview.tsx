/**
 * DrawingPreview - Visual feedback while drawing shapes
 *
 * Shows a dashed outline preview of the shape being created.
 * Uses CSS transforms for GPU-accelerated rendering.
 */

import React, { memo, useMemo } from 'react';

// Colors come from CSS variables in globals.css

import type { DrawingTool } from '../../hooks/drawing/useDrawingTools';

interface DrawingPreviewProps {
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  tool: DrawingTool;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * DrawingPreview component
 * Renders a preview of the shape being drawn
 */
export const DrawingPreview = memo(function DrawingPreview({
  rect,
  tool,
  viewport,
}: DrawingPreviewProps) {
  // Calculate screen position from flow position - must be BEFORE early returns
  const screenX = rect ? rect.x * viewport.zoom + viewport.x : 0;
  const screenY = rect ? rect.y * viewport.zoom + viewport.y : 0;
  const screenWidth = rect ? rect.width * viewport.zoom : 0;
  const screenHeight = rect ? rect.height * viewport.zoom : 0;

  // Style based on tool type - must be BEFORE early returns
  const style = useMemo((): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'fixed',
      left: screenX,
      top: screenY,
      width: Math.abs(screenWidth),
      height: Math.abs(screenHeight),
      // Handle negative dimensions (dragging up/left)
      transform: `translate(${screenWidth < 0 ? '-100%' : '0'}, ${screenHeight < 0 ? '-100%' : '0'})`,
      pointerEvents: 'none',
      zIndex: 1000,
      boxSizing: 'border-box',
    };

    switch (tool) {
      case 'layer':
        return {
          ...baseStyle,
          border: '2px dashed var(--muted-foreground)',
          backgroundColor: 'rgba(156, 163, 175, 0.05)',
          borderRadius: 4,
        };
      case 'frame':
        return {
          ...baseStyle,
          border: '2px dashed var(--primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderRadius: 4,
        };
      case 'rectangle':
        return {
          ...baseStyle,
          border: '2px dashed var(--primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
        };
      case 'ellipse':
        return {
          ...baseStyle,
          border: '2px dashed var(--primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '50%',
        };
      case 'text':
        return {
          ...baseStyle,
          border: '1px dashed var(--primary)',
          backgroundColor: 'transparent',
        };
      case 'select':
        // Select mode doesn't show a drawing preview
        return baseStyle;
      default:
        return baseStyle;
    }
  }, [screenX, screenY, screenWidth, screenHeight, tool]);

  // Dimension label - must be BEFORE early returns
  const dimensionLabel = useMemo(() => {
    if (!rect) return '';
    const w = Math.round(Math.abs(rect.width));
    const h = Math.round(Math.abs(rect.height));
    return `${String(w)}x${String(h)}`;
  }, [rect]);

  // Early returns AFTER all hooks
  // Don't render if no rect or select tool
  if (!rect || tool === 'select') return null;

  // Only show if there's meaningful size
  if (Math.abs(screenWidth) < 2 && Math.abs(screenHeight) < 2) return null;

  return (
    <>
      {/* Preview shape */}
      <div style={style} />

      {/* Dimension label */}
      <div
        style={{
          position: 'fixed',
          left: screenX + Math.abs(screenWidth) / 2,
          top: screenY + Math.abs(screenHeight) + 8,
          transform: 'translateX(-50%)',
          padding: '2px 6px',
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
          fontSize: 11,
          fontWeight: 500,
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 1001,
          whiteSpace: 'nowrap',
        }}
      >
        {dimensionLabel}
      </div>
    </>
  );
});

export default DrawingPreview;
