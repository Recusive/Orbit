# perf-monitor

Tools for extracting actionable performance data from Safari Web Inspector timeline recordings.

## Quick Start

```bash
# From anywhere — just point at the recording JSON
bun run perf-monitor/extract-timeline.ts ~/Desktop/my-recording.json
```

Outputs (next to the input file):

- `my-recording-report.md` — Human-readable performance report
- `my-recording-trimmed.json` — Re-analyzable JSON without screenshots/heap bloat

## How to Record

1. Open Safari Web Inspector (Develop > Show Web Inspector) on the Tauri app or localhost dev server
2. Go to the **Timelines** tab
3. Click the record button (red circle)
4. Perform the action you want to profile (keep it short — 3-10 seconds is ideal)
5. Stop recording
6. **Export**: File > Export > Timeline Recording (saves as `.json`)

The exported JSON will be large (200-500MB+ for a few seconds) because it includes base64 screenshots and heap allocation stack traces. The extractor strips that bloat.

## Understanding the JSON Structure

Safari timeline recordings have this structure:

```
{
  "version": 1,
  "recording": {
    "startTime": ...,
    "endTime": ...,
    "instrumentTypes": [...],       // What was recorded
    "records": [...],               // Event-level data (the bulk)
    "samples": [...],               // JS profiler stack traces (THE GOLD)
    "markers": [...],               // User timing markers
    "memoryPressureEvents": [...]   // OS memory pressure
  }
}
```

### Where the Data Lives

| Location                               | What It Contains                                           | Size    | Value                                                |
| -------------------------------------- | ---------------------------------------------------------- | ------- | ---------------------------------------------------- |
| `recording.samples`                    | **JS stack traces with function names, files, lines**      | ~30MB   | Highest — tells you exactly which functions burn CPU |
| `recording.records` (script)           | Script events: timers, microtasks, GC, event handlers      | ~1-2MB  | High — shows event timing and GC pauses              |
| `recording.records` (layout)           | Style recalcs, layouts, forced layouts, composites, paints | ~0.2MB  | High — identifies layout thrashing                   |
| `recording.records` (cpu)              | CPU usage samples per thread (~2/sec)                      | ~0.1MB  | Medium — shows main thread saturation                |
| `recording.records` (memory)           | Memory breakdown: JS heap, page, JIT, images (~2/sec)      | ~0.01MB | Medium — shows memory growth and GC triggers         |
| `recording.records` (rendering-frame)  | Frame start/end times                                      | ~0.05MB | Medium — calculates FPS and jank                     |
| `recording.records` (network)          | Network requests (often empty for Tauri apps)              | ~0.4MB  | Low for Tauri, high for web                          |
| `recording.records` (screenshots)      | Base64-encoded frame captures                              | ~100MB  | Low for automated analysis                           |
| `recording.records` (heap-allocations) | Full heap snapshots with node/edge graphs                  | ~300MB  | Low — too detailed for initial analysis              |

### The Key Insight: `recording.samples`

This is the most valuable data and the one most people miss. It's a **JavaScript sampling profiler** that captures stack traces at regular intervals:

```json
{
  "samples": [
    {
      "target": { "type": "page", "name": "Page" },
      "stackTraces": [
        {
          "timestamp": 0,
          "stackFrames": [
            {
              "name": "myFunction",
              "url": "http://localhost:5176/src/components/MyComponent.tsx",
              "line": 42,
              "column": 15
            },
            { "name": "callerFunction", "url": "...", "line": ... }
          ]
        }
      ],
      "durations": [0.001, 0.001, ...]
    },
    { "target": { "type": "worker", "name": "worker-portable.js" }, ... }
  ]
}
```

Each entry in `samples` is a different execution target (main page, workers). The page target has:

- **`stackTraces`** — Array of sampled call stacks. `stackFrames[0]` is the leaf (where CPU was actually executing). The rest is the call chain up to the root.
- **`durations`** — Parallel array — how long each sample lasted (in seconds).

**Self time** = time at the leaf frame (the function was actually running).
**Total time** = time anywhere on the stack (the function or something it called was running).

### Record Types in `recording.records`

Each record has a `type` field prefixed with `timeline-record-type-`:

| Type              | Key Fields                                                     | What to Look For                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script`          | `eventType`, `startTime`, `endTime`, `details`, `extraDetails` | Events > 10ms. `eventType` values: `timer-fired`, `microtask-dispatched`, `event-dispatched`, `garbage-collected`, `script-evaluated`, `animation-frame-fired`, `observer-callback`                             |
| `layout`          | `eventType`, `startTime`, `endTime`                            | `eventType` values: `composite`, `recalculate-styles`, `layout`, `forced-layout`, `paint`, `invalidate-layout`, `invalidate-styles`. Any `forced-layout` is a red flag. Composites > 16ms cause dropped frames. |
| `rendering-frame` | `startTime`, `endTime`                                         | Duration > 16.67ms = below 60fps. > 33.33ms = jank. > 100ms = freeze.                                                                                                                                           |
| `cpu`             | `timestamp`, `usage`, `threads[]`                              | `usage` > 100% means multiple cores. Check `threads[].type === "main"` for main thread. Heap Helper threads = GC pressure. JIT Worklist threads = code being compiled.                                          |
| `memory`          | `timestamp`, `categories[]`                                    | Categories: `javascript` (JS heap), `page` (DOM/layout objects), `jit` (compiled code), `images`, `layers`, `other`. Watch for `page` spikes — that's DOM node explosion.                                       |
| `network`         | `startTime`, `endTime`, `data.url`, `data.statusCode`          | Often empty in Tauri apps (IPC doesn't go through network layer).                                                                                                                                               |

## Reading the Report

The report sections are ordered by actionability:

### 1. Executive Summary

Quick health check. Red flags: Avg FPS < 30, memory growth > 100MB, GC > 1 second total.

### 2. JavaScript Profiler (most important)

Four tables, read them in order:

- **Self Time** — Where is the CPU _actually_ burning? The top entry here is your #1 optimization target. Watch for dev tools (react-scan, Sentry) eating CPU.
- **Total Time** — What call chains are expensive? `performSyncWorkOnRoot` near the top means React is doing synchronous rendering. `commitRoot` high = expensive DOM mutations.
- **CPU by Source File** — Broad view. If a dependency has high self-time, it's doing real work. If it has high total-time but low self-time, it's just a pass-through.
- **Hot App Code** — Your code only, ranked by self-time. These are the functions to open and optimize.

### 3. Frame Analysis

Worst frames show when the UI froze. Cross-reference the timestamp with GC events, long scripts, and layout events to find the cause.

### 4. Everything Else

CPU, Memory, GC, Script Events, Layout Events, Network — supporting evidence for the profiler findings.

## Common Performance Patterns

### GC Storm

**Signature**: Multiple GC events > 100ms, memory saw-tooth pattern, `Heap Helper Thread` in CPU.
**Cause**: Allocating lots of short-lived objects (object spreads in loops, Immer patches, large React reconciliation).
**Fix**: Reduce allocations. Use `startTransition` for heavy renders. Virtualize long lists.

### Layout Thrashing

**Signature**: `forced-layout` events, high `recalculate-styles` times, `useLayoutEffect` in profiler stacks.
**Cause**: Reading layout properties (`offsetHeight`, `scrollHeight`, `getBoundingClientRect`) after writing to the DOM.
**Fix**: Batch reads before writes. Replace `useLayoutEffect` with `ResizeObserver`. Use `will-change` for animated elements.

### Synchronous React Rendering

**Signature**: `performSyncWorkOnRoot` dominates total time. `commitRoot` > 100ms.
**Cause**: Large state updates without `startTransition`. Mounting hundreds of components at once.
**Fix**: Wrap non-urgent updates in `startTransition`. Virtualize lists. Lazy-load heavy components.

### Dev Tool Overhead

**Signature**: react-scan, Sentry, or other dev tools in the top self-time entries.
**Cause**: Monitoring tools traverse the React fiber tree on every commit.
**Fix**: Disable during profiling. If you're measuring performance, the tool itself shouldn't be in the top 5.

### Composite Bottleneck

**Signature**: `composite` events > 100ms in layout breakdown.
**Cause**: Too many compositing layers, large paint areas, or GPU overload from complex CSS.
**Fix**: Reduce `will-change` usage. Simplify box-shadows and filters. Use `contain: layout style paint` on isolated subtrees.

## Using the Trimmed JSON

The trimmed JSON (~10-40MB) is small enough to feed to Claude or load in a script for custom analysis:

```typescript
// Custom analysis example
const data = await Bun.file('recording-trimmed.json').json();
const { stackTraces, durations } = data.recording.samples[0];

// Find all stacks involving a specific component
for (let i = 0; i < stackTraces.length; i++) {
  const hasTarget = stackTraces[i].stackFrames.some((f) => f.url?.includes('MyComponent.tsx'));
  if (hasTarget) {
    console.log(`Sample ${i} (${(durations[i] * 1000).toFixed(1)}ms):`);
    for (const f of stackTraces[i].stackFrames) {
      console.log(`  ${f.name}  ${f.url?.split('/').pop()}:${f.line}`);
    }
  }
}
```

## Gotchas

- **Vite dev mode uses source maps** — function names in the profiler may be minified (`t1`, `t3`, etc.) even in dev. Cross-reference the file path and line number against your source code to identify them.
- **Network records are often empty** in Tauri apps because IPC goes through the Tauri bridge, not HTTP.
- **Worker samples** (entries in `samples` with `target.type === "worker"`) are usually empty unless you have active Web Workers doing CPU work.
- **Short recordings are better** — 3-10 seconds of a specific action. Long recordings dilute signal with idle frames.
- **Don't profile with react-scan enabled** — it adds 50-60% CPU overhead and dominates the profiler output, masking real issues.
