/**
 * FrameNode Component
 *
 * A frame container that can hold children with auto-layout support.
 * Frames are the primary building block for creating nested design hierarchies.
 */

import React, { useMemo, useCallback, useState } from 'react';

// Import removed - using CSS variables from globals.css instead

import type {
  FrameNode as FrameNodeType,
  DesignNode,
  AutoLayout,
  Fill,
  Stroke,
  CornerRadius,
} from '../../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface FrameNodeProps {
  node: FrameNodeType;
  children?: React.ReactNode;
  isSelected: boolean;
  isHovered: boolean;
  isEditing: boolean; // Whether we're editing children inside this frame
  onSelect: (nodeId: string, addToSelection?: boolean) => void;
  onDoubleClick: (nodeId: string) => void;
  onDragStart: (nodeId: string, e: React.MouseEvent) => void;
  onResizeStart: (nodeId: string, handle: ResizeHandle, e: React.MouseEvent) => void;
  renderChild: (childId: string) => React.ReactNode;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  frame: {
    position: 'absolute' as const,
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
  },
  frameSelected: {
    outline: '2px solid var(--primary)',
    outlineOffset: '-1px',
  },
  frameHovered: {
    outline: '1px solid var(--selection-border)',
    outlineOffset: '-1px',
  },
  frameEditing: {
    outline: '2px dashed var(--primary)',
    outlineOffset: '-1px',
  },
  frameName: {
    position: 'absolute' as const,
    top: -20,
    left: 0,
    fontSize: 11,
    fontFamily: 'system-ui, sans-serif',
    color: 'var(--primary)',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  frameNameSelected: {
    fontWeight: 600,
  },
  childrenContainer: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  },
  // Resize handles
  handle: {
    position: 'absolute' as const,
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    border: '1px solid var(--primary)',
    borderRadius: 1,
    zIndex: 10,
  },
  handleHover: {
    backgroundColor: 'var(--primary)',
  },
  // Empty state
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    color: 'rgba(0, 0, 0, 0.3)',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    pointerEvents: 'none' as const,
  },
  // Auto-layout indicators
  autoLayoutIndicator: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: '2px 4px',
    borderRadius: 2,
    pointerEvents: 'none' as const,
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert fill config to CSS background
 */
function fillToCSS(fill: Fill): string {
  if (fill.type === 'solid') {
    const color = fill.color ?? '#ffffff';
    const opacity = fill.opacity ?? 1;
    if (opacity === 1) return color;
    // Convert to rgba
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(opacity)})`;
  }

  if (fill.type === 'gradient' && fill.gradientStops) {
    const stops = fill.gradientStops
      .map((stop) => `${stop.color} ${String(stop.position * 100)}%`)
      .join(', ');
    const angle = fill.gradientAngle ?? 0;
    return fill.gradientType === 'radial'
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${String(angle)}deg, ${stops})`;
  }

  if (fill.type === 'image' && fill.imageUrl) {
    return `url(${fill.imageUrl})`;
  }

  return 'transparent';
}

/**
 * Convert stroke config to CSS border
 */
function strokeToCSS(stroke: Stroke): string {
  const style = stroke.style ?? 'solid';
  return `${String(stroke.width)}px ${style} ${stroke.color}`;
}

/**
 * Convert corner radius to CSS
 */
function cornerRadiusToCSS(radius: CornerRadius | number): string {
  if (typeof radius === 'number') {
    return `${String(radius)}px`;
  }
  return `${String(radius.topLeft)}px ${String(radius.topRight)}px ${String(radius.bottomRight)}px ${String(radius.bottomLeft)}px`;
}

/**
 * Generate auto-layout styles
 */
function autoLayoutToCSS(autoLayout: AutoLayout): React.CSSProperties {
  if (!autoLayout.enabled) return {};

  const isHorizontal = autoLayout.direction === 'horizontal';

  return {
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    gap: autoLayout.spacing,
    padding: `${String(autoLayout.padding.top)}px ${String(autoLayout.padding.right)}px ${String(autoLayout.padding.bottom)}px ${String(autoLayout.padding.left)}px`,
    alignItems: mapCounterAxisAlign(autoLayout.counterAxisAlign),
    justifyContent: mapPrimaryAxisAlign(autoLayout.primaryAxisAlign),
    flexWrap: autoLayout.wrap ? 'wrap' : 'nowrap',
  };
}

function mapPrimaryAxisAlign(align: string): string {
  switch (align) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'space-between':
      return 'space-between';
    default:
      return 'flex-start';
  }
}

function mapCounterAxisAlign(align: string): string {
  switch (align) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'stretch':
      return 'stretch';
    case 'baseline':
      return 'baseline';
    default:
      return 'flex-start';
  }
}

// =============================================================================
// RESIZE HANDLE COMPONENT
// =============================================================================

interface ResizeHandleProps {
  position: ResizeHandle;
  onMouseDown: (handle: ResizeHandle, e: React.MouseEvent) => void;
}

const handlePositions: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -4, left: -4, cursor: 'nwse-resize' },
  n: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
  ne: { top: -4, right: -4, cursor: 'nesw-resize' },
  e: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
  se: { bottom: -4, right: -4, cursor: 'nwse-resize' },
  s: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
  sw: { bottom: -4, left: -4, cursor: 'nesw-resize' },
  w: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
};

function ResizeHandleComponent({ position, onMouseDown }: ResizeHandleProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        ...styles.handle,
        ...handlePositions[position],
        ...(isHovered ? styles.handleHover : {}),
      }}
      onMouseDown={(e) => {
        onMouseDown(position, e);
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    />
  );
}

// =============================================================================
// FRAME NODE COMPONENT
// =============================================================================

export function FrameNodeComponent({
  node,
  isSelected,
  isHovered,
  isEditing,
  onSelect,
  onDoubleClick,
  onDragStart,
  onResizeStart,
  renderChild,
}: FrameNodeProps): React.JSX.Element {
  // Compute frame styles
  const frameStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      ...styles.frame,
      left: node.x,
      top: node.y,
      width: node.width,
      height: node.height,
      opacity: node.opacity,
      transform: node.rotation !== 0 ? `rotate(${String(node.rotation)}deg)` : undefined,
      overflow: node.clipContent ? 'hidden' : 'visible',
    };

    // Apply fills (use first fill for background)
    if (node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill) {
        if (fill.type === 'solid') {
          style.backgroundColor = fillToCSS(fill);
        } else {
          style.background = fillToCSS(fill);
        }
      }
    }

    // Apply stroke (use first stroke for border)
    if (node.strokes.length > 0) {
      const stroke = node.strokes[0];
      if (stroke) {
        style.border = strokeToCSS(stroke);
      }
    }

    // Apply corner radius
    style.borderRadius = cornerRadiusToCSS(node.cornerRadius);

    // Apply shadows
    if (node.effects.shadows.length > 0) {
      const shadowCSS = node.effects.shadows
        .map((s) => {
          const inset = s.type === 'inner' ? 'inset ' : '';
          return `${inset}${String(s.x)}px ${String(s.y)}px ${String(s.blur)}px ${String(s.spread)}px ${s.color}`;
        })
        .join(', ');
      style.boxShadow = shadowCSS;
    }

    // Apply blur
    if (node.effects.blur) {
      const blur = node.effects.blur;
      if (blur.type === 'layer') {
        style.filter = `blur(${String(blur.radius)}px)`;
      } else {
        style.backdropFilter = `blur(${String(blur.radius)}px)`;
      }
    }

    return style;
  }, [node]);

  // Compute children container styles (for auto-layout)
  const childrenContainerStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = { ...styles.childrenContainer };

    if (node.autoLayout?.enabled) {
      return { ...base, ...autoLayoutToCSS(node.autoLayout) };
    }

    return base;
  }, [node.autoLayout]);

  // Event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onSelect(node.id, e.shiftKey || e.metaKey);
    },
    [node.id, onSelect]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onDoubleClick(node.id);
    },
    [node.id, onDoubleClick]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (e.button !== 0) return; // Left click only
      if (node.locked) return;

      // Don't start drag if clicking on a resize handle
      const target = e.target as HTMLElement;
      if (target.dataset['resizeHandle'] !== undefined) return;

      onDragStart(node.id, e);
    },
    [node.id, node.locked, onDragStart]
  );

  const handleResizeMouseDown = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent): void => {
      e.stopPropagation();
      if (node.locked) return;
      onResizeStart(node.id, handle, e);
    },
    [node.id, node.locked, onResizeStart]
  );

  // Determine outline style
  const outlineStyle = isEditing
    ? styles.frameEditing
    : isSelected
      ? styles.frameSelected
      : isHovered
        ? styles.frameHovered
        : {};

  const hasChildren = node.children.length > 0;
  const showAutoLayoutIndicator = node.autoLayout?.enabled && isSelected;

  return (
    <div
      style={{ ...frameStyle, ...outlineStyle }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      data-node-id={node.id}
      data-node-type="frame"
    >
      {/* Frame name label (shown when selected) */}
      {isSelected ? (
        <div style={{ ...styles.frameName, ...styles.frameNameSelected }}>{node.name}</div>
      ) : null}

      {/* Auto-layout indicator */}
      {showAutoLayoutIndicator ? (
        <div style={styles.autoLayoutIndicator}>
          {node.autoLayout?.direction === 'horizontal' ? '→' : '↓'}
        </div>
      ) : null}

      {/* Children */}
      <div style={childrenContainerStyle}>
        {hasChildren ? (
          node.children.map((childId) => renderChild(childId))
        ) : (
          <div style={styles.emptyState}>{node.autoLayout?.enabled ? 'Auto Layout' : 'Frame'}</div>
        )}
      </div>

      {/* Resize handles (shown when selected and not locked) */}
      {isSelected && !node.locked ? (
        <>
          <ResizeHandleComponent position="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="sw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandleComponent position="w" onMouseDown={handleResizeMouseDown} />
        </>
      ) : null}
    </div>
  );
}

// =============================================================================
// TEXT NODE COMPONENT (simplified for now)
// =============================================================================

export interface TextNodeProps {
  node: DesignNode & {
    type: 'text';
    textProperties: { content: string; fontSize: number; fontWeight: number; fontFamily: string };
  };
  isSelected: boolean;
  onSelect: (nodeId: string, addToSelection?: boolean) => void;
}

export function TextNodeComponent({
  node,
  isSelected,
  onSelect,
}: TextNodeProps): React.JSX.Element {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    fontSize: node.textProperties.fontSize,
    fontWeight: node.textProperties.fontWeight,
    fontFamily: node.textProperties.fontFamily,
    color: node.fills[0]?.color ?? 'var(--foreground)',
    opacity: node.opacity,
    outline: isSelected ? '2px solid var(--primary)' : undefined,
  };

  return (
    <div
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id, e.shiftKey || e.metaKey);
      }}
      data-node-id={node.id}
      data-node-type="text"
    >
      {node.textProperties.content}
    </div>
  );
}

// =============================================================================
// RECTANGLE NODE COMPONENT (simplified for now)
// =============================================================================

export interface RectangleNodeProps {
  node: DesignNode & { type: 'rectangle' };
  isSelected: boolean;
  onSelect: (nodeId: string, addToSelection?: boolean) => void;
}

export function RectangleNodeComponent({
  node,
  isSelected,
  onSelect,
}: RectangleNodeProps): React.JSX.Element {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    backgroundColor: node.fills[0]?.color ?? 'var(--muted)',
    borderRadius: cornerRadiusToCSS(node.cornerRadius),
    opacity: node.opacity,
    outline: isSelected ? '2px solid var(--primary)' : undefined,
  };

  if (node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke) {
      style.border = strokeToCSS(stroke);
    }
  }

  return (
    <div
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id, e.shiftKey || e.metaKey);
      }}
      data-node-id={node.id}
      data-node-type="rectangle"
    />
  );
}

export default FrameNodeComponent;
