# Plan: Line Annotation Feature (Editor Gutter → Chat Input)

> **Audit status**: Reviewed 2026-02-24 — APPROVED WITH CHANGES. See audit notes inline (marked with **[AUDIT]**).

## Context

Users want to annotate specific code lines in the editor and have those annotations flow as structured context into the AI chat. The feature adds a "+" button on gutter hover, an inline comment input widget, and a context chip above the chat input — similar to how `@` mentions attach files and `<Component>` attaches browser elements.

**Outcome**: Hover any line → click "+" → type a note → Enter → chip appears above chat input with `filename:line` + comment → AI receives the annotation as part of the message.

---

## Architecture

```
CM6 Gutter "+" → StateEffect → Inline Widget (input)
  → Enter → window.dispatchEvent('addLineAnnotation')
    → useChatInput listener → ContextItem { type: 'code' }
      → ContextChips renders annotation chip
        → handleSend → embeds [file:line: "comment"] token in message text
                      + adds file to contextFiles so SDK reads it
```

Follows the **exact same pattern** as existing `addSkillChip` and `prefillChatInput` custom events.

---

## Files to Create

### 1. `apps/agent/src/components/editor/extensions/line-annotation.ts` (NEW)

Self-contained CM6 extension exporting `lineAnnotationExtension(filePath: string): Extension`.

**Internal structure:**

- **3 StateEffects**: `setHoveredLine(number | null)`, `setAnnotationLine(number | null)`, `submitAnnotation({ line, comment })`
- **1 StateField**: `{ hoveredLine, annotationLine }` — tracks which line shows "+" and which has the input widget open
- **1 GutterMarker**: `AnnotateGutterMarker` — renders the "+" button DOM element. **[AUDIT]** Must include `role="button"`, `aria-label="Annotate line N"`, and `tabindex="-1"` for accessibility (CLAUDE.md requires aria-label on all icon buttons).
- **1 Custom Gutter**: `gutter({ class: 'cm-annotation-gutter', markers(...), domEventHandlers: { click, mousemove, mouseleave } })` — shows marker on hovered line, handles click to open widget. **[AUDIT]** The `mousemove`/`mouseleave` handlers MUST live on the `gutter({ domEventHandlers })` config (not `EditorView.domEventHandlers`), so they only fire on gutter hover — not every pixel move across the entire editor.
- **1 WidgetType**: `AnnotationInputWidget` — renders `<input maxlength="200">` below the annotated line. Handles Enter (submit + dispatch `addLineAnnotation` window event) and Escape (dismiss). Uses `ignoreEvent() → true` to prevent CM6 from stealing keystrokes. **[AUDIT]** Must include `aria-label="Annotation for line N"` on the input element. Cap at 200 chars to prevent oversized tokens wasting context.
- **1 ViewPlugin**: Builds `Decoration.widget({ block: true, side: 1 })` from `annotationField`. Uses ViewPlugin (not `EditorView.decorations.compute`) because it needs access to `EditorView` for the widget constructor.
- **1 EditorView.theme**: CSS for `.cm-annotation-gutter`, `.cm-annotate-btn`, `.cm-annotation-widget`, `.cm-annotation-input` — uses CSS variables from the design system for both themes.

**Key design decisions:**

- `filePath` passed as closure parameter, captured by ViewPlugin class
- Hover dispatches only when line number changes (guard prevents per-pixel transaction spam)
- Widget `eq()` returns true for same line+path (prevents DOM recreation)
- `requestAnimationFrame(() => input.focus())` for auto-focus after DOM insertion
- `e.stopPropagation()` in input keydown prevents CM6 from handling Enter/Escape

---

## Files to Modify

### 2. `apps/agent/src/components/editor/CodeMirrorEditor.tsx`

**Changes** (minimal — follows existing compartment pattern):

- Import `lineAnnotationExtension` from new file
- Add `const annotationCompartment = new Compartment()` alongside existing compartments (line ~956 area)
- Add `annotationCompartment.of(filePath ? lineAnnotationExtension(filePath) : [])` to the extensions array (after line ~963)
- Add useEffect to reconfigure when `filePath` changes (same pattern as `languageCompartment` at line 1112-1117):
  ```
  useEffect → viewRef.current?.dispatch({ effects: annotationCompartment.reconfigure(...) })
  ```

### 3. `apps/agent/src/types/agent/context.ts`

**Changes:**

- Add `lineNumber: z.number().optional()` to `ContextItemSchema` — needed for `'code'` type annotations to carry the line number

### 4. `apps/agent/src/components/chat/input/use-chat-input.ts`

**Changes** (two additions):

**a) Event listener** (after existing `addSkillChip` listener, ~line 119):

```
window.addEventListener('addLineAnnotation', handler)
```

Handler creates `ContextItem { type: 'code', name: 'filename:line', path: filePath, content: comment, lineNumber }`

**[AUDIT] Must deduplicate by `path + lineNumber`** — matching the `addSkillChip` pattern which checks `prev.some(...)`. Recommended: replace (not reject) an existing annotation for the same file:line, so the user can re-annotate to change their comment:

```typescript
setAttachedContext((prev) => {
  const filtered = prev.filter(
    (item) => !(item.type === 'code' && item.path === filePath && item.lineNumber === lineNumber)
  );
  return [
    ...filtered,
    {
      id: crypto.randomUUID(),
      type: 'code',
      name: `${fileName}:${lineNumber}`,
      path: filePath,
      content: comment,
      lineNumber,
    },
  ];
});
```

**b) Annotation token in `handleSend`** (~line 214, after file suffix, before skill prefix):

- Filter `attachedContext` for `type === 'code'` items
- **[AUDIT] Escape user input before embedding** — comment text can contain `"` and `]` which break the token format. Escape before serializing:

  ```typescript
  const escapeAnnotation = (text: string): string =>
    text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/]/g, '\\]');

  const codeItems = attachedContext.filter((item) => item.type === 'code');
  if (codeItems.length > 0) {
    const codeSuffix = codeItems
      .map((item) => `[${item.name}: "${escapeAnnotation(item.content ?? '')}"]`)
      .join(' ');
    text = `${text} ${codeSuffix}`;
  }
  ```

- **[AUDIT] Extend contextFiles filter** — the existing filter (line 239-241) only picks `'file' | 'folder'`. Annotation file paths must also be included or the SDK won't read the file content:
  ```typescript
  const contextFiles = attachedContext
    .filter((item) => item.type === 'file' || item.type === 'folder' || item.type === 'code')
    .map((item) => item.path);
  ```

### 5. `apps/agent/src/components/chat/input/context-chips.tsx`

**Changes:**

- Import `MessageSquarePlus` from `lucide-react`
- Add `isCode` check: `item.type === 'code'`
- Render code-type chip with:
  - Accent-colored background (distinct from file/skill chips)
  - `MessageSquarePlus` icon
  - Display: `filename:line` as name
  - Truncated comment text in muted color: `"Fix the null check..."`
  - Increased `max-w` from `180px` to `240px` for annotation chips (they show more text)

**[AUDIT]** Adding a third variant turns the existing ternary into a hard-to-read nested chain. Use an object map instead:

```typescript
const chipStyleMap: Record<string, string> = {
  code: 'bg-accent/10 hover:bg-accent/15 border-accent/25',
  skill: 'bg-foreground/8 hover:bg-foreground/12 border-foreground/20',
  default: 'bg-lg-control hover:bg-lg-control-hover border-lg-border',
};
const getChipStyle = (type: string): string => chipStyleMap[type] ?? chipStyleMap.default;
```

---

## What We DON'T Need to Change (simplicity)

- **Protocol types** (`protocol.ts`) — annotations embed as text tokens in message content, just like `@file` and `<Element>` tokens. No new protocol field needed.
- **chat-actions.ts** — `handleSend` signature stays the same. Annotations are folded into the text and contextFiles by `useChatInput.handleSend` before reaching `chat-actions`.
- **agent-bridge** — The AI reads `[filename:42: "comment"]` from message text naturally. The file is already attached via contextFiles.
- **Rust backend** — No backend changes needed.

---

## Data Flow (Detailed)

1. **Hover**: Mouse enters gutter → `mousemove` handler finds line → `setHoveredLine(42)` → gutter rebuilds markers → "+" appears on line 42
2. **Click**: Gutter click handler → `setAnnotationLine(42)` → ViewPlugin builds block widget decoration after line 42's end → input auto-focuses
3. **Submit**: User types "fix null check" + Enter →
   - CM6: `submitAnnotation({ line: 42, comment: "fix null check" })` clears widget
   - Window: `CustomEvent('addLineAnnotation', { filePath: '/src/utils.ts', lineNumber: 42, comment: 'fix null check' })`
4. **Chip**: `useChatInput` listener creates `ContextItem { type: 'code', name: 'utils.ts:42', path: '/src/utils.ts', content: 'fix null check', lineNumber: 42 }` → ContextChips renders annotation chip → input focuses
5. **Send**: User types "please fix this" + Enter →
   - Comment is escaped: `"` → `\"`, `]` → `\]`
   - Text becomes: `"please fix this [utils.ts:42: "fix null check"] @utils.ts"`
   - `contextFiles` includes `/src/utils.ts` (via extended filter that includes `type === 'code'`)
   - AI sees both the annotation token and the full file content

---

## Edge Cases & Known Limitations [AUDIT]

These were identified during code review and must be handled (or explicitly documented as out-of-scope):

### Must handle

1. **Token injection** — User comment containing `"` or `]` breaks `[file:42: "comment"]` format. **Fix**: escape before embedding (see `handleSend` section above).
2. **Duplicate annotations** — Same file:line annotated twice creates duplicate chips. **Fix**: deduplicate by path+lineNumber, replacing the old comment (see event listener section above).
3. **contextFiles wiring** — `handleSend` filter at line 239-241 only includes `'file' | 'folder'`. Without extending it to `'code'`, the SDK never receives the annotation's file. **Fix**: extend filter (see `handleSend` section above).

### Should handle

4. **Ambiguous filenames** — `utils.ts:42` is ambiguous when multiple `utils.ts` exist in different directories. Consider showing a relative path segment (`lib/utils.ts:42`) when the basename is non-unique in the workspace.
5. **Post-send token visibility** — After sending, `[utils.ts:42: "fix null check"]` appears as raw text when the message is re-rendered from JSONL (conversation reload, sidebar switch). Consider a more natural format like `(utils.ts:42 — "fix null check")`, or parse tokens in the message renderer.

### Accept as known limitations

6. **Stale line numbers** — If the file is edited between annotating and sending, line 42 may refer to different content. This is inherent to line-number references and acceptable for v1.
7. **Widget lost on file switch** — Pending annotation input is discarded when the user switches files (compartment reconfigures). The plan already documents this. No warning needed — the gutter state is ephemeral.
8. **Folded regions** — Clicking "+" on a fold header annotates the fold line, not hidden lines within. Acceptable since fold state is user-controlled.
9. **`filePath` undefined** — Diff views, untitled buffers, and other contexts where `filePath` is undefined get `[]` (no extension). Correct behavior, no action needed.
10. **Module-level compartments** — Shared across all CodeMirrorEditor instances. Not an issue today (single editor at a time), but would need per-instance scoping if split view is ever implemented. This matches the 4 existing compartments.

---

## Verification

1. **Manual test**: Open file → hover gutter → verify "+" appears only on hovered line → click "+" → verify inline input appears → type + Enter → verify chip appears → type message + Enter → verify AI receives annotation
2. **Theme test**: Repeat in both light and dark mode — CSS variables handle both
3. **Edge cases**:
   - Escape dismisses widget without creating chip
   - Multiple annotations on different lines create separate chips
   - Clicking "X" on chip removes it
   - Read-only files still allow annotations (metadata, not edits)
   - File switch clears widget (compartment reconfigures)
   - **[AUDIT]** Re-annotating same file:line replaces the existing chip (not duplicates)
   - **[AUDIT]** Comment containing `"` and `]` characters embeds correctly (escaped)
   - **[AUDIT]** Annotation file appears in SDK contextFiles (verify via debug logging)
4. **Lint**: `bun run check` passes (typecheck + lint + tests)
5. **Visual**: Chip styling is distinct from file/skill chips (accent color vs neutral)
6. **[AUDIT] Accessibility**: "+" button has `aria-label`, input widget has `aria-label`, both testable via DevTools Accessibility panel

---

## Future Considerations [AUDIT]

These are out of scope for v1 but the architecture should not preclude them:

- **Range annotations** — Annotate a selection (lines 42-47) instead of a single line. Add `endLine` to ContextItem, change chip display to `file:42-47`. CM6 selections are readily available.
- **Typed custom event map** — Augment `WindowEventMap` with `addLineAnnotation: CustomEvent<LineAnnotationDetail>` for compile-time safety on both dispatch and listen sides. Eliminates manual `as CustomEvent<...>` casts.
- **Visual regression tests** — Add a Vitest snapshot test for `ContextChip` rendering all 4 variants (file, skill, image, code) to catch styling regressions.
