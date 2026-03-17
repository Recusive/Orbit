import { act, renderHook } from '@testing-library/react';

import type { ChatMessage } from '@/components/chat/messages';

import { useOcStreamingReveal } from '@/hooks/chat/use-oc-streaming-reveal';

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    displayedContent: '',
    isStreaming: true,
    ...overrides,
  };
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useOcStreamingReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not block content when no thinking blocks exist', () => {
    // Use long content so progressive reveal doesn't catch up within the test window.
    // With STREAMING_CADENCE=33ms and TICK_MS=16ms, each word reveals every ~48ms.
    const words = Array.from({ length: 30 }, (_, i) => `word${String(i)}`);
    const content = words.join(' ');
    const message = makeAssistantMessage({ content });
    const { result } = renderHook(({ messages }) => useOcStreamingReveal(messages), {
      initialProps: { messages: [message] },
    });

    expect(result.current[0]?.displayedContent).toBe('');

    advance(40);

    const first = result.current[0]?.displayedContent ?? '';
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(content.length);

    // During streaming, setVersion is time-gated to ~80ms intervals.
    // Advance past the gating threshold to see more content revealed.
    advance(120);

    const second = result.current[0]?.displayedContent ?? '';
    expect(second.length).toBeGreaterThan(first.length);
    expect(second.length).toBeLessThan(content.length);
  });

  it('keeps streaming true while draining the final OpenCode chunk', () => {
    const { result, rerender } = renderHook(({ messages }) => useOcStreamingReveal(messages), {
      initialProps: {
        messages: [makeAssistantMessage({ content: 'Hello world' })],
      },
    });

    advance(40);

    rerender({
      messages: [
        makeAssistantMessage({
          content: 'Hello world again',
          displayedContent: 'Hello world again',
          isStreaming: false,
        }),
      ],
    });

    expect(result.current[0]?.isStreaming).toBe(true);
    expect(result.current[0]?.displayedContent).toBe('Hello');

    advance(200);

    expect(result.current[0]?.displayedContent).toBe('Hello world again');
    expect(result.current[0]?.isStreaming).toBe(false);
  });

  it('reveals thinking blocks progressively too', () => {
    const { result } = renderHook(() =>
      useOcStreamingReveal([
        makeAssistantMessage({
          thinking: 'First second third',
          thinkingBlocks: [{ content: 'First second third', durationMs: 0 }],
        }),
      ])
    );

    expect(result.current[0]?.thinkingBlocks).toBeUndefined();

    advance(40);

    expect(result.current[0]?.thinkingBlocks?.[0]?.content).toBe('First');
  });

  it('holds content reveal while thinking block is active', () => {
    const message = makeAssistantMessage({
      content: 'Alpha Beta',
      thinkingBlocks: [
        { content: 'First second third', durationMs: 0, contentOffset: 0, ordinal: 0 },
      ],
      isThinkingActive: true,
    });
    const { result, rerender } = renderHook(({ messages }) => useOcStreamingReveal(messages), {
      initialProps: { messages: [message] },
    });

    advance(40);
    advance(40);
    advance(40);

    expect(result.current[0]?.displayedContent).toBe('');
    expect(result.current[0]?.thinkingBlocks?.[0]?.content.length ?? 0).toBeGreaterThan(0);

    rerender({
      messages: [
        makeAssistantMessage({
          ...message,
          isThinkingActive: false,
        }),
      ],
    });

    advance(40);
    advance(40);

    expect(result.current[0]?.displayedContent).not.toBe('');
  });

  it('holds content while thinking drain is incomplete even when isThinkingActive is false', () => {
    const { result } = renderHook(() =>
      useOcStreamingReveal([
        makeAssistantMessage({
          content: 'Hello world',
          thinkingBlocks: [
            {
              content: 'First second third fourth',
              durationMs: 0,
              contentOffset: 0,
              ordinal: 0,
            },
          ],
          isThinkingActive: false,
        }),
      ])
    );

    advance(40);

    expect(result.current[0]?.displayedContent).toBe('');
    expect(result.current[0]?.thinkingBlocks?.[0]?.content).toBe('First');
  });

  it('does not reveal later thinking block before its content boundary is reached', () => {
    const { result } = renderHook(() =>
      useOcStreamingReveal([
        makeAssistantMessage({
          content: 'Alpha Beta',
          thinkingBlocks: [
            { content: 'short', durationMs: 0, contentOffset: 0, ordinal: 0 },
            {
              content: 'phase two much longer than one',
              durationMs: 0,
              contentOffset: 6,
              ordinal: 2,
            },
          ],
          isThinkingActive: false,
        }),
      ])
    );

    advance(40);
    advance(40);

    const displayed = result.current[0]?.displayedContent ?? '';
    expect(displayed.length).toBeLessThan(6);

    const blocks = result.current[0]?.thinkingBlocks ?? [];
    const laterBlock = blocks.find((block) => block.contentOffset === 6);
    expect(laterBlock).toBeUndefined();
  });

  it('reveals later thinking block after content reaches its boundary', () => {
    const { result } = renderHook(() =>
      useOcStreamingReveal([
        makeAssistantMessage({
          content: 'Alpha Beta',
          thinkingBlocks: [
            { content: 'short', durationMs: 0, contentOffset: 0, ordinal: 0 },
            { content: 'phase two text', durationMs: 0, contentOffset: 6, ordinal: 2 },
          ],
          isThinkingActive: false,
        }),
      ])
    );

    advance(40);
    advance(40);
    advance(40);
    advance(40);
    advance(40);

    const displayed = result.current[0]?.displayedContent ?? '';
    expect(displayed.length).toBeGreaterThanOrEqual(6);

    const blocks = result.current[0]?.thinkingBlocks ?? [];
    const laterBlock = blocks.find((block) => block.contentOffset === 6);
    expect(laterBlock).toBeDefined();
    expect(laterBlock?.content.length).toBeGreaterThan(0);
  });

  it('legacy blocks without contentOffset fall back to gate-all', () => {
    const { result } = renderHook(() =>
      useOcStreamingReveal([
        makeAssistantMessage({
          content: 'After legacy',
          thinkingBlocks: [{ content: 'alpha beta gamma', durationMs: 0 }],
          isThinkingActive: false,
        }),
      ])
    );

    advance(40);
    advance(40);

    expect(result.current[0]?.displayedContent).toBe('');
    expect(result.current[0]?.thinkingBlocks?.[0]?.content).toBe('alpha');

    advance(40);
    advance(40);
    advance(40);

    expect(result.current[0]?.displayedContent).not.toBe('');
  });
});
