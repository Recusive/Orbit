/**
 * IconButton
 *
 * Compact toolbar-style button for property panel actions.
 * Supports:
 * - Active/toggle state
 * - Disabled state
 * - Tooltip
 * - Size variants
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, motion } from '../../../lib/design/designTokens';

export interface IconButtonProps {
  /** Icon content */
  icon: React.ReactNode;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Active/toggled state */
  isActive?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Tooltip text */
  title?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom styles */
  style?: React.CSSProperties;
  /** Additional class name */
  className?: string;
}

const sizes = {
  sm: 20,
  md: 24,
  lg: 28,
};

const iconSizes = {
  sm: 12,
  md: 14,
  lg: 16,
};

export function IconButton({
  icon,
  onClick,
  isActive = false,
  disabled = false,
  title,
  size = 'md',
  style,
  className,
}: IconButtonProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || !onClick) return;
      onClick(e);
    },
    [disabled, onClick]
  );

  const buttonSize = sizes[size];
  // iconSize reserved for future SVG scaling
  void iconSizes[size];

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: buttonSize,
    height: buttonSize,
    padding: 0,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `all ${motion.fast} ${motion.ease}`,
    flexShrink: 0,
    ...style,
  };

  // Apply states
  let finalStyle = { ...baseStyle };

  if (isActive) {
    finalStyle = {
      ...finalStyle,
      backgroundColor: 'var(--accent)',
      color: 'var(--primary)',
    };
  }

  if (isHovered && !disabled) {
    finalStyle = {
      ...finalStyle,
      backgroundColor: isActive ? 'var(--accent)' : 'var(--muted)',
      color: 'var(--foreground)',
    };
  }

  if (isPressed && !disabled) {
    finalStyle = {
      ...finalStyle,
      transform: 'scale(0.95)',
    };
  }

  return (
    <button
      type="button"
      style={finalStyle}
      className={className}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => {
        setIsPressed(true);
      }}
      onMouseUp={() => {
        setIsPressed(false);
      }}
      disabled={disabled}
      title={title}
    >
      {icon}
    </button>
  );
}

/**
 * IconButtonGroup
 *
 * Groups related icon buttons together with shared border.
 */
export interface IconButtonGroupProps {
  children: React.ReactNode;
  /** Gap between buttons */
  gap?: number;
  /** Show dividers between buttons */
  divided?: boolean;
}

export function IconButtonGroup({
  children,
  gap = 0,
  divided = false,
}: IconButtonGroupProps): React.JSX.Element {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap,
    padding: spacing.xs,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  };

  if (divided) {
    // Add dividers between children
    const childArray = React.Children.toArray(children);
    return (
      <div style={style}>
        {childArray.map((child, index) => (
          <React.Fragment key={index}>
            {child}
            {index < childArray.length - 1 ? (
              <div
                style={{
                  width: 1,
                  height: 16,
                  backgroundColor: 'var(--border)',
                  margin: `0 ${String(spacing.xs)}px`,
                }}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <div style={style}>{children}</div>;
}

export default IconButton;
