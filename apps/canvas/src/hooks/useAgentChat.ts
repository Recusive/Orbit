/**
 * useAgentChat - Hook for managing agent chat state
 *
 * Provides:
 * - Message history management (text, tool_use, thinking)
 * - Agent connection status tracking
 * - Message sending via useTauriCanvas
 * - Streaming response handling
 */

import { useCallback, useState, useRef, useEffect } from 'react';

import { useTauriCanvas } from './useTauriCanvas';

import type { TauriCanvasCallbacks } from './useTauriCanvas';
import type { AgentStatus } from '../components/AgentStatusBadge';
import type { Message } from '../components/chat/ChatMessage';
import type { ThinkingMessage } from '../components/chat/ThinkingBubble';
import type { ToolUseMessage } from '../components/chat/ToolUseBubble';

// Union type for all chat messages
export type ChatMessage = Message | ToolUseMessage | ThinkingMessage;

// Generate a unique session ID for this chat instance
function generateSessionId(): string {
  return `canvas-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface UseAgentChatReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  sendMessage: (content: string, nodeId?: string) => void;
  clearMessages: () => void;
  isLoading: boolean;
  error: string | null;
}

// Generate unique message ID
function generateMessageId(): string {
  return `msg-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useAgentChat(): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>('ready');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current assistant message being streamed
  const currentAssistantMessageRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>('');

  // Track tool use messages by toolId for status updates
  const toolUseMessagesRef = useRef<Map<string, string>>(new Map());

  // Track current thinking message
  const currentThinkingMessageRef = useRef<string | null>(null);

  // Callbacks for handling messages from Tauri backend
  // NOTE: onSessionState was removed - session state updates are not yet implemented in Tauri
  const callbacks: TauriCanvasCallbacks = {
    onAgentResponse: (content: string, _nodeId?: string, done?: boolean): void => {
      // Clear thinking message when actual response content arrives
      if (content && currentThinkingMessageRef.current) {
        currentThinkingMessageRef.current = null;
      }

      // Skip if no content (avoid empty string being concatenated)
      if (content !== '') {
        streamingContentRef.current += content;
      }

      // Only update/create message if we have content to show
      if (streamingContentRef.current !== '') {
        if (currentAssistantMessageRef.current !== null) {
          // Update existing message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMessageRef.current
                ? { ...m, content: streamingContentRef.current }
                : m
            )
          );
        } else {
          // Create new assistant message
          const newId = generateMessageId();
          currentAssistantMessageRef.current = newId;
          setMessages((prev) => [
            ...prev,
            {
              id: newId,
              role: 'assistant',
              content: streamingContentRef.current,
              timestamp: new Date(),
            },
          ]);
        }
      }

      if (done) {
        // Message complete - reset all tracking refs
        currentAssistantMessageRef.current = null;
        streamingContentRef.current = '';
        currentThinkingMessageRef.current = null;
        toolUseMessagesRef.current.clear();
        setStatus('ready');
        setIsLoading(false);
      }
    },

    onAgentThinking: (content: string): void => {
      setStatus('thinking');

      if (content === '') return;

      if (currentThinkingMessageRef.current !== null) {
        // Update existing thinking message
        setMessages((prev) =>
          prev.map((m) => {
            if (
              m.id === currentThinkingMessageRef.current &&
              'type' in m &&
              m.type === 'thinking'
            ) {
              return { ...m, content: m.content + content };
            }
            return m;
          })
        );
      } else {
        // Create new thinking message
        const newId = generateMessageId();
        currentThinkingMessageRef.current = newId;
        const thinkingMessage: ThinkingMessage = {
          id: newId,
          type: 'thinking',
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, thinkingMessage]);
      }
    },

    onAgentToolUse: (
      toolName: string,
      toolId: string,
      toolInput: unknown,
      status: string
    ): void => {
      // Clear current thinking message when tool starts
      if (currentThinkingMessageRef.current !== null) {
        currentThinkingMessageRef.current = null;
      }

      const existingMsgId = toolUseMessagesRef.current.get(toolId);

      if (existingMsgId !== undefined) {
        // Update existing tool use message status
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === existingMsgId && 'type' in m && m.type === 'tool_use') {
              return {
                ...m,
                status: status as 'running' | 'success' | 'error',
              };
            }
            return m;
          })
        );
      } else {
        // Create new tool use message
        const newId = generateMessageId();
        toolUseMessagesRef.current.set(toolId, newId);
        const toolUseMessage: ToolUseMessage = {
          id: newId,
          type: 'tool_use',
          toolName,
          toolId,
          toolInput,
          status: status as 'running' | 'success' | 'error',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, toolUseMessage]);
      }
    },

    onAgentError: (errorMsg: string): void => {
      setError(errorMsg);
      setStatus('error');
      setIsLoading(false);
      currentAssistantMessageRef.current = null;
      streamingContentRef.current = '';
    },
  };

  const { isConnected, sendPrompt, createSession } = useTauriCanvas(callbacks);

  // Session ID ref - persists across re-renders
  const sessionIdRef = useRef<string | null>(null);

  // Create session when connected
  useEffect(() => {
    if (!isConnected) {
      setStatus('disconnected');
      return;
    }

    // Create session if not already created
    if (sessionIdRef.current === null) {
      const sessionId = generateSessionId();
      sessionIdRef.current = sessionId;
      createSession(sessionId);
      console.warn('[useAgentChat] Created session:', sessionId);
    }

    if (status === 'disconnected') {
      setStatus('ready');
    }
  }, [isConnected, createSession, status]);

  // Send a message to the agent
  const sendMessage = useCallback(
    (content: string, nodeId?: string): void => {
      if (!content.trim() || isLoading) return;

      // Add user message
      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        status: 'sending',
      };

      setMessages((prev) => [...prev, userMessage]);
      setError(null);
      setIsLoading(true);
      setStatus('thinking');

      // Send to extension with optional nodeId for targeted code updates
      sendPrompt(content.trim(), nodeId);

      // Mark as sent
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userMessage.id && m.type !== 'tool_use' && m.type !== 'thinking') {
            return { ...m, status: 'sent' as const };
          }
          return m;
        })
      );
    },
    [isLoading, sendPrompt]
  );

  // Clear all messages
  const clearMessages = useCallback((): void => {
    setMessages([]);
    setError(null);
    currentAssistantMessageRef.current = null;
    streamingContentRef.current = '';
    currentThinkingMessageRef.current = null;
    toolUseMessagesRef.current.clear();
  }, []);

  return {
    messages,
    status,
    sendMessage,
    clearMessages,
    isLoading,
    error,
  };
}
