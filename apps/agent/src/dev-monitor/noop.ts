/**
 * No-op implementations for production builds.
 *
 * These pass-through implementations ensure zero overhead in production.
 * The trace object starts with these, and in dev mode switches to real
 * implementations after initDevMonitor() is called.
 */

import type { EffectReturn, SafeParseResult, Severity, Trace } from './types';
import type { Extension } from '@codemirror/state';
import type { Terminal } from '@xterm/xterm';
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

// ═══════════════════════════════════════════════════════════════
// No-op Trace Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Production no-op trace object.
 *
 * All methods are pass-through or empty functions that add zero overhead.
 * This is used:
 * 1. In production builds (tree-shaken to just these implementations)
 * 2. Before initDevMonitor() is called in dev builds
 */
export const noopTrace: Trace = {
  // ═══════════════════════════════════════════════════════════
  // Core Wrappers - Pass through original implementations
  // ═══════════════════════════════════════════════════════════

  fn: <TArgs extends readonly unknown[], TReturn>(
    _name: string,
    impl: (...args: TArgs) => TReturn
  ): ((...args: TArgs) => TReturn) => impl,

  component: <P extends object>(Component: React.FC<P>): React.FC<P> => Component,

  hook: <TArgs extends readonly unknown[], TReturn>(
    _name: string,
    impl: (...args: TArgs) => TReturn
  ): ((...args: TArgs) => TReturn) => impl,

  effect: (_name: string, fn: () => EffectReturn | Promise<undefined>): EffectReturn => {
    // Execute the function and return cleanup if provided
    const result = fn();
    if (typeof result === 'function') {
      return result;
    }
    // Promise or undefined - no cleanup
    return undefined;
  },

  // ═══════════════════════════════════════════════════════════
  // Validation - Pass through to schema
  // ═══════════════════════════════════════════════════════════

  zod: <TOutput>(
    schema: { safeParse: (data: unknown) => SafeParseResult<TOutput> },
    data: unknown,
    schemaName: string
  ): SafeParseResult<TOutput> => {
    void schemaName;
    return schema.safeParse(data);
  },

  // ═══════════════════════════════════════════════════════════
  // State Management - Pass through config
  // ═══════════════════════════════════════════════════════════

  zustand: <
    T,
    Mps extends [StoreMutatorIdentifier, unknown][] = [],
    Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  >(
    _storeName: string,
    config: StateCreator<T, Mps, Mcs>
  ): StateCreator<T, Mps, Mcs> => config,

  // ═══════════════════════════════════════════════════════════
  // IPC & Backend - Delegate to real Tauri
  // These need async imports to avoid bundling Tauri in the noop
  // ═══════════════════════════════════════════════════════════

  invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(command, args);
  },

  listen: async <T>(
    event: string,
    handler: (event: { payload: T }) => T | undefined
  ): Promise<() => void> => {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    const unlisten = await tauriListen<T>(event, (e) => {
      handler(e);
    });
    return unlisten;
  },

  emit: async (event: string, payload?: unknown): Promise<void> => {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
  },

  // ═══════════════════════════════════════════════════════════
  // Editor & Terminal - Pass through
  // ═══════════════════════════════════════════════════════════

  codemirror: (_name: string, extensions: Extension[]): Extension[] => extensions,

  xterm: (_name: string, terminal: Terminal): Terminal => terminal,

  // ═══════════════════════════════════════════════════════════
  // AI/SDK - Pass through
  // ═══════════════════════════════════════════════════════════

  sdk: <T extends object>(_name: string, client: T): T => client,

  sdkCall: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),

  // ═══════════════════════════════════════════════════════════
  // Memory & Performance - Empty functions
  // ═══════════════════════════════════════════════════════════

  memory: (label: string): void => {
    void label;
  },

  perf: (name: string): (() => void) => {
    void name;
    return (): void => {
      // No-op cleanup
    };
  },

  // ═══════════════════════════════════════════════════════════
  // Rust Integration - Empty
  // ═══════════════════════════════════════════════════════════

  rust: {
    subscribe: (): Promise<() => void> => {
      return Promise.resolve((): void => {
        // No-op cleanup
      });
    },
  },

  // ═══════════════════════════════════════════════════════════
  // Manual Logging - Empty
  // ═══════════════════════════════════════════════════════════

  log: (
    severity: Severity,
    category: string,
    title: string,
    context?: Record<string, unknown>
  ): void => {
    void severity;
    void category;
    void title;
    void context;
  },
};
