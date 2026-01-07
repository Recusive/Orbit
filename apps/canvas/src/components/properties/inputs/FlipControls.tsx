/**
 * FlipControls
 *
 * Horizontal and vertical flip buttons.
 */

import React, { useCallback } from 'react';

import { IconButton, IconButtonGroup } from '../shared/IconButton';

export interface FlipControlsProps {
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  disabled?: boolean;
}

// Flip icons
const FlipHorizontalIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M12 3v18" strokeDasharray="2 2" />
    <path d="M16 7l4 5-4 5" />
    <path d="M8 7l-4 5 4 5" />
  </svg>
);

const FlipVerticalIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M3 12h18" strokeDasharray="2 2" />
    <path d="M7 8l5-4 5 4" />
    <path d="M7 16l5 4 5-4" />
  </svg>
);

export function FlipControls({
  onFlipHorizontal,
  onFlipVertical,
  disabled = false,
}: FlipControlsProps): React.JSX.Element {
  const handleFlipH = useCallback(() => {
    onFlipHorizontal();
  }, [onFlipHorizontal]);

  const handleFlipV = useCallback(() => {
    onFlipVertical();
  }, [onFlipVertical]);

  return (
    <IconButtonGroup>
      <IconButton
        icon={<FlipHorizontalIcon />}
        onClick={handleFlipH}
        disabled={disabled}
        title="Flip horizontal"
        size="sm"
      />
      <IconButton
        icon={<FlipVerticalIcon />}
        onClick={handleFlipV}
        disabled={disabled}
        title="Flip vertical"
        size="sm"
      />
    </IconButtonGroup>
  );
}

export default FlipControls;
