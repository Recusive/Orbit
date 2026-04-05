/**
 * Centralized query key factory for conversation cache operations.
 */
export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    detail: (sessionId: string) => ['conversations', 'detail', sessionId] as const,
  },
} as const;
