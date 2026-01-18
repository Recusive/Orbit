/**
 * Right Sidebar
 *
 * Right sidebar for code/design modes with Properties, Code, and Preview tabs.
 * Uses floating design pattern matching workflow sidebars.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import { WORKFLOW_SIDEBAR } from '../../lib/layout/workflowLayoutConstants';
import {
  selectRightSidebarCollapsed,
  selectRightSidebarVisualWidth,
  selectRightSidebarWidth,
  useWorkflowUIStore,
} from '../../stores/workflowUIStore';
import { CodeOutputPanel } from '../panels/CodeOutputPanel';
import { PreviewPanel } from '../panels/PreviewPanel';
import { NodePropertiesPanel } from '../properties/NodePropertiesPanel';
import { PagePropertiesPanel } from '../properties/PagePropertiesPanel';

import type { SandpackNodeData } from '../../sandpack/SandpackNode';
import type { PageNodeData } from '../../types/pageTypes';
import type { Node, Edge } from '@xyflow/react';

type TabId = 'properties' | 'code' | 'preview';

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface RightSidebarProps {
  selectedNode: Node | null;
  nodes: Node[];
  edges: Edge[];
  onUpdateNode: (nodeId: string, updates: Partial<Node['data']>) => void;
  onSelectNode?: (nodeId: string) => void;
}

// =============================================================================
// ICONS (15px for tabs)
// =============================================================================

const PropertiesIcon = (): React.JSX.Element => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const CodeIcon = (): React.JSX.Element => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const PreviewIcon = (): React.JSX.Element => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

// Tab configuration with icons and colors
const tabs: { id: TabId; label: string; icon: React.ReactNode; color: string; shortcut: string }[] =
  [
    {
      id: 'properties',
      label: 'Properties',
      icon: <PropertiesIcon />,
      color: 'var(--info)',
      shortcut: '⌘1',
    },
    { id: 'code', label: 'Code', icon: <CodeIcon />, color: 'var(--warning)', shortcut: '⌘2' },
    {
      id: 'preview',
      label: 'Preview',
      icon: <PreviewIcon />,
      color: 'var(--primary)',
      shortcut: '⌘3',
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
    left: -4,
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
    left: 8,
    padding: '6px 10px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    zIndex: 20,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
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
    height: 36,
  },
  tabSlider: {
    position: 'absolute' as const,
    top: 3,
    bottom: 3,
    backgroundColor: 'var(--card)',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'none' as const,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center' as const,
    gap: 6,
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    fontSize: 12,
    fontWeight: 500,
    transition: `color 150ms ${EASE_OUT}`,
    whiteSpace: 'nowrap' as const,
    flex: 1,
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
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RightSidebar({
  selectedNode,
  nodes,
  edges,
  onUpdateNode,
  onSelectNode,
}: RightSidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('properties');
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null);

  // Sidebar UI state from store (persisted)
  const rightSidebarWidth = useWorkflowUIStore(selectRightSidebarWidth);
  const rightSidebarVisualWidth = useWorkflowUIStore(selectRightSidebarVisualWidth);
  const isCollapsed = useWorkflowUIStore(selectRightSidebarCollapsed);
  const setRightSidebarWidth = useWorkflowUIStore((state) => state.setRightSidebarWidth);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tab slider refs and state
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());
  const [sliderPos, setSliderPos] = useState({ left: 0, width: 0 });

  // Update slider position based on actual button measurements
  const updateSliderPosition = useCallback(() => {
    const container = tabsContainerRef.current;
    const activeButton = tabButtonRefs.current.get(activeTab);
    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setSliderPos({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [activeTab]);

  // Update slider on tab change, resize, and initial mount
  useEffect(() => {
    updateSliderPosition();
  }, [updateSliderPosition, rightSidebarWidth]);

  // Use ResizeObserver for container size changes
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateSliderPosition();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [updateSliderPosition]);

  // Detect if selected node is a SandpackNode and extract its code
  const selectedSandpackNode = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'sandpack') {
      return null;
    }
    const data = selectedNode.data as SandpackNodeData;
    return {
      code: data.code,
      viewport: data.viewport,
      label: data.label,
    };
  }, [selectedNode]);

  // Detect if selected node is a PageNode
  const selectedPageNode = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'page') {
      return null;
    }
    return {
      id: selectedNode.id,
      data: selectedNode.data as PageNodeData,
    };
  }, [selectedNode]);

  // Handler for updating page properties
  const handleUpdatePage = useCallback(
    (updates: Partial<PageNodeData>) => {
      if (selectedPageNode) {
        onUpdateNode(selectedPageNode.id, updates);
      }
    },
    [selectedPageNode, onUpdateNode]
  );

  // Visual editing callbacks
  const handlePositionChange = useCallback((): void => {
    // Position changed
  }, []);

  const handleSizeChange = useCallback((): void => {
    // Size changed
  }, []);

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

  // Check for reduced motion preference (accessibility)
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper - absolutely positioned, slides via transform
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
          <div style={styles.widthIndicator}>{Math.round(rightSidebarWidth)}px</div>
        ) : null}

        {/* Tab Bar */}
        <div style={styles.tabBar}>
          <div ref={tabsContainerRef} style={styles.tabsContainer}>
            {/* Animated slider - positioned based on measured button positions */}
            <div
              style={{
                ...styles.tabSlider,
                left: sliderPos.left,
                width: sliderPos.width,
                transition: isResizing ? 'none' : `left 200ms ${EASE_OUT}, width 200ms ${EASE_OUT}`,
              }}
            />
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const isHovered = hoveredTab === tab.id;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabButtonRefs.current.set(tab.id, el);
                  }}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                  onMouseEnter={() => {
                    setHoveredTab(tab.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredTab(null);
                  }}
                  style={getTabStyle(tab, isActive, isHovered)}
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

        {/* Tab Content */}
        <div style={styles.content}>
          {activeTab === 'properties' &&
            (selectedPageNode ? (
              <PagePropertiesPanel
                pageData={selectedPageNode.data}
                onUpdatePage={handleUpdatePage}
              />
            ) : (
              <NodePropertiesPanel selectedNode={selectedNode} onUpdateNode={onUpdateNode} />
            ))}

          {activeTab === 'code' && (
            <CodeOutputPanel
              nodes={nodes}
              edges={edges}
              isVisible={true}
              onToggleVisibility={() => {
                /* embedded mode - no toggle */
              }}
              embedded={true}
              {...(selectedSandpackNode?.code !== undefined && {
                selectedNodeCode: selectedSandpackNode.code,
              })}
              {...(selectedSandpackNode?.label !== undefined && {
                selectedNodeLabel: selectedSandpackNode.label,
              })}
            />
          )}

          {activeTab === 'preview' && (
            <PreviewPanel
              nodes={nodes}
              edges={edges}
              isVisible={true}
              onToggleVisibility={() => {
                /* embedded mode - no toggle */
              }}
              embedded={true}
              {...(selectedSandpackNode?.code !== undefined && {
                selectedNodeCode: selectedSandpackNode.code,
              })}
              {...(selectedSandpackNode?.viewport !== undefined && {
                selectedNodeViewport: selectedSandpackNode.viewport,
              })}
              {...(selectedNode?.id !== undefined ? { selectedNodeId: selectedNode.id } : {})}
              {...(onSelectNode !== undefined ? { onSelectNode } : {})}
              enableVisualEditing={true}
              onPositionChange={handlePositionChange}
              onSizeChange={handleSizeChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
