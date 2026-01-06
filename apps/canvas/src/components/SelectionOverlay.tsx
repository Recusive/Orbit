/**
 * SelectionOverlay Component
 *
 * Displays selection handles around selected elements for visual editing.
 * Supports drag-to-move and resize operations.
 */

import React, { useCallback, useMemo } from 'react';

// Colors come from CSS variables in globals.css

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionOverlayProps {
  rect: SelectionRect | null;
  isAbsolute: boolean;
  isLocked: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (handle: ResizeHandle, e: React.MouseEvent) => void;
}

interface HandleConfig {
  position: ResizeHandle;
  cursor: string;
  style: React.CSSProperties;
}

const HANDLE_SIZE = 8;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

const styles = {
  container: {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    zIndex: 9999,
  },
  selectionBox: {
    position: 'absolute' as const,
    border: '2px solid var(--info)',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    pointerEvents: 'auto' as const,
  },
  selectionBoxLocked: {
    border: '2px dashed var(--muted-foreground)',
    backgroundColor: 'transparent',
  },
  handle: {
    position: 'absolute' as const,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: 'var(--foreground)',
    border: '1px solid var(--info)',
    borderRadius: 1,
    pointerEvents: 'auto' as const,
  },
  handleHover: {
    backgroundColor: 'var(--info)',
  },
  label: {
    position: 'absolute' as const,
    top: -24,
    left: 0,
    fontSize: 11,
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: 'var(--info)',
    color: 'var(--foreground)',
    padding: '2px 6px',
    borderRadius: 3,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
  },
  dimensions: {
    position: 'absolute' as const,
    bottom: -20,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 10,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    padding: '2px 4px',
    borderRadius: 2,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
  },
};

// Handle configurations for 8-point resize
const getHandleConfigs = (rect: SelectionRect): HandleConfig[] => [
  {
    position: 'nw',
    cursor: 'nwse-resize',
    style: { left: -HANDLE_OFFSET, top: -HANDLE_OFFSET },
  },
  {
    position: 'n',
    cursor: 'ns-resize',
    style: { left: rect.width / 2 - HANDLE_OFFSET, top: -HANDLE_OFFSET },
  },
  {
    position: 'ne',
    cursor: 'nesw-resize',
    style: { left: rect.width - HANDLE_OFFSET, top: -HANDLE_OFFSET },
  },
  {
    position: 'e',
    cursor: 'ew-resize',
    style: { left: rect.width - HANDLE_OFFSET, top: rect.height / 2 - HANDLE_OFFSET },
  },
  {
    position: 'se',
    cursor: 'nwse-resize',
    style: { left: rect.width - HANDLE_OFFSET, top: rect.height - HANDLE_OFFSET },
  },
  {
    position: 's',
    cursor: 'ns-resize',
    style: { left: rect.width / 2 - HANDLE_OFFSET, top: rect.height - HANDLE_OFFSET },
  },
  {
    position: 'sw',
    cursor: 'nesw-resize',
    style: { left: -HANDLE_OFFSET, top: rect.height - HANDLE_OFFSET },
  },
  {
    position: 'w',
    cursor: 'ew-resize',
    style: { left: -HANDLE_OFFSET, top: rect.height / 2 - HANDLE_OFFSET },
  },
];

export function SelectionOverlay({
  rect,
  isAbsolute,
  isLocked,
  onDragStart,
  onResizeStart,
}: SelectionOverlayProps): React.JSX.Element | null {
  const [hoveredHandle, setHoveredHandle] = React.useState<ResizeHandle | null>(null);

  const handleConfigs = useMemo(() => {
    if (!rect) return [];
    return getHandleConfigs(rect);
  }, [rect]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isLocked) return;
      e.preventDefault();
      e.stopPropagation();
      onDragStart?.(e);
    },
    [isLocked, onDragStart]
  );

  const handleResizeMouseDown = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent) => {
      if (isLocked || !isAbsolute) return;
      e.preventDefault();
      e.stopPropagation();
      onResizeStart?.(handle, e);
    },
    [isLocked, isAbsolute, onResizeStart]
  );

  // Early return AFTER all hooks
  if (!rect) return null;

  return (
    <div style={styles.container}>
      {/* Selection box */}
      <div
        style={{
          ...styles.selectionBox,
          ...(isLocked ? styles.selectionBoxLocked : {}),
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          cursor: isLocked ? 'not-allowed' : isAbsolute ? 'move' : 'default',
        }}
        onMouseDown={isAbsolute ? handleMouseDown : undefined}
      >
        {/* Resize handles (only for absolute positioning) */}
        {isAbsolute && !isLocked
          ? handleConfigs.map((config) => (
              <div
                key={config.position}
                style={{
                  ...styles.handle,
                  ...config.style,
                  cursor: config.cursor,
                  ...(hoveredHandle === config.position ? styles.handleHover : {}),
                }}
                onMouseDown={(e) => {
                  handleResizeMouseDown(config.position, e);
                }}
                onMouseEnter={() => {
                  setHoveredHandle(config.position);
                }}
                onMouseLeave={() => {
                  setHoveredHandle(null);
                }}
              />
            ))
          : null}
      </div>

      {/* Dimensions label */}
      <div
        style={{
          ...styles.dimensions,
          left: rect.x + rect.width / 2,
          top: rect.y + rect.height + 4,
          transform: 'translateX(-50%)',
        }}
      >
        {Math.round(rect.width)} × {Math.round(rect.height)}
      </div>
    </div>
  );
}

/**
 * SnapGuide Component
 * Renders alignment guides during drag/resize operations
 */
export interface SnapGuide {
  type: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
}

export interface SnapGuidesProps {
  guides: SnapGuide[];
  containerRect: { width: number; height: number };
}

const guideStyles = {
  guide: {
    position: 'absolute' as const,
    backgroundColor: '#ff00ff',
    pointerEvents: 'none' as const,
    zIndex: 9998,
  },
  verticalGuide: {
    width: 1,
  },
  horizontalGuide: {
    height: 1,
  },
};

export function SnapGuides({ guides }: SnapGuidesProps): React.JSX.Element {
  return (
    <>
      {guides.map((guide, index) => (
        <div
          key={`${guide.type}-${String(guide.position)}-${String(index)}`}
          style={{
            ...guideStyles.guide,
            ...(guide.type === 'vertical'
              ? {
                  ...guideStyles.verticalGuide,
                  left: guide.position,
                  top: guide.start,
                  height: guide.end - guide.start,
                }
              : {
                  ...guideStyles.horizontalGuide,
                  top: guide.position,
                  left: guide.start,
                  width: guide.end - guide.start,
                }),
          }}
        />
      ))}
    </>
  );
}

/**
 * MultiSelectionOverlay Component
 * Shows bounding box for multiple selected elements
 */
export interface MultiSelectionOverlayProps {
  rects: SelectionRect[];
  onDragStart?: (e: React.MouseEvent) => void;
}

export function MultiSelectionOverlay({
  rects,
  onDragStart,
}: MultiSelectionOverlayProps): React.JSX.Element | null {
  // Calculate bounding box of all selections (must be before early return for rules-of-hooks)
  const boundingBox = useMemo(() => {
    if (rects.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [rects]);

  // Early return after hooks (rules-of-hooks compliant)
  if (rects.length === 0) return null;

  return (
    <div style={styles.container}>
      {/* Individual selection outlines */}
      {rects.map((rect, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            border: '1px solid var(--info)',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Bounding box */}
      {rects.length > 1 && (
        <div
          style={{
            position: 'absolute',
            left: boundingBox.x - 2,
            top: boundingBox.y - 2,
            width: boundingBox.width + 4,
            height: boundingBox.height + 4,
            border: '1px dashed var(--info)',
            cursor: 'move',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart?.(e);
          }}
        />
      )}
    </div>
  );
}
