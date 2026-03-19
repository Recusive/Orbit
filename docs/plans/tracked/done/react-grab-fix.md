# Fix React-Grab Element Selection: "Failed to Copy" + Missing Content

## Context

When using the React-grab element selector in Orbit's embedded browser, two bugs occur:

1. A **"failed to copy"** tooltip appears after clicking an element
2. The chat input shows only the bare tag name (e.g., `<p>`) instead of meaningful content

Both bugs stem from the same root: the `onElementSelect` hook in the react-grab injector is `async` and returns `false` — but react-grab interprets `false` as "copy failed" and a Promise return delays the interception signal.

---

## Changes

### 1. Make `onElementSelect` synchronous and return `true`

**File:** `apps/agent/src/lib/browser/react-grab-injector.ts` (lines 88-119)

**Why:** react-grab's internal dispatch checks: if the hook returns `true`, it means "intercepted, don't copy." If the hook returns `false` (even via resolved Promise), react-grab throws "Failed to copy." Our hook is `async` → returns a Promise → react-grab awaits it → gets `false` → error tooltip.

**Changes:**

- Remove `async` keyword from the `onElementSelect` handler
- Make initial capture synchronous, then fire deferred async source enrichment (see below)
- Change `return false` to `return true`
- Add `textContent` field with sanitization (see below)

The handler becomes synchronous for the interception path: capture base data → fire URL scheme → deactivate → return `true`. Source metadata is enriched asynchronously after the initial capture.

**Deferred async source enrichment** (preserves React metadata without blocking):

Enrichment uses a **separate URL scheme** (`orbit-eval://element-enriched`) and a **separate store action** (`enrichElementContext`) that only patches an existing matching entry — never adds new ones. A monotonic **selection epoch** prevents stale enrichments from resurrecting removed chips or overwriting newer selections.

```javascript
onElementSelect: (element) => {
  const displayName = api.getDisplayName(element);
  const epoch = Date.now(); // monotonic selection epoch
  const baseData = {
    /* sync fields + epoch */
  };

  // Fire initial capture immediately (synchronous)
  const encoded = encodeURIComponent(JSON.stringify(baseData));
  window.location.href = 'orbit-eval://element-selected?data=' + encoded;

  // Deferred: enrich with React source info via SEPARATE URL scheme
  const capturedSelector = baseData.selector;
  Promise.resolve()
    .then(() => api.getSource(element))
    .then((source) => {
      if (!source) return;
      if (!document.querySelector(capturedSelector)) return;
      const patch = {
        selector: capturedSelector,
        epoch,
        componentName: source.componentName,
        filePath: source.filePath || '',
        lineNumber: source.lineNumber || 0,
      };
      const enc = encodeURIComponent(JSON.stringify(patch));
      window.location.href = 'orbit-eval://element-enriched?data=' + enc;
    })
    .catch(() => {
      /* non-fatal */
    });

  api.deactivate();
  return true;
};
```

**Why separate URL scheme + store action?** The same-path approach has race conditions:

- **Chip removed before enrichment resolves** → stale update re-adds it via `setSelectedElement`
- **Send/clear clears contexts** → enrichment repopulates cleared input
- **Select a different element** → earlier enrichment overwrites `selectedElement`

The separate path solves all three:

- `enrichElementContext(patch)` is a **merge-only** action: finds existing entry by `selector`, patches fields, does nothing if no match exists
- The `epoch` field must match `lastSelectionEpoch` on the store — if user selected a newer element, epoch is stale → patch rejected
- `clearElementContexts` resets `lastSelectionEpoch` to 0 → any in-flight enrichment is rejected

**`textContent` sanitization** (handles edge cases from audit):

```javascript
// Skip script/style elements — textContent would leak raw source code
const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const rawText = skipTags.has(element.tagName) ? '' : element.textContent || '';
// Collapse whitespace runs (newlines, tabs from source formatting) → single space
const textContent = rawText.replace(/\s+/g, ' ').trim().substring(0, 200);
```

- **Void elements** (`<img>`, `<input>`, `<br>`): `textContent` is empty → falls back to `componentName` in chip display
- **Deeply nested elements**: `textContent` includes all descendant text, so a `<div>` wrapping paragraphs may produce a dense snippet — the 200-char truncation limits this
- **`<script>`/`<style>`**: Excluded via `skipTags` — prevents raw source code leaking into chip display
- **Whitespace**: Collapsed via `/\s+/g` before truncation

### 2. Add `textContent` to protocol schemas

**File:** `apps/agent/src/types/protocol/protocol.ts`

Add `textContent: z.string().optional()` to both:

- `ElementContextSchema` (line 197, after `outerHTML`)
- `ReactElementContextSchema` (line 1622, after `outerHTML`)

Using `.optional()` for backward compatibility with existing stored conversations. Both schemas use `.strict()` so unrecognized fields would fail validation — must add to both.

### 3. Improve compact chip display + guard empty file path

**File:** `apps/agent/src/components/browser/element-context-chip.tsx` (lines 44-57, 94-100)

**Compact chip (lines 44-57):** Currently shows just `element.componentName` (e.g., `p`). Change to show a text preview:

- If `textContent` exists: `<tagName> preview text...`
- Fallback: `componentName` (backward compat)
- Add `title` attribute with longer preview for hover tooltip

**Expanded "File:" section (lines 94-100):** Guard against empty `filePath` — since `getSource()` is removed, `filePath` is always `''` and `lineNumber` is always `0`, causing the expanded chip to show `:0`. Fix:

```tsx
{
  element.filePath ? (
    <div className="pt-2">
      <span className="text-xs text-muted-foreground">File:</span>
      <div className="font-mono text-xs bg-lg-control px-2 py-1 rounded mt-1 truncate">
        {element.filePath}:{element.lineNumber}
      </div>
    </div>
  ) : null;
}
```

### 4. Improve message text suffix

**File:** `apps/agent/src/components/chat/input/use-chat-input.ts` (lines 210-214)

Currently appends `<componentName>` to message text. Change to include text preview:

- If `textContent` exists and non-empty: `[tagName: "preview text..."]`
- Fallback: `<componentName>`

**Bracket choice:** Use `[tagName: "..."]` instead of `<tagName: "...">` to avoid ambiguity with HTML angle brackets in the message text. Quotes, backticks, and angle brackets in preview text are escaped before embedding:

```typescript
const safePreview = preview.replace(/[<>""`]/g, '');
```

---

## Files to Modify

| #   | File                                                         | Change                                                                                   |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | `apps/agent/src/lib/browser/react-grab-injector.ts`          | Sync hook, return `true`, deferred enrichment via separate URL scheme, add `textContent` |
| 2   | `apps/agent/src/types/protocol/protocol.ts`                  | Add `textContent` + `epoch` to element schemas, add `BrowserElementEnrichedSchema`       |
| 3   | `apps/agent/src/components/browser/element-context-chip.tsx` | Show text preview in compact chip, guard empty filePath                                  |
| 4   | `apps/agent/src/components/chat/input/use-chat-input.ts`     | Better element suffix with `[tagName: "..."]` format                                     |
| 5   | `apps/agent/src/stores/browser/browser-store.ts`             | Add `enrichElementContext` merge-only action + `lastSelectionEpoch` state                |
| 6   | `src-tauri/src/commands/browser/mod.rs`                      | Add `handle_element_enriched_url` for `orbit-eval://element-enriched`                    |
| 7   | `apps/agent/src/lib/api/browser.ts`                          | Add `onBrowserElementEnriched` Tauri event listener                                      |
| 8   | `apps/agent/src/hooks/browser/use-browser.ts`                | Bridge `browser:element-enriched` event → `enrichElementContext` store action            |

**Store change (5):** Add new state and actions to `BrowserStore`:

- `lastSelectionEpoch: number` — set by `setSelectedElement` from the element's `epoch` field
- `enrichElementContext(patch: { selector, epoch, componentName, filePath, lineNumber })` — merge-only action:
  1. If `patch.epoch !== state.lastSelectionEpoch` → reject (stale)
  2. Find entry in `elementContexts` by `selector` → if not found, do nothing (chip was removed)
  3. Merge `componentName`, `filePath`, `lineNumber` into matching entry
- `clearElementContexts` resets `lastSelectionEpoch` to 0

**Rust change (6):** Clone `handle_element_selected_url` for `orbit-eval://element-enriched?data=...` → emit `browser:element-enriched` Tauri event. Register in `on_navigation` handler alongside existing interceptors.

---

## Verification

### Automated tests (new files)

**Test 1: Schema validation** — `apps/agent/src/__tests__/unit/types/element-context-schema.test.ts`

- `browser:element-selected` with `textContent` passes `ReactElementContextSchema` validation
- `browser:element-selected` without `textContent` passes (backward compat)
- `browser:element-selected` with unknown field fails (`.strict()` enforcement)
- `SendMessageSchema` with `context.elements[].textContent` passes `ElementContextSchema`

**Test 2: Compact chip rendering** — `apps/agent/src/__tests__/unit/components/browser/element-context-chip.test.tsx`

- Compact chip shows `<tagName> preview...` when `textContent` is present
- Compact chip falls back to `componentName` when `textContent` is empty/absent
- Expanded chip hides "File:" section when `filePath` is empty
- Expanded chip shows "File:" section when `filePath` is non-empty

**Test 3: Message suffix formatting** — `apps/agent/src/__tests__/unit/components/chat/input/element-suffix.test.ts`

- Element with textContent produces `[tagName: "safe preview"]`
- Element without textContent produces `<componentName>`
- Special characters in preview text are stripped
- Multiple elements produce space-separated suffixes

**Test 4: Browser store enrichment** — `apps/agent/src/__tests__/unit/stores/browser/browser-store-enrichment.test.ts`

- `enrichElementContext` with matching selector + epoch patches existing entry's `filePath`/`lineNumber`
- `enrichElementContext` with non-matching selector does nothing (no new entry added)
- `enrichElementContext` with stale epoch is rejected (doesn't modify store)
- `enrichElementContext` after `clearElementContexts` is rejected (epoch reset to 0)
- `enrichElementContext` after new selection (different epoch) is rejected
- `setSelectedElement` updates `lastSelectionEpoch` from element's epoch field

### Static checks

1. `bun run typecheck` — Ensure `textContent` optional field doesn't break existing types
2. `bun run lint` — ESLint compliance
3. `bun run test` — All new and existing tests pass

### Manual verification

4. **Bug 1:** `bunx tauri dev` → open browser → navigate to any site → click Select Element → click an element → **no "failed to copy" tooltip** should appear
5. **Bug 2:** After selecting a `<p>` element with text content, the chip in chat input should show `<p> This domain is for use...` instead of just `p`
6. **React site:** Navigate to a React site → select element → verify `filePath`/`lineNumber` populate in expanded chip after async enrichment
7. **Edge cases:** Void elements (img, input), `<script>` tags (textContent should be empty), deeply nested elements, elements with special characters in text
