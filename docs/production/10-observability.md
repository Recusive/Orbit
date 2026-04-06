# Mission 10: Observability

> Frontend logger, request tracing, perf metrics.

---

## Why This Matters

When something goes wrong in Orbit today, debugging is archaeology. There are no structured frontend logs, no correlation IDs linking a frontend action to its Rust command to its sidecar request, no performance metrics tracking invoke latency or FPS, and no Sentry capturing errors in production. A user reports "the app feels slow after an hour" and we have zero data to diagnose it. A sidecar error propagates through three layers and we can't trace which user action triggered it.

Observability is the foundation that makes every other mission in this playbook debuggable, measurable, and verifiable.

---

## Current State

### No Structured Frontend Logger

The frontend has scattered `console.log` calls with no consistent format, no log levels, and no structured metadata:

```typescript
// Current: inconsistent, unstructured, no levels
console.log('Loading conversation', conversationId);
console.log('Error:', error);
console.log('[Chat]', 'message received');
```

The agent-bridge has `createLogger()` with levels and context prefixes, but the frontend does not have an equivalent.

### No Request Correlation IDs

A single user action (e.g., "send message") triggers a chain: Frontend invoke() -> Rust command -> Sidecar IPC -> Claude API. Each hop logs independently with no shared identifier:

```
// Frontend log: "Sending message abc123"
// Rust log: "Processing AI request"
// Sidecar log: "Starting Claude conversation"
// -- No way to correlate these three entries --
```

### No Performance Metrics

There is no systematic tracking of:

- invoke() call latency (how long does `read_file` take?)
- Frames per second during streaming
- Memory usage over time
- Time to first token after sending a message
- Session switch duration

### Frontend Sentry Not Configured

There is a placeholder for Sentry initialization but it is not connected:

```typescript
// Sentry.init() is not called -- no production error reporting
```

---

## What To Add

### createLogger() for Frontend

```typescript
// lib/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  readonly level: LogLevel;
  readonly context: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: number;
  readonly traceId?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private readonly context: string;
  private static minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info';
  private static listeners: Array<(entry: LogEntry) => void> = [];

  constructor(context: string) {
    this.context = context;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[Logger.minLevel]) return;

    const entry: LogEntry = {
      level,
      context: this.context,
      message,
      metadata,
      timestamp: Date.now(),
      traceId: TraceContext.current()?.traceId,
    };

    // Structured console output
    const prefix = `[${this.context}]`;
    const args = metadata !== undefined ? [prefix, message, metadata] : [prefix, message];

    switch (level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }

    // Notify listeners (Sentry, ring buffer, etc.)
    for (const listener of Logger.listeners) {
      listener(entry);
    }
  }

  static addListener(listener: (entry: LogEntry) => void): () => void {
    Logger.listeners.push(listener);
    return () => {
      Logger.listeners = Logger.listeners.filter((l) => l !== listener);
    };
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Usage:
// const logger = createLogger('ChatStore');
// logger.info('Message received', { conversationId, tokenCount });
// logger.error('Failed to send', { error: serializeError(err) });
```

### Trace Context with Correlation IDs

```typescript
// lib/trace.ts

class TraceContext {
  private static stack: TraceContext[] = [];

  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly operation: string;
  readonly startTime: number;

  private constructor(operation: string, parentSpanId?: string) {
    this.traceId = TraceContext.current()?.traceId ?? crypto.randomUUID();
    this.spanId = crypto.randomUUID().slice(0, 8);
    this.parentSpanId = parentSpanId;
    this.operation = operation;
    this.startTime = performance.now();
  }

  static start(operation: string): TraceContext {
    const parent = TraceContext.current();
    const ctx = new TraceContext(operation, parent?.spanId);
    TraceContext.stack.push(ctx);
    return ctx;
  }

  static current(): TraceContext | undefined {
    return TraceContext.stack[TraceContext.stack.length - 1];
  }

  end(): number {
    const duration = performance.now() - this.startTime;
    TraceContext.stack.pop();
    return duration;
  }
}

// Traced invoke wrapper:
async function tracedInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const ctx = TraceContext.start(`invoke:${command}`);
  const logger = createLogger('IPC');

  logger.debug('invoke start', { command, traceId: ctx.traceId, spanId: ctx.spanId });

  try {
    // Pass traceId to Rust so it can propagate to sidecar
    const result = await invoke<T>(command, { ...args, __traceId: ctx.traceId });
    const duration = ctx.end();

    logger.debug('invoke complete', {
      command,
      traceId: ctx.traceId,
      durationMs: duration.toFixed(1),
    });

    PerfMetrics.instance.recordInvoke(command, duration);
    return result;
  } catch (error) {
    const duration = ctx.end();
    logger.error('invoke failed', {
      command,
      traceId: ctx.traceId,
      durationMs: duration.toFixed(1),
      error: serializeError(error),
    });
    throw error;
  }
}
```

### PerfMetrics Class with Ring Buffer

```typescript
// lib/perf-metrics.ts

interface MetricSample {
  readonly timestamp: number;
  readonly value: number;
}

class MetricRingBuffer {
  private readonly buffer: MetricSample[];
  private head = 0;
  private _size = 0;
  private readonly capacity: number;

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
    this.buffer = new Array<MetricSample>(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = { timestamp: Date.now(), value };
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  percentile(p: number): number {
    if (this._size === 0) return 0;
    const sorted = this.toArray()
      .map((s) => s.value)
      .sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[Math.max(0, idx)];
  }

  average(): number {
    if (this._size === 0) return 0;
    const samples = this.toArray();
    return samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
  }

  private toArray(): MetricSample[] {
    if (this._size < this.capacity) return this.buffer.slice(0, this._size);
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }
}

class PerfMetrics {
  static instance = new PerfMetrics();

  private invokeLatency: Map<string, MetricRingBuffer> = new Map();
  private fps = new MetricRingBuffer(360); // 1 minute at 6 samples/sec
  private memory = new MetricRingBuffer(360); // 1 hour at 10s intervals

  recordInvoke(command: string, durationMs: number): void {
    if (!this.invokeLatency.has(command)) {
      this.invokeLatency.set(command, new MetricRingBuffer(100));
    }
    this.invokeLatency.get(command)!.push(durationMs);
  }

  recordFps(fps: number): void {
    this.fps.push(fps);
  }

  recordMemory(usedMB: number): void {
    this.memory.push(usedMB);
  }

  getReport(): PerfReport {
    const invokeReport: Record<string, { p50: number; p95: number; p99: number; avg: number }> = {};
    for (const [command, buffer] of this.invokeLatency) {
      invokeReport[command] = {
        p50: buffer.percentile(50),
        p95: buffer.percentile(95),
        p99: buffer.percentile(99),
        avg: buffer.average(),
      };
    }

    return {
      invoke: invokeReport,
      fps: {
        current: this.fps.percentile(50),
        p5: this.fps.percentile(5), // Worst 5% of frames
      },
      memory: {
        currentMB: this.memory.percentile(100),
        peakMB: this.memory.percentile(100),
      },
    };
  }
}
```

### Dev-Only Perf Panel

```typescript
// components/dev/perf-panel.tsx
// Only rendered in development builds

const PerfPanel: FC = () => {
  const [report, setReport] = useState<PerfReport | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setReport(PerfMetrics.instance.getReport());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (report === null) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-3 rounded-lg font-mono z-50">
      <div>FPS: {report.fps.current.toFixed(0)} (p5: {report.fps.p5.toFixed(0)})</div>
      <div>Memory: {report.memory.currentMB.toFixed(0)}MB</div>
      <div className="mt-1">
        {Object.entries(report.invoke)
          .sort(([, a], [, b]) => b.p95 - a.p95)
          .slice(0, 5)
          .map(([cmd, stats]) => (
            <div key={cmd}>
              {cmd}: {stats.p50.toFixed(0)}ms (p95: {stats.p95.toFixed(0)}ms)
            </div>
          ))}
      </div>
    </div>
  );
};
```

### Frontend Sentry Init

```typescript
// providers/sentry-provider.tsx

import * as Sentry from '@sentry/react';

function initSentry(): void {
  if (import.meta.env.DEV) return; // Skip in development

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `orbit@${import.meta.env.VITE_APP_VERSION}`,
    tracesSampleRate: 0.1, // 10% of transactions
    replaysSessionSampleRate: 0, // No session replay (privacy)
    replaysOnErrorSampleRate: 0.5, // 50% replay on error

    beforeSend(event) {
      // Strip file paths to protect user privacy
      if (event.exception?.values) {
        for (const value of event.exception.values) {
          if (value.stacktrace?.frames) {
            for (const frame of value.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = anonymizePath(frame.filename);
              }
            }
          }
        }
      }
      return event;
    },
  });

  // Connect to logger
  Logger.addListener((entry) => {
    if (entry.level === 'error') {
      Sentry.captureMessage(entry.message, {
        level: 'error',
        tags: { context: entry.context },
        extra: entry.metadata,
      });
    }
  });
}
```

---

## What We Get

| Metric                     | Before                            | After                                                    |
| -------------------------- | --------------------------------- | -------------------------------------------------------- |
| Frontend logging           | Scattered console.log, no levels  | Structured createLogger() with levels, context, metadata |
| Request tracing            | None (3 layers log independently) | Correlation ID from frontend through Rust to sidecar     |
| invoke() latency tracking  | None                              | Per-command p50/p95/p99 in ring buffer                   |
| FPS monitoring             | None                              | Continuous measurement with p5 (worst frames) tracking   |
| Memory tracking            | None                              | 10s samples with growth alerting                         |
| Production error reporting | None (Sentry placeholder)         | Sentry with privacy-safe stack traces                    |
| Debug experience           | Read console, guess at timing     | Dev panel with live metrics, structured logs             |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: createLogger() implementation + migrate critical console.log calls + Sentry init
- Day 2: TraceContext + tracedInvoke wrapper + correlation ID propagation to Rust
- Day 3: PerfMetrics class + FPS/memory measurement + dev perf panel

---

## Dependencies

- Mission #06 (Error Resilience) uses the error classifier categories that feed into Sentry tags.
- Mission #09 (Memory Discipline) uses the memory metrics from PerfMetrics.
- Mission #05 (Sidecar Resilience) benefits from trace IDs for diagnosing sidecar communication failures.

---

## Risks

| Risk                                       | Mitigation                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Logger overhead on hot paths               | Log level gating is the first check (single integer comparison). debug() is a no-op in production.                                             |
| Trace ID propagation requires Rust changes | Start with frontend-only tracing. Add \_\_traceId to invoke() args and log it in Rust as a pass-through. No Rust architectural changes needed. |
| PerfMetrics ring buffers consume memory    | 1000 samples x ~20 bytes = ~20KB per metric. Total overhead <500KB for all metrics.                                                            |
| Sentry privacy concerns                    | Strip file paths, no session replay by default, 10% trace sampling. User opts in via settings.                                                 |
| Dev perf panel causes layout shifts        | Fixed positioning, small footprint, toggle-able via keyboard shortcut.                                                                         |
| Migrating all console.log calls is tedious | Do incrementally. Start with stores and services. Components can follow later. Lint rule to prevent new console.log.                           |
