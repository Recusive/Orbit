import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
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

      // Cmd key (Mac) or Ctrl key (Windows/Linux)
      const cmdOrCtrl = shortcut.cmd ?? shortcut.ctrl;
      if (cmdOrCtrl) {
        const hasModifier = isMac ? event.metaKey : event.ctrlKey;
        if (!hasModifier) return false;
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
          // Allow shortcuts in input fields if explicitly configured
          if (isInput && !shortcut.preventDefault) {
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

  const registerShortcut = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_shortcut: KeyboardShortcut): void => {
      // This would require state management to dynamically add shortcuts
      // For now, shortcuts are passed in options
      console.warn('Dynamic shortcut registration not implemented');
    },
    []
  );

  const unregisterShortcut = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_key: string): void => {
      // This would require state management to dynamically remove shortcuts
      console.warn('Dynamic shortcut unregistration not implemented');
    },
    []
  );

  return {
    registerShortcut,
    unregisterShortcut,
    isEnabled: enabled,
  };
}

/**
 * Default keyboard shortcuts for the application
 */
export const defaultShortcuts: KeyboardShortcut[] = [
  {
    key: 'k',
    cmd: true,
    description: 'Open command palette',
    handler: (): void => {
      // Dispatch custom event for command palette
      window.dispatchEvent(new CustomEvent('openCommandPalette'));
    },
  },
  {
    key: ',',
    cmd: true,
    description: 'Open settings',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('openSettings'));
    },
  },
  {
    key: '/',
    cmd: true,
    description: 'Toggle sidebar',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('toggleLeftSidebar'));
    },
  },
  {
    key: '.',
    cmd: true,
    description: 'Toggle left sidebar',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('toggleLeftSidebar'));
    },
  },
  {
    key: 'b',
    cmd: true,
    description: 'Toggle file browser',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('toggleFileBrowser'));
    },
  },
  {
    key: 'j',
    cmd: true,
    description: 'Toggle terminal',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('toggleTerminal'));
    },
  },
  {
    key: 'p',
    cmd: true,
    description: 'Quick open file',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('quickOpenFile'));
    },
  },
  {
    key: 's',
    cmd: true,
    description: 'Save current file',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('saveFile'));
    },
  },
  {
    key: 's',
    cmd: true,
    shift: true,
    description: 'Save all files',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('saveAllFiles'));
    },
  },
  {
    key: 'w',
    cmd: true,
    description: 'Close current file',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('closeFile'));
    },
  },
  {
    key: 'Enter',
    cmd: true,
    description: 'Start agent task',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('startAgentTask'));
    },
  },
  {
    key: 'Escape',
    description: 'Cancel/Close',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('cancel'));
    },
    preventDefault: false,
  },
  {
    key: 'g',
    cmd: true,
    description: 'Go to line',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('goToLine'));
    },
  },
  {
    key: 'f',
    cmd: true,
    description: 'Find in file',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('findInFile'));
    },
  },
  {
    key: 'f',
    cmd: true,
    shift: true,
    description: 'Find in workspace',
    handler: (): void => {
      window.dispatchEvent(new CustomEvent('findInWorkspace'));
    },
  },
  {
    key: 'z',
    cmd: true,
    description: 'Undo',
    handler: (): void => {
      // Browser default, no custom handling needed
    },
    preventDefault: false,
  },
  {
    key: 'z',
    cmd: true,
    shift: true,
    description: 'Redo',
    handler: (): void => {
      // Browser default, no custom handling needed
    },
    preventDefault: false,
  },
];

/**
 * Hook that provides default keyboard shortcuts
 */
export function useDefaultKeyboardShortcuts(enabled?: boolean): UseKeyboardShortcutsReturn {
  return useKeyboardShortcuts({
    shortcuts: defaultShortcuts,
    enabled: enabled ?? true,
  });
}
