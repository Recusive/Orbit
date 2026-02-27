/**
 * Session Management Module
 */
export { SessionManager, repairPollutedJsonls, stripRewindPollution } from './session-manager.js';
export type {
  AgentMessage,
  PermissionRequest,
  PermissionResponse,
  SessionConfig,
  SessionInitEvent,
  SerializableError,
  ForkSessionOptions,
  ForkSessionResult,
} from './session-manager.js';

export {
  saveSession,
  saveSessionInitMapping,
  getSDKSessionIdForSession,
  touchSession,
  deleteSession,
  cleanupOldSessions,
} from './session-storage.js';
export type { StoredSession } from './session-storage.js';

export {
  getAllowedToolsForMode,
  isToolAllowedInMode,
  getModeDisplayName,
  MODE_TOOLS,
} from './session-mode.js';
export type { OrbitSessionMode } from './session-mode.js';
