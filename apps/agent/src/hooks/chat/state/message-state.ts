import { useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '@/components/chat';

interface UseMessageStateReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  messagesRef: React.RefObject<ChatMessage[]>;
}

export function useMessageState(sessionId: string): UseMessageStateReturn {
  // CRITICAL: Always start empty - do NOT read from global localStorage
  // Global localStorage was causing stale messages from previous sessions to appear
  // when new Canvas agent nodes created conversations. The backend is the source of
  // truth for messages, and conversation:loaded populates messages for existing sessions.
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Cache messages by sessionId for fast in-memory switching (not persistence)
  const messagesCache = useRef<Map<string, ChatMessage[]>>(new Map());

  // Refs to track current state (for use in callbacks without deps issues)
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // Track the previous sessionId to detect session switches
  const prevSessionIdRef = useRef<string>(sessionId);

  // Session-aware initialization: when sessionId changes, check cache or start empty
  useEffect(() => {
    // Only react to sessionId changes, not the initial mount (handled by conversation:loaded)
    if (prevSessionIdRef.current === sessionId) {
      return;
    }
    prevSessionIdRef.current = sessionId;

    if (!sessionId) {
      setMessages([]);
      return;
    }

    // Check in-memory cache for fast session switching
    const cached = messagesCache.current.get(sessionId);
    if (cached) {
      setMessages(cached);
    }
    // For new sessions, messages stay empty - conversation:created/loaded will populate if needed
  }, [sessionId]);

  // Save messages to cache whenever they change (for conversation switching)
  // IMPORTANT: Also clear cache when messages become empty to prevent stale restores
  // after rewind operations or explicit message clearing
  useEffect(() => {
    if (sessionId) {
      if (messages.length > 0) {
        messagesCache.current.set(sessionId, messages);
      } else {
        // Clear cache entry when messages are empty - prevents stale messages
        // from being restored when switching back to this session
        messagesCache.current.delete(sessionId);
      }
    }
  }, [sessionId, messages]);

  // NOTE: localStorage persistence REMOVED
  // The backend stores all messages per-session in ~/Library/Application Support/orbit/
  // Removing localStorage fixes the race condition where new Canvas agent nodes would
  // display stale messages from the global 'orbit-messages' key before setMessages([])
  // from conversation:created could take effect.

  // Animation interval removed for performance - streaming effect now achieved
  // through backend batching (50ms) + Streamdown's incremental markdown rendering.

  return {
    messages,
    setMessages,
    messagesCache,
    messagesRef,
  };
}
