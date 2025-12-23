/**
 * Hooks barrel export
 * Centralized export for all custom React hooks
 */

// Tauri integration
export { useTauri, useAgentStream } from './use-tauri';
export type { UseTauriOptions, UseTauriReturn, AgentStreamCallbacks } from './use-tauri';

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

// Git status
export { useGitStatus } from './use-git-status';
export type { UseGitStatusOptions, UseGitStatusResult } from './use-git-status';

// File tree
export { useFileTree, useFileTreeItem } from './use-file-tree';
export type { UseFileTreeOptions, UseFileTreeResult, UseFileTreeItemResult } from './use-file-tree';

// LSP
export { useLsp } from './use-lsp';
export type { UseLspResult } from './use-lsp';

// Search
export { useSearch } from './use-search';
export type { UseSearchOptions, UseSearchReturn } from './use-search';
