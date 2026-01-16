/**
 * useKeyboardShortcuts - Global keyboard shortcut handler
 *
 * NOTE: All shortcuts are defined in @/lib/utils/constants (KEYBOARD_SHORTCUTS).
 * To add, remove, or modify shortcuts, update constants.ts - DO NOT hardcode here.
 * This hook consumes KEYBOARD_SHORTCUTS as the single source of truth.
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect } from 'react';

import type { KeyboardShortcutDef } from '@/lib/utils/constants';

import { KEYBOARD_SHORTCUTS } from '@/lib/utils/constants';

const logger = createLogger('KeyboardShortcuts');

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
  /** Allow shortcut to trigger while typing in inputs/textareas (default: false) */
  allowInInput?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export interface UseKeyboardShortcutsReturn {
  registerShortcut: (shortcut: KeyboardShortcut) => void;
  unregisterShortcut: (key: string) => void;
  isEnabled: boolean;
}

/**
 * Hook for registering global keyboard shortcuts
 * Handles common shortcuts like Cmd+K, Cmd+/, Cmd+B, etc.
 */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions
): UseKeyboardShortcutsReturn {
  const { shortcuts, enabled = true } = options;

  const matchesShortcut = useCallback(
    (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
      // Check key match
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      if (!keyMatch) return false;

      // Check modifiers
      const isMac = navigator.userAgent.toUpperCase().includes('MAC');

      // cmd: Platform-aware command key (Cmd on Mac, Ctrl on Windows/Linux)
      if (shortcut.cmd) {
        const hasModifier = isMac ? event.metaKey : event.ctrlKey;
        if (!hasModifier) return false;
      }

      // ctrl: Literal Ctrl key on ALL platforms (even Mac)
      // This is separate from cmd for shortcuts like Ctrl+Shift+G
      if (shortcut.ctrl && !event.ctrlKey) return false;

      // Ensure we don't match if extra modifiers are pressed
      // (unless the shortcut expects them)
      if (!shortcut.cmd && !shortcut.ctrl) {
        // No command key expected - ensure neither is pressed
        if (isMac && event.metaKey) return false;
        if (event.ctrlKey) return false;
      }

      // Shift key
      if (shortcut.shift && !event.shiftKey) return false;
      if (!shortcut.shift && event.shiftKey) return false;

      // Alt key
      if (shortcut.alt && !event.altKey) return false;
      if (!shortcut.alt && event.altKey) return false;

      return true;
    },
    []
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (matchesShortcut(event, shortcut)) {
          // Skip shortcuts in input fields unless explicitly allowed
          // This prevents global shortcuts from hijacking typing (e.g., Cmd+K in input)
          if (isInput && shortcut.allowInInput !== true) {
            continue;
          }

          if (shortcut.preventDefault !== false) {
            event.preventDefault();
            event.stopPropagation();
          }

          shortcut.handler(event);
          break;
        }
      }
    },
    [enabled, shortcuts, matchesShortcut]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  const registerShortcut = useCallback((shortcut: KeyboardShortcut): void => {
    // This would require state management to dynamically add shortcuts
    // For now, shortcuts are passed in options - log the attempt for debugging
    logger.warn('Dynamic shortcut registration not implemented', { key: shortcut.key });
  }, []);

  const unregisterShortcut = useCallback((key: string): void => {
    // This would require state management to dynamically remove shortcuts
    logger.warn('Dynamic shortcut unregistration not implemented', { key });
  }, []);

  return {
    registerShortcut,
    unregisterShortcut,
    isEnabled: enabled,
  };
}

/**
 * Convert a KeyboardShortcutDef from constants to a KeyboardShortcut with handler
 */
function createShortcutHandler(def: KeyboardShortcutDef): KeyboardShortcut {
  const shortcut: KeyboardShortcut = {
    key: def.key,
    description: def.description,
    handler: (): void => {
      window.dispatchEvent(new CustomEvent(def.event));
    },
  };

  // Only add optional properties if they are defined
  if (def.cmd !== undefined) shortcut.cmd = def.cmd;
  if (def.ctrl !== undefined) shortcut.ctrl = def.ctrl;
  if (def.shift !== undefined) shortcut.shift = def.shift;
  if (def.alt !== undefined) shortcut.alt = def.alt;
  if (def.preventDefault !== undefined) shortcut.preventDefault = def.preventDefault;
  if (def.allowInInput !== undefined) shortcut.allowInInput = def.allowInInput;

  return shortcut;
}

/**
 * Default keyboard shortcuts for the application
 * Generated from KEYBOARD_SHORTCUTS constant (single source of truth)
 */
export const defaultShortcuts: KeyboardShortcut[] =
  Object.values(KEYBOARD_SHORTCUTS).map(createShortcutHandler);

/**
 * Hook that provides default keyboard shortcuts
 */
export function useDefaultKeyboardShortcuts(enabled?: boolean): UseKeyboardShortcutsReturn {
  return useKeyboardShortcuts({
    shortcuts: defaultShortcuts,
    enabled: enabled ?? true,
  });
}
