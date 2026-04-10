import type { ChatMessage } from '@/components/chat/messages/types';

import { estimateMessageHeight, isNearBottom, scrollToBottom } from '@/lib/chat/chat-scroll-utils';

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'message content',
    displayedContent: overrides.displayedContent ?? overrides.content ?? 'message content',
    attachedImages: overrides.attachedImages,
    thinking: overrides.thinking,
    thinkingBlocks: overrides.thinkingBlocks,
    ...overrides,
  };
}

describe('chat-scroll-utils', () => {
  it('detects when a scroller is near the bottom', () => {
    expect(isNearBottom({ scrollHeight: 1200, scrollTop: 392, clientHeight: 800 }, 8)).toBe(true);
    expect(isNearBottom({ scrollHeight: 1200, scrollTop: 320, clientHeight: 800 }, 8)).toBe(false);
  });

  it('scrolls to the bottom using the current scroll height', () => {
    const scrollTo = vi.fn();

    scrollToBottom(
      {
        scrollHeight: 1440,
        scrollTo,
      },
      'smooth'
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: 1440,
      behavior: 'smooth',
    });
  });

  it('estimates taller heights for richer assistant content', () => {
    const plainAssistant = buildMessage({
      role: 'assistant',
      content: 'Short reply',
      displayedContent: 'Short reply',
    });
    const richAssistant = buildMessage({
      role: 'assistant',
      content: 'Intro\n```ts\nconst answer = 42;\nconsole.log(answer);\n```\nOutro',
      displayedContent: 'Intro\n```ts\nconst answer = 42;\nconsole.log(answer);\n```\nOutro',
      thinking: 'reasoning',
      attachedImages: [
        {
          name: 'diagram.png',
          mimeType: 'image/png',
          previewUrl: 'preview://diagram',
        },
      ],
    });

    expect(estimateMessageHeight(richAssistant)).toBeGreaterThan(
      estimateMessageHeight(plainAssistant)
    );
  });
});
