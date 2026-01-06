/**
 * Workflow Sidebar
 *
 * Left sidebar for Workflow mode showing list of workflows
 * with search, create, and load functionality.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WORKFLOW_SIDEBAR } from '../../lib/workflowLayoutConstants';
import {
  selectWorkflowList,
  selectWorkflowListError,
  selectWorkflowListLoading,
  useWorkflowStore,
} from '../../stores/workflowStore';
import {
  selectLeftSidebarCollapsed,
  selectLeftSidebarVisualWidth,
  selectLeftSidebarWidth,
  useWorkflowUIStore,
} from '../../stores/workflowUIStore';

import { NewWorkflowDialog } from './NewWorkflowDialog';

import type { WorkflowMetadata } from '../../types/workflowTypes';

// ============================================================================
// Helper Functions
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)}m ago`;
  if (hours < 24) return `${String(hours)}h ago`;
  if (days < 7) return `${String(days)}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Icons
// ============================================================================

function PlusIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  );
}

function WorkflowIcon(): React.JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="3" y="3" width="6" height="6" rx="1"></rect>
      <rect x="15" y="3" width="6" height="6" rx="1"></rect>
      <rect x="9" y="15" width="6" height="6" rx="1"></rect>
      <line x1="9" y1="6" x2="15" y2="6"></line>
      <line x1="12" y1="9" x2="12" y2="15"></line>
    </svg>
  );
}

// ============================================================================
// Styles - Modern, soft UI design system
// ============================================================================

// Floating sidebar constants
const FLOATING_GAP = 8;
const FLOATING_RADIUS = 16; // Increased for modern feel
const TOOLBAR_CLEARANCE = 48; // Space for floating toolbar at top

// Animation settings - following animation best practices
const SIDEBAR_ANIMATION = {
  duration: 280,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const styles = {
  // Container - shadow-based depth, no border
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--card)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    overflow: 'hidden',
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 16px -4px rgba(0, 0, 0, 0.06)',
    // Subtle inner glow at top for depth (matches right sidebar)
    backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px)',
  },
  // Resize handle with subtle indicator on hover
  resizeHandle: {
    position: 'absolute' as const,
    top: 0,
    right: -4,
    width: 8,
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: 'transparent',
    zIndex: 10,
    transition: `all 150ms ${EASE_OUT}`,
  },
  resizeHandleActive: {
    backgroundColor: 'var(--primary)',
    opacity: 0.6,
  },
  widthIndicator: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    padding: '6px 10px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 8,
    zIndex: 20,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  // Header - no background, blends with card
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 52,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--foreground)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  // Icon button - ghost style
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  iconButtonHover: {
    backgroundColor: 'var(--muted)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  iconButtonActive: {
    transform: 'scale(0.95)',
  },
  // Search section - no border
  searchContainer: {
    padding: '12px 16px',
  },
  searchWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute' as const,
    left: 12,
    color: 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)',
    pointerEvents: 'none' as const,
    transition: `color 200ms ${EASE_OUT}`,
  },
  searchInput: {
    width: '100%',
    height: 36,
    padding: '0 12px 0 36px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid color-mix(in oklch, var(--border) 40%, transparent)',
    borderRadius: 8,
    outline: 'none',
    transition: `all 200ms ${EASE_OUT}`,
    boxSizing: 'border-box' as const,
    boxShadow: 'none',
  },
  searchInputFocus: {
    border: '1px solid color-mix(in oklch, var(--primary) 50%, transparent)',
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
  },
  // Section label - subtle, sentence case
  sectionHeader: {
    padding: '12px 16px 6px',
    fontSize: 10,
    fontWeight: 600,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    letterSpacing: '0.08em',
  },
  // Workflow list
  workflowList: {
    flex: 1,
    overflow: 'auto',
    padding: '0 8px',
  },
  // Workflow item - surface-interactive pattern
  workflowItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
    marginBottom: 4,
  },
  workflowItemHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.02)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },
  workflowItemActive: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  },
  workflowItemContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  workflowNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    flexShrink: 0,
  },
  workflowName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  workflowMeta: {
    fontSize: 11,
    color: 'color-mix(in oklch, var(--muted-foreground) 80%, transparent)',
  },
  // Delete button
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    opacity: 0,
    transition: `all 200ms ${EASE_OUT}`,
    flexShrink: 0,
  },
  deleteButtonVisible: {
    opacity: 1,
  },
  deleteButtonHover: {
    color: 'var(--destructive)',
    backgroundColor: 'color-mix(in oklch, var(--destructive) 10%, transparent)',
  },
  confirmDeleteRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  confirmText: {
    fontSize: 11,
    color: 'var(--destructive)',
    fontWeight: 500,
  },
  confirmButton: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  confirmYes: {
    backgroundColor: 'var(--destructive)',
    color: 'white',
  },
  confirmNo: {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
  },
  // Empty state - spacious, welcoming
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center' as const,
    gap: 12,
    flex: 1,
  },
  emptyStateIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
  },
  emptyStateTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground)',
  },
  emptyStateText: {
    fontSize: 11,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    lineHeight: 1.5,
  },
  emptyStateButton: {
    marginTop: 8,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--primary)',
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  emptyStateButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)',
    transform: 'scale(1.02)',
  },
  // Loading state
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    color: 'var(--muted-foreground)',
    fontSize: 12,
    flex: 1,
  },
  // Error state
  errorState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center' as const,
    gap: 12,
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    color: 'var(--destructive)',
  },
  retryButton: {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--primary)',
    backgroundColor: 'transparent',
    border: '1px solid color-mix(in oklch, var(--primary) 50%, transparent)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
};

// ============================================================================
// Props
// ============================================================================

export interface WorkflowSidebarProps {
  activeWorkflowId: string | null;
  onWorkflowSelect: (workflowId: string) => void;
  onWorkflowCreate: (name: string) => void;
  onWorkflowDelete: (workflowId: string) => void;
  onRefresh?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowSidebar({
  activeWorkflowId,
  onWorkflowSelect,
  onWorkflowCreate,
  onWorkflowDelete,
  onRefresh,
}: WorkflowSidebarProps): React.JSX.Element | null {
  const workflowList = useWorkflowStore(selectWorkflowList);
  const isLoading = useWorkflowStore(selectWorkflowListLoading);
  const error = useWorkflowStore(selectWorkflowListError);

  // Sidebar UI state from store (persisted)
  const leftSidebarWidth = useWorkflowUIStore(selectLeftSidebarWidth);
  const leftSidebarVisualWidth = useWorkflowUIStore(selectLeftSidebarVisualWidth);
  const isCollapsed = useWorkflowUIStore(selectLeftSidebarCollapsed);
  const setLeftSidebarWidth = useWorkflowUIStore((state) => state.setLeftSidebarWidth);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hoveredWorkflowId, setHoveredWorkflowId] = useState<string | null>(null);
  const [hoveredNewButton, setHoveredNewButton] = useState(false);
  const [hoveredDeleteId, setHoveredDeleteId] = useState<string | null>(null);
  const [hoveredEmptyButton, setHoveredEmptyButton] = useState(false);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter and sort workflows
  const filteredWorkflows = useMemo((): WorkflowMetadata[] => {
    const query = searchQuery.toLowerCase().trim();
    let result = workflowList;

    if (query !== '') {
      result = workflowList.filter(
        (workflow) =>
          workflow.name.toLowerCase().includes(query) ||
          workflow.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort by updatedAt (most recent first)
    return [...result].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [workflowList, searchQuery]);

  // Handle search change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  }, []);

  // Handle new workflow
  const handleNewClick = useCallback((): void => {
    setShowNewDialog(true);
  }, []);

  const handleNewConfirm = useCallback(
    (name: string): void => {
      onWorkflowCreate(name);
      setShowNewDialog(false);
    },
    [onWorkflowCreate]
  );

  const handleNewCancel = useCallback((): void => {
    setShowNewDialog(false);
  }, []);

  // Handle workflow selection
  const handleWorkflowClick = useCallback(
    (workflowId: string): void => {
      if (confirmDeleteId === workflowId) {
        return; // Don't select if confirming delete
      }
      onWorkflowSelect(workflowId);
    },
    [confirmDeleteId, onWorkflowSelect]
  );

  // Handle delete
  const handleDeleteClick = useCallback((e: React.MouseEvent, workflowId: string): void => {
    e.stopPropagation();
    setConfirmDeleteId(workflowId);
  }, []);

  const handleConfirmDelete = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (confirmDeleteId !== null) {
        onWorkflowDelete(confirmDeleteId);
        setConfirmDeleteId(null);
      }
    },
    [confirmDeleteId, onWorkflowDelete]
  );

  const handleCancelDelete = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeDoubleClick = useCallback((): void => {
    setLeftSidebarWidth(WORKFLOW_SIDEBAR.left.default);
  }, [setLeftSidebarWidth]);

  // Resize effect - handles mouse move and mouse up
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (!parentRect) return;

      // For left sidebar: width = mouse position - left edge of parent
      const newWidth = e.clientX - parentRect.left;
      const clampedWidth = Math.max(
        WORKFLOW_SIDEBAR.left.min,
        Math.min(WORKFLOW_SIDEBAR.left.max, newWidth)
      );
      setLeftSidebarWidth(clampedWidth);
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
  }, [isResizing, setLeftSidebarWidth]);

  // Clear confirm delete when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (): void => {
      setConfirmDeleteId(null);
    };
    if (confirmDeleteId !== null) {
      window.addEventListener('click', handleClickOutside);
      return (): void => {
        window.removeEventListener('click', handleClickOutside);
      };
    }
    return undefined;
  }, [confirmDeleteId]);

  // Timeout for loading state - if backend doesn't respond, clear loading after 3s
  useEffect(() => {
    if (isLoading) {
      const timeoutId = setTimeout(() => {
        // If still loading after 3 seconds, clear loading state
        // This allows users to create workflows even if backend isn't responding
        useWorkflowStore.getState().setWorkflowListLoading(false);
      }, 3000);
      return (): void => {
        clearTimeout(timeoutId);
      };
    }
    return undefined;
  }, [isLoading]);

  // Check for reduced motion preference (accessibility requirement)
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper - absolutely positioned, slides via transform (floating overlay)
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute' as const,
    top: TOOLBAR_CLEARANCE,
    left: FLOATING_GAP,
    bottom: FLOATING_GAP,
    width: leftSidebarVisualWidth,
    zIndex: 50,
    transform: isCollapsed
      ? `translateX(-${String(leftSidebarVisualWidth + FLOATING_GAP + 10)}px)`
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

  // Render loading state (still allow creating new workflows)
  if (isLoading) {
    return (
      <div style={wrapperStyle}>
        <div ref={containerRef} style={containerStyle}>
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
            <div style={styles.widthIndicator}>{Math.round(leftSidebarWidth)}px</div>
          ) : null}

          {/* Header */}
          <div style={styles.header}>
            <span style={styles.headerTitle}>Workflows</span>
            <div style={styles.headerActions}>
              <button
                style={{
                  ...styles.iconButton,
                  ...(hoveredNewButton ? styles.iconButtonHover : {}),
                }}
                onClick={handleNewClick}
                onMouseEnter={(): void => {
                  setHoveredNewButton(true);
                }}
                onMouseLeave={(): void => {
                  setHoveredNewButton(false);
                }}
                title="Create new workflow"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={styles.searchContainer}>
            <div style={styles.searchWrapper}>
              <span style={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                style={styles.searchInput}
                type="text"
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={handleSearchChange}
                disabled
              />
            </div>
          </div>

          {/* Section Header */}
          <div style={styles.sectionHeader}>Recent</div>

          {/* Loading indicator */}
          <div style={styles.loadingState}>Loading workflows...</div>

          {/* New Workflow Dialog */}
          {showNewDialog ? (
            <NewWorkflowDialog onConfirm={handleNewConfirm} onCancel={handleNewCancel} />
          ) : null}
        </div>
      </div>
    );
  }

  // Render error state (still allow creating new workflows)
  if (error !== null) {
    return (
      <div style={wrapperStyle}>
        <div ref={containerRef} style={containerStyle}>
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
            <div style={styles.widthIndicator}>{Math.round(leftSidebarWidth)}px</div>
          ) : null}

          {/* Header */}
          <div style={styles.header}>
            <span style={styles.headerTitle}>Workflows</span>
            <div style={styles.headerActions}>
              <button
                style={{
                  ...styles.iconButton,
                  ...(hoveredNewButton ? styles.iconButtonHover : {}),
                }}
                onClick={handleNewClick}
                onMouseEnter={(): void => {
                  setHoveredNewButton(true);
                }}
                onMouseLeave={(): void => {
                  setHoveredNewButton(false);
                }}
                title="Create new workflow"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
          <div style={styles.errorState}>
            <span style={styles.errorText}>{error}</span>
            {onRefresh !== undefined && (
              <button style={styles.retryButton} onClick={onRefresh}>
                Retry
              </button>
            )}
          </div>

          {/* New Workflow Dialog */}
          {showNewDialog ? (
            <NewWorkflowDialog onConfirm={handleNewConfirm} onCancel={handleNewCancel} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div ref={containerRef} style={containerStyle}>
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
          <div style={styles.widthIndicator}>{Math.round(leftSidebarWidth)}px</div>
        ) : null}

        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>Workflows</span>
          <div style={styles.headerActions}>
            <button
              style={{
                ...styles.iconButton,
                ...(hoveredNewButton ? styles.iconButtonHover : {}),
              }}
              onClick={handleNewClick}
              onMouseEnter={(): void => {
                setHoveredNewButton(true);
              }}
              onMouseLeave={(): void => {
                setHoveredNewButton(false);
              }}
              title="Create new workflow"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={styles.searchContainer}>
          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              style={{
                ...styles.searchInput,
                ...(searchFocused ? styles.searchInputFocus : {}),
              }}
              type="text"
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={(): void => {
                setSearchFocused(true);
              }}
              onBlur={(): void => {
                setSearchFocused(false);
              }}
            />
          </div>
        </div>

        {/* Section Header */}
        <div style={styles.sectionHeader}>Recent</div>

        {/* Workflow List */}
        <div style={styles.workflowList}>
          {filteredWorkflows.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>
                <WorkflowIcon />
              </div>
              {searchQuery !== '' ? (
                <>
                  <span style={styles.emptyStateTitle}>No results</span>
                  <span style={styles.emptyStateText}>
                    No workflows match &quot;{searchQuery}&quot;
                  </span>
                </>
              ) : (
                <>
                  <span style={styles.emptyStateTitle}>No workflows yet</span>
                  <span style={styles.emptyStateText}>
                    Create your first workflow to get started
                  </span>
                  <button
                    style={{
                      ...styles.emptyStateButton,
                      ...(hoveredEmptyButton ? styles.emptyStateButtonHover : {}),
                    }}
                    onClick={handleNewClick}
                    onMouseEnter={(): void => {
                      setHoveredEmptyButton(true);
                    }}
                    onMouseLeave={(): void => {
                      setHoveredEmptyButton(false);
                    }}
                  >
                    Create workflow
                  </button>
                </>
              )}
            </div>
          ) : (
            filteredWorkflows.map((workflow) => {
              const isActive = workflow.id === activeWorkflowId;
              const isHovered = workflow.id === hoveredWorkflowId;
              const isConfirmingDelete = workflow.id === confirmDeleteId;

              return (
                <div
                  key={workflow.id}
                  style={{
                    ...styles.workflowItem,
                    ...(isActive ? styles.workflowItemActive : {}),
                    ...(isHovered && !isActive ? styles.workflowItemHover : {}),
                  }}
                  onClick={(): void => {
                    handleWorkflowClick(workflow.id);
                  }}
                  onMouseEnter={(): void => {
                    setHoveredWorkflowId(workflow.id);
                  }}
                  onMouseLeave={(): void => {
                    setHoveredWorkflowId(null);
                    setHoveredDeleteId(null);
                  }}
                >
                  <div style={styles.workflowItemContent}>
                    <div style={styles.workflowNameRow}>
                      {isActive ? <div style={styles.activeDot} /> : null}
                      <span style={styles.workflowName}>{workflow.name}</span>
                    </div>
                    <span style={styles.workflowMeta}>
                      {workflow.cardCount} card{workflow.cardCount !== 1 ? 's' : ''} ·{' '}
                      {formatRelativeTime(workflow.updatedAt)}
                    </span>
                  </div>

                  {/* Delete button or confirm */}
                  {isConfirmingDelete ? (
                    <div
                      style={styles.confirmDeleteRow}
                      onClick={(e): void => {
                        e.stopPropagation();
                      }}
                    >
                      <span style={styles.confirmText}>Delete?</span>
                      <button
                        style={{ ...styles.confirmButton, ...styles.confirmYes }}
                        onClick={handleConfirmDelete}
                      >
                        Yes
                      </button>
                      <button
                        style={{ ...styles.confirmButton, ...styles.confirmNo }}
                        onClick={handleCancelDelete}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      style={{
                        ...styles.deleteButton,
                        ...(isHovered ? styles.deleteButtonVisible : {}),
                        ...(hoveredDeleteId === workflow.id ? styles.deleteButtonHover : {}),
                      }}
                      onClick={(e): void => {
                        handleDeleteClick(e, workflow.id);
                      }}
                      onMouseEnter={(): void => {
                        setHoveredDeleteId(workflow.id);
                      }}
                      onMouseLeave={(): void => {
                        setHoveredDeleteId(null);
                      }}
                      title="Delete workflow"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* New Workflow Dialog */}
        {showNewDialog ? (
          <NewWorkflowDialog onConfirm={handleNewConfirm} onCancel={handleNewCancel} />
        ) : null}
      </div>
    </div>
  );
}
