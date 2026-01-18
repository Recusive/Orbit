/**
 * DrawingToolsPanel - Tool selection sidebar for design mode
 *
 * Provides tool buttons for:
 * - Select (V) - Selection and manipulation
 * - Frame (F) - Container frames
 * - Rectangle (R) - Basic rectangles
 * - Ellipse (O) - Circles and ovals
 * - Text (T) - Text elements
 */

import React, { memo, useState } from 'react';

import type { DrawingTool } from '../../hooks/drawing/useDrawingTools';

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Tool icons
const SelectIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
);

const LayerIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const FrameIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const RectangleIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="0" />
  </svg>
);

const EllipseIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const TextIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="8" y1="20" x2="16" y2="20" />
  </svg>
);

// Tool definitions
const tools: { id: DrawingTool; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { id: 'select', icon: <SelectIcon />, label: 'Select', shortcut: 'V' },
  { id: 'layer', icon: <LayerIcon />, label: 'Layer', shortcut: 'L' },
  { id: 'frame', icon: <FrameIcon />, label: 'Frame', shortcut: 'F' },
  { id: 'rectangle', icon: <RectangleIcon />, label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: <EllipseIcon />, label: 'Ellipse', shortcut: 'O' },
  { id: 'text', icon: <TextIcon />, label: 'Text', shortcut: 'T' },
];

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  panel: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    padding: 8,
    backgroundColor: 'color-mix(in oklch, var(--card) 90%, transparent)',
    backdropFilter: 'blur(12px)',
    border: 'none',
    borderRadius: 12,
    boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.15), 0 8px 32px -4px rgba(0, 0, 0, 0.1)',
    zIndex: 100,
    transition: 'left 280ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    border: 'none',
    borderRadius: 10,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
    position: 'relative' as const,
  },
  buttonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.05)',
  },
  buttonActive: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    boxShadow: '0 0 12px -2px var(--primary)',
  },
  buttonPressed: {
    transform: 'scale(0.95)',
  },
  shortcut: {
    position: 'absolute' as const,
    bottom: 3,
    right: 5,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  shortcutActive: {
    color: 'color-mix(in oklch, var(--primary-foreground) 70%, transparent)',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'color-mix(in oklch, var(--border) 50%, transparent)',
    margin: '6px 0',
  },
};

// =============================================================================
// COMPONENTS
// =============================================================================

interface DrawingToolsPanelProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  isVisible?: boolean;
  isSidebarCollapsed?: boolean;
  sidebarVisualWidth?: number;
}

// Tool button component
const ToolButton = memo(function ToolButton({
  tool,
  isActive,
  onClick,
}: {
  tool: (typeof tools)[number];
  isActive: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const buttonStyles: React.CSSProperties = {
    ...styles.button,
    ...(isActive ? styles.buttonActive : {}),
    ...(isHovered && !isActive ? styles.buttonHover : {}),
    ...(isPressed ? styles.buttonPressed : {}),
    // Keep active button from scaling on hover
    ...(isActive && isHovered ? { transform: 'scale(1)' } : {}),
  };

  const shortcutStyles: React.CSSProperties = {
    ...styles.shortcut,
    ...(isActive ? styles.shortcutActive : {}),
  };

  return (
    <button
      style={buttonStyles}
      onClick={onClick}
      title={`${tool.label} (${tool.shortcut})`}
      aria-pressed={isActive}
      onMouseEnter={(): void => {
        setIsHovered(true);
      }}
      onMouseLeave={(): void => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={(): void => {
        setIsPressed(true);
      }}
      onMouseUp={(): void => {
        setIsPressed(false);
      }}
    >
      {tool.icon}
      <span style={shortcutStyles}>{tool.shortcut}</span>
    </button>
  );
});

// Divider component
const Divider = (): React.JSX.Element => <div style={styles.divider} />;

/**
 * DrawingToolsPanel component
 */
export const DrawingToolsPanel = memo(function DrawingToolsPanel({
  activeTool,
  onToolChange,
  isVisible = true,
  isSidebarCollapsed = true,
  sidebarVisualWidth = 0,
}: DrawingToolsPanelProps): React.JSX.Element | null {
  if (!isVisible) return null;

  const selectTool = tools[0];
  if (selectTool === undefined) return null;

  // Calculate dynamic left position based on sidebar state
  const leftPosition = isSidebarCollapsed ? 12 : sidebarVisualWidth + 20;

  return (
    <div style={{ ...styles.panel, left: leftPosition }}>
      {/* Select tool */}
      <ToolButton
        tool={selectTool}
        isActive={activeTool === 'select'}
        onClick={(): void => {
          onToolChange('select');
        }}
      />

      <Divider />

      {/* Shape tools */}
      {tools.slice(1).map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          onClick={(): void => {
            onToolChange(tool.id);
          }}
        />
      ))}
    </div>
  );
});

export default DrawingToolsPanel;
