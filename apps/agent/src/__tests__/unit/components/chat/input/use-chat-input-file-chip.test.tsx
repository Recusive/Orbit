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
import { usePendingContextStore } from '@/stores/chat/pending-context-store';

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

  it('cycles input mode on Shift+Tab', () => {
    const onModeChange = vi.fn();
    const { result } = renderHook(() => useChatInput(createOptions({ onModeChange })));

    act(() => {
      result.current.handleShiftTab();
    });

    expect(onModeChange).toHaveBeenCalledWith('plan');
  });

  it('sends image-only messages without requiring text input', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useChatInput(createOptions({ onSend })));

    await attachImage(result);

    act(() => {
      result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      '',
      undefined,
      [
        {
          name: 'test.png',
          mimeType: 'image/png',
          data: 'compressed-image-data',
          previewUrl: 'data:image/png;base64,compressed-image-data',
        },
      ],
      undefined,
      undefined
    );
  });
});
