import { preloadHighlighter } from '@pierre/diffs';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import type { ReactNode } from 'react';

import { supportsPierreWorkerPool } from '@/lib/utils/pierre-worker-factory';
import { PierreCapabilitiesContext, PierreProvider } from '@/providers/pierre-provider';
import { useGitStore } from '@/stores/git/git-store';

const { loggerInfoMock, loggerWarnMock, workerPoolProviderPropsMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  workerPoolProviderPropsMock: vi.fn(),
}));

vi.mock('@pierre/diffs', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    preloadHighlighter: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@orbit/common/lib', () => ({
  createLogger: () => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('@pierre/diffs/react', () => ({
  WorkerPoolContextProvider: vi.fn(
    ({
      children,
      ...props
    }: {
      readonly children: ReactNode;
      readonly highlighterOptions: Record<string, unknown>;
      readonly poolOptions: Record<string, unknown>;
    }) => {
      workerPoolProviderPropsMock(props);
      return <div data-testid="worker-pool-provider">{children}</div>;
    }
  ),
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

function CapabilityProbe(): React.JSX.Element {
  const { workerPoolAvailable } = React.useContext(PierreCapabilitiesContext);
  return <div data-testid="capabilities">{String(workerPoolAvailable)}</div>;
}

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
        <CapabilityProbe />
      </PierreProvider>
    );

    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('capabilities')).toHaveTextContent('false');
    expect(screen.queryByTestId('worker-pool-provider')).not.toBeInTheDocument();
    expect(preloadHighlighterMock).toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Pierre worker pool unavailable in this WebView; main-thread highlighting active'
    );
  });

  it('mounts the shared worker pool provider when workers are available', async () => {
    supportsPierreWorkerPoolMock.mockReturnValue(true);

    render(
      <PierreProvider>
        <div data-testid="child">child</div>
        <CapabilityProbe />
      </PierreProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('worker-pool-provider')).toBeInTheDocument();
    });

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('capabilities')).toHaveTextContent('true');
    expect(loggerInfoMock).toHaveBeenCalledWith('Pierre worker pool active', { poolSize: 2 });
    expect(workerPoolProviderPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        highlighterOptions: expect.objectContaining({
          preferredHighlighter: 'shiki-js',
        }),
      })
    );
  });
});
