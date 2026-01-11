#!/usr/bin/env bun
/**
 * Agent Bridge Entry Point
 * Bridges Rust/Tauri backend with Claude Agent SDK via stdin/stdout JSON IPC
 */

// CRITICAL: Set file checkpointing env var BEFORE any SDK imports
// The SDK may read this at import time to enable its checkpoint storage mechanism
process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';

// Ensure common binary paths are in PATH (important for production apps launched from Finder)
const homeDir = process.env.HOME ?? '';
const commonPaths = [
  '/opt/homebrew/bin', // macOS Homebrew (Apple Silicon)
  '/usr/local/bin', // macOS Homebrew (Intel) / Linux
  '/usr/bin',
  '/bin',
  ...(homeDir !== ''
    ? [
        `${homeDir}/.local/bin`, // User local
        `${homeDir}/.npm-global/bin`, // npm global
        `${homeDir}/.bun/bin`, // Bun
      ]
    : []),
];
const currentPath = process.env.PATH ?? '';
const pathSet = new Set(currentPath.split(':'));
for (const p of commonPaths) {
  if (!pathSet.has(p)) {
    pathSet.add(p);
  }
}
process.env.PATH = Array.from(pathSet).join(':');

import * as readline from 'readline';

import { formatZodError } from '@orbit/shared-schemas';

import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from './agent/definitions/agent-definitions.js';
import {
  createCommand,
  deleteCommand,
  getCommand,
  listCommands,
  updateCommand,
} from './agent/definitions/command-definitions.js';
import { SessionManager } from './agent/session/session-manager.js';
import {
  cleanupOldSessions,
  deleteSession as deleteStoredSession,
  getSDKSessionIdForSession,
  invalidateCache as invalidateSessionCache,
  saveSession,
  touchSession,
} from './agent/session/session-storage.js';
import { CanvasSessionManager } from './canvas/index.js';
import { createLogger } from './common/logging/logger.js';
import { BridgeRequestSchema } from './protocol/schemas.js';

import type {
  BridgeCommandResponse,
  BridgeEvent,
  BridgeRequest,
  BridgeResponse,
} from './protocol/protocol.js';

const logger = createLogger('AgentBridge');

/**
 * Send a message to Rust via stdout
 * Uses newline-delimited JSON
 */
function sendMessage(message: BridgeResponse): void {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

/**
 * Send a command response
 */
function sendResponse(response: BridgeCommandResponse): void {
  sendMessage(response);
}

/**
 * Send an event
 */
function sendEvent(event: BridgeEvent): void {
  sendMessage(event);
}

/**
 * Main entry point
 */
function main(): void {
  logger.info('Agent Bridge starting...');

  // Invalidate session cache to ensure fresh state on restart
  // This handles cases where the bridge process was killed and restarted
  invalidateSessionCache();

  // Create session managers
  const sessionManager = new SessionManager();
  const canvasSessionManager = new CanvasSessionManager();

  // Wire up agent session event handlers
  sessionManager.onAgentMessage((data) => {
    sendEvent({
      type: 'agent_message',
      sessionId: data.sessionId,
      message: data.message,
    });
  });

  sessionManager.onPermissionRequest((request) => {
    sendEvent({
      type: 'permission_request',
      request,
    });
  });

  sessionManager.onSessionInit((event) => {
    // Persist session mapping for resume functionality
    saveSession({
      sessionId: event.sessionId,
      sdkSessionId: event.sdkSessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    });

    sendEvent({
      type: 'session_init',
      event,
    });
  });

  sessionManager.onPlanModeChanged((data) => {
    sendEvent({
      type: 'plan_mode_changed',
      sessionId: data.sessionId,
      enabled: data.enabled,
    });
  });

  sessionManager.onAcceptModeChanged((data) => {
    sendEvent({
      type: 'accept_mode_changed',
      sessionId: data.sessionId,
      enabled: data.enabled,
    });
  });

  sessionManager.onError((error) => {
    sendEvent({
      type: 'error_event',
      error,
    });
  });

  // Emit checkpoint events when user messages with UUIDs are received
  // These UUIDs can be used to rewind files to that checkpoint
  sessionManager.onCheckpoint((data) => {
    sendEvent({
      type: 'checkpoint',
      sessionId: data.sessionId,
      checkpointId: data.checkpointId,
    });
  });

  // Wire up canvas session event handlers
  canvasSessionManager.onMessage((data) => {
    sendEvent({
      type: 'canvas:message',
      sessionId: data.sessionId,
      message: data.message,
    });
  });

  canvasSessionManager.onToolRequest((data) => {
    sendEvent({
      type: 'canvas:tool_request',
      sessionId: data.sessionId,
      request: data.request,
    });
  });

  canvasSessionManager.onError((data) => {
    sendEvent({
      type: 'canvas:error',
      sessionId: data.sessionId,
      error: data.error.message,
    });
  });

  // Handle incoming requests from stdin
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    if (!line.trim()) {
      return;
    }

    let request: BridgeRequest;
    try {
      const parsed: unknown = JSON.parse(line);
      const result = BridgeRequestSchema.safeParse(parsed);
      if (!result.success) {
        const errorMessage = formatZodError(result.error);
        logger.error({ error: errorMessage, line }, 'Invalid request schema');
        sendResponse({
          type: 'error',
          requestType: 'unknown',
          error: `Invalid request: ${errorMessage}`,
        });
        return;
      }
      request = result.data;
    } catch (error) {
      logger.error({ error, line }, 'Failed to parse request JSON');
      sendResponse({
        type: 'error',
        requestType: 'unknown',
        error: `Failed to parse request: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    logger.info({ requestType: request.type }, 'Received request');

    handleRequest(request, sessionManager, canvasSessionManager).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ requestType: request.type, error: errorMessage }, 'Error handling request');
      sendResponse({
        type: 'error',
        requestType: request.type,
        error: errorMessage,
      });
    });
  });

  rl.on('close', () => {
    logger.info('stdin closed, shutting down...');
    sessionManager.dispose();
    canvasSessionManager.dispose();
    process.exit(0);
  });

  // Handle process signals
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down...');
    sessionManager.dispose();
    canvasSessionManager.dispose();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    sessionManager.dispose();
    canvasSessionManager.dispose();
    process.exit(0);
  });

  // Clean up old sessions on startup (30 days default)
  const removedCount = cleanupOldSessions(30);
  if (removedCount > 0) {
    logger.info({ removedCount }, 'Cleaned up old stored sessions');
  }

  // Send ready event
  sendEvent({ type: 'ready' });
  logger.info('Agent Bridge ready');
}

/**
 * Handle a single request
 */
async function handleRequest(
  request: BridgeRequest,
  sessionManager: SessionManager,
  canvasSessionManager: CanvasSessionManager
): Promise<void> {
  switch (request.type) {
    case 'create_session': {
      await sessionManager.createSession(request.sessionId, request.config);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'delete_session': {
      await sessionManager.deleteSession(request.sessionId);
      // Also remove from persistent storage
      deleteStoredSession(request.sessionId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'send_message': {
      sessionManager.sendMessage(request.message, request.sessionId, request.attachments);
      // Update last active timestamp in persistent storage
      touchSession(request.sessionId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'interrupt': {
      await sessionManager.interrupt(request.sessionId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'permission_response': {
      sessionManager.respondToPermission(request.response);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'set_thinking_mode': {
      await sessionManager.setThinkingMode(request.sessionId, request.enabled, request.maxTokens);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'get_thinking_mode': {
      const enabled = sessionManager.getThinkingMode(request.sessionId);
      sendResponse({ type: 'boolean', requestType: request.type, value: enabled });
      break;
    }

    case 'set_model': {
      await sessionManager.setModel(request.sessionId, request.model);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'set_plan_mode': {
      sessionManager.setPlanMode(request.sessionId, request.enabled);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'get_plan_mode': {
      const enabled = sessionManager.getPlanMode(request.sessionId);
      sendResponse({ type: 'boolean', requestType: request.type, value: enabled });
      break;
    }

    case 'set_accept_mode': {
      sessionManager.setAcceptMode(request.sessionId, request.enabled);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'get_accept_mode': {
      const enabled = sessionManager.getAcceptMode(request.sessionId);
      sendResponse({ type: 'boolean', requestType: request.type, value: enabled });
      break;
    }

    case 'is_session_ready': {
      const ready = sessionManager.isSessionReady(request.sessionId);
      sendResponse({ type: 'boolean', requestType: request.type, value: ready });
      break;
    }

    case 'get_sdk_session_id': {
      const sdkSessionId = sessionManager.getSDKSessionId(request.sessionId);
      sendResponse({ type: 'string', requestType: request.type, value: sdkSessionId ?? null });
      break;
    }

    case 'get_stored_session': {
      // Get stored SDK session ID for resume functionality
      const storedSdkSessionId = getSDKSessionIdForSession(request.sessionId);
      sendResponse({
        type: 'string',
        requestType: request.type,
        value: storedSdkSessionId ?? null,
      });
      break;
    }

    case 'cleanup_sessions': {
      const removed = cleanupOldSessions(request.maxAgeDays ?? 30);
      sendResponse({ type: 'number', requestType: request.type, value: removed });
      break;
    }

    // Agent Definition Operations
    case 'list_agents': {
      const agents = listAgents(request.workspacePath);
      sendResponse({ type: 'agent_list', requestType: request.type, agents });
      break;
    }

    case 'get_agent': {
      const agent = getAgent(request.workspacePath, request.name);
      sendResponse({ type: 'agent', requestType: request.type, agent });
      break;
    }

    case 'create_agent': {
      const created = createAgent(request.workspacePath, request.agent);
      sendResponse({ type: 'agent', requestType: request.type, agent: created });
      break;
    }

    case 'update_agent': {
      const updated = updateAgent(request.workspacePath, request.originalName, request.agent);
      sendResponse({ type: 'agent', requestType: request.type, agent: updated });
      break;
    }

    case 'delete_agent': {
      deleteAgent(request.workspacePath, request.name);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    // Command Definition Operations
    case 'list_commands': {
      const commands = listCommands(request.workspacePath);
      sendResponse({ type: 'command_list', requestType: request.type, commands });
      break;
    }

    case 'get_command': {
      const command = getCommand(request.workspacePath, request.name, request.scope);
      sendResponse({ type: 'command', requestType: request.type, command });
      break;
    }

    case 'create_command': {
      const created = createCommand(request.workspacePath, request.command);
      sendResponse({ type: 'command', requestType: request.type, command: created });
      break;
    }

    case 'update_command': {
      const updated = updateCommand(request.workspacePath, request.originalName, request.command);
      sendResponse({ type: 'command', requestType: request.type, command: updated });
      break;
    }

    case 'delete_command': {
      deleteCommand(request.workspacePath, request.name, request.scope);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    // Fork and Generate Operations
    case 'fork_session': {
      const result = await sessionManager.forkSession(request.sessionId, request.options);
      sendResponse({ type: 'fork_result', requestType: request.type, result });
      break;
    }

    case 'rewind_files': {
      await sessionManager.rewindFiles(request.sessionId, request.checkpointId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'generate_agent_definition': {
      const agent = await sessionManager.generateAgentDefinition(request.description);
      sendResponse({ type: 'agent', requestType: request.type, agent });
      break;
    }

    case 'generate_command_definition': {
      const command = await sessionManager.generateCommandDefinition(request.description);
      sendResponse({ type: 'command', requestType: request.type, command });
      break;
    }

    // Canvas Operations
    case 'canvas:create_session': {
      canvasSessionManager.createSession(request.sessionId, request.config);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'canvas:delete_session': {
      await canvasSessionManager.deleteSession(request.sessionId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'canvas:send_message': {
      await canvasSessionManager.sendMessage(request.sessionId, request.message, request.state);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'canvas:interrupt': {
      await canvasSessionManager.interrupt(request.sessionId);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'canvas:tool_response': {
      canvasSessionManager.handleToolResponse(request.sessionId, request.response);
      sendResponse({ type: 'success', requestType: request.type });
      break;
    }

    case 'shutdown': {
      logger.info('Shutdown requested');
      sendResponse({ type: 'success', requestType: request.type });
      sessionManager.dispose();
      canvasSessionManager.dispose();
      process.exit(0);
      // Note: process.exit() never returns, but break needed to satisfy linter
    }
    // falls through (unreachable after process.exit)

    default: {
      const exhaustiveCheck: never = request;
      sendResponse({
        type: 'error',
        requestType: (exhaustiveCheck as BridgeRequest).type,
        error: `Unknown request type: ${(exhaustiveCheck as BridgeRequest).type}`,
      });
    }
  }
}

// Run main
try {
  main();
} catch (error: unknown) {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
}
