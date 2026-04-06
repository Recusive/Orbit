# Production Hardening Playbook

> Make Orbit withstand the same pressure as VS Code, Zed, and Cursor.

---

## How to Use

Each mission is self-contained. Pick one, read it top to bottom, implement it, move on. Missions are numbered by architectural layer (main thread first, resilience second, observability third) but the **Execution Order** below gives the optimal sequence based on effort-to-impact ratio.

Every mission follows the same structure:

1. **Why This Matters** -- the user-visible pain if we skip it
2. **Current State** -- what the code does today with file:line evidence
3. **What To Replace/Add** -- concrete before/after code
4. **What We Get** -- measurable before/after table
5. **Estimated Complexity** -- T-shirt size and day range
6. **Dependencies** -- other missions that should land first or alongside
7. **Risks** -- what can go wrong during implementation

---

## Priority Tiers

| Tier       | Theme                    | Missions                                                                                      | Goal                                                               |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Tier 1** | Main Thread Protection   | #01 Web Workers, #02 Streaming Backpressure, #03 Store Performance, #04 Component Memoization | Keep the main thread under 16ms per frame during active streaming  |
| **Tier 2** | Resilience Under Failure | #05 Sidecar Resilience, #06 Error Resilience, #07 Large File Handling                         | The app recovers from every failure the user can trigger           |
| **Tier 3** | Observability & Memory   | #08 Priority Scheduler, #09 Memory Discipline, #10 Observability                              | Same memory after 8 hours as after 8 minutes; full request tracing |

---

## Current State Summary

### What Orbit Does Well

- Pierre diff workers already offload heavy diff computation (good model to replicate)
- Chat virtualization with Virtuoso handles long conversations
- Multi-instance keep-alive prevents re-mount on session switch
- Adaptive overscan and scroll compensation for WKWebView quirks
- TanStack Query caching for invoke() calls reduces redundant work

### What's Missing

- All syntax highlighting and markdown parsing runs on the main thread
- Token streaming applies immediately with O(n) string concatenation
- Two god stores (tool-store 1254 lines, ui-store 1111 lines) with known Immer bugs
- 19 of 20 tool widgets lack React.memo()
- Sidecar has no health check, no auto-restart, fire-and-forget shutdown
- No global error boundary strategy; missing .catch() on dozens of invoke() calls
- No file size guards -- a 500MB file read will OOM the renderer
- No priority scheduler -- streaming tokens compete equally with user input
- Unbounded data structures grow forever in long sessions
- No structured frontend logging, no request correlation IDs, no perf metrics

---

## Execution Order Recommendation

### Phase 1: Quick Wins (1-2 days total)

| Order | Mission                                                        | Why First                                                                     |
| ----- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1     | [#04 Component Memoization](./04-component-memoization.md)     | 30 minutes for measurable FPS improvement. Lowest effort, highest confidence. |
| 2     | [#03 Store Performance](./03-store-performance.md)             | Fixes the known Immer stale-get() bug and reduces re-render cascade.          |
| 3     | [#11 Startup & Lazy Loading](./11-startup-and-lazy-loading.md) | Defer 1.2MB from critical path. Pairs with #04 (tool widgets).                |
| 4     | [#07 Large File Handling](./07-large-file-handling.md)         | Size guards prevent OOM crashes. Small changes, large safety net.             |

### Phase 2: Core Architecture (5-8 days total)

| Order | Mission                                                      | Why Now                                                                      |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 5     | [#02 Streaming Backpressure](./02-streaming-backpressure.md) | Directly improves the most common user experience (watching tokens stream).  |
| 6     | [#01 Web Workers](./01-web-workers.md)                       | Moves the heaviest main-thread work (Shiki, markdown) off the critical path. |
| 7     | [#05 Sidecar Resilience](./05-sidecar-resilience.md)         | Health checks and auto-restart prevent "dead app" state.                     |

### Phase 3: Production Polish (5-8 days total)

| Order | Mission                                              | Why Last                                                                                   |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 8     | [#06 Error Resilience](./06-error-resilience.md)     | Global error handling catches everything the specific fixes above miss.                    |
| 9     | [#08 Priority Scheduler](./08-priority-scheduler.md) | Evaluate need after Phases 1-2; may not be necessary if workers + backpressure solve jank. |
| 10    | [#10 Observability](./10-observability.md)           | Structured logging and tracing make all future debugging faster.                           |
| 11    | [#09 Memory Discipline](./09-memory-discipline.md)   | Long-session stability; requires observability (#10) to validate.                          |

---

## Mission Index

| #   | Mission                | File                                                               | Complexity               |
| --- | ---------------------- | ------------------------------------------------------------------ | ------------------------ |
| 01  | Web Workers            | [01-web-workers.md](./01-web-workers.md)                           | Large (3-5 days)         |
| 02  | Streaming Backpressure | [02-streaming-backpressure.md](./02-streaming-backpressure.md)     | Medium (2-3 days)        |
| 03  | Store Performance      | [03-store-performance.md](./03-store-performance.md)               | Medium (2-3 days)        |
| 04  | Component Memoization  | [04-component-memoization.md](./04-component-memoization.md)       | Small (30 min - 2 hours) |
| 05  | Sidecar Resilience     | [05-sidecar-resilience.md](./05-sidecar-resilience.md)             | Large (3-5 days)         |
| 06  | Error Resilience       | [06-error-resilience.md](./06-error-resilience.md)                 | Medium (2-3 days)        |
| 07  | Large File Handling    | [07-large-file-handling.md](./07-large-file-handling.md)           | Medium (2-3 days)        |
| 08  | Priority Scheduler     | [08-priority-scheduler.md](./08-priority-scheduler.md)             | Large (3-5 days)         |
| 09  | Memory Discipline      | [09-memory-discipline.md](./09-memory-discipline.md)               | Medium (2-3 days)        |
| 10  | Observability          | [10-observability.md](./10-observability.md)                       | Medium (2-3 days)        |
| 11  | Startup & Lazy Loading | [11-startup-and-lazy-loading.md](./11-startup-and-lazy-loading.md) | Medium (2-3 days)        |
