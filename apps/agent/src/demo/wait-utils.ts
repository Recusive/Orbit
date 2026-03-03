import { useChatStore } from '@/stores/chat/chat-store';

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    if (ms <= 0) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onAbort = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      reject(createAbortError());
    };

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function waitForAgentComplete(
  sessionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const check = (): boolean => {
      const session = useChatStore.getState().sessions[sessionId];
      return session !== undefined && !session.isAgentRunning && !session.isStopPending;
    };

    if (check()) {
      resolve();
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(createAbortError());
    };

    unsubscribe = useChatStore.subscribe(() => {
      if (check()) {
        cleanup();
        resolve();
      }
    });

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForAgentComplete timed out for ${sessionId}`));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function waitForAgentStarted(
  sessionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const check = (): boolean => {
      const session = useChatStore.getState().sessions[sessionId];
      return session?.isAgentRunning === true;
    };

    if (check()) {
      resolve();
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(createAbortError());
    };

    unsubscribe = useChatStore.subscribe(() => {
      if (check()) {
        cleanup();
        resolve();
      }
    });

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForAgentStarted timed out for ${sessionId}`));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function waitForStreamingStarted(
  sessionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const check = (): boolean => {
      const session = useChatStore.getState().sessions[sessionId];
      if (!session) {
        return false;
      }

      const hasAssistantMessage = session.messages.some((message) => message.role === 'assistant');
      return session.isAgentRunning && hasAssistantMessage;
    };

    if (check()) {
      resolve();
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(createAbortError());
    };

    unsubscribe = useChatStore.subscribe(() => {
      if (check()) {
        cleanup();
        resolve();
      }
    });

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForStreamingStarted timed out for ${sessionId}`));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Resolve the effective session ID, waiting for creation if needed. */
export function resolveSessionIdForWait(timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const currentSessionId = useChatStore.getState().activeSessionId;
  if (currentSessionId && currentSessionId.length > 0) {
    return Promise.resolve(currentSessionId);
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(createAbortError());
    };

    unsubscribe = useChatStore.subscribe((state) => {
      const sessionId = state.lastCreatedSessionId ?? state.activeSessionId;
      if (sessionId && sessionId.length > 0) {
        cleanup();
        resolve(sessionId);
      }
    });

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for session creation'));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
