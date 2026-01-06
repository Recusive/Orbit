/**
 * AlignmentGrid
 *
 * Alignment toolbar with:
 * - 6 alignment options (left, center, right, top, middle, bottom)
 * - Distribute spacing option
 */

import React, { useCallback } from 'react';

import { spacing, radii } from '../../../lib/designTokens';
import { IconButton, IconButtonGroup } from '../shared/IconButton';

export type HorizontalAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface AlignmentGridProps {
  onAlign: (horizontal: HorizontalAlign | null, vertical: VerticalAlign | null) => void;
  onDistribute?: (direction: 'horizontal' | 'vertical') => void;
  disabled?: boolean;
}

// Alignment icons
const AlignLeftIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="4" x2="4" y2="20" />
    <rect x="8" y="6" width="12" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="8" y="14" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const AlignCenterHIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="4" x2="12" y2="20" />
    <rect x="4" y="6" width="16" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="6" y="14" width="12" height="4" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const AlignRightIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="20" y1="4" x2="20" y2="20" />
    <rect x="4" y="6" width="12" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="8" y="14" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const AlignTopIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="4" x2="20" y2="4" />
    <rect x="6" y="8" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="14" y="8" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const AlignCenterVIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="12" x2="20" y2="12" />
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="14" y="6" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const AlignBottomIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="6" y="4" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="14" y="8" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const DistributeHIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="8" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="10" y="6" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="16" y="8" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const DistributeVIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="4" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="8" y="16" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    padding: spacing.xs,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'var(--border)',
    margin: `0 ${String(spacing.xs)}px`,
  },
};

export function AlignmentGrid({
  onAlign,
  onDistribute,
  disabled = false,
}: AlignmentGridProps): React.JSX.Element {
  const handleAlign = useCallback(
    (horizontal: HorizontalAlign | null, vertical: VerticalAlign | null) => {
      onAlign(horizontal, vertical);
    },
    [onAlign]
  );

  const handleDistribute = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (onDistribute) {
        onDistribute(direction);
      }
    },
    [onDistribute]
  );

  return (
    <div style={styles.container}>
      {/* Horizontal alignment group */}
      <IconButtonGroup>
        <IconButton
          icon={<AlignLeftIcon />}
          onClick={() => {
            handleAlign('left', null);
          }}
          disabled={disabled}
          title="Align left"
          size="sm"
        />
        <IconButton
          icon={<AlignCenterHIcon />}
          onClick={() => {
            handleAlign('center', null);
          }}
          disabled={disabled}
          title="Align center horizontally"
          size="sm"
        />
        <IconButton
          icon={<AlignRightIcon />}
          onClick={() => {
            handleAlign('right', null);
          }}
          disabled={disabled}
          title="Align right"
          size="sm"
        />
      </IconButtonGroup>

      {/* Vertical alignment group */}
      <IconButtonGroup>
        <IconButton
          icon={<AlignTopIcon />}
          onClick={() => {
            handleAlign(null, 'top');
          }}
          disabled={disabled}
          title="Align top"
          size="sm"
        />
        <IconButton
          icon={<AlignCenterVIcon />}
          onClick={() => {
            handleAlign(null, 'middle');
          }}
          disabled={disabled}
          title="Align center vertically"
          size="sm"
        />
        <IconButton
          icon={<AlignBottomIcon />}
          onClick={() => {
            handleAlign(null, 'bottom');
          }}
          disabled={disabled}
          title="Align bottom"
          size="sm"
        />
      </IconButtonGroup>

      {/* Distribute group (optional) */}
      {onDistribute ? (
        <IconButtonGroup>
          <IconButton
            icon={<DistributeHIcon />}
            onClick={() => {
              handleDistribute('horizontal');
            }}
            disabled={disabled}
            title="Distribute horizontal spacing"
            size="sm"
          />
          <IconButton
            icon={<DistributeVIcon />}
            onClick={() => {
              handleDistribute('vertical');
            }}
            disabled={disabled}
            title="Distribute vertical spacing"
            size="sm"
          />
        </IconButtonGroup>
      ) : null}
    </div>
  );
}

export default AlignmentGrid;
