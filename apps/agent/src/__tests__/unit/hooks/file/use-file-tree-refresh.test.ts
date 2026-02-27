import { act, renderHook } from '@testing-library/react';

import type { FileEntry } from '@/lib/api';
import type { ExtensionMessage } from '@/types/protocol';

const { mockBuildFileIndex, mockListDirectory, mockLspDidOpen, mockSetWorkspacePath } = vi.hoisted(
  () => ({
    mockBuildFileIndex: vi.fn<(path: string) => Promise<void>>(),
    mockListDirectory: vi.fn<(path: string, includeHidden?: boolean) => Promise<FileEntry[]>>(),
    mockLspDidOpen: vi.fn<(path: string, language: string, content: string) => Promise<void>>(),
    mockSetWorkspacePath: vi.fn<(path: string) => Promise<void>>(),
  })
);

const { mockInitFileWatcher } = vi.hoisted(() => ({
  mockInitFileWatcher: vi.fn<(path: string) => Promise<void>>(),
}));

const {
  mockGetLanguageFromPath,
  mockOpenFile,
  mockSetFileContent,
  mockSetLoading,
  viewerOpenTabs,
} = vi.hoisted(() => ({
  mockGetLanguageFromPath: vi.fn<(path: string) => string>(),
  mockOpenFile: vi.fn<(path: string) => void>(),
  mockSetFileContent: vi.fn<(path: string, content: string) => void>(),
  mockSetLoading: vi.fn<(loading: boolean, path: string) => void>(),
  viewerOpenTabs: [] as { path: string }[],
}));

const { mockInitializeWorkspace, mockOpenFileTab, mockSetConversations, mockSubscribe } =
  vi.hoisted(() => ({
    mockInitializeWorkspace: vi.fn<(path: string) => void>(),
    mockOpenFileTab: vi.fn<() => void>(),
    mockSetConversations: vi.fn<(conversations: unknown[]) => void>(),
    mockSubscribe: vi.fn<
      (listener: (state: { workspacePath: string | null }) => void) => () => void
    >(() => vi.fn()),
  }));

const { tauriHandlers, mockPostMessage } = vi.hoisted(() => ({
  tauriHandlers: [] as ((message: ExtensionMessage) => void)[],
  mockPostMessage: vi.fn(),
}));

const { mockIsMac } = vi.hoisted(() => ({
  mockIsMac: vi.fn<[], boolean>(),
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: ({ onMessage }: { onMessage?: (message: ExtensionMessage) => void }) => {
    if (onMessage) {
      tauriHandlers.push(onMessage);
    }
    return {
      postMessage: mockPostMessage,
      isConnected: true,
      isMockMode: false,
    };
  },
}));

vi.mock('@/hooks/agent/use-tauri-file-watcher', () => ({
  initFileWatcher: mockInitFileWatcher,
}));

vi.mock('@/lib/api', () => ({
  buildFileIndex: mockBuildFileIndex,
  listDirectory: mockListDirectory,
  lspDidOpen: mockLspDidOpen,
  setWorkspacePath: mockSetWorkspacePath,
}));

vi.mock('@/lib/utils', () => ({
  isMac: mockIsMac,
}));

vi.mock('@/stores/file/file-viewer-store', () => ({
  getLanguageFromPath: mockGetLanguageFromPath,
  useFileViewerStore: {
    getState: () => ({
      openTabs: viewerOpenTabs,
      openFile: mockOpenFile,
      setFileContent: mockSetFileContent,
      setLoading: mockSetLoading,
    }),
  },
}));

vi.mock('@/stores/ui/ui-store', () => ({
  useUIStore: {
    getState: () => ({
      workspacePath: null,
      initializeWorkspace: mockInitializeWorkspace,
      openFileTab: mockOpenFileTab,
      setConversations: mockSetConversations,
    }),
    subscribe: mockSubscribe,
  },
}));

import { useFileTree } from '@/hooks/file/use-file-tree';
import { useFileStore } from '@/stores/file/file-store';

type FileChangedMessage = Extract<ExtensionMessage, { type: 'file:changed' }>;

function resetFileStore(): void {
  useFileStore.setState((state) => {
    state.rootPath = null;
    state.treeNodes = {};
    state.expandedFolders.clear();
    state.selectedTreePath = null;
    state.loadingPaths.clear();
    state.errorPaths.clear();
  });
}

function createEntry(path: string, name: string, isDir = false): FileEntry {
  return {
    path,
    name,
    isDir,
    isSymlink: false,
    isHidden: false,
    isGitIgnored: false,
  };
}

function fileChanged(
  path: string,
  changeType: FileChangedMessage['change_type']
): FileChangedMessage {
  return {
    type: 'file:changed',
    uuid: crypto.randomUUID(),
    path,
    change_type: changeType,
  };
}

function emitFileChanged(
  handlerIndex: number,
  path: string,
  changeType: FileChangedMessage['change_type']
): void {
  const handler = tauriHandlers[handlerIndex];
  if (handler === undefined) {
    throw new Error(`Missing file tree handler at index ${String(handlerIndex)}`);
  }
  act(() => {
    handler(fileChanged(path, changeType));
  });
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolvePromise) {
        throw new Error('Deferred promise not initialized');
      }
      resolvePromise(value);
    },
  };
}

describe('use-file-tree external refresh', () => {
  beforeEach(() => {
    resetFileStore();
    tauriHandlers.length = 0;

    mockBuildFileIndex.mockResolvedValue(undefined);
    mockInitFileWatcher.mockResolvedValue(undefined);
    mockListDirectory.mockResolvedValue([createEntry('/workspace/src/new.ts', 'new.ts')]);
    mockLspDidOpen.mockResolvedValue(undefined);
    mockSetWorkspacePath.mockResolvedValue(undefined);
    mockGetLanguageFromPath.mockReturnValue('typescript');
    mockIsMac.mockReturnValue(true);

    viewerOpenTabs.length = 0;

    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces burst create events for same parent into one directory refresh', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/a.ts', 'created');
    emitFileChanged(0, '/workspace/src/b.ts', 'created');

    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/src', true);
    expect(useFileStore.getState().treeNodes['/workspace/src']?.[0]?.name).toBe('new.ts');
  });

  it('skips root tree request when no root path is available yet', async () => {
    renderHook(() => useFileTree());
    await Promise.resolve();

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('initializes file watcher for the active root path', () => {
    useFileStore.getState().setRootPath('/workspace');

    renderHook(() => useFileTree({ autoLoad: false }));

    expect(mockInitFileWatcher).toHaveBeenCalledWith('/workspace');
  });

  it('ignores stale refresh results when root path changes during fetch', async () => {
    const deferred = createDeferred<FileEntry[]>();
    mockListDirectory.mockReturnValueOnce(deferred.promise);

    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/new.ts', 'created');
    await vi.advanceTimersByTimeAsync(160);
    expect(mockListDirectory).toHaveBeenCalledTimes(1);

    useFileStore.getState().setRootPath('/other-workspace');
    deferred.resolve([createEntry('/workspace/src/new.ts', 'new.ts')]);
    await Promise.resolve();
    await Promise.resolve();

    expect(useFileStore.getState().rootPath).toBe('/other-workspace');
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBeUndefined();
  });

  it('skips refresh for collapsed directories', async () => {
    useFileStore.getState().setRootPath('/workspace');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/new.ts', 'created');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).not.toHaveBeenCalled();
  });

  it('still removes deleted files immediately without debounce', () => {
    const { setRootPath, setTreeChildren } = useFileStore.getState();
    setRootPath('/workspace');
    setTreeChildren('/workspace/src', [
      {
        name: 'a.ts',
        path: '/workspace/src/a.ts',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
      {
        name: 'b.ts',
        path: '/workspace/src/b.ts',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ]);

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/a.ts', 'deleted');

    const children = useFileStore.getState().treeNodes['/workspace/src'];
    expect(children?.map((child) => child.path)).toEqual(['/workspace/src/b.ts']);
    expect(mockListDirectory).not.toHaveBeenCalled();
  });

  it('triggers parent refresh for deleted events in expanded folders', async () => {
    const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    setTreeChildren('/workspace/src', [
      {
        name: 'a.ts',
        path: '/workspace/src/a.ts',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
      {
        name: 'b.ts',
        path: '/workspace/src/b.ts',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ]);

    mockListDirectory.mockResolvedValueOnce([createEntry('/workspace/src/b.ts', 'b.ts')]);

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/a.ts', 'deleted');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/src', true);
    expect(useFileStore.getState().treeNodes['/workspace/src']?.map((node) => node.name)).toEqual([
      'b.ts',
    ]);
  });

  it('invalidates cached collapsed directory so next expand can refetch', async () => {
    const { setRootPath, setTreeChildren } = useFileStore.getState();
    setRootPath('/workspace');
    setTreeChildren('/workspace/src', [
      {
        name: 'old.ts',
        path: '/workspace/src/old.ts',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ]);

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/new.ts', 'created');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).not.toHaveBeenCalled();
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBeUndefined();
  });

  it('coalesces case-variant parent paths on case-insensitive filesystems', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/Workspace/Src/a.ts', 'created');
    emitFileChanged(0, '/workspace/src/b.ts', 'created');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/src', true);
  });

  it('refreshes using canonical folder path when event path casing differs', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/Workspace/Src/new.ts', 'created');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/src', true);
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBeDefined();
  });

  it('keeps timer maps isolated across hook instances during unmount', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    expandFolder('/workspace/lib');

    const first = renderHook(() => useFileTree({ autoLoad: false }));
    const firstHandlerIndex = tauriHandlers.length - 1;
    const second = renderHook(() => useFileTree({ autoLoad: false }));
    const secondHandlerIndex = tauriHandlers.length - 1;

    emitFileChanged(firstHandlerIndex, '/workspace/src/a.ts', 'created');
    emitFileChanged(secondHandlerIndex, '/workspace/lib/b.ts', 'created');

    first.unmount();

    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/lib', true);

    second.unmount();
  });
});
