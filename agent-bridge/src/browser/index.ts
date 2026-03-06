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
  BrowserTargetInput,
  BrowserOptionalTargetInput,
  BrowserScrollDirection,
  BrowserStorageStore,
  BrowserConsoleLogLevel,
  BrowserWaitForSelectorState,
  BrowserToolResult,
  BrowserToolResultTyped,
  BrowserToolError,
  BrowserCookie,
  BrowserNetworkRequest,
  BrowserBoundingBox,
  BrowserRuntimeInfo,
  SnapshotResponse,
  BrowserCommand,
  BrowserCommandType,
  BrowserOpenCommand,
  BrowserNavigateCommand,
  BrowserSnapshotCommand,
  BrowserGetUrlCommand,
  BrowserGetTitleCommand,
  BrowserClickCommand,
  BrowserTypeCommand,
  BrowserFillCommand,
  BrowserSelectCommand,
  BrowserCheckCommand,
  BrowserUncheckCommand,
  BrowserHoverCommand,
  BrowserFocusCommand,
  BrowserScrollCommand,
  BrowserScrollIntoViewCommand,
  BrowserWaitForSelectorCommand,
  BrowserWaitForUrlCommand,
  BrowserEvalCommand,
  BrowserScreenshotCommand,
  BrowserGetHtmlCommand,
  BrowserGetTextCommand,
  BrowserIsVisibleCommand,
  BrowserIsEnabledCommand,
  BrowserGetAttributeCommand,
  BrowserBoundingBoxCommand,
  BrowserCountCommand,
  BrowserCookiesGetCommand,
  BrowserCookiesClearCommand,
  BrowserStorageGetCommand,
  BrowserStorageSetCommand,
  BrowserStorageClearCommand,
  BrowserNetworkRequestsCommand,
  BrowserBackCommand,
  BrowserForwardCommand,
  BrowserReloadCommand,
  BrowserCloseCommand,
  BrowserConsoleLogsCommand,
  BrowserRuntimeInfoCommand,
  BrowserScreenshotData,
  BrowserConsoleLogEntry,
} from './types.js';

// Type guards
export {
  BrowserTargetShape,
  TargetSchema,
  OptionalTargetSchema,
  BrowserScrollDirections,
  BrowserStorageStores,
  BrowserConsoleLogLevels,
  BrowserWaitForSelectorStates,
  validateTargetInput,
  validateOptionalTargetInput,
  isSuccess,
  isError,
} from './types.js';
