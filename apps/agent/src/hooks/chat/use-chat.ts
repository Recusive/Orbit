import { useCallback, useMemo } from 'react';

import type { Message } from '@/stores/chat/chat-store';
import type { SendMessage, EditMessage, DeleteMessage } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { useChatStore } from '@/stores/chat/chat-store';
import { generateUUID } from '@/types/protocol';

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  clearMessages: () => void;
  retryMessage: (messageId: string) => Promise<void>;
}

/**
 * Hook for chat operations with optimistic updates
 * Handles message sending, editing, and deletion
 */
export function useChat(): UseChatReturn {
  const { postMessage } = useTauri();

  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const messagesRecord = useChatStore((state) => state.messages);
  const addMessageAction = useChatStore((state) => state.addMessage);
  const updateMessageAction = useChatStore((state) => state.updateMessage);
  const clearMessagesAction = useChatStore((state) => state.clearMessages);

  // Get messages for active conversation
  const messages = useMemo(() => {
    if (!activeConversationId) return [];
    return messagesRecord[activeConversationId] ?? [];
  }, [activeConversationId, messagesRecord]);

  // Track loading state based on message statuses
  const isLoading = useMemo(() => {
    return messages.some((m) => m.metadata?.tokens === undefined && m.role === 'assistant');
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }

      const tempId = `temp-${String(Date.now())}`;
      const timestamp = Date.now();

      // Optimistic update - add message immediately
      const userMessage: Message = {
        id: tempId,
        conversationId: activeConversationId,
        role: 'user',
        content,
        timestamp,
      };

      addMessageAction(activeConversationId, userMessage);

      try {
        // Send to VS Code extension
        // IMPORTANT: Use tempId (the user message ID) so checkpoints are associated correctly
        postMessage({
          type: 'message:send',
          uuid: tempId,
          session_id: activeConversationId,
          content,
        } satisfies SendMessage);
        await Promise.resolve();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';

        // Add error message
        addMessageAction(activeConversationId, {
          id: `error-${String(Date.now())}`,
          conversationId: activeConversationId,
          role: 'assistant',
          content: `Error: ${errorMessage}`,
          timestamp: Date.now(),
        });

        throw err;
      }
    },
    [postMessage, addMessageAction, activeConversationId]
  );

  const editMessage = useCallback(
    (messageId: string, content: string): Promise<void> => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }

      const originalMessage = messages.find((m) => m.id === messageId);
      if (!originalMessage) {
        throw new Error('Message not found');
      }

      // Optimistic update
      updateMessageAction(activeConversationId, messageId, { content });

      try {
        postMessage({
          type: 'message:edit',
          uuid: generateUUID(),
          session_id: activeConversationId,
          message_id: messageId,
          content,
        } satisfies EditMessage);
        return Promise.resolve();
      } catch (err) {
        // Revert on error
        updateMessageAction(activeConversationId, messageId, {
          content: originalMessage.content,
        });
        throw err;
      }
    },
    [postMessage, updateMessageAction, messages, activeConversationId]
  );

  const deleteMessage = useCallback(
    (messageId: string): Promise<void> => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }

      // Store the message before deletion for potential restoration
      const messageToDelete = messages.find((m) => m.id === messageId);
      if (!messageToDelete) {
        throw new Error('Message not found');
      }

      postMessage({
        type: 'message:delete',
        uuid: generateUUID(),
        session_id: activeConversationId,
        message_id: messageId,
      } satisfies DeleteMessage);
      return Promise.resolve();
    },
    [postMessage, messages, activeConversationId]
  );

  const clearMessages = useCallback(() => {
    if (!activeConversationId) return;
    clearMessagesAction(activeConversationId);
  }, [clearMessagesAction, activeConversationId]);

  const retryMessage = useCallback(
    async (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Remove the failed message and resend
      await deleteMessage(messageId);
      await sendMessage(message.content);
    },
    [messages, deleteMessage, sendMessage]
  );

  return {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    clearMessages,
    retryMessage,
  };
}
