/**
 * Background prefetch for sidebar sessions.
 *
 * After the initial session restore completes, prefetch conversation data for
 * recent sidebar sessions into TanStack Query cache. This eliminates the
 * ~34-148ms `query-load` delay when switching to a session for the first time
 * in an app session — `select()` finds cached data and takes `query-fast-path`
 * instead.
 *
 * Design decisions (informed by Codex review):
 * - Triggered post-initial-restore, not off hydrateWorkspace()
 * - Batched at concurrency 3 to avoid flooding IPC
 * - Capped at 15 most recent sessions
 * - Uses loadConversationDetailFresh() (canonical prefetch primitive)
 * - Fire-and-forget — failures are silent, select() falls back to query-load
 */

import { createLogger } from '@orbit/common/lib';

import { loadConversationDetailFresh } from './conversation-detail';

import { preloadRenderCacheFromIdb } from '@/stores/chat/render-cache-store';

const logger = createLogger('PrefetchSidebar');

const MAX_PREFETCH_SESSIONS = 15;
const BATCH_CONCURRENCY = 3;
const BATCH_DELAY_MS = 50;

/** Track which workspace snapshots have been prefetched to avoid re-running. */
const prefetchedSnapshots = new Set<string>();

/**
 * Prefetch conversation data + render cache for recent sidebar sessions.
 *
 * Call this after the initial session restore has completed and the sidebar
 * conversation list is populated. Safe to call multiple times — it deduplicates
 * by workspace + conversation count snapshot.
 *
 * @param sessions - Sidebar sessions sorted by recency (most recent first)
 * @param activeSessionId - Currently active session (skip, already loaded)
 * @param snapshotKey - Unique key for this workspace/worktree state
 */
export function prefetchSidebarSessions(
  sessions: readonly { readonly sessionId: string; readonly updatedAt: number }[],
  activeSessionId: string | null,
  snapshotKey: string
): void {
  if (prefetchedSnapshots.has(snapshotKey)) {
    return;
  }
  prefetchedSnapshots.add(snapshotKey);

  // Sort by most recently updated, cap at limit, exclude active session
  const candidates = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((s) => s.sessionId !== activeSessionId)
    .slice(0, MAX_PREFETCH_SESSIONS);

  if (candidates.length === 0) {
    return;
  }

  logger.debug(`Prefetching ${String(candidates.length)} sessions`, {
    snapshotKey,
    sessionIds: candidates.map((s) => s.sessionId.slice(-6)),
  });

  void prefetchBatched(candidates.map((s) => s.sessionId));
}

async function prefetchBatched(sessionIds: string[]): Promise<void> {
  for (let i = 0; i < sessionIds.length; i += BATCH_CONCURRENCY) {
    const batch = sessionIds.slice(i, i + BATCH_CONCURRENCY);

    await Promise.allSettled(
      batch.map(async (sessionId) => {
        await loadConversationDetailFresh(sessionId);
        void preloadRenderCacheFromIdb(sessionId);
      })
    );

    // Yield between batches to avoid hogging the main thread
    if (i + BATCH_CONCURRENCY < sessionIds.length) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, BATCH_DELAY_MS);
      });
    }
  }

  logger.debug(`Prefetch complete (${String(sessionIds.length)} sessions)`);
}
