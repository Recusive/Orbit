/**
 * Dev-Monitor: Tap-in/Tap-out Monitoring System
 *
 * This module provides the public API for dev-time monitoring.
 * All monitoring is dev-only and tree-shaken in production builds.
 *
 * Usage:
 * ```typescript
 * import { trace, initDevMonitor } from '@/dev-monitor';
 *
 * // Initialize in main.tsx (dev only)
 * if (import.meta.env.DEV) {
 *   await initDevMonitor();
 * }
 *
 * // Use trace wrappers anywhere
 * export const myFn = trace.fn('myFn', () => { ... });
 * export const MyComponent = trace.component(function MyComponent() { ... });
 * ```
 */

import { noopTrace } from './noop';

import type { InitOptions, Trace } from './types';

// ═══════════════════════════════════════════════════════════════
// Mutable Reference
// ═══════════════════════════════════════════════════════════════

/**
 * Mutable reference to the current trace implementation.
 *
 * Starts as noop (safe before init), switches to real after initDevMonitor().
 */
const _trace: { current: Trace } = { current: noopTrace };

// ═══════════════════════════════════════════════════════════════
// Proxy-based Trace Export
// ═══════════════════════════════════════════════════════════════

/**
 * The trace object for monitoring.
 *
 * This Proxy delegates to the current implementation, which:
 * - Is noopTrace before initDevMonitor() is called
 * - Is devTrace after initDevMonitor() is called
 * - Is always noopTrace in production (tree-shaken)
 *
 * Safe to import and use anywhere - works before and after init.
 */
export const trace: Trace = new Proxy({} as Trace, {
  get<K extends keyof Trace>(_target: unknown, prop: K): Trace[K] {
    return _trace.current[prop];
  },
});

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the dev-monitor system.
 *
 * This switches from noop to real implementations and starts
 * storage, auto-capture, and other monitoring features.
 *
 * In production builds, this is a no-op and the dynamic import
 * is tree-shaken away.
 *
 * @example
 * // main.tsx
 * if (import.meta.env.DEV) {
 *   await initDevMonitor();
 *   await trace.rust.subscribe();
 * }
 */
export async function initDevMonitor(options?: InitOptions): Promise<void> {
  // Production: do nothing (tree-shaken)
  if (import.meta.env.PROD) return;

  try {
    // Dynamic import only happens in dev
    const { devTrace, init } = await import('./dev-trace');

    // Switch the implementation
    _trace.current = devTrace;

    // Initialize auto-capture, storage, etc.
    await init(options);
  } catch (err: unknown) {
    // Init failed - stay on noop, log error
    console.error('[DevMonitor] Initialization failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Type Re-exports
// ═══════════════════════════════════════════════════════════════

export type {
  CaptureInput,
  CodeMirrorOptions,
  ComponentOptions,
  DevLogEntry,
  EffectCleanup,
  EffectOptions,
  EffectReturn,
  FnOptions,
  HookOptions,
  InitOptions,
  InvokeOptions,
  RustDevLogEntry,
  SdkOptions,
  Severity,
  Trace,
  XtermOptions,
  ZustandOptions,
} from './types';
