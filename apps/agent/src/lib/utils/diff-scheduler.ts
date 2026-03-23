import type { FileDiffStats, SingleFileContent } from '@/lib/api';

interface QueuedTask<T> {
  key: string;
  canceled: boolean;
  started: boolean;
  run: () => Promise<T>;
  promise: Promise<T | null>;
  resolve: (value: T | null) => void;
  reject: (reason?: unknown) => void;
}

interface Lane<T> {
  name: 'stats' | 'content';
  limit: number;
  active: number;
  queue: QueuedTask<T>[];
  tasks: Map<string, QueuedTask<T>>;
}

export interface DiffScheduler {
  requestStats: (key: string, fn: () => Promise<FileDiffStats>) => Promise<FileDiffStats | null>;
  requestContent: (
    key: string,
    fn: () => Promise<SingleFileContent>
  ) => Promise<SingleFileContent | null>;
  cancel: (key: string) => void;
  cancelAll: () => void;
}

function createLane<T>(name: Lane<T>['name'], limit: number): Lane<T> {
  return {
    name,
    limit,
    active: 0,
    queue: [],
    tasks: new Map<string, QueuedTask<T>>(),
  };
}

function createTask<T>(key: string, run: () => Promise<T>): QueuedTask<T> {
  let resolve!: (value: T | null) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    key,
    canceled: false,
    started: false,
    run,
    promise,
    resolve,
    reject,
  };
}

function pumpLane<T>(lane: Lane<T>): void {
  while (lane.active < lane.limit) {
    const task = lane.queue.shift();
    if (!task) {
      return;
    }

    if (task.canceled) {
      if (lane.tasks.get(task.key) === task) {
        lane.tasks.delete(task.key);
      }
      task.resolve(null);
      continue;
    }

    task.started = true;
    lane.active += 1;

    void task
      .run()
      .then((result) => {
        if (task.canceled) {
          task.resolve(null);
          return;
        }
        task.resolve(result);
      })
      .catch((error: unknown) => {
        if (task.canceled) {
          task.resolve(null);
          return;
        }
        task.reject(error);
      })
      .finally(() => {
        lane.active -= 1;
        if (lane.tasks.get(task.key) === task) {
          lane.tasks.delete(task.key);
        }
        pumpLane(lane);
      });
  }
}

function requestFromLane<T>(lane: Lane<T>, key: string, run: () => Promise<T>): Promise<T | null> {
  const existing = lane.tasks.get(key);
  if (existing && !existing.canceled) {
    return existing.promise;
  }

  const task = createTask(key, run);
  lane.tasks.set(key, task);
  lane.queue.push(task);
  pumpLane(lane);
  return task.promise;
}

function cancelLaneTask<T>(lane: Lane<T>, key: string): void {
  const task = lane.tasks.get(key);
  if (!task) {
    return;
  }

  task.canceled = true;

  if (!task.started) {
    lane.tasks.delete(key);
    const queueIndex = lane.queue.indexOf(task);
    if (queueIndex >= 0) {
      lane.queue.splice(queueIndex, 1);
    }
    task.resolve(null);
  }
}

export function createDiffScheduler(): DiffScheduler {
  const statsLane = createLane<FileDiffStats>('stats', 8);
  const contentLane = createLane<SingleFileContent>('content', 2);

  return {
    requestStats: (key, fn) => requestFromLane(statsLane, key, fn),
    requestContent: (key, fn) => requestFromLane(contentLane, key, fn),
    cancel: (key) => {
      cancelLaneTask(statsLane, key);
      cancelLaneTask(contentLane, key);
    },
    cancelAll: () => {
      for (const key of [...statsLane.tasks.keys()]) {
        cancelLaneTask(statsLane, key);
      }
      for (const key of [...contentLane.tasks.keys()]) {
        cancelLaneTask(contentLane, key);
      }
    },
  };
}

export const diffScheduler = createDiffScheduler();
