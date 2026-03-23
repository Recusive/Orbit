/**
 * Utilities - Helper functions and constants
 */

// General utilities
export {
  cn,
  formatTimestamp,
  truncatePath,
  formatFileSize,
  isMac,
  getCommandKey,
  getModifierSymbols,
  omit,
} from './utils';

// Diff utilities
export { computeSimpleDiff, getLanguageFromPath } from './diff-utils';
export { createDiffScheduler, diffScheduler } from './diff-scheduler';

// Image utilities
export { compressImage, getImageMimeType, isImageFile, isSvgFile } from './image-utils';
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
  INPUT_CONTROLS,
  CONTENT_CARD,
  RESIZE_HANDLE,
  TIME_MS,
  ANIMATION_DURATION,
  TRANSITIONS,
  DELAYS,
  AGENT_RUNNING_CLEAR_DELAY_MS,
  VIRTUALIZATION,
  SCROLL_THRESHOLD,
  TERMINAL,
  TERMINAL_PANEL,
  ACTIVITY_PANEL,
  CHAT_PANEL,
  DEFAULT_UI_STATE,
  KEYBOARD_SHORTCUTS,
  LAUNCH_SEQUENCE,
  GIT_STATUS_STYLES,
  TRANSITION_CLASSES,
  POPOVER_ANIMATION,
  getCollapseTransition,
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
