import { act, render } from '@testing-library/react';

import { SessionInstanceManager } from '@/components/layout/chat-area/SessionInstanceManager';

interface MockChatMessagesProps {
  readonly sessionId?: string;
  readonly isVisible?: boolean;
  readonly verificationPhase?: 'hidden' | 'visible' | null;
  readonly onVerificationResult?: (result: {
    phase: 'hidden' | 'visible';
    result: 'hidden-ready' | 'visible-ready' | 'timeout' | 'aborted';
  }) => void;
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
        data-phase={props.verificationPhase ?? 'none'}
      />
    );
  },
}));

function getSessionNode(container: HTMLElement, sessionId: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-session-instance="${sessionId}"]`);
  expect(node).not.toBeNull();
  if (!node) {
    throw new Error(`Missing session node for ${sessionId}`);
  }
  return node;
}

describe('SessionInstanceManager', () => {
  beforeEach(() => {
    chatMessagesBySession.clear();
  });

  afterEach(() => {
    chatMessagesBySession.clear();
  });

  it('keeps the shown session visible while the pending session warms hidden', () => {
    const onPendingVerificationResult = vi.fn();
    const { container, rerender } = render(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId={undefined}
        pendingPhase="idle"
        pendingRequestId={0}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onPendingVerificationResult={onPendingVerificationResult}
      />
    );

    rerender(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-b"
        pendingPhase="hidden-priming"
        pendingRequestId={1}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onPendingVerificationResult={onPendingVerificationResult}
      />
    );

    expect(getSessionNode(container, 'session-a')).toHaveAttribute('data-instance-visible', 'true');
    expect(getSessionNode(container, 'session-b')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-b')).toHaveAttribute('data-instance-prime', 'true');

    act(() => {
      chatMessagesBySession.get('session-b')?.onVerificationResult?.({
        phase: 'hidden',
        result: 'hidden-ready',
      });
    });

    expect(onPendingVerificationResult).toHaveBeenCalledTimes(1);
    expect(onPendingVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-b',
        requestId: 1,
        phase: 'hidden',
        result: 'hidden-ready',
      })
    );
  });

  it('does not surface a stale primed session after the request changes', () => {
    const onPendingVerificationResult = vi.fn();
    const { rerender } = render(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-b"
        pendingPhase="hidden-priming"
        pendingRequestId={1}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onPendingVerificationResult={onPendingVerificationResult}
      />
    );

    rerender(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-d"
        pendingPhase="hidden-priming"
        pendingRequestId={4}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onPendingVerificationResult={onPendingVerificationResult}
      />
    );

    act(() => {
      chatMessagesBySession.get('session-b')?.onVerificationResult?.({
        phase: 'hidden',
        result: 'hidden-ready',
      });
    });

    expect(onPendingVerificationResult).not.toHaveBeenCalled();

    act(() => {
      chatMessagesBySession.get('session-d')?.onVerificationResult?.({
        phase: 'hidden',
        result: 'hidden-ready',
      });
    });

    expect(onPendingVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-d',
        requestId: 4,
        phase: 'hidden',
        result: 'hidden-ready',
      })
    );
  });

  it('keeps the last shown session visible across rapid A to B to C to D switching', () => {
    const { container, rerender } = render(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-b"
        pendingPhase="hidden-priming"
        pendingRequestId={1}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    rerender(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-c"
        pendingPhase="hidden-priming"
        pendingRequestId={2}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    rerender(
      <SessionInstanceManager
        shownSessionId="session-a"
        pendingSessionId="session-d"
        pendingPhase="hidden-priming"
        pendingRequestId={3}
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
  });
});
