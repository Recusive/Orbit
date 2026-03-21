import type { NavigationSnapshot } from '@/lib/navigation/apply-snapshot';

import {
  applySnapshot,
  isNavigationRestoreInProgress,
  resetNavigationRestoreState,
} from '@/lib/navigation';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

const mockConvertFileSrc = vi.hoisted(() => vi.fn());
const mockGetFileInfo = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockGetActiveSessionId = vi.hoisted(() => vi.fn());
const mockSelectConversation = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mockConvertFileSrc,
}));

vi.mock('@/lib/api', () => ({
  getFileInfo: mockGetFileInfo,
  readFile: mockReadFile,
}));

vi.mock('@/services/conversations', () => ({
  getConversationUiBridge: () => ({
    getActiveSessionId: mockGetActiveSessionId,
    select: mockSelectConversation,
  }),
}));

function createSnapshot(): NavigationSnapshot {
  return {
    activeTab: 'editor',
    reviewPanelOpen: true,
    rightSidebarOpen: false,
    bottomPanelOpen: true,
    bottomPanelTab: 'problems',
    activityTab: 'source',
    settingsOpen: true,
    settingsSection: 'appearance',
    vaultOpen: false,
    chatAreaDetached: true,
    terminalPosition: 'chat',
    terminalCollapsed: true,
    editorChatPanelOpen: false,
    activeConversationId: 'session-2',
    activeTabPath: '/workspace/app.ts',
    openTabs: [
      { path: '/workspace/app.ts', viewMode: 'file', fileType: 'text' },
      { path: '/workspace/logo.png', viewMode: 'file', fileType: 'image' },
      { path: '/workspace/changes.diff.ts', viewMode: 'diff', fileType: 'text' },
    ],
  };
}

function resetStores(): void {
  localStorage.clear();
  useUIStore.setState(useUIStore.getInitialState(), true);
  useFileViewerStore.setState({
    openTabs: [],
    activeTabPath: null,
    markdownPreview: {},
    cursorPositions: {},
    history: [],
    historyIndex: -1,
    isLoading: false,
    loadingPath: null,
    searchOpen: false,
    searchTrigger: null,
    searchQuery: '',
    pendingGoto: null,
    wordWrap: false,
  });
  resetNavigationRestoreState();
}

describe('apply-snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    mockConvertFileSrc.mockReset();
    mockGetFileInfo.mockReset();
    mockReadFile.mockReset();
    mockGetActiveSessionId.mockReset();
    mockSelectConversation.mockReset();
    mockConvertFileSrc.mockReturnValue('asset://logo.png');
    mockGetFileInfo.mockResolvedValue({ size: 512 });
    mockReadFile.mockImplementation((path: string) => Promise.resolve(`content:${path}`));
    mockGetActiveSessionId.mockReturnValue('session-1');
    mockSelectConversation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetNavigationRestoreState();
  });

  it('restores tracked UI fields, text/image tabs, and conversation selection', async () => {
    applySnapshot(createSnapshot());

    expect(isNavigationRestoreInProgress()).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    const tabs = useFileViewerStore.getState().openTabs;
    expect(tabs).toHaveLength(2);
    expect(tabs.find((tab) => tab.path === '/workspace/app.ts')?.content).toBe(
      'content:/workspace/app.ts'
    );
    expect(tabs.find((tab) => tab.path === '/workspace/logo.png')?.fileType).toBe('image');

    const uiState = useUIStore.getState();
    expect(uiState.activeTab).toBe('editor');
    // leftSidebarWidth is NOT restored — sidebar is a layout preference, not navigation
    expect(uiState.reviewPanelOpen).toBe(true);
    expect(uiState.bottomPanelOpen).toBe(true);
    expect(uiState.bottomPanelTab).toBe('problems');
    expect(uiState.settingsOpen).toBe(true);
    expect(uiState.settingsSection).toBe('appearance');
    expect(uiState.chatAreaDetached).toBe(true);
    expect(uiState.terminalPosition).toBe('chat');
    expect(uiState.terminalCollapsed).toBe(true);
    expect(uiState.editorChatPanelOpen).toBe(false);

    const fileState = useFileViewerStore.getState();
    expect(fileState.activeTabPath).toBe('/workspace/app.ts');
    expect(fileState.history).toEqual(['/workspace/app.ts', '/workspace/logo.png']);
    expect(fileState.historyIndex).toBe(0);
    expect(fileState.openTabs.find((tab) => tab.path === '/workspace/changes.diff.ts')).toBe(
      undefined
    );

    expect(mockReadFile).toHaveBeenCalledWith('/workspace/app.ts');
    expect(mockGetFileInfo).toHaveBeenCalledWith('/workspace/logo.png');
    expect(mockConvertFileSrc).toHaveBeenCalledWith('/workspace/logo.png');
    expect(mockSelectConversation).toHaveBeenCalledWith('session-2');

    vi.advanceTimersByTime(50);
    expect(isNavigationRestoreInProgress()).toBe(false);
  });

  it('drops stale async work from an earlier restore generation', async () => {
    let resolveFirstRead!: (value: string) => void;
    let resolveSecondRead!: (value: string) => void;

    mockReadFile
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirstRead = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecondRead = resolve;
          })
      );

    const firstSnapshot: NavigationSnapshot = {
      ...createSnapshot(),
      activeTabPath: '/workspace/app.ts',
      openTabs: [{ path: '/workspace/app.ts', viewMode: 'file', fileType: 'text' }],
    };
    const secondSnapshot: NavigationSnapshot = {
      ...createSnapshot(),
      activeTabPath: '/workspace/other.ts',
      openTabs: [{ path: '/workspace/other.ts', viewMode: 'file', fileType: 'text' }],
    };

    applySnapshot(firstSnapshot);
    applySnapshot(secondSnapshot);

    resolveFirstRead('first');
    resolveSecondRead('second');
    await Promise.resolve();
    await Promise.resolve();

    const fileState = useFileViewerStore.getState();
    expect(fileState.openTabs).toHaveLength(1);
    expect(fileState.openTabs[0]?.path).toBe('/workspace/other.ts');
    expect(fileState.openTabs[0]?.content).toBe('second');
  });
});
