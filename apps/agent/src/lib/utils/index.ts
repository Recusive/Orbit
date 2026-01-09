/**
 * Utilities - Helper functions and constants
 */

// General utilities
export { cn, formatTimestamp, formatFileSize, truncatePath } from './utils';

// Diff utilities
export { computeSimpleDiff, getLanguageFromPath } from './diff-utils';

// Image utilities
export { compressImage } from './image-utils';
export type { CompressedImage } from './image-utils';

// Constants
export {
  SIDEBAR,
  HEIGHTS,
  PANEL_SIZES,
  CHAT_WIDTH,
  CHAT_SPACING,
  CHAT_WIDTH_VAR,
  INPUT_SIZES,
  RESIZE_HANDLE,
  TIME_MS,
  ANIMATION_DURATION,
  TRANSITIONS,
  DELAYS,
  VIRTUALIZATION,
  SCROLL_THRESHOLD,
  TERMINAL,
  FONT_SIZE,
  DEFAULT_UI_STATE,
  KEYBOARD_SHORTCUTS,
  FILE_ICONS,
  AGENT_PHASES,
  MODEL_OPTIONS,
  GIT_STATUS_STYLES,
} from './constants';
export type { AgentPhase, ModelOption, ModelId, ModelTier, GitStatusStyle } from './constants';

// Icon map
export {
  fileExtensionMap,
  fileNameMap,
  testFilePatterns,
  folderNameMap,
  defaultFileIcon,
  defaultFolderIcon,
  defaultFolderOpenIcon,
  getFileIconName,
  getFolderIconName,
} from './iconMap';
