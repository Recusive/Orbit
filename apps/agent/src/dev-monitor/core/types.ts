/**
 * Type definitions for the dev-monitor system.
 *
 * This module contains all types, interfaces, and Zod schemas used by the
 * dev-monitor tap-in/tap-out monitoring system.
 */

import type { Extension } from '@codemirror/state';
import type { Terminal } from '@xterm/xterm';
import type { FC } from 'react';
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

// ═══════════════════════════════════════════════════════════════
// Zod Types (compatible with Zod 4)
// ═══════════════════════════════════════════════════════════════

/** Safe parse result type - matches Zod's safeParse return */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { issues: { path: (string | number)[]; code: string; message: string }[] };
    };

/** Effect cleanup function */
export type EffectCleanup = () => void;

/** Effect return type - either undefined or a cleanup function */
export type EffectReturn = EffectCleanup | undefined;

// ═══════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════

/** Severity levels for log entries */
export type Severity = 'critical' | 'error' | 'warning' | 'info' | 'perf';

/** A single log entry written to events.jsonl */
export interface DevLogEntry {
  /** ISO timestamp */
  readonly ts: string;
  /** Severity level */
  readonly severity: Severity;
  /** Category for grouping (e.g., 'zod:parse', 'component:render') */
  readonly category: string;
  /** Source file path or identifier */
  readonly file: string;
  /** Line number (if available) */
  readonly line?: number;
  /** Function/component name */
  readonly function?: string;
  /** Short title for display */
  readonly title: string;
  /** Optional detailed message */
  readonly details?: string;
  /** Arbitrary structured context */
  readonly context: Record<string, unknown>;
  /** Dedup count (how many times this entry was seen, added by dedup) */
  readonly dedupCount?: number;
}

// ═══════════════════════════════════════════════════════════════
// Wrapper Options
// ═══════════════════════════════════════════════════════════════

/** Options for trace.fn() */
export interface FnOptions {
  /** Custom category (default: 'fn:call') */
  readonly category?: string;
  /** Threshold in ms for slow call warning (default: 100) */
  readonly slowThreshold?: number;
  /** Log function arguments (default: false) */
  readonly logArgs?: boolean;
  /** Log return value (default: false) */
  readonly logResult?: boolean;
}

/** Options for trace.component() */
export interface ComponentOptions {
  /** Custom category (default: 'component:render') */
  readonly category?: string;
  /** Threshold in ms for slow render warning (default: 16) */
  readonly slowThreshold?: number;
  /** Track prop changes (default: true) */
  readonly trackProps?: boolean;
}

/** Options for trace.hook() */
export interface HookOptions {
  /** Custom category (default: 'hook:call') */
  readonly category?: string;
}

/** Options for trace.effect() */
export interface EffectOptions {
  /** Custom category (default: 'effect:run') */
  readonly category?: string;
}

/** Options for trace.invoke() */
export interface InvokeOptions {
  /** Threshold in ms for slow call warning (default: 100) */
  readonly slowThreshold?: number;
}

/** Options for trace.zustand() */
export interface ZustandOptions {
  /** Track state diff on each mutation (default: true) */
  readonly trackDiff?: boolean;
  /** Warn if state exceeds this size in bytes (default: 100000) */
  readonly maxStateSize?: number;
}

/** Options for trace.codemirror() */
export interface CodeMirrorOptions {
  /** Threshold in ms for slow update warning (default: 16) */
  readonly slowThreshold?: number;
}

/** Options for trace.xterm() */
export interface XtermOptions {
  /** Threshold for writes per second warning (default: 100) */
  readonly writeStormThreshold?: number;
}

/** Options for trace.sdk() and trace.sdkCall() */
export interface SdkOptions {
  /** Track token usage (default: true) */
  readonly trackTokens?: boolean;
  /** Threshold in ms for slow call warning (default: 5000) */
  readonly slowThreshold?: number;
}

// ═══════════════════════════════════════════════════════════════
// Trace Interface
// ═══════════════════════════════════════════════════════════════

/** The main trace object interface */
export interface Trace {
  // ═══════════════════════════════════════════════════════════
  // Core Wrappers
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap any function to trace calls, arguments, returns, and errors.
   *
   * @example
   * export const processFile = trace.fn(
   *   'processFile',
   *   async (path: string): Promise<void> => { ... }
   * );
   */
  fn<TArgs extends readonly unknown[], TReturn>(
    name: string,
    implementation: (...args: TArgs) => TReturn,
    options?: FnOptions
  ): (...args: TArgs) => TReturn;

  /**
   * Wrap a React component to trace renders and prop changes.
   *
   * @example
   * export const MessageList = trace.component(
   *   function MessageList(props: Props): JSX.Element { ... }
   * );
   */
  component<P extends object>(Component: FC<P>, options?: ComponentOptions): FC<P>;

  /**
   * Wrap a custom React hook to trace calls and errors.
   *
   * @example
   * export const useFileOps = trace.hook(
   *   'useFileOps',
   *   function useFileOps() { ... }
   * );
   */
  hook<TArgs extends readonly unknown[], TReturn>(
    name: string,
    implementation: (...args: TArgs) => TReturn,
    options?: HookOptions
  ): (...args: TArgs) => TReturn;

  /**
   * Wrap useEffect logic to trace execution and cleanup.
   *
   * @example
   * useEffect(() => {
   *   return trace.effect('loadData', async () => {
   *     await loadData();
   *   });
   * }, [id]);
   */
  effect(
    name: string,
    fn: () => EffectReturn | Promise<undefined>,
    options?: EffectOptions
  ): EffectReturn;

  // ═══════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap Zod parsing to trace validation failures.
   *
   * @example
   * const result = trace.zod(UserSchema, data, 'UserSchema');
   */
  zod<TOutput>(
    schema: { safeParse: (data: unknown) => SafeParseResult<TOutput> },
    data: unknown,
    schemaName: string
  ): SafeParseResult<TOutput>;

  // ═══════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap a Zustand store to trace all mutations.
   *
   * @example
   * export const useStore = create<State>()(
   *   trace.zustand('MyStore', immer((set) => ({ ... })))
   * );
   */
  zustand<
    T,
    Mps extends [StoreMutatorIdentifier, unknown][] = [],
    Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  >(
    storeName: string,
    config: StateCreator<T, Mps, Mcs>,
    options?: ZustandOptions
  ): StateCreator<T, Mps, Mcs>;

  // ═══════════════════════════════════════════════════════════
  // IPC & Backend
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap Tauri invoke to trace IPC calls.
   *
   * @example
   * const content = await trace.invoke<string>('read_file', { path });
   */
  invoke<T>(command: string, args?: Record<string, unknown>, options?: InvokeOptions): Promise<T>;

  /**
   * Wrap Tauri event listener to trace subscriptions and events.
   *
   * @example
   * const unlisten = await trace.listen('terminal:output', (event) => { ... });
   */
  listen<T>(event: string, handler: (event: { payload: T }) => T | undefined): Promise<() => void>;

  /**
   * Wrap Tauri emit to trace event emissions.
   *
   * @example
   * await trace.emit('ui:action', { type: 'click' });
   */
  emit(event: string, payload?: unknown): Promise<void>;

  // ═══════════════════════════════════════════════════════════
  // Editor & Terminal
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap CodeMirror extensions to trace updates and errors.
   *
   * @example
   * const extensions = trace.codemirror('MainEditor', [javascript(), oneDark]);
   */
  codemirror(name: string, extensions: Extension[], options?: CodeMirrorOptions): Extension[];

  /**
   * Wrap Xterm terminal to trace writes and resize events.
   *
   * @example
   * const terminal = trace.xterm('MainTerminal', new Terminal(options));
   */
  xterm(name: string, terminal: Terminal, options?: XtermOptions): Terminal;

  // ═══════════════════════════════════════════════════════════
  // AI/SDK
  // ═══════════════════════════════════════════════════════════

  /**
   * Wrap an SDK client object to trace all method calls.
   *
   * @example
   * const client = trace.sdk('ClaudeAgent', originalClient);
   */
  sdk<T extends object>(name: string, client: T, options?: SdkOptions): T;

  /**
   * Wrap an individual SDK call.
   *
   * @example
   * const response = await trace.sdkCall('sendMessage', async () => {
   *   return await client.sendMessage(msg);
   * });
   */
  sdkCall<T>(name: string, fn: () => Promise<T>, options?: SdkOptions): Promise<T>;

  // ═══════════════════════════════════════════════════════════
  // Memory & Performance
  // ═══════════════════════════════════════════════════════════

  /**
   * Record a memory checkpoint.
   *
   * @example
   * trace.memory('after-file-load');
   */
  memory(label: string): void;

  /**
   * Start a performance measurement. Returns a function to end the measurement.
   *
   * @example
   * const end = trace.perf('heavy-operation');
   * // ... do work
   * end();
   */
  perf(name: string): () => void;

  // ═══════════════════════════════════════════════════════════
  // Rust Integration
  // ═══════════════════════════════════════════════════════════

  readonly rust: {
    /**
     * Subscribe to Rust tracing events forwarded from the backend.
     *
     * @example
     * await trace.rust.subscribe();
     */
    subscribe(): Promise<() => void>;
  };

  // ═══════════════════════════════════════════════════════════
  // Manual Logging
  // ═══════════════════════════════════════════════════════════

  /**
   * Log a custom event.
   *
   * @example
   * trace.log('info', 'custom:event', 'User clicked button', { buttonId: 'submit' });
   */
  log(severity: Severity, category: string, title: string, context?: Record<string, unknown>): void;
}

// ═══════════════════════════════════════════════════════════════
// Initialization Options
// ═══════════════════════════════════════════════════════════════

/** Options for initDevMonitor() */
export interface InitOptions {
  /** Capture window.onerror (default: true) */
  readonly captureUnhandledErrors?: boolean;
  /** Capture unhandled promise rejections (default: true) */
  readonly captureUnhandledRejections?: boolean;
  /** Capture React console.error warnings (default: true) */
  readonly captureReactWarnings?: boolean;
  /** Capture long tasks via PerformanceObserver (default: true) */
  readonly captureLongTasks?: boolean;
  /** Periodic memory checks every 30s (default: true) */
  readonly captureMemoryPeriodic?: boolean;
  /** Capture console.error/warn (default: true) */
  readonly captureConsoleLogs?: boolean;
  /** Output directory relative to workspace (default: '.dev-monitor') */
  readonly outputDir?: string;
  /** Flush interval in ms (default: 1000) */
  readonly flushInterval?: number;
  /** Max batch size before force flush (default: 100) */
  readonly maxBatchSize?: number;
}

// ═══════════════════════════════════════════════════════════════
// Rust Event Types
// ═══════════════════════════════════════════════════════════════

/** A log entry forwarded from Rust tracing */
export interface RustDevLogEntry {
  readonly level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  readonly target: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly function?: string;
  readonly fields: Record<string, unknown>;
  readonly span?: {
    readonly name: string;
    readonly duration_us?: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════

/** Entry without timestamp (added by captureEvent) */
export interface CaptureInput {
  readonly severity: Severity;
  readonly category: string;
  readonly file: string;
  readonly line?: number;
  readonly function?: string;
  readonly title: string;
  readonly details?: string;
  readonly context: Record<string, unknown>;
}
