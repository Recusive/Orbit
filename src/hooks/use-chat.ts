import { useCallback, useMemo } from 'react';

import { useChatStore  } from '../stores/chat-store';

import { useVSCode } from './use-vscode';

import type {Message} from '../stores/chat-store';

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
  const { sendMessage: sendVSCodeMessage } = useVSCode();

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

      // Optimistic update - add message immediately
      const userMessage: Message = {
        id: tempId,
        conversationId: activeConversationId,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      addMessageAction(activeConversationId, userMessage);

      try {
        // Send to VS Code extension
        sendVSCodeMessage({
          type: 'chat.sendMessage',
          messageId: tempId,
          content,
          timestamp: Date.now(),
        });
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
    [sendVSCodeMessage, addMessageAction, activeConversationId]
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
        sendVSCodeMessage({
          type: 'chat.editMessage',
          messageId,
          content,
          timestamp: Date.now(),
        });
        return Promise.resolve();
      } catch (err) {
        // Revert on error
        updateMessageAction(activeConversationId, messageId, {
          content: originalMessage.content,
        });
        throw err;
      }
    },
    [sendVSCodeMessage, updateMessageAction, messages, activeConversationId]
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

      sendVSCodeMessage({
        type: 'chat.deleteMessage',
        messageId,
        timestamp: Date.now(),
      });
      return Promise.resolve();
    },
    [sendVSCodeMessage, messages, activeConversationId]
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
