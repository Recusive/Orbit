import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, ThinkingBlock } from '@/components/chat/messages';

const STREAMING_CADENCE_MS = 33;
const DRAIN_CADENCE_MS = 10;
const TICK_MS = 16;

interface RevealEntry {
  contentLength: number;
  thinkingLengths: number[];
  lastRevealAt: number;
}

function findNextWordEnd(text: string, fromIndex: number): number {
  let index = fromIndex;

  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1;
  }

  while (index < text.length && !/\s/.test(text[index] ?? '')) {
    index += 1;
  }

  return index;
}

function getThinkingBlocks(message: ChatMessage): ThinkingBlock[] {
  if (message.thinkingBlocks !== undefined) {
    return message.thinkingBlocks;
  }

  if (message.thinking !== undefined) {
    return [{ content: message.thinking, durationMs: message.thinkingDurationMs ?? 0 }];
  }

  return [];
}

function reuseThinkingBlocks(
  previous: ThinkingBlock[] | undefined,
  next: ThinkingBlock[]
): ThinkingBlock[] {
  if (previous?.length !== next.length) {
    return next;
  }
  // Check if any block differs; if all match, return the previous array reference
  const allMatch = next.every((block, index) => {
    const prev = previous[index];
    return prev?.content === block.content && prev.durationMs === block.durationMs;
  });
  return allMatch ? previous : next;
}

function needsReveal(message: ChatMessage, entry: RevealEntry | undefined): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  if (message.isStreaming === true) {
    return true;
  }

  if (entry === undefined) {
    return false;
  }

  if (entry.contentLength < message.content.length) {
    return true;
  }

  const blocks = getThinkingBlocks(message);
  return blocks.some((block, index) => (entry.thinkingLengths[index] ?? 0) < block.content.length);
}

function createEntry(message: ChatMessage): RevealEntry {
  const thinkingBlocks = getThinkingBlocks(message);
  const shouldAnimate = message.role === 'assistant' && message.isStreaming === true;

  return {
    contentLength: shouldAnimate ? 0 : message.content.length,
    thinkingLengths: thinkingBlocks.map((block) => (shouldAnimate ? 0 : block.content.length)),
    lastRevealAt: 0,
  };
}

export function useOcStreamingReveal(messages: ChatMessage[]): ChatMessage[] {
  const [version, setVersion] = useState(0);
  const entriesRef = useRef<Record<string, RevealEntry>>(
    Object.fromEntries(
      messages
        .filter((message) => message.role === 'assistant')
        .map((message) => [message.id, createEntry(message)])
    )
  );
  const messagesRef = useRef(messages);
  const timerRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const prevThinkingRef = useRef(new Map<string, ThinkingBlock[]>());

  messagesRef.current = messages;

  useEffect(() => {
    let didChange = false;
    const nextEntries = { ...entriesRef.current };
    const validIds = new Set(messages.map((message) => message.id));

    for (const key of Object.keys(nextEntries)) {
      if (!validIds.has(key)) {
        didChange = true;
        Reflect.deleteProperty(nextEntries, key);
      }
    }

    // Evict stale ThinkingBlock cache entries for removed messages
    for (const key of prevThinkingRef.current.keys()) {
      if (!validIds.has(key)) {
        prevThinkingRef.current.delete(key);
      }
    }

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }

      const existing = nextEntries[message.id];
      if (existing === undefined) {
        nextEntries[message.id] = createEntry(message);
        didChange = true;
        continue;
      }

      if (existing.contentLength > message.content.length) {
        existing.contentLength = message.content.length;
        didChange = true;
      }

      const thinkingBlocks = getThinkingBlocks(message);
      const nextThinkingLengths = thinkingBlocks.map((block, index) =>
        Math.min(
          existing.thinkingLengths[index] ??
            (message.isStreaming === true ? 0 : block.content.length),
          block.content.length
        )
      );

      if (
        nextThinkingLengths.length !== existing.thinkingLengths.length ||
        nextThinkingLengths.some((length, index) => length !== existing.thinkingLengths[index])
      ) {
        existing.thinkingLengths = nextThinkingLengths;
        didChange = true;
      }

      if (!needsReveal(message, existing) && message.isStreaming !== true) {
        const fullContent = message.content.length;
        const fullThinking = thinkingBlocks.map((block) => block.content.length);
        if (
          existing.contentLength !== fullContent ||
          fullThinking.some((length, index) => length !== existing.thinkingLengths[index])
        ) {
          existing.contentLength = fullContent;
          existing.thinkingLengths = fullThinking;
          didChange = true;
        }
      }
    }

    if (didChange) {
      entriesRef.current = nextEntries;
      setVersion((current) => current + 1);
    }
  }, [messages]);

  useEffect(() => {
    const tick = (): void => {
      timerRef.current = null;

      const now = Date.now();
      let didChange = false;
      let shouldContinue = false;

      for (const message of messagesRef.current) {
        if (message.role !== 'assistant') {
          continue;
        }

        const entry = entriesRef.current[message.id];
        if (entry === undefined) {
          continue;
        }

        const cadence = message.isStreaming === true ? STREAMING_CADENCE_MS : DRAIN_CADENCE_MS;
        const blocks = getThinkingBlocks(message);
        const revealPending = needsReveal(message, entry);

        if (revealPending) {
          shouldContinue = true;
        }

        if (!revealPending || now - entry.lastRevealAt < cadence) {
          continue;
        }

        let advanced = false;

        if (entry.contentLength < message.content.length) {
          entry.contentLength = Math.min(
            findNextWordEnd(message.content, entry.contentLength),
            message.content.length
          );
          advanced = true;
        }

        for (const [index, block] of blocks.entries()) {
          const currentLength = entry.thinkingLengths[index] ?? 0;
          if (currentLength < block.content.length) {
            entry.thinkingLengths[index] = Math.min(
              findNextWordEnd(block.content, currentLength),
              block.content.length
            );
            advanced = true;
          }
        }

        if (advanced) {
          entry.lastRevealAt = now;
          didChange = true;
        }
      }

      if (didChange) {
        const flushNow = Date.now();
        const isAnyStreaming = messagesRef.current.some((m) => m.isStreaming === true);
        // During streaming: batch ~2-3 word advances into 1 React render (~80ms intervals)
        // During drain: flush immediately (isAnyStreaming is false → no gating)
        if (!isAnyStreaming || flushNow - lastFlushRef.current >= 80) {
          setVersion((current) => current + 1);
          lastFlushRef.current = flushNow;
        }
      }

      if (shouldContinue) {
        timerRef.current = window.setTimeout(tick, TICK_MS);
      }
    };

    const hasPendingReveal = messages.some((message) =>
      needsReveal(message, entriesRef.current[message.id])
    );
    if (hasPendingReveal && timerRef.current === null) {
      timerRef.current = window.setTimeout(tick, TICK_MS);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [messages]);

  void version;

  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    const entry = entriesRef.current[message.id] ?? createEntry(message);

    const thinkingBlocks = getThinkingBlocks(message);
    const rawRevealedBlocks = thinkingBlocks.map((block, index) => ({
      ...block,
      content: block.content.slice(0, entry.thinkingLengths[index] ?? block.content.length),
    }));
    const revealedBlocks = reuseThinkingBlocks(
      prevThinkingRef.current.get(message.id),
      rawRevealedBlocks
    );
    prevThinkingRef.current.set(message.id, revealedBlocks);
    const revealedThinking =
      message.thinking !== undefined || revealedBlocks.length > 0
        ? revealedBlocks.map((block) => block.content).join('\n\n')
        : message.thinking;
    const contentLength = Math.min(entry.contentLength, message.content.length);
    const displayedContent = message.content.slice(0, contentLength);
    const thinkingLag = revealedBlocks.some(
      (block, index) => block.content.length < (thinkingBlocks[index]?.content.length ?? 0)
    );
    const contentLag = displayedContent.length < message.content.length;
    const isStreaming = message.isStreaming === true || contentLag || thinkingLag;

    return {
      ...message,
      displayedContent,
      ...(revealedThinking !== undefined ? { thinking: revealedThinking } : {}),
      ...(revealedBlocks.length > 0 ? { thinkingBlocks: revealedBlocks } : {}),
      ...(thinkingLag || message.isThinkingActive === true ? { isThinkingActive: true } : {}),
      ...(isStreaming ? { isStreaming: true } : {}),
    } satisfies ChatMessage;
  });
}
