import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    toolCalls?: string[];
    tokens?: number;
    model?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  // Actions
  setActiveConversation: (id: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  createConversation: (title: string) => string;
  deleteConversation: (id: string) => void;
  clearMessages: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    conversations: [],
    activeConversationId: null,
    messages: {},

    setActiveConversation: (id: string) => {
      set((state) => {
        state.activeConversationId = id;
      });
    },

    addMessage: (conversationId: string, message: Message) => {
      set((state) => {
        // Initialize messages array for conversation if it doesn't exist
        state.messages[conversationId] ??= [];

        const messages = state.messages[conversationId];
        messages.push(message);

        // Update conversation metadata
        const conversation = state.conversations.find((c) => c.id === conversationId);
        if (conversation) {
          conversation.updatedAt = Date.now();
          conversation.messageCount = messages.length;
        }
      });
    },

    updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => {
      set((state) => {
        const messages = state.messages[conversationId];
        if (!messages) return;

        const message = messages.find((m) => m.id === messageId);
        if (message) {
          Object.assign(message, updates);
        }
      });
    },

    createConversation: (title: string) => {
      const random = Math.random().toString(36);
      const id = `conv_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        const newConversation: Conversation = {
          id,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
        };

        state.conversations.push(newConversation);
        state.messages[id] = [];
        state.activeConversationId = id;
      });

      return id;
    },

    deleteConversation: (id: string) => {
      set((state) => {
        state.conversations = state.conversations.filter((c) => c.id !== id);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete state.messages[id];

        if (state.activeConversationId === id) {
          state.activeConversationId = state.conversations[0]?.id ?? null;
        }
      });
    },

    clearMessages: (conversationId: string) => {
      set((state) => {
        if (state.messages[conversationId]) {
          state.messages[conversationId] = [];

          const conversation = state.conversations.find((c) => c.id === conversationId);
          if (conversation) {
            conversation.messageCount = 0;
            conversation.updatedAt = Date.now();
          }
        }
      });
    },
  }))
);
