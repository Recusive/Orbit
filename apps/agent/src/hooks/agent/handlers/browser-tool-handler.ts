import { createLogger } from '@orbit/common/lib';

import { recordBrowserActivityFromAI } from './browser-handlers';

import type { WebviewMessage } from '@/types/protocol';

import {
  browserBack,
  browserClose,
  browserEval,
  browserEvalAsync,
  browserForward,
  browserHas,
  browserNavigate,
  browserReload,
  browserToolResponse,
} from '@/lib/api/browser';
import { useBrowserLifecycleStore } from '@/stores/browser/browser-lifecycle-store';
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('BrowserToolHandler');
const DEFAULT_OPEN_URL = 'about:blank';
const BROWSER_READY_TIMEOUT_MS = 10000;
const BROWSER_READY_POLL_MS = 250;

// Browser API detection state with promise coalescing to prevent race conditions
let browserHasTauriApi: boolean | null = null;
let detectionPromise: Promise<boolean> | null = null;

// AbortController for canceling browser ready polling
let browserReadyAbortController: AbortController | null = null;

interface BrowserToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Allowed URL protocols for browser navigation (security).
 * Note: data: protocol is intentionally excluded as it can be abused for XSS
 * attacks via data:text/html URLs containing malicious scripts.
 */
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'about:'];

/**
 * Validate a URL for browser navigation.
 * Only allows safe protocols to prevent security issues.
 *
 * @returns The validated URL or an error message
 */
function validateBrowserUrl(
  url: string
): { valid: true; url: string } | { valid: false; error: string } {
  // Allow about:blank and similar special URLs
  if (url === 'about:blank' || url.startsWith('about:')) {
    return { valid: true, url };
  }

  try {
    const parsed = new URL(url);

    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Unsupported URL protocol: ${parsed.protocol}. Allowed: ${ALLOWED_URL_PROTOCOLS.join(', ')}`,
      };
    }

    return { valid: true, url: parsed.href };
  } catch {
    // If URL parsing fails, try prepending https://
    try {
      const withProtocol = `https://${url}`;
      const parsed = new URL(withProtocol);

      if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: `Invalid URL format: ${url}` };
      }

      return { valid: true, url: parsed.href };
    } catch {
      return { valid: false, error: `Invalid URL format: ${url}` };
    }
  }
}

/**
 * Safely serialize a value for injection into JavaScript.
 * Uses JSON.stringify which handles all escaping cases properly.
 */
function safeStringify(value: string): string {
  return JSON.stringify(value);
}

function parseEvalResult(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (parsed !== null && typeof parsed === 'object' && '__error' in parsed) {
    const errorValue = (parsed as { __error?: unknown }).__error;
    throw new Error(typeof errorValue === 'string' ? errorValue : JSON.stringify(errorValue));
  }
  return parsed;
}

function resetBrowserApiCache(): void {
  browserHasTauriApi = null;
  detectionPromise = null;
  // Cancel any pending browser ready polling
  if (browserReadyAbortController) {
    browserReadyAbortController.abort();
    browserReadyAbortController = null;
  }
}

/**
 * Reset all module-level state. Useful for HMR and testing.
 * Exported for use in development environments where module hot reload
 * may leave state in an inconsistent state.
 */
export function resetBrowserToolState(): void {
  resetBrowserApiCache();
}

async function detectBrowserTauriApi(): Promise<boolean> {
  // Return cached result if available
  if (browserHasTauriApi !== null) {
    return browserHasTauriApi;
  }

  // Coalesce concurrent detection calls to prevent race conditions
  // Use ??= to only create promise if none exists
  detectionPromise ??= (async (): Promise<boolean> => {
    try {
      // Check for the full Tauri API, not just window.__TAURI__ existence
      // A page could define window.__TAURI__ without having the actual Tauri API
      const raw = await browserEval('return typeof window.__TAURI__?.core?.invoke === "function"');
      browserHasTauriApi = parseEvalResult(raw) === true;
    } catch (error) {
      logger.warn('Browser Tauri API probe failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      browserHasTauriApi = false;
    }
    // browserHasTauriApi is guaranteed to be boolean at this point
    return browserHasTauriApi;
  })();

  return detectionPromise;
}

async function evalScript(script: string): Promise<string> {
  const hasTauriApi = await detectBrowserTauriApi();
  if (!hasTauriApi) return browserEval(script);

  // Try async eval first, fall back to sync if it fails
  // This handles edge cases where detection succeeded but API isn't fully available
  try {
    return await browserEvalAsync(script);
  } catch (error) {
    logger.warn('browserEvalAsync failed, falling back to sync eval', {
      error: error instanceof Error ? error.message : String(error),
    });
    resetBrowserApiCache();
    return browserEval(script);
  }
}

async function waitForBrowserReady(timeoutMs: number): Promise<boolean> {
  // Cancel any previous polling
  if (browserReadyAbortController) {
    browserReadyAbortController.abort();
  }
  browserReadyAbortController = new AbortController();
  const signal = browserReadyAbortController.signal;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Check if aborted (e.g., browser closed, navigation changed)
    if (signal.aborted) {
      return false;
    }
    try {
      if (await browserHas()) {
        return true;
      }
    } catch (error) {
      logger.warn('Browser readiness check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, BROWSER_READY_POLL_MS));
  }
  return false;
}

async function ensureConsoleCapture(): Promise<void> {
  // Console capture script with circular reference handling
  const captureScript = `
    if (!window.__orbitConsoleLogs) {
      window.__orbitConsoleLogs = [];
      const orig = { ...console };

      // Safe stringify that handles circular references
      const safeStringify = (obj) => {
        if (obj === null || obj === undefined) return String(obj);
        if (typeof obj !== 'object') return String(obj);
        try {
          return JSON.stringify(obj);
        } catch {
          // Handle circular references, DOM nodes, etc.
          if (obj instanceof Error) {
            return obj.stack || obj.message || String(obj);
          }
          if (obj instanceof Element) {
            return obj.outerHTML.slice(0, 200) + (obj.outerHTML.length > 200 ? '...' : '');
          }
          return '[Object with circular reference]';
        }
      };

      ['log', 'warn', 'error', 'info', 'debug'].forEach((m) => {
        console[m] = (...args) => {
          window.__orbitConsoleLogs.push({
            type: m,
            timestamp: Date.now(),
            args: args.map(safeStringify),
          });
          if (window.__orbitConsoleLogs.length > 1000) {
            window.__orbitConsoleLogs.shift();
          }
          orig[m](...args);
        };
      });
    }
    return true;
  `;

  const raw = await evalScript(captureScript);

  parseEvalResult(raw);
}

export async function executeBrowserTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<BrowserToolExecutionResult> {
  try {
    recordBrowserActivityFromAI();

    switch (toolName) {
      case 'browser_open': {
        const rawUrl = typeof toolInput['url'] === 'string' ? toolInput['url'] : DEFAULT_OPEN_URL;

        // Validate URL for security (only allow safe protocols)
        const urlValidation = validateBrowserUrl(rawUrl);
        if (!urlValidation.valid) {
          return { success: false, error: urlValidation.error };
        }
        const url = urlValidation.url;

        const browserState = useBrowserStore.getState();

        useUIStore.getState().openBrowserTab();
        resetBrowserApiCache();

        if (browserState.isActive) {
          await browserNavigate(url);
        } else {
          useBrowserStore.getState().setPendingNavigationUrl(url);
        }

        const browserReady = await waitForBrowserReady(BROWSER_READY_TIMEOUT_MS);
        if (!browserReady) {
          return {
            success: false,
            error: `Browser did not become ready within ${String(BROWSER_READY_TIMEOUT_MS)}ms`,
          };
        }

        try {
          await ensureConsoleCapture();
        } catch (error) {
          logger.warn('Console capture injection failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return { success: true, result: { opened: true, url } };
      }

      case 'browser_navigate': {
        if (typeof toolInput['url'] !== 'string') {
          return { success: false, error: 'Missing url for browser_navigate' };
        }

        // Validate URL for security (only allow safe protocols)
        const urlValidation = validateBrowserUrl(toolInput['url']);
        if (!urlValidation.valid) {
          return { success: false, error: urlValidation.error };
        }
        const url = urlValidation.url;

        const browserState = useBrowserStore.getState();

        useUIStore.getState().openBrowserTab();
        resetBrowserApiCache();

        if (browserState.isActive) {
          await browserNavigate(url);
        } else {
          useBrowserStore.getState().setPendingNavigationUrl(url);
        }

        // Re-inject console capture after navigation (new page wipes window.__orbitConsoleLogs)
        const browserReady = await waitForBrowserReady(BROWSER_READY_TIMEOUT_MS);
        if (!browserReady) {
          return {
            success: false,
            error: `Browser did not become ready within ${String(BROWSER_READY_TIMEOUT_MS)}ms after navigation`,
          };
        }

        try {
          await ensureConsoleCapture();
        } catch (error) {
          logger.warn('Console capture injection failed after navigate', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return { success: true, result: { navigated: true, url } };
      }

      case 'browser_click': {
        if (typeof toolInput['selector'] !== 'string') {
          return { success: false, error: 'Missing selector for browser_click' };
        }
        // Use JSON.stringify for defense-in-depth escaping
        const selectorJson = safeStringify(toolInput['selector']);
        const script = `
          const el = document.querySelector(${selectorJson});
          if (el instanceof HTMLElement) {
            el.click();
            return true;
          }
          return false;
        `;
        const raw = await evalScript(script);
        const clicked = parseEvalResult(raw);
        return { success: true, result: { clicked } };
      }

      case 'browser_type': {
        if (typeof toolInput['selector'] !== 'string' || typeof toolInput['text'] !== 'string') {
          return { success: false, error: 'Missing selector or text for browser_type' };
        }
        // Use JSON.stringify for defense-in-depth escaping
        const selectorJson = safeStringify(toolInput['selector']);
        const textJson = safeStringify(toolInput['text']);
        const script = `
          const el = document.querySelector(${selectorJson});
          if (el && 'value' in el) {
            el.focus?.();
            el.value = ${textJson};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        `;
        const raw = await evalScript(script);
        const typed = parseEvalResult(raw);
        return { success: true, result: { typed } };
      }

      case 'browser_get_text': {
        const selector = typeof toolInput['selector'] === 'string' ? toolInput['selector'] : 'body';
        const selectorJson = safeStringify(selector);
        const script = `return document.querySelector(${selectorJson})?.innerText ?? ''`;
        const raw = await evalScript(script);
        const text = parseEvalResult(raw);
        return { success: true, result: text };
      }

      case 'browser_get_html': {
        const selector = typeof toolInput['selector'] === 'string' ? toolInput['selector'] : 'body';
        const selectorJson = safeStringify(selector);
        const script = `return document.querySelector(${selectorJson})?.innerHTML ?? ''`;
        const raw = await evalScript(script);
        const html = parseEvalResult(raw);
        return { success: true, result: html };
      }

      case 'browser_console_logs': {
        // Check if console capture exists, if not inject it first
        // This handles cases where user navigated via clicking links
        const checkScript = 'return typeof window.__orbitConsoleLogs !== "undefined"';
        const checkRaw = await evalScript(checkScript);
        const hasCapture = parseEvalResult(checkRaw);

        if (hasCapture !== true) {
          logger.info('Console capture not found, injecting now (future logs will be captured)');
          try {
            await ensureConsoleCapture();
          } catch (error) {
            logger.warn('Console capture injection failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const raw = await evalScript('return window.__orbitConsoleLogs || []');
        const logs = parseEvalResult(raw);
        return { success: true, result: logs };
      }

      case 'browser_screenshot': {
        const script = `
          return {
            url: window.location.href,
            title: document.title,
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio,
          };
        `;
        const raw = await evalScript(script);
        const info = parseEvalResult(raw);
        return { success: true, result: info };
      }

      case 'browser_back': {
        await browserBack();
        return { success: true };
      }

      case 'browser_forward': {
        await browserForward();
        return { success: true };
      }

      case 'browser_reload': {
        await browserReload();
        resetBrowserApiCache();

        // Re-inject console capture after reload (page reload wipes window.__orbitConsoleLogs)
        if (await waitForBrowserReady(BROWSER_READY_TIMEOUT_MS)) {
          try {
            await ensureConsoleCapture();
          } catch (error) {
            logger.warn('Console capture injection failed after reload', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return { success: true };
      }

      case 'browser_close': {
        await browserClose();
        useBrowserStore.getState().reset();
        useBrowserLifecycleStore.getState().reset();
        useUIStore.getState().setActivityTab('files');
        resetBrowserApiCache();
        return { success: true };
      }

      case 'browser_eval': {
        if (typeof toolInput['script'] !== 'string') {
          return { success: false, error: 'Missing script for browser_eval' };
        }
        const raw = await evalScript(toolInput['script']);
        const result = parseEvalResult(raw);
        return { success: true, result };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Browser tool execution failed', {
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

export async function handleBrowserToolResponse(
  message: Extract<WebviewMessage, { type: 'browser:tool_response' }>
): Promise<void> {
  try {
    await browserToolResponse(message.session_id, message.response);
  } catch (error) {
    logger.error('Failed to send browser tool response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// HMR cleanup: Reset module-level state when module is hot-replaced
// This prevents stale cached state from causing issues during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetBrowserToolState();
  });
}
