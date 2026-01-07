/**
 * Design Left Sidebar
 *
 * Left sidebar for the new unified design system.
 * Contains the Design Layer Panel and Component Library in a tabbed interface.
 * Uses floating design pattern matching workflow sidebars.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { fontSize, fontWeight, radii, spacing } from '../../lib/design/designTokens';
import { WORKFLOW_SIDEBAR } from '../../lib/layout/workflowLayoutConstants';
import {
  selectLeftSidebarCollapsed,
  selectLeftSidebarVisualWidth,
  selectLeftSidebarWidth,
  useWorkflowUIStore,
} from '../../stores/workflowUIStore';
import { ComponentLibraryPanel } from '../panels/ComponentLibraryPanel';

import { DesignLayerPanel } from './DesignLayerPanel';

import type { ComponentTemplate } from '../../lib/components/componentLibrary';
import type { DesignTree, DesignSelection } from '../../types/designNodeTypes';

type SidebarTab = 'layers' | 'libraries';

export interface DesignLeftSidebarProps {
  // Design tree props
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

  // Component library props
  onAddComponent: (component: ComponentTemplate) => void;
  onDragComponentStart?: (component: ComponentTemplate, event: React.DragEvent) => void;
}

// =============================================================================
// ICONS
// =============================================================================

const LayersIcon = (): React.JSX.Element => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>
);

const ComponentsIcon = (): React.JSX.Element => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
  </svg>
);

// Tab configuration
const tabs: {
  id: SidebarTab;
  label: string;
  icon: React.ReactNode;
  color: string;
  shortcut: string;
}[] = [
  {
    id: 'layers',
    label: 'Layers',
    icon: <LayersIcon />,
    color: 'var(--brand-heather)',
    shortcut: '⌥1',
  },
  {
    id: 'libraries',
    label: 'Libraries',
    icon: <ComponentsIcon />,
    color: 'var(--info)',
    shortcut: '⌥2',
  },
];

// =============================================================================
// FLOATING SIDEBAR CONSTANTS
// =============================================================================

const FLOATING_GAP = 8;
const FLOATING_RADIUS = 14; // Increased for modern feel
const TOOLBAR_CLEARANCE = 48; // Space for floating toolbar at top

// Animation settings - following animation best practices
const SIDEBAR_ANIMATION = {
  duration: 280, // ms - slightly longer for smooth panel feel
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  // Inner container - floating card with rounded corners and shadow
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'color-mix(in oklch, var(--card) 95%, transparent)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    overflow: 'hidden',
    boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 2px 6px -2px rgba(0, 0, 0, 0.08)',
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
    transition: `background-color 150ms ${EASE_OUT}`,
  },
  resizeHandleHover: {
    backgroundColor: 'color-mix(in oklch, var(--border) 30%, transparent)',
  },
  resizeHandleActive: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 20%, transparent)',
  },
  widthIndicator: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    padding: '6px 10px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    borderRadius: radii.md,
    zIndex: 20,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'color-mix(in oklch, var(--muted) 20%, transparent)',
    padding: '10px 12px',
    height: 48,
    flexShrink: 0,
  },
  tabsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    padding: 3,
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    borderRadius: 10,
    border: 'none',
    flex: 1,
    position: 'relative' as const,
    height: 34,
  },
  tabSlider: {
    position: 'absolute' as const,
    top: 3,
    bottom: 3,
    left: 3,
    width: 'calc(50% - 3px)',
    backgroundColor: 'var(--card)',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
    transition: `transform 200ms ${EASE_OUT}`,
    pointerEvents: 'none' as const,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center' as const,
    gap: 6,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'var(--muted-foreground)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `color 150ms ${EASE_OUT}`,
    flex: 1,
    whiteSpace: 'nowrap' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
  tabActive: {
    color: 'var(--foreground)',
  },
  tabHover: {
    color: 'color-mix(in oklch, var(--foreground) 80%, transparent)',
  },
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 15,
    height: 15,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DesignLeftSidebar({
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
  onAddComponent,
  onDragComponentStart,
}: DesignLeftSidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SidebarTab>('layers');
  const [hoveredTab, setHoveredTab] = useState<SidebarTab | null>(null);

  // Sidebar UI state from store (persisted)
  const leftSidebarWidth = useWorkflowUIStore(selectLeftSidebarWidth);
  const leftSidebarVisualWidth = useWorkflowUIStore(selectLeftSidebarVisualWidth);
  const isCollapsed = useWorkflowUIStore(selectLeftSidebarCollapsed);
  const setLeftSidebarWidth = useWorkflowUIStore((state) => state.setLeftSidebarWidth);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Check for reduced motion preference (accessibility)
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper - absolutely positioned, slides via transform
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

  // Get tab style based on state
  const getTabStyle = (
    _tab: (typeof tabs)[0],
    isActive: boolean,
    isHovered: boolean
  ): React.CSSProperties => {
    if (isActive) {
      return {
        ...styles.tab,
        ...styles.tabActive,
      };
    }

    if (isHovered) {
      return {
        ...styles.tab,
        ...styles.tabHover,
      };
    }

    return styles.tab;
  };

  return (
    <div style={wrapperStyle}>
      <div ref={containerRef} style={containerStyle}>
        {/* Resize Handle */}
        <div
          style={{
            ...styles.resizeHandle,
            ...(isResizeHovered && !isResizing ? styles.resizeHandleHover : {}),
            ...(isResizing ? styles.resizeHandleActive : {}),
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

        {/* Tab Bar */}
        <div style={styles.tabBar}>
          <div style={styles.tabsContainer}>
            {/* Sliding indicator */}
            <div
              style={{
                ...styles.tabSlider,
                transform: `translateX(${activeTab === 'layers' ? '0%' : '100%'})`,
              }}
            />
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const isHovered = hoveredTab === tab.id;

              const tabStyle = getTabStyle(tab, isActive, isHovered);

              return (
                <button
                  key={tab.id}
                  style={tabStyle}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                  onMouseEnter={() => {
                    setHoveredTab(tab.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredTab(null);
                  }}
                  title={`${tab.label} (${tab.shortcut})`}
                >
                  <span
                    style={{
                      ...styles.tabIcon,
                      color: isActive ? tab.color : 'inherit',
                    }}
                  >
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {activeTab === 'layers' ? (
            <DesignLayerPanel
              tree={tree}
              selection={selection}
              onSelectNode={onSelectNode}
              onClearSelection={onClearSelection}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onToggleExpand={onToggleExpand}
              onRename={onRename}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onMove={onMove}
              onGroup={onGroup}
              onUngroup={onUngroup}
              onBringToFront={onBringToFront}
              onSendToBack={onSendToBack}
              {...(onAddFrame !== undefined && { onAddFrame })}
            />
          ) : (
            <ComponentLibraryPanel
              onSelectComponent={onAddComponent}
              {...(onDragComponentStart !== undefined && { onDragStart: onDragComponentStart })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DesignLeftSidebar;
