/**
 * Launch Sequence Store — session-scoped phase machine for the welcome animation.
 *
 * Phase progression: idle → wallpaper → ascii → ui-reveal → complete
 *
 * NOT persisted — every app launch starts fresh at 'idle'.
 *
 * Key safety mechanism: `runId` (monotonic counter) prevents stale async callbacks
 * from advancing the wrong run. Every startSequence() and reset() increments runId.
 * Async continuations capture runId at schedule time and verify before acting.
 *
 * @see docs/plans/launch-sequence-animation.md
 * @module stores/ui/launch-sequence-store
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types
// ============================================================================

export type LaunchPhase = 'idle' | 'wallpaper' | 'ascii' | 'ui-reveal' | 'complete';

const PHASE_ORDER: readonly LaunchPhase[] = [
  'idle',
  'wallpaper',
  'ascii',
  'ui-reveal',
  'complete',
] as const;

interface LaunchSequenceState {
  phase: LaunchPhase;
  isActive: boolean;
  /**
   * Monotonic counter — incremented on startSequence() and reset().
   * Async callbacks capture runId at schedule time and verify before advancing.
   * Prevents stale callbacks from a cancelled/restarted run from corrupting phase state.
   */
  runId: number;
}

interface LaunchSequenceActions {
  /**
   * Start the launch sequence.
   *
   * **Double-start contract (restart strategy)**:
   * - If inactive: normal start — runId++, phase → wallpaper, isActive = true
   * - If already active: restart — runId++ (invalidates stale callbacks), phase → wallpaper
   *
   * Restart is chosen over idempotent to handle React StrictMode double-mount
   * and rapid workspace close/open, where the first run's stale callbacks
   * must be orphaned.
   */
  startSequence: () => void;
  /**
   * Advance to the next phase in PHASE_ORDER.
   * No-ops if phase is 'complete' or isActive is false.
   */
  advancePhase: () => void;
  /** Jump directly to 'complete' — used for prefers-reduced-motion. */
  skipToComplete: () => void;
  /** Reset to idle. Increments runId to invalidate in-flight callbacks. */
  reset: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useLaunchSequenceStore = create<LaunchSequenceState & LaunchSequenceActions>()(
  immer((set) => ({
    phase: 'idle',
    isActive: false,
    runId: 0,

    startSequence: (): void => {
      set((state) => {
        // Always increment runId — orphans stale callbacks from any prior run
        state.runId += 1;
        state.phase = 'wallpaper';
        state.isActive = true;
      });
    },

    advancePhase: (): void => {
      set((state) => {
        if (!state.isActive) return;
        if (state.phase === 'complete') return;

        const currentIndex = PHASE_ORDER.indexOf(state.phase);
        const nextPhase = PHASE_ORDER[currentIndex + 1];
        if (nextPhase !== undefined) {
          state.phase = nextPhase;
        }
      });
    },

    skipToComplete: (): void => {
      set((state) => {
        state.phase = 'complete';
        state.isActive = true;
      });
    },

    reset: (): void => {
      set((state) => {
        state.runId += 1;
        state.phase = 'idle';
        state.isActive = false;
      });
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const selectLaunchPhase = (state: LaunchSequenceState): LaunchPhase => state.phase;

export const selectIsLaunchActive = (state: LaunchSequenceState): boolean =>
  state.isActive && state.phase !== 'complete';

export const selectLaunchRunId = (state: LaunchSequenceState): number => state.runId;
