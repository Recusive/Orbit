/**
 * Performance Logging Module
 *
 * Provides timing and profiling utilities for agent-bridge operations.
 * All output goes to stderr to avoid polluting stdout JSON IPC.
 */
export {
  perfStart,
  perfEnd,
  perfEndWithTokens,
  perfEndWithCount,
  perfEvent,
  PerfTimer,
} from './perf.js';

export type { TokenCounts } from './perf.js';
