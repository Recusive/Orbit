/**
 * PropertyRow
 *
 * Consistent row layout for property panel inputs.
 * Supports various layouts:
 * - Single input (full width)
 * - Label + input
 * - Multiple inputs in a row
 * - Inline label style (like "X" "Y" labels)
 */

import React from 'react';

import { spacing, fontSize, fontWeight } from '../../../lib/design/designTokens';

export interface PropertyRowProps {
  /** Optional label displayed before inputs */
  label?: string;
  /** Inline labels appear next to each input (e.g., "X", "Y") */
  inline?: boolean;
  /** Gap between children */
  gap?: 'sm' | 'md' | 'lg';
  /** Vertical margin */
  marginBottom?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const gapSizes = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

const marginSizes = {
  none: 0,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 60,
    flexShrink: 0,
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
};

export function PropertyRow({
  label,
  inline = false,
  gap = 'md',
  marginBottom = 'md',
  children,
}: PropertyRowProps): React.JSX.Element {
  const rowStyle: React.CSSProperties = {
    ...styles.row,
    gap: gapSizes[gap],
    marginBottom: marginSizes[marginBottom],
  };

  if (inline || !label) {
    // Inline mode: just render children in a row
    return <div style={rowStyle}>{children}</div>;
  }

  // Label mode: label on left, inputs on right
  return (
    <div style={rowStyle}>
      <span style={styles.label}>{label}</span>
      <div style={{ ...styles.inputContainer, gap: gapSizes[gap] }}>{children}</div>
    </div>
  );
}

/**
 * PropertyGroup
 *
 * Groups related property rows together.
 */
export interface PropertyGroupProps {
  /** Optional title for the group */
  title?: string;
  children: React.ReactNode;
}

export function PropertyGroup({ title, children }: PropertyGroupProps): React.JSX.Element {
  return (
    <div style={{ marginBottom: spacing.lg }}>
      {title ? (
        <div
          style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.semibold,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            marginBottom: spacing.md,
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * InputWrapper
 *
 * Wrapper for individual inputs with optional inline label.
 */
export interface InputWrapperProps {
  /** Inline label (e.g., "X", "W", "°") */
  label?: string;
  /** Label position */
  labelPosition?: 'left' | 'right';
  /** Fixed width (otherwise flex: 1) */
  width?: number | string;
  children: React.ReactNode;
}

export function InputWrapper({
  label,
  labelPosition = 'left',
  width,
  children,
}: InputWrapperProps): React.JSX.Element {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flex: width !== undefined ? 'none' : 1,
    width: width,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 14,
    textAlign: labelPosition === 'right' ? 'left' : 'right',
  };

  if (!label) {
    return <div style={containerStyle}>{children}</div>;
  }

  return (
    <div style={containerStyle}>
      {labelPosition === 'left' ? <span style={labelStyle}>{label}</span> : null}
      <div style={{ flex: 1 }}>{children}</div>
      {labelPosition === 'right' ? <span style={labelStyle}>{label}</span> : null}
    </div>
  );
}

export default PropertyRow;
