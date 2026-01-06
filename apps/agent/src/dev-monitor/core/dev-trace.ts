/**
 * Real trace implementation for development builds.
 *
 * This module is dynamically imported only in dev mode.
 * It provides the actual monitoring implementations.
 */

import { codemirrorWrapper } from '../wrappers/codemirror';
import { componentWrapper } from '../wrappers/component';
import { fnWrapper } from '../wrappers/fn';
import { invokeWrapper } from '../wrappers/invoke';
import {
  captureMemoryNow,
  markPerformance,
  measurePerformance,
  setupAutoCapture,
  teardownAutoCapture,
} from '../wrappers/performance';
import { subscribeToRustTracing } from '../wrappers/rust';
import { sdkCallWrapper, sdkWrapper } from '../wrappers/sdk';
import { xtermWrapper } from '../wrappers/xterm';
import { zodWrapper } from '../wrappers/zod';
import { zustandWrapper } from '../wrappers/zustand';

import { clearDedup } from './dedup';
import { captureEvent, initStorage, shutdownStorage } from './storage';

import type {
  CodeMirrorOptions,
  ComponentOptions,
  EffectOptions,
  EffectReturn,
  FnOptions,
  HookOptions,
  InitOptions,
  SdkOptions,
  Severity,
  Trace,
  XtermOptions,
} from './types';
import type { Extension } from '@codemirror/state';
import type { Terminal } from '@xterm/xterm';

// ═══════════════════════════════════════════════════════════════
// Real Trace Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * The real trace object with actual monitoring implementations.
 */
export const devTrace: Trace = {
  // ═══════════════════════════════════════════════════════════
  // Core Wrappers
  // ═══════════════════════════════════════════════════════════

  fn: <TArgs extends readonly unknown[], TReturn>(
    name: string,
    impl: (...args: TArgs) => TReturn,
    options?: FnOptions
  ): ((...args: TArgs) => TReturn) => fnWrapper(name, impl, options),

  component: <P extends object>(Component: React.FC<P>, options?: ComponentOptions): React.FC<P> =>
    componentWrapper(Component, options),

  hook: <TArgs extends readonly unknown[], TReturn>(
    name: string,
    impl: (...args: TArgs) => TReturn,
    options?: HookOptions
  ): ((...args: TArgs) => TReturn) => {
    // Hooks are basically functions, but we use a different category
    return fnWrapper(name, impl, {
      category: options?.category ?? 'hook:call',
    });
  },

  effect: (
    name: string,
    fn: () => EffectReturn | Promise<undefined>,
    options?: EffectOptions
  ): EffectReturn => {
    const category = options?.category ?? 'effect:run';
    const start = performance.now();

    // Pre-execution monitoring
    try {
      captureEvent({
        severity: 'info',
        category,
        file: 'unknown',
        function: name,
        title: `${name} effect started`,
        context: {},
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] effect pre-run error:', err);
    }

    // Execute the effect
    let result: EffectReturn | Promise<undefined>;
    try {
      result = fn();
    } catch (err: unknown) {
      try {
        captureEvent({
          severity: 'error',
          category: `${category}:error`,
          file: 'unknown',
          function: name,
          title: `${name} effect threw error`,
          details: err instanceof Error ? err.message : String(err),
          context: {},
        });
      } catch (monitorErr: unknown) {
        console.error('[DevMonitor] effect error capture failed:', monitorErr);
      }
      throw err;
    }

    // Handle cleanup function
    if (typeof result === 'function') {
      const cleanup = result;
      return (): void => {
        try {
          captureEvent({
            severity: 'info',
            category: `${category}:cleanup`,
            file: 'unknown',
            function: name,
            title: `${name} effect cleanup`,
            context: {
              lifetime_ms: performance.now() - start,
            },
          });
        } catch (err: unknown) {
          console.error('[DevMonitor] effect cleanup capture failed:', err);
        }
        cleanup();
      };
    }

    // Handle Promise (async effect)
    if (result instanceof Promise) {
      void result.then(
        () => {
          try {
            captureEvent({
              severity: 'info',
              category: `${category}:complete`,
              file: 'unknown',
              function: name,
              title: `${name} effect completed`,
              context: {
                duration_ms: performance.now() - start,
              },
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] effect complete capture failed:', err);
          }
        },
        (err: unknown) => {
          try {
            captureEvent({
              severity: 'error',
              category: `${category}:error`,
              file: 'unknown',
              function: name,
              title: `${name} async effect failed`,
              details: err instanceof Error ? err.message : String(err),
              context: {},
            });
          } catch (monitorErr: unknown) {
            console.error('[DevMonitor] effect error capture failed:', monitorErr);
          }
        }
      );
    }

    return undefined;
  },

  // ═══════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════

  zod: zodWrapper,

  // ═══════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════

  zustand: zustandWrapper,

  // ═══════════════════════════════════════════════════════════
  // IPC & Backend
  // ═══════════════════════════════════════════════════════════

  invoke: invokeWrapper,

  listen: async <T>(
    event: string,
    handler: (event: { payload: T }) => T | undefined
  ): Promise<() => void> => {
    try {
      captureEvent({
        severity: 'info',
        category: 'ipc:listen',
        file: 'tauri',
        function: event,
        title: `listen(${event}) subscribed`,
        context: {},
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] listen subscribe capture failed:', err);
    }

    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    const unlisten = await tauriListen<T>(event, (e) => {
      try {
        captureEvent({
          severity: 'info',
          category: 'ipc:event',
          file: 'tauri',
          function: event,
          title: `event(${event}) received`,
          context: {},
        });
      } catch (err: unknown) {
        console.error('[DevMonitor] event receive capture failed:', err);
      }
      handler(e);
    });

    return (): void => {
      try {
        captureEvent({
          severity: 'info',
          category: 'ipc:listen:unsubscribe',
          file: 'tauri',
          function: event,
          title: `listen(${event}) unsubscribed`,
          context: {},
        });
      } catch (err: unknown) {
        console.error('[DevMonitor] listen unsubscribe capture failed:', err);
      }
      unlisten();
    };
  },

  emit: async (event: string, payload?: unknown): Promise<void> => {
    try {
      captureEvent({
        severity: 'info',
        category: 'ipc:emit',
        file: 'tauri',
        function: event,
        title: `emit(${event})`,
        context: {
          hasPayload: payload !== undefined,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] emit capture failed:', err);
    }

    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
  },

  // ═══════════════════════════════════════════════════════════
  // Editor & Terminal
  // ═══════════════════════════════════════════════════════════

  codemirror: (name: string, extensions: Extension[], options?: CodeMirrorOptions): Extension[] =>
    codemirrorWrapper(name, extensions, options),

  xterm: (name: string, terminal: Terminal, options?: XtermOptions): Terminal =>
    xtermWrapper(name, terminal, options),

  // ═══════════════════════════════════════════════════════════
  // AI/SDK
  // ═══════════════════════════════════════════════════════════

  sdk: <T extends object>(name: string, client: T, options?: SdkOptions): T => {
    const wrapperOptions: { slowThreshold?: number } = {};
    if (options?.slowThreshold !== undefined) {
      wrapperOptions.slowThreshold = options.slowThreshold;
    }
    return sdkWrapper(name, client, wrapperOptions);
  },

  sdkCall: async <T>(name: string, fn: () => Promise<T>, options?: SdkOptions): Promise<T> => {
    const callOptions: { context?: Record<string, unknown> } = {};
    if (options?.slowThreshold !== undefined) {
      callOptions.context = { slowThreshold: options.slowThreshold };
    }
    return sdkCallWrapper(name, fn, callOptions);
  },

  // ═══════════════════════════════════════════════════════════
  // Memory & Performance (Phase 4)
  // ═══════════════════════════════════════════════════════════

  memory: (label: string): void => {
    captureMemoryNow(label);
  },

  perf: (name: string): (() => void) => {
    const start = performance.now();

    // Mark the start for DevTools timeline
    markPerformance(`${name}:start`);

    try {
      captureEvent({
        severity: 'info',
        category: 'perf:start',
        file: 'perf',
        function: name,
        title: `Perf: ${name} started`,
        context: {},
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] perf start capture failed:', err);
    }

    return (): void => {
      // Mark the end for DevTools timeline
      markPerformance(`${name}:end`);
      measurePerformance(name, `${name}:start`, `${name}:end`);

      try {
        const duration = performance.now() - start;
        const severity = duration > 100 ? 'perf' : 'info';

        captureEvent({
          severity,
          category: duration > 100 ? 'perf:slow' : 'perf:end',
          file: 'perf',
          function: name,
          title: `Perf: ${name} (${duration.toFixed(1)}ms)`,
          context: {
            duration_ms: duration,
          },
        });
      } catch (err: unknown) {
        console.error('[DevMonitor] perf end capture failed:', err);
      }
    };
  },

  // ═══════════════════════════════════════════════════════════
  // Rust Integration
  // ═══════════════════════════════════════════════════════════

  rust: {
    subscribe: (): Promise<() => void> => subscribeToRustTracing(),
  },

  // ═══════════════════════════════════════════════════════════
  // Manual Logging
  // ═══════════════════════════════════════════════════════════

  log: (
    severity: Severity,
    category: string,
    title: string,
    context: Record<string, unknown> = {}
  ): void => {
    try {
      captureEvent({
        severity,
        category,
        file: 'manual',
        title,
        context,
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] log capture failed:', err);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the dev-monitor system.
 *
 * Called by initDevMonitor() after switching to real trace.
 */
export async function init(options: InitOptions = {}): Promise<void> {
  // Initialize storage
  await initStorage(options);

  // Set up auto-capture (Phase 4)
  // This enables automatic capture of:
  // - Unhandled errors (window.onerror)
  // - Unhandled promise rejections
  // - React warnings (console.error interception)
  // - Long tasks (>50ms via PerformanceObserver)
  // - Periodic memory snapshots (every 30s)
  // - Console logs (error/warn)
  setupAutoCapture(options);

  // Log initialization
  try {
    captureEvent({
      severity: 'info',
      category: 'devmonitor:init',
      file: 'dev-monitor',
      function: 'init',
      title: 'DevMonitor initialized',
      context: {
        options: {
          outputDir: options.outputDir ?? '.dev-monitor',
          flushInterval: options.flushInterval ?? 1000,
          maxBatchSize: options.maxBatchSize ?? 100,
          captureUnhandledErrors: options.captureUnhandledErrors ?? true,
          captureUnhandledRejections: options.captureUnhandledRejections ?? true,
          captureReactWarnings: options.captureReactWarnings ?? true,
          captureLongTasks: options.captureLongTasks ?? true,
          captureMemoryPeriodic: options.captureMemoryPeriodic ?? true,
          captureConsoleLogs: options.captureConsoleLogs ?? true,
        },
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] init capture failed:', err);
  }

  // Set up shutdown handler
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      void shutdown();
    });
  }
}

/**
 * Shutdown the dev-monitor system.
 */
export async function shutdown(): Promise<void> {
  try {
    captureEvent({
      severity: 'info',
      category: 'devmonitor:shutdown',
      file: 'dev-monitor',
      function: 'shutdown',
      title: 'DevMonitor shutting down',
      context: {},
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] shutdown capture failed:', err);
  }

  // Tear down auto-capture (Phase 4)
  // This restores original window.onerror, console methods, etc.
  teardownAutoCapture();

  await shutdownStorage();
  clearDedup();
}
