import { render, screen } from '@testing-library/react';

import { ChatContent } from '@/components/layout/chat-area/ChatContent';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface MockSessionInstanceManagerProps {
  readonly shownSessionId: string | undefined;
  readonly pendingSessionId: string | undefined;
  readonly pendingPhase: string;
  readonly pendingRequestId: number;
  readonly isShownHidden?: boolean;
}

interface MockTodoBarProps {
  readonly overrideSessionId?: string;
}

const managerControls: {
  props: MockSessionInstanceManagerProps | null;
} = {
  props: null,
};

const todoBarControls: {
  props: MockTodoBarProps | null;
} = {
  props: null,
};

vi.mock('@/components/layout/chat-area/SessionInstanceManager', () => ({
  SessionInstanceManager: (props: MockSessionInstanceManagerProps) => {
    managerControls.props = props;
    return <div data-testid="session-instance-manager" data-empty={String(props.isShownHidden)} />;
  },
}));

vi.mock('@/components/chat', () => ({
  AuthErrorBanner: () => <div data-testid="auth-error-banner" />,
  ChatInput: () => <div data-testid="chat-input" />,
  TodoBar: (props: MockTodoBarProps) => {
    todoBarControls.props = props;
    return <div data-testid="todo-bar" data-override-session-id={props.overrideSessionId ?? ''} />;
  },
}));

vi.mock('@/components/shared', () => ({
  StatusAnnouncer: () => null,
}));

vi.mock('@/features/vault', () => ({
  VaultPage: () => <div data-testid="vault-page" />,
}));

function resetStores(): void {
  useChatStore.setState(useChatStore.getInitialState(), true);
  useSessionSwitchStore.setState(useSessionSwitchStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  managerControls.props = null;
  todoBarControls.props = null;
}

describe('ChatContent render invariants', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('keeps session instances mounted during a transient unloaded empty state', () => {
    useChatStore.setState({
      sessions: {
        'session-a': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'unloaded',
          layoutVersion: 0,
          measurementCache: null,
        },
      },
    });

    render(
      <ChatContent
        contentRef={{ current: null }}
        isLoadingConversation={false}
        messages={[]}
        isAgentRunning={false}
        sessionId="session-a"
        queuedMessage={null}
        pendingPermissions={[]}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onModeChange={vi.fn()}
        onThinkingModeChange={vi.fn()}
        onEffortLevelChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionApprove={vi.fn()}
        onPermissionDeny={vi.fn()}
      />
    );

    expect(managerControls.props?.isShownHidden).toBe(false);
    expect(screen.getByTestId('todo-bar')).toHaveAttribute('data-override-session-id', 'session-a');
  });

  it('only hides session instances for a hydrated empty conversation', () => {
    useChatStore.setState({
      sessions: {
        'session-a': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          measurementCache: null,
        },
      },
    });

    render(
      <ChatContent
        contentRef={{ current: null }}
        isLoadingConversation={false}
        messages={[]}
        isAgentRunning={false}
        sessionId="session-a"
        queuedMessage={null}
        pendingPermissions={[]}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onModeChange={vi.fn()}
        onThinkingModeChange={vi.fn()}
        onEffortLevelChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionApprove={vi.fn()}
        onPermissionDeny={vi.fn()}
      />
    );

    expect(managerControls.props?.isShownHidden).toBe(true);
  });

  it('keeps TodoBar aligned to the shown session during pending verification', () => {
    useChatStore.setState({
      sessions: {
        'session-a': {
          messages: [
            { id: 'msg-1', role: 'assistant', content: 'hello', displayedContent: 'hello' },
          ],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          measurementCache: null,
        },
      },
    });
    useSessionSwitchStore.setState({
      pending: {
        sessionId: 'session-b',
        title: 'Pending',
        sourceSessionId: 'session-a',
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
      requestId: 1,
      status: 'visible-verifying',
    });

    render(
      <ChatContent
        contentRef={{ current: null }}
        isLoadingConversation={false}
        messages={[]}
        isAgentRunning={false}
        sessionId="session-a"
        queuedMessage={null}
        pendingPermissions={[]}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onModeChange={vi.fn()}
        onThinkingModeChange={vi.fn()}
        onEffortLevelChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionApprove={vi.fn()}
        onPermissionDeny={vi.fn()}
      />
    );

    expect(screen.getByTestId('todo-bar')).toHaveAttribute('data-override-session-id', 'session-a');
  });

  it('shows the neutral loading shell when there is no shown session and a pending target', () => {
    useSessionSwitchStore.setState({
      pending: {
        sessionId: 'session-b',
        title: 'Pending',
        sourceSessionId: null,
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
      requestId: 1,
      status: 'hidden-priming',
    });

    render(
      <ChatContent
        contentRef={{ current: null }}
        isLoadingConversation={true}
        messages={[]}
        isAgentRunning={false}
        sessionId=""
        queuedMessage={null}
        pendingPermissions={[]}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onModeChange={vi.fn()}
        onThinkingModeChange={vi.fn()}
        onEffortLevelChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionApprove={vi.fn()}
        onPermissionDeny={vi.fn()}
      />
    );

    expect(screen.getByText('Loading conversation...')).toBeInTheDocument();
    expect(managerControls.props?.shownSessionId).toBeUndefined();
    expect(managerControls.props?.pendingSessionId).toBe('session-b');
  });

  it('keeps the neutral loading shell visible through visible verification when no chat is shown', () => {
    useSessionSwitchStore.setState({
      pending: {
        sessionId: 'session-b',
        title: 'Pending',
        sourceSessionId: null,
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
      requestId: 2,
      status: 'visible-verifying',
    });

    render(
      <ChatContent
        contentRef={{ current: null }}
        isLoadingConversation={true}
        messages={[]}
        isAgentRunning={false}
        sessionId=""
        queuedMessage={null}
        pendingPermissions={[]}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
        onModeChange={vi.fn()}
        onThinkingModeChange={vi.fn()}
        onEffortLevelChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionApprove={vi.fn()}
        onPermissionDeny={vi.fn()}
      />
    );

    expect(screen.getByText('Loading conversation...')).toBeInTheDocument();
    expect(managerControls.props?.pendingPhase).toBe('visible-verifying');
    expect(managerControls.props?.shownSessionId).toBeUndefined();
  });
});
