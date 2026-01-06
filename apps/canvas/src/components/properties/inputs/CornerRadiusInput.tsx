/**
 * CornerRadiusInput
 *
 * Corner radius input with:
 * - Uniform radius input (all corners same)
 * - Toggle to individual corners mode
 * - Per-corner inputs when in individual mode
 */

import React, { useState, useCallback, useMemo } from 'react';

import { spacing, radii, fontSize, fontWeight } from '../../../lib/designTokens';
import { IconButton } from '../shared/IconButton';

import { NumberInput } from './NumberInput';

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface CornerRadiusInputProps {
  /** Uniform radius (when not in individual mode) */
  value: number | CornerRadii;
  /** Change handler */
  onChange: (value: number | CornerRadii) => void;
  /** Maximum radius */
  max?: number;
  /** Disabled state */
  disabled?: boolean;
}

// Icons
const UniformCornersIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M16 20h2a2 2 0 0 0 2-2v-2" />
  </svg>
);

const IndividualCornersIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M16 20h2a2 2 0 0 0 2-2v-2" />
    <circle cx="6" cy="6" r="1" fill="currentColor" />
    <circle cx="18" cy="6" r="1" fill="currentColor" />
    <circle cx="6" cy="18" r="1" fill="currentColor" />
    <circle cx="18" cy="18" r="1" fill="currentColor" />
  </svg>
);

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  uniformRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  individualGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  cornerLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    marginBottom: spacing.xs,
  },
  cornerInput: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
};

export function CornerRadiusInput({
  value,
  onChange,
  max = 999,
  disabled = false,
}: CornerRadiusInputProps): React.JSX.Element {
  // Determine if in individual mode
  const isIndividual = typeof value === 'object';

  // Toggle between modes
  const [showIndividual, setShowIndividual] = useState(isIndividual);

  // Get uniform value (or average if individual)
  const uniformValue = useMemo(() => {
    if (typeof value === 'number') return value;
    const { topLeft, topRight, bottomRight, bottomLeft } = value;
    // Check if all are the same
    if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
      return topLeft;
    }
    // Return average or first value
    return topLeft;
  }, [value]);

  // Get individual values
  const individualValues = useMemo((): CornerRadii => {
    if (typeof value === 'object') return value;
    return {
      topLeft: value,
      topRight: value,
      bottomRight: value,
      bottomLeft: value,
    };
  }, [value]);

  // Handle uniform change
  const handleUniformChange = useCallback(
    (newValue: number) => {
      onChange(newValue);
    },
    [onChange]
  );

  // Handle individual corner change
  const handleCornerChange = useCallback(
    (corner: keyof CornerRadii, newValue: number) => {
      const updated = { ...individualValues, [corner]: newValue };
      onChange(updated);
    },
    [individualValues, onChange]
  );

  // Toggle individual mode
  const handleToggleMode = useCallback(() => {
    const newShowIndividual = !showIndividual;
    setShowIndividual(newShowIndividual);

    if (newShowIndividual) {
      // Convert to individual (all same value)
      onChange({
        topLeft: uniformValue,
        topRight: uniformValue,
        bottomRight: uniformValue,
        bottomLeft: uniformValue,
      });
    } else {
      // Convert to uniform (use first/average value)
      onChange(uniformValue);
    }
  }, [showIndividual, uniformValue, onChange]);

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        {/* Main input row */}
        {!showIndividual ? (
          <div style={styles.uniformRow}>
            <NumberInput
              value={uniformValue}
              onChange={handleUniformChange}
              min={0}
              max={max}
              disabled={disabled}
            />
          </div>
        ) : (
          <div style={{ flex: 1, fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
            Individual corners
          </div>
        )}

        {/* Toggle button */}
        <IconButton
          icon={showIndividual ? <IndividualCornersIcon /> : <UniformCornersIcon />}
          onClick={handleToggleMode}
          isActive={showIndividual}
          disabled={disabled}
          title={showIndividual ? 'Use uniform radius' : 'Set individual corners'}
          size="md"
        />
      </div>

      {/* Individual corners grid */}
      {showIndividual ? (
        <div style={styles.individualGrid}>
          <div style={styles.cornerInput}>
            <span style={styles.cornerLabel}>Top Left</span>
            <NumberInput
              value={individualValues.topLeft}
              onChange={(v) => {
                handleCornerChange('topLeft', v);
              }}
              min={0}
              max={max}
              disabled={disabled}
            />
          </div>
          <div style={styles.cornerInput}>
            <span style={styles.cornerLabel}>Top Right</span>
            <NumberInput
              value={individualValues.topRight}
              onChange={(v) => {
                handleCornerChange('topRight', v);
              }}
              min={0}
              max={max}
              disabled={disabled}
            />
          </div>
          <div style={styles.cornerInput}>
            <span style={styles.cornerLabel}>Bottom Left</span>
            <NumberInput
              value={individualValues.bottomLeft}
              onChange={(v) => {
                handleCornerChange('bottomLeft', v);
              }}
              min={0}
              max={max}
              disabled={disabled}
            />
          </div>
          <div style={styles.cornerInput}>
            <span style={styles.cornerLabel}>Bottom Right</span>
            <NumberInput
              value={individualValues.bottomRight}
              onChange={(v) => {
                handleCornerChange('bottomRight', v);
              }}
              min={0}
              max={max}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CornerRadiusInput;
