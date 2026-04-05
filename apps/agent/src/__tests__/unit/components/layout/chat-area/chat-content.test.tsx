import { act, render, screen } from '@testing-library/react';

import { ChatContent } from '@/components/layout/chat-area/ChatContent';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface MockSessionInstanceManagerProps {
  readonly activeSessionId: string | undefined;
  readonly isActiveHidden?: boolean;
  readonly onShownSessionChange?: (sessionId: string | undefined) => void;
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
    return <div data-testid="session-instance-manager" data-empty={String(props.isActiveHidden)} />;
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
          virtuosoSizeCache: null,
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

    expect(managerControls.props?.isActiveHidden).toBe(false);
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
          virtuosoSizeCache: null,
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

    expect(managerControls.props?.isActiveHidden).toBe(true);
  });

  it('updates TodoBar to the shown session when the manager reports a handoff', () => {
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
          virtuosoSizeCache: null,
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

    expect(screen.getByTestId('todo-bar')).toHaveAttribute('data-override-session-id', 'session-a');

    act(() => {
      managerControls.props?.onShownSessionChange?.('session-b');
    });

    expect(screen.getByTestId('todo-bar')).toHaveAttribute('data-override-session-id', 'session-b');
  });
});
