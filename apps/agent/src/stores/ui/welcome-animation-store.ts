/**
 * Welcome Animation Store
 *
 * Persists the user's preferred welcome page animation style.
 * - "beam": Left-to-right beam sweep with glow and blur (default)
 * - "scramble": Looping scramble-decode with cursor blink (classic)
 *
 * @module stores/ui/welcome-animation-store
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types and Constants
// ============================================================================

/** Supported welcome animation variants */
export type WelcomeAnimationId = 'beam' | 'scramble';

/** Metadata for a welcome animation option */
export interface WelcomeAnimationInfo {
  readonly id: WelcomeAnimationId;
  readonly label: string;
  readonly description: string;
}

const DEFAULT_ANIMATION: WelcomeAnimationId = 'beam';
const STORAGE_KEY = 'orbit-welcome-animation';

const logger = createLogger('WelcomeAnimationStore');

// ============================================================================
// Animation Registry
// ============================================================================

export const WELCOME_ANIMATIONS: readonly WelcomeAnimationInfo[] = [
  {
    id: 'beam',
    label: 'Beam Reveal',
    description: 'Left-to-right beam sweep with glow',
  },
  {
    id: 'scramble',
    label: 'Scramble Decode',
    description: 'Characters decode from random noise',
  },
] as const;

const VALID_IDS = new Set<string>(WELCOME_ANIMATIONS.map((a) => a.id));

function isValidAnimationId(id: unknown): id is WelcomeAnimationId {
  return typeof id === 'string' && VALID_IDS.has(id);
}

// ============================================================================
// Store Implementation
// ============================================================================

interface WelcomeAnimationState {
  currentAnimation: WelcomeAnimationId;
  /** When false, skips the choreographed launch sequence and shows the final state instantly. */
  enableLaunchAnimation: boolean;
}

interface WelcomeAnimationActions {
  setAnimation: (id: WelcomeAnimationId) => void;
  setEnableLaunchAnimation: (enabled: boolean) => void;
}

export const useWelcomeAnimationStore = create<WelcomeAnimationState & WelcomeAnimationActions>()(
  persist(
    immer((set) => ({
      currentAnimation: DEFAULT_ANIMATION,
      enableLaunchAnimation: true,

      setEnableLaunchAnimation: (enabled: boolean): void => {
        set((state) => {
          state.enableLaunchAnimation = enabled;
        });
      },

      setAnimation: (id: WelcomeAnimationId): void => {
        if (!isValidAnimationId(id)) {
          logger.warn('Invalid welcome animation ID, falling back to default', {
            provided: id,
            fallback: DEFAULT_ANIMATION,
          });
          set((state) => {
            state.currentAnimation = DEFAULT_ANIMATION;
          });
          return;
        }

        set((state) => {
          state.currentAnimation = id;
        });
      },
    })),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        currentAnimation: state.currentAnimation,
        enableLaunchAnimation: state.enableLaunchAnimation,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error !== undefined) {
          logger.warn('Error rehydrating welcome animation store', { error });
          return;
        }

        if (state !== undefined) {
          if (!isValidAnimationId(state.currentAnimation)) {
            logger.warn('Invalid animation ID in storage, resetting to default', {
              stored: state.currentAnimation,
              fallback: DEFAULT_ANIMATION,
            });
            state.currentAnimation = DEFAULT_ANIMATION;
          }

          if (typeof state.enableLaunchAnimation !== 'boolean') {
            state.enableLaunchAnimation = true;
          }
        }
      },
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectWelcomeAnimation = (state: WelcomeAnimationState): WelcomeAnimationId =>
  state.currentAnimation;

export const selectEnableLaunchAnimation = (state: WelcomeAnimationState): boolean =>
  state.enableLaunchAnimation;
