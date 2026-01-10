/**
 * Performance API - Tauri IPC functions for performance monitoring
 *
 * This module provides access to the performance logging system.
 * DEV-ONLY: Should only be used for debugging purposes.
 */

import { invoke } from './core';

// ============================================
// Types
// ============================================

/**
 * Summary statistics for a single source (IPC, GIT, SIDECAR, etc.)
 */
export interface SourceSummary {
  readonly count: number;
  readonly avg_ms: number;
  readonly max_ms: number;
  readonly min_ms: number;
  readonly total_ms: number;
}

/**
 * A single operation record from the log
 */
export interface OperationRecord {
  readonly timestamp: number;
  readonly source: string;
  readonly operation: string;
  readonly duration_ms: number | null;
  readonly metadata: string | null;
}

/**
 * Complete performance analysis summary
 */
export interface PerformanceAnalysis {
  readonly total_entries: number;
  readonly total_operations: number;
  readonly by_source: Record<string, SourceSummary>;
  readonly bottlenecks: readonly OperationRecord[];
  readonly slowest: readonly OperationRecord[];
  readonly timeline: readonly OperationRecord[];
}

/**
 * Recent performance events for jank correlation
 */
export interface RecentPerfEvents {
  readonly query_timestamp: number;
  readonly events: readonly OperationRecord[];
  readonly window_ms: number;
  readonly count: number;
}

// ============================================
// API Functions
// ============================================

/**
 * Analyze the performance log and return a comprehensive summary.
 *
 * Returns statistics by source, bottlenecks (>500ms), slowest operations,
 * and a timeline of the last 50 operations.
 */
export async function analyzePerformance(): Promise<PerformanceAnalysis> {
  return invoke<PerformanceAnalysis>('analyze_performance');
}

/**
 * Get the raw performance log contents.
 *
 * Returns the full log file as a string.
 */
export async function getPerfLog(): Promise<string> {
  return invoke<string>('get_perf_log');
}

/**
 * Clear the performance log file.
 *
 * Returns true on success, false on failure.
 */
export async function clearPerfLog(): Promise<boolean> {
  return invoke<boolean>('clear_perf_log');
}

/**
 * Get the path to the performance log file.
 *
 * Useful for opening the file in an external editor.
 */
export async function getPerfLogPath(): Promise<string> {
  return invoke<string>('get_perf_log_path');
}

/**
 * Get recent performance events within a time window.
 *
 * Used for jank correlation - fetches backend activity that occurred
 * during/before a detected UI freeze.
 *
 * @param windowMs - Time window in milliseconds to look back (default: 2000ms)
 */
export async function getRecentPerfEvents(windowMs?: number): Promise<RecentPerfEvents> {
  return invoke<RecentPerfEvents>('get_recent_perf_events', { window_ms: windowMs });
}
