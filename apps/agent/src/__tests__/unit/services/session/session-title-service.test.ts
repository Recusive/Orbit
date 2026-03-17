import type {
  applyManualSessionTitle as applyManualSessionTitleType,
  applySessionTitle as applySessionTitleType,
  clearSessionTitleState as clearSessionTitleStateType,
  generateAITitle as generateAITitleType,
  getPreferredTitle as getPreferredTitleType,
  remapSessionTitleState as remapSessionTitleStateType,
  retryPendingPersistence as retryPendingPersistenceType,
} from '@/services/session/session-title-service';
import type { useUIStore as useUIStoreType } from '@/stores/ui/ui-store';

const { mockConversationUpdateTitle, mockGenerateSessionTitle } = vi.hoisted(() => ({
  mockConversationUpdateTitle: vi.fn<[string, string, string | undefined], Promise<boolean>>(),
  mockGenerateSessionTitle: vi.fn<(userMessage: string) => Promise<string>>(),
}));

vi.mock('@/lib/api', () => ({
  conversationUpdateTitle: mockConversationUpdateTitle,
  generateSessionTitle: mockGenerateSessionTitle,
}));

type UIStoreHook = typeof useUIStoreType;

interface LoadedModules {
  applyManualSessionTitle: typeof applyManualSessionTitleType;
  applySessionTitle: typeof applySessionTitleType;
  clearSessionTitleState: typeof clearSessionTitleStateType;
  generateAITitle: typeof generateAITitleType;
  getPreferredTitle: typeof getPreferredTitleType;
  remapSessionTitleState: typeof remapSessionTitleStateType;
  retryPendingPersistence: typeof retryPendingPersistenceType;
  useUIStore: UIStoreHook;
}

function seedConversation(useUIStore: UIStoreHook, sessionId: string, title = 'Untitled'): void {
  useUIStore.setState(
    {
      ...useUIStore.getState(),
      conversations: [
        {
          sessionId,
          title,
          updatedAt: Date.now(),
          messageCount: 0,
        },
      ],
      activeConversationId: sessionId,
      activeConversationTitle: title,
    },
    false
  );
}

function getConversationTitle(useUIStore: UIStoreHook, sessionId: string): string | undefined {
  return useUIStore
    .getState()
    .conversations.find((conversation) => conversation.sessionId === sessionId)?.title;
}

function isSessionTitleLoading(useUIStore: UIStoreHook, sessionId: string): boolean {
  return useUIStore.getState().titleLoadingSessions.has(sessionId);
}

async function loadModules(): Promise<LoadedModules> {
  const { useUIStore } = await import('@/stores/ui/ui-store');
  useUIStore.setState(useUIStore.getInitialState(), true);

  const service = await import('@/services/session/session-title-service');

  return {
    ...service,
    useUIStore,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('generateAITitle', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConversationUpdateTitle.mockReset();
    mockGenerateSessionTitle.mockReset();
    mockConversationUpdateTitle.mockResolvedValue(true);
  });

  it('preserves the fallback title when generation fails and allows a retry', async () => {
    const { applySessionTitle, generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('Recovered Title');

    applySessionTitle('session-1', 'Fallback Title');
    mockConversationUpdateTitle.mockClear();

    generateAITitle('session-1', 'help me debug');
    await flushAsync();

    expect(getConversationTitle(useUIStore, 'session-1')).toBe('Fallback Title');
    expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);

    generateAITitle('session-1', 'help me debug');
    await flushAsync();

    expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(2);
    expect(getConversationTitle(useUIStore, 'session-1')).toBe('Recovered Title');
  });

  it('sets loading on generateAITitle and clears it on success', async () => {
    const { generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');

    generateAITitle('session-1', 'hello');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(true);

    await flushAsync();

    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(false);
    expect(getConversationTitle(useUIStore, 'session-1')).toBe('AI Title');
  });

  it('clears loading when AI title generation fails', async () => {
    const { generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

    generateAITitle('session-1', 'hello');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(true);

    await flushAsync();

    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(false);
    expect(getConversationTitle(useUIStore, 'session-1')).toBe('Untitled');
  });

  it('blocks duplicate generation after a successful title', async () => {
    const { generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-2');

    mockGenerateSessionTitle.mockResolvedValue('Good Title');

    generateAITitle('session-2', 'explain the failing build');
    generateAITitle('session-2', 'explain the failing build');
    await flushAsync();

    generateAITitle('session-2', 'explain the failing build');
    await flushAsync();

    expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);
    expect(getConversationTitle(useUIStore, 'session-2')).toBe('Good Title');
  });

  it('discards a stale AI completion after a manual rename', async () => {
    const { applyManualSessionTitle, generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    const deferred = createDeferred<string>();
    mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

    generateAITitle('session-1', 'hello');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(true);

    const renamePromise = applyManualSessionTitle('session-1', 'My Custom Title');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(false);
    await renamePromise;

    deferred.resolve('AI Title');
    await flushAsync();

    expect(getConversationTitle(useUIStore, 'session-1')).toBe('My Custom Title');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(false);
  });

  it('transfers loading state across a session remap while a title is in flight', async () => {
    const { generateAITitle, remapSessionTitleState, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-old');

    const deferred = createDeferred<string>();
    mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

    generateAITitle('session-old', 'hello');
    expect(isSessionTitleLoading(useUIStore, 'session-old')).toBe(true);

    useUIStore.getState().remapConversation('session-old', 'session-new');
    remapSessionTitleState('session-old', 'session-new');

    expect(isSessionTitleLoading(useUIStore, 'session-old')).toBe(false);
    expect(isSessionTitleLoading(useUIStore, 'session-new')).toBe(true);

    deferred.resolve('Remapped Title');
    await flushAsync();

    expect(getConversationTitle(useUIStore, 'session-new')).toBe('Remapped Title');
    expect(isSessionTitleLoading(useUIStore, 'session-new')).toBe(false);
  });
});

describe('session title persistence state', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConversationUpdateTitle.mockReset();
    mockGenerateSessionTitle.mockReset();
    mockConversationUpdateTitle.mockResolvedValue(true);
  });

  it('exposes the freshest title until a successful persist clears it', async () => {
    const { applySessionTitle, getPreferredTitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    const deferred = createDeferred<boolean>();
    mockConversationUpdateTitle.mockReturnValueOnce(deferred.promise);

    applySessionTitle('session-1', 'Fresh Title');

    expect(getPreferredTitle('session-1')).toBe('Fresh Title');

    deferred.resolve(true);
    await flushAsync();

    expect(getPreferredTitle('session-1')).toBeUndefined();
  });

  it('retries deferred persists and clears the preferred title once disk catches up', async () => {
    const { applySessionTitle, getPreferredTitle, retryPendingPersistence, useUIStore } =
      await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockConversationUpdateTitle.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    applySessionTitle('session-1', 'Retry Title');
    await flushAsync();

    expect(getPreferredTitle('session-1')).toBe('Retry Title');

    retryPendingPersistence('session-1');
    await flushAsync();

    expect(mockConversationUpdateTitle).toHaveBeenNthCalledWith(
      1,
      'session-1',
      'Retry Title',
      undefined
    );
    expect(mockConversationUpdateTitle).toHaveBeenNthCalledWith(
      2,
      'session-1',
      'Retry Title',
      undefined
    );
    expect(getPreferredTitle('session-1')).toBeUndefined();
  });

  it('does not issue duplicate retry persists while a retry is already in flight', async () => {
    const { applySessionTitle, retryPendingPersistence, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    const retryPersist = createDeferred<boolean>();
    mockConversationUpdateTitle
      .mockResolvedValueOnce(false)
      .mockReturnValueOnce(retryPersist.promise);

    applySessionTitle('session-1', 'Retry Title');
    await flushAsync();

    retryPendingPersistence('session-1');
    retryPendingPersistence('session-1');

    expect(mockConversationUpdateTitle).toHaveBeenCalledTimes(2);

    retryPersist.resolve(true);
    await flushAsync();
  });

  it('tracks preferred titles across session remaps', async () => {
    const { applySessionTitle, getPreferredTitle, remapSessionTitleState, useUIStore } =
      await loadModules();
    seedConversation(useUIStore, 'session-old');

    mockConversationUpdateTitle.mockResolvedValueOnce(false);

    applySessionTitle('session-old', 'Mapped Title');
    await flushAsync();

    useUIStore.getState().remapConversation('session-old', 'session-new');
    remapSessionTitleState('session-old', 'session-new');

    expect(getPreferredTitle('session-new')).toBe('Mapped Title');
  });

  it('applyManualSessionTitle rejects backend errors and clears preferred title state', async () => {
    const { applyManualSessionTitle, getPreferredTitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockConversationUpdateTitle.mockRejectedValueOnce(new Error('boom'));

    await expect(applyManualSessionTitle('session-1', 'Manual Title')).rejects.toThrow('boom');
    expect(getPreferredTitle('session-1')).toBeUndefined();
  });

  it('blocks future AI retries after a manual rename following an AI failure', async () => {
    const { applyManualSessionTitle, generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

    generateAITitle('session-1', 'hello');
    await flushAsync();

    await applyManualSessionTitle('session-1', 'My Custom Title');

    mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');
    generateAITitle('session-1', 'hello');
    await flushAsync();

    expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);
    expect(getConversationTitle(useUIStore, 'session-1')).toBe('My Custom Title');
  });

  it('allows AI retry after a manual rename fails to persist', async () => {
    const { applyManualSessionTitle, generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

    generateAITitle('session-1', 'hello');
    await flushAsync();

    mockConversationUpdateTitle.mockRejectedValueOnce(new Error('disk full'));
    await expect(applyManualSessionTitle('session-1', 'My Title')).rejects.toThrow('disk full');

    mockGenerateSessionTitle.mockResolvedValueOnce('AI Recovery Title');
    generateAITitle('session-1', 'hello');
    await flushAsync();

    expect(getConversationTitle(useUIStore, 'session-1')).toBe('AI Recovery Title');
  });

  it('keeps the session settled when a failed rename follows a successful AI title', async () => {
    const { applyManualSessionTitle, generateAITitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');

    generateAITitle('session-1', 'hello');
    await flushAsync();

    mockConversationUpdateTitle.mockRejectedValueOnce(new Error('disk full'));
    await expect(applyManualSessionTitle('session-1', 'Manual Title')).rejects.toThrow('disk full');

    mockGenerateSessionTitle.mockResolvedValueOnce('AI Replacement');
    generateAITitle('session-1', 'hello');
    await flushAsync();

    expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);
    expect(getConversationTitle(useUIStore, 'session-1')).toBe('Manual Title');
  });

  it('clearSessionTitleState removes remap aliases so old session IDs can be reused', async () => {
    const { applySessionTitle, clearSessionTitleState, remapSessionTitleState, useUIStore } =
      await loadModules();
    seedConversation(useUIStore, 'session-old');

    mockConversationUpdateTitle.mockResolvedValue(false);

    applySessionTitle('session-old', 'First Title');
    await flushAsync();

    useUIStore.getState().remapConversation('session-old', 'session-new');
    remapSessionTitleState('session-old', 'session-new');
    clearSessionTitleState('session-new');

    seedConversation(useUIStore, 'session-old');
    mockConversationUpdateTitle.mockClear();

    applySessionTitle('session-old', 'Reused Title');
    await flushAsync();

    expect(getConversationTitle(useUIStore, 'session-old')).toBe('Reused Title');
    expect(mockConversationUpdateTitle).toHaveBeenCalledWith(
      'session-old',
      'Reused Title',
      undefined
    );
  });

  it('does not clear title state on the first null to path workspace transition', async () => {
    const { applySessionTitle, getPreferredTitle, useUIStore } = await loadModules();
    seedConversation(useUIStore, 'session-1');

    mockConversationUpdateTitle.mockResolvedValue(false);

    applySessionTitle('session-1', 'Bootstrap Title');
    await flushAsync();

    useUIStore.getState().initializeWorkspace('/workspace-a');

    expect(getPreferredTitle('session-1')).toBe('Bootstrap Title');
  });

  it('clears title state when switching from one workspace path to another', async () => {
    const { applySessionTitle, getPreferredTitle, useUIStore } = await loadModules();

    useUIStore.setState(
      {
        ...useUIStore.getState(),
        workspacePath: '/workspace-a',
      },
      false
    );

    mockConversationUpdateTitle.mockResolvedValue(false);

    applySessionTitle('session-1', 'Workspace Title');
    await flushAsync();

    useUIStore.getState().initializeWorkspace('/workspace-b');

    expect(getPreferredTitle('session-1')).toBeUndefined();
  });

  it('clears title loading when switching workspaces during an in-flight AI title', async () => {
    const { generateAITitle, useUIStore } = await loadModules();

    useUIStore.setState(
      {
        ...useUIStore.getState(),
        workspacePath: '/workspace-a',
      },
      false
    );

    seedConversation(useUIStore, 'session-1');

    const deferred = createDeferred<string>();
    mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

    generateAITitle('session-1', 'hello');
    expect(isSessionTitleLoading(useUIStore, 'session-1')).toBe(true);

    useUIStore.getState().initializeWorkspace('/workspace-b');

    expect(useUIStore.getState().titleLoadingSessions.size).toBe(0);

    deferred.resolve('Late Title');
    await flushAsync();

    expect(useUIStore.getState().titleLoadingSessions.size).toBe(0);
  });
});
