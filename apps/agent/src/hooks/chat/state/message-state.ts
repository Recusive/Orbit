import { useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '@/components/chat';

import { StoredChatMessageArraySchema } from '@/types/protocol';

interface UseMessageStateReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  messagesRef: React.RefObject<ChatMessage[]>;
}

export function useMessageState(sessionId: string): UseMessageStateReturn {
  // Restore state from localStorage on mount (survives webview reloads)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('orbit-messages');
      if (saved === null) {
        return [];
      }
      const json: unknown = JSON.parse(saved);
      const result = StoredChatMessageArraySchema.safeParse(json);
      if (!result.success) {
        return [];
      }
      return result.data;
    } catch {
      return [];
    }
  });

  // Cache messages by sessionId to preserve state when switching conversations
  const messagesCache = useRef<Map<string, ChatMessage[]>>(new Map());

  // Refs to track current state (for use in callbacks without deps issues)
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // Save messages to cache whenever they change (for conversation switching)
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      messagesCache.current.set(sessionId, messages);
    }
  }, [sessionId, messages]);

  // Persist messages to localStorage (survives webview reloads)
  useEffect(() => {
    try {
      localStorage.setItem('orbit-messages', JSON.stringify(messages));
    } catch {
      // Ignore storage errors
    }
  }, [messages]);

  // Animation interval removed for performance - streaming effect now achieved
  // through backend batching (50ms) + Streamdown's incremental markdown rendering.

  return {
    messages,
    setMessages,
    messagesCache,
    messagesRef,
  };
}
