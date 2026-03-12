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

describe('useOcStreamingReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals OpenCode assistant text progressively instead of snapping a full chunk', () => {
    const message = makeAssistantMessage({ content: 'Hello world from Orbit' });
    const { result } = renderHook(({ messages }) => useOcStreamingReveal(messages), {
      initialProps: { messages: [message] },
    });

    expect(result.current[0]?.displayedContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(result.current[0]?.displayedContent).toBe('Hello');

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(result.current[0]?.displayedContent).toBe('Hello world');
  });

  it('keeps streaming true while draining the final OpenCode chunk', () => {
    const { result, rerender } = renderHook(({ messages }) => useOcStreamingReveal(messages), {
      initialProps: {
        messages: [makeAssistantMessage({ content: 'Hello world' })],
      },
    });

    act(() => {
      vi.advanceTimersByTime(40);
    });

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

    act(() => {
      vi.advanceTimersByTime(200);
    });

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

    expect(result.current[0]?.thinkingBlocks?.[0]?.content).toBe('');

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(result.current[0]?.thinkingBlocks?.[0]?.content).toBe('First');
  });
});
