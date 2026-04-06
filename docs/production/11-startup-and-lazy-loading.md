# Mission 11: Startup & Lazy Loading — Trim the Critical Path to First Interactive Message

> **One-liner:** Defer 1.2MB+ of eagerly-loaded code (tool widgets, Shiki, Mermaid) so the first chat message renders with only what it actually needs.

## Why This Matters

When a user opens Orbit and sees their first chat message, the browser must load, parse, and execute every JavaScript module in the render path. Right now that path includes all 16 tool widget implementations (~3,275 lines + Pierre diff dependencies), the Shiki syntax highlighter (~300KB), the Mermaid diagram renderer (~900KB), and the full Streamdown markdown library — even if the message is plain text with zero code blocks.

This means the first message render is gated by ~1.2MB of JavaScript that isn't needed yet. On cold starts, this adds 200-400ms to time-to-interactive. On warm starts (HMR, session switch), it means the main bundle is heavier than necessary, competing with the modules that actually matter.

The Rust startup path is already well-optimized (sidecar lazy-spawned on first use, stores don't block, providers defer I/O to useEffect). But the JavaScript critical path has two gaps that inflate the main bundle: the tool widget barrel import and the eager Streamdown plugin chain.

Additionally, the app makes an external network request to Google Fonts on every cold start — a dependency on `fonts.googleapis.com` that will fail offline and adds 150-400ms latency.

## Current State

### What Exists (Good)

| Pattern                              | Location                                                                                               | Status           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------- |
| 11 components properly lazy-loaded   | `App.tsx:95-104`, `activity-panel.tsx:35`, `file-viewer-content.tsx:23-29`, `PrimarySidebar.tsx:87-98` | Excellent        |
| 9 manual Vite chunks for heavy deps  | `vite.config.ts:97-163` (mermaid, codemirror, xterm, shiki, lexical, etc.)                             | Excellent        |
| Suspense boundaries at feature level | Terminal, Settings, Browser, CodeMirror, Vault editor                                                  | Good granularity |
| Theme flash prevention               | `index.html:11-18` — inline script sets `dark` class before React                                      | Correct          |
| Sidecar lazy-spawned                 | `src-tauri/src/agent/bridge.rs` — not spawned until first message                                      | Correct          |
| Stores don't block render            | All stores initialize with empty state, fetch data in useEffect                                        | Correct          |
| Provider chain non-blocking          | `TauriProvider`, `PierreProvider` defer I/O to useEffect                                               | Correct          |

### What's Missing (Problems)

**Problem 1: All 16 Tool Widgets Imported Eagerly via Barrel**

```
File: apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx:7-23

import {
  AskUserQuestionWidget,
  BashToolWidget,
  BrowserToolWidget,
  CodeSearchToolWidget,
  EditToolWidget,       // ← pulls in Pierre diffs (~200KB chunk)
  GenericToolWidget,
  GlobToolWidget,
  GrepToolWidget,
  PlanToolWidget,
  ReadToolWidget,
  SkillToolWidget,
  TaskToolWidget,
  WebFetchToolWidget,
  WebSearchToolWidget,
  WriteToolWidget,      // ← pulls in Pierre diffs (~200KB chunk)
} from '../tools';
```

The barrel file at `apps/agent/src/components/chat/tools/index.ts` re-exports all 16 widgets. Because `ToolWidgetRenderer` imports from this barrel, the bundler must include every widget in the same chunk — even if a message has zero tool calls.

- **Why it's a problem:** Every chat message render pulls in the full tool widget bundle, including EditToolWidget and WriteToolWidget which depend on Pierre diffs (~200KB). A plain text message pays the cost of diff rendering infrastructure it will never use.
- **At scale:** With 10 visible messages in Virtuoso, 10 instances of ToolWidgetRenderer are mounted. Each import is resolved once (module caching), but the initial chunk download includes all widgets.
- **Frame budget impact:** Module parse + eval for 16 widgets = ~50-100ms on cold start.

**Problem 2: Streamdown Plugins Load Before Any Code Block Exists**

```
File: apps/agent/src/components/chat/messages/MessageItem.tsx:8-12

import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
// ...
import { Streamdown } from 'streamdown';
```

These top-level imports force the bundler to include Shiki (~300KB, via `@streamdown/code`) and Mermaid (~900KB) in the MessageItem chunk. MessageItem renders for every chat message, so these imports are on the critical path for the first visible message — even if that message is "Hello, how can I help?"

- **Why it's a problem:** 80%+ of messages are plain text or simple markdown. Code blocks and Mermaid diagrams are rare. Yet every message pays the module-loading cost for both.
- **At scale:** The Vite chunk splitting already separates these into `vendor-shiki` and `vendor-mermaid` chunks, but the import statement in MessageItem triggers their download immediately on first message render.
- **Frame budget impact:** Shiki init (grammar loading) takes 100-300ms. Mermaid init takes 50-150ms. Both happen before the first message text is visible.

**Problem 3: Google Fonts Network Dependency on Cold Start**

```
File: apps/agent/index.html:8-10

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:..." rel="stylesheet" />
```

The Newsreader serif font is loaded from Google Fonts via an external stylesheet link. This means:

- DNS resolution for `fonts.googleapis.com` + `fonts.gstatic.com`
- CSS download from Google CDN
- Font file download from gstatic

- **Why it's a problem:** This is a network dependency on a desktop app. If the user is offline or on slow network, font loading stalls (up to browser timeout). `display=swap` prevents text from being invisible, but the font swap causes a visible FOUT (flash of unstyled text) when it arrives.
- **At scale:** Every cold start makes this request. Tauri's WKWebView may not cache Google Fonts aggressively between app restarts.
- **Frame budget impact:** 150-400ms latency on first load, visible FOUT on swap.

**Problem 4: No Resource Preloading Hints**

```
File: apps/agent/index.html

No <link rel="modulepreload"> for critical JS chunks
No <link rel="preload"> for critical fonts or CSS
```

Modern browsers can begin downloading resources earlier if given hints. Without them, the browser discovers chunks only when the import chain reaches them.

## What To Replace / Add

### Fix 1: Dynamic Tool Widget Imports

**Currently:** `ToolWidgetRenderer.tsx:7-23` imports all 16 widgets from barrel.

**Replace with:** Dynamic `import()` keyed by tool name, with a lightweight fallback:

```typescript
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { ComponentType, FC } from 'react';

import { lazy, Suspense } from 'react';

// Map tool names to lazy-loaded widgets
const TOOL_WIDGET_MAP: Record<string, () => Promise<{ default: ComponentType<ToolWidgetProps> }>> = {
  'Bash':       () => import('../tools/bash-tool-widget').then(m => ({ default: m.BashToolWidget })),
  'Edit':       () => import('../tools/edit-tool-widget').then(m => ({ default: m.EditToolWidget })),
  'Write':      () => import('../tools/write-tool-widget').then(m => ({ default: m.WriteToolWidget })),
  'Read':       () => import('../tools/read-tool-widget').then(m => ({ default: m.ReadToolWidget })),
  'Glob':       () => import('../tools/glob-tool-widget').then(m => ({ default: m.GlobToolWidget })),
  'Grep':       () => import('../tools/grep-tool-widget').then(m => ({ default: m.GrepToolWidget })),
  'WebFetch':   () => import('../tools/web-fetch-tool-widget').then(m => ({ default: m.WebFetchToolWidget })),
  'WebSearch':  () => import('../tools/web-search-tool-widget').then(m => ({ default: m.WebSearchToolWidget })),
  // ... etc for all tools
};

// Cache lazy components to avoid re-creating on each render
const lazyCache = new Map<string, ReturnType<typeof lazy>>();

function getLazyWidget(toolName: string): ReturnType<typeof lazy> {
  if (!lazyCache.has(toolName)) {
    const loader = TOOL_WIDGET_MAP[toolName];
    lazyCache.set(toolName, loader ? lazy(loader) : lazy(() =>
      import('../tools/generic-tool-widget').then(m => ({ default: m.GenericToolWidget }))
    ));
  }
  return lazyCache.get(toolName)!;
}

const ToolWidgetRenderer: FC<ToolWidgetRendererProps> = ({ tool, onOpenFile, onOpenUrl }) => {
  const LazyWidget = getLazyWidget(tool.toolName);
  return (
    <Suspense fallback={<ToolWidgetSkeleton toolName={tool.toolName} />}>
      <LazyWidget tool={tool} onOpenFile={onOpenFile} onOpenUrl={onOpenUrl} />
    </Suspense>
  );
};
```

**Files to modify:**

- `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx` — Replace barrel import with dynamic map
- `apps/agent/src/components/chat/tools/` — Each widget needs `export default` or named export compatible with dynamic import
- Create `apps/agent/src/components/chat/messages/ToolWidgetSkeleton.tsx` — Lightweight loading state

### Fix 2: Deferred Streamdown Plugin Loading

**Currently:** `MessageItem.tsx:8-12` imports Shiki code plugin and Mermaid eagerly.

**Replace with:** Detect content type and load plugins on demand:

````typescript
// Phase 1: Render with lightweight base plugins only
const BASE_PLUGINS = [remarkGfm]; // Always needed for markdown
const BASE_REHYPE = [rehypeInsightBlocks, rehypeFlowTokens]; // Lightweight custom plugins

// Phase 2: Detect when heavy plugins are needed
function needsCodePlugin(content: string): boolean {
  return content.includes('```'); // Code fence detected
}

function needsMermaidPlugin(content: string): boolean {
  return content.includes('```mermaid');
}

// Phase 3: Load plugins lazily
const codePluginPromise = lazy(() => import('@streamdown/code'));
const mermaidPluginPromise = lazy(() => import('@streamdown/mermaid'));
````

**Simpler approach — conditional plugin array:**

```typescript
const remarkPlugins = useMemo(() => {
  const plugins = [remarkGfm];
  return plugins;
}, []);

const rehypePlugins = useMemo(() => {
  const plugins = [...BASE_REHYPE];
  // Only include code plugin if message has code blocks
  if (hasCodeBlocks) plugins.push(codePlugin);
  if (hasMermaid) plugins.push(mermaidPlugin);
  return plugins;
}, [hasCodeBlocks, hasMermaid]);
```

**Note:** This requires Streamdown to support adding plugins after initial render, or re-creating the pipeline when code blocks appear during streaming. Check Streamdown's API for plugin hot-loading support.

**Files to modify:**

- `apps/agent/src/components/chat/messages/MessageItem.tsx` — Conditional plugin loading
- May need a wrapper that upgrades the Streamdown instance when heavy content is detected

### Fix 3: Bundle Newsreader Font Locally

**Currently:** `index.html:8-10` loads Newsreader from Google Fonts CDN.

**Replace with:** Install `@fontsource-variable/newsreader` (same pattern as Geist Mono):

```bash
bun add @fontsource-variable/newsreader
```

```typescript
// main.tsx — add alongside existing Geist Mono import
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
```

Then remove the Google Fonts `<link>` tags from `index.html`.

**Files to modify:**

- `apps/agent/index.html` — Remove lines 8-10 (Google Fonts links)
- `apps/agent/src/main.tsx` — Add `@fontsource-variable/newsreader` import
- `package.json` — Add `@fontsource-variable/newsreader` dependency

**Impact:** Eliminates external network dependency. Font bundled with app (~40KB). Works offline. No FOUT.

### Fix 4: Add Resource Preloading Hints

**Add to `index.html`:**

```html
<link rel="modulepreload" href="/src/main.tsx" />
```

**Add to `vite.config.ts`** (for production builds):

Vite already generates modulepreload hints by default for static imports. The key improvement is ensuring dynamically-imported critical chunks (like the chat message renderer) get prefetched after initial load:

```typescript
// In a component that mounts early (e.g., App.tsx useEffect):
function prefetchCriticalChunks(): void {
  // Prefetch chat rendering pipeline after initial paint
  requestIdleCallback(() => {
    import('@streamdown/code').catch(() => {}); // Warm the chunk cache
    import('../tools/bash-tool-widget').catch(() => {}); // Most common tool
    import('../tools/edit-tool-widget').catch(() => {}); // Heavy but frequent
  });
}
```

**Files to modify:**

- `apps/agent/src/App.tsx` — Add `prefetchCriticalChunks()` in useEffect after first paint

## What We Get

| Metric                                      | Before                                      | After                                    |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| JS on critical path to first message        | ~2.5MB (main + shiki + mermaid + all tools) | ~1.0-1.3MB (main + streamdown base only) |
| Time to first message render (cold)         | ~800-1200ms                                 | ~400-600ms                               |
| Tool widget load cost on plain text message | ~50-100ms (parse 16 widget modules)         | 0ms (loaded only when tool appears)      |
| Mermaid load cost on non-diagram message    | ~50-150ms                                   | 0ms (loaded only on ```mermaid)          |
| External network dependency on cold start   | Google Fonts (150-400ms, fails offline)     | None (fonts bundled)                     |
| Font loading behavior                       | FOUT (swap from system → Newsreader)        | No FOUT (font available immediately)     |
| Offline cold start                          | Degraded (missing serif font)               | Full fidelity                            |

## Estimated Complexity

**Medium** — 2-3 days.

- Day 1: Dynamic tool widget imports + ToolWidgetSkeleton fallback component
- Day 2: Bundle Newsreader font locally + remove Google Fonts dependency + conditional Streamdown plugins (if Streamdown API supports it — if not, defer to Web Workers mission #01)
- Day 3: Prefetch critical chunks after first paint + testing across cold/warm/offline starts

## Dependencies

- **Mission #04 (Component Memoization):** The dynamic tool widget imports pair perfectly with memoizing each widget — do both together.
- **Mission #01 (Web Workers):** If Streamdown doesn't support conditional plugin loading, moving the entire markdown pipeline to a worker (Mission #01) solves this at a deeper level. This mission's Fix 2 is the lighter alternative.

## Risks

- **Streamdown plugin hot-loading:** If Streamdown requires all plugins at initialization and can't add them later, Fix 2 needs a different approach — either re-create the Streamdown instance when code blocks appear (potential flash) or always include the code plugin and only defer Mermaid (which is much larger and much rarer).
- **Tool widget loading flash:** When a tool widget loads lazily, the user briefly sees a skeleton. For fast tool executions (Read, Glob), the widget may load before the tool completes, making the skeleton invisible. For very fast loads, the skeleton could flash. Mitigate with a minimum skeleton display time of 0ms (instant swap, no artificial delay).
- **Prefetch timing:** If prefetchCriticalChunks fires too early, it competes with the initial render. Using `requestIdleCallback` ensures it only runs when the browser is idle. But if the user sends a message before idle fires, the tool widget will lazy-load on demand (slightly slower first time).
