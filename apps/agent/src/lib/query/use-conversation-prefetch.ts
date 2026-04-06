import { useCallback, useEffect, useRef } from 'react';

import { loadConversationDetailFresh } from './conversation-detail';

import { preloadRenderCacheFromIdb } from '@/stores/chat/render-cache-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';

const PREMOUNT_DELAY_MS = 100;

export interface ConversationPrefetchController {
  prefetch: (sessionId: string) => void;
  cancel: (sessionId: string) => void;
}

/**
 * Stable sidebar prefetch callbacks for hover/focus warmup.
 *
 * Query prefetch and render-cache promotion are intentionally fire-and-forget.
 * The query layer deduplicates concurrent loads, so a later click can join the
 * in-flight request. Hidden pre-mounting is delayed slightly so rapid sweeps
 * across the sidebar do not create abandoned keep-alive instances.
 */
export function useConversationPrefetch(): ConversationPrefetchController {
  const timerRef = useRef<number | null>(null);
  const scheduledSessionIdRef = useRef<string | null>(null);

  const clearScheduledTimer = useCallback((sessionId?: string): void => {
    if (
      timerRef.current === null ||
      (sessionId !== undefined && scheduledSessionIdRef.current !== sessionId)
    ) {
      return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    scheduledSessionIdRef.current = null;
  }, []);

  const cancel = useCallback(
    (sessionId: string): void => {
      clearScheduledTimer(sessionId);
      useSessionSwitchStore.getState().clearPreMount(sessionId);
    },
    [clearScheduledTimer]
  );

  const prefetch = useCallback(
    (sessionId: string): void => {
      if (sessionId === '') {
        return;
      }

      if (
        (timerRef.current !== null && scheduledSessionIdRef.current === sessionId) ||
        useSessionSwitchStore.getState().preMountSessionId === sessionId
      ) {
        return;
      }

      clearScheduledTimer();
      useSessionSwitchStore.getState().clearPreMount();

      void loadConversationDetailFresh(sessionId);
      void preloadRenderCacheFromIdb(sessionId);

      scheduledSessionIdRef.current = sessionId;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;

        if (scheduledSessionIdRef.current !== sessionId) {
          return;
        }

        scheduledSessionIdRef.current = null;
        useSessionSwitchStore.getState().requestPreMount(sessionId);
      }, PREMOUNT_DELAY_MS);
    },
    [clearScheduledTimer]
  );

  useEffect(() => {
    return () => {
      clearScheduledTimer();
      useSessionSwitchStore.getState().clearPreMount();
    };
  }, [clearScheduledTimer]);

  return {
    prefetch,
    cancel,
  };
}
