import type { ChatMeasurementCache } from '@/stores/chat/chat-store';
import type { RenderCachePersistenceAdapter } from '@/stores/chat/render-cache-store';

import {
  buildMeasurementSizeMap,
  ensureWarmedUp,
  getRenderCache,
  getRenderCacheAsync,
  isChatMeasurementCache,
  isExactMeasurementCache,
  preloadRenderCacheFromIdb,
  removeRenderCache,
  resetRenderCacheStoreForTests,
  saveRenderCache,
  setRenderCachePersistenceAdapterForTests,
  warmMemoryCacheFromIdb,
} from '@/stores/chat/render-cache-store';

function buildCache(sessionIndex: number): ChatMeasurementCache {
  return {
    measurements: [
      {
        key: `width:720:session-${String(sessionIndex)}:message-${String(sessionIndex)}`,
        index: 0,
        start: 0,
        size: sessionIndex * 10,
        end: sessionIndex * 10,
        lane: 0,
      },
    ],
    messageCount: sessionIndex,
    lastMessageId: `message-${String(sessionIndex)}`,
    layoutVersion: sessionIndex,
    viewportWidth: 720,
  };
}

function buildMeasurementCache(messageCount: number): ChatMeasurementCache {
  return {
    measurements: Array.from({ length: messageCount }, (_value, index) => ({
      key: `width:720:session-a:message-${String(index + 1)}`,
      index,
      start: index * 120,
      size: 120,
      end: (index + 1) * 120,
      lane: 0,
    })),
    messageCount,
    lastMessageId: messageCount > 0 ? `message-${String(messageCount)}` : null,
    layoutVersion: messageCount,
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
        kind: 'tanstack-v2',
        sessionId: 'session-a',
        accessedAt: Date.now(),
        cache: buildCache(1),
      },
    });
    setRenderCachePersistenceAdapterForTests(adapter);

    await warmMemoryCacheFromIdb();

    expect(getRenderCache('session-a')).toEqual(buildCache(1));
    expect(await getRenderCacheAsync('session-a')).toEqual(buildCache(1));
  });

  it('preloads persisted measurement caches directly from persistence for hover warmup', async () => {
    const { adapter } = createPersistenceAdapter({
      'session-hover': {
        kind: 'tanstack-v2',
        sessionId: 'session-hover',
        accessedAt: Date.now(),
        cache: buildCache(3),
      },
    });
    setRenderCachePersistenceAdapterForTests(adapter);

    await expect(preloadRenderCacheFromIdb('session-hover')).resolves.toEqual(buildCache(3));
    expect(getRenderCache('session-hover')).toEqual(buildCache(3));
  });

  it('deletes corrupted persisted entries instead of restoring them', async () => {
    const { adapter, entries } = createPersistenceAdapter({
      'session-bad': {
        kind: 'tanstack-v2',
        sessionId: 'session-bad',
        accessedAt: Date.now(),
        cache: {
          measurements: 'broken',
          messageCount: 1,
          lastMessageId: 'message-1',
          layoutVersion: 1,
          viewportWidth: null,
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

  it('rejects invalid tanstack measurement cache payloads', () => {
    const raw = {
      kind: 'tanstack-v2' as const,
      sessionId: 'session-a',
      cache: {
        ...buildMeasurementCache(2),
        measurements: [
          {
            key: 'width:720:session-a:message-1',
            index: -1,
            start: 0,
            size: 120,
            end: 120,
            lane: 0,
          },
        ],
      },
      accessedAt: Date.now(),
    };

    expect(isChatMeasurementCache(raw.cache)).toBe(false);
  });

  it('validates exact measurement caches with row-count and width guards', () => {
    const cache = buildMeasurementCache(2);
    const session = {
      layoutVersion: 2,
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
    };

    expect(isExactMeasurementCache(session, cache, 2, 728)).toBe(true);
    expect(isExactMeasurementCache(session, cache, 3, 728)).toBe(false);
    expect(isExactMeasurementCache(session, cache, 2, 760)).toBe(false);
    expect(buildMeasurementSizeMap(cache).get('width:720:session-a:message-2')).toBe(120);
  });

  it('accepts caches with only estimated measurements as exact', () => {
    const cache = buildMeasurementCache(2);
    // All measurements are estimates (no measured flag) — still faster
    // than calling estimateSize() per item from scratch
    const session = {
      layoutVersion: 2,
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
    };

    expect(isExactMeasurementCache(session, cache, 2, 728)).toBe(true);
  });

  it('rejects vacuous zero-row exact measurement restores', () => {
    const cache = buildMeasurementCache(0);
    const session = {
      layoutVersion: 0,
      messages: [] as { id: string }[],
    };

    expect(isExactMeasurementCache(session, cache, 0, 720)).toBe(false);
  });
});
