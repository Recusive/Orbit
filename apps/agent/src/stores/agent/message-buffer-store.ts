/**
 * Message Buffer Store — Pending Load Tracker
 *
 * Tracks in-flight conversation:load requests to prevent duplicate requests
 * when multiple components (sidebar, useChatMessages hook) try to load the
 * same session simultaneously.
 *
 * HISTORY: This store previously handled buffering streaming messages for
 * unmounted ChatArea views (auto-start agent problem). That functionality
 * was removed when ChatStore (Zustand singleton) replaced React useState —
 * the store accepts writes before React mounts, eliminating the need for
 * a separate buffer.
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const logger = createLogger('MessageBufferStore');

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Maximum time to wait for a conversation:load response before clearing pending flag (30s) */
const MAX_LOAD_PENDING_AGE_MS = 30 * 1000;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface MessageBufferState {
  /**
   * Sessions with in-flight conversation:load requests, with timestamps.
   * Used to prevent duplicate requests when multiple components try to load the same session.
   * Map<sessionId, timestamp> allows timeout-based cleanup if load never completes.
   */
  pendingLoads: Map<string, number>;

  /**
   * Mark a session as having a pending conversation:load request.
   * Returns true if marked (no existing pending), false if already pending.
   */
  markLoadPending: (sessionId: string) => boolean;

  /** Clear the pending load flag for a session (called when conversation:loaded is received). */
  clearLoadPending: (sessionId: string) => void;

  /** Check if a session has a pending load request. Auto-clears expired entries (>30s). */
  hasLoadPending: (sessionId: string) => boolean;
}

// ═══════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════

export const useMessageBufferStore = create<MessageBufferState>()(
  immer((set, get) => ({
    pendingLoads: new Map<string, number>(),

    markLoadPending: (sessionId): boolean => {
      const state = get();
      const existingTimestamp = state.pendingLoads.get(sessionId);

      // Check if already pending AND not expired
      if (existingTimestamp !== undefined) {
        const age = Date.now() - existingTimestamp;
        if (age < MAX_LOAD_PENDING_AGE_MS) {
          logger.debug('Load already pending, skipping', { sessionId, age });
          return false;
        }
        // Expired — will be replaced below
        logger.warn('Clearing expired pending load', { sessionId, age });
      }

      set((s) => {
        s.pendingLoads.set(sessionId, Date.now());
      });
      logger.debug('Marked load pending', { sessionId });
      return true;
    },

    clearLoadPending: (sessionId): void => {
      set((state) => {
        state.pendingLoads.delete(sessionId);
      });
      logger.debug('Cleared load pending', { sessionId });
    },

    hasLoadPending: (sessionId): boolean => {
      const timestamp = get().pendingLoads.get(sessionId);
      if (timestamp === undefined) {
        return false;
      }

      // Check if pending load has expired (timed out)
      const age = Date.now() - timestamp;
      if (age >= MAX_LOAD_PENDING_AGE_MS) {
        logger.warn('Auto-clearing expired pending load', { sessionId, age });
        // Clear in next tick to avoid mutating state during get()
        setTimeout(() => {
          useMessageBufferStore.getState().clearLoadPending(sessionId);
        }, 0);
        return false;
      }

      return true;
    },
  }))
);
