/**
 * PositionSection
 *
 * Position properties section containing:
 * - Alignment grid (6-point alignment)
 * - X/Y position inputs
 * - Rotation input with flip controls
 */

import React, { useCallback } from 'react';

import { spacing } from '../../../lib/design/designTokens';
import { AlignmentGrid } from '../inputs/AlignmentGrid';
import { FlipControls } from '../inputs/FlipControls';
import { NumberInput } from '../inputs/NumberInput';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { PropertyRow, InputWrapper } from '../shared/PropertyRow';

import type { HorizontalAlign, VerticalAlign } from '../inputs/AlignmentGrid';

export interface PositionSectionProps {
  x: number;
  y: number;
  rotation: number;
  onXChange: (x: number) => void;
  onYChange: (y: number) => void;
  onRotationChange: (rotation: number) => void;
  onAlign?: (horizontal: HorizontalAlign | null, vertical: VerticalAlign | null) => void;
  onDistribute?: (direction: 'horizontal' | 'vertical') => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
  disabled?: boolean;
}

// Icons
const PositionIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" opacity="0.5" />
  </svg>
);

const RotationIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M21 12a9 9 0 1 1-9-9" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
  },
  alignmentRow: {
    marginBottom: spacing.md,
  },
  positionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  rotationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  rotationInput: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  rotationIconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground)',
  },
};

export function PositionSection({
  x,
  y,
  rotation,
  onXChange,
  onYChange,
  onRotationChange,
  onAlign,
  onDistribute,
  onFlipHorizontal,
  onFlipVertical,
  disabled = false,
}: PositionSectionProps): React.JSX.Element {
  // Handle alignment
  const handleAlign = useCallback(
    (horizontal: HorizontalAlign | null, vertical: VerticalAlign | null) => {
      if (onAlign) {
        onAlign(horizontal, vertical);
      }
    },
    [onAlign]
  );

  // Handle distribute
  const handleDistribute = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (onDistribute) {
        onDistribute(direction);
      }
    },
    [onDistribute]
  );

  // Handle flip
  const handleFlipH = useCallback(() => {
    if (onFlipHorizontal) {
      onFlipHorizontal();
    }
  }, [onFlipHorizontal]);

  const handleFlipV = useCallback(() => {
    if (onFlipVertical) {
      onFlipVertical();
    }
  }, [onFlipVertical]);

  return (
    <CollapsibleSection
      title="Position"
      sectionId="position"
      icon={<PositionIcon />}
      defaultOpen={true}
    >
      <div style={styles.content}>
        {/* Alignment Grid */}
        {onAlign ? (
          <div style={styles.alignmentRow}>
            <AlignmentGrid
              onAlign={handleAlign}
              disabled={disabled}
              {...(onDistribute ? { onDistribute: handleDistribute } : {})}
            />
          </div>
        ) : null}

        {/* X/Y Position */}
        <PropertyRow inline gap="md" marginBottom="md">
          <InputWrapper label="X">
            <NumberInput value={x} onChange={onXChange} disabled={disabled} />
          </InputWrapper>
          <InputWrapper label="Y">
            <NumberInput value={y} onChange={onYChange} disabled={disabled} />
          </InputWrapper>
        </PropertyRow>

        {/* Rotation and Flip */}
        <div style={styles.rotationRow}>
          <div style={styles.rotationInput}>
            <span style={styles.rotationIconWrapper}>
              <RotationIcon />
            </span>
            <NumberInput
              value={rotation}
              onChange={onRotationChange}
              min={-360}
              max={360}
              unit="°"
              disabled={disabled}
            />
          </div>

          {/* Flip controls */}
          {onFlipHorizontal && onFlipVertical ? (
            <FlipControls
              onFlipHorizontal={handleFlipH}
              onFlipVertical={handleFlipV}
              disabled={disabled}
            />
          ) : null}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default PositionSection;
