import { act, renderHook, waitFor } from '@testing-library/react';

import type { OcSession } from '@/types/opencode';

import { useOpencodeLifecycle } from '@/hooks/opencode/use-opencode-lifecycle';
import { useBackendStore } from '@/stores/backend';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

const {
  mockGetConversationUiBridge,
  mockRestoreSelection,
  mockDestroyClient,
  mockInitClient,
  mockListSessions,
  mockLoadProviders,
  mockOnOpencodeCrashed,
  mockOpencodeStart,
  mockOpencodeStatus,
  mockOpencodeStop,
  mockSseConnect,
  mockSseDisconnect,
  mockToastError,
} = vi.hoisted(() => ({
  mockGetConversationUiBridge: vi.fn(),
  mockRestoreSelection: vi.fn(),
  mockDestroyClient: vi.fn(),
  mockInitClient: vi.fn(),
  mockListSessions: vi.fn(),
  mockLoadProviders: vi.fn(),
  mockOnOpencodeCrashed: vi.fn(),
  mockOpencodeStart: vi.fn(),
  mockOpencodeStatus: vi.fn(),
  mockOpencodeStop: vi.fn(),
  mockSseConnect: vi.fn(),
  mockSseDisconnect: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('@/lib/api/opencode', () => ({
  onOpencodeCrashed: mockOnOpencodeCrashed,
  opencodeStart: mockOpencodeStart,
  opencodeStatus: mockOpencodeStatus,
  opencodeStop: mockOpencodeStop,
}));

vi.mock('@/services/conversations', () => ({
  getConversationUiBridge: mockGetConversationUiBridge,
}));

vi.mock('@/services/opencode', () => ({
  destroyClient: mockDestroyClient,
  initClient: mockInitClient,
  ocSessionService: {
    listSessions: mockListSessions,
    loadProviders: mockLoadProviders,
  },
  ocSseManager: {
    connect: mockSseConnect,
    disconnect: mockSseDisconnect,
  },
}));

function createSession(sessionId = 'session-1'): OcSession {
  return {
    id: sessionId,
    slug: sessionId,
    projectID: 'project-1',
    directory: '/workspace',
    title: `Session ${sessionId}`,
    version: '1',
    time: { created: 1, updated: 1 },
  };
}

function resetStores(): void {
  localStorage.clear();
  useBackendStore.setState({
    activeBackend: 'claude',
    opencodePort: null,
    opencodeHealthy: false,
    switchingBackend: false,
  });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
    pendingSendSessions: {},
  });
  useOcMessageStore.getState().clearAll();
  useOcPermissionStore.getState().clearAll();
}

describe('useOpencodeLifecycle', () => {
  beforeEach(() => {
    resetStores();
    mockGetConversationUiBridge.mockReset();
    mockRestoreSelection.mockReset();
    mockDestroyClient.mockReset();
    mockInitClient.mockReset();
    mockListSessions.mockReset();
    mockLoadProviders.mockReset();
    mockOnOpencodeCrashed.mockReset();
    mockOpencodeStart.mockReset();
    mockOpencodeStatus.mockReset();
    mockOpencodeStop.mockReset();
    mockSseConnect.mockReset();
    mockSseDisconnect.mockReset();
    mockToastError.mockReset();

    mockGetConversationUiBridge.mockReturnValue({
      restoreSelection: mockRestoreSelection,
    });
    mockOnOpencodeCrashed.mockResolvedValue(() => undefined);
  });

  it('pre-warms the process before workspace init and reuses it during startup', async () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    useOcSessionStore.setState({
      sessions: {},
      activeSessionId: 'session-restore',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });

    mockOpencodeStatus
      .mockResolvedValueOnce({
        running: false,
        port: null,
        healthy: false,
        binaryPath: null,
        error: null,
      })
      .mockResolvedValueOnce({
        running: true,
        port: 4141,
        healthy: true,
        binaryPath: null,
        error: null,
      });
    mockOpencodeStart.mockResolvedValue(4141);
    mockListSessions.mockResolvedValue([createSession('session-restore')]);
    mockLoadProviders.mockResolvedValue(undefined);

    const healthyAtRestore: boolean[] = [];
    mockRestoreSelection.mockImplementation((input?: { listedSessionIds?: Set<string> }) => {
      healthyAtRestore.push(useBackendStore.getState().opencodeHealthy);
      expect(Array.from(input?.listedSessionIds ?? [])).toEqual(['session-restore']);
    });

    renderHook(() => {
      useOpencodeLifecycle();
    });

    await waitFor(() => {
      expect(mockOpencodeStart).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useUIStore.setState({ workspacePath: '/workspace' });
    });

    await waitFor(() => {
      expect(mockRestoreSelection).toHaveBeenCalledTimes(1);
    });

    expect(mockOpencodeStart).toHaveBeenCalledTimes(1);
    expect(mockInitClient).toHaveBeenCalledWith(4141, '/workspace');
    expect(useBackendStore.getState().opencodePort).toBe(4141);
    expect(useBackendStore.getState().opencodeHealthy).toBe(true);
    expect(healthyAtRestore).toEqual([true]);
  });

  it('does not pre-warm when there is no persisted session to restore', () => {
    useBackendStore.setState({ activeBackend: 'opencode' });

    renderHook(() => {
      useOpencodeLifecycle();
    });

    expect(mockOpencodeStatus).not.toHaveBeenCalled();
    expect(mockOpencodeStart).not.toHaveBeenCalled();
  });

  it('continues startup when provider loading fails after sessions are listed', async () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    useUIStore.setState({ workspacePath: '/workspace' });

    mockOpencodeStatus.mockResolvedValue({
      running: true,
      port: 5252,
      healthy: true,
      binaryPath: null,
      error: null,
    });
    mockListSessions.mockResolvedValue([createSession('session-1')]);
    mockLoadProviders.mockRejectedValue(new Error('provider api unavailable'));

    const healthyAtRestore: boolean[] = [];
    mockRestoreSelection.mockImplementation(() => {
      healthyAtRestore.push(useBackendStore.getState().opencodeHealthy);
    });

    renderHook(() => {
      useOpencodeLifecycle();
    });

    await waitFor(() => {
      expect(mockRestoreSelection).toHaveBeenCalledTimes(1);
    });

    expect(mockOpencodeStart).not.toHaveBeenCalled();
    expect(useBackendStore.getState().opencodeHealthy).toBe(true);
    expect(healthyAtRestore).toEqual([true]);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
