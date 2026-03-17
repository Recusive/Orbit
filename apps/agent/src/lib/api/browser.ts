/**
 * Browser API - Embedded browser webview management
 *
 * This module provides APIs to create and control an embedded browser
 * webview within the Orbit window. The browser is truly embedded
 * (not a separate app) and uses WebKit on macOS.
 */

import { invoke, listen, logger } from './core';

// ============================================
// Types
// ============================================

/** Browser instance info */
export interface BrowserInfo {
  /** The webview label (unique identifier) */
  label: string;
  /** Current URL */
  url: string;
  /** Whether the browser is active */
  active: boolean;
}

/** Payload for browser:navigated events */
export interface BrowserNavigatedEvent {
  /** The URL that was navigated to */
  url: string;
}

/** Payload for browser:loading events */
export interface BrowserLoadingEvent {
  /** Whether the page is currently loading */
  is_loading: boolean;
}

/** Payload for browser:tool_request events */
export interface BrowserToolRequestEvent {
  sessionId: string;
  request: {
    requestId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  };
}

/** Payload for browser tool responses */
export interface BrowserToolResponsePayload {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string | undefined;
}

/** Browser screenshot response payload */
export interface BrowserScreenshotInfo {
  /** Path to saved JPEG file when capture succeeds */
  filePath: string | null;
  /** Capture metadata (always present) */
  metadata: Record<string, unknown>;
}

export type OrbitRuntimeMethod =
  | 'snapshot'
  | 'click'
  | 'type'
  | 'fill'
  | 'getText'
  | 'getHtml'
  | 'count'
  | 'check'
  | 'uncheck'
  | 'select'
  | 'hover'
  | 'focus'
  | 'scroll'
  | 'scrollIntoView'
  | 'isVisible'
  | 'isEnabled'
  | 'getAttribute'
  | 'boundingBox'
  | 'getCookies'
  | 'clearCookies'
  | 'storageGet'
  | 'storageSet'
  | 'storageClear'
  | 'getNetworkRequests'
  | 'getConsoleLogs'
  | 'runtimeInfo';

// ============================================
// Embedded Browser Operations
// ============================================

/**
 * Create an embedded browser webview.
 *
 * The webview is created within the main window at the specified position.
 * This is a true embedded browser (no separate app, no dock icon).
 */
export async function browserCreate(
  x: number,
  y: number,
  width: number,
  height: number,
  url?: string
): Promise<BrowserInfo> {
  logger.info('Creating embedded browser', { x, y, width, height, url });
  return invoke<BrowserInfo>('browser_create', { x, y, width, height, url });
}

/**
 * Navigate the embedded browser to a URL.
 */
export async function browserNavigate(url: string): Promise<void> {
  logger.debug('Navigating browser', { url });
  return invoke('browser_navigate', { url });
}

/**
 * Set the position and size of the embedded browser.
 */
export async function browserSetBounds(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  // Don't log every bounds update (too noisy)
  return invoke('browser_set_bounds', { x, y, width, height });
}

/**
 * Close the embedded browser.
 */
export async function browserClose(): Promise<void> {
  logger.info('Closing embedded browser');
  return invoke('browser_close');
}

/**
 * Check if an embedded browser exists.
 */
export async function browserHas(): Promise<boolean> {
  return invoke<boolean>('browser_has');
}

/**
 * Get information about the embedded browser.
 */
export async function browserInfo(): Promise<BrowserInfo | null> {
  return invoke<BrowserInfo | null>('browser_info');
}

/**
 * Execute JavaScript in the embedded browser and return the result.
 *
 * Uses navigation interception to capture results, which works on any site
 * (including external URLs that don't have the Tauri API).
 *
 * @param script - JavaScript code to execute
 * @returns JSON-serialized result of the script execution
 *
 * @example
 * ```ts
 * const title = await browserEval('return document.title');
 * console.log(JSON.parse(title)); // "My Page Title"
 * ```
 */
export async function browserEval(script: string): Promise<string> {
  logger.debug('Executing script in browser');
  return invoke<string>('browser_eval', { script });
}

/**
 * Execute JavaScript and return the result using Tauri invoke callback.
 *
 * This variant uses `window.__TAURI__.invoke()` to send results back,
 * which is faster but requires the Tauri API to be available in the browser.
 * Use `browserEval` for external sites.
 *
 * @param script - JavaScript code to execute
 * @param timeoutMs - Optional timeout in milliseconds (default: 5000)
 * @returns JSON-serialized result of the script execution
 *
 * @example
 * ```ts
 * const data = await browserEvalAsync('return { x: 1, y: 2 }', 10000);
 * console.log(JSON.parse(data)); // { x: 1, y: 2 }
 * ```
 */
export async function browserEvalAsync(script: string, timeoutMs?: number): Promise<string> {
  logger.debug('Executing script with result');
  return invoke<string>('browser_eval_async', { script, timeoutMs });
}

/**
 * Invoke an allowlisted Orbit runtime method inside the embedded browser.
 */
export async function browserInvokeRuntime(
  method: OrbitRuntimeMethod,
  args: unknown[]
): Promise<string> {
  logger.debug('Invoking Orbit runtime method', { method });
  return invoke<string>('browser_invoke_runtime', {
    method,
    argsJson: JSON.stringify(args),
  });
}

/**
 * Read the current Orbit runtime version from the page, if present.
 */
export async function browserRuntimeVersion(): Promise<string | null> {
  return invoke<string | null>('browser_runtime_version');
}

/**
 * Ensure the Orbit runtime is installed and up to date.
 */
export async function browserEnsureRuntime(): Promise<void> {
  return invoke('browser_ensure_runtime');
}

/**
 * Return the current page URL from the embedded browser.
 */
export async function browserGetUrl(): Promise<string> {
  return invoke<string>('browser_get_url');
}

/**
 * Return the current document title from the embedded browser.
 */
export async function browserGetTitle(): Promise<string> {
  return invoke<string>('browser_get_title');
}

/**
 * Capture browser screenshot payload.
 *
 * Returns JSON with `filePath` (temp JPEG path or null) and `metadata`.
 *
 * @example
 * ```ts
 * const screenshotJson = await browserScreenshot();
 * const screenshot: BrowserScreenshotInfo = JSON.parse(screenshotJson);
 * console.log(screenshot.filePath ? 'saved to file' : 'metadata only');
 * ```
 */
export async function browserScreenshot(): Promise<string> {
  logger.debug('Capturing browser screenshot');
  return invoke<string>('browser_screenshot');
}

/**
 * Open DevTools for the embedded browser.
 *
 * Only available in debug builds. On macOS, uses a private API
 * that won't work in App Store builds.
 */
export async function browserOpenDevTools(): Promise<void> {
  logger.info('Opening DevTools for embedded browser');
  return invoke('browser_open_devtools');
}

// ============================================
// Navigation Operations
// ============================================

/**
 * Go back in browser history.
 */
export async function browserBack(): Promise<void> {
  return invoke('browser_back');
}

/**
 * Go forward in browser history.
 */
export async function browserForward(): Promise<void> {
  return invoke('browser_forward');
}

/**
 * Reload the current page.
 */
export async function browserReload(): Promise<void> {
  return invoke('browser_reload');
}

/**
 * Stop loading the current page.
 */
export async function browserStop(): Promise<void> {
  return invoke('browser_stop');
}

/**
 * Wait for a selector to reach the requested state in the embedded browser.
 */
export async function browserWaitForSelector(
  selector: string,
  state?: string,
  timeout?: number
): Promise<void> {
  return invoke('browser_wait_for_selector', { selector, state, timeout });
}

/**
 * Wait for the current browser URL to match the requested pattern.
 */
export async function browserWaitForUrl(url: string, timeout?: number): Promise<void> {
  return invoke('browser_wait_for_url', { url, timeout });
}

// ============================================
// Visibility Operations
// ============================================

/**
 * Show the embedded browser webview.
 */
export async function browserShow(): Promise<void> {
  return invoke('browser_show');
}

/**
 * Hide the embedded browser webview.
 */
export async function browserHide(): Promise<void> {
  return invoke('browser_hide');
}

/**
 * Focus the browser child window so it receives input immediately.
 * Used after activating element selection (react-grab) so the cursor
 * changes without the user needing to click inside the browser first.
 */
export async function browserFocus(): Promise<void> {
  return invoke('browser_focus');
}

// ============================================
// MCP Tool Responses
// ============================================

/**
 * Send a browser MCP tool response back to the agent.
 */
export async function browserToolResponse(
  sessionId: string,
  response: BrowserToolResponsePayload
): Promise<void> {
  return invoke('browser_tool_response', { sessionId, response });
}

// ============================================
// Event Listeners
// ============================================

/**
 * Listen for element selection events from react-grab in the embedded browser.
 *
 * Called when the user selects an element via the react-grab overlay.
 * The data payload is a JSON string matching the ReactElementContext shape.
 */
export async function onBrowserElementSelected(
  callback: (data: string) => void
): Promise<() => void> {
  return listen<string>('browser:element-selected', callback);
}

/**
 * Listen for browser navigation events.
 *
 * Called when the embedded browser navigates to a new URL.
 */
export async function onBrowserNavigated(
  callback: (event: BrowserNavigatedEvent) => void
): Promise<() => void> {
  return listen<BrowserNavigatedEvent>('browser:navigated', callback);
}

/**
 * Listen for browser loading state changes.
 *
 * Called when the page starts or finishes loading.
 */
export async function onBrowserLoading(
  callback: (event: BrowserLoadingEvent) => void
): Promise<() => void> {
  return listen<BrowserLoadingEvent>('browser:loading', callback);
}

/**
 * Listen for browser MCP tool requests.
 *
 * Called when the agent requests a browser tool execution.
 */
export async function onBrowserToolRequest(
  callback: (event: BrowserToolRequestEvent) => void
): Promise<() => void> {
  return listen<BrowserToolRequestEvent>('browser:tool_request', callback);
}

// ============================================
// Legacy Functions
// ============================================

/**
 * @deprecated Use browserCreate instead.
 * External browser detection is no longer supported.
 */
export async function browserDetect(): Promise<BrowserInfo> {
  return invoke<BrowserInfo>('browser_detect');
}

/**
 * @deprecated No longer supported.
 */
export async function browserGetPid(): Promise<number | null> {
  return invoke<number | null>('browser_get_pid');
}

/**
 * @deprecated Use browserClose instead.
 */
export async function browserClear(): Promise<void> {
  return invoke('browser_clear');
}
