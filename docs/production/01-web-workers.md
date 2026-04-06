# Mission 01: Web Workers

> Move heavy computation off the main thread.

---

## Why This Matters

Every millisecond spent on syntax highlighting or markdown parsing is a millisecond the main thread cannot respond to user input. During active streaming, Orbit highlights code blocks and parses markdown for every incoming chunk -- all on the main thread. On a 120Hz display (8.3ms frame budget), a single Shiki highlight pass can blow through 3-4 frames, causing visible jank during the exact moment the user is watching most closely.

Pierre diff workers already prove the pattern works in this codebase. This mission replicates that success for the three other heavy computations.

---

## Current State

### Shiki Syntax Highlighting (Main Thread)

Shiki runs synchronously inside `MessageItem.tsx` via the Streamdown rendering pipeline. Every code block in every streaming message triggers a highlight pass on the main thread. A single code block with 50+ lines can take 8-15ms to highlight.

### Markdown Parsing (Main Thread)

The Streamdown component processes markdown with remark-gfm and rehype plugins. Each streaming chunk re-parses the entire accumulated message text. For a 2000-token response with code blocks, this means hundreds of incremental re-parses, each touching the full string.

### File Tree Flattening (Main Thread)

File tree rendering requires flattening a recursive directory structure into a flat array for virtualization. This is O(n) on the main thread where n is the total file count. With 34k+ untracked files (known OOM issue), this blocks the main thread for hundreds of milliseconds.

### Pierre Diff Workers (Already Off-Thread)

Pierre diff computation already runs in dedicated Web Workers using Blob URL instantiation. This is the reference implementation to follow.

---

## What To Add

### Worker Pool Architecture

```typescript
// lib/workers/pool.ts
interface WorkerTask<T> {
  readonly id: string;
  readonly type: 'shiki' | 'markdown' | 'search';
  readonly payload: T;
}

interface WorkerResult<T> {
  readonly id: string;
  readonly html: T;
  readonly durationMs: number;
}

// Three dedicated workers, not a generic pool.
// Each worker loads only the libraries it needs.
const shikiWorker = new Worker(new URL('./shiki.worker.ts', import.meta.url), { type: 'module' });

const markdownWorker = new Worker(new URL('./markdown.worker.ts', import.meta.url), {
  type: 'module',
});

const searchWorker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
```

### Shiki Worker

```typescript
// lib/workers/shiki.worker.ts
import { createHighlighter } from 'shiki';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

async function ensureHighlighter(): Promise<typeof highlighter> {
  if (highlighter === null) {
    highlighter = await createHighlighter({
      themes: ['orbit-dark', 'orbit-light'],
      langs: ['typescript', 'rust', 'python', 'bash', 'json', 'html', 'css'],
    });
  }
  return highlighter;
}

self.onmessage = async (e: MessageEvent<WorkerTask<ShikiPayload>>): Promise<void> => {
  const h = await ensureHighlighter();
  const html = h.codeToHtml(e.data.payload.code, {
    lang: e.data.payload.lang,
    theme: e.data.payload.theme,
  });
  self.postMessage({ id: e.data.id, html, durationMs: performance.now() });
};
```

### Markdown Worker

```typescript
// lib/workers/markdown.worker.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);

self.onmessage = async (e: MessageEvent<WorkerTask<string>>): Promise<void> => {
  const result = await processor.process(e.data.payload);
  self.postMessage({ id: e.data.id, html: String(result), durationMs: performance.now() });
};
```

### Search/File Worker

```typescript
// lib/workers/search.worker.ts
interface FlattenPayload {
  readonly tree: FileTreeNode;
  readonly expandedPaths: ReadonlySet<string>;
}

self.onmessage = (e: MessageEvent<WorkerTask<FlattenPayload>>): void => {
  const flat = flattenTree(e.data.payload.tree, e.data.payload.expandedPaths);
  self.postMessage({ id: e.data.id, html: flat, durationMs: performance.now() });
};

function flattenTree(node: FileTreeNode, expanded: ReadonlySet<string>): FlatFileEntry[] {
  const result: FlatFileEntry[] = [];
  // Iterative DFS to avoid stack overflow on deep trees
  const stack: Array<{ node: FileTreeNode; depth: number }> = [{ node, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    result.push({ path: item.node.path, depth: item.depth, isDir: item.node.isDir });
    if (item.node.isDir && expanded.has(item.node.path) && item.node.children) {
      for (let i = item.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: item.node.children[i], depth: item.depth + 1 });
      }
    }
  }
  return result;
}
```

---

## What We Get

| Metric                        | Before                                      | After                                           |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Main thread during streaming  | Shiki (8-15ms) + Markdown (3-8ms) per chunk | Near zero -- only postMessage overhead (~0.1ms) |
| Code block highlight latency  | Synchronous, blocks frame                   | Async, result applied on next frame             |
| File tree flatten (10k files) | ~80ms on main thread                        | ~0.5ms postMessage + off-thread                 |
| File tree flatten (34k files) | OOM / 300ms+ freeze                         | Off-thread, main thread free                    |
| FPS during streaming          | Drops to 30-40 FPS with code blocks         | Maintains 60-120 FPS                            |

---

## Estimated Complexity

**Large (3-5 days)**

- Day 1: Shiki worker + integration with Streamdown
- Day 2: Markdown worker + incremental parsing strategy
- Day 3: Search/file worker + file tree integration
- Day 4: Testing, error handling, fallback to main thread
- Day 5: Performance validation, edge cases (worker crash recovery)

---

## Dependencies

- None blocking. Can start immediately.
- Mission #02 (Streaming Backpressure) pairs well -- worker results can feed into the RAF batcher.
- Follow the Pierre diff worker pattern in the existing codebase for consistency.

---

## Risks

| Risk                                                  | Mitigation                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Worker initialization delay on first use              | Pre-warm workers on app start; show un-highlighted code immediately, apply highlights when ready |
| Shiki WASM loading in worker context                  | Test early -- Shiki's WASM loader may need Vite worker config adjustments                        |
| Message serialization overhead for large payloads     | Use Transferable objects for large strings; benchmark postMessage cost                           |
| Worker crash leaves pending tasks orphaned            | Timeout + fallback: if worker doesn't respond in 5s, run on main thread                          |
| Increased bundle size from duplicated deps in workers | Workers share the same Vite bundle; tree-shaking should keep them lean                           |
