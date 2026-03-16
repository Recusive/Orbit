import { act, renderHook } from '@testing-library/react';
import { createEditor } from 'lexical';

import type { SlashCommand, UseChatInputOptions } from '@/components/chat/input/types';

import { readEditorText, setEditorText } from '@/components/chat/input/lexical';
import { useChatInput } from '@/components/chat/input/use-chat-input';
import { useBackendStore } from '@/stores/backend/backend-store';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useFileStore } from '@/stores/file/file-store';

let mockSlashCommands: SlashCommand[] = [];
let mockSelectedAgent: 'build' | 'plan' | 'explore' = 'build';
const mockSetSelectedAgent = vi.fn((agent: 'build' | 'plan' | 'explore') => {
  mockSelectedAgent = agent;
});

vi.mock('@orbit.build/sdk/v2/client', () => ({
  createOrbitClient: vi.fn(),
}));

vi.mock('@/stores/agent', () => {
  const fetchCommands = vi.fn(() => Promise.resolve());
  const fetchSkills = vi.fn(() => Promise.resolve());

  return {
    useSlashCommands: (): SlashCommand[] => mockSlashCommands,
    useCommandsStore: (
      selector: (state: {
        fetchCommands: () => Promise<void>;
        fetchSkills: () => Promise<void>;
      }) => unknown
    ): unknown =>
      selector({
        fetchCommands,
        fetchSkills,
      }),
  };
});

vi.mock('@/stores/browser/browser-store', () => {
  const removeElementContext = vi.fn();
  const clearElementContexts = vi.fn();

  return {
    useElementContexts: (): [] => [],
    useBrowserStore: (
      selector: (state: {
        removeElementContext: (index: number) => void;
        clearElementContexts: () => void;
      }) => unknown
    ): unknown =>
      selector({
        removeElementContext,
        clearElementContexts,
      }),
  };
});

vi.mock('@/stores/opencode', () => ({
  useOcProviderStore: (
    selector: (state: {
      selectedAgent: 'build' | 'plan' | 'explore';
      setSelectedAgent: (agent: 'build' | 'plan' | 'explore') => void;
    }) => unknown
  ): unknown =>
    selector({
      selectedAgent: mockSelectedAgent,
      setSelectedAgent: mockSetSelectedAgent,
    }),
}));

vi.mock('@/components/chat/input/slash-command-popover', () => ({
  getFilteredCommandsCount: (): number => 0,
  getCommandAtIndex: (): null => null,
  SlashCommandPopover: (): null => null,
}));

function createOptions(overrides: Partial<UseChatInputOptions> = {}): UseChatInputOptions {
  return {
    inputMode: 'default',
    thinkingMode: 'off',
    effortLevel: 'high',
    isAgentRunning: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onModeChange: vi.fn(),
    onThinkingModeChange: vi.fn(),
    onEffortChange: vi.fn(),
    ...overrides,
  };
}

function attachEditor(): ReturnType<typeof createEditor> {
  return createEditor();
}

describe('slash command highlighting in useChatInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockSlashCommands = [
      { name: 'commit', description: 'Commit changes', kind: 'command' },
      { name: 'compact', description: 'Compact context', kind: 'command' },
      { name: 'planner', description: 'Planning skill', kind: 'skill' },
    ];
    usePendingContextStore.setState({ pending: [] });
    useBackendStore.setState({ activeBackend: 'claude' });
    useFileStore.setState({ rootPath: null });
    mockSelectedAgent = 'build';
    mockSetSelectedAgent.mockClear();
    vi.clearAllMocks();
  });

  it('sets leadingCommand when a command is selected from the popover', () => {
    const { result } = renderHook(() => useChatInput(createOptions()));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, '/com');
      result.current.handleTextChange('/com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(0);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    expect(result.current.leadingCommand).toBe('compact');
    expect(result.current.inputText).toBe('/compact ');
  });

  it('does not set leadingCommand for mid-message slash commands', () => {
    const { result } = renderHook(() => useChatInput(createOptions()));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, 'hello /com');
      result.current.handleTextChange('hello /com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(6);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    expect(result.current.leadingCommand).toBeNull();
    expect(result.current.inputText).toBe('hello /compact ');
  });

  it('clears leadingCommand when command text is deleted', () => {
    const { result } = renderHook(() => useChatInput(createOptions()));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, '/com');
      result.current.handleTextChange('/com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(0);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    expect(result.current.leadingCommand).toBe('compact');

    act(() => {
      setEditorText(editor, '/compac');
      result.current.handleTextChange('/compac');
    });

    expect(result.current.leadingCommand).toBeNull();
  });

  it('keeps leadingCommand when typing after the command', () => {
    const { result } = renderHook(() => useChatInput(createOptions()));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, '/com');
      result.current.handleTextChange('/com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(0);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    act(() => {
      setEditorText(editor, '/compact hello world');
      result.current.handleTextChange('/compact hello world');
    });

    expect(result.current.leadingCommand).toBe('compact');
  });

  it('clears leadingCommand on send', () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useChatInput(createOptions({ onSend })));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, '/com');
      result.current.handleTextChange('/com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(0);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(result.current.leadingCommand).toBeNull();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(readEditorText(editor)).toBe('');
  });

  it('sends the command as part of the message text', () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useChatInput(createOptions({ onSend })));
    const editor = attachEditor();

    act(() => {
      result.current.editorRef.current = editor;
      setEditorText(editor, '/com');
      result.current.handleTextChange('/com');
    });

    act(() => {
      result.current.popover.setSlashStartIndex(0);
      result.current.popover.setSlashQuery('com');
    });

    act(() => {
      result.current.handleSlashSelect({
        name: 'compact',
        description: 'Compact context',
        kind: 'command',
      });
    });

    act(() => {
      setEditorText(editor, '/compact hello');
      result.current.handleTextChange('/compact hello');
    });

    act(() => {
      result.current.handleSend();
    });

    const sentText = onSend.mock.calls[0]?.[0] as string;
    expect(sentText).toBe('/compact hello');
  });
});
