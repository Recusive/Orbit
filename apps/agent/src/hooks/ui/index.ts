/**
 * UI hooks - User interface utilities
 */

export {
  useKeyboardShortcuts,
  useDefaultKeyboardShortcuts,
  defaultShortcuts,
} from './use-keyboard-shortcuts';
export type {
  KeyboardShortcut,
  UseKeyboardShortcutsOptions,
  UseKeyboardShortcutsReturn,
} from './use-keyboard-shortcuts';

export { useRecentProjects } from './use-recent-projects';
export type { RecentProject, UseRecentProjectsReturn } from './use-recent-projects';

export { useResizable } from './use-resizable';
export type {
  ResizeDirection,
  ResizeConstraints,
  UseResizableOptions,
  UseResizableReturn,
} from './use-resizable';

export { useSearch } from './use-search';
export type { UseSearchOptions, UseSearchReturn } from './use-search';

export { useMentionSearch } from './use-mention-search';
export type { UseMentionSearchOptions, UseMentionSearchReturn } from './use-mention-search';

export { useContainerWidth } from './use-container-width';

export { useTrafficLights } from './use-traffic-lights';
export { useFullscreen } from './use-fullscreen';
