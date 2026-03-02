import { act, render, screen } from '@testing-library/react';

import type { FileItem } from '@/components/git/source-control/types';
import type { FileDiff } from '@/lib/api';
import type { ComponentProps, ReactNode } from 'react';

import { ChangesList } from '@/components/git/source-control/components/ChangesList';

interface MockDiffFileCardProps {
  file: FileItem;
  diff: FileDiff | undefined;
  isStaged: boolean;
  isLoading: boolean;
  onAction: (path: string) => Promise<void>;
  onDiscard?: ((path: string) => void) | undefined;
  schedulePrefetch: (start: () => Promise<void>) => () => void;
}

interface MockVirtuosoProps<TData> {
  customScrollParent: HTMLDivElement;
  data: TData[];
  itemContent: (index: number, item: TData) => ReactNode;
}

const receivedPropsByPath = new Map<string, MockDiffFileCardProps>();
const mockVirtuosoProps = vi.fn<(props: MockVirtuosoProps<FileItem>) => void>();

vi.mock('@/components/git/source-control/components/DiffFileCard', () => ({
  DiffFileCard: (props: MockDiffFileCardProps) => {
    receivedPropsByPath.set(props.file.path, props);
    return <div data-testid={`diff-card-${props.file.path}`}>{props.file.path}</div>;
  },
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: MockVirtuosoProps<FileItem>) => {
    mockVirtuosoProps(props);
    return (
      <div data-testid="changes-virtuoso">
        {props.data.map((item, index) => (
          <div key={item.path}>{props.itemContent(index, item)}</div>
        ))}
      </div>
    );
  },
}));

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildFile(path: string): FileItem {
  return {
    path,
    displayStatus: 'modified',
    backendStatus: 'modified',
    oldPath: null,
  };
}

function buildDiff(path: string): FileDiff {
  return {
    path,
    hunks: [{ header: '@@ -1 +1 @@', lines: [] }],
    isBinary: false,
  };
}

function renderChangesList(overrides: Partial<ComponentProps<typeof ChangesList>> = {}): void {
  const stagedFiles = [buildFile('src/staged.ts')];
  const unstagedFiles = [buildFile('src/a.ts'), buildFile('src/b.ts')];
  const stagedDiffs = [buildDiff('src/staged.ts')];
  const unstagedDiffs = [buildDiff('src/a.ts'), buildDiff('src/b.ts')];
  const scrollParent = document.createElement('div');

  render(
    <ChangesList
      scrollParent={scrollParent}
      stagedFiles={stagedFiles}
      unstagedFiles={unstagedFiles}
      stagedDiffs={stagedDiffs}
      unstagedDiffs={unstagedDiffs}
      isStaging={false}
      onStageFile={() => Promise.resolve(undefined)}
      onUnstageFile={() => Promise.resolve(undefined)}
      onStageAll={() => Promise.resolve(undefined)}
      onUnstageAll={() => Promise.resolve(undefined)}
      onRequestDiscard={vi.fn()}
      {...overrides}
    />
  );
}

describe('ChangesList', () => {
  beforeEach(() => {
    receivedPropsByPath.clear();
    mockVirtuosoProps.mockClear();
    vi.useRealTimers();
  });

  it('renders Virtuoso when scrollParent is provided', () => {
    renderChangesList();
    expect(screen.getByTestId('changes-virtuoso')).toBeInTheDocument();
    expect(screen.queryByText('Loading changes...')).not.toBeInTheDocument();
  });

  it('shows loading fallback when scrollParent is not ready', () => {
    renderChangesList({ scrollParent: null });
    expect(screen.getByText('Loading changes...')).toBeInTheDocument();
    expect(screen.queryByTestId('changes-virtuoso')).not.toBeInTheDocument();
  });

  it('passes active tab file props to DiffFileCard items', () => {
    const onStageFile = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
    const onRequestDiscard = vi.fn();

    renderChangesList({
      onStageFile,
      onRequestDiscard,
    });

    const first = receivedPropsByPath.get('src/a.ts');
    const second = receivedPropsByPath.get('src/b.ts');

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.isStaged).toBe(false);
    expect(first?.isLoading).toBe(false);
    expect(first?.diff?.path).toBe('src/a.ts');
    expect(first?.onAction).toBe(onStageFile);
    expect(first?.onDiscard).toBe(onRequestDiscard);
    expect(typeof first?.schedulePrefetch).toBe('function');
  });

  it('runs only the latest hover preload when multiple are scheduled in delay window', () => {
    vi.useFakeTimers();
    renderChangesList();

    const scheduleA = receivedPropsByPath.get('src/a.ts')?.schedulePrefetch;
    const scheduleB = receivedPropsByPath.get('src/b.ts')?.schedulePrefetch;
    expect(scheduleA).toBeDefined();
    expect(scheduleB).toBeDefined();

    const startA = vi.fn(() => Promise.resolve(undefined));
    const startB = vi.fn(() => Promise.resolve(undefined));

    act(() => {
      scheduleA?.(startA);
      vi.advanceTimersByTime(80);
      scheduleB?.(startB);
      vi.advanceTimersByTime(150);
    });

    expect(startA).not.toHaveBeenCalled();
    expect(startB).toHaveBeenCalledTimes(1);
  });

  it('queues one trailing preload while a preload is already running', async () => {
    vi.useFakeTimers();
    renderChangesList();

    const schedule = receivedPropsByPath.get('src/a.ts')?.schedulePrefetch;
    expect(schedule).toBeDefined();

    const inflight = createDeferred<undefined>();
    const firstStart = vi.fn(() => inflight.promise);
    const trailingStart = vi.fn(() => Promise.resolve(undefined));

    act(() => {
      schedule?.(firstStart);
      vi.advanceTimersByTime(150);
    });
    expect(firstStart).toHaveBeenCalledTimes(1);

    act(() => {
      schedule?.(trailingStart);
      vi.advanceTimersByTime(150);
    });
    expect(trailingStart).not.toHaveBeenCalled();

    await act(async () => {
      inflight.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(trailingStart).toHaveBeenCalledTimes(1);
  });

  it('cancels scheduled preload before the delay elapses', () => {
    vi.useFakeTimers();
    renderChangesList();

    const schedule = receivedPropsByPath.get('src/a.ts')?.schedulePrefetch;
    expect(schedule).toBeDefined();

    const start = vi.fn(() => Promise.resolve(undefined));
    let cancel: (() => void) | undefined;

    act(() => {
      cancel = schedule?.(start);
      cancel?.();
      vi.advanceTimersByTime(200);
    });

    expect(start).not.toHaveBeenCalled();
  });
});
