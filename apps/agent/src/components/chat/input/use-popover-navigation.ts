import { useCallback, useEffect, useState } from 'react';

import type { PopoverNavigationState } from './types';

/**
 * Hook to manage mention and slash command popover state
 * Handles open/close state, query text, and selected index
 */
export function usePopoverNavigation(): PopoverNavigationState {
  // Mention popover state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  // Slash command popover state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // Thinking mode hover state
  const [thinkingHoverOpen, setThinkingHoverOpen] = useState(false);

  // Effort level hover state (Opus 4.6)
  const [effortHoverOpen, setEffortHoverOpen] = useState(false);

  // Reset selection index when mention query changes
  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionQuery]);

  // Reset selection index when slash query changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashQuery]);

  // Close mention popover and reset state
  const closeMentionPopover = useCallback((): void => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionSelectedIndex(0);
  }, []);

  // Close slash popover and reset state
  const closeSlashPopover = useCallback((): void => {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashSelectedIndex(0);
  }, []);

  return {
    // Mention
    mentionOpen,
    setMentionOpen,
    mentionQuery,
    setMentionQuery,
    mentionSelectedIndex,
    setMentionSelectedIndex,
    // Slash
    slashOpen,
    setSlashOpen,
    slashQuery,
    setSlashQuery,
    slashSelectedIndex,
    setSlashSelectedIndex,
    // Thinking hover
    thinkingHoverOpen,
    setThinkingHoverOpen,
    // Effort hover
    effortHoverOpen,
    setEffortHoverOpen,
    // Actions
    closeMentionPopover,
    closeSlashPopover,
  };
}

/**
 * Keyboard navigation helper for popovers
 * Returns handlers for arrow keys, escape, and enter
 */
export interface PopoverKeyboardConfig {
  readonly itemCount: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}

export function handlePopoverKeyDown(
  e: React.KeyboardEvent,
  config: PopoverKeyboardConfig
): boolean {
  const { itemCount, setSelectedIndex, onSelect, onClose } = config;

  if (e.key === 'Escape') {
    e.preventDefault();
    onClose();
    return true;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSelectedIndex((prev) => (prev + 1) % Math.max(1, itemCount));
    return true;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSelectedIndex((prev) => (prev - 1 + itemCount) % Math.max(1, itemCount));
    return true;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSelect();
    return true;
  }

  return false;
}
