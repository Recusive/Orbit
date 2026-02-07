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
import { useEffect, useState } from 'react';

import { useAutoFetch } from './use-auto-fetch';
import { useGitStatus } from './use-git-status';

import type { GitSettings } from '@/lib/api';

import { useEffectivePath } from '@/hooks/use-effective-path';
import { getSettings } from '@/lib/api';
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

  // Start auto-fetch polling — keeps remote refs updated
  useAutoFetch(repoPath, {
    enabled: gitSettings?.autoFetchEnabled ?? true,
    intervalSeconds: gitSettings?.autoFetchInterval ?? 180,
    pauseWhenHidden: true,
  });
}
