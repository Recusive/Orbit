/**
 * ButtonGroup Component
 *
 * A container that groups related buttons together with consistent styling.
 * Based on shadcn/ui button-group pattern.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  children: React.ReactNode;
}

export interface ButtonGroupSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    padding: 2,
    backgroundColor: 'var(--muted)',
    borderRadius: 4,
  } as React.CSSProperties,
  groupVertical: {
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  separator: {
    width: 1,
    height: 12,
    backgroundColor: 'var(--border)',
    margin: '0 2px',
    flexShrink: 0,
  } as React.CSSProperties,
  separatorVertical: {
    width: 16,
    height: 1,
    margin: '2px 0',
  } as React.CSSProperties,
};

// =============================================================================
// COMPONENTS
// =============================================================================

export function ButtonGroup({
  orientation = 'horizontal',
  children,
  style,
  ...props
}: ButtonGroupProps): React.JSX.Element {
  return (
    <div
      role="group"
      style={{
        ...styles.group,
        ...(orientation === 'vertical' ? styles.groupVertical : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function ButtonGroupSeparator({
  orientation = 'vertical',
  style,
  ...props
}: ButtonGroupSeparatorProps): React.JSX.Element {
  return (
    <div
      style={{
        ...styles.separator,
        ...(orientation === 'horizontal' ? styles.separatorVertical : {}),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}

export default ButtonGroup;
