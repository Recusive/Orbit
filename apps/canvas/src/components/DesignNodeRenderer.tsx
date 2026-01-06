/**
 * DesignNodeRenderer - Renders design tree nodes as visual primitives
 *
 * This component renders DesignNode types (frame, rectangle, ellipse, text)
 * as visual elements on the ReactFlow canvas for the design mode view.
 */
import { Handle, Position } from '@xyflow/react';
import React, { useMemo } from 'react';

import { radii, fontSize } from '../lib/designTokens';

import type { DesignNode, DesignNodeType, Fill, Stroke } from '../types/designNodeTypes';
import type { NodeProps } from '@xyflow/react';

// Node data interface - wraps the design node
export interface DesignNodeRendererData {
  designNode: DesignNode;
  isSelected?: boolean;
  showAutoLayoutIndicators?: boolean;
  [key: string]: unknown;
}

export interface DesignNodeRendererProps extends NodeProps {
  data: DesignNodeRendererData;
}

// Helper to convert Fill to CSS background
function fillToCSS(fills: Fill[]): string {
  if (fills.length === 0) return 'transparent';

  const fill = fills[0]; // Use first fill
  if (!fill) return 'transparent';

  if (fill.type === 'solid' && fill.color) {
    const opacity = fill.opacity ?? 1;
    // color is a string like "#ffffff" or "rgba(...)"
    if (opacity < 1 && fill.color.startsWith('#')) {
      // Convert hex to rgba with opacity
      const hex = fill.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(opacity)})`;
    }
    return fill.color;
  }

  if (fill.type === 'gradient' && fill.gradientStops) {
    const stops = fill.gradientStops
      .map((s) => `${s.color} ${String(s.position * 100)}%`)
      .join(', ');

    if (fill.gradientType === 'linear') {
      return `linear-gradient(${String(fill.gradientAngle ?? 0)}deg, ${stops})`;
    }
    return `radial-gradient(circle, ${stops})`;
  }

  return 'transparent';
}

// Helper to convert Stroke to CSS border
function strokeToCSS(strokes: Stroke[]): string {
  if (strokes.length === 0) return 'none';

  const stroke = strokes[0]; // Use first stroke
  if (!stroke?.color) return 'none';
  const opacity = stroke.opacity ?? 1;
  const style = stroke.style ?? 'solid';

  // Handle opacity for hex colors
  let color = stroke.color;
  if (opacity < 1 && color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    color = `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(opacity)})`;
  }

  return `${String(stroke.width)}px ${style} ${color}`;
}

// Icons for node type badges
const LayerIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const FrameIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
  </svg>
);

const RectIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" />
  </svg>
);

const EllipseIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const TextIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="8" y1="20" x2="16" y2="20" />
  </svg>
);

const ComponentIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

// Auto-layout direction indicators
const AutoLayoutIndicator = ({
  direction,
}: {
  direction: 'horizontal' | 'vertical';
}): React.JSX.Element => (
  <div
    style={{
      position: 'absolute',
      top: 4,
      right: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 18,
      height: 18,
      backgroundColor: 'rgba(59, 130, 246, 0.9)',
      borderRadius: radii.xs,
      color: '#fff',
    }}
    title={`Auto-layout: ${direction}`}
  >
    {direction === 'horizontal' ? (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7L8 5z" />
      </svg>
    ) : (
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ transform: 'rotate(90deg)' }}
      >
        <path d="M8 5v14l11-7L8 5z" />
      </svg>
    )}
  </div>
);

// Type badge with icon
function TypeBadge({ type }: { type: DesignNodeType }): React.JSX.Element {
  const icons: Record<DesignNodeType, React.ReactNode> = {
    layer: <LayerIcon />,
    frame: <FrameIcon />,
    rectangle: <RectIcon />,
    ellipse: <EllipseIcon />,
    text: <TextIcon />,
    component: <ComponentIcon />,
    instance: <ComponentIcon />,
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: -20,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: radii.xs,
        fontSize: fontSize.xs,
        color: 'var(--muted-foreground)',
      }}
    >
      {icons[type]}
      <span style={{ textTransform: 'capitalize' }}>{type}</span>
    </div>
  );
}

/**
 * Renders a Frame node - container with optional auto-layout
 */
function FrameRenderer({
  node,
  selected,
  showAutoLayout,
}: {
  node: DesignNode & { type: 'frame' };
  selected: boolean;
  showAutoLayout: boolean;
}): React.JSX.Element {
  const hasAutoLayout = node.autoLayout?.enabled;
  const autoLayout = node.autoLayout;

  // Calculate corner radius
  const borderRadius =
    typeof node.cornerRadius === 'number'
      ? node.cornerRadius
      : `${String(node.cornerRadius.topLeft)}px ${String(node.cornerRadius.topRight)}px ${String(node.cornerRadius.bottomRight)}px ${String(node.cornerRadius.bottomLeft)}px`;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        background: fillToCSS(node.fills),
        border: strokeToCSS(node.strokes),
        borderRadius,
        boxShadow: selected ? '0 0 0 2px var(--primary)' : undefined,
        display: hasAutoLayout ? 'flex' : undefined,
        flexDirection: hasAutoLayout && autoLayout?.direction === 'vertical' ? 'column' : 'row',
        gap: hasAutoLayout ? autoLayout?.spacing : undefined,
        padding: hasAutoLayout
          ? `${String(autoLayout?.padding.top ?? 0)}px ${String(autoLayout?.padding.right ?? 0)}px ${String(autoLayout?.padding.bottom ?? 0)}px ${String(autoLayout?.padding.left ?? 0)}px`
          : undefined,
        alignItems: hasAutoLayout
          ? autoLayout?.counterAxisAlign === 'center'
            ? 'center'
            : autoLayout?.counterAxisAlign === 'end'
              ? 'flex-end'
              : autoLayout?.counterAxisAlign === 'stretch'
                ? 'stretch'
                : 'flex-start'
          : undefined,
        justifyContent: hasAutoLayout
          ? autoLayout?.primaryAxisAlign === 'center'
            ? 'center'
            : autoLayout?.primaryAxisAlign === 'end'
              ? 'flex-end'
              : autoLayout?.primaryAxisAlign === 'space-between'
                ? 'space-between'
                : 'flex-start'
          : undefined,
        opacity: node.opacity,
        position: 'relative',
        overflow: node.clipContent ? 'hidden' : 'visible',
      }}
    >
      {showAutoLayout && hasAutoLayout && autoLayout ? (
        <AutoLayoutIndicator direction={autoLayout.direction} />
      ) : null}
    </div>
  );
}

/**
 * Renders a Layer node - page container with dashed border
 */
function LayerRenderer({
  node,
  selected,
}: {
  node: DesignNode & { type: 'layer' };
  selected: boolean;
}): React.JSX.Element {
  // Calculate corner radius
  const borderRadius =
    typeof node.cornerRadius === 'number'
      ? node.cornerRadius
      : `${String(node.cornerRadius.topLeft)}px ${String(node.cornerRadius.topRight)}px ${String(node.cornerRadius.bottomRight)}px ${String(node.cornerRadius.bottomLeft)}px`;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        background: fillToCSS(node.fills),
        border: strokeToCSS(node.strokes),
        borderRadius,
        boxShadow: selected ? '0 0 0 2px var(--accent-foreground)' : undefined,
        opacity: node.opacity,
        position: 'relative',
        overflow: node.clipContent ? 'hidden' : 'visible',
      }}
    >
      {/* Layer label badge */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid var(--border)',
          borderRadius: radii.xs,
          fontSize: fontSize.xs,
          color: 'var(--muted-foreground)',
        }}
      >
        <LayerIcon />
        <span>{node.name}</span>
      </div>
    </div>
  );
}

/**
 * Renders a Rectangle node - basic shape
 */
function RectangleRenderer({
  node,
  selected,
}: {
  node: DesignNode & { type: 'rectangle' };
  selected: boolean;
}): React.JSX.Element {
  const borderRadius =
    typeof node.cornerRadius === 'number'
      ? node.cornerRadius
      : `${String(node.cornerRadius.topLeft)}px ${String(node.cornerRadius.topRight)}px ${String(node.cornerRadius.bottomRight)}px ${String(node.cornerRadius.bottomLeft)}px`;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        background: fillToCSS(node.fills),
        border: strokeToCSS(node.strokes),
        borderRadius,
        boxShadow: selected ? '0 0 0 2px var(--primary)' : undefined,
        opacity: node.opacity,
      }}
    />
  );
}

/**
 * Renders an Ellipse node - circle/oval shape
 */
function EllipseRenderer({
  node,
  selected,
}: {
  node: DesignNode & { type: 'ellipse' };
  selected: boolean;
}): React.JSX.Element {
  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        background: fillToCSS(node.fills),
        border: strokeToCSS(node.strokes),
        borderRadius: '50%',
        boxShadow: selected ? '0 0 0 2px var(--primary)' : undefined,
        opacity: node.opacity,
      }}
    />
  );
}

/**
 * Renders a Text node
 */
function TextRenderer({
  node,
  selected,
}: {
  node: DesignNode & { type: 'text' };
  selected: boolean;
}): React.JSX.Element {
  const { textProperties } = node;
  const fill = node.fills[0];
  const color = fill?.type === 'solid' && fill.color ? fill.color : 'var(--foreground)';

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        color,
        fontSize: textProperties.fontSize,
        fontWeight: textProperties.fontWeight,
        fontFamily: textProperties.fontFamily,
        textAlign: textProperties.textAlign,
        lineHeight:
          textProperties.lineHeight === 'auto'
            ? 'normal'
            : `${String(textProperties.lineHeight)}px`,
        letterSpacing: textProperties.letterSpacing,
        textDecoration: textProperties.textDecoration,
        boxShadow: selected ? '0 0 0 2px var(--primary)' : undefined,
        opacity: node.opacity,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {textProperties.content}
    </div>
  );
}

/**
 * Renders a Component node - React component placeholder
 */
function ComponentRenderer({
  node,
  selected,
}: {
  node: DesignNode & { type: 'component' | 'instance' };
  selected: boolean;
}): React.JSX.Element {
  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        background: 'var(--muted)',
        border: `2px dashed ${selected ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: radii.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        opacity: node.opacity,
      }}
    >
      <ComponentIcon />
      <span
        style={{
          fontSize: fontSize.sm,
          color: 'var(--muted-foreground)',
        }}
      >
        {node.name}
      </span>
    </div>
  );
}

/**
 * Main DesignNodeRenderer component - dispatches to specific renderers based on node type
 */
export function DesignNodeRenderer({ data, selected }: DesignNodeRendererProps): React.JSX.Element {
  const { designNode, showAutoLayoutIndicators = true } = data;

  const renderNode = useMemo(() => {
    const isSelected = selected || false;

    switch (designNode.type) {
      case 'layer':
        return <LayerRenderer node={designNode} selected={isSelected} />;
      case 'frame':
        return (
          <FrameRenderer
            node={designNode}
            selected={isSelected}
            showAutoLayout={showAutoLayoutIndicators}
          />
        );
      case 'rectangle':
        return <RectangleRenderer node={designNode} selected={isSelected} />;
      case 'ellipse':
        return <EllipseRenderer node={designNode} selected={isSelected} />;
      case 'text':
        return <TextRenderer node={designNode} selected={isSelected} />;
      case 'component':
      case 'instance':
        return <ComponentRenderer node={designNode} selected={isSelected} />;
      default:
        return <></>;
    }
  }, [designNode, selected, showAutoLayoutIndicators]);

  // Check visibility AFTER all hooks
  if (!designNode.visible) {
    return <></>;
  }

  return (
    <>
      {/* Type badge shown above node when selected */}
      {selected ? <TypeBadge type={designNode.type} /> : null}

      {/* Node content */}
      <div
        style={{
          transform: `rotate(${String(designNode.rotation)}deg)`,
          opacity: designNode.locked ? 0.6 : 1,
          pointerEvents: designNode.locked ? 'none' : 'auto',
        }}
      >
        {renderNode}
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          background: 'var(--primary)',
          border: '2px solid #fff',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          background: 'var(--primary)',
          border: '2px solid #fff',
        }}
      />
    </>
  );
}

export default DesignNodeRenderer;
