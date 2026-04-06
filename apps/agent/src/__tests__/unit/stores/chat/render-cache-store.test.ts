import type { RenderCachePersistenceAdapter } from '@/stores/chat/render-cache-store';

import {
  ensureWarmedUp,
  getRenderCache,
  getRenderCacheAsync,
  removeRenderCache,
  resetRenderCacheStoreForTests,
  saveRenderCache,
  setRenderCachePersistenceAdapterForTests,
  warmMemoryCacheFromIdb,
} from '@/stores/chat/render-cache-store';

function buildCache(sessionIndex: number): {
  ranges: { k: number; v: number }[];
  messageCount: number;
  lastMessageId: string | null;
  layoutVersion: number;
  viewportWidth: number;
} {
  return {
    ranges: [{ k: sessionIndex, v: sessionIndex * 10 }],
    messageCount: sessionIndex,
    lastMessageId: `message-${String(sessionIndex)}`,
    layoutVersion: sessionIndex,
    viewportWidth: 720,
  };
}

function createPersistenceAdapter(initialEntries: Record<string, unknown> = {}): {
  adapter: RenderCachePersistenceAdapter;
  entries: Map<string, unknown>;
} {
  const entries = new Map<string, unknown>(Object.entries(initialEntries));

  return {
    entries,
    adapter: {
      load: (sessionId) => Promise.resolve(entries.get(sessionId) ?? null),
      loadAll: () => Promise.resolve([...entries.values()]),
      save: (sessionId, entry) => {
        entries.set(sessionId, structuredClone(entry));
        return Promise.resolve();
      },
      remove: (sessionId) => {
        entries.delete(sessionId);
        return Promise.resolve();
      },
    },
  };
}

describe('render-cache-store', () => {
  afterEach(() => {
    setRenderCachePersistenceAdapterForTests(null);
    resetRenderCacheStoreForTests();
  });

  it('evicts the least-recently-used memory cache after the cap is exceeded', () => {
    for (let index = 1; index <= 50; index += 1) {
      saveRenderCache(`session-${String(index)}`, buildCache(index));
    }

    saveRenderCache('session-51', buildCache(51));

    expect(getRenderCache('session-1')).toBeNull();
    expect(getRenderCache('session-2')).not.toBeNull();
    expect(getRenderCache('session-51')).toEqual(buildCache(51));
  });

  it('promotes persisted caches into memory during startup warmup', async () => {
    const { adapter } = createPersistenceAdapter({
      'session-a': {
        sessionId: 'session-a',
        schemaVersion: 1,
        accessedAt: Date.now(),
        cache: buildCache(1),
      },
    });
    setRenderCachePersistenceAdapterForTests(adapter);

    await warmMemoryCacheFromIdb();

    expect(getRenderCache('session-a')).toEqual(buildCache(1));
    expect(await getRenderCacheAsync('session-a')).toEqual(buildCache(1));
  });

  it('deletes corrupted persisted entries instead of restoring them', async () => {
    const { adapter, entries } = createPersistenceAdapter({
      'session-bad': {
        sessionId: 'session-bad',
        schemaVersion: 1,
        accessedAt: Date.now(),
        cache: {
          ranges: 'broken',
          messageCount: 1,
          lastMessageId: 'message-1',
          layoutVersion: 1,
        },
      },
    });
    setRenderCachePersistenceAdapterForTests(adapter);

    await ensureWarmedUp();

    expect(getRenderCache('session-bad')).toBeNull();
    expect(entries.has('session-bad')).toBe(false);
  });

  it('orders save and remove mutations per session so deletes win', async () => {
    const { adapter, entries } = createPersistenceAdapter();
    setRenderCachePersistenceAdapterForTests(adapter);

    saveRenderCache('session-race', buildCache(1));
    removeRenderCache('session-race');

    await ensureWarmedUp();

    expect(getRenderCache('session-race')).toBeNull();
    expect(await getRenderCacheAsync('session-race')).toBeNull();
    expect(entries.has('session-race')).toBe(false);
  });
});
