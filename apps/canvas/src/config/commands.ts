/**
 * Command palette commands configuration
 * Factory functions to create commands with action handlers
 */
import type { Command } from '../components/CommandPalette';
import type { Node } from '@xyflow/react';

// Detect Mac for keyboard shortcuts
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC');
export const modKey = isMac ? 'Cmd' : 'Ctrl';

export interface CommandActions {
  handleAddNode: (componentType: string, position?: { x: number; y: number }) => void;
  handleAddPage: (name?: string) => void;
  handleDuplicateSelected: () => void;
  handleDeleteSelected: () => void;
  handleCopySelected: () => void;
  handlePaste: () => void;
  handleExportSelected: () => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setShowComponentMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Create command palette commands
 */
export function createCommands(actions: CommandActions): Command[] {
  const {
    handleAddNode,
    handleAddPage,
    handleDuplicateSelected,
    handleDeleteSelected,
    handleCopySelected,
    handlePaste,
    setNodes,
    setShowComponentMenu,
    setMenuPosition,
    setShowShortcutsHelp,
  } = actions;

  return [
    // Create commands
    {
      id: 'create-button',
      label: 'Add Button',
      description: 'Insert a new button component',
      category: 'create',
      keywords: ['button', 'click', 'action'],
      action: (): void => {
        handleAddNode('button');
        setShowComponentMenu(false);
      },
    },
    {
      id: 'create-input',
      label: 'Add Input',
      description: 'Insert a text input field',
      category: 'create',
      keywords: ['input', 'text', 'field', 'form'],
      action: (): void => {
        handleAddNode('input');
      },
    },
    {
      id: 'create-card',
      label: 'Add Card',
      description: 'Insert a card container',
      category: 'create',
      keywords: ['card', 'container', 'box'],
      action: (): void => {
        handleAddNode('card');
      },
    },
    {
      id: 'create-container',
      label: 'Add Container',
      description: 'Insert a layout container',
      category: 'create',
      keywords: ['container', 'layout', 'flex', 'grid'],
      action: (): void => {
        handleAddNode('container');
      },
    },
    {
      id: 'create-text',
      label: 'Add Text',
      description: 'Insert a text element',
      category: 'create',
      keywords: ['text', 'heading', 'paragraph', 'typography'],
      action: (): void => {
        handleAddNode('text');
      },
    },
    {
      id: 'create-sandpack',
      label: 'Add Live Component',
      description: 'Insert a Sandpack live preview component',
      category: 'create',
      keywords: ['sandpack', 'live', 'preview', 'component', 'react', 'code'],
      action: (): void => {
        handleAddNode('sandpack');
      },
    },
    {
      id: 'create-page',
      label: 'Add Page',
      description: 'Create a page composition for multiple components',
      category: 'create',
      keywords: ['page', 'composition', 'layout', 'screen', 'view'],
      action: (): void => {
        handleAddPage();
      },
    },
    // Edit commands
    {
      id: 'edit-duplicate',
      label: 'Duplicate Selected',
      description: 'Duplicate the selected nodes',
      category: 'edit',
      shortcut: `${modKey}+D`,
      keywords: ['duplicate', 'copy', 'clone'],
      action: handleDuplicateSelected,
    },
    {
      id: 'edit-delete',
      label: 'Delete Selected',
      description: 'Delete the selected nodes',
      category: 'edit',
      shortcut: 'Del',
      keywords: ['delete', 'remove', 'trash'],
      action: handleDeleteSelected,
    },
    {
      id: 'edit-copy',
      label: 'Copy Selected',
      description: 'Copy selected nodes to clipboard',
      category: 'edit',
      shortcut: `${modKey}+C`,
      keywords: ['copy', 'clipboard'],
      action: handleCopySelected,
    },
    {
      id: 'edit-paste',
      label: 'Paste',
      description: 'Paste nodes from clipboard',
      category: 'edit',
      shortcut: `${modKey}+V`,
      keywords: ['paste', 'clipboard'],
      action: handlePaste,
    },
    {
      id: 'edit-select-all',
      label: 'Select All',
      description: 'Select all nodes on canvas',
      category: 'edit',
      shortcut: `${modKey}+A`,
      keywords: ['select', 'all'],
      action: (): void => {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
      },
    },
    // View commands
    {
      id: 'view-component-menu',
      label: 'Open Component Menu',
      description: 'Open the component picker menu',
      category: 'view',
      keywords: ['component', 'menu', 'add', 'insert'],
      action: (): void => {
        setMenuPosition({ x: window.innerWidth / 2 - 160, y: 100 });
        setShowComponentMenu(true);
      },
    },
    // General commands
    {
      id: 'general-shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      category: 'general',
      shortcut: 'Shift+?',
      keywords: ['keyboard', 'shortcuts', 'help', 'keys'],
      action: (): void => {
        setShowShortcutsHelp(true);
      },
    },
  ];
}
