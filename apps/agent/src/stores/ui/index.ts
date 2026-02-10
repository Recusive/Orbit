/**
 * UI store - User interface state
 */

export {
  AVAILABLE_THEMES,
  THEME_BY_ID,
  selectIconTheme,
  selectUsesDarkInvert,
  useCurrentThemeInfo,
  useIconThemeStore,
} from './icon-theme-store';

export type { IconThemeDarkMode, IconThemeId, IconThemeInfo } from './icon-theme-store';

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

export {
  WELCOME_ANIMATIONS,
  selectWelcomeAnimation,
  useWelcomeAnimationStore,
} from './welcome-animation-store';

export type { WelcomeAnimationId, WelcomeAnimationInfo } from './welcome-animation-store';
