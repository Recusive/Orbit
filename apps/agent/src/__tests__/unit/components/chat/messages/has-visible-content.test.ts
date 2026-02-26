import type { ChatMessage, Segment } from '@/components/chat/messages/types';

import { hasVisibleContent } from '@/components/chat/messages/message-utils';

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    displayedContent: '',
    ...overrides,
  };
}

describe('hasVisibleContent', () => {
  it('keeps placeholder message visible when interrupted with thinking', () => {
    const message = makeAssistantMessage({
      content: 'No response requested.',
      displayedContent: 'No response requested.',
      isInterrupted: true,
      thinkingBlocks: [{ content: 'Considering options', durationMs: 1300 }],
    });

    expect(hasVisibleContent(message, [], false)).toBe(true);
  });

  it('keeps placeholder message visible when tool segments exist', () => {
    const message = makeAssistantMessage({
      content: 'No response requested.',
      displayedContent: 'No response requested.',
    });
    const segments: Segment[] = [
      {
        type: 'tool',
        key: 'tool-1',
        tool: {
          id: 'tool-1',
          messageId: 'assistant-1',
          toolName: 'AskUserQuestion',
          toolInput: {},
          status: 'error',
          startedAt: 1,
        },
      },
    ];

    expect(hasVisibleContent(message, segments, false)).toBe(true);
  });

  it('hides pure placeholder messages with no other visible content', () => {
    const message = makeAssistantMessage({
      content: 'No response requested.',
      displayedContent: 'No response requested.',
    });

    expect(hasVisibleContent(message, [], true)).toBe(false);
  });
});
