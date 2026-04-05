import { createLogger } from '@orbit/common/lib';

import type { VirtuosoSizeCache } from './chat-store';

const logger = createLogger('RenderCacheStore');

const MAX_CACHED_SESSIONS = 50;

const cache = new Map<string, VirtuosoSizeCache>();
const accessOrder: string[] = [];

function cloneSizeCache(sizeCache: VirtuosoSizeCache): VirtuosoSizeCache {
  return {
    ranges: sizeCache.ranges.map((range) => ({ ...range })),
    messageCount: sizeCache.messageCount,
    lastMessageId: sizeCache.lastMessageId,
    layoutVersion: sizeCache.layoutVersion,
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
    logger.debug('Evicted persistent render cache', {
      sessionId: oldest.slice(-6),
    });
  }
}

export function saveRenderCache(sessionId: string, sizeCache: VirtuosoSizeCache): void {
  cache.set(sessionId, cloneSizeCache(sizeCache));
  touchLru(sessionId);
  logger.debug('Saved render cache', {
    sessionId: sessionId.slice(-6),
    rangeCount: sizeCache.ranges.length,
    messageCount: sizeCache.messageCount,
  });
}

export function getRenderCache(sessionId: string): VirtuosoSizeCache | null {
  const entry = cache.get(sessionId);
  if (!entry) {
    return null;
  }

  touchLru(sessionId);
  return cloneSizeCache(entry);
}

export function removeRenderCache(sessionId: string): void {
  cache.delete(sessionId);

  const index = accessOrder.indexOf(sessionId);
  if (index >= 0) {
    accessOrder.splice(index, 1);
  }
}
