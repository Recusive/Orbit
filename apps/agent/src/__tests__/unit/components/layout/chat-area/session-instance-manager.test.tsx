import { act, render } from '@testing-library/react';

import { SessionInstanceManager } from '@/components/layout/chat-area/SessionInstanceManager';
import { useChatStore } from '@/stores/chat/chat-store';

interface MockChatMessagesProps {
  readonly sessionId?: string;
  readonly isVisible?: boolean;
  readonly shouldPrime?: boolean;
  readonly onReady?: () => void;
}

const chatMessagesBySession = new Map<string, MockChatMessagesProps>();

vi.mock('@/components/chat', () => ({
  ChatMessages: (props: MockChatMessagesProps) => {
    if (props.sessionId) {
      chatMessagesBySession.set(props.sessionId, props);
    }

    return (
      <div
        data-testid={`mock-chat-messages-${props.sessionId ?? 'unknown'}`}
        data-visible={String(props.isVisible ?? false)}
        data-prime={String(props.shouldPrime ?? false)}
      />
    );
  },
}));

function resetStores(): void {
  useChatStore.setState(useChatStore.getInitialState(), true);
  chatMessagesBySession.clear();
}

function getSessionNode(container: HTMLElement, sessionId: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-session-instance="${sessionId}"]`);
  expect(node).not.toBeNull();
  if (!node) {
    throw new Error(`Missing session node for ${sessionId}`);
  }
  return node;
}

describe('SessionInstanceManager handoff', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('keeps the previous session visible until the next session stabilizes', () => {
    useChatStore.setState({ activeSessionId: 'session-a' });

    const { container, rerender } = render(
      <SessionInstanceManager
        activeSessionId="session-a"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    act(() => {
      chatMessagesBySession.get('session-a')?.onReady?.();
    });

    expect(getSessionNode(container, 'session-a')).toHaveAttribute('data-instance-visible', 'true');

    rerender(
      <SessionInstanceManager
        activeSessionId="session-b"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(getSessionNode(container, 'session-a')).toHaveAttribute('data-instance-visible', 'true');
    expect(getSessionNode(container, 'session-b')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-b')).toHaveAttribute('data-instance-prime', 'true');

    useChatStore.setState({ activeSessionId: 'session-b' });
    act(() => {
      chatMessagesBySession.get('session-b')?.onReady?.();
    });

    expect(getSessionNode(container, 'session-a')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-b')).toHaveAttribute('data-instance-visible', 'true');
  });

  it('switches back to an already stabilized session immediately on revisit', () => {
    useChatStore.setState({ activeSessionId: 'session-a' });

    const { container, rerender } = render(
      <SessionInstanceManager
        activeSessionId="session-a"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    act(() => {
      chatMessagesBySession.get('session-a')?.onReady?.();
    });

    useChatStore.setState({ activeSessionId: 'session-b' });
    rerender(
      <SessionInstanceManager
        activeSessionId="session-b"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    act(() => {
      chatMessagesBySession.get('session-b')?.onReady?.();
    });

    useChatStore.setState({ activeSessionId: 'session-a' });
    rerender(
      <SessionInstanceManager
        activeSessionId="session-a"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(getSessionNode(container, 'session-a')).toHaveAttribute('data-instance-visible', 'true');
    expect(getSessionNode(container, 'session-b')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
  });

  it('keeps the last shown session visible across rapid A to B to C to D switching', () => {
    useChatStore.setState({ activeSessionId: 'session-a' });

    const { container, rerender } = render(
      <SessionInstanceManager
        activeSessionId="session-a"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    act(() => {
      chatMessagesBySession.get('session-a')?.onReady?.();
    });

    useChatStore.setState({ activeSessionId: 'session-b' });
    rerender(
      <SessionInstanceManager
        activeSessionId="session-b"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    useChatStore.setState({ activeSessionId: 'session-c' });
    rerender(
      <SessionInstanceManager
        activeSessionId="session-c"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    useChatStore.setState({ activeSessionId: 'session-d' });
    rerender(
      <SessionInstanceManager
        activeSessionId="session-d"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(getSessionNode(container, 'session-a')).toHaveAttribute('data-instance-visible', 'true');
    expect(getSessionNode(container, 'session-b')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-c')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-d')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-d')).toHaveAttribute('data-instance-prime', 'true');

    act(() => {
      chatMessagesBySession.get('session-d')?.onReady?.();
    });

    expect(getSessionNode(container, 'session-a')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-d')).toHaveAttribute('data-instance-visible', 'true');
  });
});
