# Chat Virtualization System

> Measure once. Use forever. Never re-render what hasn't changed.

## Overview

The chat message list uses [TanStack Virtual](https://tanstack.com/virtual) to virtualize potentially hundreds of messages, each containing rich markdown rendered by Streamdown + Shiki syntax highlighting. The virtualization system is designed around one principle: **messages are measured exactly once, and that measurement is reused for the lifetime of the message.**

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    TanStack Virtual                             │
│                                                                │
│  estimateSize(index) ──► cachedSizeMapRef ──► exact height     │
│  measureElement(el)  ──► cachedSizeMapRef ──► cached height    │
│                          (delta = 0, no scroll adjustment)     │
└──────────────┬─────────────────────────────┬───────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│   FlowTokenSegment       │  │   Render Cache Store             │
│                          │  │   (render-cache-store.ts)        │
│  HIT:  dangerouslySet    │  │                                  │
│        InnerHTML          │  │  Memory: Map<sessionKey:msgId,   │
│  MISS: live Streamdown   │  │          size>                   │
│        → write-through   │  │  IndexedDB: orbit-render-cache   │
│        cache after Shiki │  │                                  │
│        settles (80ms)    │  │  Saves per-item row heights      │
└──────────────┬───────────┘  │  on layout stabilization +       │
               │              │  agent turn completion            │
               ▼              └──────────────────────────────────┘
┌──────────────────────────┐
│   Streamdown Cache       │
│   (streamdown-cache.ts)  │
│                          │
│  Memory: Map<contentHash,│
│          {html, height}> │
│  IndexedDB:              │
│    orbit-streamdown-cache│
│                          │
│  Keyed by djb2 hash of   │
│  segment text. Each      │
│  FlowTokenSegment gets   │
│  its own entry.          │
└──────────────────────────┘
```

## Two Cache Layers

### 1. Render Cache Store (`render-cache-store.ts`)

**Purpose:** Stores the exact pixel height of every message row (the full `div` that TanStack measures, including padding, tool widgets, thinking blocks, action bar).

**Key:** `${sessionKey}:${messageId}` (TanStack's item key)

**Used by:**

- `estimateSize()` — returns exact height as the initial estimate
- `measureElement()` — returns cached height instead of DOM measurement → delta = 0

**Lifecycle:**

1. First visit: TanStack measures rows via ResizeObserver → heights saved
2. `snapshotMeasurementCache()` persists to IndexedDB
3. Second visit: loaded from IndexedDB → fed to `cachedSizeMapRef` → `measureElement` returns cached sizes

### 2. Streamdown Cache (`streamdown-cache.ts`)

**Purpose:** Stores the pre-rendered HTML output and content height of each FlowTokenSegment.

**Key:** `djb2(segmentText)` — content hash, not message ID. This handles multi-segment messages (tool interleaving splits one message into multiple FlowTokenSegments).

**Used by:**

- `FlowTokenSegment` — on cache hit, renders via `dangerouslySetInnerHTML` (~0.05ms) instead of running the full Streamdown + Shiki pipeline (~1.5ms)

**Lifecycle:**

1. First mount: live Streamdown render (MISS)
2. After Shiki settles (80ms MutationObserver debounce): captures `innerHTML` + `getBoundingClientRect().height` → writes to cache
3. Remount (TanStack unmounts/remounts on scroll): cache HIT → `dangerouslySetInnerHTML`

## The Measure-Once Pipeline

### New Message (Streaming → Complete)

```
1. Message streams in
   └─ FlowTokenSegment renders with isStreaming=true
   └─ No cache interaction (streaming content is mutable)

2. agent:complete fires
   └─ isStreaming set to false
   └─ FlowTokenSegment re-renders as completed
   └─ Write-through: MutationObserver waits 80ms for Shiki
   └─ Captures innerHTML + height → streamdown-cache (memory + IndexedDB)

3. isAgentRunning transitions false (300ms delay)
   └─ snapshotMeasurementCache() fires
   └─ Captures ALL current row heights from TanStack
   └─ Saves to render-cache-store (memory + IndexedDB)
   └─ Updates cachedSizeMapRef

4. User scrolls away and back
   └─ TanStack unmounts the item (leaves viewport)
   └─ TanStack remounts the item (re-enters viewport)
   └─ estimateSize → cachedSizeMapRef → exact height
   └─ measureElement → cachedSizeMapRef → exact height (delta = 0)
   └─ FlowTokenSegment → streamdown-cache HIT → dangerouslySetInnerHTML
   └─ No Streamdown render, no Shiki, no measurement cascade
```

### Revisiting a Session (Cold Switch)

```
1. App starts
   └─ warmMemoryCacheFromIdb() loads render caches from IndexedDB
   └─ warmStreamdownCache() loads HTML caches from IndexedDB

2. User selects session
   └─ useLayoutEffect loads render cache → cachedSizeMapRef
   └─ TanStack renders visible items
   └─ estimateSize → cached row heights (exact)
   └─ measureElement → cached row heights (delta = 0)
   └─ FlowTokenSegment → streamdown-cache HIT → instant HTML

3. Result: no measurement cascade, no scroll jitter
```

### Adding a New Message to an Existing Session

```
1. User sends message, agent responds
2. Only the NEW message goes through the live render path
3. Existing messages use cached heights + cached HTML
4. On agent:complete, snapshot extends the cache with the new message
5. All previous measurements remain untouched
```

## Why This Solves Scroll Jitter

The scroll jitter was caused by `shouldAdjustScrollPositionOnItemSizeChange`. When TanStack remounts an item during scroll:

1. `estimateSize()` returns a height (e.g., 470px)
2. ResizeObserver fires → `measureElement()` reads DOM (e.g., 468px)
3. Delta = -2px → `shouldAdjustScrollPositionOnItemSizeChange` fires
4. ScrollTop shifts by 2px → scroll event → range recalculation → more mounts → more deltas → cascade

**The fix:** `measureElement()` returns the cached height from `cachedSizeMapRef` instead of reading the DOM. Since `estimateSize()` also returns the cached height, delta = 0. No scroll adjustment fires. No cascade. No jitter.

## Key Design Decisions

### Content Hash Keying (Not Message ID)

The streamdown cache uses `djb2(segmentText)` as the key, not the message ID. This is because:

- **Multi-segment messages:** Assistant messages with tool interleaving are split into multiple `FlowTokenSegment` instances by `buildUnifiedSegments()`. Each segment is a substring of the full message content. Using message ID would require knowing which segment to look up.
- **Deduplication:** Identical text in different messages shares one cache entry.
- **Independence:** Each segment's cache entry is self-contained — no dependency on message structure.

### Write-Through (Not Background Pre-Render)

The cache is populated by live renders, not a background service:

- **Accurate:** The cached HTML comes from the actual rendered DOM, not a hidden container that might differ.
- **Segment-aware:** Each FlowTokenSegment captures its own output, handling multi-segment messages naturally.
- **No timing issues:** No race between background rendering and user scrolling.

A background render service exists (`streamdown-render-service.ts`) for potential pre-warming of future sessions, but the write-through cache is the primary mechanism.

### MutationObserver Settle (80ms)

Shiki syntax highlighting is async — `code.highlight()` returns null on first call and fires a callback when ready. Streamdown re-renders the code block after the callback. The MutationObserver debounce (80ms quiet window) ensures we capture the final highlighted HTML, not the intermediate unhighlighted version.

### Viewport Width Validation (16px Tolerance)

Cached heights depend on text wrapping, which depends on container width. Each cache entry stores the viewport width at render time. On lookup, widths are compared with 16px tolerance — enough to absorb OS-level DPI rounding and scrollbar appearance, but catches actual window resizes that affect line breaks.

## Files

| File                                         | Purpose                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/chat/streamdown-cache.ts`               | Dual-layer HTML cache (memory LRU 2000 + IndexedDB) keyed by content hash             |
| `lib/chat/streamdown-config.tsx`             | Shared Streamdown + Shiki plugin config (used by both MessageItem and render service) |
| `lib/chat/streamdown-render-utils.ts`        | `getChatContentWidth()` + viewport width change tracking                              |
| `services/chat/streamdown-render-service.ts` | Background pre-render service (bonus, not primary)                                    |
| `stores/chat/render-cache-store.ts`          | Per-session row height cache (memory + IndexedDB)                                     |
| `components/chat/chat-messages.tsx`          | TanStack Virtual setup: `estimateSize`, `measureElement`, `cachedSizeMapRef`          |
| `components/chat/messages/MessageItem.tsx`   | `FlowTokenSegment` write-through cache                                                |

## Testing

23 integration tests in `__tests__/unit/lib/chat/streamdown-cache-pipeline.test.tsx` cover:

- **Layer 1 — Cache module:** Hash stability, miss→write→hit, width tolerance, invalidation, multi-segment
- **Layer 2 — Write-through capture:** MutationObserver settle → cache write, streaming skip, dangerouslySetInnerHTML on remount
- **Layer 3 — measureElement override:** Cached size return, fallthrough on miss, multi-message sessions
- **Layer 4 — Stream-end trigger:** `isAgentRunning` transition detection, cleanup on unmount, rapid toggle (multi-turn)
- **Full pipeline:** Stream→measure→cache→revisit lifecycle, incremental new message extension
