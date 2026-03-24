import { preloadHighlighter } from '@pierre/diffs';
import { render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { supportsPierreWorkerPool } from '@/lib/utils/pierre-worker-factory';
import { PierreProvider } from '@/providers/pierre-provider';
import { useGitStore } from '@/stores/git/git-store';

vi.mock('@pierre/diffs', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    preloadHighlighter: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@pierre/diffs/react', () => ({
  WorkerPoolContextProvider: vi.fn(({ children }: { readonly children: ReactNode }) => (
    <div data-testid="worker-pool-provider">{children}</div>
  )),
}));

vi.mock('@/lib/utils/pierre-worker-factory', () => ({
  PIERRE_WORKER_POOL_OPTIONS: {
    poolSize: 2,
    totalASTLRUCacheSize: 48,
    workerFactory: () => ({ terminate: (): void => undefined }),
  },
  supportsPierreWorkerPool: vi.fn(),
}));

const preloadHighlighterMock = vi.mocked(preloadHighlighter);
const supportsPierreWorkerPoolMock = vi.mocked(supportsPierreWorkerPool);

describe('PierreProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({ repoPath: '/repo' });
  });

  it('falls back to pass-through rendering when workers are unavailable', async () => {
    supportsPierreWorkerPoolMock.mockReturnValue(false);

    render(
      <PierreProvider>
        <div data-testid="child">child</div>
      </PierreProvider>
    );

    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('worker-pool-provider')).not.toBeInTheDocument();
    expect(preloadHighlighterMock).toHaveBeenCalled();
  });

  it('mounts the shared worker pool provider when workers are available', async () => {
    supportsPierreWorkerPoolMock.mockReturnValue(true);

    render(
      <PierreProvider>
        <div data-testid="child">child</div>
      </PierreProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('worker-pool-provider')).toBeInTheDocument();
    });

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
