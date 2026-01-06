/**
 * Canvas Module
 * Canvas-specific agent and tool implementations
 */

// Canvas Agent
export { CanvasAgent, createCanvasAgent } from './canvas-agent.js';
export type { CanvasAgentEvents } from './canvas-agent.js';

// Canvas Session Manager
export { CanvasSessionManager, createCanvasSessionManager } from './canvas-session-manager.js';
export type {
  SessionMessageEvent,
  SessionToolRequestEvent,
  SessionErrorEvent,
  MessageCallback,
  ToolRequestCallback as SessionToolRequestCallback,
  ErrorCallback as SessionErrorCallback,
} from './canvas-session-manager.js';

// Canvas Tool Bridge
export { CanvasToolBridge } from './canvas-tool-bridge.js';
export type { ToolRequestCallback, McpToolRequest, McpToolResponse } from './canvas-tool-bridge.js';

// Canvas MCP Server
export { createCanvasMcpServer, getCanvasToolNames } from './canvas-mcp-server.js';

// Canvas System Prompt
export { getCanvasSystemPrompt } from './system-prompt.js';

// Canvas Types
export type {
  // Node types
  CanvasPosition,
  CanvasNodeType,
  CanvasNodeBase,
  SandpackNode,
  PageNode,
  LayoutOptions,
  SlotPosition,
  PageSlot,
  CanvasNode,
  // Edge types
  CanvasEdge,
  // State types
  CanvasState,
  // Session types
  CanvasSessionConfig,
  CanvasSessionStatus,
  CanvasSession,
  // SDK Message types
  SDKMessageType,
  ToolUseMetadata,
  ErrorMetadata,
  SDKMessage,
  // MCP Tool types
  JSONSchema,
  CanvasTool,
  ToolExecutionStatus,
} from './types.js';

// Orchestrator (multi-agent coordination)
export * from './orchestrator/index.js';
