/**
 * Streamdown Render Cache — dual-layer cache (memory Map + IndexedDB) for
 * pre-rendered message segment HTML and pixel heights.
 *
 * ── Write-Through Pattern ───────────────────────────────────────────────
 * FlowTokenSegment renders Streamdown normally, then after Shiki settles,
 * captures its own innerHTML + height and writes to this cache. The next
 * time TanStack Virtual remounts the same item, the cache hit injects HTML
 * via dangerouslySetInnerHTML (~0.05ms vs ~1.5ms live render).
 *
 * ── Key Design: Content Hash ────────────────────────────────────────────
 * Cache is keyed by `contentHash` (djb2 of the segment text), NOT by
 * messageId. This handles multi-segment messages correctly: each
 * FlowTokenSegment gets its own cache entry by its own text hash.
 * Same text in different messages shares cache entries (dedup).
 *
 * ── Cache Invalidation ──────────────────────────────────────────────────
 * Each entry stores the viewport width at render time. On lookup, width
 * is validated (16px tolerance). Window resize beyond tolerance = miss.
 * ────────────────────────────────────────────────────────────────────────
 */
import { createLogger } from '@orbit/common/lib';

import { markOperation } from '@/lib/perf/frame-monitor';

const logger = createLogger('StreamdownCache');

// ── Constants ──────────────────────────────────────────────────────────

const DB_NAME = 'orbit-streamdown-cache';
// v3: reset after switching to settle-gated snapshots. Old v2 entries could
// include pre-Shiki placeholder heights, causing positioning errors on revisit.
const DB_VERSION = 3;
const STORE_NAME = 'html-cache';
const MAX_MEMORY_ENTRIES = 2000;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VIEWPORT_WIDTH_TOLERANCE_PX = 16;

// ── Types ──────────────────────────────────────────────────────────────

export interface StreamdownCacheEntry {
  /** Pre-rendered innerHTML from Streamdown + Shiki. */
  html: string;
  /** Exact pixel height from getBoundingClientRect. */
  height: number;
  /** Viewport width at render time — heights depend on text wrapping. */
  viewportWidth: number;
  /** Timestamp for age-based eviction from IndexedDB. */
  cachedAt: number;
}

interface PersistedCacheEntry extends StreamdownCacheEntry {
  /** Primary key for IndexedDB (stringified content hash). */
  hashKey: string;
}

// ── Content Hashing ────────────────────────────────────────────────────

/**
 * djb2 string hash — fast, non-cryptographic, good distribution.
 * Used as the cache key for segment text.
 */
export function hashContent(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // unsigned 32-bit
}

// ── Memory Layer ───────────────────────────────────────────────────────

const memoryCache = new Map<number, StreamdownCacheEntry>();
const accessOrder: number[] = [];

function touchLru(key: number): void {
  const idx = accessOrder.indexOf(key);
  if (idx >= 0) {
    accessOrder.splice(idx, 1);
  }
  accessOrder.push(key);

  while (accessOrder.length > MAX_MEMORY_ENTRIES) {
    const evicted = accessOrder.shift();
    if (evicted !== undefined) {
      memoryCache.delete(evicted);
    }
  }
}

function isWidthCompatible(cachedWidth: number, currentWidth: number): boolean {
  return Math.abs(cachedWidth - currentWidth) <= VIEWPORT_WIDTH_TOLERANCE_PX;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Look up a cached entry by content hash. Returns null on miss or if
 * the viewport width doesn't match.
 */
export function getStreamdownCache(
  contentHash: number,
  viewportWidth: number
): StreamdownCacheEntry | null {
  const entry = memoryCache.get(contentHash);
  if (entry === undefined) {
    return null;
  }

  if (!isWidthCompatible(entry.viewportWidth, viewportWidth)) {
    return null;
  }

  touchLru(contentHash);
  return entry;
}

/**
 * Check if a valid cache entry exists.
 */
export function hasStreamdownCache(contentHash: number, viewportWidth: number): boolean {
  return getStreamdownCache(contentHash, viewportWidth) !== null;
}

/**
 * Store a rendered entry in both memory and IndexedDB.
 */
export function setStreamdownCache(contentHash: number, entry: StreamdownCacheEntry): void {
  const end = markOperation('sd-cache-set');
  memoryCache.set(contentHash, entry);
  touchLru(contentHash);
  end();

  persistToIdb(contentHash, entry);
}

/**
 * Invalidate all entries whose viewport width doesn't match the current
 * width. Called when the window resizes beyond the tolerance threshold.
 */
export function invalidateForViewportWidth(currentWidth: number): number {
  const end = markOperation('sd-cache-invalidate-width');
  let invalidated = 0;

  for (const [key, entry] of memoryCache) {
    if (!isWidthCompatible(entry.viewportWidth, currentWidth)) {
      memoryCache.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx >= 0) {
        accessOrder.splice(idx, 1);
      }
      removeFromIdb(key);
      invalidated++;
    }
  }

  end();
  if (invalidated > 0) {
    logger.debug('Invalidated entries for viewport width change', {
      invalidated,
      currentWidth,
    });
  }
  return invalidated;
}

/**
 * Bulk-load entries from IndexedDB into memory.
 * Called during session hydration to warm the cache.
 */
export async function warmStreamdownCache(): Promise<number> {
  const end = markOperation('sd-cache-warm');

  let loaded = 0;
  const db = await openDb();
  if (db === null) {
    end();
    return 0;
  }

  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const now = Date.now();

  const raw = await requestToPromise<PersistedCacheEntry[]>(
    store.getAll() as IDBRequest<PersistedCacheEntry[]>
  );

  for (const entry of raw) {
    if (now - entry.cachedAt > MAX_CACHE_AGE_MS) continue;

    const key = parseInt(entry.hashKey, 10);
    if (Number.isNaN(key)) continue;
    if (memoryCache.has(key)) continue;

    memoryCache.set(key, {
      html: entry.html,
      height: entry.height,
      viewportWidth: entry.viewportWidth,
      cachedAt: entry.cachedAt,
    });
    touchLru(key);
    loaded++;
  }

  end();

  if (loaded > 0) {
    logger.info('[SD-CACHE] Warmed from IndexedDB', { loaded, total: memoryCache.size });
  }

  return loaded;
}

/**
 * Get the number of entries currently in the memory cache.
 */
export function getStreamdownCacheSize(): number {
  return memoryCache.size;
}

// ── IndexedDB Layer ────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  if (dbPromise !== null) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (): void => {
        const db = request.result;
        // Drop the old store (v1 used keyPath: 'messageId') and recreate
        // with the new keyPath. Cached data is rebuilt from live renders.
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        db.createObjectStore(STORE_NAME, { keyPath: 'hashKey' });
      };
      request.onsuccess = (): void => {
        resolve(request.result);
      };
      request.onerror = (): void => {
        logger.warn('Failed to open streamdown cache IndexedDB', {
          error: request.error?.message ?? 'Unknown error',
        });
        resolve(null);
      };
    } catch (error: unknown) {
      logger.warn('IndexedDB unavailable for streamdown cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      resolve(null);
    }
  });

  return dbPromise;
}

function requestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function persistToIdb(contentHash: number, entry: StreamdownCacheEntry): void {
  void (async () => {
    try {
      const db = await openDb();
      if (db === null) return;

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const persisted: PersistedCacheEntry = {
        ...entry,
        hashKey: String(contentHash),
      };
      tx.objectStore(STORE_NAME).put(persisted);
    } catch (error: unknown) {
      logger.warn('Failed to persist streamdown cache entry', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })();
}

function removeFromIdb(contentHash: number): void {
  void (async () => {
    try {
      const db = await openDb();
      if (db === null) return;

      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(String(contentHash));
    } catch {
      // Best-effort removal
    }
  })();
}

// ── Test Utilities ─────────────────────────────────────────────────────

export function resetStreamdownCacheForTests(): void {
  memoryCache.clear();
  accessOrder.length = 0;
  dbPromise = null;
}
