/**
 * Utilities - Helper functions and constants
 */

// General utilities
export { cn, formatTimestamp, truncatePath } from './utils';

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
  DEFAULT_UI_STATE,
  KEYBOARD_SHORTCUTS,
  GIT_STATUS_STYLES,
} from './constants';
export type { KeyboardShortcutDef, GitStatusStyle } from './constants';

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

// Event batching utilities
export { debounce, throttle, rafBatch, createCheckpointBatcher } from './event-batcher';
export type { RafBatchHandler, CheckpointBatch, ToolEventBatch } from './event-batcher';

// MCP tool utilities
export { formatMcpToolName, isBrowserTool, isMcpTool, getMcpToolProvider } from './mcp-tools';
