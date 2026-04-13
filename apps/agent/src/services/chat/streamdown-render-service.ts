/**
 * Streamdown Background Render Service
 *
 * Pre-renders completed message content through real Streamdown + Shiki in
 * a hidden DOM container, caching the resulting HTML and pixel height. When
 * TanStack Virtual mounts a message, FlowTokenSegment serves the cached
 * HTML via dangerouslySetInnerHTML (~0.05ms) instead of running the full
 * Streamdown pipeline (~1.5ms). Since the cached HTML matches the final
 * layout, the element starts at its correct height — no 265px placeholder,
 * no measurement cascade, no re-render storm.
 *
 * ── Architecture ────────────────────────────────────────────────────────
 *
 * The service maintains a hidden <div> that matches the chat's actual
 * content width (reads --chat-width-primary CSS var). Messages are queued
 * and processed SEQUENTIALLY — one at a time — via requestIdleCallback to
 * avoid blocking user interactions.
 *
 * A SINGLE persistent React root is reused for all renders. Creating and
 * destroying React roots per message adds ~50ms overhead each. Reusing
 * one root drops per-message cost to ~5ms (re-render only).
 *
 * ── Shiki Async Pattern ─────────────────────────────────────────────────
 *
 * Shiki highlighting is async — `code.highlight()` returns null on the
 * initial call and invokes a callback when ready. Streamdown handles this
 * internally by re-rendering after the callback fires. The render service
 * must wait for layout to stabilize after Shiki callbacks before capturing
 * the final HTML. We use a MutationObserver + debounce to detect when
 * the content has stopped changing.
 * ────────────────────────────────────────────────────────────────────────
 */
import { createLogger } from '@orbit/common/lib';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Streamdown } from 'streamdown';

import type { StreamdownCacheEntry } from '@/lib/chat/streamdown-cache';
import type { Root } from 'react-dom/client';

import {
  getStreamdownCacheSize,
  hasStreamdownCache,
  hashContent,
  setStreamdownCache,
} from '@/lib/chat/streamdown-cache';
import {
  LINK_SAFETY_DISABLED,
  REHYPE_PLUGINS_STATIC,
  REMARK_PLUGINS,
  STREAMDOWN_COMPONENTS,
  STREAMDOWN_PLUGINS,
} from '@/lib/chat/streamdown-config';
import { getChatContentWidth } from '@/lib/chat/streamdown-render-utils';

const logger = createLogger('StreamdownRenderService');

// ── Types ──────────────────────────────────────────────────────────────

interface RenderJob {
  messageId: string;
  text: string;
  contentHash: number;
}

type RenderServiceState = 'idle' | 'processing' | 'disposed';

// ── Constants ──────────────────────────────────────────────────────────

/** Time to wait after last DOM mutation before capturing HTML (Shiki settle). */
const SHIKI_SETTLE_MS = 80;

/** Max time to wait for Shiki to finish highlighting before capturing anyway. */
const SHIKI_TIMEOUT_MS = 2000;

// ── Hidden Container + Persistent React Root ───────────────────────────

let hiddenContainer: HTMLDivElement | null = null;
let renderWrapper: HTMLDivElement | null = null;
let persistentRoot: Root | null = null;

function ensureHiddenContainer(): HTMLDivElement {
  if (hiddenContainer !== null) {
    return hiddenContainer;
  }

  const container = document.createElement('div');
  container.setAttribute('data-testid', 'streamdown-render-service');
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: `${String(getChatContentWidth())}px`,
    overflow: 'visible',
  });
  document.body.appendChild(container);
  hiddenContainer = container;

  // Create a persistent wrapper + React root — reused for every message.
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-markdown prose prose-sm dark:prose-invert max-w-none select-text';
  container.appendChild(wrapper);
  renderWrapper = wrapper;
  persistentRoot = createRoot(wrapper);

  return container;
}

function updateContainerWidth(): void {
  if (hiddenContainer === null) return;
  hiddenContainer.style.width = `${String(getChatContentWidth())}px`;
}

function destroyHiddenContainer(): void {
  if (persistentRoot !== null) {
    persistentRoot.unmount();
    persistentRoot = null;
  }
  renderWrapper = null;
  if (hiddenContainer !== null) {
    hiddenContainer.remove();
    hiddenContainer = null;
  }
}

// ── Render Queue ───────────────────────────────────────────────────────

const queue: RenderJob[] = [];
let state: RenderServiceState = 'idle';
let idleCallbackId = 0;
let totalProcessed = 0;
let totalSkipped = 0;

function scheduleNext(): void {
  if (state === 'disposed' || queue.length === 0) {
    if (state === 'processing') {
      logger.info('[SD-PIPELINE] Queue drained', {
        processed: totalProcessed,
        skipped: totalSkipped,
        cacheSize: getStreamdownCacheSize(),
      });
    }
    state = 'idle';
    return;
  }

  // requestIdleCallback is unavailable in test environments (jsdom).
  if (typeof requestIdleCallback === 'undefined') return;

  state = 'processing';
  idleCallbackId = requestIdleCallback(processNext, { timeout: 2000 });
}

function processNext(): void {
  if (state === 'disposed') return;

  const job = queue.shift();
  if (job === undefined) {
    state = 'idle';
    return;
  }

  // Skip if already cached (may have been cached by a live render or warm path).
  const viewportWidth = getChatContentWidth();
  if (hasStreamdownCache(job.contentHash, viewportWidth)) {
    totalSkipped++;
    // Schedule next immediately — no async work needed.
    scheduleNext();
    return;
  }

  // Render this message, THEN schedule the next one after it completes.
  void renderAndCache(job, viewportWidth).then(scheduleNext);
}

async function renderAndCache(job: RenderJob, viewportWidth: number): Promise<void> {
  const start = performance.now();
  ensureHiddenContainer();

  if (renderWrapper === null || persistentRoot === null) {
    logger.warn('[SD-PIPELINE] Render wrapper or root missing');
    return;
  }

  try {
    // Re-render the persistent root with new content.
    persistentRoot.render(
      createElement(Streamdown, {
        remarkPlugins: REMARK_PLUGINS,
        rehypePlugins: REHYPE_PLUGINS_STATIC,
        plugins: STREAMDOWN_PLUGINS,
        components: STREAMDOWN_COMPONENTS,
        linkSafety: LINK_SAFETY_DISABLED,
        mode: 'static',
        children: job.text,
      })
    );

    // Wait for React to flush the synchronous render.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });

    // Wait for Shiki async highlighting to settle.
    await waitForShikiSettle(renderWrapper);

    // Capture the final HTML and height.
    const html = renderWrapper.innerHTML;
    const height = renderWrapper.getBoundingClientRect().height;

    if (html.length > 0 && height > 0) {
      const entry: StreamdownCacheEntry = {
        html,
        height,
        viewportWidth,
        cachedAt: Date.now(),
      };
      setStreamdownCache(job.contentHash, entry);
      totalProcessed++;

      const elapsed = performance.now() - start;
      logger.debug('[SD-PIPELINE] Rendered', {
        messageId: job.messageId.slice(-6),
        height: Math.round(height),
        htmlLen: html.length,
        ms: Math.round(elapsed),
        remaining: queue.length,
      });
    } else {
      logger.warn('[SD-PIPELINE] Empty render result', {
        messageId: job.messageId.slice(-6),
        htmlLen: html.length,
        height,
      });
    }

    // Clear the wrapper for the next render — avoid stale content.
    persistentRoot.render(null);
  } catch (error: unknown) {
    logger.warn('[SD-PIPELINE] Render failed', {
      messageId: job.messageId.slice(-6),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function waitForShikiSettle(element: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let settleTimer: ReturnType<typeof setTimeout>;

    const done = (): void => {
      observer.disconnect();
      clearTimeout(settleTimer);
      clearTimeout(safetyTimer);
      resolve();
    };

    const observer = new MutationObserver(() => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(done, SHIKI_SETTLE_MS);
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // If no mutations fire at all (content has no code blocks), resolve quickly.
    settleTimer = setTimeout(done, SHIKI_SETTLE_MS);

    // Safety timeout — don't wait forever if Shiki is stuck.
    const safetyTimer = setTimeout(() => {
      logger.debug('[SD-PIPELINE] Shiki settle timeout');
      done();
    }, SHIKI_TIMEOUT_MS);
  });
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Queue a completed message's content for background rendering.
 * Skips if already cached for the current viewport width.
 */
export function queueMessageRender(messageId: string, text: string): void {
  if (state === 'disposed') return;
  if (text.trim().length === 0) return;

  const contentHash = hashContent(text);
  const viewportWidth = getChatContentWidth();

  if (hasStreamdownCache(contentHash, viewportWidth)) {
    return;
  }

  // Avoid duplicate jobs in the queue.
  const exists = queue.some(
    (job) => job.messageId === messageId && job.contentHash === contentHash
  );
  if (exists) return;

  queue.push({ messageId, text, contentHash });

  // If idle, kick off processing.
  if (state === 'idle') {
    scheduleNext();
  }
}

/**
 * Queue all completed assistant messages from a session for rendering.
 * Called after session hydration to pre-warm the cache.
 */
export function queueSessionMessages(
  messages: readonly {
    id: string;
    role: string;
    content: string;
    isStreaming?: boolean | undefined;
  }[]
): void {
  if (state === 'disposed') return;

  let queued = 0;
  let skipped = 0;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    if (message.isStreaming === true) continue;
    if (message.content.trim().length === 0) continue;

    const contentHash = hashContent(message.content);
    const viewportWidth = getChatContentWidth();

    if (hasStreamdownCache(contentHash, viewportWidth)) {
      skipped++;
      continue;
    }

    const exists = queue.some(
      (job) => job.messageId === message.id && job.contentHash === contentHash
    );
    if (!exists) {
      queue.push({ messageId: message.id, text: message.content, contentHash });
      queued++;
    }
  }

  logger.info('[SD-PIPELINE] Session queued', {
    queued,
    skipped,
    totalMessages: messages.length,
    queueLen: queue.length,
    cacheSize: getStreamdownCacheSize(),
  });

  // Kick off processing if idle.
  if (state === 'idle' && queue.length > 0) {
    scheduleNext();
  }
}

/**
 * Update the hidden container width and invalidate entries if needed.
 * Called on viewport resize.
 */
export function onViewportWidthChange(): void {
  updateContainerWidth();
}

/**
 * Stop all pending work and clean up the hidden container.
 */
export function disposeRenderService(): void {
  state = 'disposed';
  if (typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(idleCallbackId);
  }
  queue.length = 0;
  destroyHiddenContainer();
}

/**
 * Reset service state for tests.
 */
export function resetRenderServiceForTests(): void {
  disposeRenderService();
  state = 'idle';
  totalProcessed = 0;
  totalSkipped = 0;
}
