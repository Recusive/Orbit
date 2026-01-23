/**
 * DesignCanvasNode - Optimized ReactFlow node for design mode
 *
 * This component wraps design nodes with:
 * - NodeResizer for 8-point resize handles
 * - NodeToolbar for contextual actions
 * - Proper memoization for performance
 *
 * IMPORTANT: This component is wrapped in React.memo to prevent
 * re-renders when other nodes are being dragged/resized.
 */

import { NodeResizer, NodeToolbar, Handle, Position } from '@xyflow/react';
import React, { memo, useCallback } from 'react';

import { radii, fontSize } from '../../lib/design/designTokens';

import type { DesignNode, DesignNodeType } from '../../types/designNodeTypes';
import type { NodeProps, ResizeParams } from '@xyflow/react';

// Node data interface
export interface DesignCanvasNodeData {
  designNode: DesignNode;
  onUpdate?: (nodeId: string, updates: Partial<DesignNode>) => void;
  onStartEdit?: (nodeId: string) => void;
  [key: string]: unknown;
}

export interface DesignCanvasNodeProps extends NodeProps {
  data: DesignCanvasNodeData;
}

// Resize handle styles
const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 2,
  backgroundColor: 'var(--primary)',
  border: '2px solid white',
};

const LINE_STYLE: React.CSSProperties = {
  borderColor: 'var(--primary)',
  borderWidth: 1,
};

// Icons for toolbar
const DuplicateIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="8" width="14" height="14" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const DeleteIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const LockIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UnlockIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

// Toolbar button styles
const toolbarButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: radii.xs,
  backgroundColor: 'transparent',
  color: 'var(--foreground)',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

// Node toolbar component (memoized separately)
const NodeToolbarActions = memo(function NodeToolbarActions({
  locked,
  onDuplicate,
  onDelete,
  onToggleLock,
}: {
  locked: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleLock?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        backgroundColor: 'var(--card)',
        borderRadius: radii.sm,
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <button
        style={toolbarButtonStyle}
        onClick={onDuplicate}
        title="Duplicate (Cmd+D)"
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <DuplicateIcon />
      </button>
      <button
        style={toolbarButtonStyle}
        onClick={onToggleLock}
        title={locked ? 'Unlock' : 'Lock'}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {locked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <div style={{ width: 1, height: 16, backgroundColor: 'var(--border)', margin: '0 2px' }} />
      <button
        style={{ ...toolbarButtonStyle, color: 'var(--destructive)' }}
        onClick={onDelete}
        title="Delete (Del)"
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <DeleteIcon />
      </button>
    </div>
  );
});

// Helper to convert Fill to CSS
function fillToCSS(node: DesignNode): string {
  if (node.fills.length === 0) return 'transparent';
  const fill = node.fills[0];
  if (fill?.type === 'solid' && fill.color) {
    return fill.color;
  }
  return 'transparent';
}

// Helper to convert Stroke to CSS
function strokeToCSS(node: DesignNode): string {
  if (node.strokes.length === 0) return 'none';
  const stroke = node.strokes[0];
  if (stroke !== undefined) {
    return `${String(stroke.width)}px solid ${stroke.color}`;
  }
  return 'none';
}

// Get border radius based on node type
function getBorderRadius(node: DesignNode): string | number {
  if (node.type === 'ellipse') return '50%';
  if (typeof node.cornerRadius === 'number') return node.cornerRadius;
  const cr = node.cornerRadius;
  return `${String(cr.topLeft)}px ${String(cr.topRight)}px ${String(cr.bottomRight)}px ${String(cr.bottomLeft)}px`;
}

// Node content renderer (memoized)
const NodeContent = memo(function NodeContent({
  node,
  isEditing,
}: {
  node: DesignNode;
  isEditing?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: fillToCSS(node),
    border: strokeToCSS(node),
    borderRadius: getBorderRadius(node),
    opacity: node.opacity,
    overflow:
      node.type === 'frame' && 'clipContent' in node && node.clipContent ? 'hidden' : 'visible',
  };

  // Text node special rendering
  if (node.type === 'text') {
    const { textProperties } = node;
    return (
      <div
        style={{
          ...baseStyle,
          color: fillToCSS(node) !== 'transparent' ? fillToCSS(node) : 'var(--foreground)',
          backgroundColor: 'transparent',
          fontSize: textProperties.fontSize,
          fontWeight: textProperties.fontWeight,
          fontFamily: textProperties.fontFamily,
          textAlign: textProperties.textAlign,
          lineHeight:
            textProperties.lineHeight === 'auto'
              ? 'normal'
              : `${String(textProperties.lineHeight)}px`,
          display: 'flex',
          alignItems:
            textProperties.textAlignVertical === 'center'
              ? 'center'
              : textProperties.textAlignVertical === 'bottom'
                ? 'flex-end'
                : 'flex-start',
          padding: 4,
          cursor: isEditing ? 'text' : 'default',
        }}
      >
        {textProperties.content}
      </div>
    );
  }

  // Component/Instance placeholder
  if (node.type === 'component' || node.type === 'instance') {
    return (
      <div
        style={{
          ...baseStyle,
          background:
            'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
          border: '2px dashed rgba(139, 92, 246, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span style={{ fontSize: fontSize.sm, color: 'var(--muted-foreground)' }}>{node.name}</span>
      </div>
    );
  }

  // Frame, Rectangle, Ellipse - basic shape rendering
  return <div style={baseStyle} />;
});

// Type indicator badge
const TypeBadge = memo(function TypeBadge({ type, name }: { type: DesignNodeType; name: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: -22,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: radii.xs,
        fontSize: 10,
        color: 'var(--muted-foreground)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <span style={{ textTransform: 'capitalize' }}>{type}</span>
      <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{name}</span>
    </div>
  );
});

/**
 * Main DesignCanvasNode component
 * Wrapped in React.memo for performance
 */
export const DesignCanvasNode = memo(function DesignCanvasNode({
  id,
  data,
  selected,
}: DesignCanvasNodeProps) {
  const { designNode, onUpdate, onStartEdit } = data;

  // Memoize resize handler to prevent re-renders
  const handleResize = useCallback(
    (_event: unknown, params: ResizeParams) => {
      onUpdate?.(id, {
        width: params.width,
        height: params.height,
      });
    },
    [id, onUpdate]
  );

  // Memoize toolbar handlers
  const handleDuplicate = useCallback(() => {
    // Dispatch duplicate event (handled by parent)
    const event = new CustomEvent('design:duplicate', { detail: { nodeId: id } });
    window.dispatchEvent(event);
  }, [id]);

  const handleDelete = useCallback(() => {
    const event = new CustomEvent('design:delete', { detail: { nodeId: id } });
    window.dispatchEvent(event);
  }, [id]);

  const handleToggleLock = useCallback(() => {
    onUpdate?.(id, { locked: !designNode.locked });
  }, [id, designNode.locked, onUpdate]);

  // Double-click to edit text
  const handleDoubleClick = useCallback(() => {
    if (designNode.type === 'text') {
      onStartEdit?.(id);
    }
  }, [id, designNode.type, onStartEdit]);

  // Don't render if not visible - check AFTER all hooks
  if (!designNode.visible) return null;

  return (
    <>
      {/* Resize handles - only visible when selected and not locked */}
      <NodeResizer
        isVisible={selected ? !designNode.locked : false}
        minWidth={20}
        minHeight={20}
        onResize={handleResize}
        handleStyle={HANDLE_STYLE}
        lineStyle={LINE_STYLE}
      />

      {/* Toolbar - visible on selection */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <NodeToolbarActions
          locked={designNode.locked}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onToggleLock={handleToggleLock}
        />
      </NodeToolbar>

      {/* Type badge - visible on selection */}
      {selected ? <TypeBadge type={designNode.type} name={designNode.name} /> : null}

      {/* Node content */}
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `rotate(${String(designNode.rotation)}deg)`,
          opacity: designNode.locked ? 0.6 : 1,
          cursor: designNode.locked ? 'not-allowed' : 'move',
        }}
        onDoubleClick={handleDoubleClick}
      >
        <NodeContent node={designNode} />
      </div>

      {/* Hidden handles for potential connections */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </>
  );
});

export default DesignCanvasNode;
