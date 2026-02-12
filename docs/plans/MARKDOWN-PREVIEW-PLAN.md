# Markdown Preview Toggle for Editor

## Context

The editor currently opens `.md`/`.mdx` files in CodeMirror with syntax highlighting but no way to see rendered output. VS Code has "Open Preview" (Cmd+Shift+V) — we want the same. The user clicks a toggle button in the breadcrumb bar and the **entire editor area** swaps to rendered markdown. Click again → back to CodeMirror. No side-by-side.

We already have `Streamdown` + `remark-gfm` + `@streamdown/code` + `@streamdown/mermaid` loaded for chat messages, plus all the CSS in `globals.css` (`.chat-markdown` class). We reuse all of this.

---

## Audit Findings

### Round 1 (from initial `reviews/audit-plan.md`)

#### Critical Fixes (addressed in plan below)

1. **Link clicks in preview have no handler** — Without an `onClick` interceptor, anchor clicks would attempt default browser navigation inside the Tauri window, which could navigate away from the app or fail silently. Fix: add an `onClick` handler to the preview wrapper `<div>` that intercepts anchor clicks and opens them via Tauri's shell API, same pattern as `MessageItem.tsx:183-190`. The `MarkdownPreview` component must accept an `onOpenUrl` prop.

2. **Outline heading click in preview mode exits preview** — Clicking a heading in the breadcrumbs outline calls `gotoPosition` → `openFile` → resets `viewMode='file'`. Fix: in the preview branch of `file-viewer-content.tsx`, do NOT pass `onOutlineClick` or outline items to `EditorBreadcrumbs`. Outline items are meaningless in preview mode (no cursor position). The preview branch renders breadcrumbs with toggle props only.

#### Recommended Improvements (addressed in plan below)

3. **Preview background should use `bg-background`** — The breadcrumbs bar uses `bg-card`. If the preview body inherits the same, it looks flat. Use `bg-background` on the outer preview container for visual contrast.

4. **Skip `useIsMarkdownPreview` selector hook** — The plan agent originally described one, but it's unnecessary. `file.viewMode` is already accessible via the `file` prop in `FileViewerContent`. No extra selector hook needed.

### Round 2 (from Opus architectural audit)

#### Critical Fixes (addressed in plan below)

5. **`openUrl` has no source in `FileViewerContent`** — Round 1 said "same pattern as chat messages" but `FileViewerContent` is NOT in the chat prop chain. Its parent `FileViewer` has no `onOpenUrl` prop. `handleOpenUrl` lives in `chat-actions.ts` and flows through `ChatArea → ChatContent → ChatMessages → MessageItem` — a completely separate component tree. Fix: import `open` from `@tauri-apps/plugin-shell` directly in `file-viewer-content.tsx`, matching the pattern at `FeedbackSettings.tsx:1,15-17`.

6. **Activity panel LSP close logic only handles `'diff'`** — `activity-panel.tsx:520` has `if (tab?.viewMode === 'diff')` to decide whether to call `lspDidClose`. Preview mode also doesn't mount CodeMirrorEditor, so closing a tab in preview mode would skip the LSP close notification. Fix: change guard to `tab?.viewMode !== 'file'` to future-proof against all non-editor view modes.

#### Recommended Improvements (addressed in plan below)

7. **Missing `<Suspense>` wrapper for `LazyMarkdownPreview`** — The existing CodeMirror lazy loading uses `<Suspense fallback={<EditorSkeleton />}>`. Preview should have the same.

8. **Language change while in preview leaves stale `viewMode`** — If `setFileContent` is called with `language !== 'markdown'` while `viewMode === 'preview'`, the rendering guard falls through correctly but the tab `viewMode` state is stale. Fix: reset `viewMode` to `'file'` in `setFileContent` when language changes away from markdown.

### Round 3 (from Opus plan audit — `reviews/audit-plan.md`)

#### Critical Fixes (addressed in plan below)

9. **`MarkdownPreview` missing `plugins` prop for `Streamdown`** — Without `plugins={{ mermaid, code }}`, code blocks get no Shiki syntax highlighting and mermaid diagrams don't render. The plan listed `@streamdown/code` and `@streamdown/mermaid` as reused dependencies but never passed them to `<Streamdown>`. Fix: add `plugins={STREAMDOWN_PLUGINS}` with `const STREAMDOWN_PLUGINS = { mermaid, code }` defined outside the component (same as `MessageItem.tsx:53`).

10. **No URI scheme filter on anchor clicks** — User-authored markdown could contain `javascript:` URIs (`[click](javascript:alert(1))`). While Tauri's `open()` may reject these, the defense should be explicit since file preview renders arbitrary user files (unlike chat which renders AI content). Fix: filter anchor `href` to only allow `https?://` schemes before calling `onOpenUrl`.

#### Recommended Improvements (addressed in plan below)

11. **Wrap `MarkdownPreview` in `React.memo`** — `FileViewerContent` subscribes to `searchTrigger`, `pendingGoto`, `cursorPosition` at the top level. While most don't change during preview, any parent re-render triggers a full Streamdown re-parse. `React.memo` on the preview component ensures it only re-renders when `content` or `onOpenUrl` actually change.

12. **Toggle button styling should match activity-panel context, not header-bar** — The breadcrumbs toggle button is contextually similar to the activity-panel action buttons (Search, Ellipsis at `activity-panel.tsx:349`), not the header-bar. Use `hover:bg-accent` instead of `hover:bg-gray-3`.

13. **Toggle button needs `type="button"`** — Without an explicit `type`, buttons default to `type="submit"` inside forms. Defensive practice consistent with codebase patterns.

### Nice-to-Haves (not in scope for v1)

- **Keyboard shortcut Cmd+Shift+V** (matches VS Code) — can be added later via `KEYBOARD_SHORTCUTS` in `constants.ts`
- **Preview scroll position preservation** on toggle cycles
- **Tab icon indicator** showing preview mode at a glance
- Mermaid diagrams already work out of the box via `@streamdown/mermaid`
- **Extract `openUrl` helper to `@/lib/api/shell.ts`** — Currently imported inline in `FeedbackSettings.tsx` and now `file-viewer-content.tsx`. Could DRY up in a follow-up.
- **Debounce preview content for large files** — Rapid `file.content` changes (tool writing to .md while preview open) cause synchronous re-parses. `useDeferredValue(content)` would prevent synchronous re-parses during rapid tool writes.
- **Extract `STREAMDOWN_PLUGINS` to shared config** — `MessageItem.tsx`, `plan-tool-widget.tsx`, and now `MarkdownPreview.tsx` all define the same plugin arrays. A shared `@/lib/streamdown-config.ts` would DRY these up.
- **Preview-specific skeleton** — `EditorSkeleton` shows line numbers and gutter (inappropriate for preview loading). A simple centered spinner or pulsing prose lines would be more accurate.

### Edge Cases Verified

- Empty `file.content` → Streamdown renders nothing (acceptable for v1)
- Tool writes to `.md` in preview mode → preview re-renders with new content (correct)
- `gotoPosition` from diagnostics while in preview → resets to `'file'` mode (correct)
- Very large markdown files → Streamdown `mode="static"` parses synchronously (acceptable — CodeMirror also struggles at 50K+ lines)
- File renamed from `.md` while tab open → `language` doesn't update until reopen (harmless)
- Unsaved changes + toggle to preview → preview shows in-memory content (correct, modified indicator remains)
- `closeTab` while in preview → standard tab close, no special handling needed
- Narrow panel width → toggle button uses `ml-auto shrink-0`, stays visible
- Relative image paths (`![](./image.png)`) → Tauri webview base URL differs from file location, images show broken icons (known v1 limitation — future fix: `convertFileSrc()`)
- Anchor fragments (`[link](#setup)`) → `open('#setup')` on system shell fails silently; should scroll within preview or be ignored. For v1: filtered out by `https?://` URI scheme check (Audit Fix #10), so these are simply no-ops
- Cmd+F in preview mode → `toggleSearch` fires but no CodeMirror to search. For v1: search bar appears but is inert (acceptable). Future: suppress `toggleSearch` when `viewMode === 'preview'`
- YAML frontmatter (`---\ntitle: ...\n---`) → renders as visible text in Streamdown. Some users expect it hidden. Acceptable for v1

---

## Files to Modify

| #   | File                                                                  | Change                                                    |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `apps/agent/src/stores/file/file-viewer-store.ts`                     | Extend `FileViewMode`, add `toggleMarkdownPreview` action |
| 2   | `apps/agent/src/components/editor/MarkdownPreview.tsx`                | **New file** — lazy-loadable Streamdown preview           |
| 3   | `apps/agent/src/components/editor/index.ts`                           | Add lazy-load comment for MarkdownPreview                 |
| 4   | `apps/agent/src/components/editor/editor-breadcrumbs.tsx`             | Add Eye/PencilLine toggle button                          |
| 5   | `apps/agent/src/components/files/file-viewer-content.tsx`             | Add preview rendering branch                              |
| 6   | `apps/agent/src/components/panels/activity-panel.tsx`                 | Fix LSP close guard for preview mode (Audit #6)           |
| 7   | `apps/agent/src/__tests__/unit/stores/file/file-viewer-store.test.ts` | Test the new action                                       |

---

## Implementation Steps

### Step 1: Store — `file-viewer-store.ts`

**Line 20** — extend the type:

```typescript
export type FileViewMode = 'file' | 'diff' | 'preview';
```

**Line 122** — add to `FileViewerActions` interface:

```typescript
toggleMarkdownPreview: (path: string) => void;
```

**After line 477** (after `toggleWordWrap`) — add action:

```typescript
toggleMarkdownPreview: (path: string): void => {
  set((state) => {
    const tab = state.openTabs.find((t) => t.path === path);
    if (!tab) return;
    if (tab.language !== 'markdown') return;
    tab.viewMode = tab.viewMode === 'preview' ? 'file' : 'preview';
  });
},
```

Note: `openFile` already resets `viewMode = 'file'` (line 247) — re-opening from file explorer always returns to edit mode. This is correct behavior.

**Also in `setFileContent`** (Audit Fix #8) — reset preview mode when language changes away from markdown. Inside the `if (tab)` branch, after the language update block:

```typescript
if (language) {
  tab.language = language;
}
// Reset preview if language changed away from markdown (Audit Fix #8)
if (tab.viewMode === 'preview' && tab.language !== 'markdown') {
  tab.viewMode = 'file';
}
```

### Step 2: New Component — `MarkdownPreview.tsx`

New file: `apps/agent/src/components/editor/MarkdownPreview.tsx`

- Reuses: `Streamdown` with `mode="static"`, `remarkGfm`, `@streamdown/code`, `@streamdown/mermaid`
- CSS: wraps in `.chat-markdown prose prose-sm dark:prose-invert max-w-none select-text` (all styles already exist)
- Outer container: `h-full w-full overflow-y-auto bg-background` (uses `bg-background` for contrast with `bg-card` breadcrumbs — Audit Fix #3)
- Inner wrapper: `max-w-3xl mx-auto px-8 py-6` for pleasant reading width
- No `rehypeFlowTokens` (that's for streaming animation only)
- `linkSafety: { enabled: false }` (desktop app handles URLs)
- Plugin arrays defined outside component for reference stability (same pattern as `MessageItem.tsx`)
- Wrapped in `React.memo` to prevent re-renders from parent state changes (Audit Fix #11)

**Module-level constants** (Audit Fix #9 — must include `plugins`):

```typescript
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];
const STREAMDOWN_PLUGINS = { mermaid, code };
const LINK_SAFETY_DISABLED = { enabled: false } as const;
```

**Streamdown element** — passes all three plugin props:

```typescript
<Streamdown
  remarkPlugins={REMARK_PLUGINS}
  plugins={STREAMDOWN_PLUGINS}
  linkSafety={LINK_SAFETY_DISABLED}
  mode="static"
>
  {content}
</Streamdown>
```

**Props** (Audit Fix #1 — link click handler):

```typescript
interface MarkdownPreviewProps {
  readonly content: string;
  readonly onOpenUrl?: (url: string) => void;
}
```

**Link click interception** — `onClick` handler on the wrapper `<div>` intercepts anchor clicks and delegates to `onOpenUrl`. Only allows `http://` and `https://` schemes to prevent `javascript:` URI execution in user-authored markdown (Audit Fix #10). Same delegation pattern as `MessageItem.tsx:183-190`:

```typescript
const handleClick = useCallback(
  (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor?.href && /^https?:\/\//.test(anchor.href)) {
      e.preventDefault();
      onOpenUrl?.(anchor.href);
    }
  },
  [onOpenUrl]
);
```

**Export with memo** (Audit Fix #11):

```typescript
export const MarkdownPreview = memo<MarkdownPreviewProps>(MarkdownPreviewInner);
MarkdownPreview.displayName = 'MarkdownPreview';
```

### Step 3: Barrel Export — `editor/index.ts`

Add comment that MarkdownPreview should be lazy-loaded (same pattern as CodeMirrorEditor). Do NOT add it to the barrel export.

### Step 4: Breadcrumbs — `editor-breadcrumbs.tsx`

Add 3 new optional props:

- `isMarkdown?: boolean` — controls toggle button visibility
- `isPreviewActive?: boolean` — controls icon and aria-label
- `onTogglePreview?: () => void` — callback

Add a toggle button on the **right side** (`ml-auto shrink-0`) of the breadcrumb bar:

- **Edit mode**: `Eye` icon (lucide-react) — "Show Preview"
- **Preview mode**: `PencilLine` icon — "Show Editor"
- Wrapped in `<Tooltip>` from `@/components/ui/tooltip` (`TooltipProvider` is global in `App.tsx:317`)
- Button styling matches activity-panel action buttons (Audit Fix #12): `h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent`
- `type="button"` explicit (Audit Fix #13)
- `aria-label` toggles between "Show Preview" / "Show Editor"

Only rendered when `isMarkdown && onTogglePreview` (non-markdown files see no button).

### Step 5: Content Rendering — `file-viewer-content.tsx`

Add imports at top of file:

```typescript
import { open } from '@tauri-apps/plugin-shell';

const LazyMarkdownPreview = lazy(() =>
  import('@/components/editor/MarkdownPreview').then((m) => ({ default: m.MarkdownPreview }))
);
```

> **Why `@tauri-apps/plugin-shell` directly?** (Audit Fix #5) — `FileViewerContent` is NOT in the chat component tree. The chat flow's `onOpenUrl` prop chain goes `ChatArea → ChatContent → ChatMessages → MessageItem` via `chat-actions.ts`. `FileViewer` → `FileViewerContent` is a completely separate hierarchy with no access to that chain. Import `open` directly from the Tauri plugin, matching `FeedbackSettings.tsx:1`.

Add `toggleMarkdownPreview` selector from store.

Add a stable `openUrl` callback inside the component:

```typescript
const openUrl = useCallback((url: string): void => {
  void open(url);
}, []);
```

Add `handleTogglePreview` callback:

```typescript
const handleTogglePreview = useCallback((): void => {
  toggleMarkdownPreview(file.path);
}, [toggleMarkdownPreview, file.path]);
```

Add new rendering branch between the existing diff check (line 135) and the editor section (line 139):

**Preview branch** (Audit Fix #2 — no outline in preview mode):

```typescript
if (file.viewMode === 'preview' && file.language === 'markdown') {
  return (
    <div className="h-full w-full flex flex-col">
      <EditorBreadcrumbs
        filePath={file.path}
        isMarkdown
        isPreviewActive
        onTogglePreview={handleTogglePreview}
      />
      <div className="flex-1 relative min-h-0">
        <Suspense fallback={<EditorSkeleton />}>
          <LazyMarkdownPreview content={file.content} onOpenUrl={openUrl} />
        </Suspense>
      </div>
    </div>
  );
}
```

Key details:

- `EditorBreadcrumbs` receives `isMarkdown`, `isPreviewActive`, `onTogglePreview` — but does NOT receive `onOutlineClick` or outline items. Outline headings are meaningless in preview mode (no cursor position), and clicking one would call `gotoPosition` → `openFile` → reset `viewMode='file'`, unexpectedly exiting preview.
- `<Suspense fallback={<EditorSkeleton />}>` wraps `LazyMarkdownPreview` (Audit Fix #7), matching the existing CodeMirror lazy-loading pattern.
- `openUrl` uses `open` from `@tauri-apps/plugin-shell` — opens in system default browser.

**Editor branch** — also pass `isMarkdown`, `isPreviewActive={false}`, `onTogglePreview` to `EditorBreadcrumbs` so the toggle button appears in both modes.

### Step 5b: Activity Panel — `activity-panel.tsx`

**(Audit Fix #6)** — Update the LSP close guard at line 520. Preview mode doesn't mount CodeMirrorEditor, so it needs the same manual `lspDidClose` call as diff mode:

```typescript
// Change from:
if (tab?.viewMode === 'diff') {

// To:
if (tab?.viewMode !== 'file') {
```

This future-proofs against any additional view modes. Only `'file'` mode mounts CodeMirrorEditor (which handles its own LSP lifecycle on unmount).

### Step 7: Tests — `file-viewer-store.test.ts`

Add tests for `toggleMarkdownPreview`:

- Toggles between `'file'` and `'preview'` for markdown files
- Does nothing for non-markdown files (guard on `tab.language`)
- Per-tab independence (two .md files, only one toggled)
- `openFile` resets preview back to `'file'` mode
- Does nothing for non-existent paths
- `setFileContent` with non-markdown language resets preview to `'file'` (Audit Fix #8)

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run test` — store tests pass (including new `toggleMarkdownPreview` tests)
4. `bun run dev` (or `bunx tauri dev`) — open a `.md` file:
   - Verify Eye icon appears in breadcrumbs (right side)
   - Click it → editor swaps to rendered markdown with nice typography
   - Click PencilLine icon → back to CodeMirror
   - Open a `.ts` file → no preview button appears
   - Toggle preview on one .md tab, switch to another .md tab → preview state is independent
   - Click a link in rendered preview → opens in system browser (not in Tauri window)
   - Verify no outline heading dropdown appears in preview mode
   - Verify preview background is visually distinct from breadcrumbs bar
   - Close a tab while in preview mode from the Changes panel → no LSP leak (Audit #6)
   - Lazy loading: first preview toggle shows `EditorSkeleton` briefly, then renders (Audit #7)
   - Verify code blocks in preview have Shiki syntax highlighting (Audit #9)
   - Verify mermaid diagrams render in preview (Audit #9)
   - Click a `javascript:` link in a malicious `.md` file → no-op (Audit #10)
   - Click a `#fragment` link → no-op, doesn't crash (Audit #10)
   - Verify `MarkdownPreview` doesn't re-render when parent state (e.g. searchTrigger) changes (React DevTools Profiler, Audit #11)
