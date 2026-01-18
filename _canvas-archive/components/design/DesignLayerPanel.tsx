/**
 * Design Layer Panel
 *
 * Layer panel that displays the design tree hierarchy.
 * Fully integrated with the unified DesignNode system.
 *
 * Features:
 * - Tree view with expand/collapse
 * - Multi-select with Shift/Cmd
 * - Drag to reorder layers
 * - Visibility and lock toggles
 * - Rename on double-click
 * - Context menu actions
 * - Bidirectional selection sync with canvas
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';

import { spacing } from '../../lib/design/designTokens';

import type { DesignNode, DesignTree, DesignSelection } from '../../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface DesignLayerPanelProps {
  tree: DesignTree;
  selection: DesignSelection;
  onSelectNode: (nodeId: string, addToSelection?: boolean) => void;
  onClearSelection: () => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleLock: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onRename: (nodeId: string, newName: string) => void;
  onDelete: (nodeIds: string[]) => void;
  onDuplicate: (nodeIds: string[]) => void;
  onMove: (nodeId: string, newParentId: string | null, index: number) => void;
  onGroup: (nodeIds: string[], name?: string) => void;
  onUngroup: (nodeId: string) => void;
  onBringToFront: (nodeId: string) => void;
  onSendToBack: (nodeId: string) => void;
  onAddFrame?: () => void;
}

interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  targetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
}

// =============================================================================
// ICONS
// =============================================================================

const ChevronDownIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRightIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const EyeIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LockIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UnlockIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const FrameIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const TextIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const RectangleIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="1" />
  </svg>
);

const ComponentIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const PlusIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Icon mapping
const NODE_TYPE_ICONS: Record<string, React.FC> = {
  frame: FrameIcon,
  text: TextIcon,
  rectangle: RectangleIcon,
  ellipse: RectangleIcon, // Use same icon for now
  component: ComponentIcon,
  instance: ComponentIcon,
};

// =============================================================================
// STYLES
// =============================================================================

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'transparent', // Inherit from parent
    color: 'var(--foreground)',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    // No border - use spacing for separation
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'lowercase' as const,
    letterSpacing: '0.06em',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  addButtonHover: {
    backgroundColor: 'var(--muted)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  addButtonActive: {
    transform: 'scale(0.95)',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 8px 8px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 32,
    color: 'var(--muted-foreground)',
    textAlign: 'center' as const,
    gap: 12,
  },
  emptyStateIcon: {
    width: 36,
    height: 36,
    color: 'color-mix(in oklch, var(--muted-foreground) 40%, transparent)',
  },
  emptyStateText: {
    fontSize: 12,
    color: 'var(--muted-foreground)',
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderRadius: 8,
    height: 32,
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
    userSelect: 'none' as const,
    marginBottom: 2,
  },
  layerRowSelected: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
    borderLeft: '2px solid var(--primary)',
    paddingLeft: 6, // Adjust for border
  },
  layerRowHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
  },
  layerRowDragOver: {
    backgroundColor: 'var(--muted)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    transform: 'scale(1.02)',
    opacity: 0.9,
  },
  expandButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: `transform 150ms ${EASE_OUT}`,
  },
  expandPlaceholder: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  nodeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    color: 'var(--muted-foreground)',
    flexShrink: 0,
  },
  nodeIconSelected: {
    color: 'var(--primary)',
  },
  nodeName: {
    flex: 1,
    fontSize: 12,
    fontWeight: 400,
    color: 'var(--foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  nodeNameSelected: {
    fontWeight: 500,
  },
  nodeNameHidden: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
  },
  nodeNameInput: {
    flex: 1,
    padding: '2px 6px',
    backgroundColor: 'var(--input)',
    border: '1px solid var(--primary)',
    borderRadius: 4,
    color: 'var(--foreground)',
    fontSize: 12,
    outline: 'none',
  },
  nodeActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    opacity: 0,
    transition: `opacity 150ms ${EASE_OUT}`,
  },
  nodeActionsVisible: {
    opacity: 1,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 5,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
  },
  actionButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 80%, transparent)',
    color: 'var(--foreground)',
  },
  actionButtonActive: {
    color: 'var(--primary)',
  },
  dropIndicator: {
    height: 2,
    backgroundColor: 'var(--primary)',
    borderRadius: 1,
    margin: '0 8px',
  },
  selectionCount: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    padding: '10px 16px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
  },
};

// =============================================================================
// LAYER ROW COMPONENT
// =============================================================================

interface LayerRowProps {
  node: DesignNode;
  depth: number;
  isSelected: boolean;
  isEditing: boolean;
  isDragTarget: boolean;
  dropPosition: 'before' | 'after' | 'inside' | null;
  onSelect: (nodeId: string, addToSelection?: boolean) => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleLock: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onStartRename: (nodeId: string) => void;
  onRename: (nodeId: string, newName: string) => void;
  onCancelRename: () => void;
  onDragStart: (nodeId: string) => void;
  onDragOver: (nodeId: string, position: 'before' | 'after' | 'inside') => void;
  onDragEnd: () => void;
}

function LayerRow({
  node,
  depth,
  isSelected,
  isEditing,
  isDragTarget,
  dropPosition,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleExpand,
  onStartRename,
  onRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragEnd,
}: LayerRowProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const hasChildren = node.children.length > 0;
  const NodeIcon = NODE_TYPE_ICONS[node.type] ?? FrameIcon;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSelect(node.id, e.metaKey || e.ctrlKey || e.shiftKey);
    },
    [node.id, onSelect]
  );

  const handleDoubleClick = useCallback(() => {
    onStartRename(node.id);
    setEditValue(node.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [node.id, node.name, onStartRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onRename(node.id, editValue);
      } else if (e.key === 'Escape') {
        onCancelRename();
        setEditValue(node.name);
      }
    },
    [node.id, node.name, editValue, onRename, onCancelRename]
  );

  const handleBlur = useCallback(() => {
    if (editValue !== node.name) {
      onRename(node.id, editValue);
    } else {
      onCancelRename();
    }
  }, [node.id, node.name, editValue, onRename, onCancelRename]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      onDragStart(node.id);
    },
    [node.id, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const third = rect.height / 3;

      let position: 'before' | 'after' | 'inside';
      if (y < third) {
        position = 'before';
      } else if (y > third * 2) {
        position = 'after';
      } else {
        position = 'inside';
      }

      onDragOver(node.id, position);
    },
    [node.id, onDragOver]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDragEnd();
    },
    [onDragEnd]
  );

  const indentStyle = {
    paddingLeft: spacing.md + depth * spacing.xl,
  };

  const rowStyle = {
    ...styles.layerRow,
    ...indentStyle,
    ...(isSelected ? styles.layerRowSelected : {}),
    ...(isHovered && !isSelected ? styles.layerRowHover : {}),
    ...(isDragTarget && dropPosition === 'inside' ? styles.layerRowDragOver : {}),
  };

  return (
    <>
      {isDragTarget && dropPosition === 'before' ? (
        <div style={{ ...styles.dropIndicator, marginLeft: spacing.md + depth * spacing.xl }} />
      ) : null}
      <div
        ref={rowRef}
        style={rowStyle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        draggable={!isEditing && !node.locked}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Expand/Collapse button */}
        {hasChildren ? (
          <button
            style={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {node.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : (
          <div style={styles.expandPlaceholder} />
        )}

        {/* Node icon */}
        <div
          style={{
            ...styles.nodeIcon,
            ...(isSelected ? styles.nodeIconSelected : {}),
          }}
        >
          <NodeIcon />
        </div>

        {/* Node name */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            style={styles.nodeNameInput}
            autoFocus
          />
        ) : (
          <span
            style={{
              ...styles.nodeName,
              ...(isSelected ? styles.nodeNameSelected : {}),
              ...(!node.visible ? styles.nodeNameHidden : {}),
            }}
          >
            {node.name}
          </span>
        )}

        {/* Action buttons */}
        <div
          style={{
            ...styles.nodeActions,
            ...(isHovered || isSelected ? styles.nodeActionsVisible : {}),
          }}
        >
          <button
            style={{
              ...styles.actionButton,
              ...(!node.visible ? styles.actionButtonActive : {}),
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.id);
            }}
            title={node.visible ? 'Hide' : 'Show'}
          >
            {node.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            style={{
              ...styles.actionButton,
              ...(node.locked ? styles.actionButtonActive : {}),
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(node.id);
            }}
            title={node.locked ? 'Unlock' : 'Lock'}
          >
            {node.locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>
      </div>
      {isDragTarget && dropPosition === 'after' ? (
        <div style={{ ...styles.dropIndicator, marginLeft: spacing.md + depth * spacing.xl }} />
      ) : null}
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DesignLayerPanel({
  tree,
  selection,
  onSelectNode,
  onClearSelection,
  onToggleVisibility,
  onToggleLock,
  onToggleExpand,
  onRename,
  onDelete,
  onDuplicate,
  onMove,
  onGroup,
  onUngroup,
  onBringToFront,
  onSendToBack,
  onAddFrame,
}: DesignLayerPanelProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedId: null,
    targetId: null,
    dropPosition: null,
  });
  const [hoveredAddButton, setHoveredAddButton] = useState(false);
  const [activeAddButton, setActiveAddButton] = useState(false);

  // Flatten tree for display
  const flattenedNodes = useMemo(() => {
    const nodes: { node: DesignNode; depth: number }[] = [];

    function traverse(nodeId: string, depth: number): void {
      const node = tree.nodes.get(nodeId);
      if (!node) return;

      nodes.push({ node, depth });

      if (node.expanded && node.children.length > 0) {
        for (const childId of node.children) {
          traverse(childId, depth + 1);
        }
      }
    }

    for (const rootId of tree.rootIds) {
      traverse(rootId, 0);
    }

    return nodes;
  }, [tree]);

  // Handlers
  const handleStartRename = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const handleRename = useCallback(
    (id: string, newName: string) => {
      onRename(id, newName);
      setEditingId(null);
    },
    [onRename]
  );

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDragState({
      isDragging: true,
      draggedId: id,
      targetId: null,
      dropPosition: null,
    });
  }, []);

  const handleDragOver = useCallback(
    (targetId: string, position: 'before' | 'after' | 'inside') => {
      if (dragState.draggedId && targetId !== dragState.draggedId) {
        setDragState((prev) => ({
          ...prev,
          targetId,
          dropPosition: position,
        }));
      }
    },
    [dragState.draggedId]
  );

  const handleDragEnd = useCallback(() => {
    if (dragState.draggedId && dragState.targetId && dragState.dropPosition) {
      const targetNode = tree.nodes.get(dragState.targetId);
      if (!targetNode) return;

      let newParentId: string | null;
      let index: number;

      switch (dragState.dropPosition) {
        case 'before': {
          newParentId = targetNode.parentId;
          const beforeSiblings = newParentId
            ? (tree.nodes.get(newParentId)?.children ?? [])
            : tree.rootIds;
          index = beforeSiblings.indexOf(dragState.targetId);
          break;
        }

        case 'after': {
          newParentId = targetNode.parentId;
          const afterSiblings = newParentId
            ? (tree.nodes.get(newParentId)?.children ?? [])
            : tree.rootIds;
          index = afterSiblings.indexOf(dragState.targetId) + 1;
          break;
        }

        case 'inside':
          newParentId = dragState.targetId;
          index = targetNode.children.length;
          break;

        default:
          return;
      }

      onMove(dragState.draggedId, newParentId, index);
    }

    setDragState({
      isDragging: false,
      draggedId: null,
      targetId: null,
      dropPosition: null,
    });
  }, [dragState, tree, onMove]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selection.nodeIds.length === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(selection.nodeIds);
      } else if (e.key === 'F2' || (e.key === 'Enter' && selection.nodeIds.length === 1)) {
        e.preventDefault();
        const firstNodeId = selection.nodeIds[0];
        if (firstNodeId !== undefined) {
          setEditingId(firstNodeId);
        }
      } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onDuplicate(selection.nodeIds);
      } else if (e.key === 'g' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ungroup
          const firstNodeId = selection.nodeIds[0];
          if (selection.nodeIds.length === 1 && firstNodeId !== undefined) {
            onUngroup(firstNodeId);
          }
        } else {
          // Group
          if (selection.nodeIds.length > 1) {
            onGroup(selection.nodeIds);
          }
        }
      } else if (e.key === ']' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const firstNodeId = selection.nodeIds[0];
        if (selection.nodeIds.length === 1 && firstNodeId !== undefined) {
          onBringToFront(firstNodeId);
        }
      } else if (e.key === '[' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const firstNodeId = selection.nodeIds[0];
        if (selection.nodeIds.length === 1 && firstNodeId !== undefined) {
          onSendToBack(firstNodeId);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClearSelection();
      }
    },
    [
      selection.nodeIds,
      onDelete,
      onDuplicate,
      onGroup,
      onUngroup,
      onBringToFront,
      onSendToBack,
      onClearSelection,
    ]
  );

  const selectedCount = selection.nodeIds.length;

  return (
    <div style={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>layers</span>
        <button
          style={{
            ...styles.addButton,
            ...(hoveredAddButton ? styles.addButtonHover : {}),
            ...(activeAddButton ? styles.addButtonActive : {}),
          }}
          onMouseEnter={() => {
            setHoveredAddButton(true);
          }}
          onMouseLeave={() => {
            setHoveredAddButton(false);
            setActiveAddButton(false);
          }}
          onMouseDown={() => {
            setActiveAddButton(true);
          }}
          onMouseUp={() => {
            setActiveAddButton(false);
          }}
          onClick={onAddFrame}
          title="Add frame"
        >
          <PlusIcon />
        </button>
      </div>

      <div style={styles.scrollContainer}>
        {flattenedNodes.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyStateIcon}>
              <FrameIcon />
            </div>
            <span style={styles.emptyStateText}>No layers yet</span>
          </div>
        ) : (
          flattenedNodes.map(({ node, depth }) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={depth}
              isSelected={selection.nodeIds.includes(node.id)}
              isEditing={editingId === node.id}
              isDragTarget={dragState.targetId === node.id}
              dropPosition={dragState.targetId === node.id ? dragState.dropPosition : null}
              onSelect={onSelectNode}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onToggleExpand={onToggleExpand}
              onStartRename={handleStartRename}
              onRename={handleRename}
              onCancelRename={handleCancelRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>

      {selectedCount > 0 && (
        <div style={styles.selectionCount}>
          {selectedCount} {selectedCount === 1 ? 'layer' : 'layers'} selected
        </div>
      )}
    </div>
  );
}

export default DesignLayerPanel;
