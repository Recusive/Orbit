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

import { removeRenderCache, saveRenderCache } from './render-cache-store';

import type { ChatMessage } from '@/components/chat';
import type { ImageAttachment } from '@/components/chat/input';
import type { ReactElementContext } from '@/types/protocol';

const logger = createLogger('ChatStore');

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Maximum sessions to keep in memory. Beyond this, LRU eviction clears messages. */
const MAX_IN_MEMORY_SESSIONS = 20;

/** localStorage key for persisting the last shown session across app restarts */
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
  skills?: string[] | undefined;
}

export type SessionHydrationState = 'unloaded' | 'hydrated';

export interface PersistedMeasurement {
  key: string;
  index: number;
  start: number;
  size: number;
  end: number;
  lane: number;
  /** true = real ResizeObserver measurement, false/undefined = estimate */
  measured?: boolean;
}

export interface ChatMeasurementCache {
  measurements: PersistedMeasurement[];
  messageCount: number;
  lastMessageId: string | null;
  layoutVersion: number;
  viewportWidth: number | null;
}

export type ScrollIntent =
  | 'history-load'
  | 'compact-reload'
  | 'rewind'
  | 'pending-verify'
  | 'session-restore'
  | 'session-refresh';

export interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
  scrollIntent?: ScrollIntent | null;
  hydrationState: SessionHydrationState;
  layoutVersion: number;
  layoutPendingCount?: number;
  layoutSettledVersion?: number;
  lastLayoutMutationAt?: number | null;
  layoutLeakDeadlineAt?: number | null;
  measurementCache: ChatMeasurementCache | null;
}

export interface ActiveCompaction {
  backend: 'claude';
  messageId: string;
  status: 'pending' | 'timed_out';
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
  /** Active /compact operations keyed by session ID. */
  activeCompactions: Record<string, ActiveCompaction>;
  /** LRU access order for eviction (most recently accessed at end) */
  lruOrder: LruTracker;
  /**
   * Transient force-stick request keyed by session ID. Set by the pending-create
   * flow in use-chat-messages.ts when a new conversation's first message is sent;
   * consumed by the target ChatMessages instance on mount via useLayoutEffect.
   * Works around the timing gap where scrollHandleRef is null at request time
   * because the target instance hasn't mounted yet (SessionInstanceManager only
   * forwards the handle to shown instances, and session transitions through
   * hidden-priming and visible-verifying before reaching shown). Single-fire:
   * consumeForceStick clears the flag once consumed.
   */
  pendingForceStickSessionId: string | null;

  // ── Actions ───────────────────────────────────────────────────────────
  getOrCreateSession: (id: string) => ChatSessionData;
  setActiveSession: (id: string) => void;
  clearActiveSession: () => void;
  requestForceStick: (sessionId: string) => void;
  consumeForceStick: (sessionId: string) => boolean;
  setMessages: (id: string, msgs: ChatMessage[], scrollIntent?: ScrollIntent | null) => void;
  markSessionHydrated: (id: string) => void;
  setScrollIntent: (id: string, intent: ScrollIntent | null) => void;
  clearScrollIntent: (id: string) => void;
  setMeasurementCache: (id: string, cache: ChatMeasurementCache | null) => void;
  clearMeasurementCache: (id: string) => void;
  bumpLayoutVersion: (id: string) => void;
  layoutMutationStart: (sessionId: string, source: string, timeoutMs?: number) => string;
  layoutMutationEnd: (sessionId: string, mutationToken: string) => void;
  markLayoutSettled: (id: string) => void;
  appendToLastMessage: (id: string, messageId: string, content: string) => void;
  appendThinking: (id: string, messageId: string, thinking: string) => void;
  addMessage: (id: string, msg: ChatMessage) => void;
  updateMessage: (id: string, messageId: string, updater: (m: ChatMessage) => ChatMessage) => void;
  patchImagePreviewUrl: (
    id: string,
    messageId: string,
    matchPreviewUrl: string,
    previewUrl: string
  ) => void;
  removeImageFromMessage: (id: string, messageId: string, matchPreviewUrl: string) => void;
  reconcileMessageId: (id: string, oldId: string, newId: string) => void;
  setAgentRunning: (id: string, running: boolean) => void;
  setStopPending: (id: string, pending: boolean) => void;
  /** @legacy Still needed for forks and pre-custom-sessionId sessions. New sessions skip remap. */
  remapSession: (oldId: string, newId: string) => void;
  destroySession: (id: string) => void;
  bumpRewindEpoch: () => number;
  bumpConversationLoadEpoch: () => number;
  setPendingMessage: (msg: PendingMessage | null) => void;
  markSessionLoaded: (id: string) => void;
  clearSessionLoaded: (id: string) => void;
  isSessionLoaded: (id: string) => boolean;
  markCompacting: (sessionId: string, compaction: ActiveCompaction) => void;
  markCompactionTimedOut: (sessionId: string, messageId: string) => void;
  settleCompaction: (sessionId: string) => void;
  clearCompactionsByBackend: (_backend: ActiveCompaction['backend']) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function createEmptySession(): ChatSessionData {
  return {
    messages: [],
    isAgentRunning: false,
    isStopPending: false,
    scrollIntent: null,
    hydrationState: 'unloaded',
    layoutVersion: 0,
    layoutPendingCount: 0,
    layoutSettledVersion: 0,
    lastLayoutMutationAt: null,
    layoutLeakDeadlineAt: null,
    measurementCache: null,
  };
}

const DEFAULT_LAYOUT_MUTATION_TIMEOUT_MS = 5000;

type LayoutMutationToken = string;

interface LayoutMutationRecord {
  readonly source: string;
  readonly startedAt: number;
  readonly timeoutId: ReturnType<typeof globalThis.setTimeout>;
  readonly timeoutMs: number;
}

const layoutMutationRegistry = new Map<string, Map<LayoutMutationToken, LayoutMutationRecord>>();
let layoutMutationSequence = 0;

function cancelLayoutMutationRecord(record: LayoutMutationRecord | undefined): void {
  if (!record) {
    return;
  }

  globalThis.clearTimeout(record.timeoutId);
}

function getNextLayoutLeakDeadline(sessionId: string): number | null {
  const registry = layoutMutationRegistry.get(sessionId);
  if (!registry || registry.size === 0) {
    return null;
  }

  let deadlineAt: number | null = null;
  for (const record of registry.values()) {
    const candidate = record.startedAt + record.timeoutMs;
    deadlineAt = deadlineAt === null ? candidate : Math.min(deadlineAt, candidate);
  }

  return deadlineAt;
}

function clearLayoutMutationRuntime(sessionId: string): void {
  const registry = layoutMutationRegistry.get(sessionId);
  if (!registry) {
    return;
  }

  for (const record of registry.values()) {
    cancelLayoutMutationRecord(record);
  }

  layoutMutationRegistry.delete(sessionId);
}

function noteSynchronousLayoutMutation(session: ChatSessionData, now = Date.now()): void {
  session.layoutPendingCount ??= 0;
  session.layoutSettledVersion ??= 0;
  session.lastLayoutMutationAt = now;
  if (session.layoutPendingCount === 0) {
    session.layoutSettledVersion += 1;
    session.layoutLeakDeadlineAt = null;
  }
}

export function getActiveLayoutMutationSources(sessionId: string): string[] {
  const registry = layoutMutationRegistry.get(sessionId);
  if (!registry || registry.size === 0) {
    return [];
  }
  return [...registry.values()].map((record) => record.source);
}

export function clearAllChatLayoutMutationRuntimeState(): void {
  for (const sessionId of [...layoutMutationRegistry.keys()]) {
    clearLayoutMutationRuntime(sessionId);
  }
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
  // Guard: track how many candidates we've skipped without evicting.
  // If we cycle through all candidates without evicting any, all are
  // protected — break to avoid an infinite loop.
  let skipped = 0;

  while (lruOrder.length > MAX_IN_MEMORY_SESSIONS) {
    const candidate = lruOrder[0];
    if (candidate === undefined) break;

    // Never evict the active session — pin it
    if (candidate === activeSessionId) {
      // Move pinned session to end so we try the next candidate
      lruOrder.splice(0, 1);
      lruOrder.push(candidate);
      skipped++;
      if (skipped >= lruOrder.length) break;
      continue;
    }

    // Never evict a session with an active agent
    const session = sessions[candidate];
    if (session?.isAgentRunning) {
      lruOrder.splice(0, 1);
      lruOrder.push(candidate);
      skipped++;
      if (skipped >= lruOrder.length) break;
      continue;
    }

    // Evict: clear messages but keep key for state tracking
    if (session) {
      if (session.measurementCache) {
        saveRenderCache(candidate, session.measurementCache);
      }
      session.messages = [];
      session.hydrationState = 'unloaded';
      session.measurementCache = null;
    }
    // Clear loadedSessions so switching back triggers a fresh conversation:load
    Reflect.deleteProperty(loadedSessions, candidate);
    // Remove from LRU (it stays in sessions Record with empty messages)
    lruOrder.splice(0, 1);
    skipped = 0;

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
      activeSessionId: null,
      lastCreatedSessionId: null,
      pendingMessage: null,
      remappedOrbitIds: {},
      activeCompactions: {},
      rewindEpoch: 0,
      conversationLoadEpoch: 0,
      loadedSessions: {},
      lruOrder: [],
      pendingForceStickSessionId: null,

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

      clearActiveSession: (): void => {
        set((draft) => {
          draft.activeSessionId = null;
        });
      },

      requestForceStick: (sessionId: string): void => {
        set((draft) => {
          draft.pendingForceStickSessionId = sessionId;
        });
      },

      consumeForceStick: (sessionId: string): boolean => {
        const state = get();
        if (state.pendingForceStickSessionId !== sessionId) {
          return false;
        }
        set((draft) => {
          draft.pendingForceStickSessionId = null;
        });
        return true;
      },

      setMessages: (id: string, msgs: ChatMessage[], scrollIntent?: ScrollIntent | null): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          const session = draft.sessions[id];
          session.messages = msgs;
          session.scrollIntent = scrollIntent ?? null;
          session.layoutVersion += 1;
          noteSynchronousLayoutMutation(session);
        });
      },

      markSessionHydrated: (id: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.hydrationState = 'hydrated';
          }
        });
      },

      setScrollIntent: (id: string, intent: ScrollIntent | null): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.scrollIntent = intent;
          }
        });
      },

      clearScrollIntent: (id: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.scrollIntent = null;
          }
        });
      },

      setMeasurementCache: (id: string, cache: ChatMeasurementCache | null): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.measurementCache = cache;
          }
        });

        if (cache !== null) {
          saveRenderCache(id, cache);
          return;
        }

        removeRenderCache(id);
      },

      clearMeasurementCache: (id: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.measurementCache = null;
          }
        });

        removeRenderCache(id);
      },

      bumpLayoutVersion: (id: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
          }
        });
      },

      layoutMutationStart: (sessionId: string, source: string, timeoutMs?: number): string => {
        const resolvedTimeoutMs = timeoutMs ?? DEFAULT_LAYOUT_MUTATION_TIMEOUT_MS;
        const token = `layout-mutation-${String(++layoutMutationSequence)}`;
        const startedAt = Date.now();
        const deadlineAt = startedAt + resolvedTimeoutMs;
        const timeoutId = globalThis.setTimeout(() => {
          logger.warn('Force-closing leaked layout mutation', {
            mutationToken: token,
            sessionId,
            source,
            timeoutMs: resolvedTimeoutMs,
          });
          useChatStore.getState().layoutMutationEnd(sessionId, token);
        }, resolvedTimeoutMs);

        const sessionRegistry =
          layoutMutationRegistry.get(sessionId) ?? new Map<string, LayoutMutationRecord>();
        sessionRegistry.set(token, {
          source,
          startedAt,
          timeoutId,
          timeoutMs: resolvedTimeoutMs,
        });
        layoutMutationRegistry.set(sessionId, sessionRegistry);

        set((draft) => {
          draft.sessions[sessionId] ??= createEmptySession();
          const session = draft.sessions[sessionId];
          session.layoutPendingCount ??= 0;
          session.layoutPendingCount += 1;
          session.lastLayoutMutationAt = startedAt;
          session.layoutLeakDeadlineAt = deadlineAt;
        });

        return token;
      },

      layoutMutationEnd: (sessionId: string, mutationToken: string): void => {
        const sessionRegistry = layoutMutationRegistry.get(sessionId);
        const record = sessionRegistry?.get(mutationToken);
        if (!record) {
          return;
        }

        cancelLayoutMutationRecord(record);
        sessionRegistry?.delete(mutationToken);
        if (sessionRegistry?.size === 0) {
          layoutMutationRegistry.delete(sessionId);
        }

        const endedAt = Date.now();
        set((draft) => {
          const session = draft.sessions[sessionId];
          if (!session) {
            return;
          }

          session.layoutPendingCount = Math.max(0, (session.layoutPendingCount ?? 0) - 1);
          session.lastLayoutMutationAt = endedAt;
          session.layoutLeakDeadlineAt = getNextLayoutLeakDeadline(sessionId);
          if (session.layoutPendingCount === 0) {
            session.layoutSettledVersion ??= 0;
            session.layoutSettledVersion += 1;
            session.layoutLeakDeadlineAt = null;
          }
        });
      },

      markLayoutSettled: (id: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (session) {
            noteSynchronousLayoutMutation(session);
          }
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
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
            return;
          }

          // Slow path: find by ID (shouldn't happen in normal flow)
          const target = session.messages.find((m) => m.id === messageId);
          if (target) {
            target.content += content;
            target.displayedContent = target.content;
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
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
          session.layoutVersion += 1;
          noteSynchronousLayoutMutation(session);
        });
      },

      addMessage: (id: string, msg: ChatMessage): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          const session = draft.sessions[id];
          session.messages.push(msg);
          noteSynchronousLayoutMutation(session);
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
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
          }
        });
      },

      patchImagePreviewUrl: (
        id: string,
        messageId: string,
        matchPreviewUrl: string,
        previewUrl: string
      ): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;
          const message = session.messages.find((entry) => entry.id === messageId);
          const image = message?.attachedImages?.find(
            (entry) => entry.previewUrl === matchPreviewUrl
          );
          if (image) {
            image.previewUrl = previewUrl;
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
          }
        });
      },

      removeImageFromMessage: (id: string, messageId: string, matchPreviewUrl: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;
          const message = session.messages.find((entry) => entry.id === messageId);
          if (!message?.attachedImages) {
            return;
          }

          message.attachedImages = message.attachedImages.filter(
            (entry) => entry.previewUrl !== matchPreviewUrl
          );
          if (message.attachedImages.length === 0) {
            message.attachedImages = undefined;
          }
          session.layoutVersion += 1;
          noteSynchronousLayoutMutation(session);
        });
      },

      reconcileMessageId: (id: string, oldId: string, newId: string): void => {
        set((draft) => {
          const session = draft.sessions[id];
          if (!session) return;

          const msg = session.messages.find((m) => m.id === oldId);
          if (msg) {
            msg.id = newId;
            session.layoutVersion += 1;
            noteSynchronousLayoutMutation(session);
          }
        });
      },

      setAgentRunning: (id: string, running: boolean): void => {
        set((draft) => {
          if (!draft.sessions[id]) {
            draft.sessions[id] = createEmptySession();
            touchLru(draft.lruOrder, id);
          }
          const session = draft.sessions[id];
          session.isAgentRunning = running;
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
        clearLayoutMutationRuntime(oldId);
        set((draft) => {
          // Move session data from old key to new key
          if (draft.sessions[oldId]) {
            draft.sessions[newId] = draft.sessions[oldId];
            Reflect.deleteProperty(draft.sessions, oldId);
            const session = draft.sessions[newId];
            session.layoutPendingCount = 0;
            session.layoutLeakDeadlineAt = null;
            noteSynchronousLayoutMutation(session);
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

          if (draft.activeCompactions[oldId] !== undefined) {
            draft.activeCompactions[newId] = draft.activeCompactions[oldId];
            Reflect.deleteProperty(draft.activeCompactions, oldId);
          }

          // Update LRU order
          const lruIdx = draft.lruOrder.indexOf(oldId);
          if (lruIdx >= 0) {
            draft.lruOrder[lruIdx] = newId;
          }
        });
      },

      destroySession: (id: string): void => {
        clearLayoutMutationRuntime(id);
        set((draft) => {
          Reflect.deleteProperty(draft.sessions, id);
          Reflect.deleteProperty(draft.loadedSessions, id);
          Reflect.deleteProperty(draft.activeCompactions, id);

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
        removeRenderCache(id);
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

      markCompacting: (sessionId: string, compaction: ActiveCompaction): void => {
        set((draft) => {
          draft.activeCompactions[sessionId] = compaction;
        });
      },

      markCompactionTimedOut: (sessionId: string, messageId: string): void => {
        set((draft) => {
          const entry = draft.activeCompactions[sessionId];
          if (entry?.messageId === messageId && entry.status === 'pending') {
            draft.activeCompactions[sessionId] = {
              ...entry,
              status: 'timed_out',
            };
          }
        });
      },

      settleCompaction: (sessionId: string): void => {
        set((draft) => {
          Reflect.deleteProperty(draft.activeCompactions, sessionId);
        });
      },

      clearCompactionsByBackend: (_backend: ActiveCompaction['backend']): void => {
        set((draft) => {
          void _backend;
          for (const sessionId of Object.keys(draft.activeCompactions)) {
            Reflect.deleteProperty(draft.activeCompactions, sessionId);
          }
        });
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

// ────────────────────────────────────────────────────────────────────────────
// Per-Session Selectors (Multi-Instance Keep-Alive)
//
// These read a SPECIFIC session by ID (not the active session). Used by
// SessionInstance components so each keep-alive message list subscribes
// to its own session's data independently.
// ────────────────────────────────────────────────────────────────────────────

/** Messages for a specific session. Returns stable EMPTY_MESSAGES when session has no data. */
export function useSessionMessages(sessionId: string): ChatMessage[] {
  return useChatStore((s) => s.sessions[sessionId]?.messages ?? EMPTY_MESSAGES);
}

/** Whether a specific session's agent is running. */
export function useSessionAgentRunning(sessionId: string): boolean {
  return useChatStore((s) => s.sessions[sessionId]?.isAgentRunning ?? false);
}

/** Hydration state for a specific session. */
export function useSessionHydrationState(sessionId: string): SessionHydrationState {
  return useChatStore((s) => s.sessions[sessionId]?.hydrationState ?? 'unloaded');
}

/** Layout version for a specific session. */
export function useSessionLayoutVersion(sessionId: string): number {
  return useChatStore((s) => s.sessions[sessionId]?.layoutVersion ?? 0);
}

/** Pending async layout work for a specific session. */
export function useSessionLayoutPendingCount(sessionId: string): number {
  return useChatStore((s) => s.sessions[sessionId]?.layoutPendingCount ?? 0);
}

/** Settled layout version for a specific session. */
export function useSessionLayoutSettledVersion(sessionId: string): number {
  return useChatStore((s) => s.sessions[sessionId]?.layoutSettledVersion ?? 0);
}

/** Timestamp of the most recent layout mutation for a specific session. */
export function useSessionLastLayoutMutationAt(sessionId: string): number | null {
  return useChatStore((s) => s.sessions[sessionId]?.lastLayoutMutationAt ?? null);
}
