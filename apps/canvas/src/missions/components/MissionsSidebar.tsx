/**
 * MissionsSidebar
 * Left sidebar for missions mode - shows mission list and creation controls
 * Floating overlay style matching WorkflowSidebar pattern
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useMissionsStore, useMissionsUIStore } from '../stores';

// ============================================================================
// Constants
// ============================================================================

const FLOATING_GAP = 8;
const FLOATING_RADIUS = 16;
const TOOLBAR_CLEARANCE = 48;

const SIDEBAR_ANIMATION = {
  duration: 280,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;

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
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RocketIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--card)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    overflow: 'hidden',
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 16px -4px rgba(0, 0, 0, 0.06)',
    backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px)',
  },
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 52,
    flexShrink: 0,
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--foreground)',
  },
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
  sectionHeader: {
    padding: '12px 16px 6px',
    fontSize: 10,
    fontWeight: 600,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  activeSection: {
    padding: '12px 16px',
    margin: '0 8px',
    borderRadius: 8,
    backgroundColor: 'color-mix(in oklch, var(--primary) 8%, transparent)',
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--primary)',
    marginBottom: 4,
  },
  activeName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--foreground)',
    marginBottom: 4,
  },
  activeStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--muted-foreground)',
  },
  missionList: {
    flex: 1,
    overflow: 'auto',
    padding: '0 8px',
  },
  missionItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
    marginBottom: 4,
  },
  missionItemHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.02)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },
  missionItemActive: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  },
  missionName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  missionCount: {
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: 'var(--background)',
    fontSize: 11,
    color: 'var(--muted-foreground)',
  },
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
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    color: 'var(--muted-foreground)',
    fontSize: 12,
    flex: 1,
  },
};

// ============================================================================
// Component
// ============================================================================

export function MissionsSidebar(): React.JSX.Element | null {
  // Store state
  const activeMission = useMissionsStore((s) => s.activeMission);
  const missionList = useMissionsStore((s) => s.missionList);
  const missionListLoading = useMissionsStore((s) => s.missionListLoading);
  const createNewMission = useMissionsStore((s) => s.createNewMission);

  // UI store state
  const leftSidebarWidth = useMissionsUIStore((s) => s.leftSidebarWidth);
  const isCollapsed = useMissionsUIStore((s) => s.leftSidebarCollapsed);
  const setLeftSidebarWidth = useMissionsUIStore((s) => s.setLeftSidebarWidth);

  // Local state
  const [hoveredNewButton, setHoveredNewButton] = useState(false);
  const [hoveredMissionId, setHoveredMissionId] = useState<string | null>(null);
  const [hoveredEmptyButton, setHoveredEmptyButton] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handlers
  const handleNewMission = useCallback(() => {
    createNewMission(`Mission ${String(Date.now())}`, 'user');
  }, [createNewMission]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeDoubleClick = useCallback((): void => {
    setLeftSidebarWidth(260); // Default width
  }, [setLeftSidebarWidth]);

  // Resize effect
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (containerRef.current === null) return;
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (parentRect === undefined) return;

      const newWidth = e.clientX - parentRect.left;
      const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth));
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

  // Animation settings
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper style - floating overlay
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: TOOLBAR_CLEARANCE,
    left: FLOATING_GAP,
    bottom: FLOATING_GAP,
    width: leftSidebarWidth,
    zIndex: 50,
    transform: isCollapsed
      ? `translateX(-${String(leftSidebarWidth + FLOATING_GAP + 10)}px)`
      : 'translateX(0)',
    willChange: 'transform',
    transition: `transform ${String(animationDuration)}ms ${SIDEBAR_ANIMATION.easing}`,
    pointerEvents: isCollapsed ? 'none' : 'auto',
  };

  // Container style
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    position: 'relative',
    width: '100%',
    height: '100%',
  };

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
          <div style={styles.headerTitle}>
            <RocketIcon />
            <span>Missions</span>
          </div>
          <button
            style={{
              ...styles.iconButton,
              ...(hoveredNewButton ? styles.iconButtonHover : {}),
            }}
            onClick={handleNewMission}
            onMouseEnter={(): void => {
              setHoveredNewButton(true);
            }}
            onMouseLeave={(): void => {
              setHoveredNewButton(false);
            }}
            title="Create new mission"
          >
            <PlusIcon />
          </button>
        </div>

        {/* Active Mission */}
        {activeMission !== null && (
          <div style={styles.activeSection}>
            <div style={styles.activeLabel}>Active Mission</div>
            <div style={styles.activeName}>{activeMission.name}</div>
            <div style={styles.activeStats}>
              <span>{activeMission.agentIds.length} agents</span>
              <span>&bull;</span>
              <span>{activeMission.connectionIds.length} connections</span>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div style={styles.sectionHeader}>All Missions</div>

        {/* Mission List */}
        <div style={styles.missionList}>
          {missionListLoading ? (
            <div style={styles.loadingState}>Loading missions...</div>
          ) : missionList.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>
                <RocketIcon />
              </div>
              <span style={styles.emptyStateTitle}>No missions yet</span>
              <span style={styles.emptyStateText}>
                Create your first mission to orchestrate AI agents
              </span>
              <button
                style={{
                  ...styles.emptyStateButton,
                  ...(hoveredEmptyButton ? styles.emptyStateButtonHover : {}),
                }}
                onClick={handleNewMission}
                onMouseEnter={(): void => {
                  setHoveredEmptyButton(true);
                }}
                onMouseLeave={(): void => {
                  setHoveredEmptyButton(false);
                }}
              >
                Create mission
              </button>
            </div>
          ) : (
            missionList.map((mission) => {
              const isActive = mission.id === activeMission?.id;
              const isHovered = mission.id === hoveredMissionId;
              // Non-active missions are disabled until storage-based loading is implemented
              const isClickable = isActive;

              return (
                <div
                  key={mission.id}
                  role="button"
                  aria-disabled={!isClickable}
                  tabIndex={isClickable ? 0 : -1}
                  style={{
                    ...styles.missionItem,
                    ...(isActive ? styles.missionItemActive : {}),
                    ...(isHovered && isClickable ? styles.missionItemHover : {}),
                    ...(!isClickable ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                  }}
                  onMouseEnter={(): void => {
                    setHoveredMissionId(mission.id);
                  }}
                  onMouseLeave={(): void => {
                    setHoveredMissionId(null);
                  }}
                  title={isClickable ? mission.name : 'Mission loading not available yet'}
                >
                  <span style={styles.missionName}>{mission.name}</span>
                  <span style={styles.missionCount}>{mission.agentCount}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
