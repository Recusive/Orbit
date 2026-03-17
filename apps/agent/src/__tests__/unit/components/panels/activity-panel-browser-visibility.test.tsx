const { postMessageMock, shouldBrowserBeVisibleMock } = vi.hoisted(() => ({
  postMessageMock: vi.fn(),
  shouldBrowserBeVisibleMock: vi.fn<[], boolean>(),
}));

vi.mock('@/components/files', () => ({
  FileIcon: () => <span data-testid="mock-file-icon" />,
  FileViewer: () => <div data-testid="mock-file-viewer">Viewer</div>,
}));

vi.mock('@/components/git', () => ({
  SourceControlTab: () => <div data-testid="mock-source-control">Source</div>,
}));

vi.mock('@/components/browser/browser-panel', () => ({
  BrowserPanel: () => <div data-testid="mock-browser-panel">Browser</div>,
}));

vi.mock('@/components/layout/status-bar', () => ({
  StatusBar: () => <div data-testid="mock-status-bar">Status</div>,
}));

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => ({ current: null }),
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({ postMessage: postMessageMock }),
}));

vi.mock('@/lib/api', () => ({
  lspDidClose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/browser-overlay-coordination', () => ({
  shouldBrowserBeVisible: shouldBrowserBeVisibleMock,
}));

import { render, waitFor } from '@testing-library/react';

import { ActivityPanel } from '@/components/panels/activity-panel';
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

describe('ActivityPanel browser visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrowserStore.getState().reset();
    useFileViewerStore.setState(useFileViewerStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useBrowserStore.getState().setViewId('browser-1');
    useUIStore.setState({ activityTab: 'browser', reviewPanelOpen: true });
  });

  it('uses the shared visibility predicate before posting a show command', async () => {
    shouldBrowserBeVisibleMock.mockReturnValue(true);

    render(<ActivityPanel />);

    await waitFor(() => {
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'browser:show' })
      );
    });
  });

  it('uses the shared visibility predicate before posting a hide command', async () => {
    shouldBrowserBeVisibleMock.mockReturnValue(false);

    render(<ActivityPanel />);

    await waitFor(() => {
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'browser:hide' })
      );
    });
  });
});
