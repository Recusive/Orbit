import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';

import { gitFetch } from '@/lib/api';
import { useGitStore } from '@/stores/git/git-store';

const logger = createLogger('AutoFetch');

// Global singleton to prevent multiple polling instances
let globalPollingActive = false;

export interface UseAutoFetchOptions {
  /** Whether auto-fetch is enabled (default: true) */
  enabled?: boolean;
  /** Fetch interval in seconds (default: 180) */
  intervalSeconds?: number;
  /** Pause fetching when document is hidden (default: true) */
  pauseWhenHidden?: boolean;
}

export interface UseAutoFetchResult {
  /** Manually trigger a fetch from remote */
  fetch: () => Promise<void>;
  /** Whether a fetch is currently in progress */
  isFetching: boolean;
  /** Timestamp of the last successful fetch */
  lastFetchedAt: number | null;
}

/**
 * Hook for automatic git fetch from remote.
 *
 * This hook polls `git fetch` at a configurable interval to keep
 * remote tracking refs updated. It's visibility-aware and pauses
 * when the document is hidden.
 *
 * Background fetches fail silently (logs only). Manual fetches throw
 * errors so they can be shown to the user.
 *
 * @param repoPath - Path to the git repository
 * @param options - Configuration options
 * @returns Fetch function and state
 *
 * @example
 * ```tsx
 * function SourceControl() {
 *   const { fetch, isFetching, lastFetchedAt } = useAutoFetch(repoPath, {
 *     enabled: settings.git.autoFetchEnabled,
 *     intervalSeconds: settings.git.autoFetchInterval,
 *   });
 *
 *   return (
 *     <button onClick={fetch} disabled={isFetching}>
 *       {isFetching ? 'Fetching...' : 'Fetch'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAutoFetch(
  repoPath: string | null,
  options: UseAutoFetchOptions = {}
): UseAutoFetchResult {
  const { enabled = true, intervalSeconds = 180, pauseWhenHidden = true } = options;

  // Store state
  const isFetching = useGitStore((s) => s.isFetching);
  const lastFetchedAt = useGitStore((s) => s.lastFetchedAt);

  // Store actions (stable references from zustand)
  const setFetching = useGitStore((s) => s.setFetching);
  const setLastFetchedAt = useGitStore((s) => s.setLastFetchedAt);

  // Store values in refs to avoid effect re-runs
  const repoPathRef = useRef(repoPath);
  repoPathRef.current = repoPath;

  const actionsRef = useRef({ setFetching, setLastFetchedAt });
  actionsRef.current = { setFetching, setLastFetchedAt };

  // Request counter to handle race conditions
  const requestIdRef = useRef(0);
  // Guard against concurrent fetches
  const fetchInProgressRef = useRef(false);

  /**
   * Internal fetch implementation.
   * @param silent - If true, errors are logged but not thrown (for background fetches)
   */
  const doFetch = useCallback(async (silent: boolean): Promise<void> => {
    const path = repoPathRef.current;
    const actions = actionsRef.current;

    if (!path) {
      return;
    }

    // Prevent concurrent fetches
    if (fetchInProgressRef.current) {
      logger.debug('Fetch already in progress, skipping');
      return;
    }

    fetchInProgressRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    actions.setFetching(true);

    try {
      logger.debug('Fetching from remote', { path, silent });
      await gitFetch(path);

      if (requestIdRef.current !== currentRequestId) {
        return; // Stale request
      }

      actions.setLastFetchedAt(Date.now());
      logger.info('Fetch successful');
    } catch (err) {
      if (requestIdRef.current !== currentRequestId) {
        return; // Stale request
      }

      const errStr = err instanceof Error ? err.message : String(err);

      if (silent) {
        // Background fetch - log but don't throw
        logger.warn('Background fetch failed', { error: errStr });
      } else {
        // Manual fetch - throw so caller can show error to user
        logger.error('Fetch failed', { error: errStr });
        throw err;
      }
    } finally {
      fetchInProgressRef.current = false;
      if (requestIdRef.current === currentRequestId) {
        actions.setFetching(false);
      }
    }
  }, []); // Empty deps - uses refs internally for stable reference

  /**
   * Public fetch function for manual fetches.
   * Throws on error so caller can show toast/notification.
   */
  const fetch = useCallback(async (): Promise<void> => {
    await doFetch(false);
  }, [doFetch]);

  // Track if this instance owns the polling
  const ownsPollingRef = useRef(false);

  // Auto-fetch polling with visibility awareness (singleton pattern)
  useEffect(() => {
    if (!enabled || intervalSeconds <= 0 || !repoPath) {
      return;
    }

    // Prevent multiple instances from polling
    if (globalPollingActive) {
      logger.debug('Auto-fetch polling already active, skipping');
      return;
    }

    globalPollingActive = true;
    ownsPollingRef.current = true;

    const intervalMs = intervalSeconds * 1000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = (): void => {
      if (intervalId !== null) return;
      logger.debug('Starting auto-fetch polling', { intervalSeconds });
      intervalId = setInterval(() => {
        void doFetch(true); // Background fetch - silent errors
      }, intervalMs);
    };

    const stopPolling = (): void => {
      if (intervalId !== null) {
        logger.debug('Stopping auto-fetch polling');
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden && pauseWhenHidden) {
        stopPolling();
      } else {
        if (!document.hidden && pauseWhenHidden) {
          // Fetch immediately when becoming visible
          void doFetch(true);
        }
        startPolling();
      }
    };

    // Do an initial fetch when hook mounts (if visible)
    if (!pauseWhenHidden || !document.hidden) {
      void doFetch(true);
      startPolling();
    }

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return (): void => {
      stopPolling();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      // Only release global lock if this instance owns it
      if (ownsPollingRef.current) {
        globalPollingActive = false;
        ownsPollingRef.current = false;
      }
    };
  }, [doFetch, intervalSeconds, enabled, repoPath, pauseWhenHidden]);

  return {
    fetch,
    isFetching,
    lastFetchedAt,
  };
}
