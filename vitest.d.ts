/**
 * Vitest Global Type Declarations
 *
 * This file extends the global namespace with test utilities
 * that are available when running Vitest with `globals: true`.
 *
 * These utilities are defined in vitest.setup.ts
 */

import 'vitest/globals';

declare global {
  /**
   * Wait for the next event loop tick.
   * Useful for waiting for async state updates.
   *
   * @example
   * ```typescript
   * store.setState({ loading: true });
   * await waitForNextTick();
   * expect(store.getState().loading).toBe(true);
   * ```
   */
  function waitForNextTick(): Promise<void>;

  /**
   * Wait for a specified number of milliseconds.
   *
   * @param ms - Milliseconds to wait
   *
   * @example
   * ```typescript
   * await wait(100);
   * expect(something).toHaveBeenCalled();
   * ```
   */
  function wait(ms: number): Promise<void>;
}

export {};
