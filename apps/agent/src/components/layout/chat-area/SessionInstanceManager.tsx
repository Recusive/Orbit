/**
 * SessionInstanceManager — LRU keep-alive manager for VirtuosoMessageList instances.
 *
 * Implements the Discord/Slack pattern: keep multiple VirtuosoMessageList instances
 * alive simultaneously (one per recently-visited session). The active instance is
 * visible; all others are hidden offscreen via CSS transform. Switching sessions =
 * CSS toggle, no data replacement, no size recalculation, instant handoff.
 *
 * LRU eviction at MAX_ALIVE_INSTANCES prevents unbounded DOM growth. Sessions with
 * an active agent are protected from eviction.
 *
 * CSS hiding strategy: `transform: translateX(-200vw)` moves hidden instances far
 * offscreen while keeping them fully rendered. This avoids:
 * - `opacity: 0` — WKWebView optimizes away rendering, VirtuosoMessageList gets
 *   zero-content scrollerH (the critical blocker we hit)
 * - `visibility: hidden` — WKWebView blocks RAFs
 * - `display: none` — destroys DOM, loses ResizeObserver measurements
 *
 * First-visit handoff: when switching to a new (unstabilized) session, the
 * PREVIOUS session's instance stays visible until the new one reports stable.
 * This prevents the blank gap between old→new during first-visit loading.
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SessionInstance } from './SessionInstance';

import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { FC } from 'react';

import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('SessionInstanceMgr');

/** Maximum number of VirtuosoMessageList instances to keep alive.
 *  10 instances × ~40 virtualized items × ~50 DOM nodes = ~20,000 nodes.
 *  Acceptable for a desktop Tauri app. */
const MAX_ALIVE_INSTANCES = 10;

export interface SessionInstanceManagerProps {
  readonly activeSessionId: string | undefined;
  /** When true, the active session has no messages (empty state).
   *  Don't mount a new instance for it, but keep existing hidden instances alive. */
  readonly isActiveHidden?: boolean;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
}

/**
 * Tracks which sessions have been mounted (LRU order, most recent at end).
 * Once mounted, a session stays alive until evicted when over the limit.
 * Mirrors the `useMountedTabs` pattern in App.tsx:207-223.
 *
 * Eviction protects:
 * - The active session (always pinned)
 * - Sessions with an active agent (checked via store.getState())
 */
function useMountedSessions(activeSessionId: string | undefined): string[] {
  const [mountedSessions, setMountedSessions] = useState<string[]>(() =>
    activeSessionId !== undefined && activeSessionId !== '' ? [activeSessionId] : []
  );
  const prevActiveRef = useRef(activeSessionId);

  useEffect(() => {
    if (activeSessionId === undefined || activeSessionId === '') return;
    if (activeSessionId === prevActiveRef.current) return;

    const prevId = prevActiveRef.current;
    prevActiveRef.current = activeSessionId;

    setMountedSessions((prev) => {
      // Build next list: move to end (MRU) or append
      const idx = prev.indexOf(activeSessionId);
      const isRevisit = idx >= 0;
      const next = isRevisit
        ? [...prev.slice(0, idx), ...prev.slice(idx + 1), activeSessionId]
        : [...prev, activeSessionId];

      logger.debug('Session switch', {
        from: prevId ?? '(none)',
        to: activeSessionId,
        isRevisit,
        mountedCount: next.length,
        mountedIds: next.map((s) => s.slice(-6)),
      });

      // Evict from front (LRU) when over limit
      if (next.length <= MAX_ALIVE_INSTANCES) return next;

      const sessions = useChatStore.getState().sessions;
      const evicted: string[] = [];
      let i = 0;

      while (next.length - evicted.length > MAX_ALIVE_INSTANCES && i < next.length) {
        const candidate = next[i];
        if (candidate === undefined) break;
        // Never evict the active session
        if (candidate === activeSessionId) {
          i++;
          continue;
        }
        // Protect sessions with running agents
        if (sessions[candidate]?.isAgentRunning === true) {
          i++;
          continue;
        }
        evicted.push(candidate);
        i++;
      }

      if (evicted.length === 0) return next;
      logger.debug('Evicting sessions', { evicted: evicted.map((s) => s.slice(-6)) });
      const evictedSet = new Set(evicted);
      return next.filter((sid) => !evictedSet.has(sid));
    });
  }, [activeSessionId]);

  // Handle session deletion — remove destroyed sessions
  useEffect(() => {
    return useChatStore.subscribe((state, prevState) => {
      // Check for sessions removed from the store
      for (const sid of Object.keys(prevState.sessions)) {
        if (!(sid in state.sessions)) {
          setMountedSessions((prev) => {
            const idx = prev.indexOf(sid);
            if (idx < 0) return prev;
            const next = [...prev];
            next.splice(idx, 1);
            return next;
          });
        }
      }
    });
  }, []);

  return mountedSessions;
}

export const SessionInstanceManager: FC<SessionInstanceManagerProps> = ({
  activeSessionId,
  isActiveHidden = false,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
}) => {
  // Don't add the active session to the mount list when it's empty (isActiveHidden).
  // This prevents mounting a VirtuosoMessageList for a session with 0 messages.
  // Hidden instances from previous sessions stay alive.
  const effectiveActiveId = isActiveHidden ? undefined : activeSessionId;
  const mountedSessions = useMountedSessions(effectiveActiveId);

  // ── First-visit handoff ─────────────────────────────────────────────
  // Track the last session that was actually SHOWN (stabilized + active).
  // During first visit to a new session, keep the previous session visible
  // until the new one stabilizes. This prevents the blank gap.
  const [shownSessionId, setShownSessionId] = useState(activeSessionId);
  const stabilizedSetRef = useRef(new Set<string>());

  // When the active session changes to one that's already stabilized
  // (revisit), update shownSessionId immediately.
  useEffect(() => {
    if (isActiveHidden || activeSessionId === undefined) return;
    const isRevisit = stabilizedSetRef.current.has(activeSessionId);
    if (isRevisit) {
      setShownSessionId(activeSessionId);
    }
    logger.debug('Active session changed', {
      activeId: activeSessionId.slice(-6),
      isRevisit,
      shownId: shownSessionId?.slice(-6) ?? '(none)',
      stabilizedCount: stabilizedSetRef.current.size,
    });
    // For first visits, shownSessionId stays as the PREVIOUS session
    // until onStabilized fires for the new session.
  }, [activeSessionId, isActiveHidden, shownSessionId]);

  const handleStabilized = useCallback((sessionId: string) => {
    stabilizedSetRef.current.add(sessionId);
    // If this session is the current active, make it the shown session
    // (replaces the old "held over" session).
    setShownSessionId((prev) => {
      const currentActive = useChatStore.getState().activeSessionId;
      if (sessionId === currentActive) {
        logger.debug('First-visit handoff', {
          from: prev?.slice(-6) ?? '(none)',
          to: sessionId.slice(-6),
        });
        return sessionId;
      }
      return prev;
    });
  }, []);

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {mountedSessions.map((sid) => {
        // An instance is "active" (visible) if it's either:
        // 1. The current active session AND already stabilized, OR
        // 2. The last shown session (held over during first-visit stabilization)
        const isTargetActive = sid === activeSessionId && !isActiveHidden;
        const isStabilized = stabilizedSetRef.current.has(sid);
        const isShownAsHoldover = sid === shownSessionId && !isActiveHidden;
        const isActive = (isTargetActive && isStabilized) || isShownAsHoldover;

        return (
          <SessionInstance
            key={sid}
            sessionId={sid}
            isActive={isActive}
            queuedMessage={isTargetActive ? queuedMessage : null}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
            onStabilized={handleStabilized}
          />
        );
      })}
    </div>
  );
};
