/**
 * Chat Width Store
 *
 * Persists the user's preferred chat layout width mode.
 * - false (default): Chat constrained to 650px max-width, centered
 * - true: Chat stretches to fill the available width
 *
 * Applies the preference by overriding the --chat-width-primary CSS variable
 * on document.documentElement. All chat components that consume this variable
 * (messages, input, todo bar) respond automatically.
 *
 * @module stores/ui/chat-width-store
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Constants
// ============================================================================

const CSS_VAR = '--chat-width-primary';
const STORAGE_KEY = 'orbit-chat-width';

const logger = createLogger('ChatWidthStore');

// ============================================================================
// CSS Side-Effect
// ============================================================================

/**
 * Apply the chat width preference to the document root CSS variable.
 * - fullWidth=true  → override --chat-width-primary to 100% (no constraint)
 * - fullWidth=false → remove override, CSS cascade restores 650px default
 */
function applyChatWidth(fullWidth: boolean): void {
  if (fullWidth) {
    document.documentElement.style.setProperty(CSS_VAR, '100%');
  } else {
    document.documentElement.style.removeProperty(CSS_VAR);
  }
}

// ============================================================================
// Store Implementation
// ============================================================================

interface ChatWidthState {
  fullWidth: boolean;
}

interface ChatWidthActions {
  setFullWidth: (value: boolean) => void;
  toggleFullWidth: () => void;
}

export const useChatWidthStore = create<ChatWidthState & ChatWidthActions>()(
  persist(
    immer((set, get) => ({
      fullWidth: false,

      setFullWidth: (value: boolean): void => {
        set((state) => {
          state.fullWidth = value;
        });
        applyChatWidth(value);
      },

      toggleFullWidth: (): void => {
        const newValue = !get().fullWidth;
        set((state) => {
          state.fullWidth = newValue;
        });
        applyChatWidth(newValue);
      },
    })),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ fullWidth: state.fullWidth }),
      onRehydrateStorage: () => (state, error) => {
        if (error !== undefined) {
          logger.warn('Error rehydrating chat width store', { error });
          return;
        }

        if (state && typeof state.fullWidth !== 'boolean') {
          logger.warn('Invalid fullWidth value in storage, resetting to default', {
            stored: state.fullWidth,
          });
          state.fullWidth = false;
        }

        if (state) {
          applyChatWidth(state.fullWidth);
        }
      },
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectChatFullWidth = (state: ChatWidthState): boolean => state.fullWidth;
