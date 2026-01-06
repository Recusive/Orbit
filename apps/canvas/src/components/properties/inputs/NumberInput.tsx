/**
 * NumberInput
 *
 * Number input with:
 * - Click-and-drag to scrub values
 * - Arrow keys for increment/decrement
 * - Shift+arrow for 10x step
 * - Optional slider binding
 * - Unit suffix display
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/designTokens';

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment (default: 1) */
  step?: number;
  /** Unit suffix (e.g., "px", "%", "°") */
  unit?: string;
  /** Placeholder when empty */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show slider */
  showSlider?: boolean;
  /** Precision (decimal places) */
  precision?: number;
  /** Allow empty/undefined values */
  allowEmpty?: boolean;
  /** Custom width */
  width?: number | string;
  /** Input label (inline, small) */
  label?: string;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    flex: 1,
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative' as const,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    marginRight: spacing.sm,
    minWidth: 14,
  },
  input: {
    width: '100%',
    height: 28,
    padding: `0 ${String(spacing.md)}px`,
    paddingRight: spacing.xl, // Room for unit
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    fontFamily: 'inherit',
    outline: 'none',
    transition: `all ${motion.fast} ${motion.ease}`,
    cursor: 'ew-resize', // Indicate scrubbing
  },
  inputFocused: {
    borderColor: 'var(--ring)',
    cursor: 'text',
  },
  inputDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  unit: {
    position: 'absolute' as const,
    right: spacing.md,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    pointerEvents: 'none' as const,
  },
  slider: {
    width: '100%',
    height: 4,
    marginTop: spacing.xs,
    appearance: 'none' as const,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.pill,
    outline: 'none',
    cursor: 'pointer',
  },
};

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  placeholder,
  disabled = false,
  showSlider = false,
  precision = 0,
  allowEmpty = false,
  width,
  label,
}: NumberInputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(formatValue(value, precision));
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; value: number } | null>(null);

  // Format value for display
  function formatValue(val: number, prec: number): string {
    if (isNaN(val)) return '';
    return prec > 0 ? val.toFixed(prec) : String(Math.round(val));
  }

  // Clamp value to min/max
  const clampValue = useCallback(
    (val: number): number => {
      let clamped = val;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      return clamped;
    },
    [min, max]
  );

  // Update display value when prop changes
  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatValue(value, precision));
    }
  }, [value, precision, isFocused]);

  // Handle text input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  // Commit value on blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      if (allowEmpty) {
        // Keep as is
      } else {
        setInputValue(formatValue(value, precision));
      }
    } else {
      const clamped = clampValue(parsed);
      onChange(clamped);
      setInputValue(formatValue(clamped, precision));
    }
  }, [inputValue, value, precision, allowEmpty, clampValue, onChange]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleBlur();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(formatValue(value, precision));
        setIsFocused(false);
        inputRef.current?.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const multiplier = e.shiftKey ? 10 : 1;
        const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier;
        const newValue = clampValue(value + delta);
        onChange(newValue);
      }
    },
    [value, step, precision, clampValue, onChange, handleBlur]
  );

  // Scrub-to-adjust: mouse down starts drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || isFocused) return;

      dragStartRef.current = { x: e.clientX, value };
      setIsDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (!dragStartRef.current) return;

        const delta = moveEvent.clientX - dragStartRef.current.x;
        const sensitivity = moveEvent.shiftKey ? 0.1 : 1;
        const newValue = clampValue(dragStartRef.current.value + delta * step * sensitivity);
        onChange(newValue);
      };

      const handleMouseUp = (): void => {
        setIsDragging(false);
        dragStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    [disabled, isFocused, value, step, clampValue, onChange]
  );

  // Handle slider change
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onChange(clampValue(newValue));
    },
    [clampValue, onChange]
  );

  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(width !== undefined ? { width, flex: 'none' } : {}),
  };

  const inputStyle: React.CSSProperties = {
    ...styles.input,
    ...(isFocused ? styles.inputFocused : {}),
    ...(disabled ? styles.inputDisabled : {}),
    ...(isDragging ? { cursor: 'ew-resize' } : {}),
  };

  return (
    <div style={containerStyle}>
      <div style={styles.inputWrapper}>
        {label ? <span style={styles.label}>{label}</span> : null}
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleChange}
            onFocus={() => {
              setIsFocused(true);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
            placeholder={placeholder}
            disabled={disabled}
            style={inputStyle}
          />
          {unit ? <span style={styles.unit}>{unit}</span> : null}
        </div>
      </div>

      {showSlider && min !== undefined && max !== undefined ? (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          style={styles.slider}
        />
      ) : null}
    </div>
  );
}

export default NumberInput;
