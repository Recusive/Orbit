/**
 * AddRemoveControls
 *
 * [+] [-] buttons for multi-value properties (fills, strokes, effects).
 * Used in section headers and item rows.
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, motion } from '../../../lib/design/designTokens';

export interface AddRemoveControlsProps {
  onAdd?: () => void;
  onRemove?: () => void;
  canAdd?: boolean;
  canRemove?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
}

const PlusIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MinusIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface ControlButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  compact?: boolean;
}

function ControlButton({
  icon,
  onClick,
  disabled,
  title,
  compact,
}: ControlButtonProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled && onClick) {
        onClick();
      }
    },
    [disabled, onClick]
  );

  const size = compact ? 16 : 20;

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    padding: 0,
    border: 'none',
    borderRadius: radii.xs,
    backgroundColor: isHovered && !disabled ? 'var(--accent)' : 'transparent',
    color: disabled
      ? 'var(--muted-foreground)'
      : isHovered
        ? 'var(--foreground)'
        : 'var(--muted-foreground)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: `all ${motion.fast} ${motion.ease}`,
    flexShrink: 0,
  };

  return (
    <button
      type="button"
      style={style}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      disabled={disabled}
      title={title}
    >
      {icon}
    </button>
  );
}

export function AddRemoveControls({
  onAdd,
  onRemove,
  canAdd = true,
  canRemove = true,
  compact = false,
}: AddRemoveControlsProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 0 : spacing.xs,
      }}
    >
      {onRemove !== undefined ? (
        <ControlButton
          icon={<MinusIcon />}
          onClick={onRemove}
          disabled={!canRemove}
          title="Remove"
          compact={compact}
        />
      ) : null}
      {onAdd !== undefined ? (
        <ControlButton
          icon={<PlusIcon />}
          onClick={onAdd}
          disabled={!canAdd}
          title="Add"
          compact={compact}
        />
      ) : null}
    </div>
  );
}

/**
 * VisibilityToggle
 *
 * Eye icon button for toggling visibility of fills/strokes/effects.
 */
export interface VisibilityToggleProps {
  visible: boolean;
  onChange: (visible: boolean) => void;
  disabled?: boolean;
}

const EyeIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function VisibilityToggle({
  visible,
  onChange,
  disabled,
}: VisibilityToggleProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled) {
        onChange(!visible);
      }
    },
    [visible, onChange, disabled]
  );

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    padding: 0,
    border: 'none',
    borderRadius: radii.xs,
    backgroundColor: isHovered && !disabled ? 'var(--accent)' : 'transparent',
    color: visible ? 'var(--foreground)' : 'var(--muted-foreground)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : visible ? 1 : 0.5,
    transition: `all ${motion.fast} ${motion.ease}`,
    flexShrink: 0,
  };

  return (
    <button
      type="button"
      style={style}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      disabled={disabled}
      title={visible ? 'Hide' : 'Show'}
    >
      {visible ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  );
}

export default AddRemoveControls;
