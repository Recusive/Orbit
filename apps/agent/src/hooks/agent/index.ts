// Main hook and types - this is what most consumers should import from
export {
  useTauri,
  formatConversationContext,
  markSessionAsForked,
  setRewindContext,
} from './use-tauri';

export type {
  UseTauriOptions,
  UseTauriReturn,
  RewindContextMessage,
  MessageHandler,
} from './use-tauri';

// Re-export types for convenience
export type { WebviewMessage } from './types/tauri-types';
