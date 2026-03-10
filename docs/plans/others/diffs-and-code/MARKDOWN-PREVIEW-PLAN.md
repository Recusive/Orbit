# Markdown Preview Toggle for Editor

## Context

Markdown files (`.md`, `.mdx`) open in CodeMirror 6 as raw source. The user wants a toggle to switch between code view and rendered markdown preview — matching VS Code's preview behavior. The app already has battle-tested Streamdown markdown rendering in chat messages, so we reuse that infrastructure.

## Approach

**Per-file boolean toggle** stored in `markdownPreview: Record<string, boolean>` on `FileViewerStore`, NOT extending `FileViewMode` (`'file' | 'diff'`). Preview is a rendering toggle within file view, not a different opening mode.

## Changes

### 1. Store — `apps/agent/src/stores/file/file-viewer-store.ts`

- Add `markdownPreview: Record<string, boolean>` to state (default `{}`)
- Add `toggleMarkdownPreview(path: string)` action — flips `state.markdownPreview[path]`. Search state is NOT cleared here because the store doesn't know whether the file exceeds `MAX_PREVIEW_LINES` (that's a render-layer concern). Search clearing happens in the component layer when `isPreviewRendered` becomes `true`:

```typescript
toggleMarkdownPreview: (path: string): void => {
  set((state) => {
    const next = !(state.markdownPreview[path] ?? false);
    state.markdownPreview[path] = next;
  });
},
```

- Search state clearing is handled by a `useEffect` in `file-viewer-content.tsx` that watches `isPreviewRendered`. Uses the existing `closeSearch()` action which atomically resets all three search fields (`searchOpen`, `searchQuery`, `searchTrigger`):

```typescript
// file-viewer-content.tsx — clear search only when preview is actually rendered
const prevPreviewRef = useRef(false);

useEffect(() => {
  // Only clear on transition into preview (false → true), not on every render
  if (isPreviewRendered && !prevPreviewRef.current) {
    useFileViewerStore.getState().closeSearch();
  }
  prevPreviewRef.current = isPreviewRendered;
}, [isPreviewRendered]);
```

The `useRef` guard prevents redundant `closeSearch()` calls on re-renders where `isPreviewRendered` stays `true` (e.g., file content update triggers re-render). Only the `false → true` transition clears search.

- Clean up in `closeTab`: `delete state.markdownPreview[path]`
- Clean up in `closeAllTabs`: `state.markdownPreview = {}`
- Reset in `gotoPosition`: only when preview was active for that path — avoids writing unnecessary `false` entries for non-markdown files:

```typescript
// Inside gotoPosition, after openFile call:
if (state.markdownPreview[path]) {
  delete state.markdownPreview[path];
}
```

- Do NOT persist `markdownPreview` — preview resets on restart. Persisting absolute file paths grows localStorage unbounded. `partialize` stays unchanged (only `wordWrap`)
- Add selector hook:

```typescript
export const useMarkdownPreview = (path: string | null): boolean => {
  return useFileViewerStore((state) => {
    if (!path) return false;
    return state.markdownPreview[path] ?? false;
  });
};
```

### 2. New Component — `apps/agent/src/components/files/markdown-preview.tsx`

Renders file content with Streamdown, reusing chat's proven plugin setup.

**Module-level constants** (CRITICAL — Streamdown compares plugin arrays by reference identity. Defining inside component forces full re-render on every parent update. See `MessageItem.tsx:46-71`):

```typescript
const REMARK_PLUGINS = [remarkGfm];
const STREAMDOWN_PLUGINS = { mermaid, code };
const LINK_SAFETY_DISABLED = { enabled: false } as const;

const MarkdownTable: FC<{ readonly children?: React.ReactNode }> = ({ children }) => (
  <div className="table-wrapper">
    <table>{children}</table>
  </div>
);
const STREAMDOWN_COMPONENTS = { table: MarkdownTable };
```

**Link routing** — three-tier click interception for anchors:

1. **Fragment links** (`#section`) → scroll within the preview container. If the target heading ID doesn't exist (e.g., typo or missing anchor), `querySelector` returns null and scrollIntoView is never called — silent no-op, matching browser behavior.
2. **Relative markdown links** (`other.md`, `../docs/guide.md`) → normalize path, then open using the full file-open flow (`openFile` + `setLoading` + `file:read`)
3. **Absolute URLs** (`https://...`) → route through `url:open` → Tauri → system browser

Detection uses `anchor.getAttribute('href')` (raw attribute from markdown source) rather than `anchor.href` (browser-resolved URL), because Tauri's webview resolves relative hrefs against `tauri://localhost/...` making protocol detection unreliable.

**Path normalization** is required for relative links containing `../` or `./`. Without it, `openTabs.find(t => t.path === path)` uses strict string equality, so `/src/foo/../bar/file.md` and `/src/bar/file.md` would create duplicate tabs with divergent state. Uses a simple segment-based normalizer (no Node.js `path` module in browser):

```typescript
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);

/** Normalize path segments: resolve `.`, `..`, collapse duplicate `/` */
function normalizePath(path: string): string {
  const segments = path.split('/');
  const result: string[] = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      result.pop();
    } else {
      result.push(seg);
    }
  }
  return '/' + result.join('/');
}

// Inside component:
const { postMessage } = useTauri({});
const setLoading = useFileViewerStore((state) => state.setLoading);
const openFileAction = useFileViewerStore((state) => state.openFile);

const handleContentClick = useCallback(
  (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    // Use raw attribute — browser-resolved href is unreliable in Tauri webview
    const rawHref = anchor.getAttribute('href');
    if (!rawHref) return;
    e.preventDefault();

    // 1. Fragment links → scroll within preview
    if (rawHref.startsWith('#')) {
      const targetId = rawHref.slice(1);
      const el = (e.currentTarget as HTMLElement).querySelector(`[id="${CSS.escape(targetId)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 2. Absolute URLs → route through url:open with protocol allowlist
    try {
      const parsed = new URL(rawHref);
      if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        postMessage({ type: 'url:open', uuid: generateUUID(), url: rawHref });
      }
      // Non-allowed protocols (file://, javascript://, etc.) silently blocked
      return;
    } catch {
      // Not an absolute URL — fall through to relative link handling
    }

    // 3. Relative markdown links → normalize, then full file-open flow
    //    Strip query/fragment from href for extension check and path resolution
    const cleanHref = rawHref.split('#')[0]?.split('?')[0] ?? rawHref;
    const ext = cleanHref.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
    if (MARKDOWN_EXTENSIONS.has(ext)) {
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
      const resolvedPath = normalizePath(`${fileDir}/${cleanHref}`);
      // Full file-open flow — matches use-file-tree.ts:946-968 and chat-actions.ts:505-519
      // openFile alone only creates an empty tab; file:read fetches actual content
      openFileAction(resolvedPath);
      setLoading(true, resolvedPath);
      postMessage({ type: 'file:read', uuid: generateUUID(), path: resolvedPath });
      return;
    }

    // Other relative links (images, etc.) — no action
  },
  [postMessage, openFileAction, setLoading, filePath]
);
```

**Error boundary** — wrap Streamdown body with `ErrorBoundary`. Uses the existing `ErrorBoundary` component from `@/components/shared` with a render-function fallback that offers a "Switch to source" button. This catches catastrophic failures (e.g., Streamdown itself throws). Individual plugin failures (one bad Mermaid diagram among valid content) should degrade inline — `@streamdown/mermaid` renders error text inside the diagram block rather than throwing. If it does throw, the ErrorBoundary catches it and the user can switch to source:

```tsx
<ErrorBoundary
  fallback={(error, reset) => (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <p className="text-sm">Preview failed to render</p>
      <p className="text-xs max-w-md text-center">{error.message}</p>
      <div className="flex gap-2">
        <button onClick={reset} className="text-xs underline">
          Retry
        </button>
        <button onClick={onSwitchToSource} className="text-xs underline">
          Switch to source
        </button>
      </div>
    </div>
  )}
>
  <div className="file-preview" onClick={handleContentClick}>
    <Streamdown
      remarkPlugins={REMARK_PLUGINS}
      plugins={STREAMDOWN_PLUGINS}
      components={STREAMDOWN_COMPONENTS}
      linkSafety={LINK_SAFETY_DISABLED}
      mode="static"
    >
      {content}
    </Streamdown>
  </div>
</ErrorBoundary>
```

Plugin configuration:

- `remark-gfm` for GFM tables, strikethrough, etc.
- `@streamdown/code` for Shiki syntax highlighting in code blocks
- `@streamdown/mermaid` for diagram rendering
- Custom `MarkdownTable` component (same as chat)
- `mode="static"` (no streaming animation)
- `linkSafety={{ enabled: false }}` — Streamdown renders plain `<a>` tags; our click handler routes them (matches `MessageItem.tsx:33-34`)
- **Omits** `rehypeFlowTokens` (per-word blur-in animation — chat-streaming-specific)
- **Omits** `rehypeInsightBlocks` (insight callout blocks — chat-streaming-specific)
- Scrollable container with `bg-editor-bg` background
- Readable `max-width: 48rem` centered layout

### 3. File Viewer Content — `apps/agent/src/components/files/file-viewer-content.tsx`

- Import `useMarkdownPreview` selector
- Lazy-load `MarkdownPreview` (same pattern as `LazyCodeMirrorEditor`)
- Large-file threshold constant:

```typescript
const MAX_PREVIEW_LINES = 10_000;
```

- **Derive `isPreviewRendered`** — the effective rendered state that combines user toggle intent with file capability. This is the single source of truth for whether preview is actually visible, used by this component AND exported for toolbar/keyboard guards:

```typescript
const markdownPreview = useMarkdownPreview(file?.path ?? null);
const canRenderPreview = (file?.content?.split('\n').length ?? 0) <= MAX_PREVIEW_LINES;
const isPreviewRendered =
  file?.language === 'markdown' && file.viewMode !== 'diff' && markdownPreview && canRenderPreview;
```

- Diff mode must NOT be replaceable by preview (user needs diff context)
- When `isPreviewRendered` → render `MarkdownPreview` instead of CodeMirror
- When `canRenderPreview` is `false` → stay in source mode even if toggle is on (CodeMirror's viewport culling handles large files gracefully)
- Show minimal breadcrumbs in preview mode — file path for orientation but no active outline index (cursor tracking is meaningless without CodeMirror)

**Shared hook** — extract `useIsPreviewRendered` for reuse by toolbar and keyboard guards (avoids duplicating the derivation logic):

```typescript
// apps/agent/src/hooks/file/use-is-preview-rendered.ts
export const useIsPreviewRendered = (file: OpenFile | null): boolean => {
  const markdownPreview = useMarkdownPreview(file?.path ?? null);
  const canRenderPreview = (file?.content?.split('\n').length ?? 0) <= MAX_PREVIEW_LINES;
  return (
    file?.language === 'markdown' && file.viewMode !== 'diff' && markdownPreview && canRenderPreview
  );
};
```

### 4. Toggle Button + Search Guard — `apps/agent/src/components/panels/activity-panel.tsx`

**Toggle button:**

- Add toggle button in `TabsHeader` toolbar (between Search and "More Actions...")
- Only visible when active tab is markdown AND `viewMode !== 'diff'`
- Icon: `BookOpen` when showing code (click → preview), `Code` when showing preview (click → code)
- Tooltip AND `aria-label`: "Show preview" / "Show source" (both required — codebase convention for icon buttons)
- Derive `isMarkdown` inside `TabsHeader` using `useActiveFile()` selector — avoids adding 3 props to `TabsHeaderProps`
- In `TabsHeader`: read effective preview state via `useIsPreviewRendered(activeFile)`, raw toggle via `useMarkdownPreview`, toggle action via `useFileViewerStore.getState().toggleMarkdownPreview`
- **Threshold-blocked state**: When `markdownPreview` is `true` but `isPreviewRendered` is `false` (file too large), show a disabled-style button with tooltip explaining why: `'Preview unavailable — file too large'`

```tsx
const isPreviewRendered = useIsPreviewRendered(activeFile);
const markdownPreview = useMarkdownPreview(activeFile?.path ?? null);
const isThresholdBlocked = markdownPreview && !isPreviewRendered;

{
  isMarkdown && activeFile?.viewMode !== 'diff' ? (
    <button
      onClick={() => toggleMarkdownPreview(activeFile.path)}
      className={cn(
        'h-6 w-6 flex items-center justify-center rounded transition-colors',
        isThresholdBlocked
          ? 'text-muted-foreground/40'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
      aria-label={
        isThresholdBlocked
          ? 'Preview unavailable — file too large'
          : markdownPreview
            ? 'Show source'
            : 'Show preview'
      }
      title={
        isThresholdBlocked
          ? 'Preview unavailable — file too large'
          : markdownPreview
            ? 'Show source'
            : 'Show preview'
      }
    >
      {markdownPreview ? <Code className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
    </button>
  ) : null;
}
```

**Search button guard:**

- Disable the Search toolbar button when preview is **actually rendered** (`isPreviewRendered`) — not when merely toggled on. If the file exceeds `MAX_PREVIEW_LINES`, CodeMirror is still mounted and search should work normally.
- Update tooltip to indicate unavailability: `'Search unavailable in preview'`

```tsx
<button
  onClick={() => {
    if (activeTabPath && !isPreviewRendered) onToggleSearch(activeTabPath);
  }}
  disabled={isPreviewRendered}
  className={cn(
    'h-6 w-6 flex items-center justify-center rounded transition-colors',
    isPreviewRendered
      ? 'text-muted-foreground/40 cursor-not-allowed'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  )}
  aria-label="Search in file"
  title={isPreviewRendered ? 'Search unavailable in preview' : 'Search (⌘F)'}
>
  <Search className="h-4 w-4" />
</button>
```

**Cmd+F guard in `file-viewer.tsx`:**

- The `Cmd+F` handler in `FileViewer` calls `toggleSearch(activeFile.path)`. Guard using effective rendered state, not raw toggle — if the file is too large for preview, CodeMirror is mounted and `Cmd+F` should work:

```typescript
// file-viewer.tsx — useIsPreviewRendered gives the effective state
const isPreviewRendered = useIsPreviewRendered(activeFile);

if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
  e.preventDefault();
  if (activeFile?.path && !isPreviewRendered) {
    toggleSearch(activeFile.path);
  }
}
```

### 5. CSS — `apps/agent/src/globals.css`

Add `.file-preview` class for document-appropriate typography:

- `max-width: 48rem` centered (readable line length, like GitHub)
- Slightly larger font than chat (14px vs 13px)
- Larger headings (h1: 24px, h2: 20px, h3: 16px)
- Inherits table styling from existing `.chat-markdown table` / `.prose table` rules

### 6. Barrel Export — `apps/agent/src/components/files/index.ts`

Add `export { MarkdownPreview } from './markdown-preview'`

### 7. Tests

**Store tests** — `apps/agent/src/__tests__/unit/stores/file/file-viewer-store.test.ts`:

- Add `markdownPreview: {}` to `resetStore()` helper
- Add test: `toggleMarkdownPreview` flips state for a path
- Add test: `toggleMarkdownPreview` does NOT clear search state (moved to component layer)
- Add test: `closeTab` cleans up `markdownPreview[path]`
- Add test: `closeAllTabs` resets `markdownPreview` to `{}`
- Add test: `gotoPosition` clears `markdownPreview[path]` when active
- Add test: `gotoPosition` does NOT create entry for non-markdown files
- Add test: default is false for unopened files

**Component tests** — `apps/agent/src/__tests__/unit/components/files/file-viewer-content.test.tsx` (NEW):

- Assert: markdown file + viewMode=file + toggle=true + under threshold → renders MarkdownPreview
- Assert: markdown file + viewMode=diff → renders FileDiffViewer (no preview)
- Assert: non-markdown file + toggle=true → renders CodeMirror (toggle ignored)
- Assert: markdown file + toggle=true + **exceeds threshold** → renders CodeMirror (preview blocked)
- Assert: search state cleared when `isPreviewRendered` becomes true
- Assert: search state NOT cleared when toggle=true but file exceeds threshold

**Toolbar tests** — `apps/agent/src/__tests__/unit/components/panels/activity-panel.test.tsx` (NEW):

- Assert: preview toggle button visible only for markdown non-diff tabs
- Assert: aria-label swaps between "Show preview" / "Show source"
- Assert: Search button disabled when preview is actually rendered (`isPreviewRendered`)
- Assert: Search button **enabled** when toggle=true but file exceeds threshold (CodeMirror is mounted)
- Assert: Search button tooltip changes when preview is rendered
- Assert: toggle button shows "Preview unavailable — file too large" when threshold-blocked
- Assert: toggle button still clickable when threshold-blocked (user can toggle off)

**Keyboard shortcut tests** — `apps/agent/src/__tests__/unit/components/files/file-viewer.test.tsx` (NEW):

- Assert: `Cmd+F` does NOT trigger `toggleSearch` when `isPreviewRendered` is `true`
- Assert: `Cmd+F` DOES trigger `toggleSearch` when `isPreviewRendered` is `false`
- Assert: `Cmd+F` DOES trigger `toggleSearch` when toggle=true but file exceeds threshold (source mode active)
- Assert: `Cmd+F` DOES trigger `toggleSearch` for non-markdown files regardless of preview state

```tsx
// Keyboard shortcut guard — uses isPreviewRendered, not raw markdownPreview
it('does not trigger search on Cmd+F when preview is rendered', () => {
  // Arrange: active markdown tab + markdownPreview[path] = true + file under threshold
  // Act: dispatch Cmd+F keydown event
  // Assert: toggleSearch was not called
});

it('triggers search on Cmd+F when preview toggled but file exceeds threshold', () => {
  // Arrange: active markdown tab + markdownPreview[path] = true + file.content > 10K lines
  // Act: dispatch Cmd+F keydown event
  // Assert: toggleSearch was called (CodeMirror is mounted, search should work)
});
```

## Files Modified

| File                                                                          | Change                                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/file/file-viewer-store.ts`                             | Add state, action, cleanup (closeTab + closeAllTabs + gotoPosition), selector                      |
| `apps/agent/src/hooks/file/use-is-preview-rendered.ts`                        | **NEW** — Derived `useIsPreviewRendered` hook (single source of truth for effective preview state) |
| `apps/agent/src/components/files/markdown-preview.tsx`                        | **NEW** — Streamdown preview with link routing, ErrorBoundary, module-level constants              |
| `apps/agent/src/components/files/file-viewer-content.tsx`                     | Conditional render via `isPreviewRendered`, search clear on preview entry, large-file threshold    |
| `apps/agent/src/components/panels/activity-panel.tsx`                         | Toggle button (with threshold-blocked state) + search button guarded by `isPreviewRendered`        |
| `apps/agent/src/components/files/file-viewer.tsx`                             | Guard Cmd+F via `isPreviewRendered`                                                                |
| `apps/agent/src/globals.css`                                                  | `.file-preview` styles                                                                             |
| `apps/agent/src/components/files/index.ts`                                    | Barrel export                                                                                      |
| `apps/agent/src/__tests__/unit/stores/file/file-viewer-store.test.ts`         | Store tests for markdownPreview lifecycle                                                          |
| `apps/agent/src/__tests__/unit/components/files/file-viewer-content.test.tsx` | **NEW** — Component tests for preview/source/diff rendering                                        |
| `apps/agent/src/__tests__/unit/components/panels/activity-panel.test.tsx`     | **NEW** — Toolbar toggle visibility and search disable tests                                       |
| `apps/agent/src/__tests__/unit/components/files/file-viewer.test.tsx`         | **NEW** — Keyboard shortcut guard tests (Cmd+F in preview mode)                                    |

## Edge Cases

### Relative markdown links (`other.md`, `./docs/guide.md`, `../api/reference.md`)

Detected by `new URL(rawHref)` throwing (not an absolute URL) + extension matching against `MARKDOWN_EXTENSIONS`. Resolved against the current file's directory and **normalized** via `normalizePath()` to collapse `.`/`..` segments and duplicate `/`. This normalization is critical because `openTabs.find(t => t.path === path)` uses strict string equality — without it, `/src/foo/../bar/file.md` and `/src/bar/file.md` would create duplicate tabs with divergent state.

Opened via the full file-open flow (`openFile` + `setLoading` + `file:read`), matching the canonical 3-step pattern used across `use-file-tree.ts:946-968`, `chat-actions.ts:505-519`, and `quick-open.tsx:119-142`. Using `openFile` alone only creates an empty tab — the `file:read` message is what triggers the Rust backend to fetch and return file contents.

Non-markdown relative links (images, PDFs) are silently ignored — they have no meaningful action in preview mode.

**Outside-workspace links**: If a relative path resolves above the workspace root (e.g., `../../../../etc/passwd`), `normalizePath` will resolve it to a valid-looking path, but the Rust `file:read` handler enforces workspace root boundaries — the read will fail. On failure, `handleFileRead` (`file-handlers.ts:156-169`) closes the pre-opened tab via `closeTab(path)` and emits a global error toast. The tab does not persist in an error state — it is removed entirely. No additional frontend guard is needed.

### Fragment links (`#section`)

Detected by `rawHref.startsWith('#')`. Scrolls within the preview container using `querySelector` + `scrollIntoView({ behavior: 'smooth' })`. Streamdown/remark-gfm generates heading IDs automatically, so `[Jump](#section)` → `<h2 id="section">` works natively. Does NOT route through `url:open` — these are intra-document navigation.

**Missing heading IDs**: If the target heading ID doesn't exist (typo, absent anchor, or Streamdown's slug algorithm doesn't match the expected ID), `querySelector` returns `null` and `scrollIntoView` is never called — silent no-op, matching standard browser behavior for unresolvable fragment links. Streamdown uses remark-gfm's default slug algorithm (lowercase, hyphen-separated); custom slug generation is not needed for v1 but could be added via a remark plugin if slug mismatches become common.

### Canonical vs non-canonical path variants

The same file can be referenced as `a/b.md` and `a/../a/b.md`. Without normalization these create duplicate tabs because `openTabs` uses strict path equality. `normalizePath()` collapses these to the same canonical form before calling `openFile`, preventing state divergence. Edge case: symlinks could produce two genuinely different paths that resolve to the same physical file — this is not addressed in v1 (matches VS Code behavior, which also opens separate tabs for symlinked paths).

### Rapid external file updates while preview is active

When the AI agent writes to a `.md` file, `setFileContent` / `updateContent` in the store update `file.content` → React re-renders → Streamdown re-processes the full document including Shiki highlighting and Mermaid diagrams. This is the same code path chat messages use, so it works correctly. For very large files or rapid successive writes, the Streamdown render could be expensive. **No debounce is added in v1** — the render is synchronous from React's perspective (Streamdown uses `mode="static"`) and matches the existing chat behavior. If this becomes a performance issue, a `useDeferredValue` wrapper on the content prop would be the right fix.

### Partial plugin failures (Mermaid/code rendering)

Two layers of defense:

1. **Individual block failures**: `@streamdown/mermaid` catches diagram parse errors internally and renders error text inline (e.g., "Syntax error in diagram" inside the block). The rest of the preview renders normally. `@streamdown/code` (Shiki) similarly falls back to unhighlighted `<pre>` blocks on failure. These are graceful degradations within Streamdown.
2. **Catastrophic failures**: If Streamdown itself throws (e.g., remark-gfm encounters pathological input), the `ErrorBoundary` catches it and renders a fallback with "Retry" and "Switch to source" buttons. The reset function clears the error state; switching to source calls `toggleMarkdownPreview(path)`.

### Threshold-blocked preview state

When `markdownPreview[path]` is `true` but the file exceeds `MAX_PREVIEW_LINES`, the toggle is "on" but preview is not rendered. This creates a state divergence between user intent and effective mode. The `useIsPreviewRendered` hook resolves this by combining both signals into a single boolean:

- **Rendering**: `file-viewer-content.tsx` uses `isPreviewRendered` → shows CodeMirror (not preview)
- **Search button**: enabled (CodeMirror is mounted, search works normally)
- **Cmd+F**: works (same reason)
- **Search clear**: does NOT run (preview isn't rendered, so search state shouldn't be wiped)
- **Toggle button**: shows dimmed icon with tooltip `'Preview unavailable — file too large'` — still clickable so the user can toggle off
- **Redundant effect calls**: The `useRef` guard in the search-clear effect ensures `closeSearch()` only fires on the `false → true` transition of `isPreviewRendered`, not on every re-render. Without this, content updates (AI writing to the file) would re-trigger `closeSearch()` on every render cycle — non-fatal but wasteful.
- **Configurability**: `MAX_PREVIEW_LINES` is a compile-time constant (not user-configurable in v1). Making it a setting would require adding it to the settings store, settings UI, and Rust settings persistence — disproportionate for v1 since the 10K threshold covers essentially all real markdown files. Can be made configurable in a future enhancement.

### Split-view same file path

`markdownPreview` is keyed by `path`. If the same markdown file is shown in two panes (future split-view), both panes share toggle state — toggling one toggles both. This is a known coupling. Future fix: key by `paneId:path` composite key once split-view is implemented. **Not addressed in v1** since split-view for file editing is not yet shipped.

## Known Limitations

- **Large files (>10K lines)**: Files exceeding `MAX_PREVIEW_LINES` (10,000) automatically fall back to source mode even if preview toggle is on. CodeMirror's viewport culling handles these files gracefully. The threshold is a compile-time constant — not user-configurable in v1.
- **MDX JSX components**: `.mdx` maps to `'markdown'` language, so the toggle button appears. But JSX components inside MDX cannot render in Streamdown — they'll show as raw text.
- **No scroll position sync**: Toggling between code and preview loses scroll position. A future enhancement could map cursor line to approximate scroll offset.
- **No preview-mode search**: Search is disabled in preview. A future enhancement could add browser-native find (`window.find()`) or a dedicated search overlay.
- **Split-view coupling**: Same file in two panes shares preview toggle state. See Edge Cases section.

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run test` — all existing + new store and component tests pass
4. `bunx tauri dev` — open a `.md` file, verify:
   - Toggle button appears in toolbar (only for .md files, not for .md diffs)
   - Toggle button has accessible tooltip and aria-label
   - Click toggles between raw source and rendered preview
   - Preview shows proper heading hierarchy, code blocks with syntax highlighting, tables, mermaid diagrams
   - External links (`https://...`) open in system browser via `url:open`
   - Fragment links (`#section`) scroll smoothly within preview
   - Relative markdown links (`other.md`) open in editor with content loaded (not empty tab)
   - Relative links with `../` segments resolve correctly (no duplicate tabs)
   - Relative links outside workspace root fail gracefully (Rust backend rejects)
   - Fragment links to non-existent headings are silent no-ops
   - Non-allowed protocols (`file://`, `javascript://`) are silently blocked
   - Switching to a non-md file hides the toggle button
   - Toggle state persists per-file (open two .md files, toggle one, switch tabs)
   - Closing tab cleans up state
   - Closing all tabs cleans up all preview state
   - `gotoPosition` (diagnostic click) forces code view even if preview was active
   - Search button is disabled in preview mode with updated tooltip
   - `Cmd+F` does nothing in preview mode
   - Malformed Mermaid diagram shows inline error text (graceful degradation)
   - Catastrophic render failure shows ErrorBoundary with Retry/Source buttons
