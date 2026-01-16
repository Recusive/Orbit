/**
 * Browser Module
 *
 * Exports browser automation types and utilities for AI agents.
 */

// Tool bridge + MCP server
export { BrowserToolBridge } from './browser-tool-bridge.js';
export type {
  ToolRequestCallback,
  McpToolRequest,
  McpToolResponse,
} from './browser-tool-bridge.js';
export { createBrowserMcpServer, getBrowserToolNames } from './browser-mcp-server.js';

// Types
export type {
  BrowserToolResult,
  BrowserToolResultTyped,
  BrowserToolError,
  BrowserCommand,
  BrowserCommandType,
  BrowserOpenCommand,
  BrowserNavigateCommand,
  BrowserClickCommand,
  BrowserTypeCommand,
  BrowserEvalCommand,
  BrowserScreenshotCommand,
  BrowserGetHtmlCommand,
  BrowserGetTextCommand,
  BrowserBackCommand,
  BrowserForwardCommand,
  BrowserReloadCommand,
  BrowserCloseCommand,
  BrowserConsoleLogsCommand,
  BrowserScreenshotData,
  BrowserConsoleLogEntry,
} from './types.js';

// Type guards
export { isSuccess, isError } from './types.js';
