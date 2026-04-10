import { createLogger } from '@orbit/common/lib';

import type { ChatMeasurementCache, PersistedMeasurement } from './chat-store';

const logger = createLogger('RenderCacheStore');

const MAX_CACHED_SESSIONS = 50;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DB_NAME = 'orbit-render-cache';
const DB_VERSION = 2;
const STORE_NAME = 'size-caches';
const TANSTACK_RENDER_CACHE_KIND = 'tanstack-v2';
const VIEWPORT_WIDTH_TOLERANCE_PX = 16;

interface PersistedEntry {
  kind: typeof TANSTACK_RENDER_CACHE_KIND;
  sessionId: string;
  cache: ChatMeasurementCache;
  accessedAt: number;
}

export interface RenderCachePersistenceAdapter {
  load: (sessionId: string) => Promise<unknown>;
  loadAll: () => Promise<unknown[]>;
  save: (sessionId: string, entry: PersistedEntry) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
}

const cache = new Map<string, ChatMeasurementCache>();
const accessOrder: string[] = [];
const sessionMutationQueue = new Map<string, Promise<void>>();

let warmupPromise: Promise<void> | null = null;
let persistenceAdapterOverride: RenderCachePersistenceAdapter | null = null;
let indexedDbAdapter: RenderCachePersistenceAdapter | null = null;

function buildErrorMeta(error: unknown): { error: string } {
  if (error instanceof Error) {
    return { error: error.message };
  }
  if (typeof error === 'string') {
    return { error };
  }

  return { error: 'Unknown error' };
}

function clonePersistedMeasurement(measurement: PersistedMeasurement): PersistedMeasurement {
  const clone: PersistedMeasurement = {
    key: measurement.key,
    index: measurement.index,
    start: measurement.start,
    size: measurement.size,
    end: measurement.end,
    lane: measurement.lane,
  };
  if (measurement.measured !== undefined) {
    clone.measured = measurement.measured;
  }
  return clone;
}

function cloneMeasurementCache(cacheEntry: ChatMeasurementCache): ChatMeasurementCache {
  return {
    measurements: cacheEntry.measurements.map(clonePersistedMeasurement),
    messageCount: cacheEntry.messageCount,
    lastMessageId: cacheEntry.lastMessageId,
    layoutVersion: cacheEntry.layoutVersion,
    viewportWidth: cacheEntry.viewportWidth,
  };
}

function touchLru(sessionId: string): void {
  const index = accessOrder.indexOf(sessionId);
  if (index >= 0) {
    accessOrder.splice(index, 1);
  }
  accessOrder.push(sessionId);

  while (accessOrder.length > MAX_CACHED_SESSIONS) {
    const oldest = accessOrder.shift();
    if (!oldest) {
      continue;
    }

    cache.delete(oldest);
    logger.debug('Evicted memory render cache', {
      sessionId: oldest.slice(-6),
    });
  }
}

function setMemoryCache(sessionId: string, measurementCache: ChatMeasurementCache): void {
  cache.set(sessionId, cloneMeasurementCache(measurementCache));
  touchLru(sessionId);
}

function removeMemoryCache(sessionId: string): void {
  cache.delete(sessionId);

  const index = accessOrder.indexOf(sessionId);
  if (index >= 0) {
    accessOrder.splice(index, 1);
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPersistedMeasurement(value: unknown): value is PersistedMeasurement {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    key?: unknown;
    index?: unknown;
    start?: unknown;
    size?: unknown;
    end?: unknown;
    lane?: unknown;
  };

  return (
    typeof candidate.key === 'string' &&
    isNonNegativeInteger(candidate.index) &&
    isNonNegativeFiniteNumber(candidate.start) &&
    isNonNegativeFiniteNumber(candidate.size) &&
    isNonNegativeFiniteNumber(candidate.end) &&
    isNonNegativeInteger(candidate.lane)
  );
}

export function isChatMeasurementCache(value: unknown): value is ChatMeasurementCache {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    measurements?: unknown;
    messageCount?: unknown;
    lastMessageId?: unknown;
    layoutVersion?: unknown;
    viewportWidth?: unknown;
  };

  return (
    Array.isArray(candidate.measurements) &&
    candidate.measurements.every(isPersistedMeasurement) &&
    isNonNegativeInteger(candidate.messageCount) &&
    (candidate.lastMessageId === null || typeof candidate.lastMessageId === 'string') &&
    isNonNegativeInteger(candidate.layoutVersion) &&
    (candidate.viewportWidth === null || isNonNegativeFiniteNumber(candidate.viewportWidth))
  );
}

function parsePersistedEntry(raw: unknown): PersistedEntry | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as {
    kind?: unknown;
    sessionId?: unknown;
    accessedAt?: unknown;
    cache?: unknown;
  };
  if (
    candidate.kind !== TANSTACK_RENDER_CACHE_KIND ||
    typeof candidate.sessionId !== 'string' ||
    !isNonNegativeFiniteNumber(candidate.accessedAt)
  ) {
    return null;
  }

  const cacheCandidate = candidate.cache;
  if (
    cacheCandidate === null ||
    cacheCandidate === undefined ||
    typeof cacheCandidate !== 'object'
  ) {
    return null;
  }

  if (!isChatMeasurementCache(cacheCandidate)) {
    return null;
  }

  return {
    kind: TANSTACK_RENDER_CACHE_KIND,
    sessionId: candidate.sessionId,
    accessedAt: candidate.accessedAt,
    cache: cloneMeasurementCache(cacheCandidate),
  };
}

function isMeasurementViewportWidthCompatible(
  cacheEntry: ChatMeasurementCache,
  viewportWidth: number | null
): boolean {
  if (cacheEntry.viewportWidth === null || viewportWidth === null) {
    return true;
  }

  return Math.abs(cacheEntry.viewportWidth - viewportWidth) <= VIEWPORT_WIDTH_TOLERANCE_PX;
}

export function isExactMeasurementCache(
  session: {
    layoutVersion: number;
    messages: readonly { id: string }[];
  },
  cacheEntry: ChatMeasurementCache,
  virtualizedRowCount: number,
  viewportWidth: number | null
): boolean {
  if (virtualizedRowCount === 0) {
    return false;
  }

  const layoutMatch = cacheEntry.layoutVersion === session.layoutVersion;
  const countMatch = cacheEntry.messageCount === session.messages.length;
  const lastIdMatch = cacheEntry.lastMessageId === (session.messages.at(-1)?.id ?? null);
  // Check that the cache covers every virtualized row. Entries may be either
  // pixel-perfect (measured: true) or gap-filled estimates — both are vastly
  // faster than calling estimateSize() per item from scratch.
  const sizeMatch = cacheEntry.measurements.length >= virtualizedRowCount;
  const widthMatch = isMeasurementViewportWidthCompatible(cacheEntry, viewportWidth);
  return layoutMatch && countMatch && lastIdMatch && sizeMatch && widthMatch;
}

export function buildMeasurementSizeMap(cacheEntry: ChatMeasurementCache): Map<string, number> {
  return new Map(cacheEntry.measurements.map((measurement) => [measurement.key, measurement.size]));
}

function isExpired(entry: PersistedEntry): boolean {
  return Date.now() - entry.accessedAt > MAX_CACHE_AGE_MS;
}

function requestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

function createIndexedDbAdapter(): RenderCachePersistenceAdapter {
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  function openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }

    if (dbPromise !== null) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
            return;
          }

          // DB_VERSION=2 keeps the existing store intact. Old v1 entries are
          // allowed to age out naturally and parse as misses.
          if (event.oldVersion < 2) {
            return;
          }
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          logger.warn(
            'Failed to open render cache IndexedDB',
            buildErrorMeta(request.error?.message ?? 'Unknown IndexedDB error')
          );
          resolve(null);
        };
      } catch (error: unknown) {
        logger.warn('IndexedDB unavailable for render cache persistence', buildErrorMeta(error));
        resolve(null);
      }
    });

    return dbPromise;
  }

  return {
    load: async (sessionId) => {
      const db = await openDb();
      if (!db) {
        return null;
      }

      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(sessionId) as IDBRequest<unknown>;
      return await requestToPromise(request);
    },
    loadAll: async () => {
      const db = await openDb();
      if (!db) {
        return [];
      }

      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<unknown[]>;
      return await requestToPromise(request);
    },
    save: async (sessionId, entry) => {
      const db = await openDb();
      if (!db) {
        return;
      }

      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({
        ...entry,
        sessionId,
      });
      await transactionDone(transaction);
    },
    remove: async (sessionId) => {
      const db = await openDb();
      if (!db) {
        return;
      }

      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(sessionId);
      await transactionDone(transaction);
    },
  };
}

function getPersistenceAdapter(): RenderCachePersistenceAdapter {
  if (persistenceAdapterOverride) {
    return persistenceAdapterOverride;
  }

  indexedDbAdapter ??= createIndexedDbAdapter();
  return indexedDbAdapter;
}

function getQueuedMutation(sessionId: string): Promise<void> {
  return sessionMutationQueue.get(sessionId) ?? Promise.resolve();
}

function queueSessionMutation(sessionId: string, task: () => Promise<void>): Promise<void> {
  const previous = sessionMutationQueue.get(sessionId) ?? Promise.resolve();
  const next = (() => {
    const queued = previous
      .catch(() => undefined)
      .then(task)
      .catch((error: unknown) => {
        logger.warn('Render cache persistence mutation failed', {
          sessionId: sessionId.slice(-6),
          ...buildErrorMeta(error),
        });
      })
      .finally(() => {
        if (sessionMutationQueue.get(sessionId) === queued) {
          sessionMutationQueue.delete(sessionId);
        }
      });

    return queued;
  })();

  sessionMutationQueue.set(sessionId, next);
  return next;
}

async function waitForAllQueuedMutations(): Promise<void> {
  const pending = [...sessionMutationQueue.values()];
  if (pending.length === 0) {
    return;
  }

  await Promise.all(pending.map((entry) => entry.catch(() => undefined)));
}

function persistToIdb(sessionId: string, measurementCache: ChatMeasurementCache): void {
  const entry: PersistedEntry = {
    kind: TANSTACK_RENDER_CACHE_KIND,
    sessionId,
    cache: cloneMeasurementCache(measurementCache),
    accessedAt: Date.now(),
  };

  void queueSessionMutation(sessionId, async () => {
    await getPersistenceAdapter().save(sessionId, entry);
  });
}

function removeFromIdb(sessionId: string): void {
  void queueSessionMutation(sessionId, async () => {
    await getPersistenceAdapter().remove(sessionId);
  });
}

async function prunePersistedSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) {
    return;
  }

  await Promise.all(
    sessionIds.map((sessionId) =>
      queueSessionMutation(sessionId, async () => {
        await getPersistenceAdapter().remove(sessionId);
      })
    )
  );
}

export function saveRenderCache(sessionId: string, measurementCache: ChatMeasurementCache): void {
  setMemoryCache(sessionId, measurementCache);
  persistToIdb(sessionId, measurementCache);
  logger.debug('Saved render cache', {
    sessionId: sessionId.slice(-6),
    measurementCount: measurementCache.measurements.length,
    messageCount: measurementCache.messageCount,
    viewportWidth: measurementCache.viewportWidth ?? null,
  });
}

export function getRenderCache(sessionId: string): ChatMeasurementCache | null {
  const entry = cache.get(sessionId);
  if (!entry) {
    return null;
  }

  touchLru(sessionId);
  return cloneMeasurementCache(entry);
}

export async function preloadRenderCacheFromIdb(
  sessionId: string
): Promise<ChatMeasurementCache | null> {
  const existing = getRenderCache(sessionId);
  if (existing) {
    return existing;
  }

  await getQueuedMutation(sessionId).catch(() => undefined);
  const raw = await getPersistenceAdapter().load(sessionId);
  if (raw === null || raw === undefined) {
    return null;
  }

  const entry = parsePersistedEntry(raw);
  if (!entry || isExpired(entry)) {
    removeFromIdb(sessionId);
    return null;
  }

  setMemoryCache(sessionId, entry.cache);
  persistToIdb(sessionId, entry.cache);
  return cloneMeasurementCache(entry.cache);
}

async function warmMemoryCacheFromIdbInternal(): Promise<void> {
  await waitForAllQueuedMutations();

  const rawEntries = await getPersistenceAdapter().loadAll();
  const validEntries: PersistedEntry[] = [];
  const staleSessionIds: string[] = [];

  for (const rawEntry of rawEntries) {
    const entry = parsePersistedEntry(rawEntry);
    if (!entry) {
      const sessionId =
        rawEntry !== null && typeof rawEntry === 'object' && 'sessionId' in rawEntry
          ? (rawEntry as { sessionId?: unknown }).sessionId
          : null;
      if (typeof sessionId === 'string') {
        staleSessionIds.push(sessionId);
      }
      continue;
    }

    if (isExpired(entry)) {
      staleSessionIds.push(entry.sessionId);
      continue;
    }

    validEntries.push(entry);
  }

  validEntries.sort((left, right) => right.accessedAt - left.accessedAt);
  const survivors = validEntries.slice(0, MAX_CACHED_SESSIONS);
  const overflow = validEntries.slice(MAX_CACHED_SESSIONS).map((entry) => entry.sessionId);

  for (const entry of [...survivors].reverse()) {
    if (cache.has(entry.sessionId)) {
      continue;
    }
    setMemoryCache(entry.sessionId, entry.cache);
  }

  await prunePersistedSessions([...new Set([...staleSessionIds, ...overflow])]);
}

export function warmMemoryCacheFromIdb(): Promise<void> {
  warmupPromise ??= warmMemoryCacheFromIdbInternal().catch((error: unknown) => {
    logger.warn('Failed to warm render cache from IndexedDB', buildErrorMeta(error));
  });

  return warmupPromise;
}

export function ensureWarmedUp(): Promise<void> {
  return warmMemoryCacheFromIdb();
}

export async function getRenderCacheAsync(sessionId: string): Promise<ChatMeasurementCache | null> {
  const memoryEntry = getRenderCache(sessionId);
  if (memoryEntry) {
    return memoryEntry;
  }

  await ensureWarmedUp();
  const warmedEntry = getRenderCache(sessionId);
  if (warmedEntry) {
    return warmedEntry;
  }

  return preloadRenderCacheFromIdb(sessionId);
}

export function removeRenderCache(sessionId: string): void {
  removeMemoryCache(sessionId);
  removeFromIdb(sessionId);
}

export function setRenderCachePersistenceAdapterForTests(
  adapter: RenderCachePersistenceAdapter | null
): void {
  persistenceAdapterOverride = adapter;
  indexedDbAdapter = null;
  warmupPromise = null;
}

export function resetRenderCacheStoreForTests(): void {
  cache.clear();
  accessOrder.length = 0;
  warmupPromise = null;
  persistenceAdapterOverride = null;
  indexedDbAdapter = null;
  sessionMutationQueue.clear();
}
