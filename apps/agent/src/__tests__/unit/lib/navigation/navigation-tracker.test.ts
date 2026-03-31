import { captureSnapshot, destroyNavigationTracker, initNavigationTracker } from '@/lib/navigation';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useNavigationStore } from '@/stores/ui/navigation-store';
import { useUIStore } from '@/stores/ui/ui-store';

const mockGetActiveSessionId = vi.hoisted(() => vi.fn());

vi.mock('@/services/conversations', () => ({
  getConversationUiBridge: () => ({
    getActiveSessionId: mockGetActiveSessionId,
  }),
}));

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
  useNavigationStore.setState(useNavigationStore.getInitialState(), true);
}

describe('navigation-tracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    mockGetActiveSessionId.mockReset();
    mockGetActiveSessionId.mockReturnValue(null);
  });

  afterEach(() => {
    destroyNavigationTracker();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('captures rich tab state and active conversation through the bridge', () => {
    mockGetActiveSessionId.mockReturnValue('session-42');
    useUIStore.setState({
      workspacePath: '/workspace',
      activeTab: 'editor',
      settingsOpen: true,
      settingsSection: 'appearance',
      terminalPosition: 'chat',
      terminalCollapsed: true,
    });
    useFileViewerStore.setState({
      activeTabPath: '/workspace/logo.png',
      openTabs: [
        {
          instanceId: 1,
          path: '/workspace/app.ts',
          content: '',
          originalContent: '',
          language: 'typescript',
          fileType: 'text',
          viewMode: 'file',
          isModified: false,
          isExternal: false,
        },
        {
          instanceId: 2,
          path: '/workspace/logo.png',
          content: '',
          originalContent: '',
          language: 'xml',
          fileType: 'image',
          viewMode: 'file',
          isModified: false,
          isExternal: false,
          imageData: {
            assetUrl: 'asset://logo.png',
            mimeType: 'image/png',
            fileSize: 128,
          },
        },
      ],
    });

    expect(captureSnapshot()).toMatchObject({
      activeTab: 'editor',
      settingsOpen: true,
      settingsSection: 'appearance',
      terminalPosition: 'chat',
      terminalCollapsed: true,
      activeConversationId: 'session-42',
      activeTabPath: '/workspace/logo.png',
      openTabs: [
        { path: '/workspace/app.ts', viewMode: 'file', fileType: 'text' },
        { path: '/workspace/logo.png', viewMode: 'file', fileType: 'image' },
      ],
    });
  });

  it('records debounced snapshots for tracked UI and file-viewer changes', () => {
    useUIStore.setState({ workspacePath: '/workspace' });

    initNavigationTracker();
    vi.advanceTimersByTime(300);

    expect(useNavigationStore.getState().history).toHaveLength(1);

    useUIStore.getState().setActiveTab('editor');
    vi.advanceTimersByTime(300);

    useFileViewerStore.getState().openFile('/workspace/app.ts');
    vi.advanceTimersByTime(300);

    const state = useNavigationStore.getState();
    expect(state.history).toHaveLength(3);
    expect(state.history[1]?.activeTab).toBe('editor');
    expect(state.history[2]?.activeTabPath).toBe('/workspace/app.ts');
    expect(state.history[2]?.openTabs).toEqual([
      { path: '/workspace/app.ts', viewMode: 'file', fileType: 'text' },
    ]);
  });
});
