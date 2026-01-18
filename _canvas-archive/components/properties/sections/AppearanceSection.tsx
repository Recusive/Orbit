/**
 * AppearanceSection
 *
 * Appearance properties section containing:
 * - Opacity slider
 * - Corner radius (uniform + individual)
 * - Blend mode dropdown
 */

import React, { useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/design/designTokens';
import { CornerRadiusInput } from '../inputs/CornerRadiusInput';
import { NumberInput } from '../inputs/NumberInput';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { PropertyRow, InputWrapper } from '../shared/PropertyRow';

import type { CornerRadii } from '../inputs/CornerRadiusInput';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface AppearanceSectionProps {
  opacity: number; // 0-1
  cornerRadius: number | CornerRadii;
  blendMode?: BlendMode;
  onOpacityChange: (opacity: number) => void;
  onCornerRadiusChange: (radius: number | CornerRadii) => void;
  onBlendModeChange?: (mode: BlendMode) => void;
  disabled?: boolean;
}

// Icons
const AppearanceIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" opacity="0.3" />
  </svg>
);

const blendModeOptions: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
  },
  opacityRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  opacitySlider: {
    width: '100%',
    height: 4,
    appearance: 'none' as const,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.pill,
    outline: 'none',
    cursor: 'pointer',
  },
  cornerRadiusRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  blendModeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 50,
  },
  select: {
    flex: 1,
    height: 28,
    padding: `0 ${String(spacing.md)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
};

export function AppearanceSection({
  opacity,
  cornerRadius,
  blendMode = 'normal',
  onOpacityChange,
  onCornerRadiusChange,
  onBlendModeChange,
  disabled = false,
}: AppearanceSectionProps): React.JSX.Element {
  // Handle opacity change from slider
  const handleOpacitySliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onOpacityChange(parseFloat(e.target.value) / 100);
    },
    [onOpacityChange]
  );

  // Handle opacity change from input
  const handleOpacityInputChange = useCallback(
    (value: number) => {
      onOpacityChange(Math.max(0, Math.min(100, value)) / 100);
    },
    [onOpacityChange]
  );

  // Handle blend mode change
  const handleBlendModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (onBlendModeChange) {
        onBlendModeChange(e.target.value as BlendMode);
      }
    },
    [onBlendModeChange]
  );

  // Preview for collapsed state
  const opacityPercent = Math.round(opacity * 100);
  const previewText = opacityPercent < 100 ? `${String(opacityPercent)}%` : '';

  return (
    <CollapsibleSection
      title="Appearance"
      sectionId="appearance"
      icon={<AppearanceIcon />}
      defaultOpen={false}
      preview={
        previewText ? (
          <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
            {previewText}
          </span>
        ) : undefined
      }
    >
      <div style={styles.content}>
        {/* Opacity */}
        <div style={styles.opacityRow}>
          <PropertyRow inline gap="md" marginBottom="none">
            <InputWrapper label="Opacity">
              <NumberInput
                value={Math.round(opacity * 100)}
                onChange={handleOpacityInputChange}
                min={0}
                max={100}
                unit="%"
                disabled={disabled}
              />
            </InputWrapper>
          </PropertyRow>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={handleOpacitySliderChange}
            disabled={disabled}
            style={styles.opacitySlider}
          />
        </div>

        {/* Corner Radius */}
        <div style={styles.cornerRadiusRow}>
          <span style={styles.label}>Corners</span>
          <CornerRadiusInput
            value={cornerRadius}
            onChange={onCornerRadiusChange}
            disabled={disabled}
          />
        </div>

        {/* Blend Mode */}
        {onBlendModeChange ? (
          <div style={styles.blendModeRow}>
            <span style={styles.label}>Blend</span>
            <select
              value={blendMode}
              onChange={handleBlendModeChange}
              disabled={disabled}
              style={styles.select}
            >
              {blendModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

export default AppearanceSection;
