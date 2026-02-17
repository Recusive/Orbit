import { create } from 'zustand';

import type { ImageAttachment } from '@/components/chat';
import type { ReactElementContext } from '@/types/protocol';

export interface QueuedMessage {
  id: string;
  text: string;
  contextFiles?: string[] | undefined;
  images?: ImageAttachment[] | undefined;
  elements?: ReactElementContext[] | undefined;
  skills?: string[] | undefined;
  queuedAt: number;
  sessionId: string; // Track which session this message belongs to
}

interface QueuedMessageState {
  queuedMessage: QueuedMessage | null;
  // Actions
  queueMessage: (message: Omit<QueuedMessage, 'id' | 'queuedAt'>) => void;
  clearQueue: () => void;
  clearQueueForSession: (sessionId: string) => void;
  getQueuedMessage: () => QueuedMessage | null;
}

export const useQueuedMessageStore = create<QueuedMessageState>((set, get) => ({
  queuedMessage: null,

  queueMessage: (message) => {
    set({
      queuedMessage: {
        ...message,
        id: crypto.randomUUID(),
        queuedAt: Date.now(),
      },
    });
  },

  clearQueue: () => {
    set({ queuedMessage: null });
  },

  clearQueueForSession: (sessionId: string) => {
    const current = get().queuedMessage;
    if (current?.sessionId === sessionId) {
      set({ queuedMessage: null });
    }
  },

  getQueuedMessage: () => get().queuedMessage,
}));

// Selector hooks
export const useQueuedMessage = (): QueuedMessage | null =>
  useQueuedMessageStore((state) => state.queuedMessage);
