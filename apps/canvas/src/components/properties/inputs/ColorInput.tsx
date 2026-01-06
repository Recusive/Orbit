/**
 * ColorInput
 *
 * Color input with:
 * - Color swatch (clickable for picker)
 * - Hex input field
 * - Opacity percentage input
 * - Optional eyedropper button
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/designTokens';

export interface ColorInputProps {
  /** Hex color value (e.g., "#FF0000") */
  color: string;
  /** Opacity 0-1 */
  opacity?: number;
  /** Color change handler */
  onColorChange: (color: string) => void;
  /** Opacity change handler */
  onOpacityChange?: (opacity: number) => void;
  /** Show opacity input */
  showOpacity?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode (swatch only) */
  compact?: boolean;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  swatchContainer: {
    position: 'relative' as const,
    flexShrink: 0,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  swatchHover: {
    borderColor: 'var(--ring)',
    transform: 'scale(1.05)',
  },
  swatchInner: {
    width: '100%',
    height: '100%',
  },
  colorPicker: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
  hexInput: {
    flex: 1,
    height: 28,
    padding: `0 ${String(spacing.md)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    fontFamily: 'monospace',
    textTransform: 'uppercase' as const,
    outline: 'none',
    transition: `all ${motion.fast} ${motion.ease}`,
    minWidth: 70,
  },
  hexInputFocused: {
    borderColor: 'var(--ring)',
  },
  opacityContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  opacityInput: {
    width: 45,
    height: 28,
    padding: `0 ${String(spacing.sm)}px`,
    paddingRight: spacing.lg,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    textAlign: 'right' as const,
    outline: 'none',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  opacityInputFocused: {
    borderColor: 'var(--ring)',
  },
  opacityUnit: {
    position: 'absolute' as const,
    right: spacing.sm,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    pointerEvents: 'none' as const,
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
};

// Checkerboard pattern for transparent colors
const checkerboardPattern = `
	linear-gradient(45deg, #ccc 25%, transparent 25%),
	linear-gradient(-45deg, #ccc 25%, transparent 25%),
	linear-gradient(45deg, transparent 75%, #ccc 75%),
	linear-gradient(-45deg, transparent 75%, #ccc 75%)
`;

export function ColorInput({
  color,
  opacity = 1,
  onColorChange,
  onOpacityChange,
  showOpacity = true,
  disabled = false,
  compact = false,
}: ColorInputProps): React.JSX.Element {
  const [hexValue, setHexValue] = useState(color.replace('#', '').toUpperCase());
  const [opacityValue, setOpacityValue] = useState(String(Math.round(opacity * 100)));
  const [isHexFocused, setIsHexFocused] = useState(false);
  const [isOpacityFocused, setIsOpacityFocused] = useState(false);
  const [isSwatchHovered, setIsSwatchHovered] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Update local state when props change
  useEffect(() => {
    if (!isHexFocused) {
      setHexValue(color.replace('#', '').toUpperCase());
    }
  }, [color, isHexFocused]);

  useEffect(() => {
    if (!isOpacityFocused) {
      setOpacityValue(String(Math.round(opacity * 100)));
    }
  }, [opacity, isOpacityFocused]);

  // Handle native color picker change
  const handleColorPickerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newColor = e.target.value;
      setHexValue(newColor.replace('#', '').toUpperCase());
      onColorChange(newColor);
    },
    [onColorChange]
  );

  // Handle hex input change
  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    setHexValue(value.slice(0, 6));
  }, []);

  // Commit hex value on blur
  const handleHexBlur = useCallback(() => {
    setIsHexFocused(false);
    let finalValue = hexValue;

    // Pad short values
    if (finalValue.length === 3) {
      finalValue = finalValue
        .split('')
        .map((c) => c + c)
        .join('');
    }

    // Validate and commit
    if (/^[0-9A-Fa-f]{6}$/.test(finalValue)) {
      onColorChange(`#${finalValue}`);
    } else {
      setHexValue(color.replace('#', '').toUpperCase());
    }
  }, [hexValue, color, onColorChange]);

  // Handle opacity input change
  const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setOpacityValue(value);
  }, []);

  // Commit opacity value on blur
  const handleOpacityBlur = useCallback(() => {
    setIsOpacityFocused(false);
    let parsed = parseInt(opacityValue, 10);

    if (isNaN(parsed)) parsed = 100;
    parsed = Math.max(0, Math.min(100, parsed));

    setOpacityValue(String(parsed));
    if (onOpacityChange) {
      onOpacityChange(parsed / 100);
    }
  }, [opacityValue, onOpacityChange]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent, onBlur: () => void) => {
    if (e.key === 'Enter') {
      onBlur();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  // Open color picker on swatch click
  const handleSwatchClick = useCallback(() => {
    colorInputRef.current?.click();
  }, []);

  // Compute swatch color with opacity
  const swatchColor =
    opacity < 1
      ? `${color}${Math.round(opacity * 255)
          .toString(16)
          .padStart(2, '0')}`
      : color;

  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(disabled ? styles.disabled : {}),
  };

  if (compact) {
    // Compact mode: swatch only
    return (
      <div style={containerStyle}>
        <div
          style={styles.swatchContainer}
          onMouseEnter={() => {
            setIsSwatchHovered(true);
          }}
          onMouseLeave={() => {
            setIsSwatchHovered(false);
          }}
        >
          <div
            style={{
              ...styles.swatch,
              ...(isSwatchHovered ? styles.swatchHover : {}),
              backgroundImage: checkerboardPattern,
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            }}
            onClick={handleSwatchClick}
          >
            <div style={{ ...styles.swatchInner, backgroundColor: swatchColor }} />
          </div>
          <input
            ref={colorInputRef}
            type="color"
            value={color}
            onChange={handleColorPickerChange}
            style={styles.colorPicker}
            disabled={disabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Color swatch with picker */}
      <div
        style={styles.swatchContainer}
        onMouseEnter={() => {
          setIsSwatchHovered(true);
        }}
        onMouseLeave={() => {
          setIsSwatchHovered(false);
        }}
      >
        <div
          style={{
            ...styles.swatch,
            ...(isSwatchHovered ? styles.swatchHover : {}),
            backgroundImage: checkerboardPattern,
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
          }}
          onClick={handleSwatchClick}
        >
          <div style={{ ...styles.swatchInner, backgroundColor: swatchColor }} />
        </div>
        <input
          ref={colorInputRef}
          type="color"
          value={color}
          onChange={handleColorPickerChange}
          style={styles.colorPicker}
          disabled={disabled}
        />
      </div>

      {/* Hex input */}
      <input
        type="text"
        value={hexValue}
        onChange={handleHexChange}
        onFocus={() => {
          setIsHexFocused(true);
        }}
        onBlur={handleHexBlur}
        onKeyDown={(e) => {
          handleKeyDown(e, handleHexBlur);
        }}
        placeholder="FFFFFF"
        disabled={disabled}
        style={{
          ...styles.hexInput,
          ...(isHexFocused ? styles.hexInputFocused : {}),
        }}
      />

      {/* Opacity input */}
      {showOpacity && onOpacityChange ? (
        <div style={{ ...styles.opacityContainer, position: 'relative' }}>
          <input
            type="text"
            inputMode="numeric"
            value={opacityValue}
            onChange={handleOpacityChange}
            onFocus={() => {
              setIsOpacityFocused(true);
            }}
            onBlur={handleOpacityBlur}
            onKeyDown={(e) => {
              handleKeyDown(e, handleOpacityBlur);
            }}
            disabled={disabled}
            style={{
              ...styles.opacityInput,
              ...(isOpacityFocused ? styles.opacityInputFocused : {}),
            }}
          />
          <span style={styles.opacityUnit}>%</span>
        </div>
      ) : null}
    </div>
  );
}

export default ColorInput;
