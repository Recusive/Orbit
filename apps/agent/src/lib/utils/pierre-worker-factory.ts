import PierreInlineWorker from '@pierre/diffs/worker/worker-portable.js?worker&inline';

import type { WorkerPoolOptions } from '@pierre/diffs/react';

const DEFAULT_FALLBACK_THREADS = 4;
const MIN_POOL_SIZE = 2;
const MAX_POOL_SIZE = 4;

function getPierreWorkerPoolSize(): number {
  if (typeof navigator === 'undefined') {
    return MIN_POOL_SIZE;
  }

  const threads =
    navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : DEFAULT_FALLBACK_THREADS;
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, Math.floor(threads / 2)));
}

export const PIERRE_WORKER_POOL_OPTIONS: WorkerPoolOptions = {
  workerFactory: () => new PierreInlineWorker(),
  poolSize: getPierreWorkerPoolSize(),
  totalASTLRUCacheSize: 48,
};

export function supportsPierreWorkerPool(): boolean {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return false;
  }

  try {
    const worker = PIERRE_WORKER_POOL_OPTIONS.workerFactory();
    worker.terminate();
    return true;
  } catch {
    return false;
  }
}
