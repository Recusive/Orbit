/**
 * Browser handlers for embedded browser webview management.
 *
 * These handlers manage an embedded browser webview within the Orbit window.
 * The browser is truly embedded (not a separate app), uses WebKit on macOS.
 */

import { createLogger } from '@orbit/common/lib';

import type { WebviewMessage } from '@/types/protocol';

import {
  browserBack,
  browserClose,
  browserCreate,
  browserFocus,
  browserForward,
  browserHide,
  browserNavigate,
  browserOpenDevTools,
  browserReload,
  browserSetBounds,
  browserShow,
  browserStop,
} from '@/lib/api';
import { deactivateGrab, injectAndActivateGrab } from '@/lib/browser/react-grab-injector';
import { syncBrowserVisibilityAfterCreate } from '@/lib/browser-overlay-coordination';
import { useBrowserLifecycleStore } from '@/stores/browser/browser-lifecycle-store';
import { useBrowserStore } from '@/stores/browser/browser-store';

const logger = createLogger('BrowserHandlers');

/**
 * Delay before triggering WKWebView repaint after creation.
 * WKWebView sometimes doesn't render properly on initial creation;
 * a resize "kick" after this delay forces it to repaint.
 */
const WKWEBVIEW_REPAINT_DELAY_MS = 200;

/**
 * Handle browser:create - create an embedded browser webview.
 *
 * Creates a true embedded browser within the Orbit window.
 */
export async function handleBrowserCreate(
  message: Extract<WebviewMessage, { type: 'browser:create' }>
): Promise<void> {
  const lifecycleStore = useBrowserLifecycleStore.getState();
  const browserStore = useBrowserStore.getState();

  // Guard: Don't create if already creating or active
  if (lifecycleStore.state === 'starting' || lifecycleStore.state === 'active') {
    logger.debug('Browser creation skipped - already starting or active', {
      state: lifecycleStore.state,
    });
    return;
  }

  // Guard: Skip invalid bounds (viewport hasn't rendered yet)
  const { x, y, width, height, url } = message.bounds;
  if (width < 10 || height < 10) {
    logger.debug('Browser creation skipped - invalid bounds', { width, height });
    return;
  }

  lifecycleStore.setState('starting');

  try {
    const info = await browserCreate(x, y, width, height, url);
    logger.info('Embedded browser created', { label: info.label });

    // Update lifecycle store
    lifecycleStore.setLabel(info.label);
    lifecycleStore.setState('active');
    lifecycleStore.recordActivity();

    // Update browser store (controls UI state)
    browserStore.setViewId(info.label);
    browserStore.setError(null);
    browserStore.setCreating(false);
    syncBrowserVisibilityAfterCreate();

    // Delayed resize to force WKWebView repaint
    // Manual resize works because it happens AFTER webview initialization
    const currentLabel = info.label;
    setTimeout(() => {
      // Guard: Check if browser is still active with the same label
      const currentState = useBrowserLifecycleStore.getState();
      if (currentState.state !== 'active' || currentState.label !== currentLabel) {
        // Browser was closed or recreated - skip the resize
        return;
      }

      // First resize slightly smaller, then to correct size
      browserSetBounds(x, y, width - 1, height - 1)
        .then(() => browserSetBounds(x, y, width, height))
        .catch(() => {
          // Ignore errors - this is just to trigger repaint
        });
    }, WKWEBVIEW_REPAINT_DELAY_MS);

    window.postMessage(
      {
        type: 'browser:created',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        label: info.label,
        url: info.url,
      },
      '*'
    );
  } catch (err: unknown) {
    // Tauri errors can be strings or Error objects - capture the full error
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err) || 'Failed to create browser';

    // Check if this is an "already exists" error - don't reset state in that case
    // The browser was successfully created by a previous call
    const isAlreadyExists = errorMessage.includes('already exists');

    if (isAlreadyExists) {
      logger.debug('Browser already exists (race condition handled)', { error: errorMessage });
      // Don't reset state - browser is already running
      browserStore.setCreating(false);
      return;
    }

    logger.error('Browser creation failed', { error: err, message: errorMessage });

    lifecycleStore.setError(errorMessage);
    lifecycleStore.setState('idle');

    browserStore.setCreating(false);
    browserStore.setError(errorMessage);

    window.postMessage(
      {
        type: 'browser:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

/**
 * Handle browser:navigate - navigate the embedded browser to a URL.
 */
export async function handleBrowserNavigate(
  message: Extract<WebviewMessage, { type: 'browser:navigate' }>
): Promise<void> {
  // Clear any previous error before navigation
  useBrowserStore.getState().setError(null);

  try {
    await browserNavigate(message.url);
    useBrowserLifecycleStore.getState().recordActivity();
  } catch (err: unknown) {
    // Tauri errors can be strings or Error objects - capture the full error
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err) || 'Navigation failed';
    logger.warn('Browser navigation failed', { error: err, message: errorMessage });
    // Surface error to UI so user gets feedback
    useBrowserStore.getState().setError(errorMessage);
  }
}

/**
 * Internal: Close the embedded browser and reset state.
 */
async function closeBrowserInternal(requestUuid: string): Promise<void> {
  const lifecycleStore = useBrowserLifecycleStore.getState();
  const browserStore = useBrowserStore.getState();

  lifecycleStore.setState('closing');

  try {
    await browserClose();

    // Reset both stores
    lifecycleStore.reset();
    browserStore.reset();

    window.postMessage(
      {
        type: 'browser:cleared',
        uuid: crypto.randomUUID(),
        request_uuid: requestUuid,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to close browser';
    logger.warn('Browser close failed', { error: errorMessage });

    // Reset anyway
    lifecycleStore.reset();
    browserStore.reset();
  }
}

/**
 * Handle browser:bounds - resize/reposition embedded browser.
 *
 * Called by the BrowserPanel when it resizes or the window moves.
 */
export async function handleBrowserBounds(
  message: Extract<WebviewMessage, { type: 'browser:bounds' }>
): Promise<void> {
  const store = useBrowserLifecycleStore.getState();

  // Only reposition if browser is running
  if (store.state !== 'active' && store.state !== 'inactive') {
    return;
  }

  const { x, y, width, height } = message.bounds;

  // Skip invalid bounds - can happen during mount before layout is ready
  // or when panel is collapsing. Min size 10px to avoid near-zero dimensions.
  // Also reject negative coordinates which indicate an invalid viewport state.
  if (width < 10 || height < 10 || x < 0 || y < 0) {
    logger.debug('Skipping invalid bounds', { x, y, width, height });
    return;
  }

  try {
    await browserSetBounds(x, y, width, height);
    // Note: Don't record activity here - bounds updates happen constantly
  } catch (err: unknown) {
    // Don't propagate errors - positioning can fail transiently
    const errorMessage = err instanceof Error ? err.message : 'Failed to position browser';
    logger.warn('Browser positioning failed', { error: errorMessage });
  }
}

/**
 * Record browser activity from AI tool usage.
 *
 * Call this when browser-related AI tools are invoked to reset idle timer.
 */
export function recordBrowserActivityFromAI(): void {
  const store = useBrowserLifecycleStore.getState();
  if (store.state === 'active' || store.state === 'inactive') {
    store.recordActivity();
  }
}

// ═══════════════════════════════════════════════════════════════
// Navigation handlers
// ═══════════════════════════════════════════════════════════════

/**
 * Handle browser:back - go back in browser history.
 */
export async function handleBrowserBack(
  message: Extract<WebviewMessage, { type: 'browser:back' }>
): Promise<void> {
  try {
    await browserBack();
    useBrowserLifecycleStore.getState().recordActivity();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Back navigation failed';
    logger.warn('Browser back failed', { error: errorMessage, requestId: message.uuid });
  }
}

/**
 * Handle browser:forward - go forward in browser history.
 */
export async function handleBrowserForward(
  message: Extract<WebviewMessage, { type: 'browser:forward' }>
): Promise<void> {
  try {
    await browserForward();
    useBrowserLifecycleStore.getState().recordActivity();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Forward navigation failed';
    logger.warn('Browser forward failed', { error: errorMessage, requestId: message.uuid });
  }
}

/**
 * Handle browser:reload - reload the current page.
 */
export async function handleBrowserReload(
  message: Extract<WebviewMessage, { type: 'browser:reload' }>
): Promise<void> {
  try {
    await browserReload();
    useBrowserLifecycleStore.getState().recordActivity();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Reload failed';
    logger.warn('Browser reload failed', { error: errorMessage, requestId: message.uuid });
  }
}

/**
 * Handle browser:stop - stop loading the current page.
 */
export async function handleBrowserStop(
  message: Extract<WebviewMessage, { type: 'browser:stop' }>
): Promise<void> {
  try {
    await browserStop();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Stop failed';
    logger.warn('Browser stop failed', { error: errorMessage, requestId: message.uuid });
  }
}

// ═══════════════════════════════════════════════════════════════
// Visibility handlers
// ═══════════════════════════════════════════════════════════════

/**
 * Handle browser:show - show the embedded browser webview.
 */
export async function handleBrowserShow(
  message: Extract<WebviewMessage, { type: 'browser:show' }>
): Promise<void> {
  try {
    await browserShow();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Show failed';
    logger.warn('Browser show failed', { error: errorMessage, requestId: message.uuid });
  }
}

/**
 * Handle browser:hide - hide the embedded browser webview.
 */
export async function handleBrowserHide(
  message: Extract<WebviewMessage, { type: 'browser:hide' }>
): Promise<void> {
  try {
    await browserHide();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Hide failed';
    logger.warn('Browser hide failed', { error: errorMessage, requestId: message.uuid });
  }
}

// ═══════════════════════════════════════════════════════════════
// Legacy handlers
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use handleBrowserCreate instead.
 * Handle browser:detect - legacy handler for external browser detection.
 */
export function handleBrowserDetect(
  message: Extract<WebviewMessage, { type: 'browser:detect' }>
): void {
  const browserStore = useBrowserStore.getState();
  browserStore.setCreating(false);
  browserStore.setError(
    'External browser detection is no longer supported. The browser is now embedded within Orbit.'
  );

  window.postMessage(
    {
      type: 'browser:error',
      uuid: crypto.randomUUID(),
      request_uuid: message.uuid,
      error: 'Use browser:create to create an embedded browser',
    },
    '*'
  );
}

/**
 * Handle browser:clear - close the embedded browser.
 *
 * This closes the embedded webview and resets browser state.
 */
export async function handleBrowserClear(
  message: Extract<WebviewMessage, { type: 'browser:clear' }>
): Promise<void> {
  await closeBrowserInternal(message.uuid);
}

/**
 * Handle browser:devtools - open DevTools for the embedded browser.
 *
 * Opens native WebKit inspector in a detached window.
 * Only available in debug builds.
 */
export async function handleBrowserDevTools(
  message: Extract<WebviewMessage, { type: 'browser:devtools' }>
): Promise<void> {
  try {
    await browserOpenDevTools();
    logger.info('DevTools opened for embedded browser', { requestId: message.uuid });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to open DevTools';
    logger.warn('Failed to open DevTools', { error: errorMessage });
  }
}

// ═══════════════════════════════════════════════════════════════
// Element selection handlers (react-grab injection)
// ═══════════════════════════════════════════════════════════════

/**
 * Handle browser:select-element:start — inject react-grab and activate element picker.
 *
 * Loads react-grab into the embedded WKWebView, registers an Orbit plugin,
 * and activates the hover overlay. The user clicks an element to select it;
 * the data flows back via `orbit-eval://element-selected` URL interception.
 */
export async function handleBrowserSelectElementStart(
  message: Extract<WebviewMessage, { type: 'browser:select-element:start' }>
): Promise<void> {
  const browserStore = useBrowserStore.getState();
  browserStore.setSelectingElement(true);

  try {
    await injectAndActivateGrab();
    // Focus the browser child window so the grab cursor appears immediately
    // without the user needing to click inside the browser area first.
    await browserFocus();
    logger.info('Element selection mode activated', { requestId: message.uuid });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to start element selection';
    logger.error('Element selection failed', new Error(errorMessage));
    browserStore.setSelectingElement(false);
    browserStore.setError(errorMessage);
  }
}

/**
 * Handle browser:select-element:cancel — deactivate react-grab overlay.
 */
export async function handleBrowserSelectElementCancel(
  message: Extract<WebviewMessage, { type: 'browser:select-element:cancel' }>
): Promise<void> {
  useBrowserStore.getState().setSelectingElement(false);

  try {
    await deactivateGrab();
    logger.info('Element selection mode cancelled', { requestId: message.uuid });
  } catch (err: unknown) {
    // Non-fatal — the page may have navigated, destroying the injected script
    logger.warn('Failed to deactivate element picker', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
