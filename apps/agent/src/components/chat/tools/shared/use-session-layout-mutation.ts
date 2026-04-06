import { useCallback, useLayoutEffect, useRef } from 'react';

import type { RefObject } from 'react';

import { useChatStore } from '@/stores/chat/chat-store';

interface SessionLayoutMutationLease {
  readonly complete: () => void;
}

export function useBeginSessionLayoutMutation(
  sessionId: string | null | undefined,
  source: string,
  timeoutMs?: number
): () => SessionLayoutMutationLease {
  return useCallback((): SessionLayoutMutationLease => {
    if (!sessionId) {
      return {
        complete: () => undefined,
      };
    }

    const mutationToken = useChatStore.getState().layoutMutationStart(sessionId, source, timeoutMs);
    let completed = false;

    return {
      complete: (): void => {
        if (completed) {
          return;
        }

        completed = true;
        useChatStore.getState().layoutMutationEnd(sessionId, mutationToken);
      },
    };
  }, [sessionId, source, timeoutMs]);
}

export function useObservedSessionLayoutMutation<TElement extends HTMLElement = HTMLElement>(
  sessionId: string | null | undefined,
  source: string,
  watchKey: string,
  active = true,
  stableMs = 48,
  timeoutMs?: number
): RefObject<TElement | null> {
  const beginLayoutMutation = useBeginSessionLayoutMutation(sessionId, source, timeoutMs);
  const containerRef = useRef<TElement | null>(null);
  const activeLeaseRef = useRef<SessionLayoutMutationLease | null>(null);

  useLayoutEffect(() => {
    if (!active || !sessionId) {
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    let settleTimer: number | null = null;
    let frameId: number | null = null;

    const ensureLease = (): SessionLayoutMutationLease => {
      activeLeaseRef.current ??= beginLayoutMutation();
      return activeLeaseRef.current;
    };

    const finish = (): void => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      activeLeaseRef.current?.complete();
      activeLeaseRef.current = null;
    };

    const scheduleSettle = (): void => {
      ensureLease();
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        activeLeaseRef.current?.complete();
        activeLeaseRef.current = null;
      }, stableMs);
    };

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      scheduleSettle();
    });

    const observer = new ResizeObserver(() => {
      scheduleSettle();
    });
    observer.observe(node);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      finish();
    };
  }, [active, beginLayoutMutation, sessionId, stableMs, watchKey]);

  return containerRef;
}
