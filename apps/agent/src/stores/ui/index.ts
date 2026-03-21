/**
 * UI store - User interface state
 */

export { selectChatFullWidth, useChatWidthStore } from './chat-width-store';

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
  useRepoRootPath,
  useHasWorkspace,
  useActiveConversationId,
  useActiveConversationTitle,
  useIsTitleLoading,
  useIsLoadingConversation,
  useIsConversationTransitioning,
  useConversations,
  useWorkspaceConversations,
  useTerminalPosition,
  useActivityTab,
  useBottomPanelTab,
  useSettingsOpen,
  useSettingsSection,
} from './ui-store';
export { useCanGoBack, useCanGoForward, useNavigationStore } from './navigation-store';

export type {
  StoredConversationSummary,
  ConversationSummary,
  TerminalPosition,
  ActivityTab,
  BottomPanelTab,
  HeaderTab,
} from './ui-store';

export {
  useLaunchSequenceStore,
  selectLaunchPhase,
  selectIsLaunchActive,
  selectLaunchRunId,
} from './launch-sequence-store';

export type { LaunchPhase } from './launch-sequence-store';

export {
  WELCOME_ANIMATIONS,
  selectEnableLaunchAnimation,
  selectWelcomeAnimation,
  useWelcomeAnimationStore,
} from './welcome-animation-store';

export type { WelcomeAnimationId, WelcomeAnimationInfo } from './welcome-animation-store';

export { useUpdateStore } from './update-store';
