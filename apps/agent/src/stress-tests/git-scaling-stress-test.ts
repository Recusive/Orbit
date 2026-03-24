import { createLogger } from '@orbit/common/lib';

import type { GitStatus, StatusEntry } from '@/lib/api';

import { useGitStore } from '@/stores/git/git-store';

const logger = createLogger('GitScalingStressTest');

const DEFAULT_SCROLL_JUMPS = 100;
const DEFAULT_SCROLL_DELAY_MS = 50;
const DEFAULT_STRESS_REPO_PATH = '/tmp/orbit-git-stress-repo';
const DEFAULT_FILE_COUNT = 50_000;
const DEFAULT_LEAK_CYCLES = 10;
const DEFAULT_MULTI_EXPAND_COUNT = 5;
const MAX_SCROLL_HEAP_GROWTH_MB = 50;
const MAX_LEAK_MB = 20;
const MAX_MULTI_EXPAND_HEAP_MB = 500;
const MAX_DIFF_DOM_NODES = 2_000;

export interface GitScalingStressTestConfig {
  fileCount?: number;
  stressRepoPath?: string;
  leakCycles?: number;
  multiExpandCount?: number;
  skipSynthetic?: boolean;
}

interface StressTestSummary {
  syntheticHeapGrowthMb: number | null;
  expandedDiffNodeCount: number | null;
  leakMb: number | null;
  multiExpandHeapMb: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getHeapUsageMb(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  const bytes = memory?.usedJSHeapSize;
  return typeof bytes === 'number' ? bytes / (1024 * 1024) : null;
}

function assertLte(value: number, max: number, label: string): void {
  if (value > max) {
    throw new Error(`${label}: expected <= ${max.toString()}, received ${value.toString()}`);
  }
}

function generateSyntheticStatus(fileCount: number): GitStatus {
  const untracked: StatusEntry[] = [];
  for (let index = 0; index < fileCount; index++) {
    untracked.push({
      path: `node_modules/pkg-${Math.floor(index / 100).toString()}/dist/file-${index.toString()}.js`,
      status: 'untracked',
      oldPath: null,
      similarity: null,
    });
  }

  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked,
    conflicted: [],
  };
}

function getScrollContainer(): HTMLElement {
  const scrollElement = document.querySelector<HTMLElement>(
    '[data-testid="source-control-scroll"]'
  );
  if (!scrollElement) {
    throw new Error(
      'Source control scroll container not found — open the Source Control panel before running the git scaling stress test.'
    );
  }

  return scrollElement;
}

function getExpandButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="button"][aria-label*="Expand diff for"]')
  );
}

export async function runGitScalingStressTest(
  config: GitScalingStressTestConfig = {}
): Promise<StressTestSummary> {
  const {
    fileCount = DEFAULT_FILE_COUNT,
    stressRepoPath = DEFAULT_STRESS_REPO_PATH,
    leakCycles = DEFAULT_LEAK_CYCLES,
    multiExpandCount = DEFAULT_MULTI_EXPAND_COUNT,
    skipSynthetic = false,
  } = config;

  const originalState = useGitStore.getState();
  const originalSnapshot = {
    repoPath: originalState.repoPath,
    status: originalState.status,
    statusFingerprint: originalState.statusFingerprint,
    statusRevision: originalState.statusRevision,
  };

  const summary: StressTestSummary = {
    syntheticHeapGrowthMb: null,
    expandedDiffNodeCount: null,
    leakMb: null,
    multiExpandHeapMb: null,
  };

  try {
    if (!skipSynthetic) {
      logger.info('Injecting synthetic git status payload', { fileCount });
      const heapBefore = getHeapUsageMb();
      useGitStore.setState({
        repoPath: stressRepoPath,
        status: generateSyntheticStatus(fileCount),
        statusFingerprint: `synthetic-${Date.now().toString()}`,
        statusRevision: originalSnapshot.statusRevision + 1,
        error: null,
        isLoading: false,
      });

      await sleep(250);

      const scrollElement = getScrollContainer();
      for (let iteration = 0; iteration < DEFAULT_SCROLL_JUMPS; iteration++) {
        scrollElement.scrollTop = Math.random() * Math.max(scrollElement.scrollHeight, 1);
        await sleep(DEFAULT_SCROLL_DELAY_MS);
      }

      const heapAfter = getHeapUsageMb();
      if (heapBefore !== null && heapAfter !== null) {
        summary.syntheticHeapGrowthMb = heapAfter - heapBefore;
        assertLte(summary.syntheticHeapGrowthMb, MAX_SCROLL_HEAP_GROWTH_MB, 'Scroll heap growth');
      }
    }

    const cards = getExpandButtons();
    if (cards.length === 0) {
      logger.warn('No expandable diff cards found; skipping real diff expansion phases', {
        stressRepoPath,
      });
      return summary;
    }

    logger.info('Running real diff expansion phases', {
      cardCount: cards.length,
      stressRepoPath,
    });

    cards[0]?.click();
    await sleep(3000);

    const diffBody = document.querySelector<HTMLElement>('[data-diffs]');
    summary.expandedDiffNodeCount = diffBody?.querySelectorAll('*').length ?? null;
    if (summary.expandedDiffNodeCount !== null) {
      assertLte(summary.expandedDiffNodeCount, MAX_DIFF_DOM_NODES, 'Expanded diff DOM nodes');
    }

    const heapBeforeCycles = getHeapUsageMb();
    for (let cycle = 0; cycle < leakCycles; cycle++) {
      cards[0]?.click();
      await sleep(500);
      cards[0]?.click();
      await sleep(1000);
    }

    const maybeGc = (window as Window & { gc?: () => void }).gc;
    if (typeof maybeGc === 'function') {
      maybeGc();
      await sleep(1000);
    }

    const heapAfterCycles = getHeapUsageMb();
    if (heapBeforeCycles !== null && heapAfterCycles !== null) {
      summary.leakMb = heapAfterCycles - heapBeforeCycles;
      assertLte(summary.leakMb, MAX_LEAK_MB, 'Expand/collapse leak');
    }

    const expandedCount = Math.min(multiExpandCount, cards.length);
    for (let index = 0; index < expandedCount; index++) {
      cards[index]?.click();
      await sleep(200);
    }
    await sleep(5000);

    summary.multiExpandHeapMb = getHeapUsageMb();
    if (summary.multiExpandHeapMb !== null) {
      assertLte(summary.multiExpandHeapMb, MAX_MULTI_EXPAND_HEAP_MB, 'Multi-expand heap');
    }

    for (let index = 0; index < expandedCount; index++) {
      cards[index]?.click();
    }

    logger.info('Git scaling stress test completed', { summary });
    return summary;
  } finally {
    useGitStore.setState({
      repoPath: originalSnapshot.repoPath,
      status: originalSnapshot.status,
      statusFingerprint: originalSnapshot.statusFingerprint,
      statusRevision: originalSnapshot.statusRevision,
    });
  }
}
