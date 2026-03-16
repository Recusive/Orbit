import { fireEvent, render, screen } from '@testing-library/react';

import type { ChatInputProps, UseChatInputReturn } from '@/components/chat/input/types';
import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { OcQuestionRequest } from '@/types/opencode';
import type { ReactNode } from 'react';

const mockUseChatInput = vi.fn<() => UseChatInputReturn>();

vi.mock('@/components/chat/input/use-chat-input', () => ({
  useChatInput: (): UseChatInputReturn => mockUseChatInput(),
}));

vi.mock('@/components/chat/input/InputControls', () => ({
  InputControls: () => <div data-testid="input-controls" />,
}));

vi.mock('@/components/chat/input/context-chips', () => ({
  ContextChips: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="context-chips">{children}</div>
  ),
}));

vi.mock('@/components/chat/input/lexical', () => ({
  LexicalChatEditor: () => <div data-testid="lexical-editor" />,
}));

vi.mock('@/components/chat/input/mention-popover', () => ({
  MentionPopover: () => <div data-testid="mention-popover" />,
}));

vi.mock('@/components/chat/input/slash-command-popover', () => ({
  SlashCommandPopover: () => <div data-testid="slash-popover" />,
}));

vi.mock('@/components/chat/input/ask-user-question-modal', () => ({
  AskUserQuestionModal: () => <div data-testid="ask-user-question-modal" />,
}));

vi.mock('@/components/chat/input/oc-question-modal', () => ({
  OcQuestionModal: () => <div data-testid="oc-question-modal" />,
}));

vi.mock('@/components/browser', () => ({
  ElementContextChip: () => <div data-testid="element-context-chip" />,
}));

vi.mock('@/components/modals', () => ({
  PermissionModal: ({ request }: { readonly request: PermissionRequest }) => (
    <div data-testid={`permission-${request.requestId}`}>{request.toolName}</div>
  ),
}));

vi.mock('@/stores/agent/tool-store', () => ({
  useModel: (): string => 'claude-sonnet-4-6',
}));

import { ChatInput } from '@/components/chat/input/ChatInput';

function createHookResult(): UseChatInputReturn {
  return {
    inputText: '',
    attachedContext: [],
    slashCommands: [],
    isInputEmpty: true,
    slashGhostText: '',
    leadingCommand: null,
    editorElementRef: { current: null },
    editorRef: { current: null },
    imageInputRef: { current: null },
    popover: {
      mentionOpen: false,
      setMentionOpen: vi.fn(),
      mentionQuery: '',
      setMentionQuery: vi.fn(),
      mentionSelectedIndex: 0,
      setMentionSelectedIndex: vi.fn(),
      mentionStartIndex: 0,
      setMentionStartIndex: vi.fn(),
      slashOpen: false,
      setSlashOpen: vi.fn(),
      slashQuery: '',
      setSlashQuery: vi.fn(),
      slashSelectedIndex: 0,
      setSlashSelectedIndex: vi.fn(),
      slashStartIndex: 0,
      setSlashStartIndex: vi.fn(),
      thinkingHoverOpen: false,
      setThinkingHoverOpen: vi.fn(),
      effortHoverOpen: false,
      setEffortHoverOpen: vi.fn(),
      closeMentionPopover: vi.fn(),
      closeSlashPopover: vi.fn(),
    },
    handleShiftTab: vi.fn(),
    handleTextChange: vi.fn(),
    handleSend: vi.fn(),
    handleImageClick: vi.fn(),
    handleImageSelect: vi.fn(),
    handleMentionSelect: vi.fn(),
    handleSlashSelect: vi.fn(),
    handleRemoveContext: vi.fn(),
    handleStop: vi.fn(),
    cycleInputMode: vi.fn(),
    cycleThinkingMode: vi.fn(),
    cycleEffortLevel: vi.fn(),
    getThinkingInfo: () => ({ level: 'Off', tokens: '0' }),
    getActiveDots: () => 0,
    getEffortInfo: () => ({ level: 'High', description: 'Thorough analysis' }),
    getInputBoxClasses: () => 'rounded-2xl border border-border',
    elementContexts: [],
    removeElementContext: vi.fn(),
  };
}

function createProps(overrides: Partial<ChatInputProps> = {}): ChatInputProps {
  return {
    inputMode: 'default',
    thinkingMode: 'off',
    effortLevel: 'high',
    isAgentRunning: false,
    usage: { inputTokens: 0, outputTokens: 0 },
    maxTokens: 200000,
    permissions: [],
    onPermissionApprove: vi.fn(),
    onPermissionDeny: vi.fn(),
    onQuestionReply: vi.fn().mockResolvedValue(undefined),
    onQuestionReject: vi.fn().mockResolvedValue(undefined),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onModeChange: vi.fn(),
    onThinkingModeChange: vi.fn(),
    onEffortChange: vi.fn(),
    onModelChange: vi.fn(),
    ...overrides,
  };
}

function createPermission(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    requestId: 'permission-1',
    sessionId: 'session-1',
    toolName: 'Bash',
    toolInput: {},
    createdAt: Date.now(),
    supportsAlwaysAllow: true,
    ...overrides,
  };
}

function createQuestion(overrides: Partial<OcQuestionRequest> = {}): OcQuestionRequest {
  return {
    id: 'question-1',
    sessionID: 'session-1',
    questions: [
      {
        header: 'Header',
        question: 'Need extra input',
        options: [{ label: 'Option A', description: 'A' }],
        multiple: false,
        custom: true,
      },
    ],
    ...overrides,
  };
}

describe('ChatInput question shortcut suppression', () => {
  beforeEach(() => {
    mockUseChatInput.mockReturnValue(createHookResult());
    vi.clearAllMocks();
    mockUseChatInput.mockReturnValue(createHookResult());
  });

  it('fires regular permission shortcuts when no question overlay is active', () => {
    const onPermissionApprove = vi.fn();
    const onPermissionDeny = vi.fn();

    render(
      <ChatInput
        {...createProps({
          permissions: [createPermission()],
          onPermissionApprove,
          onPermissionDeny,
        })}
      />
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onPermissionApprove).toHaveBeenCalledWith('permission-1');
    expect(onPermissionDeny).toHaveBeenCalledWith('permission-1');
  });

  it('suppresses regular permission shortcuts while an OpenCode question overlay is active', () => {
    const onPermissionApprove = vi.fn();
    const onPermissionDeny = vi.fn();

    render(
      <ChatInput
        {...createProps({
          permissions: [createPermission()],
          questions: [createQuestion()],
          onPermissionApprove,
          onPermissionDeny,
        })}
      />
    );

    expect(screen.getByTestId('oc-question-modal')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onPermissionApprove).not.toHaveBeenCalled();
    expect(onPermissionDeny).not.toHaveBeenCalled();
  });

  it('restores permission shortcuts after the question overlay is cleared', () => {
    const onPermissionApprove = vi.fn();
    const props = createProps({
      permissions: [createPermission()],
      questions: [createQuestion()],
      onPermissionApprove,
    });

    const view = render(<ChatInput {...props} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onPermissionApprove).not.toHaveBeenCalled();

    view.rerender(
      <ChatInput
        {...createProps({
          permissions: [createPermission()],
          onPermissionApprove,
        })}
      />
    );

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onPermissionApprove).toHaveBeenCalledWith('permission-1');
  });
});
