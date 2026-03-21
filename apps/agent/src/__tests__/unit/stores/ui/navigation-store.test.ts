import type { NavigationSnapshot } from '@/lib/navigation/apply-snapshot';

import { useNavigationStore } from '@/stores/ui/navigation-store';

const mockApplySnapshot = vi.hoisted(() => vi.fn());

vi.mock('@/lib/navigation/apply-snapshot', () => ({
  applySnapshot: mockApplySnapshot,
}));

function createSnapshot(id: number): NavigationSnapshot {
  return {
    activeTab: id % 2 === 0 ? 'agent' : 'editor',
    reviewPanelOpen: false,
    rightSidebarOpen: false,
    bottomPanelOpen: false,
    bottomPanelTab: 'terminal',
    activityTab: 'file',
    settingsOpen: false,
    settingsSection: 'agent',
    vaultOpen: false,
    chatAreaDetached: false,
    terminalPosition: 'activity',
    terminalCollapsed: false,
    editorChatPanelOpen: true,
    activeConversationId: `session-${String(id)}`,
    activeTabPath: `/workspace/file-${String(id)}.ts`,
    openTabs: [
      {
        path: `/workspace/file-${String(id)}.ts`,
        viewMode: 'file',
        fileType: 'text',
      },
    ],
  };
}

describe('navigation-store', () => {
  beforeEach(() => {
    useNavigationStore.setState(useNavigationStore.getInitialState(), true);
    mockApplySnapshot.mockReset();
  });

  it('pushes snapshots and truncates forward history before appending', () => {
    const first = createSnapshot(1);
    const second = createSnapshot(2);
    const third = createSnapshot(3);
    const replacement = createSnapshot(4);

    const store = useNavigationStore.getState();
    store.pushSnapshot(first);
    store.pushSnapshot(second);
    store.pushSnapshot(third);
    store.goBack();

    useNavigationStore.getState().pushSnapshot(replacement);

    const state = useNavigationStore.getState();
    expect(state.currentIndex).toBe(2);
    expect(state.history).toEqual([first, second, replacement]);
  });

  it('caps history at 100 entries', () => {
    const store = useNavigationStore.getState();

    for (let index = 0; index < 101; index += 1) {
      store.pushSnapshot(createSnapshot(index));
    }

    const state = useNavigationStore.getState();
    expect(state.history).toHaveLength(100);
    expect(state.currentIndex).toBe(99);
    expect(state.history[0]?.activeConversationId).toBe('session-1');
    expect(state.history[99]?.activeConversationId).toBe('session-100');
  });

  it('navigates backward and forward through the stored snapshots', () => {
    const first = createSnapshot(1);
    const second = createSnapshot(2);

    const store = useNavigationStore.getState();
    store.pushSnapshot(first);
    store.pushSnapshot(second);

    store.goBack();

    expect(useNavigationStore.getState().currentIndex).toBe(0);
    expect(mockApplySnapshot).toHaveBeenNthCalledWith(1, first);

    store.goForward();

    expect(useNavigationStore.getState().currentIndex).toBe(1);
    expect(mockApplySnapshot).toHaveBeenNthCalledWith(2, second);
  });

  it('ignores navigation at the history boundaries', () => {
    const store = useNavigationStore.getState();
    store.pushSnapshot(createSnapshot(1));

    store.goBack();
    store.goForward();

    expect(useNavigationStore.getState().currentIndex).toBe(0);
    expect(mockApplySnapshot).not.toHaveBeenCalled();
  });
});
