/**
 * Zustand store wrapper for dev-monitor.
 *
 * Traces all state mutations in Zustand stores, including:
 * - What changed (shallow diff)
 * - Action names (when available)
 * - State size warnings
 *
 * Compatible with middleware like immer:
 * ```
 * create(trace.zustand('Store', immer((set) => ({ ... }))))
 * ```
 */

import { captureEvent } from '../storage';

import type { ZustandOptions } from '../types';
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/**
 * Zustand's SetState function type with both overloads.
 * This matches the actual Zustand API.
 */
interface SetState<T> {
  (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: false): void;
  (state: T | ((state: T) => T), replace: true): void;
}

// ═══════════════════════════════════════════════════════════════
// Zustand Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap a Zustand store creator to trace all state mutations.
 *
 * @example
 * export const useStore = create<State>()(
 *   zustandWrapper('MyStore', immer((set) => ({ ... })))
 * );
 */
export function zustandWrapper<
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  storeName: string,
  config: StateCreator<T, Mps, Mcs>,
  options: ZustandOptions = {}
): StateCreator<T, Mps, Mcs> {
  const { trackDiff = true, maxStateSize = 100_000 } = options;

  // Return a new StateCreator that wraps the original
  const wrappedCreator: StateCreator<T, Mps, Mcs> = (set, get, store) => {
    // Type-safe wrapper for set that handles both overloads
    const originalSet = set as unknown as SetState<T>;

    // Create wrapper that properly delegates to the original set
    function tracedSetPartial(
      partial: T | Partial<T> | ((state: T) => T | Partial<T>),
      replace?: false
    ): void {
      const prevState = get();
      originalSet(partial, replace);
      postMutationMonitoring(prevState, get(), partial);
    }

    function tracedSetReplace(state: T | ((state: T) => T), replace: true): void {
      const prevState = get();
      originalSet(state, replace);
      postMutationMonitoring(prevState, get(), state);
    }

    // Combined traced set with proper overloads
    const tracedSet: SetState<T> = ((
      partialOrState: T | Partial<T> | ((state: T) => T | Partial<T>),
      replace?: boolean
    ): void => {
      if (replace === true) {
        tracedSetReplace(partialOrState as T | ((state: T) => T), true);
      } else {
        tracedSetPartial(partialOrState, replace);
      }
    }) as SetState<T>;

    /**
     * Post-mutation monitoring (ISOLATED from the actual mutation).
     */
    function postMutationMonitoring(prevState: T, nextState: T, partial: unknown): void {
      try {
        // Build context
        const context: Record<string, unknown> = {};

        // Track diff if enabled
        if (trackDiff) {
          const diff = computeShallowDiff(prevState, nextState);
          if (diff.changedKeys.length > 0) {
            context['changedKeys'] = diff.changedKeys;
            context['changes'] = diff.changes;
          }
        }

        // Check state size
        try {
          const stateJson = JSON.stringify(nextState);
          const stateSize = stateJson.length;
          if (stateSize > maxStateSize) {
            captureEvent({
              severity: 'warning',
              category: 'zustand:large-state',
              file: `store:${storeName}`,
              function: 'set',
              title: `${storeName}: state exceeds ${String(maxStateSize)} bytes`,
              context: { size: stateSize, threshold: maxStateSize },
            });
          }
        } catch {
          // State not serializable - that's okay, some stores have functions
        }

        // Extract action name from partial if it's a function
        const actionName =
          typeof partial === 'function'
            ? ((partial as { name?: string }).name ?? 'anonymous')
            : 'direct';

        captureEvent({
          severity: 'info',
          category: 'zustand:mutation',
          file: `store:${storeName}`,
          function: actionName,
          title: `${storeName}.${actionName}`,
          context,
        });
      } catch (monitorError: unknown) {
        console.error('[DevMonitor] zustand wrapper error:', monitorError);
      }
    }

    // Cast back to the expected type for the StateCreator
    // This is safe because our tracedSet implements the same interface
    const typedSet = tracedSet as unknown as typeof set;

    // Call the original config with wrapped set
    return config(typedSet, get, store);
  };

  return wrappedCreator;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

interface ShallowDiff {
  changedKeys: string[];
  changes: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Compute a shallow diff between two objects.
 */
function computeShallowDiff<T>(prev: T, next: T): ShallowDiff {
  const changedKeys: string[] = [];
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (typeof prev !== 'object' || typeof next !== 'object') {
    return { changedKeys: [], changes: {} };
  }

  if (prev === null || next === null) {
    return { changedKeys: [], changes: {} };
  }

  const allKeys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);

  for (const key of allKeys) {
    const prevValue = (prev as Record<string, unknown>)[key];
    const nextValue = (next as Record<string, unknown>)[key];

    if (!Object.is(prevValue, nextValue)) {
      changedKeys.push(key);
      changes[key] = {
        from: summarizeValue(prevValue),
        to: summarizeValue(nextValue),
      };
    }
  }

  return { changedKeys, changes };
}

/**
 * Summarize a value for logging (avoid large objects).
 */
function summarizeValue(value: unknown): unknown {
  if (value === undefined) return '[undefined]';
  if (value === null) return null;
  if (typeof value === 'function')
    return `[function ${(value as { name?: string }).name ?? 'anonymous'}]`;
  if (typeof value === 'symbol') return `[symbol]`;

  if (Array.isArray(value)) {
    if (value.length > 5) {
      return `[Array(${String(value.length)})]`;
    }
    return value.map((v) => summarizeValue(v));
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 5) {
      return `[Object(${String(keys.length)} keys)]`;
    }
    // Check if serializable
    try {
      const json = JSON.stringify(value);
      if (json.length > 200) {
        return `[Object(${String(keys.length)} keys)]`;
      }
      return value;
    } catch {
      return `[Object]`;
    }
  }

  return value;
}
