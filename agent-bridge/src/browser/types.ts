/**
 * Browser MCP Types
 *
 * Type definitions for browser automation commands used by AI agents.
 * These types define the contract between the agent and the browser
 * automation layer.
 */

// ============================================
// Result Types
// ============================================

/**
 * Result of a browser tool execution.
 */
export interface BrowserToolResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Result data (type depends on the command) */
  data?: unknown;
  /** Error message if success is false */
  error?: string;
}

/**
 * Typed result with known data shape.
 */
export interface BrowserToolResultTyped<T> extends BrowserToolResult {
  success: true;
  data: T;
}

/**
 * Error result type.
 */
export interface BrowserToolError extends BrowserToolResult {
  success: false;
  error: string;
}

// ============================================
// MCP Tool Types
// ============================================

/**
 * MCP tool request sent to the frontend.
 */
export interface McpToolRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * MCP tool response from the frontend.
 */
export interface McpToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================
// Command Types
// ============================================

/**
 * Open a browser or navigate to a URL.
 */
export interface BrowserOpenCommand {
  type: 'browser:open';
  /** URL to open (optional, opens blank if not provided) */
  url?: string;
}

/**
 * Navigate to a specific URL.
 */
export interface BrowserNavigateCommand {
  type: 'browser:navigate';
  /** URL to navigate to */
  url: string;
}

/**
 * Click an element by CSS selector.
 */
export interface BrowserClickCommand {
  type: 'browser:click';
  /** CSS selector for the element to click */
  selector: string;
}

/**
 * Type text into an input element.
 */
export interface BrowserTypeCommand {
  type: 'browser:type';
  /** CSS selector for the input element */
  selector: string;
  /** Text to type */
  text: string;
}

/**
 * Execute JavaScript and return the result.
 */
export interface BrowserEvalCommand {
  type: 'browser:eval';
  /** JavaScript code to execute */
  script: string;
}

/**
 * Capture a screenshot or page info.
 */
export interface BrowserScreenshotCommand {
  type: 'browser:screenshot';
}

/**
 * Get HTML content of an element or the entire page.
 */
export interface BrowserGetHtmlCommand {
  type: 'browser:get_html';
  /** CSS selector (optional, returns document HTML if not provided) */
  selector?: string;
}

/**
 * Get text content of an element or the entire page.
 */
export interface BrowserGetTextCommand {
  type: 'browser:get_text';
  /** CSS selector (optional, returns document text if not provided) */
  selector?: string;
}

/**
 * Navigate back in browser history.
 */
export interface BrowserBackCommand {
  type: 'browser:back';
}

/**
 * Navigate forward in browser history.
 */
export interface BrowserForwardCommand {
  type: 'browser:forward';
}

/**
 * Reload the current page.
 */
export interface BrowserReloadCommand {
  type: 'browser:reload';
}

/**
 * Close the browser.
 */
export interface BrowserCloseCommand {
  type: 'browser:close';
}

/**
 * Get console logs from the browser.
 */
export interface BrowserConsoleLogsCommand {
  type: 'browser:console_logs';
}

/**
 * Union type of all browser commands.
 */
export type BrowserCommand =
  | BrowserOpenCommand
  | BrowserNavigateCommand
  | BrowserClickCommand
  | BrowserTypeCommand
  | BrowserEvalCommand
  | BrowserScreenshotCommand
  | BrowserGetHtmlCommand
  | BrowserGetTextCommand
  | BrowserBackCommand
  | BrowserForwardCommand
  | BrowserReloadCommand
  | BrowserCloseCommand
  | BrowserConsoleLogsCommand;

/**
 * Extract the command type string from a BrowserCommand.
 */
export type BrowserCommandType = BrowserCommand['type'];

// ============================================
// Data Types for Specific Commands
// ============================================

/**
 * Screenshot/page info data.
 */
export interface BrowserScreenshotData {
  url: string;
  title: string;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

/**
 * Console log entry.
 */
export interface BrowserConsoleLogEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

// ============================================
// Helper Type Guards
// ============================================

/**
 * Type guard to check if a result is successful.
 */
export function isSuccess<T>(result: BrowserToolResult): result is BrowserToolResultTyped<T> {
  return result.success;
}

/**
 * Type guard to check if a result is an error.
 */
export function isError(result: BrowserToolResult): result is BrowserToolError {
  return !result.success;
}
