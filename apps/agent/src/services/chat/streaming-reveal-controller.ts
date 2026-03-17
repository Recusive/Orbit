/**
 * Streaming Reveal Controller — Word-by-word text drip for streaming messages.
 *
 * Instead of rendering all content and hiding/revealing with CSS opacity,
 * this controller advances `displayedContent` one word at a time via a
 * RAF loop. Streamdown only sees and renders the visible prefix.
 *
 * Lifecycle:
 *   startOrContinue() — called when a new text chunk arrives
 *   beginDrain()      — called on agent:complete (accelerated cadence + callback)
 *   stopAll()         — called on rewind/destroy/error (snaps to full content)
 */
import { useChatStore } from '@/stores/chat/chat-store';

/** Normal streaming cadence — ~30 words/sec. */
const STREAMING_CADENCE_MS = 33;

/** Accelerated drain when streaming ends — ~100 words/sec. */
const DRAIN_CADENCE_MS = 10;

// ── Word boundary detection ──────────────────────────────────────────

/**
 * Find the end of the next word (including trailing whitespace).
 * Advances past whitespace, then past non-whitespace characters.
 */
function findNextWordEnd(text: string, fromIndex: number): number {
  let i = fromIndex;
  const len = text.length;

  // Skip leading whitespace
  while (i < len && /\s/.test(text[i] ?? '')) i++;
  // Skip word characters
  while (i < len && !/\s/.test(text[i] ?? '')) i++;

  return i;
}

// ── Controller ───────────────────────────────────────────────────────

interface RevealState {
  sessionId: string;
  messageId: string;
  rafId: number;
  mode: 'streaming' | 'draining';
  lastRevealAt: number;
  /** Called when drain finishes (displayedContent caught up to content). */
  onDrainComplete?: (() => void) | undefined;
}

export class StreamingRevealController {
  /** Active reveals keyed by `${sessionId}\0${messageId}` */
  private reveals = new Map<string, RevealState>();

  private key(sessionId: string, messageId: string): string {
    return `${sessionId}\0${messageId}`;
  }

  /** Start or continue a reveal loop for a streaming message. */
  startOrContinue(sessionId: string, messageId: string): void {
    const k = this.key(sessionId, messageId);
    if (this.reveals.has(k)) return;

    const state: RevealState = {
      sessionId,
      messageId,
      rafId: 0,
      mode: 'streaming',
      lastRevealAt: 0,
    };
    this.reveals.set(k, state);
    this.scheduleNext(k, state);
  }

  /**
   * Switch to accelerated drain mode (called on agent:complete).
   * When all remaining words have been revealed, `onComplete` fires —
   * the caller uses this to set `isStreaming: false`.
   */
  beginDrain(sessionId: string, messageId: string, onComplete?: () => void): void {
    const k = this.key(sessionId, messageId);
    const state = this.reveals.get(k);
    if (state !== undefined) {
      state.mode = 'draining';
      state.onDrainComplete = onComplete;
    } else if (onComplete !== undefined) {
      // No active loop (already caught up) — fire immediately
      onComplete();
    }
  }

  /** Stop all reveal loops for a session (called on rewind/destroy/error). */
  stopAll(sessionId: string): void {
    const keysToDelete: string[] = [];
    for (const [k, state] of this.reveals) {
      if (state.sessionId === sessionId) {
        cancelAnimationFrame(state.rafId);
        keysToDelete.push(k);
        // Snap displayedContent = content
        this.snapToFull(state.sessionId, state.messageId);
        // Fire drain callback if pending (error/cancel during drain)
        state.onDrainComplete?.();
      }
    }
    for (const k of keysToDelete) {
      this.reveals.delete(k);
    }
  }

  /** Stop all active reveals (HMR cleanup). */
  destroyAll(): void {
    for (const [, state] of this.reveals) {
      cancelAnimationFrame(state.rafId);
    }
    this.reveals.clear();
  }

  private scheduleNext(key: string, state: RevealState): void {
    state.rafId = requestAnimationFrame(() => {
      this.tick(key);
    });
  }

  private tick(key: string): void {
    const state = this.reveals.get(key);
    if (state === undefined) return;

    const store = useChatStore.getState();
    const session = store.sessions[state.sessionId];
    if (session === undefined) {
      this.reveals.delete(key);
      return;
    }

    const msg = session.messages.find((m) => m.id === state.messageId);
    if (msg === undefined) {
      this.reveals.delete(key);
      return;
    }

    const currentLen = msg.displayedContent.length;
    const targetLen = msg.content.length;

    if (currentLen >= targetLen) {
      if (state.mode === 'draining') {
        // Fully caught up and streaming is over — fire callback and stop
        state.onDrainComplete?.();
        this.reveals.delete(key);
        return;
      }
      // Streaming: keep looping — more content may arrive
      this.scheduleNext(key, state);
      return;
    }

    const cadence = state.mode === 'draining' ? DRAIN_CADENCE_MS : STREAMING_CADENCE_MS;
    const now = performance.now();
    const elapsed = now - state.lastRevealAt;

    if (elapsed >= cadence) {
      const nextEnd = findNextWordEnd(msg.content, currentLen);
      if (nextEnd > currentLen) {
        store.updateMessage(state.sessionId, state.messageId, (m) => ({
          ...m,
          displayedContent: m.content.slice(0, nextEnd),
        }));
        state.lastRevealAt = now;
      }
    }

    this.scheduleNext(key, state);
  }

  /** Instantly set displayedContent = content for a message. */
  private snapToFull(sessionId: string, messageId: string): void {
    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    if (session === undefined) return;

    const msg = session.messages.find((m) => m.id === messageId);
    if (msg === undefined || msg.displayedContent === msg.content) return;

    store.updateMessage(sessionId, messageId, (m) => ({
      ...m,
      displayedContent: m.content,
    }));
  }
}
