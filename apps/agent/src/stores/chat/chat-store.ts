/**
 * Chat Store — Centralized session-keyed message state.
 *
 * Replaces the previous React useState-based architecture (message-state.ts,
 * session-state.ts) with a Zustand store keyed by sessionId. Backend events
 * write directly to the store via ChatMessageService; React reads reactively
 * via selectors.
 *
 * KEY DESIGN DECISIONS:
 * - `Record<string, ChatSessionData>` not Map — immer works with plain objects
 * - `remappedOrbitIds` uses `Record<string, true>` not Set — immer's structural
 *   sharing doesn't work with Sets (every mutation creates a new Set reference)
 * - `activeSessionId` persisted to localStorage via manual subscriber (NOT persist
 *   middleware — serializing the entire sessions Record on every change would be catastrophic)
 * - Session eviction at MAX_IN_MEMORY_SESSIONS prevents unbounded memory growth
 * - Active session is pinned (never evicted)
 * - Eviction clears loadedSessions[id] so switching back triggers conversation:load
 */
import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { ChatMessage } from '@/components/chat';
import type { ImageAttachment } from '@/components/chat/input';
import type { ReactElementContext } from '@/types/protocol';

const logger = createLogger('ChatStore');

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Maximum sessions to keep in memory. Beyond this, LRU eviction clears messages. */
const MAX_IN_MEMORY_SESSIONS = 20;

/** localStorage key for persisting activeSessionId across app restarts */
const STORAGE_KEY = 'orbit-sessionId';

/**
 * Stable empty array reference for selectors — prevents re-allocation on every
 * render when a session has no messages. Selectors return this instead of `[]`.
 */
const EMPTY_MESSAGES: ChatMessage[] = [];

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface PendingMessage {
  text: string;
  contextFiles?: string[] | undefined;
  images?: ImageAttachment[] | undefined;
  elements?: ReactElementContext[] | undefined;
}

export interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
}

/** Tracks LRU order — most recent access at end of array */
type LruTracker = string[];

export interface ChatStoreState {
  // ── Per-session data ──────────────────────────────────────────────────
  sessions: Record<string, ChatSessionData>;

  // ── Global state ──────────────────────────────────────────────────────
  activeSessionId: string | null;
  /** Set by conversation:created handler. Hooks subscribe to react to new session creation. */
  lastCreatedSessionId: string | null;
  pendingMessage: PendingMessage | null;
  /** Stale ID filter: old frontend IDs that have been remapped to SDK IDs */
  remappedOrbitIds: Record<string, true>;
  /** Staleness counter bumped on rewind — guards deferred callbacks */
  rewindEpoch: number;
  /** Staleness counter bumped on conversation:load — guards deferred callbacks */
  conversationLoadEpoch: number;
  /** Tracks sessions loaded from backend to prevent duplicate conversation:load requests */
  loadedSessions: Record<string, boolean>;
  /** LRU access order for eviction (most recently accessed at end) */
  lruOrder: LruTracker;

  // ── Actions ───────────────────────────────────────────────────────────
  getOrCreateSession: (id: string) => ChatSessionData;
  setActiveSession: (id: string) => void;
  setMessages: (id: string, msgs: ChatMessage[]) => void;
  appendToLastMessage: (id: string, messageId: string, content: string) => void;
  appendThinking: (id: string, messageId: string, thinking: string) => void;
  addMessage: (id: string, msg: ChatMessage) => void;
  updateMessage: (id: string, messageId: string, updater: (m: ChatMessage) => ChatMessage) => void;
  reconcileMessageId: (id: string, oldId: string, newId: string) => void;
  setAgentRunning: (id: string, running: boolean) => void;
  setStopPending: (id: string, pending: boolean) => void;
  remapSession: (oldId: string, newId: string) => void;
  destroySession: (id: string) => void;
  bumpRewindEpoch: () => number;
  bumpConversationLoadEpoch: () => number;
  setPendingMessage: (msg: PendingMessage | null) => void;
  markSessionLoaded: (id: string) => void;
  clearSessionLoaded: (id: string) => void;
  isSessionLoaded: (id: string) => boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Initial localStorage read (synchronous, before store creation)
// ────────────────────────────────────────────────────────────────────────────

const initialActiveSessionId = ((): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
})();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function createEmptySession(): ChatSessionData {
  return {
    messages: [],
    isAgentRunning: false,
    isStopPending: false,
  };
}

/**
 * Touch a session ID in the LRU tracker (move to end = most recent).
 * Mutates the array in place (safe inside immer draft).
 */
function touchLru(lruOrder: LruTracker, id: string): void {
  const idx = lruOrder.indexOf(id);
  if (idx >= 0) {
    lruOrder.splice(idx, 1);
  }
  lruOrder.push(id);
}

/**
 * Evict least-recently-used sessions when over capacity.
 * Clears messages but keeps the session key (preserves isAgentRunning state).
 * Active session is pinned and never evicted.
 */
function evictIfNeeded(
  sessions: Record<string, ChatSessionData>,
  lruOrder: LruTracker,
  loadedSessions: Record<string, boolean>,
  activeSessionId: string | null
): void {
  while (lruOrder.length > MAX_IN_MEMORY_SESSIONS) {
    const candidate = lruOrder[0];
    if (candidate === undefined) break;

    // Never evict the active session — pin it
    if (candidate === activeSessionId) {
      // Move pinned session to end so we try the next candidate
      lruOrder.splice(0, 1);
      lruOrder.push(candidate);
      continue;
    }

    // Never evict a session with an active agent
    const session = sessions[candidate];
    if (session?.isAgentRunning) {
      lruOrder.splice(0, 1);
      lruOrder.push(candidate);
      continue;
    }

    // Evict: clear messages but keep key for state tracking
    if (session) {
      session.messages = [];
    }
    // Clear loadedSessions so switching back triggers a fresh conversation:load
    Reflect.deleteProperty(loadedSessions, candidate);
    // Remove from LRU (it stays in sessions Record with empty messages)
    lruOrder.splice(0, 1);

    logger.debug('Evicted session from memory', { sessionId: candidate });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStoreState>()(
  devtools(
    immer((set, get) => ({
      // ── Initial state ───────────────────────────────────────────────
      sessions: {},
      activeSessionId: initialActiveSessionId,
      lastCreatedSessionId: null,
      pendingMessage: null,
      remappedOrbitIds: {},
      rewindEpoch: 0,
      conversationLoadEpoch: 0,
      loadedSessions: {},
      lruOrder: [],

      // ── Actions ─────────────────────────────────────────────────────

      getOrCreateSession: (id: string): ChatSessionData => {
        const state = get();
        const existing = state.sessions[id];
        if (existing) {
          // Touch LRU on access
          set((draft) => {
            touchLru(draft.lruOrder, id);
          });
          return existing;
        }

        // Create new session and run eviction
        set((draft) => {
          draft.sessions[id] = createEmptySession();
          touchLru(draft.lruOrder, id);
          evictIfNeeded(
            draft.sessions,
            draft.lruOrder,
            draft.loadedSessions,
            draft.activeSessionId
          );
        });
        // Return freshly created session from committed state
        return get().sessions[id] ?? createEmptySession();
      },

      setActiveSession: (id: string): void => {
        set((draft) => {
          draft.activeSessionId = id;
          // Ensure session exists
          draft.sessions[id] ??= createEmptySession();
          touchLru(draft.lruOrder, id);
        });
      },

      setMessages: (id: string, msgs: ChatMessage[]): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          draft.sessions[id].messages = msgs;
        });
      },

      appendToLastMessage: (id: string, messageId: string, content: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;

          const lastMsg = session.messages.at(-1);
          if (!lastMsg) return;

          // Fast path: last message matches
          if (lastMsg.id === messageId) {
            lastMsg.content += content;
            lastMsg.displayedContent = lastMsg.content;
            return;
          }

          // Slow path: find by ID (shouldn't happen in normal flow)
          const target = session.messages.find((m) => m.id === messageId);
          if (target) {
            target.content += content;
            target.displayedContent = target.content;
          }
        });
      },

      appendThinking: (id: string, messageId: string, thinking: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;

          const lastMsg = session.messages.at(-1);
          if (!lastMsg) return;

          const target =
            lastMsg.id === messageId ? lastMsg : session.messages.find((m) => m.id === messageId);
          if (!target) return;

          target.thinking = (target.thinking ?? '') + thinking;
        });
      },

      addMessage: (id: string, msg: ChatMessage): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          draft.sessions[id].messages.push(msg);
        });
      },

      updateMessage: (
        id: string,
        messageId: string,
        updater: (m: ChatMessage) => ChatMessage
      ): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;

          const idx = session.messages.findIndex((m) => m.id === messageId);
          const existing = idx >= 0 ? session.messages[idx] : undefined;
          if (idx >= 0 && existing) {
            session.messages[idx] = updater(existing);
          }
        });
      },

      reconcileMessageId: (id: string, oldId: string, newId: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;

          const msg = session.messages.find((m) => m.id === oldId);
          if (msg) {
            msg.id = newId;
          }
        });
      },

      setAgentRunning: (id: string, running: boolean): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          draft.sessions[id].isAgentRunning = running;
        });
      },

      setStopPending: (id: string, pending: boolean): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.isStopPending = pending;
          }
        });
      },

      remapSession: (oldId: string, newId: string): void => {
        set((draft) => {
          // Move session data from old key to new key
          if (draft.sessions[oldId]) {
            draft.sessions[newId] = draft.sessions[oldId];
            Reflect.deleteProperty(draft.sessions, oldId);
          }

          // Track old ID as remapped (stale ID filter)
          draft.remappedOrbitIds[oldId] = true;

          // ONLY update activeSessionId if THIS session is active.
          // Background session remaps must NOT steal focus from the foreground.
          if (draft.activeSessionId === oldId) {
            draft.activeSessionId = newId;
          }

          // Migrate loadedSessions
          if (draft.loadedSessions[oldId] !== undefined) {
            draft.loadedSessions[newId] = draft.loadedSessions[oldId];
            Reflect.deleteProperty(draft.loadedSessions, oldId);
          }

          // Update LRU order
          const lruIdx = draft.lruOrder.indexOf(oldId);
          if (lruIdx >= 0) {
            draft.lruOrder[lruIdx] = newId;
          }
        });
      },

      destroySession: (id: string): void => {
        set((draft) => {
          Reflect.deleteProperty(draft.sessions, id);
          Reflect.deleteProperty(draft.loadedSessions, id);

          // Remove from LRU
          const lruIdx = draft.lruOrder.indexOf(id);
          if (lruIdx >= 0) {
            draft.lruOrder.splice(lruIdx, 1);
          }

          // Clear active if this was the active session
          if (draft.activeSessionId === id) {
            draft.activeSessionId = null;
          }
        });
      },

      bumpRewindEpoch: (): number => {
        let newEpoch = 0;
        set((draft) => {
          draft.rewindEpoch += 1;
          newEpoch = draft.rewindEpoch;
        });
        return newEpoch;
      },

      bumpConversationLoadEpoch: (): number => {
        let newEpoch = 0;
        set((draft) => {
          draft.conversationLoadEpoch += 1;
          newEpoch = draft.conversationLoadEpoch;
        });
        return newEpoch;
      },

      setPendingMessage: (msg: PendingMessage | null): void => {
        set((draft) => {
          draft.pendingMessage = msg;
        });
      },

      markSessionLoaded: (id: string): void => {
        set((draft) => {
          draft.loadedSessions[id] = true;
        });
      },

      clearSessionLoaded: (id: string): void => {
        set((draft) => {
          Reflect.deleteProperty(draft.loadedSessions, id);
        });
      },

      isSessionLoaded: (id: string): boolean => {
        return get().loadedSessions[id] === true;
      },
    })),
    { name: 'chat-store' }
  )
);

// ────────────────────────────────────────────────────────────────────────────
// localStorage subscriber (write-only, not persist middleware)
//
// Subscribes to activeSessionId changes and persists to localStorage.
// This is intentionally NOT the persist middleware — serializing the entire
// sessions Record on every agent:chunk would be catastrophic for performance.
// ────────────────────────────────────────────────────────────────────────────

useChatStore.subscribe((state, prevState) => {
  if (state.activeSessionId !== prevState.activeSessionId) {
    try {
      if (state.activeSessionId) {
        localStorage.setItem(STORAGE_KEY, state.activeSessionId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors (private browsing, quota exceeded, etc.)
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Selector Helpers
//
// Pre-built selectors for common access patterns. Use these in components
// to get stable references and prevent unnecessary re-renders.
// ────────────────────────────────────────────────────────────────────────────

/** Messages for the currently active session. Returns stable EMPTY_MESSAGES when no session. */
export function useActiveMessages(): ChatMessage[] {
  return useChatStore(
    (s) =>
      (s.activeSessionId ? s.sessions[s.activeSessionId]?.messages : undefined) ?? EMPTY_MESSAGES
  );
}

/** Full session data for the currently active session. */
export function useActiveSession(): ChatSessionData | undefined {
  return useChatStore((s) => (s.activeSessionId ? s.sessions[s.activeSessionId] : undefined));
}

/** The active session ID (convenience selector). */
export function useActiveSessionId(): string | null {
  return useChatStore((s) => s.activeSessionId);
}

/** Whether the active session's agent is running. */
export function useIsAgentRunning(): boolean {
  return useChatStore(
    (s) => (s.activeSessionId ? s.sessions[s.activeSessionId]?.isAgentRunning : undefined) ?? false
  );
}

/** Whether the active session has a stop pending. */
export function useIsStopPending(): boolean {
  return useChatStore(
    (s) => (s.activeSessionId ? s.sessions[s.activeSessionId]?.isStopPending : undefined) ?? false
  );
}
