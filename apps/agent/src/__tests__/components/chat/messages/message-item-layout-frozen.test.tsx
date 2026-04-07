import { render } from '@testing-library/react';

import type { ChatMessage, MessageItemProps } from '@/components/chat/messages/types';
import type { ReactNode } from 'react';

const { mockUseObservedSessionLayoutMutation } = vi.hoisted(() => ({
  mockUseObservedSessionLayoutMutation: vi.fn(() => ({ current: null })),
}));

vi.mock('@streamdown/code', () => ({
  code: {},
}));

vi.mock('@streamdown/mermaid', () => ({
  mermaid: {},
}));

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/chat/messages/ToolWidgetRenderer', () => ({
  ToolWidgetRenderer: () => null,
}));

vi.mock('@/components/chat/messages/message-actions', () => ({
  MessageActions: () => null,
}));

vi.mock('@/components/chat/messages/feedback-dialog', () => ({
  FeedbackDialog: () => null,
}));

vi.mock(
  '@/components/chat/tools/shared',
  async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const original = await importOriginal();
    return {
      ...original,
      useObservedSessionLayoutMutation: mockUseObservedSessionLayoutMutation,
    };
  }
);

import { MessageItem } from '@/components/chat/messages/MessageItem';
import {
  ToolWidgetLayoutFrozenContext,
  ToolWidgetSessionContext,
} from '@/components/chat/tools/shared';

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello from assistant',
    displayedContent: 'Hello from assistant',
    ...overrides,
  };
}

function renderMessageItem(
  overrides: Partial<MessageItemProps> = {},
  isLayoutFrozen = false
): ReturnType<typeof render> {
  const props: MessageItemProps = {
    message: makeAssistantMessage(),
    tools: [],
    isLastAssistantMessage: true,
    isLastInAssistantGroup: true,
    isLastMessage: true,
    isAgentRunning: false,
    onRewind: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenUrl: vi.fn(),
    onFeedback: vi.fn(),
    ...overrides,
  };

  return render(
    <ToolWidgetSessionContext.Provider value="session-a">
      <ToolWidgetLayoutFrozenContext.Provider value={isLayoutFrozen}>
        <MessageItem {...props} />
      </ToolWidgetLayoutFrozenContext.Provider>
    </ToolWidgetSessionContext.Provider>
  );
}

describe('MessageItem layout-frozen context gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes active=true to useObservedSessionLayoutMutation when layout is NOT frozen', () => {
    renderMessageItem({}, false);

    expect(mockUseObservedSessionLayoutMutation).toHaveBeenCalled();
    const calls = mockUseObservedSessionLayoutMutation.mock.calls;
    const lastCall = calls[calls.length - 1];
    // 4th argument is the `active` parameter: hasMarkdownSegments && !isLayoutFrozen
    expect(lastCall[3]).toBe(true);
  });

  it('passes active=false to useObservedSessionLayoutMutation when layout IS frozen (verification)', () => {
    renderMessageItem({}, true);

    expect(mockUseObservedSessionLayoutMutation).toHaveBeenCalled();
    const calls = mockUseObservedSessionLayoutMutation.mock.calls;
    const lastCall = calls[calls.length - 1];
    // During verification, isLayoutFrozen=true → active = hasMarkdownSegments && !true = false
    expect(lastCall[3]).toBe(false);
  });

  it('passes active=false for user messages regardless of layout-frozen state', () => {
    const userMessage = makeAssistantMessage({
      id: 'user-1',
      role: 'user',
      content: 'A user question',
      displayedContent: 'A user question',
    });

    renderMessageItem({ message: userMessage }, false);

    expect(mockUseObservedSessionLayoutMutation).toHaveBeenCalled();
    const calls = mockUseObservedSessionLayoutMutation.mock.calls;
    const lastCall = calls[calls.length - 1];
    // User messages have no markdown segments → hasMarkdownSegments=false → active=false
    expect(lastCall[3]).toBe(false);
  });
});
