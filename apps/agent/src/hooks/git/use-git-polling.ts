/**
 * useGitPolling - Global git status polling hook
 *
 * Owns git status polling and auto-fetch at the app level.
 * Mounted in RootLayout so polling runs regardless of which
 * activity tab is selected. Populates the shared GitStore
 * that file explorer badges, status bar, and source control
 * tab all read from.
 *
 * This is a pure side-effect hook — returns nothing.
 */
import { createLogger } from '@orbit/common/lib';
import { useEffect, useRef, useState } from 'react';

import { useAutoFetch } from './use-auto-fetch';
import { useGitStatus } from './use-git-status';

import type { GitSettings, GitStatus } from '@/lib/api';

import { useEffectivePath } from '@/hooks/use-effective-path';
import { getSettings, gitBranchDiffStats } from '@/lib/api';
import { useGitStore } from '@/stores/git/git-store';

const logger = createLogger('GitPolling');

/** Polling interval for git status updates (ms) */
const GIT_POLL_INTERVAL = 5000;

/**
 * Global git polling hook. Call once at the app root level.
 *
 * - Discovers the git repo and polls status every 5 seconds
 * - Runs auto-fetch on a configurable interval (default 180s)
 * - Reads effectivePath from worktree/workspace state
 * - Writes all results to the shared GitStore
 */
export function useGitPolling(): void {
  const effectivePath = useEffectivePath();

  // Log what path we're polling — this helps diagnose blank file explorer badges
  useEffect(() => {
    logger.info('Git polling initialized', { effectivePath });
  }, [effectivePath]);

  // Start git status polling — populates GitStore
  useGitStatus(effectivePath, {
    pollInterval: GIT_POLL_INTERVAL,
  });

  // Read repoPath from store (set by useGitStatus after discovery)
  const repoPath = useGitStore((s) => s.repoPath);

  // Git settings for auto-fetch configuration
  const [gitSettings, setGitSettings] = useState<GitSettings | null>(null);

  useEffect(() => {
    void getSettings().then((settings) => {
      setGitSettings(settings.git);
    });
  }, []);

  // Fetch branch diff stats only when git status meaningfully changes.
  // The store's setStatus skips updates when nothing changed (only bumps lastUpdated),
  // so the `status` object reference only changes on real changes — this effect
  // won't fire on no-op background polls.
  const status = useGitStore((s) => s.status);
  const setBranchDiffStats = useGitStore((s) => s.setBranchDiffStats);
  const prevStatusRef = useRef<GitStatus | null>(null);

  useEffect(() => {
    // Skip if status hasn't changed or no repo
    if (!repoPath || status === prevStatusRef.current) return;
    prevStatusRef.current = status;

    if (!status) {
      setBranchDiffStats(null);
      return;
    }

    void gitBranchDiffStats(repoPath)
      .then(setBranchDiffStats)
      .catch(() => {
        // Silently ignore — stats are non-critical
      });
  }, [repoPath, status, setBranchDiffStats]);

  // Start auto-fetch polling — keeps remote refs updated
  useAutoFetch(repoPath, {
    enabled: gitSettings?.autoFetchEnabled ?? true,
    intervalSeconds: gitSettings?.autoFetchInterval ?? 180,
    pauseWhenHidden: true,
  });
}
