/**
 * PrimarySidebar - Main navigation sidebar module
 *
 * Drop-in replacement for the original primary-sidebar.tsx
 */

// Main component
export { PrimarySidebar } from './PrimarySidebar';

// Sub-components
export {
  ConversationItem,
  ConversationList,
  SidebarItem,
  SidebarToggleIcon,
  TabButton,
  WorkspaceItem,
} from './components';

// Hooks
export { useSidebarActions } from './hooks';

// Types
export type {
  ConversationItemProps,
  EditorSidebarTab,
  PrimarySidebarProps,
  SidebarItemProps,
  SidebarTab,
  SidebarToggleIconProps,
  TabButtonProps,
  WorkspaceItemProps,
} from './types';
