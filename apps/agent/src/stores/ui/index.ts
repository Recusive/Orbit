/**
 * UI store - User interface state
 */

export {
  useUIStore,
  useIsLeftSidebarCollapsed,
  useWorkspaceName,
  useWorkspacePath,
  useHasWorkspace,
  useActiveConversationId,
  useActiveConversationTitle,
  useIsLoadingConversation,
  useIsConversationTransitioning,
  useConversations,
  useWorkspaceConversations,
  useTerminalPosition,
  useActivityTab,
  useBottomPanelTab,
} from './ui-store';

export type {
  StoredConversationSummary,
  ConversationSummary,
  TerminalPosition,
  ActivityTab,
  BottomPanelTab,
  HeaderTab,
} from './ui-store';
