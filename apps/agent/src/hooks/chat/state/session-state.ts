import { useEffect, useRef, useState } from 'react';

import type { ImageAttachment } from '@/components/chat';
import type { ReactElementContext } from '@/types/protocol';

import { useToolStore } from '@/stores/agent/tool-store';

interface UseSessionStateReturn {
  sessionId: string;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  sessionIdRef: React.RefObject<string>;
  pendingMessage: {
    text: string;
    contextFiles?: string[] | undefined;
    images?: ImageAttachment[] | undefined;
    elements?: ReactElementContext[] | undefined;
  } | null;
  setPendingMessage: React.Dispatch<
    React.SetStateAction<{
      text: string;
      contextFiles?: string[] | undefined;
      images?: ImageAttachment[] | undefined;
      elements?: ReactElementContext[] | undefined;
    } | null>
  >;
}

export function useSessionState(): UseSessionStateReturn {
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem('orbit-sessionId') ?? '';
    } catch {
      return '';
    }
  });
  const [pendingMessage, setPendingMessage] = useState<{
    text: string;
    contextFiles?: string[] | undefined;
    images?: ImageAttachment[] | undefined;
    elements?: ReactElementContext[] | undefined;
  } | null>(null);

  // Refs to track current state (for use in callbacks without deps issues)
  const sessionIdRef = useRef<string>(sessionId);
  sessionIdRef.current = sessionId;

  const { switchSession } = useToolStore();

  // Persist sessionId to localStorage (survives webview reloads)
  useEffect(() => {
    try {
      localStorage.setItem('orbit-sessionId', sessionId);
    } catch {
      // Ignore storage errors
    }
  }, [sessionId]);

  // Sync tool store's currentSessionId when React sessionId changes
  // This is critical for usage tracking - without this, usage accumulated before the first
  // switchSession call (e.g., from localStorage restore or system:init) won't be cached
  // when switching conversations, causing token counts to reset to 0.
  useEffect(() => {
    if (sessionId) {
      const toolState = useToolStore.getState();
      if (toolState.currentSessionId !== sessionId) {
        switchSession(sessionId);
      }
    }
  }, [sessionId, switchSession]);

  return {
    sessionId,
    setSessionId,
    sessionIdRef,
    pendingMessage,
    setPendingMessage,
  };
}
