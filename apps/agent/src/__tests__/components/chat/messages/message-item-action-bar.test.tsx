import { render, screen } from '@testing-library/react';

import type { ChatMessage, MessageItemProps } from '@/components/chat/messages/types';
import type { ReactNode } from 'react';

const { mockMessageActions } = vi.hoisted(() => ({
  mockMessageActions: vi.fn(() => <div data-testid="message-actions" />),
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
  MessageActions: mockMessageActions,
}));

vi.mock('@/components/chat/messages/feedback-dialog', () => ({
  FeedbackDialog: () => null,
}));

import { MessageItem } from '@/components/chat/messages/MessageItem';

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello from assistant',
    displayedContent: 'Hello from assistant',
    isStreaming: false,
    ...overrides,
  };
}

function makeUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: '/strategy-competitors',
    displayedContent: '/strategy-competitors',
    isStreaming: false,
    ...overrides,
  };
}

function renderMessageItem(overrides: Partial<MessageItemProps> = {}): ReturnType<typeof render> {
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

  return render(<MessageItem {...props} />);
}

describe('MessageItem action bar visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides actions for the active last message while agent is running', () => {
    renderMessageItem({
      isAgentRunning: true,
      isLastMessage: true,
    });

    expect(screen.queryByTestId('message-actions')).not.toBeInTheDocument();
  });

  it('keeps actions visible for previous assistant turns while agent is running', () => {
    renderMessageItem({
      isAgentRunning: true,
      isLastMessage: false,
    });

    expect(screen.getByTestId('message-actions')).toBeInTheDocument();
  });

  it('shows actions after final completion on the last message', () => {
    renderMessageItem({
      isAgentRunning: false,
      isLastMessage: true,
    });

    expect(screen.getByTestId('message-actions')).toBeInTheDocument();
  });

  it('renders slash commands in user bubbles as plain blue text, not inline code badges', () => {
    const { container } = renderMessageItem({
      message: makeUserMessage(),
    });

    expect(screen.getByText('/strategy-competitors')).toHaveClass('text-git-untracked');
    expect(container.querySelector('code')).toBeNull();
  });

  it('uses gap and padding layout wrappers for assistant segments instead of margin stacks', () => {
    const { container } = renderMessageItem();

    const root = container.firstElementChild as HTMLElement | null;
    const markdown = screen.getByText('Hello from assistant').closest('.chat-markdown');
    const segmentStack = markdown?.parentElement;
    const assistantContainer = segmentStack?.parentElement;

    expect(root).not.toBeNull();
    expect(markdown).not.toBeNull();
    expect(segmentStack).not.toBeNull();
    expect(assistantContainer).not.toBeNull();

    expect(root?.className).toContain('flex');
    expect(root?.className).toContain('flex-col');
    expect(root?.className).toContain('gap-2');
    expect(root?.className).not.toContain('space-y-2');

    expect(segmentStack?.className).toContain('flex');
    expect(segmentStack?.className).toContain('flex-col');
    expect(segmentStack?.className).toContain('gap-2');
    expect(segmentStack?.className).not.toContain('space-y-2');

    expect(assistantContainer?.className).toContain('py-1');
    expect(assistantContainer?.className).not.toContain('my-1');
  });
});
