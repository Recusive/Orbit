# Replace Vault CM6 Live Preview with Milkdown Crepe

## Context

The Vault's markdown editor uses a raw CodeMirror 6 setup with a custom `live-preview-plugin.ts` that hides/converts markdown syntax using CM6 decorations. This approach has fundamental limitations: no cross-line replacements, no real block widgets, tables can't be real `<table>` elements, and every element needs custom Widget classes. The result is a half-broken hybrid that never looks like rendered markdown.

**Milkdown Crepe** is a batteries-included WYSIWYG markdown editor built on ProseMirror + remark. It renders markdown as actual DOM elements natively — tables are real `<table>`, headings are real `<h1>`-`<h6>`, code blocks are real `<pre><code>`. Crepe bundles CommonMark, GFM, code highlighting, floating toolbar, slash commands, block drag handles, and theming.

---

## Step 1: Delete CM6 Files

**IMPORTANT**: Do this step LAST, after Steps 2–9 are complete and new tests pass. The ordering in this document is logical (what goes away), but execution order is: install → create → test → then delete.

**Delete entire `cm6/` directory** (9 files):

- `apps/agent/src/features/vault/cm6/index.ts`
- `apps/agent/src/features/vault/cm6/live-preview-plugin.ts`
- `apps/agent/src/features/vault/cm6/vault-theme.ts`
- `apps/agent/src/features/vault/cm6/node-names.ts`
- `apps/agent/src/features/vault/cm6/vault-commands.ts`
- `apps/agent/src/features/vault/cm6/vault-keybindings.ts`
- `apps/agent/src/features/vault/cm6/slash-commands.ts`
- `apps/agent/src/features/vault/cm6/slash-utils.ts`
- `apps/agent/src/features/vault/cm6/utils/mermaid-loader.ts`

**Delete CM6 test files** (6 files):

- `apps/agent/src/__tests__/unit/features/vault/cm6/vault-commands.test.ts`
- `apps/agent/src/__tests__/unit/features/vault/cm6/vault-editor-integration.test.tsx`
- `apps/agent/src/__tests__/unit/features/vault/cm6/live-preview-plugin.test.ts`
- `apps/agent/src/__tests__/unit/features/vault/cm6/slash-commands.test.ts`
- `apps/agent/src/__tests__/unit/features/vault/cm6/slash-utils.test.ts`
- `apps/agent/src/__tests__/unit/features/vault/cm6/node-names.test.ts`

**Delete old editor component**:

- `apps/agent/src/features/vault/components/VaultEditor.tsx`

---

## Step 2: Install Milkdown Crepe

```bash
bun add @milkdown/crepe @milkdown/utils
```

`@milkdown/crepe` is the batteries-included editor (bundles core, ctx, presets, plugins internally). `@milkdown/utils` provides the `replaceAll` action used for programmatic content sync — it's a transitive dep of Crepe via `@milkdown/kit`, but must be listed explicitly to avoid fragile Bun hoisting behavior. No `@milkdown/react` needed since VaultPage already mounts the editor with `key={activeDoc.id}` for doc switching.

---

## Step 3: Create `VaultCrepeEditor.tsx`

**File**: `apps/agent/src/features/vault/components/VaultCrepeEditor.tsx`

**Same props interface as old VaultEditor**:

```ts
interface VaultCrepeEditorProps {
  readonly initialContent: string;
  readonly readOnly: boolean;
  readonly onMarkdownChange: (markdown: string) => void;
  readonly onDirtyChange: () => void;
}
```

**Manual lifecycle pattern** (no @milkdown/react dependency):

- `useRef<HTMLDivElement>` for mount target
- `useRef<Crepe>` to hold the instance
- Stabilize callbacks with refs (same pattern as old VaultEditor lines 296-303)
- `useEffect` on mount:
  1. Construct: `new Crepe({ root, defaultValue, features })`
  2. Register listeners BEFORE create: `crepe.on((listener) => listener.markdownUpdated(...))`
  3. Create: `void crepe.create().then(...)` — async, returns Promise
  4. Cleanup: `crepe.destroy()`

**Async create() race guard** — `create()` is async, but `key={activeDoc.id}` can unmount the component mid-creation during fast doc switching. Use a `destroyed` flag:

```ts
useEffect(() => {
  if (containerRef.current === null) return;
  let destroyed = false;

  const crepe = new Crepe({ root: containerRef.current, defaultValue: initialContentRef.current, features: { ... } });

  // Register listeners BEFORE create()
  crepe.on((listener) => {
    listener.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
      if (destroyed || isSyncingRef.current) return;
      valueRef.current = markdown;
      onDirtyRef.current();
      onChangeRef.current(markdown);
    });
  });

  crepeRef.current = crepe;

  void crepe.create().then(() => {
    if (destroyed) {
      void crepe.destroy(); // Component unmounted while create() was pending
      return;
    }
    crepe.setReadonly(initialReadOnlyRef.current);
  }).catch((error: unknown) => {
    if (!destroyed) {
      logger.error('Failed to create Milkdown Crepe editor', { error });
      setEditorError(true); // Show user-visible fallback (retry + raw markdown)
    }
  });

  return (): void => {
    destroyed = true;
    crepeRef.current = null;
    void crepe.destroy();
  };
}, []);
```

**Error fallback state** — Add `const [editorError, setEditorError] = useState(false)`. When `editorError` is true, render a user-visible fallback with: raw markdown content in a `<pre>` block (read-only), a "Retry" button that resets `editorError` and triggers remount via key change. This ensures the vault never shows a blank panel on init failure.

**Content sync for reload** (same doc, external content change via file watcher):

- `useEffect` on `initialContent` change
- Use `isSyncingRef` flag to suppress onChange during programmatic updates (same pattern as old VaultEditor line 309)
- **Non-historic replacement** (matches old CM6 behavior of resetting undo history on reload):
  Use ProseMirror transaction API directly with `setMeta('addToHistory', false)` instead of `replaceAll` from `@milkdown/utils`. This prevents Ctrl+Z from reverting to pre-reload content, which is the same guarantee the old editor provided.

```ts
import { editorViewCtx, parserCtx } from '@milkdown/crepe';

function replaceContentWithoutHistory(crepe: Crepe, markdown: string): void {
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const nextDoc = parser(markdown);
    if (nextDoc === null || nextDoc === undefined) return;

    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  });
}
```

**Contract**: External reloads NEVER create undo entries. This is tested (see Step 8).

**Readonly**: `useEffect` on `readOnly` change → `crepe.setReadonly(readOnly)`

**Dark mode**: `useEffect` on `isDark` change → swap CSS class on container (Crepe themes use CSS variables, so toggling a `.dark` class on the wrapper and overriding `--crepe-*` variables handles light/dark)

**Crepe features to enable**:

- `Crepe.Feature.ListItem` — bullet, ordered, task lists
- `Crepe.Feature.Table` — interactive table editing
- `Crepe.Feature.Toolbar` — floating text formatting toolbar (replaces old VaultToolbar)
- `Crepe.Feature.Placeholder` — "Start writing..." text
- `Crepe.Feature.BlockEdit` — drag handles + slash command menu
- `Crepe.Feature.LinkTooltip` — link editing tooltips
- `Crepe.Feature.CodeMirror` — syntax-highlighted code blocks
- `Crepe.Feature.Cursor` — drop/gap cursor

**Features to disable**:

- `Crepe.Feature.ImageBlock` — not needed for markdown notes
- `Crepe.Feature.Latex` — not needed

**UX change: fixed toolbar → floating toolbar** — The old `VaultToolbar` is a fixed 40px bar with 15 always-visible buttons. Crepe's `Toolbar` feature is a floating toolbar on text selection. This is intentional — the `BlockEdit` slash commands + floating toolbar provide sufficient discoverability while reducing visual clutter. Users can still use keyboard shortcuts for common formatting.

**Custom keyboard shortcuts** — Crepe ships Cmd+B (bold) and Cmd+I (italic) natively via ProseMirror CommonMark. The old `vault-keybindings.ts` had 7 additional shortcuts. Restore these via a ProseMirror keymap plugin registered after `create()`:

- Cmd+Shift+S → strikethrough
- Cmd+E → inline code
- Cmd+K → link
- Cmd+Shift+1/2/3 → heading levels 1/2/3

**Custom slash commands** — Crepe's `BlockEdit` provides built-in slash commands. Verify coverage of the old 10 commands. If `/mermaid` or `/divider` are missing, extend via `featureConfigs` for `BlockEdit`.

**Spellcheck** — Old VaultEditor explicitly enables spellcheck via `EditorView.contentAttributes.of({ spellcheck: 'true' })`. Add `spellCheck={true}` on the container div or verify Milkdown's ProseMirror contenteditable enables it by default.

**Layout**: Keep `.vault-editor-shell` class on wrapper (referenced by autosave hook's Cmd+S detection at `use-vault-autosave.ts:49`). Inner container gets constrained width: `max-width: 48rem; margin: 0 auto; padding: 2rem 1.5rem`.

---

## Step 4: Style Milkdown to Match App Design

**CSS imports in VaultCrepeEditor.tsx**:

```ts
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@milkdown/crepe/theme/frame-dark.css';
```

Import both `frame.css` and `frame-dark.css` — Crepe's dark theme has additional selectors beyond variable overrides. The `frame-dark.css` activates under `.dark` or `[data-theme="dark"]` which aligns with the app's `html.dark` class.

**Theme overrides in `globals.css`** (replace the old `.vault-editor-shell .cm-tooltip-autocomplete` rule):

Scope overrides under `.vault-editor-shell .milkdown` to map Crepe CSS variables to the app's oklch design tokens:

| Crepe Variable                     | Light Value                        | Dark Value                  |
| ---------------------------------- | ---------------------------------- | --------------------------- |
| `--crepe-color-background`         | `transparent`                      | `transparent`               |
| `--crepe-color-surface`            | `var(--card)`                      | `var(--card)`               |
| `--crepe-color-on-background`      | `var(--foreground)`                | `var(--foreground)`         |
| `--crepe-color-on-surface`         | `var(--foreground)`                | `var(--foreground)`         |
| `--crepe-color-on-surface-variant` | `var(--muted-foreground)`          | `var(--muted-foreground)`   |
| `--crepe-color-outline`            | `var(--border)`                    | `var(--border)`             |
| `--crepe-color-primary`            | `var(--primary)`                   | `var(--primary)`            |
| `--crepe-color-hover`              | `var(--muted)`                     | `var(--muted)`              |
| `--crepe-color-selected`           | `var(--muted)`                     | `var(--muted)`              |
| `--crepe-font-default`             | System font stack (inherit)        | System font stack (inherit) |
| `--crepe-font-code`                | `'Geist Mono Variable', monospace` | same                        |

Typography overrides to match `.chat-markdown` scale:

- Base: 13px (0.8125rem), line-height 1.5
- H1: 20px (1.25rem), weight 600
- H2: 16px (1rem), weight 600
- H3: 14px (0.875rem), weight 600
- H4: 13px (0.8125rem), weight 600
- Inline code: 12px, `rgba(0,0,0,0.06)` bg (light), `rgba(255,255,255,0.08)` bg (dark)
- Code blocks: `var(--chat-area)` bg, 0.75rem border-radius, 12px monospace
- Tables: match `.chat-markdown table` — border-radius 9px wrapper, collapse, cell padding 0.375rem 0.625rem, header bold, alternating row `var(--muted)` bg

---

## Step 5: Update VaultPage.tsx

- Change lazy import from `./VaultEditor` to `./VaultCrepeEditor`
- **Add binary content gate** — current VaultPage always mounts the editor for any active doc. Add an `activeDocEncoding === 'utf8'` check. Render a non-editable binary placeholder for base64 docs. Ensure save/send actions remain disabled for non-UTF8 content:

```tsx
const activeDocEncoding = useVaultEditorStore((state) => state.activeDocEncoding);

const canEditAsMarkdown = activeDoc !== null && !activeDoc.isDir && activeDocEncoding === 'utf8';

// In the render:
{
  activeDoc ? (
    isDocLoading ? (
      <div className="...">Loading document...</div>
    ) : canEditAsMarkdown ? (
      <Suspense fallback={<div className="...">Loading editor...</div>}>
        <LazyVaultEditor
          key={activeDoc.id}
          initialContent={activeDocContent}
          readOnly={false}
          onMarkdownChange={handleMarkdownChange}
          onDirtyChange={() => {
            setDocModified(true);
          }}
        />
      </Suspense>
    ) : (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Binary file — cannot edit as markdown.</p>
      </div>
    )
  ) : (
    <EmptyState />
  );
}
```

- Same `key={activeDoc.id}` pattern, same props interface — no other changes needed

**Action-level encoding gates** — The editor binary gate above prevents rendering, but the header actions and context-manager send flow are separate code paths. Both must independently check encoding to prevent saving/sending base64 content:

**VaultDocHeader.tsx** — pass `activeDocEncoding` and gate Save/Send buttons:

```tsx
// VaultPage.tsx — pass encoding to header
const activeDocEncoding = useVaultEditorStore((state) => state.activeDocEncoding);
const isUtf8Doc = activeDoc !== null && activeDocEncoding === 'utf8';

<VaultDocHeader
  ...
  canSave={Boolean(activeDoc && !activeDoc.isDir && activeDoc.source === 'vault' && isUtf8Doc)}
  canSend={Boolean(activeDoc && !activeDoc.isDir && isUtf8Doc)}
/>

// VaultDocHeader.tsx — use new props for disabled state
interface VaultDocHeaderProps {
  // ... existing props
  readonly canSave: boolean;
  readonly canSend: boolean;
}

<Button variant="secondary" size="sm" onClick={onSave} disabled={!canSave}>
  Save
</Button>
<Button size="sm" onClick={onSendToAgent} disabled={!canSend}>
  Send to Agent
</Button>
```

**use-vault-context-manager.ts** — guard the send flow:

```ts
const sendActiveDocToAgent = useCallback(async (): Promise<boolean> => {
  if (!workspacePath) return false;

  const editorState = useVaultEditorStore.getState();
  const activeDoc = editorState.activeDoc;
  if (!activeDoc || activeDoc.isDir) return false;

  // Prevent sending binary content to agent
  if (editorState.activeDocEncoding !== 'utf8') {
    return false;
  }

  // ... rest of send logic unchanged
}, [workspacePath, setVaultOpen]);
```

**Test coverage for encoding gates** (add to Step 8 test suite):

```ts
it('disables Save and Send buttons for non-UTF8 documents', () => {
  // Render VaultDocHeader with canSave=false, canSend=false
  // Assert both buttons have disabled attribute
});

it('sendActiveDocToAgent returns false for non-UTF8 docs', async () => {
  // Set activeDocEncoding to 'base64' in vault editor store
  // Call sendActiveDocToAgent
  // Assert returns false, enqueueContext NOT called
});
```

---

## Step 6: Update Barrel Exports

- `apps/agent/src/features/vault/components/index.ts` — already only exports `VaultPage`, no change needed
- `apps/agent/src/features/vault/index.ts` — update stale comment: `// Keep TipTap-heavy modules out of this barrel` → `// Keep Milkdown Crepe out of this barrel to preserve lazy-loading boundaries.`
- Remove the old `/* Vault CM6 editor tweaks */` CSS block from globals.css (replaced by new Crepe overrides)

---

## Step 7: Clean Up CSS

In `globals.css`, replace:

```css
/* Vault CM6 editor tweaks */
.vault-editor-shell .cm-tooltip-autocomplete {
  border-radius: 8px;
  overflow: hidden;
}
```

With the new Milkdown Crepe theme overrides (see Step 4).

---

## Step 8: Add Replacement Test Suite

**IMPORTANT**: Write new Crepe tests BEFORE deleting CM6 tests to maintain automated regression coverage.

**File**: `apps/agent/src/__tests__/unit/features/vault/crepe/vault-crepe-editor.test.tsx`

Required test cases (ported from old CM6 test behaviors):

```ts
describe('VaultCrepeEditor', () => {
  it('calls onMarkdownChange when user types', () => {
    // Mount with initial content, simulate user edit, assert callback
  });

  it('does not call onMarkdownChange during programmatic sync', () => {
    // Mount, change initialContent prop, assert isSyncingRef suppresses callback
  });

  it('calls onDirtyChange on user edits', () => {
    // Mount, simulate edit, assert onDirtyChange called
  });

  it('handles unmount during async create without throwing', async () => {
    // Mount then immediately unmount while create() is pending
    // Assert no unhandled rejection, no post-destroy callbacks
  });

  it('respects readOnly prop', () => {
    // Mount with readOnly=true, assert editor is not editable
  });

  it('external reload does not create undo entries', () => {
    // Mount, type something, change initialContent prop (external reload)
    // Assert Ctrl+Z does NOT revert to pre-reload content
  });

  it('rapid doc switching does not leak Crepe instances', async () => {
    // Mount with key=A, remount with key=B quickly
    // Assert only one instance survives, no console errors
  });

  // --- Security regression tests ---

  it('does not execute script content from markdown HTML', async () => {
    // Render markdown containing <script>window.__xss_test = 1</script>
    // Assert window.__xss_test remains undefined
    // Assert no <script> element exists in the rendered DOM
  });

  it('does not render onerror/onload event handlers from markdown', async () => {
    // Render markdown containing <img onerror="window.__xss_onerror=1" src="x">
    // Assert window.__xss_onerror remains undefined
    // Assert no element in DOM has onerror/onload attributes
  });

  it('does not render javascript: URIs in links', async () => {
    // Render markdown containing [click](javascript:alert(1))
    // Assert no anchor element has href starting with "javascript:"
  });

  // --- Encoding gate tests ---

  it('disables Save and Send buttons for non-UTF8 documents', () => {
    // Render VaultDocHeader with canSave=false, canSend=false
    // Assert both buttons have disabled attribute
  });

  it('sendActiveDocToAgent returns false for non-UTF8 docs', async () => {
    // Set activeDocEncoding to 'base64' in vault editor store
    // Call sendActiveDocToAgent
    // Assert returns false, enqueueContext NOT called
  });
});
```

**Run**: `bun run test apps/agent/src/__tests__/unit/features/vault/crepe/`

Only after these pass should the CM6 tests in Step 1 be deleted.

---

## Step 9: API Validation Spike

Before full implementation, validate Crepe's extension points against the installed version. Create a minimal typed adapter to confirm these APIs exist at runtime:

```ts
// Validate during implementation (can be a temporary test or script)
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, parserCtx } from '@milkdown/crepe';

// 1. Verify markdownUpdated listener
const crepe = new Crepe({ root: document.createElement('div'), defaultValue: '' });
crepe.on((listener) => {
  // Fail-fast if markdownUpdated doesn't exist
  if (typeof listener.markdownUpdated !== 'function') {
    throw new Error('Crepe API: markdownUpdated listener not available');
  }
});

// 2. Verify setReadonly
if (typeof crepe.setReadonly !== 'function') {
  throw new Error('Crepe API: setReadonly not available');
}

// 3. Verify editor.action with context access
await crepe.create();
crepe.editor.action((ctx) => {
  ctx.get(editorViewCtx); // Fail-fast if context key missing
  ctx.get(parserCtx);
});
await crepe.destroy();
```

If any of these fail, the Crepe version is incompatible and must be pinned/patched before proceeding. Custom keymap registration (Step 3) should also be validated here — register a test keymap via `crepe.editor.use()` and confirm it fires.

---

## Files Modified Summary

| Action | File                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| CREATE | `apps/agent/src/features/vault/components/VaultCrepeEditor.tsx`                                                        |
| CREATE | `apps/agent/src/__tests__/unit/features/vault/crepe/vault-crepe-editor.test.tsx`                                       |
| EDIT   | `apps/agent/src/features/vault/components/VaultPage.tsx` (lazy import path + binary gate + encoding prop pass-through) |
| EDIT   | `apps/agent/src/features/vault/components/VaultDocHeader.tsx` (add `canSave`/`canSend` props gated by encoding)        |
| EDIT   | `apps/agent/src/features/vault/hooks/use-vault-context-manager.ts` (add encoding guard to send flow)                   |
| EDIT   | `apps/agent/src/globals.css` (replace CM6 styles with Crepe overrides)                                                 |
| EDIT   | `apps/agent/src/features/vault/index.ts` (update stale comment)                                                        |
| DELETE | `apps/agent/src/features/vault/cm6/` (entire directory, 9 files)                                                       |
| DELETE | `apps/agent/src/__tests__/unit/features/vault/cm6/` (entire directory, 6 test files)                                   |
| DELETE | `apps/agent/src/features/vault/components/VaultEditor.tsx`                                                             |

**Ordering**: CREATE new editor + tests first → verify tests pass → THEN delete old CM6 files.

**Files kept as-is** (no CM6 dependencies):

- `VaultSidebar.tsx`, `VaultSearchBar.tsx`, `VaultCreateDialog.tsx`, `VaultDeleteDialog.tsx`
- All vault stores, API, types

---

## Existing Utilities to Reuse

- `useIsDarkMode()` from `@/components/chat/tools/shared/use-syntax-highlight` — dark mode detection
- `createLogger('VaultEditor')` from `@orbit/common/lib` — structured logging
- `cn()` from `@/lib/utils` — className merging
- `replaceAll` from `@milkdown/utils` — available for general content replacement (reload path uses custom `replaceContentWithoutHistory` instead for non-historic replacement)
- `useVaultEditorStore` selectors — same store integration pattern
- `.vault-editor-shell` CSS class — keep for autosave Cmd+S detection (`use-vault-autosave.ts:49`)

---

## Bundle Size Consideration

Adding Milkdown Crepe introduces the full ProseMirror stack alongside the existing CM6 used by `CodeMirrorEditor.tsx`. Crepe also internally bundles its own CM6 for `Crepe.Feature.CodeMirror` (code block syntax highlighting), so the app ships two independent CM6 instances that won't deduplicate.

**Mitigation**: `VaultCrepeEditor` is lazy-loaded via `React.lazy()` in `VaultPage.tsx`, so the ProseMirror/Milkdown bundle only loads when the vault panel opens. The main app bundle is unaffected.

**Post-implementation**: Measure the vault chunk size and document the result. If it exceeds 300KB gzipped, consider disabling `Crepe.Feature.CodeMirror` and using plain `<pre><code>` for code blocks instead.

---

## Edge Cases

- **Binary files** — Handled in Step 5. `VaultPage` now gates the editor behind `activeDocEncoding === 'utf8'` and renders a binary placeholder for base64 content.
- **Large documents** — ProseMirror has higher per-character overhead than CM6. Thresholds: >100KB show a loading shell during `create()`, >500KB consider disabling `Crepe.Feature.CodeMirror` to reduce parse overhead. Measure during implementation.
- **Fast doc switching** — `key={activeDoc.id}` triggers component remount. The `destroyed` flag (Step 3) prevents use-after-destroy. Covered by regression test.
- **`create()` failure** — If Crepe initialization throws (malformed markdown, DOM detachment), the `.catch()` handler logs the error. Add a user-visible error state with a "Retry" button and raw markdown fallback text in `VaultCrepeEditor`. If `create()` fails 3 consecutive times for the same document, stop retrying and show a persistent error state with the raw content. Log a structured warning via `createLogger` to surface the pattern.
- **Repeated create failures on mount** — Unlike a transient race (handled by `destroyed` flag), persistent init failures from corrupt markdown or missing DOM need a retry cap. Track failure count per doc ID in a ref. After 3 failures, stop retrying and keep the raw markdown fallback visible.
- **External reload during unsaved edits** — File watcher can deliver a reload while autosave timeout is pending. Existing `use-vault-file-watcher.ts` conflict handling surfaces this to the user. The new `replaceContentWithoutHistory()` function handles the content replacement side; the conflict UX remains unchanged.
- **Raw HTML in markdown** — Milkdown/ProseMirror uses remark which strips raw HTML by default (CommonMark spec). However, this safety property MUST be verified, not assumed. Add a security regression test (see Step 8) that proves `<script>` tags, `onerror` handlers, and `javascript:` URIs cannot execute or render dangerously in the pinned Crepe version. If the test fails, add explicit HTML sanitization via a remark plugin before shipping.
- **Narrow viewport / table overflow** — Crepe's table feature renders real `<table>` elements. In narrow sidebar-constrained vault panels, wide tables may overflow. Add `overflow-x: auto` on the editor container and verify toolbar/slash menu don't clip at small widths.
- **Large document with frequent external reloads** — `replaceContentWithoutHistory()` is O(doc size) per call. For docs >100KB with rapid file-watcher triggers, batch or debounce reload calls. Verify `use-vault-file-watcher.ts` doesn't fire more than once per second for the same file. No hard acceptance threshold defined — measure editor ready time at 100KB and 500KB during implementation and document results.

---

## Verification

### Automated (must pass before merge)

1. `bun run typecheck` — zero errors
2. `bun run lint:fix` — zero warnings
3. `bun run test apps/agent/src/__tests__/unit/features/vault/crepe/` — all Crepe editor tests pass
4. No CM6 tests broken by the deletion (old test directory fully removed)

### Manual (developer testing)

5. `bunx tauri dev` — app launches
6. Toggle vault sidebar → vault opens
7. Click a markdown doc → renders in Milkdown Crepe WYSIWYG
8. Type text → appears, formatting works (bold/italic via toolbar or Cmd+B/Cmd+I)
9. Tables render as interactive tables (not raw markdown)
10. Code blocks render with syntax highlighting
11. Autosave triggers after 2s of inactivity
12. Cmd+S manual save works
13. Switch docs → new content loads correctly
14. Dark mode toggle → editor theme switches (verify toolbar, slash menu, link tooltips)
15. Reload doc (file watcher conflict) → content updates, Ctrl+Z does NOT revert to pre-reload
16. Rapid doc switching (click 3 docs fast) → no console errors, final doc renders correctly
17. Custom keyboard shortcuts work: Cmd+Shift+S (strikethrough), Cmd+E (inline code), Cmd+K (link)
18. Slash commands: type `/` → menu appears with heading, list, code, table options
19. Binary file opened in vault → shows "Binary file" placeholder (not broken Milkdown)
20. Narrow vault panel width → tables scroll horizontally, toolbar/menus don't clip
21. Binary file opened → Save and Send to Agent buttons are disabled (encoding gate)
22. Markdown with `<script>`, `onerror`, `javascript:` URIs → none execute or render dangerously (security regression)
23. Send to Agent with binary file selected → returns false, no context item enqueued
