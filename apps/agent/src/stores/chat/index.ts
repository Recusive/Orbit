/**
 * Chat stores - Message state, queue, and streaming
 */

// Chat store (centralized session-keyed message state)
export {
  useChatStore,
  useActiveMessages,
  useActiveSession,
  useActiveSessionId,
  useIsAgentRunning,
  useIsStopPending,
  useSessionLastLayoutMutationAt,
  useSessionLayoutPendingCount,
  useSessionLayoutSettledVersion,
} from './chat-store';
export type {
  ActiveCompaction,
  ChatMeasurementCache,
  ChatSessionData,
  ChatStoreState,
  PersistedMeasurement,
  PendingMessage,
} from './chat-store';
export {
  usePendingConversationTitle,
  usePendingSessionId,
  usePendingSessionPhase,
  usePreMountSessionId,
  useSessionSwitchRequestId,
  useSessionSwitchStore,
} from './session-switch-store';
export type {
  PendingCreateState,
  PendingCreateStatus,
  PendingLoadStrategy,
  PendingSessionSwitch,
  ReadyInstancePhase,
  ReadyInstanceRecord,
  SessionSwitchStatus,
} from './session-switch-store';

// Queued message store
export { useQueuedMessageStore, useQueuedMessage } from './queued-message-store';
export type { QueuedMessage } from './queued-message-store';

// Pending context store
export { usePendingContextStore, enqueueContext, enqueueFileChip } from './pending-context-store';
