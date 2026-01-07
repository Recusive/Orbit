/**
 * Performance & Memory monitoring wrapper for dev-monitor.
 *
 * Provides automatic capture of:
 * - Unhandled errors (window.onerror, window.onunhandledrejection)
 * - React warnings (console.error interception)
 * - Long tasks (PerformanceObserver)
 * - Periodic memory snapshots
 * - Console logs (error/warn)
 *
 * All capture functions follow the error isolation pattern:
 * monitoring errors never crash the application.
 */

import { captureEvent } from '../core/storage';

import type { InitOptions, Severity } from '../core/types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Cleanup functions for all active captures */
interface CaptureCleanup {
  unhandledErrors?: () => void;
  unhandledRejections?: () => void;
  reactWarnings?: () => void;
  longTasks?: () => void;
  memoryPeriodic?: () => void;
  consoleLogs?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/** Active cleanup functions */
let activeCleanup: CaptureCleanup = {};

/** Whether auto-capture is currently active */
let isActive = false;

// ═══════════════════════════════════════════════════════════════
// Unhandled Errors
// ═══════════════════════════════════════════════════════════════

/**
 * Capture unhandled JavaScript errors via window.onerror.
 */
function setupUnhandledErrors(): () => void {
  const originalOnError = window.onerror;

  window.onerror = (
    message: Event | string,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ): boolean => {
    try {
      const errorMessage = typeof message === 'string' ? message : 'Unknown error';

      captureEvent({
        severity: 'critical',
        category: 'error:unhandled',
        file: source ?? 'unknown',
        function: 'window.onerror',
        title: `Unhandled error: ${errorMessage.slice(0, 100)}`,
        details: error?.stack ?? errorMessage,
        context: {
          source,
          lineno,
          colno,
          errorName: error?.name,
        },
        // Only add line if defined (spread undefined object is no-op)
        ...(lineno !== undefined ? { line: lineno } : {}),
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] Unhandled error capture failed:', err);
    }

    // Call original handler if it exists
    if (typeof originalOnError === 'function') {
      return originalOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  return (): void => {
    window.onerror = originalOnError;
  };
}

// ═══════════════════════════════════════════════════════════════
// Unhandled Promise Rejections
// ═══════════════════════════════════════════════════════════════

/**
 * Capture unhandled promise rejections.
 */
function setupUnhandledRejections(): () => void {
  const handler = (event: PromiseRejectionEvent): void => {
    try {
      const reason: unknown = event.reason;
      let message = 'Unknown rejection';
      let stack: string | undefined;

      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack;
      } else if (typeof reason === 'string') {
        message = reason;
      } else if (reason !== null && reason !== undefined) {
        // For objects, use JSON.stringify to get meaningful output
        try {
          message = JSON.stringify(reason);
        } catch {
          message = '[non-serializable object]';
        }
      }

      captureEvent({
        severity: 'critical',
        category: 'error:unhandled-rejection',
        file: 'promise',
        function: 'unhandledrejection',
        title: `Unhandled rejection: ${message.slice(0, 100)}`,
        details: stack ?? message,
        context: {
          reasonType: typeof reason,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] Unhandled rejection capture failed:', err);
    }
  };

  window.addEventListener('unhandledrejection', handler);

  return (): void => {
    window.removeEventListener('unhandledrejection', handler);
  };
}

// ═══════════════════════════════════════════════════════════════
// React Warnings
// ═══════════════════════════════════════════════════════════════

/**
 * Capture React warnings from console.error.
 *
 * React logs warnings with specific prefixes that we can detect.
 */
function setupReactWarnings(): () => void {
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]): void => {
    try {
      const firstArg = args[0];
      if (typeof firstArg === 'string') {
        // Detect React-specific warnings
        const isReactWarning =
          firstArg.includes('Warning:') ||
          firstArg.includes('React') ||
          firstArg.includes('Invalid prop') ||
          firstArg.includes('Failed prop type') ||
          firstArg.includes('Each child in a list') ||
          firstArg.includes('Cannot update a component');

        if (isReactWarning) {
          const severity: Severity = firstArg.includes('Error') ? 'error' : 'warning';

          captureEvent({
            severity,
            category: 'react:warning',
            file: 'react',
            function: 'console.error',
            title: firstArg.slice(0, 150),
            details: args.map((a) => String(a)).join(' '),
            context: {
              argCount: args.length,
            },
          });
        }
      }
    } catch {
      // Silently fail - don't recurse into console.error
    }

    // Always call original
    originalConsoleError.apply(console, args);
  };

  return (): void => {
    console.error = originalConsoleError;
  };
}

// ═══════════════════════════════════════════════════════════════
// Long Tasks
// ═══════════════════════════════════════════════════════════════

/**
 * Capture long tasks (>50ms) via PerformanceObserver.
 *
 * Long tasks block the main thread and cause UI jank.
 */
function setupLongTasks(): () => void {
  // Check if PerformanceObserver is available
  if (typeof PerformanceObserver === 'undefined') {
    return (): void => {
      // No-op cleanup
    };
  }

  let observer: PerformanceObserver | null = null;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        try {
          const duration = entry.duration;
          const severity: Severity = duration > 100 ? 'error' : 'perf';

          captureEvent({
            severity,
            category: duration > 100 ? 'perf:long-task:critical' : 'perf:long-task',
            file: 'main-thread',
            function: entry.name || 'unknown',
            title: `Long task: ${duration.toFixed(1)}ms`,
            context: {
              duration_ms: duration,
              startTime: entry.startTime,
              entryType: entry.entryType,
            },
          });
        } catch (err: unknown) {
          console.error('[DevMonitor] Long task capture failed:', err);
        }
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // PerformanceObserver for longtask not supported
    console.warn('[DevMonitor] Long task observer not supported');
  }

  return (): void => {
    if (observer !== null) {
      observer.disconnect();
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Memory Periodic
// ═══════════════════════════════════════════════════════════════

/** Extended Performance interface with memory property */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * Periodic memory snapshots every 30 seconds.
 */
function setupMemoryPeriodic(): () => void {
  const INTERVAL_MS = 30000; // 30 seconds

  // Track previous memory to calculate deltas
  let previousUsedHeap = 0;

  const captureMemory = (): void => {
    try {
      const perf = performance as PerformanceWithMemory;
      const memory = perf.memory;

      if (memory !== undefined) {
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
        const usagePercent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

        // Calculate delta from previous snapshot
        const deltaBytes = memory.usedJSHeapSize - previousUsedHeap;
        const deltaMB = Math.round(deltaBytes / 1024 / 1024);
        previousUsedHeap = memory.usedJSHeapSize;

        // Determine severity based on usage
        let severity: Severity = 'info';
        if (usagePercent > 90) {
          severity = 'critical';
        } else if (usagePercent > 75) {
          severity = 'warning';
        } else if (deltaMB > 50) {
          // Significant memory growth
          severity = 'perf';
        }

        captureEvent({
          severity,
          category:
            usagePercent > 75
              ? 'memory:periodic:high'
              : deltaMB > 20
                ? 'memory:periodic:growing'
                : 'memory:periodic',
          file: 'memory',
          function: 'periodic',
          title: `Memory: ${String(usedMB)}MB / ${String(limitMB)}MB (${String(usagePercent)}%)`,
          context: {
            usedHeap: memory.usedJSHeapSize,
            totalHeap: memory.totalJSHeapSize,
            heapLimit: memory.jsHeapSizeLimit,
            usedMB,
            totalMB,
            limitMB,
            usagePercent,
            deltaMB,
          },
        });
      }
    } catch (err: unknown) {
      console.error('[DevMonitor] Memory periodic capture failed:', err);
    }
  };

  // Capture initial snapshot
  captureMemory();

  // Set up periodic capture
  const intervalId = setInterval(captureMemory, INTERVAL_MS);

  return (): void => {
    clearInterval(intervalId);
  };
}

// ═══════════════════════════════════════════════════════════════
// Console Logs
// ═══════════════════════════════════════════════════════════════

/**
 * Capture console.error and console.warn calls.
 */
function setupConsoleLogs(): () => void {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  // Track the React warnings handler to avoid double-capture
  const isReactWarning = (msg: string): boolean =>
    msg.includes('Warning:') ||
    msg.includes('React') ||
    msg.includes('Invalid prop') ||
    msg.includes('Failed prop type');

  console.error = (...args: unknown[]): void => {
    try {
      const firstArg = args[0];
      const message = typeof firstArg === 'string' ? firstArg : String(firstArg);

      // Skip React warnings (captured by setupReactWarnings)
      if (!isReactWarning(message)) {
        captureEvent({
          severity: 'error',
          category: 'console:error',
          file: 'console',
          function: 'error',
          title: message.slice(0, 150),
          context: {
            argCount: args.length,
          },
          // Only add details if there are multiple args
          ...(args.length > 1 ? { details: args.map((a) => String(a)).join(' ') } : {}),
        });
      }
    } catch {
      // Silently fail
    }

    originalConsoleError.apply(console, args);
  };

  console.warn = (...args: unknown[]): void => {
    try {
      const firstArg = args[0];
      const message = typeof firstArg === 'string' ? firstArg : String(firstArg);

      captureEvent({
        severity: 'warning',
        category: 'console:warn',
        file: 'console',
        function: 'warn',
        title: message.slice(0, 150),
        context: {
          argCount: args.length,
        },
        // Only add details if there are multiple args
        ...(args.length > 1 ? { details: args.map((a) => String(a)).join(' ') } : {}),
      });
    } catch {
      // Silently fail
    }

    originalConsoleWarn.apply(console, args);
  };

  return (): void => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  };
}

// ═══════════════════════════════════════════════════════════════
// Main Setup / Teardown
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize all auto-capture features based on options.
 *
 * @param options - Configuration for which captures to enable
 * @returns Cleanup function to disable all captures
 */
export function setupAutoCapture(options: InitOptions = {}): () => void {
  if (isActive) {
    console.warn('[DevMonitor] Auto-capture already active');
    return (): void => {
      teardownAutoCapture();
    };
  }

  const {
    captureUnhandledErrors = true,
    captureUnhandledRejections = true,
    captureReactWarnings = true,
    captureLongTasks = true,
    captureMemoryPeriodic = true,
    captureConsoleLogs = true,
  } = options;

  // Set up each capture type
  if (captureUnhandledErrors) {
    activeCleanup.unhandledErrors = setupUnhandledErrors();
  }

  if (captureUnhandledRejections) {
    activeCleanup.unhandledRejections = setupUnhandledRejections();
  }

  if (captureReactWarnings) {
    activeCleanup.reactWarnings = setupReactWarnings();
  }

  if (captureLongTasks) {
    activeCleanup.longTasks = setupLongTasks();
  }

  if (captureMemoryPeriodic) {
    activeCleanup.memoryPeriodic = setupMemoryPeriodic();
  }

  if (captureConsoleLogs) {
    activeCleanup.consoleLogs = setupConsoleLogs();
  }

  isActive = true;

  // Log what was enabled
  try {
    captureEvent({
      severity: 'info',
      category: 'perf:auto-capture:init',
      file: 'performance',
      function: 'setupAutoCapture',
      title: 'Auto-capture initialized',
      context: {
        enabled: {
          unhandledErrors: captureUnhandledErrors,
          unhandledRejections: captureUnhandledRejections,
          reactWarnings: captureReactWarnings,
          longTasks: captureLongTasks,
          memoryPeriodic: captureMemoryPeriodic,
          consoleLogs: captureConsoleLogs,
        },
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] Auto-capture init log failed:', err);
  }

  return (): void => {
    teardownAutoCapture();
  };
}

/**
 * Tear down all active auto-capture features.
 */
export function teardownAutoCapture(): void {
  if (!isActive) {
    return;
  }

  // Call all cleanup functions
  if (activeCleanup.unhandledErrors !== undefined) {
    activeCleanup.unhandledErrors();
  }
  if (activeCleanup.unhandledRejections !== undefined) {
    activeCleanup.unhandledRejections();
  }
  if (activeCleanup.reactWarnings !== undefined) {
    activeCleanup.reactWarnings();
  }
  if (activeCleanup.longTasks !== undefined) {
    activeCleanup.longTasks();
  }
  if (activeCleanup.memoryPeriodic !== undefined) {
    activeCleanup.memoryPeriodic();
  }
  if (activeCleanup.consoleLogs !== undefined) {
    activeCleanup.consoleLogs();
  }

  // Reset state
  activeCleanup = {};
  isActive = false;

  try {
    captureEvent({
      severity: 'info',
      category: 'perf:auto-capture:shutdown',
      file: 'performance',
      function: 'teardownAutoCapture',
      title: 'Auto-capture shutdown',
      context: {},
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] Auto-capture shutdown log failed:', err);
  }
}

/**
 * Check if auto-capture is currently active.
 */
export function isAutoCaptureActive(): boolean {
  return isActive;
}

// ═══════════════════════════════════════════════════════════════
// Manual Triggers
// ═══════════════════════════════════════════════════════════════

/**
 * Force a memory snapshot outside the periodic interval.
 */
export function captureMemoryNow(label: string): void {
  try {
    const perf = performance as PerformanceWithMemory;
    const memory = perf.memory;

    if (memory !== undefined) {
      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      const usagePercent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

      captureEvent({
        severity: usagePercent > 75 ? 'warning' : 'info',
        category: 'memory:manual',
        file: 'memory',
        function: label,
        title: `Memory (${label}): ${String(usedMB)}MB / ${String(limitMB)}MB`,
        context: {
          label,
          usedHeap: memory.usedJSHeapSize,
          totalHeap: memory.totalJSHeapSize,
          heapLimit: memory.jsHeapSizeLimit,
          usedMB,
          limitMB,
          usagePercent,
        },
      });
    } else {
      captureEvent({
        severity: 'info',
        category: 'memory:manual',
        file: 'memory',
        function: label,
        title: `Memory (${label}): API not available`,
        context: {
          label,
          note: 'performance.memory not available in this browser',
        },
      });
    }
  } catch (err: unknown) {
    console.error('[DevMonitor] Manual memory capture failed:', err);
  }
}

/**
 * Mark a performance timeline entry.
 *
 * Creates a performance mark that can be viewed in Chrome DevTools.
 */
export function markPerformance(name: string): void {
  try {
    performance.mark(`devmonitor:${name}`);

    captureEvent({
      severity: 'info',
      category: 'perf:mark',
      file: 'performance',
      function: name,
      title: `Performance mark: ${name}`,
      context: {
        timestamp: performance.now(),
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] Performance mark failed:', err);
  }
}

/**
 * Measure between two performance marks.
 */
export function measurePerformance(name: string, startMark: string, endMark: string): void {
  try {
    const measureName = `devmonitor:${name}`;
    performance.measure(measureName, `devmonitor:${startMark}`, `devmonitor:${endMark}`);

    const entries = performance.getEntriesByName(measureName, 'measure');
    const entry = entries[entries.length - 1];

    if (entry !== undefined) {
      const severity: Severity = entry.duration > 100 ? 'perf' : 'info';

      captureEvent({
        severity,
        category: entry.duration > 100 ? 'perf:measure:slow' : 'perf:measure',
        file: 'performance',
        function: name,
        title: `Measure ${name}: ${entry.duration.toFixed(1)}ms`,
        context: {
          duration_ms: entry.duration,
          startMark,
          endMark,
        },
      });
    }
  } catch (err: unknown) {
    console.error('[DevMonitor] Performance measure failed:', err);
  }
}
