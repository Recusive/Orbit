/**
 * CanvasFloatingToolbar - Floating toolbar at bottom-center for code/design modes
 * Provides quick access to common canvas actions with built-in Agent button
 */

import { useReactFlow } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

// ============================================================================
// Types
// ============================================================================

interface CanvasFloatingToolbarProps {
  onAddComponent: () => void;
  onOpenAgent?: () => void;
}

// ============================================================================
// Icon Components
// ============================================================================

// Orbit logo - PNG as base64
const ORBIT_LOGO_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAH0AAAB9CAYAAACPgGwlAAAACXBIWXMAAC4jAAAuIwF4pT92AAAEp2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTEyLTI4PC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPmQyYzRlZDA1LTlkMWUtNDc0ZS04YzM1LWNkNmFiYmZkODA5YTwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5Mb2dvIC0gMzU8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91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';

function OrbitLogoIcon(): React.JSX.Element {
  return (
    <img
      src={ORBIT_LOGO_BASE64}
      alt="Orbit"
      width="18"
      height="18"
      style={{ objectFit: 'contain' }}
    />
  );
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

function ZoomInIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="14" y2="14" />
      <line x1="5" y1="7" x2="9" y2="7" />
      <line x1="7" y1="5" x2="7" y2="9" />
    </svg>
  );
}

function ZoomOutIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="14" y2="14" />
      <line x1="5" y1="7" x2="9" y2="7" />
    </svg>
  );
}

function FitViewIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <polyline points="5,8 8,5 11,8" />
      <polyline points="5,8 8,11 11,8" />
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'absolute' as const,
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: 6,
    backgroundColor: 'color-mix(in oklch, var(--card) 90%, transparent)',
    backdropFilter: 'blur(12px)',
    border: 'none',
    borderRadius: 14,
    boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.15), 0 8px 32px -8px rgba(0, 0, 0, 0.12)',
    zIndex: 10,
    transition: `opacity 200ms ${EASE_OUT}`,
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 34,
    padding: '0 14px',
    backgroundColor: 'var(--primary)',
    border: 'none',
    borderRadius: 10,
    color: 'var(--primary-foreground)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: `all 200ms ${EASE_OUT}`,
  },
  primaryButtonHover: {
    filter: 'brightness(1.1)',
    boxShadow: '0 0 12px -2px var(--primary)',
  },
  primaryButtonActive: {
    transform: 'scale(0.97)',
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    padding: '0 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 10,
    color: 'var(--foreground)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: `all 200ms ${EASE_OUT}`,
  },
  secondaryButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.02)',
  },
  secondaryButtonActive: {
    transform: 'scale(0.97)',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  iconButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  iconButtonActive: {
    transform: 'scale(0.95)',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'color-mix(in oklch, var(--border) 40%, transparent)',
    margin: '0 4px',
  },
  zoomGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
};

// ============================================================================
// Component
// ============================================================================

export function CanvasFloatingToolbar({
  onAddComponent,
  onOpenAgent,
}: CanvasFloatingToolbarProps): React.JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [pressedButton, setPressedButton] = useState<string | null>(null);

  const handleZoomIn = useCallback((): void => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback((): void => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback((): void => {
    void fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleOpenAgent = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('orbit:agent-open'));
    onOpenAgent?.();
  }, [onOpenAgent]);

  const getPrimaryButtonStyle = (): React.CSSProperties => ({
    ...styles.primaryButton,
    ...(hoveredButton === 'agent' ? styles.primaryButtonHover : {}),
    ...(pressedButton === 'agent' ? styles.primaryButtonActive : {}),
  });

  const getSecondaryButtonStyle = (): React.CSSProperties => ({
    ...styles.secondaryButton,
    ...(hoveredButton === 'add' ? styles.secondaryButtonHover : {}),
    ...(pressedButton === 'add' ? styles.secondaryButtonActive : {}),
  });

  const getIconButtonStyle = (id: string): React.CSSProperties => ({
    ...styles.iconButton,
    ...(hoveredButton === id ? styles.iconButtonHover : {}),
    ...(pressedButton === id ? styles.iconButtonActive : {}),
  });

  return (
    <div className="canvas-floating-toolbar" style={styles.container}>
      {/* Agent Button - Primary styled */}
      <button
        onClick={handleOpenAgent}
        title="Open Agent"
        style={getPrimaryButtonStyle()}
        onMouseEnter={(): void => {
          setHoveredButton('agent');
        }}
        onMouseLeave={(): void => {
          setHoveredButton(null);
          setPressedButton(null);
        }}
        onMouseDown={(): void => {
          setPressedButton('agent');
        }}
        onMouseUp={(): void => {
          setPressedButton(null);
        }}
      >
        <OrbitLogoIcon />
        <span>Agent</span>
      </button>

      {/* Add Component Button */}
      <button
        onClick={onAddComponent}
        title="Add Component"
        style={getSecondaryButtonStyle()}
        onMouseEnter={(): void => {
          setHoveredButton('add');
        }}
        onMouseLeave={(): void => {
          setHoveredButton(null);
          setPressedButton(null);
        }}
        onMouseDown={(): void => {
          setPressedButton('add');
        }}
        onMouseUp={(): void => {
          setPressedButton(null);
        }}
      >
        <PlusIcon />
        <span>Add</span>
      </button>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Zoom Controls */}
      <div style={styles.zoomGroup}>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          style={getIconButtonStyle('zoomOut')}
          onMouseEnter={(): void => {
            setHoveredButton('zoomOut');
          }}
          onMouseLeave={(): void => {
            setHoveredButton(null);
            setPressedButton(null);
          }}
          onMouseDown={(): void => {
            setPressedButton('zoomOut');
          }}
          onMouseUp={(): void => {
            setPressedButton(null);
          }}
        >
          <ZoomOutIcon />
        </button>

        <button
          onClick={handleZoomIn}
          title="Zoom In"
          style={getIconButtonStyle('zoomIn')}
          onMouseEnter={(): void => {
            setHoveredButton('zoomIn');
          }}
          onMouseLeave={(): void => {
            setHoveredButton(null);
            setPressedButton(null);
          }}
          onMouseDown={(): void => {
            setPressedButton('zoomIn');
          }}
          onMouseUp={(): void => {
            setPressedButton(null);
          }}
        >
          <ZoomInIcon />
        </button>

        <button
          onClick={handleFitView}
          title="Fit View"
          style={getIconButtonStyle('fitView')}
          onMouseEnter={(): void => {
            setHoveredButton('fitView');
          }}
          onMouseLeave={(): void => {
            setHoveredButton(null);
            setPressedButton(null);
          }}
          onMouseDown={(): void => {
            setPressedButton('fitView');
          }}
          onMouseUp={(): void => {
            setPressedButton(null);
          }}
        >
          <FitViewIcon />
        </button>
      </div>
    </div>
  );
}
