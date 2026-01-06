/**
 * Agent Module
 * Chat/coding agent integration using Claude Agent SDK
 */

// Core agent
export { OrbitAgent, createAgent } from './core/index.js';
export type { OrbitAgentConfig } from './core/index.js';

// Session management
export {
  SessionManager,
  saveSession,
  getSDKSessionIdForSession,
  touchSession,
  deleteSession as deleteStoredSession,
  cleanupOldSessions,
  getAllowedToolsForMode,
  isToolAllowedInMode,
  getModeDisplayName,
  MODE_TOOLS,
} from './session/index.js';
export type {
  AgentMessage,
  PermissionRequest,
  PermissionResponse,
  SessionConfig,
  SessionInitEvent,
  SerializableError,
  ForkSessionOptions,
  ForkSessionResult,
  StoredSession,
  OrbitSessionMode,
} from './session/index.js';

// Permission system
export { PermissionManager } from './permissions/index.js';
export type { PermissionRequestCallback, SnapshotCallback } from './permissions/index.js';

// Agent & Command definitions
export {
  listAgents,
  getAgent,
  createAgent as createAgentDefinition,
  updateAgent,
  deleteAgent,
  listCommands,
  getCommand,
  createCommand,
  updateCommand,
  deleteCommand,
} from './definitions/index.js';
export type {
  SubagentDefinition,
  SlashCommandDefinition,
  CommandScope,
} from './definitions/index.js';

// Message types
export type { AttachmentContentBlock, MessagePayload, MessageResponse } from './types/index.js';

// Utilities
export { buildContentBlocks, formatToolResult } from './utils/index.js';
export type {
  ClaudeContentBlock,
  ImageMediaType,
  DocumentMediaType,
  ToolResult,
} from './utils/index.js';
