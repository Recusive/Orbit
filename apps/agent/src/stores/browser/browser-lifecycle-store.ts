/**
 * Browser Lifecycle Store
 *
 * Manages browser state machine and idle tracking for auto-cleanup.
 * Works with embedded WebKit webview within the Orbit window.
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';

const logger = createLogger('BrowserLifecycle');

// ============================================
// Types
// ============================================

/** Browser lifecycle states */
export type BrowserState =
  | 'idle' // No browser, panel shows "Launch Browser" button
  | 'starting' // Playwright spawning browser
  | 'active' // Browser running, user/AI interacting
  | 'inactive' // Browser running, no activity (idle timer counting)
  | 'closing'; // Browser shutting down

/** Browser lifecycle store state */
interface BrowserLifecycleState {
  /** Current lifecycle state */
  state: BrowserState;
  /** Webview label (unique identifier) */
  label: string | null;
  /** Timestamp of last activity (user or AI) */
  lastActivity: number;
  /** Whether idle warning is being shown */
  idleWarningShown: boolean;
  /** Seconds remaining until auto-close (null if not counting) */
  idleTimeRemaining: number | null;
  /** Error message if any */
  error: string | null;
}

/** Browser lifecycle store actions */
interface BrowserLifecycleActions {
  /** Set browser state */
  setState: (state: BrowserState) => void;
  /** Set browser webview label */
  setLabel: (label: string | null) => void;
  /** Record user or AI activity (resets idle timer) */
  recordActivity: () => void;
  /** Tick the idle timer (call every second when browser active) */
  tick: () => void;
  /** Set error message */
  setError: (error: string | null) => void;
  /** Reset to initial state */
  reset: () => void;
}

// ============================================
// Configuration
// ============================================

/** How long before showing idle warning (5 minutes) */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** How long after warning before auto-close (60 seconds) */
const WARNING_DURATION_MS = 60 * 1000;

// ============================================
// Store
// ============================================

const initialState: BrowserLifecycleState = {
  state: 'idle',
  label: null,
  lastActivity: Date.now(),
  idleWarningShown: false,
  idleTimeRemaining: null,
  error: null,
};

export const useBrowserLifecycleStore = create<BrowserLifecycleState & BrowserLifecycleActions>(
  (set, get) => ({
    ...initialState,

    setState: (state) => {
      logger.debug('State transition', { from: get().state, to: state });
      set({ state });
    },

    setLabel: (label) => {
      set({ label });
    },

    recordActivity: () => {
      const { state } = get();
      // Only record activity when browser is running
      if (state === 'active' || state === 'inactive') {
        const wasInactive = state === 'inactive';
        set({
          lastActivity: Date.now(),
          idleWarningShown: false,
          idleTimeRemaining: null,
          // If was inactive, go back to active
          state: 'active',
        });
        // Only log when transitioning from inactive to active (user dismissed warning)
        if (wasInactive) {
          logger.info('Activity detected, cancelling idle warning');
        }
      }
    },

    tick: () => {
      const { state, lastActivity, idleWarningShown } = get();

      // Only tick when browser is running
      if (state !== 'active' && state !== 'inactive') {
        return;
      }

      const idleTime = Date.now() - lastActivity;

      // Check if we should show warning
      if (idleTime >= IDLE_TIMEOUT_MS && !idleWarningShown) {
        set({
          state: 'inactive',
          idleWarningShown: true,
          idleTimeRemaining: Math.ceil(WARNING_DURATION_MS / 1000),
        });
        logger.info('Browser idle, showing warning');
        return;
      }

      // If warning is shown, count down
      if (idleWarningShown) {
        const totalIdleTime = IDLE_TIMEOUT_MS + WARNING_DURATION_MS;
        const remaining = Math.ceil((totalIdleTime - idleTime) / 1000);

        if (remaining <= 0) {
          // Time to auto-close - this will be handled by the component
          logger.info('Idle timeout expired, browser should close');
          set({ idleTimeRemaining: 0 });
        } else {
          set({ idleTimeRemaining: remaining });
        }
      }
    },

    setError: (error) => {
      set({ error });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================
// Selectors
// ============================================

/** Check if browser is in a running state (active or inactive) */
export const selectIsBrowserRunning = (state: BrowserLifecycleState): boolean =>
  state.state === 'active' || state.state === 'inactive';

/** Check if browser should auto-close (idle time expired) */
export const selectShouldAutoClose = (state: BrowserLifecycleState): boolean =>
  state.idleTimeRemaining === 0;

/** Get formatted idle time remaining */
export const selectFormattedIdleTime = (state: BrowserLifecycleState): string | null => {
  if (state.idleTimeRemaining === null) return null;
  const minutes = Math.floor(state.idleTimeRemaining / 60);
  const seconds = state.idleTimeRemaining % 60;
  return minutes > 0
    ? `${String(minutes)}:${seconds.toString().padStart(2, '0')}`
    : `${String(seconds)}s`;
};
