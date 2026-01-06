/**
 * EffectsSection
 *
 * Effects properties section containing:
 * - Drop shadows
 * - Inner shadows
 * - Layer blur
 * - Background blur
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight } from '../../../lib/designTokens';
import { ColorInput } from '../inputs/ColorInput';
import { NumberInput } from '../inputs/NumberInput';
import { AddRemoveControls, VisibilityToggle } from '../shared/AddRemoveControls';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { IconButton, IconButtonGroup } from '../shared/IconButton';
import { PropertyRow, InputWrapper } from '../shared/PropertyRow';

import type { Shadow, BlurEffect } from '../../../types/designNodeTypes';

export interface EffectsSectionProps {
  shadows: Shadow[];
  blur?: BlurEffect;
  onShadowsChange: (shadows: Shadow[]) => void;
  onBlurChange: (blur: BlurEffect | undefined) => void;
  disabled?: boolean;
}

// Icons
const EffectsIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <path
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      opacity="0.5"
    />
  </svg>
);

const DropShadowIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="12" height="12" rx="2" />
    <rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.2" />
  </svg>
);

const InnerShadowIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" opacity="0.2" />
  </svg>
);

const LayerBlurIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

const BackgroundBlurIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="2 2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  effectItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  effectHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  effectType: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
  },
  effectControls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  blurSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  blurHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blurTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  emptyState: {
    padding: spacing.lg,
    textAlign: 'center' as const,
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
  addMenu: {
    display: 'flex',
    gap: spacing.sm,
    padding: spacing.sm,
  },
};

const defaultShadow: Shadow = {
  type: 'drop',
  color: '#000000',
  x: 0,
  y: 4,
  blur: 8,
  spread: 0,
  opacity: 0.25,
};

export function EffectsSection({
  shadows,
  blur,
  onShadowsChange,
  onBlurChange,
  disabled = false,
}: EffectsSectionProps): React.JSX.Element {
  const [hiddenEffects, setHiddenEffects] = useState<Set<number>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Add shadow
  const handleAddShadow = useCallback(
    (type: 'drop' | 'inner') => {
      onShadowsChange([...shadows, { ...defaultShadow, type }]);
      setShowAddMenu(false);
    },
    [shadows, onShadowsChange]
  );

  // Remove shadow
  const handleRemoveShadow = useCallback(
    (index: number) => {
      onShadowsChange(shadows.filter((_, i) => i !== index));
      setHiddenEffects((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    },
    [shadows, onShadowsChange]
  );

  // Toggle effect visibility
  const handleToggleVisibility = useCallback((index: number) => {
    setHiddenEffects((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Update shadow
  const updateShadow = useCallback(
    (index: number, updates: Partial<Shadow>) => {
      const newShadows = shadows.map((s, i) => (i === index ? { ...s, ...updates } : s));
      onShadowsChange(newShadows);
    },
    [shadows, onShadowsChange]
  );

  // Add blur
  const handleAddBlur = useCallback(
    (type: 'layer' | 'background') => {
      onBlurChange({ type, radius: 8 });
      setShowAddMenu(false);
    },
    [onBlurChange]
  );

  // Remove blur
  const handleRemoveBlur = useCallback(() => {
    onBlurChange(undefined);
  }, [onBlurChange]);

  // Update blur
  const updateBlur = useCallback(
    (updates: Partial<BlurEffect>) => {
      if (blur) {
        onBlurChange({ ...blur, ...updates });
      }
    },
    [blur, onBlurChange]
  );

  // Preview for collapsed state
  const effectCount = shadows.length + (blur ? 1 : 0);
  const previewContent =
    effectCount > 0 ? (
      <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
        {effectCount} effect{effectCount !== 1 ? 's' : ''}
      </span>
    ) : undefined;

  return (
    <CollapsibleSection
      title="Effects"
      sectionId="effects"
      icon={<EffectsIcon />}
      defaultOpen={false}
      showAddButton
      onAdd={() => {
        setShowAddMenu(!showAddMenu);
      }}
      preview={previewContent}
    >
      <div style={styles.content}>
        {/* Add menu */}
        {showAddMenu ? (
          <div style={styles.addMenu}>
            <IconButtonGroup>
              <IconButton
                icon={<DropShadowIcon />}
                onClick={() => {
                  handleAddShadow('drop');
                }}
                disabled={disabled}
                title="Drop shadow"
                size="md"
              />
              <IconButton
                icon={<InnerShadowIcon />}
                onClick={() => {
                  handleAddShadow('inner');
                }}
                disabled={disabled}
                title="Inner shadow"
                size="md"
              />
              <IconButton
                icon={<LayerBlurIcon />}
                onClick={() => {
                  handleAddBlur('layer');
                }}
                disabled={disabled || blur !== undefined}
                title="Layer blur"
                size="md"
              />
              <IconButton
                icon={<BackgroundBlurIcon />}
                onClick={() => {
                  handleAddBlur('background');
                }}
                disabled={disabled || blur !== undefined}
                title="Background blur"
                size="md"
              />
            </IconButtonGroup>
          </div>
        ) : null}

        {/* Empty state */}
        {shadows.length === 0 && !blur && !showAddMenu ? (
          <div style={styles.emptyState}>No effects. Click + to add one.</div>
        ) : null}

        {/* Shadows */}
        {shadows.map((shadow, index) => (
          <div key={index} style={styles.effectItem}>
            <div style={styles.effectHeader}>
              <div style={styles.effectType}>
                {shadow.type === 'drop' ? <DropShadowIcon /> : <InnerShadowIcon />}
                <span>{shadow.type === 'drop' ? 'Drop Shadow' : 'Inner Shadow'}</span>
              </div>
              <div style={styles.effectControls}>
                <VisibilityToggle
                  visible={!hiddenEffects.has(index)}
                  onChange={() => {
                    handleToggleVisibility(index);
                  }}
                  disabled={disabled}
                />
                <AddRemoveControls
                  onRemove={() => {
                    handleRemoveShadow(index);
                  }}
                  canRemove={!disabled}
                />
              </div>
            </div>

            {/* Shadow controls */}
            <PropertyRow inline gap="sm" marginBottom="sm">
              <ColorInput
                color={shadow.color}
                opacity={shadow.opacity ?? 1}
                onColorChange={(color: string) => {
                  updateShadow(index, { color });
                }}
                onOpacityChange={(opacity) => {
                  updateShadow(index, { opacity });
                }}
                showOpacity
                disabled={disabled}
                compact
              />
            </PropertyRow>

            <PropertyRow inline gap="sm" marginBottom="none">
              <InputWrapper label="X">
                <NumberInput
                  value={shadow.x}
                  onChange={(x) => {
                    updateShadow(index, { x });
                  }}
                  disabled={disabled}
                />
              </InputWrapper>
              <InputWrapper label="Y">
                <NumberInput
                  value={shadow.y}
                  onChange={(y) => {
                    updateShadow(index, { y });
                  }}
                  disabled={disabled}
                />
              </InputWrapper>
              <InputWrapper label="Blur">
                <NumberInput
                  value={shadow.blur}
                  onChange={(blurVal) => {
                    updateShadow(index, { blur: blurVal });
                  }}
                  min={0}
                  disabled={disabled}
                />
              </InputWrapper>
              <InputWrapper label="Spread">
                <NumberInput
                  value={shadow.spread}
                  onChange={(spread) => {
                    updateShadow(index, { spread });
                  }}
                  disabled={disabled}
                />
              </InputWrapper>
            </PropertyRow>
          </div>
        ))}

        {/* Blur effect */}
        {blur ? (
          <div style={styles.blurSection}>
            <div style={styles.blurHeader}>
              <div style={styles.effectType}>
                {blur.type === 'layer' ? <LayerBlurIcon /> : <BackgroundBlurIcon />}
                <span>{blur.type === 'layer' ? 'Layer Blur' : 'Background Blur'}</span>
              </div>
              <AddRemoveControls onRemove={handleRemoveBlur} canRemove={!disabled} />
            </div>
            <PropertyRow inline gap="md" marginBottom="none">
              <InputWrapper label="Radius">
                <NumberInput
                  value={blur.radius}
                  onChange={(radius) => {
                    updateBlur({ radius });
                  }}
                  min={0}
                  max={100}
                  disabled={disabled}
                />
              </InputWrapper>
            </PropertyRow>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

export default EffectsSection;
