import React, { useState, useCallback } from 'react';

import { fontWeight } from '../../lib/design/designTokens';
import { ButtonGroup, ButtonGroupSeparator } from '../ui/ButtonGroup';
import { SaveStatusIndicator } from '../workflow/SaveStatusIndicator';

import type { CanvasMode } from '../../types/canvasMode';

// Simple SVG icons as components (no external icon library needed)
const UndoIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 14 4 9 9 4"></polyline>
    <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
  </svg>
);

const RedoIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 14 20 9 15 4"></polyline>
    <path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>
  </svg>
);

const PlusIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const EyeIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const BoxIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);

const SaveIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
    <polyline points="17 21 17 13 7 13 7 21"></polyline>
    <polyline points="7 3 7 8 15 8"></polyline>
  </svg>
);

const MessageIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

// Canvas mode icons - 13px for compact segment control
const DesignIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const CodeIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const WorkflowIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="6" height="6" rx="1"></rect>
    <rect x="15" y="3" width="6" height="6" rx="1"></rect>
    <rect x="9" y="15" width="6" height="6" rx="1"></rect>
    <path d="M6 9v3a1 1 0 0 0 1 1h4"></path>
    <path d="M18 9v3a1 1 0 0 1-1 1h-4"></path>
  </svg>
);

const MissionsIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Target/crosshair icon representing mission objectives */}
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="6"></circle>
    <circle cx="12" cy="12" r="2"></circle>
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
  </svg>
);

// Custom sidebar toggle icon - thicker middle line when expanded (LEFT sidebar)
const SidebarToggleIcon = ({ expanded }: { expanded: boolean }): React.JSX.Element => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="1 1 22 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Outer frame */}
    <path
      d="M19 5V19H21V5H19ZM19 19H5V21H19V19ZM5 19V5H3V19H5ZM5 5H19V3H5V5ZM5 5V5V3C3.89543 3 3 3.89543 3 5H5ZM5 19H3C3 20.1046 3.89543 21 5 21V19ZM19 19V21C20.1046 21 21 20.1046 21 19H19ZM21 5C21 3.89543 20.1046 3 19 3V5H21Z"
      fill="currentColor"
    />
    {/* Left panel - thicker when expanded */}
    <rect x={7} y="7" width={expanded ? 5 : 2} height="10" rx="1" fill="currentColor" />
  </svg>
);

// Custom sidebar toggle icon for RIGHT sidebar - mirrored version
const RightSidebarToggleIcon = ({ expanded }: { expanded: boolean }): React.JSX.Element => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="1 1 22 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Outer frame */}
    <path
      d="M19 5V19H21V5H19ZM19 19H5V21H19V19ZM5 19V5H3V19H5ZM5 5H19V3H5V5ZM5 5V5V3C3.89543 3 3 3.89543 3 5H5ZM5 19H3C3 20.1046 3.89543 21 5 21V19ZM19 19V21C20.1046 21 21 20.1046 21 19H19ZM21 5C21 3.89543 20.1046 3 19 3V5H21Z"
      fill="currentColor"
    />
    {/* Right panel - thicker when expanded, positioned on right side */}
    <rect
      x={expanded ? 12 : 15}
      y="7"
      width={expanded ? 5 : 2}
      height="10"
      rx="1"
      fill="currentColor"
    />
  </svg>
);

export type RenderMode = 'styled' | 'wireframe';

interface CanvasToolbarProps {
  onAddComponent: () => void;
  onTogglePreview?: () => void;
  onSave?: () => void;
  onOpenAgent?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  hasAgentNotification?: boolean;
  renderMode?: RenderMode;
  onToggleWireframe?: () => void;
  canvasMode?: CanvasMode;
  onCanvasModeChange?: (mode: CanvasMode) => void;
  // Left sidebar
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  leftSidebarWidth?: number;
  // Right sidebar
  isRightSidebarCollapsed?: boolean;
  onToggleRightSidebar?: () => void;
  rightSidebarWidth?: number;
}

// Detect Mac for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC');
const modKeyLabel = isMac ? 'Cmd' : 'Ctrl';

// Color system - using CSS variables from globals.css
const colorSystem = {
  // Text colors
  textMuted: 'var(--muted-foreground)',
  textForeground: 'var(--foreground)',
  // Background colors
  bgTransparent: 'transparent',
  bgAccent: 'var(--accent)',
  bgAccentActive: 'var(--accent)',
  bgMuted: 'var(--input)',
  bgSurface: 'var(--card)',
  // Border
  border: 'var(--border)',
};

// Floating toolbar constants
const FLOATING_SIDE_GAP = 6;
const FLOATING_RADIUS = 10;

// Animation easing
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Styles using orbit-agent design system
const styles = {
  toolbar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    pointerEvents: 'none' as const,
    zIndex: 10,
  } as React.CSSProperties,
  leftSection: {
    position: 'absolute' as const,
    top: FLOATING_SIDE_GAP,
    left: FLOATING_SIDE_GAP,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 35,
    padding: '0 10px 0 10px',
    paddingRight: 6, // Tighter on button side
    backgroundColor: 'color-mix(in oklch, var(--card) 90%, transparent)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.1), 0 4px 12px -4px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'auto' as const,
    transition: `box-shadow 200ms ${EASE_OUT}`,
  } as React.CSSProperties,
  leftSectionHover: {
    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.12), 0 8px 20px -4px rgba(0, 0, 0, 0.08)',
  } as React.CSSProperties,
  brandTitle: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colorSystem.textForeground,
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
  } as React.CSSProperties,
  previewBadge: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
    borderRadius: 9999, // pill shape
    padding: '3px 8px',
    fontSize: 9,
    fontWeight: 500,
    color: 'var(--primary)',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  } as React.CSSProperties,
  sidebarToggleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: colorSystem.textMuted,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  } as React.CSSProperties,
  sidebarToggleButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 80%, transparent)',
    color: colorSystem.textForeground,
    transform: 'scale(1.05)',
  } as React.CSSProperties,
  sidebarToggleButtonActive: {
    transform: 'scale(0.95)',
  } as React.CSSProperties,
  actions: {
    position: 'absolute' as const,
    top: FLOATING_SIDE_GAP,
    right: FLOATING_SIDE_GAP,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 35,
    padding: '0 6px',
    backgroundColor: 'color-mix(in oklch, var(--card) 90%, transparent)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.1), 0 4px 12px -4px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'auto' as const,
    transition: `box-shadow 200ms ${EASE_OUT}`,
  } as React.CSSProperties,
  actionsHover: {
    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.12), 0 8px 20px -4px rgba(0, 0, 0, 0.08)',
  } as React.CSSProperties,
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px 6px',
    border: 'none',
    borderRadius: 3,
    backgroundColor: colorSystem.bgTransparent,
    color: colorSystem.textMuted,
    cursor: 'pointer',
    transition: 'all 0.1s',
  } as React.CSSProperties,
  iconButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    border: 'none',
    borderRadius: 3,
    backgroundColor: colorSystem.bgTransparent,
    color: colorSystem.textForeground,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.1s',
  } as React.CSSProperties,
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 12,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: 'all 0.1s',
  } as React.CSSProperties,
  activeButton: {
    backgroundColor: colorSystem.bgAccent,
    color: colorSystem.textForeground,
  } as React.CSSProperties,
  divider: {
    width: 1,
    height: 14,
    backgroundColor: 'color-mix(in oklch, var(--border) 50%, transparent)',
    margin: '0 2px',
  } as React.CSSProperties,
  notificationBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: 'var(--warning)',
    border: `2px solid ${colorSystem.bgSurface}`,
  } as React.CSSProperties,
  modeSegment: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    borderRadius: 8,
    padding: 3,
    height: 28,
  } as React.CSSProperties,
  modeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '0 10px',
    height: '100%',
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: colorSystem.textMuted,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  } as React.CSSProperties,
  modeButtonHover: {
    color: colorSystem.textForeground,
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
  } as React.CSSProperties,
  modeButtonActive: {
    backgroundColor: 'var(--card)',
    color: colorSystem.textForeground,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
  } as React.CSSProperties,
  // Right sidebar toggle button - matching left sidebar style
  rightSidebarToggleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: colorSystem.textMuted,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  } as React.CSSProperties,
  rightSidebarToggleButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 80%, transparent)',
    color: colorSystem.textForeground,
    transform: 'scale(1.05)',
  } as React.CSSProperties,
  rightSidebarToggleButtonActive: {
    transform: 'scale(0.95)',
  } as React.CSSProperties,
};

// Interactive button hook for hover/active states
interface ButtonState {
  isHovered: boolean;
  isActive: boolean;
}

function useButtonInteraction(): {
  state: ButtonState;
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
  };
} {
  const [state, setState] = useState<ButtonState>({ isHovered: false, isActive: false });

  const handlers = {
    onMouseEnter: useCallback((): void => {
      setState((s) => ({ ...s, isHovered: true }));
    }, []),
    onMouseLeave: useCallback((): void => {
      setState({ isHovered: false, isActive: false });
    }, []),
    onMouseDown: useCallback((): void => {
      setState((s) => ({ ...s, isActive: true }));
    }, []),
    onMouseUp: useCallback((): void => {
      setState((s) => ({ ...s, isActive: false }));
    }, []),
  };

  return { state, handlers };
}

// Get button style with hover/active states - orbit-agent style (opacity + bg-accent)
function getButtonStyle(
  baseStyle: React.CSSProperties,
  state: ButtonState,
  disabled?: boolean,
  isPrimary?: boolean
): React.CSSProperties {
  if (disabled) {
    return { ...baseStyle, ...styles.iconButtonDisabled };
  }

  let style = { ...baseStyle };

  if (state.isHovered && !state.isActive) {
    style = {
      ...style,
      color: colorSystem.textForeground,
      backgroundColor: isPrimary ? 'var(--primary)' : colorSystem.bgAccent,
    };
  }

  if (state.isActive) {
    style = {
      ...style,
      color: colorSystem.textForeground,
      backgroundColor: isPrimary ? 'var(--primary)' : colorSystem.bgAccentActive,
    };
  }

  return style;
}

// Reusable toolbar button component
interface ToolbarButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
  isPrimary?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  disabled,
  title,
  style,
  isPrimary,
  isActive,
  children,
}: ToolbarButtonProps): React.JSX.Element {
  const { state, handlers } = useButtonInteraction();

  const baseStyle = isPrimary ? styles.primaryButton : styles.button;
  const combinedStyle = {
    ...baseStyle,
    ...(isActive ? styles.activeButton : {}),
    ...style,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={getButtonStyle(combinedStyle, state, disabled, isPrimary)}
      {...handlers}
    >
      {children}
    </button>
  );
}

// Icon-only button variant
function IconButton({
  onClick,
  disabled,
  title,
  children,
}: Omit<ToolbarButtonProps, 'isPrimary' | 'isActive' | 'style'>): React.JSX.Element {
  const { state, handlers } = useButtonInteraction();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={getButtonStyle(styles.iconButton, state, disabled)}
      {...handlers}
    >
      {children}
    </button>
  );
}

export function CanvasToolbar({
  onAddComponent,
  onTogglePreview,
  onSave,
  onOpenAgent,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hasAgentNotification = false,
  renderMode = 'styled',
  onToggleWireframe,
  canvasMode = 'code',
  onCanvasModeChange,
  isSidebarCollapsed = false,
  onToggleSidebar,
  isRightSidebarCollapsed = false,
  onToggleRightSidebar,
}: CanvasToolbarProps): React.JSX.Element {
  const [leftSectionHovered, setLeftSectionHovered] = useState(false);
  const [sidebarButtonHovered, setSidebarButtonHovered] = useState(false);
  const [sidebarButtonActive, setSidebarButtonActive] = useState(false);
  const [actionsHovered, setActionsHovered] = useState(false);
  const [rightSidebarButtonHovered, setRightSidebarButtonHovered] = useState(false);
  const [rightSidebarButtonActive, setRightSidebarButtonActive] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<CanvasMode | null>(null);

  const modeOptions: { mode: CanvasMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'design', icon: <DesignIcon />, label: 'Design' },
    { mode: 'code', icon: <CodeIcon />, label: 'Code' },
    { mode: 'workflow', icon: <WorkflowIcon />, label: 'Workflow' },
    { mode: 'missions', icon: <MissionsIcon />, label: 'Missions' },
  ];

  return (
    <div style={styles.toolbar}>
      {/* Left: Brand + Sidebar Toggle - Modern floating header */}
      <div
        style={{
          ...styles.leftSection,
          ...(leftSectionHovered ? styles.leftSectionHover : {}),
        }}
        onMouseEnter={(): void => {
          setLeftSectionHovered(true);
        }}
        onMouseLeave={(): void => {
          setLeftSectionHovered(false);
        }}
      >
        <span style={styles.brandTitle}>Orbit Canvas</span>
        <span style={styles.previewBadge}>Preview</span>
        {onToggleSidebar !== undefined && (
          <button
            onClick={onToggleSidebar}
            onMouseEnter={(): void => {
              setSidebarButtonHovered(true);
            }}
            onMouseLeave={(): void => {
              setSidebarButtonHovered(false);
              setSidebarButtonActive(false);
            }}
            onMouseDown={(): void => {
              setSidebarButtonActive(true);
            }}
            onMouseUp={(): void => {
              setSidebarButtonActive(false);
            }}
            style={{
              ...styles.sidebarToggleButton,
              ...(sidebarButtonHovered ? styles.sidebarToggleButtonHover : {}),
              ...(sidebarButtonActive ? styles.sidebarToggleButtonActive : {}),
            }}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarToggleIcon expanded={!isSidebarCollapsed} />
          </button>
        )}
      </div>

      {/* Right Section: Actions + Mode Switcher + Sidebar Toggle */}
      <div
        style={{
          ...styles.actions,
          ...(actionsHovered ? styles.actionsHover : {}),
        }}
        onMouseEnter={(): void => {
          setActionsHovered(true);
        }}
        onMouseLeave={(): void => {
          setActionsHovered(false);
        }}
      >
        {/* Canvas Actions - only in code/design mode (workflow has its own floating toolbar) */}
        {canvasMode !== 'workflow' && (
          <ButtonGroup aria-label="Canvas actions">
            {/* Undo */}
            <IconButton
              {...(onUndo !== undefined && { onClick: onUndo })}
              disabled={!canUndo}
              title={`Undo (${modKeyLabel}+Z)`}
            >
              <UndoIcon />
            </IconButton>

            {/* Redo */}
            <IconButton
              {...(onRedo !== undefined && { onClick: onRedo })}
              disabled={!canRedo}
              title={`Redo (${modKeyLabel}+Shift+Z)`}
            >
              <RedoIcon />
            </IconButton>

            {/* Separator */}
            <ButtonGroupSeparator />

            {/* Add Component */}
            <ToolbarButton onClick={onAddComponent} title="Add component (Double-click canvas)">
              <PlusIcon />
              <span>Add</span>
            </ToolbarButton>
          </ButtonGroup>
        )}

        {/* Save Status - only in workflow mode, before mode switcher */}
        {canvasMode === 'workflow' && <SaveStatusIndicator />}

        {/* Separator between actions/status and mode switcher */}
        {onCanvasModeChange !== undefined && <div style={styles.divider} />}

        {/* Mode Segment Control */}
        {onCanvasModeChange !== undefined && (
          <div style={styles.modeSegment}>
            {modeOptions.map(({ mode, icon, label }) => {
              const isActive = canvasMode === mode;
              const isHovered = hoveredMode === mode && !isActive;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    onCanvasModeChange(mode);
                  }}
                  onMouseEnter={(): void => {
                    setHoveredMode(mode);
                  }}
                  onMouseLeave={(): void => {
                    setHoveredMode(null);
                  }}
                  style={{
                    ...styles.modeButton,
                    ...(isHovered ? styles.modeButtonHover : {}),
                    ...(isActive ? styles.modeButtonActive : {}),
                  }}
                  title={`Switch to ${label} view`}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Right Sidebar Toggle */}
        {onToggleRightSidebar !== undefined && (
          <>
            <div style={styles.divider} />
            <button
              onClick={onToggleRightSidebar}
              onMouseEnter={(): void => {
                setRightSidebarButtonHovered(true);
              }}
              onMouseLeave={(): void => {
                setRightSidebarButtonHovered(false);
                setRightSidebarButtonActive(false);
              }}
              onMouseDown={(): void => {
                setRightSidebarButtonActive(true);
              }}
              onMouseUp={(): void => {
                setRightSidebarButtonActive(false);
              }}
              style={{
                ...styles.rightSidebarToggleButton,
                ...(rightSidebarButtonHovered ? styles.rightSidebarToggleButtonHover : {}),
                ...(rightSidebarButtonActive ? styles.rightSidebarToggleButtonActive : {}),
              }}
              title={isRightSidebarCollapsed ? 'Expand right sidebar' : 'Collapse right sidebar'}
            >
              <RightSidebarToggleIcon expanded={!isRightSidebarCollapsed} />
            </button>
          </>
        )}

        {/* Toggle Preview */}
        {onTogglePreview ? (
          <ToolbarButton
            onClick={onTogglePreview}
            title={`Toggle preview panel (${modKeyLabel}+\\)`}
          >
            <EyeIcon />
            <span>Preview</span>
          </ToolbarButton>
        ) : null}

        {/* Wireframe Toggle */}
        {onToggleWireframe ? (
          <ToolbarButton
            onClick={onToggleWireframe}
            isActive={renderMode === 'wireframe'}
            title={`Toggle wireframe mode (${modKeyLabel}+Shift+W)`}
          >
            <BoxIcon />
            <span>{renderMode === 'wireframe' ? 'Wireframe' : 'Styled'}</span>
          </ToolbarButton>
        ) : null}

        {/* Save */}
        {onSave ? (
          <ToolbarButton onClick={onSave} isPrimary title={`Save canvas (${modKeyLabel}+S)`}>
            <SaveIcon />
            <span>Save</span>
          </ToolbarButton>
        ) : null}

        {/* Agent Chat Button */}
        {onOpenAgent ? (
          <div style={{ position: 'relative' }}>
            <ToolbarButton onClick={onOpenAgent} title={`Open agent chat (${modKeyLabel}+\`)`}>
              <MessageIcon />
              <span>Agent</span>
            </ToolbarButton>
            {hasAgentNotification ? <div style={styles.notificationBadge} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
