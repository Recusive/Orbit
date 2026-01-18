/**
 * Design Canvas Component
 *
 * The main canvas component that renders the design tree using the new unified system.
 * This is the integration point for the DesignNode system.
 *
 * Features:
 * - Renders frames, text, rectangles, and components
 * - Handles selection, dragging, and resizing
 * - Supports keyboard shortcuts
 * - Integrates with the layer panel for bidirectional selection
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';

import { useDesignTree } from '../../hooks/design/useDesignTree';
import { spacing } from '../../lib/design/designTokens';
import { DesignLayerPanel } from '../design/DesignLayerPanel';
import { FrameNodeComponent, TextNodeComponent, RectangleNodeComponent } from '../nodes/FrameNode';

import type { DesignNode, DesignTree } from '../../types/designNodeTypes';
import type { ResizeHandle } from '../nodes/FrameNode';

// =============================================================================
// TYPES
// =============================================================================

export interface DesignCanvasProps {
  initialTree?: DesignTree;
  showLayerPanel?: boolean;
  onSelectionChange?: (nodeIds: string[]) => void;
}

interface DragState {
  isDragging: boolean;
  nodeId: string | null;
  startX: number;
  startY: number;
  startNodeX: number;
  startNodeY: number;
}

interface ResizeState {
  isResizing: boolean;
  nodeId: string | null;
  handle: ResizeHandle | null;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startNodeX: number;
  startNodeY: number;
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--background)',
  },
  layerPanel: {
    width: 260,
    borderRight: '1px solid var(--border)',
    flexShrink: 0,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--canvas-bg)',
    backgroundImage: `
			radial-gradient(circle, var(--canvas-grid) 1px, transparent 1px)
		`,
    backgroundSize: '20px 20px',
  },
  viewport: {
    position: 'absolute' as const,
    transformOrigin: '0 0',
  },
  emptyState: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center' as const,
    color: 'var(--muted-foreground)',
    fontFamily: 'system-ui, sans-serif',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    opacity: 0.7,
  },
  toolbar: {
    position: 'absolute' as const,
    bottom: spacing.xl,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'var(--card)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  toolbarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    fontSize: 18,
    transition: 'all 0.15s ease',
  },
  statusBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: `${String(spacing.sm)}px ${String(spacing.xl)}px`,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 11,
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    justifyContent: 'space-between',
  },
};

// =============================================================================
// ICONS
// =============================================================================

const FrameIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const TextIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const RectangleIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="1" />
  </svg>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DesignCanvas({
  showLayerPanel = true,
  onSelectionChange,
}: DesignCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [,] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  // Drag and resize state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    nodeId: null,
    handle: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  // Use the design tree hook
  const designTree = useDesignTree();
  const {
    tree,
    selection,
    viewport,
    selectedNodes,
    dispatch,
    addFrame,
    addText,
    addRectangle,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    selectNode,
    clearSelection,
    updateNode,
    setPosition,
    undo,
    redo,
    canUndo,
    canRedo,
  } = designTree;

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selection.nodeIds);
  }, [selection.nodeIds, onSelectionChange]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        e.target === canvasRef.current ||
        (e.target as HTMLElement).dataset['canvas'] !== undefined
      ) {
        clearSelection();
      }
    },
    [clearSelection]
  );

  // Handle node selection
  const handleSelectNode = useCallback(
    (nodeId: string, addToSelection?: boolean) => {
      selectNode(nodeId, addToSelection);
    },
    [selectNode]
  );

  // Handle node double-click (enter edit mode)
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  // Handle drag start
  const handleDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      const node = tree.nodes.get(nodeId);
      if (!node) return;

      setDragState({
        isDragging: true,
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
      });

      // Select if not already selected
      if (!selection.nodeIds.includes(nodeId)) {
        selectNode(nodeId);
      }
    },
    [tree.nodes, selection.nodeIds, selectNode]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (nodeId: string, handle: ResizeHandle, e: React.MouseEvent) => {
      const node = tree.nodes.get(nodeId);
      if (!node) return;

      setResizeState({
        isResizing: true,
        nodeId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: node.width,
        startHeight: node.height,
        startNodeX: node.x,
        startNodeY: node.y,
      });
    },
    [tree.nodes]
  );

  // Handle mouse move (for drag and resize)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (dragState.isDragging && dragState.nodeId) {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;
        setPosition(dragState.nodeId, dragState.startNodeX + deltaX, dragState.startNodeY + deltaY);
      }

      if (resizeState.isResizing && resizeState.nodeId && resizeState.handle) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaY = e.clientY - resizeState.startY;

        let newX = resizeState.startNodeX;
        let newY = resizeState.startNodeY;
        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;

        const handle = resizeState.handle;

        // Calculate new dimensions based on handle
        if (handle.includes('e')) {
          newWidth = Math.max(20, resizeState.startWidth + deltaX);
        }
        if (handle.includes('w')) {
          const widthDelta = -deltaX;
          newWidth = Math.max(20, resizeState.startWidth + widthDelta);
          if (newWidth > 20) {
            newX = resizeState.startNodeX + deltaX;
          }
        }
        if (handle.includes('s')) {
          newHeight = Math.max(20, resizeState.startHeight + deltaY);
        }
        if (handle.includes('n')) {
          const heightDelta = -deltaY;
          newHeight = Math.max(20, resizeState.startHeight + heightDelta);
          if (newHeight > 20) {
            newY = resizeState.startNodeY + deltaY;
          }
        }

        dispatch({
          type: 'SET_TRANSFORM',
          nodeId: resizeState.nodeId,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }
    };

    const handleMouseUp = (): void => {
      if (dragState.isDragging) {
        setDragState({
          isDragging: false,
          nodeId: null,
          startX: 0,
          startY: 0,
          startNodeX: 0,
          startNodeY: 0,
        });
      }

      if (resizeState.isResizing) {
        setResizeState({
          isResizing: false,
          nodeId: null,
          handle: null,
          startX: 0,
          startY: 0,
          startWidth: 0,
          startHeight: 0,
          startNodeX: 0,
          startNodeY: 0,
        });
      }
    };

    if (dragState.isDragging || resizeState.isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, resizeState, setPosition, dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'g' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        groupSelected();
      } else if (e.key === 'g' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        ungroupSelected();
      } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        clearSelection();
        setEditingNodeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    deleteSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    undo,
    redo,
    clearSelection,
  ]);

  // Render a node recursively
  const renderNode = useCallback(
    (nodeId: string): React.ReactNode => {
      const node = tree.nodes.get(nodeId);
      if (!node?.visible) return null;

      const isSelected = selection.nodeIds.includes(node.id);
      const isHovered = false;
      const isEditing = editingNodeId === node.id;

      switch (node.type) {
        case 'frame':
          return (
            <FrameNodeComponent
              key={node.id}
              node={node}
              isSelected={isSelected}
              isHovered={isHovered}
              isEditing={isEditing}
              onSelect={handleSelectNode}
              onDoubleClick={handleNodeDoubleClick}
              onDragStart={handleDragStart}
              onResizeStart={handleResizeStart}
              renderChild={renderNode}
            />
          );

        case 'text':
          return (
            <TextNodeComponent
              key={node.id}
              node={
                node as DesignNode & {
                  type: 'text';
                  textProperties: {
                    content: string;
                    fontSize: number;
                    fontWeight: number;
                    fontFamily: string;
                  };
                }
              }
              isSelected={isSelected}
              onSelect={handleSelectNode}
            />
          );

        case 'rectangle':
          return (
            <RectangleNodeComponent
              key={node.id}
              node={node as DesignNode & { type: 'rectangle' }}
              isSelected={isSelected}
              onSelect={handleSelectNode}
            />
          );

        case 'layer':
        case 'ellipse':
        case 'component':
        case 'instance':
          // Not yet implemented - return null for now
          return null;
      }
    },
    [
      tree.nodes,
      selection.nodeIds,
      editingNodeId,
      handleSelectNode,
      handleNodeDoubleClick,
      handleDragStart,
      handleResizeStart,
    ]
  );

  // Add new frame at center
  const handleAddFrame = useCallback(() => {
    const frame = addFrame('Frame');
    dispatch({
      type: 'SET_TRANSFORM',
      nodeId: frame.id,
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    });
  }, [addFrame, dispatch]);

  // Add new text
  const handleAddText = useCallback(() => {
    const text = addText('Text');
    dispatch({
      type: 'SET_TRANSFORM',
      nodeId: text.id,
      x: 100,
      y: 100,
      width: 100,
      height: 24,
    });
  }, [addText, dispatch]);

  // Add new rectangle
  const handleAddRectangle = useCallback(() => {
    const rect = addRectangle('Rectangle');
    dispatch({
      type: 'SET_TRANSFORM',
      nodeId: rect.id,
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
  }, [addRectangle, dispatch]);

  const isEmpty = tree.rootIds.length === 0;

  return (
    <div style={styles.container}>
      {/* Layer Panel */}
      {showLayerPanel ? (
        <div style={styles.layerPanel}>
          <DesignLayerPanel
            tree={tree}
            selection={selection}
            onSelectNode={selectNode}
            onClearSelection={clearSelection}
            onToggleVisibility={(id) => {
              dispatch({ type: 'TOGGLE_VISIBILITY', nodeId: id });
            }}
            onToggleLock={(id) => {
              dispatch({ type: 'TOGGLE_LOCK', nodeId: id });
            }}
            onToggleExpand={(id) => {
              dispatch({ type: 'TOGGLE_EXPAND', nodeId: id });
            }}
            onRename={(id, name) => {
              updateNode(id, { name });
            }}
            onDelete={(ids) => {
              dispatch({ type: 'DELETE_NODES', nodeIds: ids });
            }}
            onDuplicate={(ids) => {
              dispatch({ type: 'DUPLICATE_NODES', nodeIds: ids });
            }}
            onMove={(id, parentId, index) => {
              dispatch({ type: 'MOVE_NODE', nodeId: id, newParentId: parentId, index });
            }}
            onGroup={(ids, name) => {
              dispatch({
                type: 'GROUP_NODES',
                nodeIds: ids,
                ...(name !== undefined && { groupName: name }),
              });
            }}
            onUngroup={(id) => {
              dispatch({ type: 'UNGROUP_NODE', nodeId: id });
            }}
            onBringToFront={(id) => {
              dispatch({ type: 'BRING_TO_FRONT', nodeId: id });
            }}
            onSendToBack={(id) => {
              dispatch({ type: 'SEND_TO_BACK', nodeId: id });
            }}
          />
        </div>
      ) : null}

      {/* Canvas Area */}
      <div style={styles.canvasContainer}>
        <div ref={canvasRef} style={styles.canvas} onClick={handleCanvasClick} data-canvas="true">
          {/* Viewport container (for pan/zoom) */}
          <div
            style={{
              ...styles.viewport,
              transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.zoom)})`,
            }}
          >
            {/* Render all root nodes */}
            {tree.rootIds.map(renderNode)}
          </div>

          {/* Empty state */}
          {isEmpty ? (
            <div style={styles.emptyState}>
              <FrameIcon />
              <div style={{ marginTop: 12 }}>No frames yet</div>
              <div style={styles.hint}>Click the toolbar below to add elements</div>
            </div>
          ) : null}
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <button
            style={{
              ...styles.toolbarButton,
              backgroundColor: hoveredTool === 'frame' ? 'var(--accent)' : 'transparent',
            }}
            onMouseEnter={() => {
              setHoveredTool('frame');
            }}
            onMouseLeave={() => {
              setHoveredTool(null);
            }}
            onClick={handleAddFrame}
            title="Add Frame (F)"
          >
            <FrameIcon />
          </button>
          <button
            style={{
              ...styles.toolbarButton,
              backgroundColor: hoveredTool === 'text' ? 'var(--accent)' : 'transparent',
            }}
            onMouseEnter={() => {
              setHoveredTool('text');
            }}
            onMouseLeave={() => {
              setHoveredTool(null);
            }}
            onClick={handleAddText}
            title="Add Text (T)"
          >
            <TextIcon />
          </button>
          <button
            style={{
              ...styles.toolbarButton,
              backgroundColor: hoveredTool === 'rect' ? 'var(--accent)' : 'transparent',
            }}
            onMouseEnter={() => {
              setHoveredTool('rect');
            }}
            onMouseLeave={() => {
              setHoveredTool(null);
            }}
            onClick={handleAddRectangle}
            title="Add Rectangle (R)"
          >
            <RectangleIcon />
          </button>
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span>
            {selectedNodes.length > 0 ? `${String(selectedNodes.length)} selected` : 'Ready'}
          </span>
          <span>
            {canUndo ? 'Cmd+Z to undo' : ''} {canRedo ? '• Cmd+Shift+Z to redo' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DesignCanvas;
