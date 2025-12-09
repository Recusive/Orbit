/**
 * Lib utilities barrel export
 */

// Utility functions
export {
  cn,
  formatTimestamp,
  formatFileSize,
  truncatePath,
  generateId,
} from './utils';

// Constants
export {
  PANEL_SIZES,
  ANIMATION_DURATION,
  KEYBOARD_SHORTCUTS,
  FILE_ICONS,
  AGENT_PHASES,
  MODEL_OPTIONS,
  type AgentPhase,
  type ModelOption,
  type ModelId,
  type ModelTier,
} from './constants';

// VS Code API
export {
  getVSCodeAPI,
  postMessage,
  onMessage,
  getState,
  setState,
  isVSCodeEnvironment,
  createMessageSender,
  createMessageListener,
  type VSCodeMessage,
  type MessageHandler,
} from './vscode-api';
