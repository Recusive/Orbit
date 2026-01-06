/**
 * WorkflowRightSidebar - Right sidebar for workflow mode with 4 tabs
 * Tabs: Card Properties | Connections | Info | Library
 *
 * Floating design with smooth slide animation matching left sidebar.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBackendSync } from '../../hooks/backend/useBackendSync';
import { fontSize, fontWeight, motion, radii } from '../../lib/design/designTokens';
import { WORKFLOW_SIDEBAR } from '../../lib/layout/workflowLayoutConstants';
import {
  useWorkflowStore,
  selectCards,
  selectConnections,
  selectActiveWorkflow,
} from '../../stores/workflowStore';
import {
  selectRightSidebarCollapsed,
  selectRightSidebarVisualWidth,
  selectRightSidebarWidth,
  useWorkflowUIStore,
} from '../../stores/workflowUIStore';

import { CardPropertiesPanel } from './CardPropertiesPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { SharedCardLibraryPanel } from './SharedCardLibraryPanel';
import { WorkflowInfoPanel } from './WorkflowInfoPanel';

import type { MarkdownCard, Workflow, WorkflowConnection } from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface WorkflowRightSidebarProps {
  selectedCardId: string | null;
  onSelectConnection?: (connectionId: string) => void;
}

type TabId = 'properties' | 'connections' | 'info' | 'library';

interface Tab {
  id: TabId;
  label: string;
}

// ============================================================================
// Constants
// ============================================================================

const TABS: Tab[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'connections', label: 'Connections' },
  { id: 'info', label: 'Info' },
  { id: 'library', label: 'Library' },
];

// ============================================================================
// Styles
// ============================================================================

// Floating sidebar constants (matching left sidebar)
const FLOATING_GAP = 8;
const FLOATING_RADIUS = 16; // Increased for modern feel
const TOOLBAR_CLEARANCE = 48; // Space for floating toolbar at top

// Animation settings - following animation best practices
// Reference: Timing table recommends 250-300ms for sidebar/drawer with smooth ease-out
const SIDEBAR_ANIMATION = {
  duration: 280, // ms - slightly longer for smooth panel feel
  // Smooth ease-out: very gentle deceleration, professional, no overshoot
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const styles = {
  // Inner container - floating card with modern shadow and subtle depth
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--card)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04)',
    // Subtle inner glow at top for depth
    backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px)',
  },
  resizeHandle: {
    position: 'absolute' as const,
    top: 0,
    left: -4,
    width: 8,
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: 'transparent',
    zIndex: 10,
    transition: `background-color ${motion.fast} ${motion.ease}`,
  },
  resizeHandleActive: {
    backgroundColor: 'var(--primary)',
  },
  widthIndicator: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    padding: '6px 10px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    borderRadius: radii.md,
    zIndex: 20,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px var(--selection)',
  },
};

// ============================================================================
// Component
// ============================================================================

export function WorkflowRightSidebar({
  selectedCardId,
  onSelectConnection,
}: WorkflowRightSidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('properties');

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sidebar UI state from store (persisted)
  const rightSidebarWidth = useWorkflowUIStore(selectRightSidebarWidth);
  const rightSidebarVisualWidth = useWorkflowUIStore(selectRightSidebarVisualWidth);
  const isCollapsed = useWorkflowUIStore(selectRightSidebarCollapsed);
  const setRightSidebarWidth = useWorkflowUIStore((state) => state.setRightSidebarWidth);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeDoubleClick = useCallback((): void => {
    setRightSidebarWidth(WORKFLOW_SIDEBAR.right.default);
  }, [setRightSidebarWidth]);

  // Resize effect - handles mouse move and mouse up
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (!parentRect) return;

      // For right sidebar: width = right edge of parent - mouse position
      const newWidth = parentRect.right - e.clientX;
      const clampedWidth = Math.max(
        WORKFLOW_SIDEBAR.right.min,
        Math.min(WORKFLOW_SIDEBAR.right.max, newWidth)
      );
      setRightSidebarWidth(clampedWidth);
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setRightSidebarWidth]);

  // Get data from store
  const cards = useWorkflowStore(selectCards);
  const connections = useWorkflowStore(selectConnections);
  const activeWorkflow = useWorkflowStore(selectActiveWorkflow);
  const updateCard = useWorkflowStore((state) => state.updateCard);
  const deleteCard = useWorkflowStore((state) => state.deleteCard);
  const updateConnection = useWorkflowStore((state) => state.updateConnection);
  const deleteConnection = useWorkflowStore((state) => state.deleteConnection);
  const updateWorkflow = useWorkflowStore((state) => state.updateWorkflow);

  // Get backend sync operations
  const {
    exportWorkflow,
    createSnapshot,
    restoreSnapshot,
    linkFile,
    unlinkFile,
    syncFile,
    resolveConflict,
    browseFile,
  } = useBackendSync();

  // Get selected card
  const selectedCard: MarkdownCard | null = useMemo(() => {
    if (selectedCardId === null) return null;
    return cards[selectedCardId] ?? null;
  }, [selectedCardId, cards]);

  // Convert cards and connections to arrays
  const cardsArray = useMemo(() => Object.values(cards), [cards]);
  const connectionsArray = useMemo(() => Object.values(connections), [connections]);

  // Card operations
  const handleUpdateCard = useCallback(
    (cardId: string, updates: Partial<MarkdownCard>): void => {
      updateCard(cardId, updates);
    },
    [updateCard]
  );

  const handleDeleteCard = useCallback(
    (cardId: string): void => {
      deleteCard(cardId);
    },
    [deleteCard]
  );

  // Connection operations
  const handleSelectConnection = useCallback(
    (connectionId: string): void => {
      onSelectConnection?.(connectionId);
    },
    [onSelectConnection]
  );

  const handleUpdateConnection = useCallback(
    (connectionId: string, updates: Partial<WorkflowConnection>): void => {
      updateConnection(connectionId, updates);
    },
    [updateConnection]
  );

  const handleDeleteConnection = useCallback(
    (connectionId: string): void => {
      deleteConnection(connectionId);
    },
    [deleteConnection]
  );

  // Workflow operations
  const handleUpdateWorkflow = useCallback(
    (updates: Partial<Workflow>): void => {
      updateWorkflow(updates);
    },
    [updateWorkflow]
  );

  const handleExport = useCallback(
    (format: 'json' | 'markdown'): void => {
      exportWorkflow(format);
    },
    [exportWorkflow]
  );

  const handleCreateSnapshot = useCallback(
    (name: string, description?: string): void => {
      createSnapshot(name, description);
    },
    [createSnapshot]
  );

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string): void => {
      restoreSnapshot(snapshotId);
    },
    [restoreSnapshot]
  );

  // Check for reduced motion preference (accessibility requirement)
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper - absolutely positioned, slides via transform (floating overlay)
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute' as const,
    top: TOOLBAR_CLEARANCE,
    right: FLOATING_GAP,
    bottom: FLOATING_GAP,
    width: rightSidebarVisualWidth,
    zIndex: 50,
    transform: isCollapsed
      ? `translateX(${String(rightSidebarVisualWidth + FLOATING_GAP + 10)}px)`
      : 'translateX(0)',
    willChange: 'transform',
    transition: `transform ${String(animationDuration)}ms ${SIDEBAR_ANIMATION.easing}`,
    pointerEvents: isCollapsed ? 'none' : 'auto',
  };

  // Container - fills wrapper completely with floating card styling
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  };

  return (
    <div style={wrapperStyle}>
      <div ref={containerRef} className="workflow-right-sidebar" style={containerStyle}>
        {/* Resize Handle */}
        <div
          style={{
            ...styles.resizeHandle,
            ...(isResizeHovered || isResizing ? styles.resizeHandleActive : {}),
          }}
          onMouseDown={handleResizeStart}
          onMouseEnter={(): void => {
            setIsResizeHovered(true);
          }}
          onMouseLeave={(): void => {
            setIsResizeHovered(false);
          }}
          onDoubleClick={handleResizeDoubleClick}
          title="Drag to resize (double-click to reset)"
        />
        {isResizing ? (
          <div style={styles.widthIndicator}>{Math.round(rightSidebarWidth)}px</div>
        ) : null}

        {/* Tab Navigation - Modern pill/segment style */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 12px 0 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '4px',
              backgroundColor: 'var(--muted)',
              borderRadius: '10px',
              gap: '2px',
            }}
          >
            {/* Tab Buttons */}
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                }}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  backgroundColor: activeTab === tab.id ? 'var(--card)' : 'transparent',
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: 12,
                  fontWeight: activeTab === tab.id ? 500 : 400,
                  color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  boxShadow:
                    activeTab === tab.id
                      ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)'
                      : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {activeTab === 'properties' && (
            <CardPropertiesPanel
              card={selectedCard}
              onUpdate={handleUpdateCard}
              onDelete={handleDeleteCard}
              onLinkFile={linkFile}
              onUnlinkFile={unlinkFile}
              onSyncFile={syncFile}
              onResolveConflict={resolveConflict}
              onBrowseFile={browseFile}
            />
          )}
          {activeTab === 'connections' && (
            <ConnectionsPanel
              card={selectedCard}
              cards={cardsArray}
              connections={connectionsArray}
              onSelectConnection={handleSelectConnection}
              onUpdateConnection={handleUpdateConnection}
              onDeleteConnection={handleDeleteConnection}
            />
          )}
          {activeTab === 'info' && (
            <WorkflowInfoPanel
              workflow={activeWorkflow}
              cardCount={cardsArray.length}
              connectionCount={connectionsArray.length}
              onUpdateWorkflow={handleUpdateWorkflow}
              onExport={handleExport}
              onCreateSnapshot={handleCreateSnapshot}
              onRestoreSnapshot={handleRestoreSnapshot}
            />
          )}
          {activeTab === 'library' && <SharedCardLibraryPanel />}
        </div>
      </div>
    </div>
  );
}
