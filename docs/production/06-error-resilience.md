# Mission 06: Error Resilience

> Error boundaries, circuit breakers, timeouts.

---

## Why This Matters

Orbit's error handling today is optimistic: it handles the happy path well and has some auth error classification, but unhandled promise rejections silently swallow failures, invoke() calls have no frontend-visible timeout, dozens of invoke() calls lack `.catch()`, and event listeners run without try-catch protection. In a long coding session, these silent failures accumulate -- a stale file tree here, a missed tool result there -- until the user notices something is wrong but has no idea what or when it broke.

A production code editor needs defense in depth: classify errors, show actionable messages, time out gracefully, and never let a single failure cascade into a frozen UI.

---

## Current State

### Error Classifier Only Handles Auth (error-classifier.ts)

The existing error classifier recognizes authentication errors and routes them to the auth flow. All other errors fall through to a generic catch that logs and discards:

```typescript
// Current: only auth errors get special treatment
function classifyError(error: unknown): ErrorCategory {
  if (isAuthError(error)) return 'auth';
  return 'unknown'; // Everything else is unknown
}
```

### No window.onunhandledrejection Handler

Unhandled promise rejections in the frontend silently vanish. No logging, no user notification, no telemetry:

```typescript
// Missing entirely:
window.addEventListener('unhandledrejection', (event) => {
  // Not implemented
});
```

### invoke() Without Timeouts

Frontend invoke() calls rely on Rust's internal 5-minute timeout, but the frontend has no awareness of this. A hung Rust command leaves the UI in a loading state with no feedback:

```typescript
// Current: no timeout, waits forever from frontend perspective
const result = await invoke<FileContent>('read_file', { path });
// If Rust hangs, UI hangs
```

### Missing .catch() on invoke() Calls

Multiple invoke() calls across the codebase fire without error handling:

```typescript
// files.ts -- fire and forget
invoke('watch_directory', { path: workspacePath });

// vault-api.ts -- no catch
invoke('vault_store', { key, value });

// browser.ts -- no catch
invoke('browser_navigate', { url });
```

### Event Listeners Without try-catch (tauri-provider.tsx:258-663)

Tauri event listeners in the provider span 400+ lines. None have try-catch protection. A single bad event payload crashes the entire listener chain:

```typescript
// Current: no protection
listen('agent-event', (event) => {
  const data = event.payload; // Could be malformed
  processAgentEvent(data); // Could throw
  updateStore(data); // Could throw
  // One throw kills all subsequent processing
});
```

### Listener Registration Race (Events During Init Lost)

Events emitted by the Rust backend during initialization can arrive before the frontend has registered its listeners. These events are silently dropped.

---

## What To Add

### Global Rejection Handler

```typescript
// providers/error-boundary-provider.tsx

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  event.preventDefault(); // Prevent default browser logging

  const classified = classifyError(event.reason);
  logger.error('Unhandled rejection', {
    category: classified.category,
    message: classified.message,
    stack: classified.stack,
  });

  // Show user-facing notification for actionable errors
  if (classified.isUserActionable) {
    showErrorToast(classified.userMessage, classified.action);
  }
});

window.addEventListener('error', (event: ErrorEvent) => {
  logger.error('Uncaught error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
  });
});
```

### Expanded Error Classifier (8 Categories)

```typescript
// services/errors/error-classifier.ts

type ErrorCategory =
  | 'auth' // Token expired, invalid credentials
  | 'network' // Sidecar unreachable, IPC failure
  | 'timeout' // Operation exceeded deadline
  | 'permission' // File system, tool execution denied
  | 'not_found' // File, conversation, resource missing
  | 'validation' // Zod parse failure, malformed payload
  | 'rate_limit' // Claude API rate limit
  | 'internal'; // Everything else

interface ClassifiedError {
  readonly category: ErrorCategory;
  readonly message: string;
  readonly isRetryable: boolean;
  readonly isUserActionable: boolean;
  readonly userMessage: string;
  readonly action?: ErrorAction;
  readonly stack?: string;
}

function classifyError(error: unknown): ClassifiedError {
  const message = extractMessage(error);

  if (isAuthError(message)) return authError(message);
  if (isNetworkError(message)) return networkError(message);
  if (isTimeoutError(message)) return timeoutError(message);
  if (isPermissionError(message)) return permissionError(message);
  if (isNotFoundError(message)) return notFoundError(message);
  if (isValidationError(message)) return validationError(message);
  if (isRateLimitError(message)) return rateLimitError(message);
  return internalError(message);
}
```

### Invoke Timeout Wrapper (Tiered)

```typescript
// lib/invoke-with-timeout.ts

type TimeoutTier = 'fast' | 'normal' | 'slow' | 'long';

const TIMEOUT_MS: Record<TimeoutTier, number> = {
  fast: 5_000, // File reads, git status, settings
  normal: 30_000, // Search, directory listing, git diff
  slow: 120_000, // Large file operations, git clone
  long: 300_000, // AI operations (matches Rust 5-min timeout)
};

async function invokeWithTimeout<T>(
  command: string,
  args: Record<string, unknown>,
  tier: TimeoutTier = 'normal'
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS[tier]);

  try {
    const result = await Promise.race([
      invoke<T>(command, args),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new TimeoutError(command, TIMEOUT_MS[tier]));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Circuit Breaker

```typescript
// services/errors/circuit-breaker.ts

type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailure: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;

  constructor(threshold: number = 5, resetTimeoutMs: number = 30_000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeoutMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError(this.resetTimeout - (Date.now() - this.lastFailure));
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### Event Handler Isolation

```typescript
// Before: one throw kills all processing
listen('agent-event', (event) => {
  processAgentEvent(event.payload);
  updateStore(event.payload);
});

// After: each handler isolated
listen('agent-event', (event) => {
  safeHandle('processAgentEvent', () => processAgentEvent(event.payload));
  safeHandle('updateStore', () => updateStore(event.payload));
});

function safeHandle(name: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    logger.error(`Event handler "${name}" threw`, { error });
    // Handler failure is isolated -- other handlers still run
  }
}
```

### Event Buffer for Init Race

```typescript
// providers/event-buffer.ts

class EventBuffer {
  private buffer: Array<{ event: string; payload: unknown }> = [];
  private ready = false;

  queue(event: string, payload: unknown): void {
    if (this.ready) return; // After flush, events go directly to handlers
    this.buffer.push({ event, payload });
  }

  flush(dispatch: (event: string, payload: unknown) => void): void {
    this.ready = true;
    for (const { event, payload } of this.buffer) {
      dispatch(event, payload);
    }
    this.buffer = [];
  }
}
```

---

## What We Get

| Metric                                  | Before                                  | After                                                                               |
| --------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Unhandled rejection visibility          | Silent (lost)                           | Logged + user toast for actionable errors                                           |
| Error categories recognized             | 1 (auth)                                | 8 (auth, network, timeout, permission, not_found, validation, rate_limit, internal) |
| invoke() timeout awareness              | None (waits for Rust 5-min timeout)     | Tiered (5s/30s/120s/300s) with specific error                                       |
| Event handler crash radius              | Entire listener chain                   | Single handler (isolated)                                                           |
| Events lost during init                 | All events before listener registration | Buffered and replayed on ready                                                      |
| Cascading failures from repeated errors | Unlimited retries                       | Circuit breaker trips after 5 failures                                              |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: Global rejection handler + expanded error classifier + error toast system
- Day 2: invokeWithTimeout wrapper + migrate critical invoke() calls + circuit breaker
- Day 3: Event handler isolation + event buffer + testing error scenarios

---

## Dependencies

- Mission #05 (Sidecar Resilience) provides health status that feeds into the circuit breaker (sidecar-down = open circuit for AI calls).
- Mission #10 (Observability) uses the error classifier categories for structured logging.

---

## Risks

| Risk                                           | Mitigation                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Too many error toasts during cascading failure | Deduplicate toasts by category. Show "Multiple errors occurred" after 3 of the same type. |
| Timeout wrapper masks real performance issues  | Log all timeouts with command name and duration. Timeouts are symptoms, not fixes.        |
| Circuit breaker blocks legitimate retries      | Half-open state allows one probe request through. 30s reset is short enough for recovery. |
| Event buffer grows unbounded during slow init  | Cap buffer at 1000 events. Drop oldest on overflow (better than OOM).                     |
| Wrapping all invoke() calls is a large diff    | Migrate incrementally: critical paths first (AI, file ops), then background operations.   |
