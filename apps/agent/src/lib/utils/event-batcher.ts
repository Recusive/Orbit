/**
 * Event Batcher - Reduces React re-renders from high-frequency events
 *
 * DEV NOTE: This was created to solve the "event flooding" problem where
 * the agent-bridge emits 60+ events (checkpoints, tools) during a single
 * agent run, each causing immediate React state updates and re-renders.
 *
 * Strategy:
 * 1. Debounce: Coalesce rapid events, only process the latest (for checkpoints)
 * 2. Throttle: Process at most once per time window (for tool events)
 * 3. RAF Batch: Collect events and flush on animation frame (for bulk updates)
 */

/**
 * Creates a debounced function that delays invoking until after `wait` ms
 * have elapsed since the last call. Great for "latest value wins" scenarios.
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, wait);
  };
}

/**
 * Creates a throttled function that only invokes at most once per `wait` ms.
 * Unlike debounce, this guarantees regular invocations during sustained activity.
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      // Enough time has passed, invoke immediately
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else {
      // Schedule trailing call if not already scheduled
      timeoutId ??= setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
    // If timeout already scheduled, ignore this call (will use latest args on next invoke)
  };
}

/**
 * Creates a RAF-batched function that collects calls and invokes once per animation frame.
 * Perfect for batching state updates to align with React's render cycle.
 *
 * @param processBatch - Function that receives all batched items and processes them together
 */
export function rafBatch<T>(processBatch: (items: T[]) => void): (item: T) => void {
  let batch: T[] = [];
  let rafId: number | null = null;

  return (item: T): void => {
    batch.push(item);

    // Schedule RAF callback if not already scheduled
    rafId ??= requestAnimationFrame(() => {
      const items = batch;
      batch = [];
      rafId = null;
      processBatch(items);
    });
  };
}

/**
 * Batched checkpoint processor - debounces checkpoint events per session.
 *
 * Checkpoints come in bursts during tool execution, but for rewind purposes
 * only the turn boundaries matter. This debounces to reduce state updates
 * from ~30 per run to ~2-3 per run.
 */
export interface CheckpointBatch {
  sessionId: string;
  checkpointId: string;
}

export function createCheckpointBatcher(
  processCheckpoint: (sessionId: string, checkpointId: string) => void,
  debounceMs = 100
): (sessionId: string, checkpointId: string) => void {
  // Track latest checkpoint per session
  const latestCheckpoints = new Map<string, string>();

  // Debounced flush function
  const flush = debounce(() => {
    for (const [sessionId, checkpointId] of latestCheckpoints) {
      processCheckpoint(sessionId, checkpointId);
    }
    latestCheckpoints.clear();
  }, debounceMs);

  return (sessionId: string, checkpointId: string): void => {
    // Always store the latest checkpoint
    latestCheckpoints.set(sessionId, checkpointId);
    // Schedule a debounced flush
    flush();
  };
}

/**
 * Batched tool event processor - batches tool events and flushes on RAF.
 *
 * Tool events (start/end) come in rapid succession. By batching them,
 * we can process multiple tools in a single React render cycle.
 */
export interface ToolEventBatch {
  type: 'start' | 'end';
  toolId: string;
  messageId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  success?: boolean;
  contentOffset?: number;
}

export function createToolEventBatcher(
  processToolStart: (
    toolId: string,
    messageId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    contentOffset: number
  ) => void,
  processToolEnd: (toolId: string, toolOutput: unknown, success: boolean) => void
): (event: ToolEventBatch) => void {
  return rafBatch<ToolEventBatch>((events) => {
    // Process all events in the batch
    for (const event of events) {
      if (event.type === 'start') {
        processToolStart(
          event.toolId,
          event.messageId ?? '',
          event.toolName ?? '',
          event.toolInput ?? {},
          event.contentOffset ?? 0
        );
      } else {
        processToolEnd(event.toolId, event.toolOutput, event.success ?? false);
      }
    }
  });
}
