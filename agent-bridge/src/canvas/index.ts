/**
 * Canvas Module
 * Canvas-specific agent and tool implementations
 */

// Canvas Agent
export { CanvasAgent, createCanvasAgent } from './core/index.js';
export type { CanvasAgentEvents } from './core/index.js';

// Canvas Session Manager
export { CanvasSessionManager, createCanvasSessionManager } from './session/index.js';
export type {
  SessionMessageEvent,
  SessionToolRequestEvent,
  SessionErrorEvent,
  MessageCallback,
  ToolRequestCallback as SessionToolRequestCallback,
  ErrorCallback as SessionErrorCallback,
} from './session/index.js';

// Canvas Tool Bridge & MCP
export { CanvasToolBridge, createCanvasMcpServer, getCanvasToolNames } from './mcp/index.js';
export type { ToolRequestCallback, McpToolRequest, McpToolResponse } from './mcp/index.js';

// Canvas System Prompt
export { getCanvasSystemPrompt } from './prompts/index.js';

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
} from './types/index.js';

// Orchestrator (multi-agent coordination)
export * from './orchestrator/index.js';
