/**
 * Hook for canvas keyboard shortcuts
 * Centralizes all keyboard event handling
 *
 * IMPORTANT: This uses document.activeElement to reliably detect
 * when the user is typing in an input field.
 */
import { useEffect, useCallback } from 'react';

import type { Node } from '@xyflow/react';

// Detect Mac for keyboard shortcuts
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC');

/**
 * Check if the user is currently in an editable field
 * Uses document.activeElement which is more reliable than e.target
 */
function isInEditableField(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toUpperCase();

  // Check for standard form elements
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  // Check for contentEditable elements
  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    return true;
  }

  // Check for elements with role="textbox"
  if (activeElement.getAttribute('role') === 'textbox') {
    return true;
  }

  return false;
}

export interface UseCanvasShortcutsOptions {
  // Modal state setters
  setShowComponentMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCommandPalette: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setContextMenu: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; position: { x: number; y: number } }>
  >;

  // Node operations
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  handleDeleteSelected: () => void;
  handleDuplicateSelected: () => void;
  handleCopySelected: () => void;
  handlePaste: () => void;
  handleExportSelected: () => void;
}

export function useCanvasShortcuts({
  setShowComponentMenu,
  setShowCommandPalette,
  setShowShortcutsHelp,
  setContextMenu,
  setNodes,
  handleDeleteSelected,
  handleDuplicateSelected,
  handleCopySelected,
  handlePaste,
  handleExportSelected,
}: UseCanvasShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isModKey = isMac ? e.metaKey : e.ctrlKey;
      const isEditing = isInEditableField();

      // =================================================================
      // GLOBAL SHORTCUTS (work even when typing)
      // =================================================================

      // Command Palette (Cmd/Ctrl + K)
      if (isModKey && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      // Escape - close all modals/menus
      if (e.key === 'Escape') {
        setShowComponentMenu(false);
        setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
        setShowCommandPalette(false);
        setShowShortcutsHelp(false);
        // Don't preventDefault - let inputs handle Escape too
        return;
      }

      // =================================================================
      // SHORTCUTS THAT SHOULD NOT WORK WHEN TYPING
      // =================================================================

      // If user is in an editable field, don't handle these shortcuts
      // Let the native input behavior take over
      if (isEditing) {
        return;
      }

      // Shortcuts Help (Shift + ?)
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShowShortcutsHelp(true);
        return;
      }

      // Delete (Del or Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Duplicate (Cmd/Ctrl + D)
      if (isModKey && e.key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      // Copy (Cmd/Ctrl + C)
      if (isModKey && e.key === 'c') {
        e.preventDefault();
        handleCopySelected();
        return;
      }

      // Paste (Cmd/Ctrl + V)
      if (isModKey && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Export (Cmd/Ctrl + E)
      if (isModKey && e.key === 'e') {
        e.preventDefault();
        handleExportSelected();
        return;
      }

      // Select All (Cmd/Ctrl + A)
      if (isModKey && e.key === 'a') {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }
    },
    [
      setShowComponentMenu,
      setShowCommandPalette,
      setShowShortcutsHelp,
      setContextMenu,
      setNodes,
      handleDeleteSelected,
      handleDuplicateSelected,
      handleCopySelected,
      handlePaste,
      handleExportSelected,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
