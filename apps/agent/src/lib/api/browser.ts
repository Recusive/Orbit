/**
 * Browser API - Embedded browser webview management
 *
 * This module provides APIs to create and control an embedded browser
 * webview within the Orbit window. The browser is truly embedded
 * (not a separate app) and uses WebKit on macOS.
 */

import { invoke, logger } from './core';

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
 * Execute JavaScript in the embedded browser.
 *
 * Useful for AI automation and interacting with web pages.
 */
export async function browserEval(script: string): Promise<void> {
  logger.debug('Executing script in browser');
  return invoke('browser_eval', { script });
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
