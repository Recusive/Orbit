# Element Context Chip — Click to Open Detail Dialog

## Context

When selecting an element in the embedded browser via react-grab, a compact chip appears in the chat input. Currently clicking this chip does nothing — the user can only see a truncated preview in the tooltip. The user wants to click the chip to open a dialog showing the full captured content (outerHTML with syntax highlighting, text content, selector, etc.) so they can review what was captured before sending.

## Changes

### 1. Create `ElementContextDetailDialog` component

**New file:** `apps/agent/src/components/browser/element-context-detail-dialog.tsx`

Wrap with `React.memo` — receives a stable `element` object, prevents re-render when parent chip list re-renders.

A dialog that displays the full captured element context:

- **Header:** `<tagName>` component name + explicit `<DialogClose>` button (required — `DialogContentGlass` does NOT include a built-in close button, unlike `DialogContent`. See `ConversationDeleteDialog.tsx` for the pattern)
- **DialogDescription:** Visually-hidden `<DialogDescription className="sr-only">` for Radix compliance and screen readers
- **outerHTML section:** Syntax-highlighted HTML via `useHighlightedTokens(outerHTML, '.html', isDarkMode)` in a scrollable `<pre>` block (max-height ~400px). Guard large HTML: truncate to first 20,000 chars for Shiki highlighting, show a note when truncated. Add `overflow-wrap: anywhere` for long lines without whitespace. **Empty/trivially short guard:** If `outerHTML` is empty or `<br/>` level (< 10 chars), show a "No HTML content" placeholder instead of an empty code block
- **Text content section:** Plain text preview with `overflow-wrap: anywhere` (if `textContent` exists and is non-empty)
- **File path section:** Show `filePath:lineNumber` only when `filePath !== ''` (it's `string`, not optional — can be empty after sync-only capture). **Click-to-open:** When filePath is populated, make it a clickable link that sends `file:open` postMessage to open the file in the editor at the correct line number
- **Selector section:** CSS selector path (monospace)
- **Props section:** Formatted key-value display (if any props exist)
- **Component stack:** Tree display (if non-empty)
- **Copy buttons:** "Copy HTML" and "Copy Selector" buttons with icon → checkmark feedback (swap icon for 2s)
- **Sparse layout handling:** When `componentStack` is empty AND `props` is empty, don't leave visual gaps — the remaining sections (outerHTML, text, selector, file) should flow naturally without empty placeholder areas

Use `DialogContentGlass` (Apple-style dim overlay) for visual consistency.

**Reuse existing utilities:**

- `useHighlightedTokens` from `apps/agent/src/components/chat/tools/shared/use-syntax-highlight.ts`
- `useIsDarkMode` from same file
- `Dialog`, `DialogContentGlass`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogClose` from `apps/agent/src/components/ui/dialog.tsx`

**Props interface:**

```tsx
interface ElementContextDetailDialogProps {
  readonly element: ReactElementContext;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}
```

### 2. Wire dialog into compact chip

**File:** `apps/agent/src/components/browser/element-context-chip.tsx`

- Add `useState<boolean>(false)` for dialog open state
- Make the compact chip's outer `<div>` clickable with full keyboard accessibility:
  - `onClick` → open dialog
  - `role="button"`
  - `tabIndex={0}`
  - `aria-label={`View details for ${element.componentName}`}`
  - `onKeyDown` handler for Enter/Space activation
  - `cursor-pointer` class
- Add `e.stopPropagation()` to the existing remove button's `onClick` (prevents it from also opening the dialog)
- Add `aria-label="Remove element context"` to the compact remove button
- Render `<ElementContextDetailDialog>` alongside the chip (controlled by local state)

### 3. Export from barrel

**File:** `apps/agent/src/components/browser/index.ts`

Add export for `ElementContextDetailDialog`.

## Files to Modify

| #   | File                                                                  | Change                                                                                                           |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/agent/src/components/browser/element-context-detail-dialog.tsx` | **NEW** — Detail dialog with syntax-highlighted HTML, copy buttons, close button, React.memo, click-to-open file |
| 2   | `apps/agent/src/components/browser/element-context-chip.tsx`          | Add click handler + keyboard accessibility on compact chip → opens dialog                                        |
| 3   | `apps/agent/src/components/browser/index.ts`                          | Export new component                                                                                             |

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — 0 errors, 0 warnings
3. `bun run test --run` — all existing tests pass
4. **Manual:** `bunx tauri dev` → open browser → select element → verify:
   - Compact chip is clickable (mouse + keyboard Enter/Space)
   - Dialog opens with syntax-highlighted outerHTML
   - Empty/short outerHTML shows placeholder instead of empty code block
   - "Copy HTML" and "Copy Selector" buttons work
   - Close button works, Escape key works
   - Empty filePath doesn't show `:0`
   - Populated filePath is clickable → opens file in editor
   - Very large HTML is truncated with a note
   - No Radix console warnings about missing DialogDescription
   - Dialog looks good when props and componentStack are both empty (no visual gaps)
   - Long text without whitespace wraps correctly
