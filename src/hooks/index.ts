/**
 * Hooks barrel export
 * Centralized export for all custom React hooks
 */

// VS Code integration
export { useVSCode } from './use-vscode';
export type { VSCodeMessage, UseVSCodeReturn } from './use-vscode';

// Agent operations
export { useAgent } from './use-agent';
export type { UseAgentReturn } from './use-agent';

// Chat operations
export { useChat } from './use-chat';
export type { UseChatReturn } from './use-chat';

// Terminal operations
export { useTerminal } from './use-terminal';
export type { UseTerminalReturn } from './use-terminal';

// File operations
export { useFileOperations } from './use-file-operations';
export type { UseFileOperationsReturn } from './use-file-operations';
export type { FileChange } from '../stores/file-store';

// Resizable panels
export { useResizable } from './use-resizable';
export type {
  ResizeDirection,
  ResizeConstraints,
  UseResizableOptions,
  UseResizableReturn,
} from './use-resizable';

// Keyboard shortcuts
export {
  useKeyboardShortcuts,
  useDefaultKeyboardShortcuts,
  defaultShortcuts,
} from './use-keyboard-shortcuts';
export type {
  KeyboardShortcut,
  UseKeyboardShortcutsOptions,
  UseKeyboardShortcutsReturn,
} from './use-keyboard-shortcuts';
