/**
 * Auto Layout Panel Component
 *
 * Controls for configuring auto-layout on frames.
 * Includes direction, spacing, padding, alignment, and sizing options.
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../lib/design/designTokens';
import { DEFAULT_AUTO_LAYOUT } from '../../types/designNodeTypes';

import type { AutoLayout, AutoLayoutDirection, Padding } from '../../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface AutoLayoutPanelProps {
  autoLayout?: AutoLayout;
  onChange: (autoLayout: AutoLayout) => void;
  onEnable: (direction: AutoLayoutDirection) => void;
  onDisable: () => void;
  disabled?: boolean;
}

// =============================================================================
// ICONS
// =============================================================================

const HorizontalIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="5" width="4" height="6" rx="1" />
    <rect x="6" y="5" width="4" height="6" rx="1" />
    <rect x="11" y="5" width="4" height="6" rx="1" />
  </svg>
);

const VerticalIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="5" y="1" width="6" height="4" rx="1" />
    <rect x="5" y="6" width="6" height="4" rx="1" />
    <rect x="5" y="11" width="6" height="4" rx="1" />
  </svg>
);

// WrapIcon - currently unused but kept for future wrap layout feature
// const WrapIcon = (): React.JSX.Element => (
// 	<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
// 		<rect x="1" y="1" width="4" height="4" rx="1" />
// 		<rect x="6" y="1" width="4" height="4" rx="1" />
// 		<rect x="11" y="1" width="4" height="4" rx="1" />
// 		<rect x="1" y="6" width="4" height="4" rx="1" />
// 		<rect x="6" y="6" width="4" height="4" rx="1" />
// 	</svg>
// );

const AlignStartIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="2" width="2" height="12" opacity="0.3" />
    <rect x="5" y="4" width="8" height="3" rx="1" />
    <rect x="5" y="9" width="6" height="3" rx="1" />
  </svg>
);

const AlignCenterIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="7" y="2" width="2" height="12" opacity="0.3" />
    <rect x="3" y="4" width="10" height="3" rx="1" />
    <rect x="4" y="9" width="8" height="3" rx="1" />
  </svg>
);

const AlignEndIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="12" y="2" width="2" height="12" opacity="0.3" />
    <rect x="3" y="4" width="8" height="3" rx="1" />
    <rect x="5" y="9" width="6" height="3" rx="1" />
  </svg>
);

const SpaceBetweenIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="2" width="2" height="12" opacity="0.3" />
    <rect x="12" y="2" width="2" height="12" opacity="0.3" />
    <rect x="3" y="6" width="4" height="4" rx="1" />
    <rect x="9" y="6" width="4" height="4" rx="1" />
  </svg>
);

const StretchIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="2" width="12" height="2" opacity="0.3" />
    <rect x="2" y="12" width="12" height="2" opacity="0.3" />
    <rect x="4" y="5" width="8" height="6" rx="1" />
  </svg>
);

const HugIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5 8L2 5v6l3-3zm6 0l3 3V5l-3 3z" opacity="0.5" />
    <rect x="5" y="5" width="6" height="6" rx="1" />
  </svg>
);

const FillIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 5l3 3-3 3V5zm12 0v6l-3-3 3-3z" opacity="0.5" />
    <rect x="4" y="5" width="8" height="6" rx="1" />
  </svg>
);

const FixedIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="7" width="4" height="2" opacity="0.5" />
    <rect x="10" y="7" width="4" height="2" opacity="0.5" />
    <rect x="5" y="5" width="6" height="6" rx="1" />
  </svg>
);

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
  },
  enableSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: 'var(--accent)',
    borderRadius: radii.md,
  },
  enableLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
  },
  enableButtons: {
    display: 'flex',
    gap: spacing.xs,
  },
  enableButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  enableButtonActive: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--info)',
    color: 'var(--foreground)',
  },
  enableButtonHover: {
    backgroundColor: 'var(--secondary)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    flex: 1,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
  },
  input: {
    width: '100%',
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: spacing.xs,
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  iconButtonActive: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--info)',
    color: 'var(--foreground)',
  },
  iconButtonHover: {
    backgroundColor: 'var(--secondary)',
  },
  paddingGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: fontSize.sm,
    color: 'var(--secondary-foreground)',
    cursor: 'pointer',
  },
  disabledOverlay: {
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AutoLayoutPanel({
  autoLayout,
  onChange,
  onEnable,
  onDisable,
  disabled = false,
}: AutoLayoutPanelProps): React.JSX.Element {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const isEnabled = autoLayout?.enabled ?? false;
  const layout = autoLayout ?? DEFAULT_AUTO_LAYOUT;

  // Update handlers
  const updateLayout = useCallback(
    (updates: Partial<AutoLayout>): void => {
      if (disabled) return;
      onChange({ ...layout, ...updates });
    },
    [layout, onChange, disabled]
  );

  const updatePadding = useCallback(
    (side: keyof Padding, value: number): void => {
      if (disabled) return;
      onChange({
        ...layout,
        padding: { ...layout.padding, [side]: value },
      });
    },
    [layout, onChange, disabled]
  );

  const getButtonStyle = (id: string, isActive: boolean): React.CSSProperties => {
    const isHovered = hoveredButton === id;
    return {
      ...styles.iconButton,
      ...(isActive ? styles.iconButtonActive : {}),
      ...(isHovered && !isActive ? styles.iconButtonHover : {}),
    };
  };

  // Not enabled state - show enable buttons
  if (!isEnabled) {
    return (
      <div style={styles.container}>
        <div style={styles.enableSection}>
          <span style={styles.enableLabel}>Auto Layout</span>
          <div style={styles.enableButtons}>
            <button
              style={{
                ...styles.enableButton,
                ...(hoveredButton === 'h' ? styles.enableButtonHover : {}),
              }}
              onClick={() => {
                onEnable('horizontal');
              }}
              onMouseEnter={() => {
                setHoveredButton('h');
              }}
              onMouseLeave={() => {
                setHoveredButton(null);
              }}
              title="Add horizontal auto layout"
              disabled={disabled}
            >
              <HorizontalIcon />
            </button>
            <button
              style={{
                ...styles.enableButton,
                ...(hoveredButton === 'v' ? styles.enableButtonHover : {}),
              }}
              onClick={() => {
                onEnable('vertical');
              }}
              onMouseEnter={() => {
                setHoveredButton('v');
              }}
              onMouseLeave={() => {
                setHoveredButton(null);
              }}
              title="Add vertical auto layout"
              disabled={disabled}
            >
              <VerticalIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...(disabled ? styles.disabledOverlay : {}) }}>
      {/* Direction */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Direction</div>
        <div style={styles.buttonGroup}>
          <button
            style={getButtonStyle('dir-h', layout.direction === 'horizontal')}
            onClick={() => {
              updateLayout({ direction: 'horizontal' });
            }}
            onMouseEnter={() => {
              setHoveredButton('dir-h');
            }}
            onMouseLeave={() => {
              setHoveredButton(null);
            }}
            title="Horizontal"
          >
            <HorizontalIcon />
          </button>
          <button
            style={getButtonStyle('dir-v', layout.direction === 'vertical')}
            onClick={() => {
              updateLayout({ direction: 'vertical' });
            }}
            onMouseEnter={() => {
              setHoveredButton('dir-v');
            }}
            onMouseLeave={() => {
              setHoveredButton(null);
            }}
            title="Vertical"
          >
            <VerticalIcon />
          </button>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={layout.wrap}
              onChange={(e) => {
                updateLayout({ wrap: e.target.checked });
              }}
            />
            Wrap
          </label>
        </div>
      </div>

      {/* Spacing */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Spacing</div>
        <div style={styles.inputGroup}>
          <input
            type="number"
            value={layout.spacing}
            onChange={(e) => {
              updateLayout({ spacing: parseInt(e.target.value) || 0 });
            }}
            style={styles.input}
            min={0}
          />
        </div>
      </div>

      {/* Padding */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Padding</div>
        <div style={styles.paddingGrid}>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Top</span>
            <input
              type="number"
              value={layout.padding.top}
              onChange={(e) => {
                updatePadding('top', parseInt(e.target.value) || 0);
              }}
              style={styles.input}
              min={0}
            />
          </div>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Right</span>
            <input
              type="number"
              value={layout.padding.right}
              onChange={(e) => {
                updatePadding('right', parseInt(e.target.value) || 0);
              }}
              style={styles.input}
              min={0}
            />
          </div>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Bottom</span>
            <input
              type="number"
              value={layout.padding.bottom}
              onChange={(e) => {
                updatePadding('bottom', parseInt(e.target.value) || 0);
              }}
              style={styles.input}
              min={0}
            />
          </div>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Left</span>
            <input
              type="number"
              value={layout.padding.left}
              onChange={(e) => {
                updatePadding('left', parseInt(e.target.value) || 0);
              }}
              style={styles.input}
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Alignment */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Alignment</div>
        <div style={styles.row}>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Main Axis</span>
            <div style={styles.buttonGroup}>
              <button
                style={getButtonStyle('align-start', layout.primaryAxisAlign === 'start')}
                onClick={() => {
                  updateLayout({ primaryAxisAlign: 'start' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('align-start');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Start"
              >
                <AlignStartIcon />
              </button>
              <button
                style={getButtonStyle('align-center', layout.primaryAxisAlign === 'center')}
                onClick={() => {
                  updateLayout({ primaryAxisAlign: 'center' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('align-center');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Center"
              >
                <AlignCenterIcon />
              </button>
              <button
                style={getButtonStyle('align-end', layout.primaryAxisAlign === 'end')}
                onClick={() => {
                  updateLayout({ primaryAxisAlign: 'end' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('align-end');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="End"
              >
                <AlignEndIcon />
              </button>
              <button
                style={getButtonStyle('align-between', layout.primaryAxisAlign === 'space-between')}
                onClick={() => {
                  updateLayout({ primaryAxisAlign: 'space-between' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('align-between');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Space Between"
              >
                <SpaceBetweenIcon />
              </button>
            </div>
          </div>
        </div>
        <div style={styles.row}>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Cross Axis</span>
            <div style={styles.buttonGroup}>
              <button
                style={getButtonStyle('cross-start', layout.counterAxisAlign === 'start')}
                onClick={() => {
                  updateLayout({ counterAxisAlign: 'start' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('cross-start');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Start"
              >
                <AlignStartIcon />
              </button>
              <button
                style={getButtonStyle('cross-center', layout.counterAxisAlign === 'center')}
                onClick={() => {
                  updateLayout({ counterAxisAlign: 'center' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('cross-center');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Center"
              >
                <AlignCenterIcon />
              </button>
              <button
                style={getButtonStyle('cross-end', layout.counterAxisAlign === 'end')}
                onClick={() => {
                  updateLayout({ counterAxisAlign: 'end' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('cross-end');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="End"
              >
                <AlignEndIcon />
              </button>
              <button
                style={getButtonStyle('cross-stretch', layout.counterAxisAlign === 'stretch')}
                onClick={() => {
                  updateLayout({ counterAxisAlign: 'stretch' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('cross-stretch');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Stretch"
              >
                <StretchIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sizing */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Sizing</div>
        <div style={styles.row}>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Width</span>
            <div style={styles.buttonGroup}>
              <button
                style={getButtonStyle('w-hug', layout.counterSizing === 'hug')}
                onClick={() => {
                  updateLayout({ counterSizing: 'hug' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('w-hug');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Hug contents"
              >
                <HugIcon />
              </button>
              <button
                style={getButtonStyle('w-fill', layout.counterSizing === 'fill')}
                onClick={() => {
                  updateLayout({ counterSizing: 'fill' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('w-fill');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Fill container"
              >
                <FillIcon />
              </button>
              <button
                style={getButtonStyle('w-fixed', layout.counterSizing === 'fixed')}
                onClick={() => {
                  updateLayout({ counterSizing: 'fixed' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('w-fixed');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Fixed"
              >
                <FixedIcon />
              </button>
            </div>
          </div>
        </div>
        <div style={styles.row}>
          <div style={styles.inputGroup}>
            <span style={styles.inputLabel}>Height</span>
            <div style={styles.buttonGroup}>
              <button
                style={getButtonStyle('h-hug', layout.primarySizing === 'hug')}
                onClick={() => {
                  updateLayout({ primarySizing: 'hug' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('h-hug');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Hug contents"
              >
                <HugIcon />
              </button>
              <button
                style={getButtonStyle('h-fill', layout.primarySizing === 'fill')}
                onClick={() => {
                  updateLayout({ primarySizing: 'fill' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('h-fill');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Fill container"
              >
                <FillIcon />
              </button>
              <button
                style={getButtonStyle('h-fixed', layout.primarySizing === 'fixed')}
                onClick={() => {
                  updateLayout({ primarySizing: 'fixed' });
                }}
                onMouseEnter={() => {
                  setHoveredButton('h-fixed');
                }}
                onMouseLeave={() => {
                  setHoveredButton(null);
                }}
                title="Fixed"
              >
                <FixedIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Remove button */}
      <button
        style={{
          ...styles.enableButton,
          width: '100%',
          backgroundColor: 'var(--destructive)',
          borderColor: 'var(--destructive)',
          color: 'var(--destructive-foreground)',
        }}
        onClick={onDisable}
      >
        Remove Auto Layout
      </button>
    </div>
  );
}

export default AutoLayoutPanel;
