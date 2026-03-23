import { createDiffScheduler } from '@/lib/utils/diff-scheduler';

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

describe('diff-scheduler', () => {
  it('dedupes requests by key within the same lane', async () => {
    const scheduler = createDiffScheduler();
    const deferred = createDeferred<{ additions: number; deletions: number; isBinary: boolean }>();
    const fn = vi.fn(() => deferred.promise);

    const first = scheduler.requestStats('same-key', fn);
    const second = scheduler.requestStats('same-key', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    deferred.resolve({ additions: 3, deletions: 1, isBinary: false });

    await expect(first).resolves.toEqual({ additions: 3, deletions: 1, isBinary: false });
  });

  it('enforces the stats lane concurrency limit at 8', async () => {
    const scheduler = createDiffScheduler();
    const deferreds = Array.from({ length: 10 }, () =>
      createDeferred<{ additions: number; deletions: number; isBinary: boolean }>()
    );
    let started = 0;

    const promises = deferreds.map((deferred, index) =>
      scheduler.requestStats(`stats-${String(index)}`, () => {
        started += 1;
        return deferred.promise;
      })
    );

    expect(started).toBe(8);

    for (const deferred of deferreds.slice(0, 8)) {
      deferred.resolve({ additions: 1, deletions: 0, isBinary: false });
    }
    await Promise.all(promises.slice(0, 8));
    await Promise.resolve();

    expect(started).toBe(10);

    deferreds[8]?.resolve({ additions: 1, deletions: 0, isBinary: false });
    deferreds[9]?.resolve({ additions: 1, deletions: 0, isBinary: false });
    await Promise.all(promises);
  });

  it('enforces the content lane concurrency limit at 2', async () => {
    const scheduler = createDiffScheduler();
    const deferreds = Array.from({ length: 3 }, () =>
      createDeferred<{ oldContent: string; newContent: string; isBinary: boolean }>()
    );
    let started = 0;

    const promises = deferreds.map((deferred, index) =>
      scheduler.requestContent(`content-${String(index)}`, () => {
        started += 1;
        return deferred.promise;
      })
    );

    expect(started).toBe(2);

    deferreds[0]?.resolve({ oldContent: '', newContent: 'a', isBinary: false });
    deferreds[1]?.resolve({ oldContent: '', newContent: 'b', isBinary: false });
    await Promise.all(promises.slice(0, 2));
    await Promise.resolve();

    expect(started).toBe(3);

    deferreds[2]?.resolve({ oldContent: '', newContent: 'c', isBinary: false });
    await Promise.all(promises);
  });

  it('cancels queued work before execution', async () => {
    const scheduler = createDiffScheduler();
    const blockers = Array.from({ length: 8 }, () =>
      createDeferred<{ additions: number; deletions: number; isBinary: boolean }>()
    );
    const canceledFn = vi.fn(() =>
      Promise.resolve({ additions: 99, deletions: 0, isBinary: false })
    );

    const blockerPromises = blockers.map((deferred, index) =>
      scheduler.requestStats(`blocker-${String(index)}`, () => deferred.promise)
    );
    const canceledPromise = scheduler.requestStats('queued-cancel', canceledFn);

    scheduler.cancel('queued-cancel');

    for (const deferred of blockers) {
      deferred.resolve({ additions: 1, deletions: 0, isBinary: false });
    }

    await Promise.all(blockerPromises);
    await expect(canceledPromise).resolves.toBeNull();
    expect(canceledFn).not.toHaveBeenCalled();
  });

  it('drops stale running results after cancelAll', async () => {
    const scheduler = createDiffScheduler();
    const deferred = createDeferred<{
      oldContent: string;
      newContent: string;
      isBinary: boolean;
    }>();
    const promise = scheduler.requestContent('running', () => deferred.promise);

    scheduler.cancelAll();
    deferred.resolve({ oldContent: 'before', newContent: 'after', isBinary: false });

    await expect(promise).resolves.toBeNull();
  });
});
