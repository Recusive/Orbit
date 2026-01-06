/**
 * Constraint Picker Component
 *
 * A visual 9-grid picker for setting horizontal and vertical constraints.
 *
 * The picker shows a visual representation of how the element will behave
 * when its parent is resized.
 */

import React, { useState, useCallback, useMemo } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../lib/designTokens';

import type {
  Constraints,
  HorizontalConstraint,
  VerticalConstraint,
} from '../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface ConstraintPickerProps {
  constraints: Constraints;
  onChange: (constraints: Constraints) => void;
  disabled?: boolean;
}

// =============================================================================
// CONSTRAINT OPTIONS
// =============================================================================

const horizontalOptions: { value: HorizontalConstraint; label: string; icon: React.ReactNode }[] = [
  { value: 'left', label: 'Left', icon: <LeftIcon /> },
  { value: 'right', label: 'Right', icon: <RightIcon /> },
  { value: 'center', label: 'Center', icon: <CenterHIcon /> },
  { value: 'scale', label: 'Scale', icon: <ScaleHIcon /> },
  { value: 'left-right', label: 'Left & Right', icon: <StretchHIcon /> },
];

const verticalOptions: { value: VerticalConstraint; label: string; icon: React.ReactNode }[] = [
  { value: 'top', label: 'Top', icon: <TopIcon /> },
  { value: 'bottom', label: 'Bottom', icon: <BottomIcon /> },
  { value: 'center', label: 'Center', icon: <CenterVIcon /> },
  { value: 'scale', label: 'Scale', icon: <ScaleVIcon /> },
  { value: 'top-bottom', label: 'Top & Bottom', icon: <StretchVIcon /> },
];

// =============================================================================
// ICONS
// =============================================================================

function LeftIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="6" width="2" height="4" />
      <rect x="6" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function RightIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="12" y="6" width="2" height="4" />
      <rect x="4" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function CenterHIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="7.5" y="2" width="1" height="12" opacity="0.5" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function ScaleHIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 8L4 6v4L2 8zm12 0l-2 2V6l2 2z" opacity="0.5" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function StretchHIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="6" width="2" height="4" />
      <rect x="12" y="6" width="2" height="4" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function TopIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="6" y="2" width="4" height="2" />
      <rect x="5" y="6" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function BottomIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="6" y="12" width="4" height="2" />
      <rect x="5" y="4" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function CenterVIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="7.5" width="12" height="1" opacity="0.5" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function ScaleVIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2l2 2H6l2-2zm0 12l-2-2h4l-2 2z" opacity="0.5" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

function StretchVIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="6" y="2" width="4" height="2" />
      <rect x="6" y="12" width="4" height="2" />
      <rect x="5" y="5" width="6" height="6" rx="1" opacity="0.3" />
    </svg>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
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
  optionsRow: {
    display: 'flex',
    gap: spacing.xs,
  },
  option: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: `${String(spacing.sm)}px`,
    minWidth: 48,
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    color: 'var(--muted-foreground)',
    fontSize: fontSize.xs,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  optionActive: {
    backgroundColor: 'var(--selection)',
    borderColor: 'var(--primary)',
    color: 'var(--foreground)',
  },
  optionHover: {
    backgroundColor: 'var(--accent)',
  },
  optionDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  visualPicker: {
    display: 'flex',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  visualGrid: {
    position: 'relative' as const,
    width: 120,
    height: 80,
    border: '2px solid var(--border)',
    borderRadius: radii.md,
    backgroundColor: 'var(--muted)',
  },
  visualElement: {
    position: 'absolute' as const,
    backgroundColor: 'var(--primary)',
    borderRadius: radii.sm,
    transition: `all ${motion.normal} ${motion.ease}`,
  },
  constraintLine: {
    position: 'absolute' as const,
    backgroundColor: 'var(--primary)',
  },
  dropdownContainer: {
    display: 'flex',
    gap: spacing.md,
  },
  dropdown: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    marginBottom: spacing.xs,
  },
  select: {
    width: '100%',
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    cursor: 'pointer',
    outline: 'none',
  },
};

// =============================================================================
// VISUAL PREVIEW COMPONENT
// =============================================================================

interface VisualPreviewProps {
  constraints: Constraints;
}

function VisualPreview({ constraints }: VisualPreviewProps): React.JSX.Element {
  // Calculate element position based on constraints
  const getElementStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      ...styles.visualElement,
      width: 30,
      height: 20,
    };

    // Horizontal positioning
    switch (constraints.horizontal) {
      case 'left':
        base.left = 8;
        break;
      case 'right':
        base.right = 8;
        break;
      case 'center':
        base.left = '50%';
        base.transform = 'translateX(-50%)';
        break;
      case 'scale':
        base.left = '25%';
        base.width = '50%';
        break;
      case 'left-right':
        base.left = 8;
        base.right = 8;
        base.width = 'auto';
        break;
    }

    // Vertical positioning
    switch (constraints.vertical) {
      case 'top':
        base.top = 8;
        break;
      case 'bottom':
        base.bottom = 8;
        break;
      case 'center':
        base.top = '50%';
        base.transform = `${base.transform ?? ''} translateY(-50%)`;
        break;
      case 'scale':
        base.top = '25%';
        base.height = '50%';
        break;
      case 'top-bottom':
        base.top = 8;
        base.bottom = 8;
        base.height = 'auto';
        break;
    }

    return base;
  }, [constraints]);

  // Render constraint lines
  const renderConstraintLines = (): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];

    // Horizontal lines
    if (constraints.horizontal === 'left' || constraints.horizontal === 'left-right') {
      lines.push(
        <div
          key="left-line"
          style={{
            ...styles.constraintLine,
            left: 0,
            top: '50%',
            width: 8,
            height: 2,
            transform: 'translateY(-50%)',
          }}
        />
      );
    }
    if (constraints.horizontal === 'right' || constraints.horizontal === 'left-right') {
      lines.push(
        <div
          key="right-line"
          style={{
            ...styles.constraintLine,
            right: 0,
            top: '50%',
            width: 8,
            height: 2,
            transform: 'translateY(-50%)',
          }}
        />
      );
    }

    // Vertical lines
    if (constraints.vertical === 'top' || constraints.vertical === 'top-bottom') {
      lines.push(
        <div
          key="top-line"
          style={{
            ...styles.constraintLine,
            top: 0,
            left: '50%',
            width: 2,
            height: 8,
            transform: 'translateX(-50%)',
          }}
        />
      );
    }
    if (constraints.vertical === 'bottom' || constraints.vertical === 'top-bottom') {
      lines.push(
        <div
          key="bottom-line"
          style={{
            ...styles.constraintLine,
            bottom: 0,
            left: '50%',
            width: 2,
            height: 8,
            transform: 'translateX(-50%)',
          }}
        />
      );
    }

    return lines;
  };

  return (
    <div style={styles.visualPicker}>
      <div style={styles.visualGrid}>
        {renderConstraintLines()}
        <div style={getElementStyle} />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ConstraintPicker({
  constraints,
  onChange,
  disabled = false,
}: ConstraintPickerProps): React.JSX.Element {
  const [hoveredH, setHoveredH] = useState<HorizontalConstraint | null>(null);
  const [hoveredV, setHoveredV] = useState<VerticalConstraint | null>(null);

  const handleHorizontalChange = useCallback(
    (value: HorizontalConstraint): void => {
      if (disabled) return;
      onChange({ ...constraints, horizontal: value });
    },
    [constraints, onChange, disabled]
  );

  const handleVerticalChange = useCallback(
    (value: VerticalConstraint): void => {
      if (disabled) return;
      onChange({ ...constraints, vertical: value });
    },
    [constraints, onChange, disabled]
  );

  const getOptionStyle = (
    isActive: boolean,
    isHovered: boolean,
    isDisabled: boolean
  ): React.CSSProperties => {
    return {
      ...styles.option,
      ...(isActive ? styles.optionActive : {}),
      ...(isHovered && !isActive && !isDisabled ? styles.optionHover : {}),
      ...(isDisabled ? styles.optionDisabled : {}),
    };
  };

  return (
    <div style={styles.container}>
      {/* Visual Preview */}
      <VisualPreview constraints={constraints} />

      {/* Dropdown Selectors (compact mode) */}
      <div style={styles.dropdownContainer}>
        <div style={styles.dropdown}>
          <div style={styles.dropdownLabel}>Horizontal</div>
          <select
            style={styles.select}
            value={constraints.horizontal}
            onChange={(e) => {
              handleHorizontalChange(e.target.value as HorizontalConstraint);
            }}
            disabled={disabled}
          >
            {horizontalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.dropdown}>
          <div style={styles.dropdownLabel}>Vertical</div>
          <select
            style={styles.select}
            value={constraints.vertical}
            onChange={(e) => {
              handleVerticalChange(e.target.value as VerticalConstraint);
            }}
            disabled={disabled}
          >
            {verticalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Icon buttons (expanded mode) */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Horizontal</div>
        <div style={styles.optionsRow}>
          {horizontalOptions.map((option) => {
            const isActive = constraints.horizontal === option.value;
            const isHovered = hoveredH === option.value;

            return (
              <button
                key={option.value}
                style={getOptionStyle(isActive, isHovered, disabled)}
                onClick={() => {
                  handleHorizontalChange(option.value);
                }}
                onMouseEnter={() => {
                  setHoveredH(option.value);
                }}
                onMouseLeave={() => {
                  setHoveredH(null);
                }}
                title={option.label}
                disabled={disabled}
              >
                {option.icon}
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>Vertical</div>
        <div style={styles.optionsRow}>
          {verticalOptions.map((option) => {
            const isActive = constraints.vertical === option.value;
            const isHovered = hoveredV === option.value;

            return (
              <button
                key={option.value}
                style={getOptionStyle(isActive, isHovered, disabled)}
                onClick={() => {
                  handleVerticalChange(option.value);
                }}
                onMouseEnter={() => {
                  setHoveredV(option.value);
                }}
                onMouseLeave={() => {
                  setHoveredV(null);
                }}
                title={option.label}
                disabled={disabled}
              >
                {option.icon}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ConstraintPicker;
