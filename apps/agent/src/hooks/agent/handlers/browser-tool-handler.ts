import { createLogger } from '@orbit/common/lib';

import orbitRuntimeSource from '../../../../../../src-tauri/src/commands/browser/orbit_runtime.js?raw';

import { recordBrowserActivityFromAI } from './browser-handlers';

import type { WebviewMessage } from '@/types/protocol';

import {
  browserBack,
  browserClose,
  browserEval,
  browserEvalAsync,
  browserForward,
  browserHas,
  browserInfo,
  browserNavigate,
  browserReload,
  browserScreenshot,
  browserToolResponse,
  browserWaitForSelector,
  browserWaitForUrl,
} from '@/lib/api/browser';
import { useBrowserLifecycleStore } from '@/stores/browser/browser-lifecycle-store';
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('BrowserToolHandler');
const DEFAULT_OPEN_URL = 'https://example.com';
const BROWSER_READY_TIMEOUT_MS = 10000;
const BROWSER_READY_POLL_MS = 250;
const DEFAULT_WAIT_TIMEOUT_MS = 30000;
const MAX_WAIT_TIMEOUT_MS = 120000;
const RUNTIME_UNAVAILABLE_MESSAGE = 'Page CSP blocks script injection. Runtime unavailable.';
const NO_TARGET_MESSAGE = 'Provide ref (from snapshot) or selector (CSS)';

// Browser API detection state with promise coalescing to prevent race conditions
let browserHasTauriApi: boolean | null = null;
let detectionPromise: Promise<boolean> | null = null;

// AbortController for canceling browser ready polling
let browserReadyAbortController: AbortController | null = null;

// Snapshot epoch cache for degraded/CSP fallbacks before the Rust-side runtime wiring lands
let browserSnapshotEpoch = 0;

interface BrowserToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface BrowserToolTarget {
  ref?: string;
  selector?: string;
}

interface SnapshotResponse {
  epoch: number;
  snapshot: string;
  refCount: number;
  totalElements: number;
  emittedElements: number;
  truncated: boolean;
  url: string;
  title: string;
  durationMs: number;
}

/**
 * Allowed URL protocols for browser navigation (security).
 * Note: data: protocol is intentionally excluded as it can be abused for XSS
 * attacks via data:text/html URLs containing malicious scripts.
 */
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'about:'];

const EXPECTED_ORBIT_RUNTIME_VERSION =
  /const RUNTIME_VERSION = '([^']+)'/.exec(orbitRuntimeSource)?.[1] ?? 'unknown';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCspRuntimeErrorMessage(message: string): boolean {
  return message.includes('CSP');
}

/**
 * Validate a URL for browser navigation.
 * Only allows safe protocols to prevent security issues.
 *
 * @returns The validated URL or an error message
 */
function validateBrowserUrl(
  url: string
): { valid: true; url: string } | { valid: false; error: string } {
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

function serializeForInjection(value: unknown): string {
  return JSON.stringify(value);
}

function parseEvalResult(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (isRecord(parsed) && '__error' in parsed) {
    const errorValue = parsed['__error'];
    throw new Error(typeof errorValue === 'string' ? errorValue : JSON.stringify(errorValue));
  }
  return parsed;
}

function getTargetInput(toolInput: Record<string, unknown>): BrowserToolTarget {
  const target: BrowserToolTarget = {};
  if (typeof toolInput['ref'] === 'string') {
    target.ref = toolInput['ref'];
  }
  if (typeof toolInput['selector'] === 'string') {
    target.selector = toolInput['selector'];
  }
  return target;
}

function hasRefTarget(target: BrowserToolTarget): target is BrowserToolTarget & { ref: string } {
  return typeof target.ref === 'string' && target.ref.length > 0;
}

function hasSelectorTarget(
  target: BrowserToolTarget
): target is BrowserToolTarget & { selector: string } {
  return typeof target.selector === 'string' && target.selector.length > 0;
}

function getRequiredTarget(toolInput: Record<string, unknown>): BrowserToolTarget | null {
  const target = getTargetInput(toolInput);
  return hasRefTarget(target) || hasSelectorTarget(target) ? target : null;
}

function getOptionalTarget(toolInput: Record<string, unknown>): BrowserToolTarget | null {
  const target = getTargetInput(toolInput);
  return hasRefTarget(target) || hasSelectorTarget(target) ? target : null;
}

function resetBrowserApiCache(): void {
  browserHasTauriApi = null;
  detectionPromise = null;
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
  browserSnapshotEpoch = 0;
  resetBrowserApiCache();
}

async function detectBrowserTauriApi(): Promise<boolean> {
  if (browserHasTauriApi !== null) {
    return browserHasTauriApi;
  }

  detectionPromise ??= (async (): Promise<boolean> => {
    try {
      const raw = await browserEval('return typeof window.__TAURI__?.core?.invoke === "function"');
      browserHasTauriApi = parseEvalResult(raw) === true;
    } catch (error) {
      logger.warn('Browser Tauri API probe failed', {
        error: extractErrorMessage(error),
      });
      browserHasTauriApi = false;
    }
    return browserHasTauriApi;
  })();

  return detectionPromise;
}

async function evalScript(script: string): Promise<string> {
  const hasTauriApi = await detectBrowserTauriApi();
  if (!hasTauriApi) {
    return browserEval(script);
  }

  try {
    return await browserEvalAsync(script);
  } catch (error) {
    logger.warn('browserEvalAsync failed, falling back to sync eval', {
      error: extractErrorMessage(error),
    });
    resetBrowserApiCache();
    return browserEval(script);
  }
}

async function waitForBrowserReady(timeoutMs: number): Promise<boolean> {
  if (browserReadyAbortController) {
    browserReadyAbortController.abort();
  }
  browserReadyAbortController = new AbortController();
  const signal = browserReadyAbortController.signal;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      return false;
    }
    try {
      if (await browserHas()) {
        return true;
      }
    } catch (error) {
      logger.warn('Browser readiness check failed', {
        error: extractErrorMessage(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, BROWSER_READY_POLL_MS));
  }
  return false;
}

async function getOrbitRuntimeVersion(): Promise<string | null> {
  const raw = await evalScript('return window.__orbit?.VERSION ?? null');
  const parsed = parseEvalResult(raw);
  return typeof parsed === 'string' ? parsed : null;
}

async function ensureOrbitRuntime(): Promise<void> {
  const currentVersion = await getOrbitRuntimeVersion();
  if (currentVersion === EXPECTED_ORBIT_RUNTIME_VERSION) {
    return;
  }

  try {
    const injectScript = `${orbitRuntimeSource}\nreturn window.__orbit?.VERSION ?? null;`;
    const raw = await evalScript(injectScript);
    const injectedVersion = parseEvalResult(raw);
    if (injectedVersion !== EXPECTED_ORBIT_RUNTIME_VERSION) {
      throw new Error(
        `Orbit runtime injection failed (expected ${EXPECTED_ORBIT_RUNTIME_VERSION}, received ${String(injectedVersion)})`
      );
    }
  } catch (error) {
    const message = extractErrorMessage(error);
    if (isCspRuntimeErrorMessage(message)) {
      throw new Error(RUNTIME_UNAVAILABLE_MESSAGE, { cause: error });
    }
    throw error;
  }
}

async function warmOrbitRuntimeIfPossible(url: string): Promise<void> {
  if (url === 'about:blank') {
    return;
  }

  try {
    await ensureOrbitRuntime();
  } catch (error) {
    logger.warn('Orbit runtime warm-up failed', {
      error: extractErrorMessage(error),
    });
  }
}

async function invokeOrbitRuntimeMethod<T>(methodName: string, args: unknown[] = []): Promise<T> {
  await ensureOrbitRuntime();

  const script = `
    const orbit = window.__orbit;
    if (!orbit || typeof orbit[${serializeForInjection(methodName)}] !== 'function') {
      return { __error: ${serializeForInjection(RUNTIME_UNAVAILABLE_MESSAGE)} };
    }
    return orbit[${serializeForInjection(methodName)}](...${serializeForInjection(args)});
  `;

  const raw = await evalScript(script);
  return parseEvalResult(raw) as T;
}

function createClickSelectorScript(selector: string): string {
  return `
    const el = document.querySelector(${serializeForInjection(selector)});
    if (el instanceof HTMLElement) {
      el.click();
      return { clicked: true };
    }
    return { __error: ${serializeForInjection(`No element found for selector: ${selector}`)} };
  `;
}

function createTypeSelectorScript(selector: string, text: string): string {
  return `
    const el = document.querySelector(${serializeForInjection(selector)});
    if (!el) {
      return { __error: ${serializeForInjection(`No element found for selector: ${selector}`)} };
    }
    const setValue = (target, value) => {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value');
        if (setter && typeof setter.set === 'function') {
          setter.set.call(target, value);
        } else {
          target.value = value;
        }
        return true;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        target.textContent = value;
        return true;
      }
      return false;
    };
    let currentValue =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value
        : el instanceof HTMLElement && el.isContentEditable
          ? el.textContent || ''
          : null;
    if (currentValue === null) {
      return { __error: 'Target is not a typable element' };
    }
    el.focus?.();
    for (const character of ${serializeForInjection(text)}) {
      const keyCode = character.length === 1 ? character.toUpperCase().charCodeAt(0) : 0;
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: character, keyCode, which: keyCode }));
      el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: character, keyCode, which: keyCode }));
      if (!setValue(el, String(currentValue + character))) {
        return { __error: 'Target is not a typable element' };
      }
      currentValue += character;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: character, keyCode, which: keyCode }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { typed: true };
  `;
}

function createFillSelectorScript(selector: string, value: string): string {
  return `
    const el = document.querySelector(${serializeForInjection(selector)});
    if (!el) {
      return { __error: ${serializeForInjection(`No element found for selector: ${selector}`)} };
    }
    const setValue = (target, nextValue) => {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value');
        if (setter && typeof setter.set === 'function') {
          setter.set.call(target, nextValue);
        } else {
          target.value = nextValue;
        }
        return true;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        target.textContent = nextValue;
        return true;
      }
      return false;
    };
    if (!setValue(el, ${serializeForInjection(value)})) {
      return { __error: 'Target is not a fillable element' };
    }
    el.focus?.();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: true };
  `;
}

function createGetTextSelectorScript(selector: string): string {
  return `return document.querySelector(${serializeForInjection(selector)})?.textContent?.trim() ?? ''`;
}

function createGetHtmlSelectorScript(selector: string, outer: boolean): string {
  return `return document.querySelector(${serializeForInjection(selector)})?.${outer ? 'outerHTML' : 'innerHTML'} ?? ''`;
}

function clampWaitTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  if (value <= 0) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(value), MAX_WAIT_TIMEOUT_MS);
}

function buildDegradedSnapshot(url: string): SnapshotResponse {
  browserSnapshotEpoch += 1;
  return {
    epoch: browserSnapshotEpoch,
    snapshot: '- document [CSP blocked — runtime could not be injected]',
    refCount: 0,
    totalElements: 0,
    emittedElements: 0,
    truncated: false,
    url,
    title: '',
    durationMs: 0,
  };
}

function buildBlankSnapshot(url: string): SnapshotResponse {
  browserSnapshotEpoch += 1;
  return {
    epoch: browserSnapshotEpoch,
    snapshot: '- document (empty)',
    refCount: 0,
    totalElements: 0,
    emittedElements: 0,
    truncated: false,
    url,
    title: '',
    durationMs: 0,
  };
}

function trackSnapshotEpoch(result: unknown): void {
  if (isRecord(result) && typeof result['epoch'] === 'number') {
    browserSnapshotEpoch = result['epoch'];
  }
}

function getActiveBrowserUrl(info: Awaited<ReturnType<typeof browserInfo>>): string {
  const storeUrl = useBrowserStore.getState().navigation.url;
  return info?.url ?? (storeUrl.length > 0 ? storeUrl : 'about:blank');
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
        const urlValidation = validateBrowserUrl(rawUrl);
        if (!urlValidation.valid) {
          return { success: false, error: urlValidation.error };
        }
        const url = urlValidation.url;

        useUIStore.getState().openBrowserTab();
        resetBrowserApiCache();

        const exists = await browserHas();
        if (exists) {
          await browserNavigate(url);
        } else {
          if (useBrowserStore.getState().isActive) {
            useBrowserStore.getState().reset();
            useBrowserLifecycleStore.getState().reset();
          }
          useBrowserStore.getState().setPendingNavigationUrl(url);
        }

        const browserReady = await waitForBrowserReady(BROWSER_READY_TIMEOUT_MS);
        if (!browserReady) {
          return {
            success: false,
            error: `Browser did not become ready within ${String(BROWSER_READY_TIMEOUT_MS)}ms`,
          };
        }

        await warmOrbitRuntimeIfPossible(url);
        return { success: true, result: { opened: true, url } };
      }

      case 'browser_navigate': {
        if (typeof toolInput['url'] !== 'string') {
          return { success: false, error: 'Missing url for browser_navigate' };
        }

        const urlValidation = validateBrowserUrl(toolInput['url']);
        if (!urlValidation.valid) {
          return { success: false, error: urlValidation.error };
        }
        const url = urlValidation.url;

        useUIStore.getState().openBrowserTab();
        resetBrowserApiCache();

        const exists = await browserHas();
        if (exists) {
          await browserNavigate(url);
        } else {
          if (useBrowserStore.getState().isActive) {
            useBrowserStore.getState().reset();
            useBrowserLifecycleStore.getState().reset();
          }
          useBrowserStore.getState().setPendingNavigationUrl(url);
        }

        const browserReady = await waitForBrowserReady(BROWSER_READY_TIMEOUT_MS);
        if (!browserReady) {
          return {
            success: false,
            error: `Browser did not become ready within ${String(BROWSER_READY_TIMEOUT_MS)}ms after navigation`,
          };
        }

        await warmOrbitRuntimeIfPossible(url);
        return { success: true, result: { navigated: true, url } };
      }

      case 'browser_snapshot': {
        const info = await browserInfo().catch(() => null);
        const currentUrl = getActiveBrowserUrl(info);

        if (currentUrl === 'about:blank') {
          const blankSnapshot = buildBlankSnapshot(currentUrl);
          return { success: true, result: blankSnapshot };
        }

        try {
          const result = await invokeOrbitRuntimeMethod<SnapshotResponse>('snapshot', [
            {
              interactive: toolInput['interactive'] !== false,
              cursor: toolInput['cursor'] === true,
              compact: toolInput['compact'] === true,
            },
          ]);
          trackSnapshotEpoch(result);
          return { success: true, result };
        } catch (error) {
          const message = extractErrorMessage(error);
          if (isCspRuntimeErrorMessage(message)) {
            return { success: true, result: buildDegradedSnapshot(currentUrl) };
          }
          return { success: false, error: message };
        }
      }

      case 'browser_get_url': {
        const raw = await evalScript('return { url: location.href }');
        return { success: true, result: parseEvalResult(raw) };
      }

      case 'browser_get_title': {
        const raw = await evalScript('return { title: document.title ?? "" }');
        return { success: true, result: parseEvalResult(raw) };
      }

      case 'browser_click': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        if (!hasRefTarget(target) && hasSelectorTarget(target)) {
          const raw = await evalScript(createClickSelectorScript(target.selector));
          return { success: true, result: parseEvalResult(raw) };
        }
        const result = await invokeOrbitRuntimeMethod('click', [target]);
        return { success: true, result };
      }

      case 'browser_type': {
        const target = getRequiredTarget(toolInput);
        if (!target || typeof toolInput['text'] !== 'string') {
          return { success: false, error: 'Missing ref/selector or text for browser_type' };
        }
        if (!hasRefTarget(target) && hasSelectorTarget(target)) {
          const raw = await evalScript(
            createTypeSelectorScript(target.selector, toolInput['text'])
          );
          return { success: true, result: parseEvalResult(raw) };
        }
        const result = await invokeOrbitRuntimeMethod('type', [target, toolInput['text']]);
        return { success: true, result };
      }

      case 'browser_fill': {
        const target = getRequiredTarget(toolInput);
        if (!target || typeof toolInput['value'] !== 'string') {
          return { success: false, error: 'Missing ref/selector or value for browser_fill' };
        }
        if (!hasRefTarget(target) && hasSelectorTarget(target)) {
          const raw = await evalScript(
            createFillSelectorScript(target.selector, toolInput['value'])
          );
          return { success: true, result: parseEvalResult(raw) };
        }
        const result = await invokeOrbitRuntimeMethod('fill', [target, toolInput['value']]);
        return { success: true, result };
      }

      case 'browser_get_text': {
        const target = getOptionalTarget(toolInput);
        if (!target || (!hasRefTarget(target) && !hasSelectorTarget(target))) {
          const raw = await evalScript(createGetTextSelectorScript('body'));
          return { success: true, result: parseEvalResult(raw) };
        }
        if (!hasRefTarget(target) && hasSelectorTarget(target)) {
          const raw = await evalScript(createGetTextSelectorScript(target.selector));
          return { success: true, result: parseEvalResult(raw) };
        }
        const result = await invokeOrbitRuntimeMethod('getText', [target]);
        return { success: true, result };
      }

      case 'browser_get_html': {
        const outer = toolInput['outer'] === true;
        const target = getOptionalTarget(toolInput);
        if (!target || (!hasRefTarget(target) && !hasSelectorTarget(target))) {
          const raw = await evalScript(createGetHtmlSelectorScript('body', outer));
          return { success: true, result: parseEvalResult(raw) };
        }
        if (!hasRefTarget(target) && hasSelectorTarget(target)) {
          const raw = await evalScript(createGetHtmlSelectorScript(target.selector, outer));
          return { success: true, result: parseEvalResult(raw) };
        }
        const result = await invokeOrbitRuntimeMethod('getHtml', [target, outer]);
        return { success: true, result };
      }

      case 'browser_console_logs': {
        const level = typeof toolInput['level'] === 'string' ? toolInput['level'] : undefined;
        const result = await invokeOrbitRuntimeMethod('getConsoleLogs', [level]);
        return { success: true, result };
      }

      case 'browser_screenshot': {
        try {
          const raw = await browserScreenshot();
          const result: unknown = JSON.parse(raw);
          return { success: true, result };
        } catch (error) {
          const message = extractErrorMessage(error);
          if (
            message.includes('No browser exists') ||
            message.includes('Browser window not found')
          ) {
            return { success: false, error: message };
          }

          const info = await browserInfo().catch(() => null);
          return {
            success: true,
            result: {
              filePath: null,
              metadata: {
                url: getActiveBrowserUrl(info),
                error: `Screenshot capture failed: ${message}`,
              },
            },
          };
        }
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
        const info = await browserInfo().catch(() => null);
        await warmOrbitRuntimeIfPossible(getActiveBrowserUrl(info));
        return { success: true };
      }

      case 'browser_close': {
        await browserClose();
        useBrowserStore.getState().reset();
        useBrowserLifecycleStore.getState().reset();
        useUIStore.getState().setActivityTab('source');
        resetBrowserApiCache();
        return { success: true };
      }

      case 'browser_eval': {
        if (typeof toolInput['script'] !== 'string') {
          return { success: false, error: 'Missing script for browser_eval' };
        }
        const raw = await evalScript(toolInput['script']);
        return { success: true, result: parseEvalResult(raw) };
      }

      case 'browser_check': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('check', [target]);
        return { success: true, result };
      }

      case 'browser_uncheck': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('uncheck', [target]);
        return { success: true, result };
      }

      case 'browser_select': {
        const target = getRequiredTarget(toolInput);
        if (!target || !Array.isArray(toolInput['values'])) {
          return { success: false, error: 'Missing ref/selector or values for browser_select' };
        }
        const values = toolInput['values'].filter(
          (value): value is string => typeof value === 'string'
        );
        const result = await invokeOrbitRuntimeMethod('select', [target, values]);
        return { success: true, result };
      }

      case 'browser_hover': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('hover', [target]);
        return { success: true, result };
      }

      case 'browser_focus': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('focus', [target]);
        return { success: true, result };
      }

      case 'browser_scroll': {
        const target = getOptionalTarget(toolInput);
        const direction =
          typeof toolInput['direction'] === 'string' ? toolInput['direction'] : null;
        if (!direction) {
          return { success: false, error: 'Missing direction for browser_scroll' };
        }
        const amount =
          typeof toolInput['amount'] === 'number' && Number.isFinite(toolInput['amount'])
            ? toolInput['amount']
            : undefined;
        const result = await invokeOrbitRuntimeMethod(
          'scroll',
          target ? [target, direction, amount] : [null, direction, amount]
        );
        return { success: true, result };
      }

      case 'browser_scroll_into_view': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('scrollIntoView', [target]);
        return { success: true, result };
      }

      case 'browser_wait_for_selector': {
        if (typeof toolInput['selector'] !== 'string') {
          return { success: false, error: 'Missing selector for browser_wait_for_selector' };
        }
        await browserWaitForSelector(
          toolInput['selector'],
          typeof toolInput['state'] === 'string' ? toolInput['state'] : undefined,
          clampWaitTimeout(toolInput['timeout'])
        );
        return { success: true, result: { matched: true } };
      }

      case 'browser_wait_for_url': {
        if (typeof toolInput['url'] !== 'string') {
          return { success: false, error: 'Missing url for browser_wait_for_url' };
        }
        await browserWaitForUrl(toolInput['url'], clampWaitTimeout(toolInput['timeout']));
        return { success: true, result: { matched: true } };
      }

      case 'browser_is_visible': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('isVisible', [target]);
        return { success: true, result };
      }

      case 'browser_is_enabled': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('isEnabled', [target]);
        return { success: true, result };
      }

      case 'browser_get_attribute': {
        const target = getRequiredTarget(toolInput);
        if (!target || typeof toolInput['name'] !== 'string') {
          return {
            success: false,
            error: 'Missing ref/selector or name for browser_get_attribute',
          };
        }
        const result = await invokeOrbitRuntimeMethod('getAttribute', [target, toolInput['name']]);
        return { success: true, result };
      }

      case 'browser_bounding_box': {
        const target = getRequiredTarget(toolInput);
        if (!target) {
          return { success: false, error: NO_TARGET_MESSAGE };
        }
        const result = await invokeOrbitRuntimeMethod('boundingBox', [target]);
        return { success: true, result };
      }

      case 'browser_count': {
        if (typeof toolInput['selector'] !== 'string') {
          return { success: false, error: 'Missing selector for browser_count' };
        }
        const raw = await evalScript(
          `return { count: document.querySelectorAll(${serializeForInjection(toolInput['selector'])}).length }`
        );
        return { success: true, result: parseEvalResult(raw) };
      }

      case 'browser_cookies_get': {
        const result = await invokeOrbitRuntimeMethod('getCookies', [
          {
            name: typeof toolInput['name'] === 'string' ? toolInput['name'] : undefined,
            domain: typeof toolInput['domain'] === 'string' ? toolInput['domain'] : undefined,
          },
        ]);
        return { success: true, result };
      }

      case 'browser_cookies_clear': {
        const result = await invokeOrbitRuntimeMethod('clearCookies', [
          {
            name: typeof toolInput['name'] === 'string' ? toolInput['name'] : undefined,
            domain: typeof toolInput['domain'] === 'string' ? toolInput['domain'] : undefined,
          },
        ]);
        return { success: true, result };
      }

      case 'browser_storage_get': {
        if (typeof toolInput['key'] !== 'string') {
          return { success: false, error: 'Missing key for browser_storage_get' };
        }
        const result = await invokeOrbitRuntimeMethod('storageGet', [
          toolInput['key'],
          typeof toolInput['store'] === 'string' ? toolInput['store'] : undefined,
        ]);
        return { success: true, result };
      }

      case 'browser_storage_set': {
        if (typeof toolInput['key'] !== 'string' || typeof toolInput['value'] !== 'string') {
          return { success: false, error: 'Missing key or value for browser_storage_set' };
        }
        const result = await invokeOrbitRuntimeMethod('storageSet', [
          toolInput['key'],
          toolInput['value'],
          typeof toolInput['store'] === 'string' ? toolInput['store'] : undefined,
        ]);
        return { success: true, result };
      }

      case 'browser_storage_clear': {
        const result = await invokeOrbitRuntimeMethod('storageClear', [
          typeof toolInput['store'] === 'string' ? toolInput['store'] : undefined,
        ]);
        return { success: true, result };
      }

      case 'browser_network_requests': {
        const result = await invokeOrbitRuntimeMethod('getNetworkRequests', [toolInput['filter']]);
        return { success: true, result };
      }

      case 'browser_runtime_info': {
        const hasBrowser = await browserHas().catch(() => false);
        if (!hasBrowser) {
          return { success: true, result: { available: false, reason: 'No browser open' } };
        }

        try {
          const result = await invokeOrbitRuntimeMethod('runtimeInfo');
          return { success: true, result };
        } catch (error) {
          const message = extractErrorMessage(error);
          if (isCspRuntimeErrorMessage(message)) {
            return { success: true, result: { available: false, reason: 'CSP blocked' } };
          }
          return { success: false, error: message };
        }
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
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
      error: extractErrorMessage(error),
    });
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetBrowserToolState();
  });
}
