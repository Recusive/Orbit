/**
 * Element picker injection for the embedded browser.
 *
 * Loads react-grab into the embedded WKWebView on demand, registers an Orbit
 * plugin that intercepts element selection, and sends the captured context
 * back to the frontend via the `orbit-eval://element-selected` URL scheme
 * (intercepted by the Rust `on_navigation` handler).
 *
 * @see https://github.com/aidenybai/react-grab
 */

import { createLogger } from '@orbit/common/lib';

import { browserEval } from '@/lib/api/browser';

const logger = createLogger('ReactGrabInjector');

/**
 * CDN URL for react-grab global bundle.
 * Pinned to 0.1.x to avoid breaking changes.
 */
const REACT_GRAB_CDN_URL = 'https://unpkg.com/react-grab@0.1/dist/index.global.js';

/**
 * Build the JavaScript injection script that runs inside the embedded browser.
 *
 * The script:
 * 1. Loads react-grab from CDN (or reactivates if already injected)
 * 2. Registers an "orbit" plugin with `onElementSelect` hook
 * 3. When the user selects an element, captures its context (React component
 *    info, CSS selector, tag name, truncated outerHTML)
 * 4. Sends the data back via `orbit-eval://element-selected?data=<json>`
 * 5. Returns true from onElementSelect to signal interception (prevents "failed to copy")
 */
function buildInjectionScript(): string {
  // NOTE: This string is eval'd inside the embedded WKWebView.
  // It runs in the browsed page's JavaScript context, NOT in our React app.
  return `
(async () => {
  // Re-activate if already injected
  if (window.__REACT_GRAB__) {
    window.__REACT_GRAB__.activate();
    return 'reactivated';
  }

  // Load react-grab global bundle from CDN
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ${JSON.stringify(REACT_GRAB_CDN_URL)};
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load react-grab from CDN'));
    document.head.appendChild(s);
  });

  const api = window.__REACT_GRAB__;
  if (!api) throw new Error('react-grab failed to initialize');

  // Build a CSS selector path for an element (for display and re-selection)
  function buildCSSSelector(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let sel = current.tagName.toLowerCase();
      if (current.id) {
        sel += '#' + CSS.escape(current.id);
        parts.unshift(sel);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          sel += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }
      parts.unshift(sel);
      current = current.parentElement;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  // Register the Orbit plugin
  api.registerPlugin({
    name: 'orbit',
    hooks: {
      onElementSelect: (element) => {
        const displayName = api.getDisplayName(element);
        const epoch = Date.now();

        // Capture textContent synchronously (sanitized, max 200 chars)
        const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
        const rawText = skipTags.has(element.tagName) ? '' : (element.textContent || '');
        const textContent = rawText.replace(/\\s+/g, ' ').trim().substring(0, 200);

        const selector = buildCSSSelector(element);
        const data = {
          componentName: displayName || element.tagName.toLowerCase(),
          filePath: '',
          lineNumber: 0,
          props: {},
          componentStack: [],
          tagName: element.tagName.toLowerCase(),
          selector: selector,
          outerHTML: element.outerHTML.substring(0, 5000),
          displayName: displayName || element.tagName.toLowerCase(),
          textContent: textContent,
          epoch: epoch,
        };

        // Fire initial capture immediately (synchronous)
        const encoded = encodeURIComponent(JSON.stringify(data));
        window.location.href = 'orbit-eval://element-selected?data=' + encoded;

        // Deferred: enrich with React source info via SEPARATE URL scheme
        Promise.resolve().then(function() { return api.getSource(element); }).then(function(source) {
          if (!source) return;
          if (!document.querySelector(selector)) return;
          var patch = {
            selector: selector,
            epoch: epoch,
            componentName: source.componentName || displayName || element.tagName.toLowerCase(),
            filePath: source.filePath || '',
            lineNumber: source.lineNumber || 0,
          };
          var enc = encodeURIComponent(JSON.stringify(patch));
          window.location.href = 'orbit-eval://element-enriched?data=' + enc;
        }).catch(function() { /* non-fatal — not a React site */ });

        // Deactivate after selection (one-shot mode for Orbit)
        api.deactivate();

        // Return true to signal interception (prevents "failed to copy" tooltip)
        return true;
      },
    },
    // Customize theme: hide toolbar and crosshair (Orbit has its own UI)
    theme: {
      toolbar: { enabled: false },
      crosshair: { enabled: false },
    },
  });

  api.activate();
  return 'injected';
})()
`;
}

/**
 * Inject react-grab into the embedded browser and activate element selection.
 *
 * Safe to call multiple times — if already injected, just reactivates.
 * The user sees a hover overlay; clicking an element captures its context
 * and sends it back via the `orbit-eval://element-selected` URL scheme.
 */
export async function injectAndActivateGrab(): Promise<void> {
  try {
    const result = await browserEval(buildInjectionScript());
    logger.info('react-grab injection result', { result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to inject react-grab', new Error(message));
    throw err;
  }
}

/**
 * Deactivate the react-grab overlay in the embedded browser.
 *
 * Safe to call even if react-grab was never injected (no-op via optional chaining).
 */
export async function deactivateGrab(): Promise<void> {
  try {
    await browserEval('window.__REACT_GRAB__?.deactivate()');
    logger.info('react-grab deactivated');
  } catch (err: unknown) {
    // Non-fatal: the page may have navigated away, destroying the injected script
    logger.warn('Failed to deactivate react-grab (page may have navigated)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
