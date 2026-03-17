import { act, renderHook, waitFor } from '@testing-library/react';

import type { UseChatInputOptions } from '@/components/chat/input/types';
import type { LexicalEditor } from 'lexical';

const { mockCompressImage } = vi.hoisted(() => ({
  mockCompressImage: vi.fn(() =>
    Promise.resolve({
      mimeType: 'image/png',
      data: 'compressed-image-data',
    })
  ),
}));

vi.mock('@/lib/utils/image-utils', () => ({
  compressImage: mockCompressImage,
}));

import { useChatInput } from '@/components/chat/input/use-chat-input';
import { useBackendStore } from '@/stores/backend/backend-store';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useOcProviderStore } from '@/stores/opencode';

vi.mock('@/stores/agent', () => {
  const fetchCommands = vi.fn(() => Promise.resolve());
  const fetchSkills = vi.fn(() => Promise.resolve());

  return {
    useSlashCommands: (): [] => [],
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

describe('useChatInput pending file chips', () => {
  beforeEach(() => {
    usePendingContextStore.setState({ pending: [] });
    useBackendStore.setState({ activeBackend: 'claude' });
    useOcProviderStore.getState().clear();
    useOcProviderStore.setState({
      providers: [
        {
          id: 'ollama',
          name: 'Ollama',
          env: [],
          models: {
            vision: {
              id: 'vision',
              name: 'Vision',
              supportsImageInput: true,
            },
            text: {
              id: 'text',
              name: 'Text',
              supportsImageInput: false,
            },
          },
        },
      ],
      selectedProviderId: 'ollama',
      selectedModelId: 'vision',
      selectedAgent: 'build',
    });
    mockCompressImage.mockClear();
    vi.clearAllMocks();
  });

  async function attachImage(result: { current: ReturnType<typeof useChatInput> }): Promise<void> {
    const file = new File(['binary'], 'test.png', { type: 'image/png' });

    act(() => {
      result.current.handleImageSelect({
        target: {
          files: [file],
          value: 'test.png',
        },
      } as never);
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'image', name: 'test.png' })])
      );
    });
  }

  it('drains pending store chips into attached context', async () => {
    const { result } = renderHook(() => useChatInput(createOptions()));

    act(() => {
      usePendingContextStore
        .getState()
        .enqueueFileChip({ path: '/repo/a.ts', name: 'a.ts', isDirectory: false });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toHaveLength(1);
    });

    expect(result.current.attachedContext[0]).toMatchObject({
      type: 'file',
      name: 'a.ts',
      path: '/repo/a.ts',
    });
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });

  it('deduplicates queued chips by path against existing attached context', async () => {
    const { result } = renderHook(() => useChatInput(createOptions()));

    act(() => {
      result.current.handleMentionSelect({
        path: '/repo/a.ts',
        name: 'a.ts',
        isDirectory: false,
      });
    });

    act(() => {
      usePendingContextStore
        .getState()
        .enqueueFileChip({ path: '/repo/a.ts', name: 'a.ts', isDirectory: false });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toHaveLength(1);
    });
  });

  it('focuses input after adding chips', async () => {
    const { result } = renderHook(() => useChatInput(createOptions()));
    const focusSpy = vi.fn();
    const editor = { focus: focusSpy } as unknown as LexicalEditor;

    act(() => {
      result.current.editorRef.current = editor;
      usePendingContextStore
        .getState()
        .enqueueFileChip({ path: '/repo/a.ts', name: 'a.ts', isDirectory: false });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toHaveLength(1);
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('adds multiple queued chips in a single drain cycle', async () => {
    const { result } = renderHook(() => useChatInput(createOptions()));

    act(() => {
      const store = usePendingContextStore.getState();
      store.enqueueFileChip({ path: '/repo/a.ts', name: 'a.ts', isDirectory: false });
      store.enqueueFileChip({ path: '/repo/src', name: 'src', isDirectory: true });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toHaveLength(2);
    });

    expect(result.current.attachedContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'file', path: '/repo/a.ts' }),
        expect.objectContaining({ type: 'folder', path: '/repo/src' }),
      ])
    );
  });

  it('cycles OpenCode agent mode on Shift+Tab', () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    const onModeChange = vi.fn();
    const { result } = renderHook(() => useChatInput(createOptions({ onModeChange })));

    act(() => {
      result.current.handleShiftTab();
    });

    expect(onModeChange).not.toHaveBeenCalled();
    expect(useOcProviderStore.getState().selectedAgent).toBe('plan');
  });

  it('wraps OpenCode agent mode from explore back to build on Shift+Tab', () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    useOcProviderStore.setState({ selectedAgent: 'explore' });
    const { result } = renderHook(() => useChatInput(createOptions()));

    act(() => {
      result.current.handleShiftTab();
    });

    expect(useOcProviderStore.getState().selectedAgent).toBe('build');
  });

  it('clears attached images when the active OpenCode model switches to unsupported', async () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    const { result } = renderHook(() => useChatInput(createOptions()));

    await attachImage(result);

    act(() => {
      useOcProviderStore.setState({ selectedModelId: 'text' });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toEqual([]);
    });
  });

  it('does not clear Claude image chips when switching into an unsupported OpenCode backend', async () => {
    const { result } = renderHook(() => useChatInput(createOptions()));

    await attachImage(result);

    act(() => {
      useOcProviderStore.setState({ selectedModelId: 'text' });
      useBackendStore.setState({ activeBackend: 'opencode' });
    });

    await waitFor(() => {
      expect(result.current.attachedContext).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'image', name: 'test.png' })])
      );
    });
  });
});
