import { act, renderHook } from '@testing-library/react';

import type { FileEntry } from '@/lib/api';
import type { ExtensionMessage, FileNode } from '@/types/protocol';

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

function createEntry(
  path: string,
  name: string,
  isDir = false,
  overrides: Partial<FileEntry> = {}
): FileEntry {
  return {
    path,
    name,
    isDir,
    isSymlink: false,
    isHidden: false,
    isGitIgnored: false,
    ...overrides,
  };
}

function createNode(
  path: string,
  name: string,
  isDirectory = false,
  overrides: Partial<FileNode> = {}
): FileNode {
  return {
    name,
    path,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
    isGitIgnored: false,
    ...overrides,
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

  it('schedules refresh for modified events in expanded folders', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/file.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(mockListDirectory).toHaveBeenCalledWith('/workspace/src', true);
  });

  it('does not call setTreeChildren when listing is structurally identical', async () => {
    const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/a.ts', 'a.ts')]);
    mockListDirectory.mockResolvedValueOnce([createEntry('/workspace/src/a.ts', 'a.ts')]);

    renderHook(() => useFileTree({ autoLoad: false }));
    const beforeRef = useFileStore.getState().treeNodes['/workspace/src'];

    emitFileChanged(0, '/workspace/src/a.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    const afterRef = useFileStore.getState().treeNodes['/workspace/src'];
    expect(afterRef).toBe(beforeRef);
  });

  it('applies refresh when metadata changes without path changes', async () => {
    const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/a.ts', 'a.ts')]);
    mockListDirectory.mockResolvedValueOnce([
      createEntry('/workspace/src/a.ts', 'a.ts', false, { isGitIgnored: true }),
    ]);

    renderHook(() => useFileTree({ autoLoad: false }));
    const beforeRef = useFileStore.getState().treeNodes['/workspace/src'];

    emitFileChanged(0, '/workspace/src/a.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    const afterRef = useFileStore.getState().treeNodes['/workspace/src'];
    expect(afterRef).not.toBe(beforeRef);
    expect(afterRef?.[0]?.isGitIgnored).toBe(true);
  });

  it('preserves structural intent when created then modified events coalesce', async () => {
    const { setRootPath, setTreeChildren } = useFileStore.getState();
    setRootPath('/workspace');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/old.ts', 'old.ts')]);

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace/src/new.ts', 'created');
    emitFileChanged(0, '/workspace/src/new.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).not.toHaveBeenCalled();
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBeUndefined();
  });

  it('skips cache eviction for collapsed folder when only modified events in window', async () => {
    const { setRootPath, setTreeChildren } = useFileStore.getState();
    setRootPath('/workspace');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/old.ts', 'old.ts')]);

    renderHook(() => useFileTree({ autoLoad: false }));
    const beforeRef = useFileStore.getState().treeNodes['/workspace/src'];

    emitFileChanged(0, '/workspace/src/old.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).not.toHaveBeenCalled();
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBe(beforeRef);
  });

  it('limits concurrent listDirectory calls during burst refreshes', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');

    for (let i = 0; i < 10; i += 1) {
      expandFolder(`/workspace/dir${String(i)}`);
    }

    let inFlight = 0;
    let peakInFlight = 0;
    const deferredCalls: {
      path: string;
      resolve: (entries: FileEntry[]) => void;
    }[] = [];

    mockListDirectory.mockImplementation((path: string) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const deferred = createDeferred<FileEntry[]>();
      deferredCalls.push({
        path,
        resolve: (entries: FileEntry[]) => {
          inFlight -= 1;
          deferred.resolve(entries);
        },
      });
      return deferred.promise;
    });

    renderHook(() => useFileTree({ autoLoad: false }));

    for (let i = 0; i < 10; i += 1) {
      emitFileChanged(0, `/workspace/dir${String(i)}/file.ts`, 'created');
    }
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(5);
    expect(peakInFlight).toBeLessThanOrEqual(5);

    const firstBatch = deferredCalls.splice(0, 5);
    for (const call of firstBatch) {
      call.resolve([createEntry(`${call.path}/synced.ts`, 'synced.ts')]);
    }
    await flushMicrotasks();
    expect(mockListDirectory).toHaveBeenCalledTimes(10);
    expect(peakInFlight).toBeLessThanOrEqual(5);

    const secondBatch = deferredCalls.splice(0);
    for (const call of secondBatch) {
      call.resolve([createEntry(`${call.path}/synced.ts`, 'synced.ts')]);
    }
    await flushMicrotasks();
  });

  it('dedupes pending refreshes for the same directory', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    for (let i = 0; i < 5; i += 1) {
      expandFolder(`/workspace/busy${String(i)}`);
    }
    expandFolder('/workspace/src');

    const deferredCalls: {
      path: string;
      resolve: (entries: FileEntry[]) => void;
    }[] = [];

    mockListDirectory.mockImplementation((path: string) => {
      const deferred = createDeferred<FileEntry[]>();
      deferredCalls.push({
        path,
        resolve: (entries: FileEntry[]) => {
          deferred.resolve(entries);
        },
      });
      return deferred.promise;
    });

    renderHook(() => useFileTree({ autoLoad: false }));

    for (let i = 0; i < 5; i += 1) {
      emitFileChanged(0, `/workspace/busy${String(i)}/file.ts`, 'created');
    }
    await vi.advanceTimersByTimeAsync(160);
    expect(mockListDirectory).toHaveBeenCalledTimes(5);

    emitFileChanged(0, '/workspace/src/one.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);
    emitFileChanged(0, '/workspace/src/two.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(5);

    const firstBusy = deferredCalls.shift();
    if (!firstBusy) throw new Error('Missing deferred busy call');
    firstBusy.resolve([createEntry(`${firstBusy.path}/done.ts`, 'done.ts')]);
    await flushMicrotasks();

    const srcCalls = mockListDirectory.mock.calls.filter(
      (args: readonly unknown[]) => args[0] === '/workspace/src' && args[1] === true
    );
    expect(srcCalls).toHaveLength(1);

    const remaining = deferredCalls.splice(0);
    for (const call of remaining) {
      call.resolve([createEntry(`${call.path}/done.ts`, 'done.ts')]);
    }
    await flushMicrotasks();
  });

  it('never drops refresh intent — all enqueued directories eventually processed', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    for (let i = 0; i < 15; i += 1) {
      expandFolder(`/workspace/dir${String(i)}`);
    }

    const deferredCalls: {
      path: string;
      resolve: (entries: FileEntry[]) => void;
    }[] = [];

    mockListDirectory.mockImplementation((path: string) => {
      const deferred = createDeferred<FileEntry[]>();
      deferredCalls.push({
        path,
        resolve: (entries: FileEntry[]) => {
          deferred.resolve(entries);
        },
      });
      return deferred.promise;
    });

    renderHook(() => useFileTree({ autoLoad: false }));

    for (let i = 0; i < 15; i += 1) {
      emitFileChanged(0, `/workspace/dir${String(i)}/new.ts`, 'created');
    }
    await vi.advanceTimersByTimeAsync(160);
    expect(mockListDirectory).toHaveBeenCalledTimes(5);

    for (let round = 0; round < 3; round += 1) {
      const batch = deferredCalls.splice(0, 5);
      for (const call of batch) {
        call.resolve([createEntry(`${call.path}/done.ts`, 'done.ts')]);
      }
      await flushMicrotasks();
    }

    expect(mockListDirectory).toHaveBeenCalledTimes(15);
  });

  it('preserves tree state when listDirectory rejects during modified-triggered refresh', async () => {
    const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/a.ts', 'a.ts')]);
    mockListDirectory.mockRejectedValueOnce(new Error('boom'));

    renderHook(() => useFileTree({ autoLoad: false }));
    const beforeRef = useFileStore.getState().treeNodes['/workspace/src'];

    emitFileChanged(0, '/workspace/src/a.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(mockListDirectory).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().treeNodes['/workspace/src']).toBe(beforeRef);
  });

  it('marks collapsed folder as dirty on modified event and refreshes on expand', async () => {
    const { setRootPath, setTreeChildren } = useFileStore.getState();
    setRootPath('/workspace');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/old.ts', 'old.ts')]);

    const { result } = renderHook(() => useFileTree({ autoLoad: false }));
    const beforeRef = useFileStore.getState().treeNodes['/workspace/src'];

    emitFileChanged(0, '/workspace/src/old.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    expect(useFileStore.getState().treeNodes['/workspace/src']).toBe(beforeRef);

    act(() => {
      result.current.toggleFolder('/workspace/src');
    });

    expect(useFileStore.getState().treeNodes['/workspace/src']).toBeUndefined();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'file:tree:request',
        path: '/workspace/src',
      })
    );
  });

  it('does not mark expanded folder as dirty (refresh runs normally)', async () => {
    const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();
    setRootPath('/workspace');
    expandFolder('/workspace/src');
    setTreeChildren('/workspace/src', [createNode('/workspace/src/old.ts', 'old.ts')]);
    mockListDirectory.mockResolvedValueOnce([createEntry('/workspace/src/new.ts', 'new.ts')]);

    const { result } = renderHook(() => useFileTree({ autoLoad: false }));
    emitFileChanged(0, '/workspace/src/old.ts', 'modified');
    await vi.advanceTimersByTimeAsync(160);

    mockPostMessage.mockClear();
    act(() => {
      result.current.toggleFolder('/workspace/src');
    });
    act(() => {
      result.current.toggleFolder('/workspace/src');
    });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('clears pending refresh timers when workspace root changes', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace-a');
    expandFolder('/workspace-a/src');

    renderHook(() => useFileTree({ autoLoad: false }));

    emitFileChanged(0, '/workspace-a/src/file.ts', 'modified');

    await act(async () => {
      useFileStore.getState().setRootPath('/workspace-b');
      await Promise.resolve();
    });

    await vi.advanceTimersByTimeAsync(160);
    expect(mockListDirectory).not.toHaveBeenCalled();
  });

  it('rejects in-flight old-root refresh completions after workspace switch', async () => {
    const { setRootPath, expandFolder } = useFileStore.getState();
    setRootPath('/workspace-a');
    for (let i = 0; i < 6; i += 1) {
      expandFolder(`/workspace-a/dir${String(i)}`);
    }

    const deferredCalls: {
      path: string;
      resolve: (entries: FileEntry[]) => void;
    }[] = [];
    mockListDirectory.mockImplementation((path: string) => {
      const deferred = createDeferred<FileEntry[]>();
      deferredCalls.push({
        path,
        resolve: (entries: FileEntry[]) => {
          deferred.resolve(entries);
        },
      });
      return deferred.promise;
    });

    renderHook(() => useFileTree({ autoLoad: false }));

    for (let i = 0; i < 6; i += 1) {
      emitFileChanged(0, `/workspace-a/dir${String(i)}/file.ts`, 'created');
    }
    await vi.advanceTimersByTimeAsync(160);
    expect(mockListDirectory).toHaveBeenCalledTimes(5);

    await act(async () => {
      useFileStore.getState().setRootPath('/workspace-b');
      await Promise.resolve();
    });

    const inFlightBatch = deferredCalls.splice(0);
    for (const call of inFlightBatch) {
      call.resolve([createEntry(`${call.path}/done.ts`, 'done.ts')]);
    }
    await flushMicrotasks();

    expect(useFileStore.getState().rootPath).toBe('/workspace-b');
    expect(Object.keys(useFileStore.getState().treeNodes)).toHaveLength(0);
    expect(mockListDirectory).toHaveBeenCalledTimes(5);
  });
});
