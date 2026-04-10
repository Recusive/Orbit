import { act, render, waitFor } from '@testing-library/react';

import { SessionInstanceManager } from '@/components/layout/chat-area/SessionInstanceManager';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';

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
    useChatStore.setState({
      sessions: {},
      activeSessionId: null,
    });
    useSessionSwitchStore.setState({
      status: 'idle',
      requestId: 0,
      pending: null,
      readyInstances: {},
      preMountSessionId: null,
    });
  });

  afterEach(() => {
    chatMessagesBySession.clear();
    useSessionSwitchStore.getState().clearPreMount();
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

  it('mounts a hydrated pre-mount session hidden without starting verification', () => {
    useChatStore.setState({
      sessions: {
        'session-hover': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          layoutPendingCount: 0,
          layoutSettledVersion: 0,
          lastLayoutMutationAt: null,
          layoutLeakDeadlineAt: null,
          measurementCache: null,
        },
      },
    });
    useSessionSwitchStore.getState().requestPreMount('session-hover');

    const { container } = render(
      <SessionInstanceManager
        shownSessionId={undefined}
        pendingSessionId={undefined}
        pendingPhase="idle"
        pendingRequestId={0}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(getSessionNode(container, 'session-hover')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
    expect(getSessionNode(container, 'session-hover')).toHaveAttribute(
      'data-instance-prime',
      'false'
    );
  });

  it('removes abandoned pre-mount sessions when hover moves to another conversation', async () => {
    useChatStore.setState({
      sessions: {
        'session-hover-a': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          layoutPendingCount: 0,
          layoutSettledVersion: 0,
          lastLayoutMutationAt: null,
          layoutLeakDeadlineAt: null,
          measurementCache: null,
        },
        'session-hover-b': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          layoutPendingCount: 0,
          layoutSettledVersion: 0,
          lastLayoutMutationAt: null,
          layoutLeakDeadlineAt: null,
          measurementCache: null,
        },
      },
    });
    useSessionSwitchStore.getState().requestPreMount('session-hover-a');

    const { container } = render(
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
      />
    );

    expect(getSessionNode(container, 'session-hover-a')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );

    act(() => {
      useSessionSwitchStore.getState().clearPreMount('session-hover-a');
      useSessionSwitchStore.getState().requestPreMount('session-hover-b');
    });

    await waitFor(() => {
      expect(container.querySelector('[data-session-instance="session-hover-a"]')).toBeNull();
    });
    expect(getSessionNode(container, 'session-hover-b')).toHaveAttribute(
      'data-instance-visible',
      'false'
    );
  });
});
