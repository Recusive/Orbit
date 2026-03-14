# Plan: Style Slash Commands as Inline Code Badges in Chat Input

## Context

When a user selects a slash command from the popover (e.g., `/compact`), it currently appears as plain text in the contentEditable input div. The user wants slash commands to render as styled inline code badges — like `<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">/compact</code>` — giving them a distinct visual identity within the input, similar to how inline code looks in rendered markdown.

Skills already render as context chips above the input. File mentions (`@`) also become chips. Regular slash commands are the only token type that remains unstyled plain text.

## Approach

Insert `<code contentEditable="false" data-slash-command="name">` elements into the contentEditable div when a regular slash command is selected. The `contentEditable="false"` attribute makes the element:

- **Non-editable** — cursor can't enter it, skips over it
- **Atomically selectable** — select all or nothing
- **Backspace-deletable as a unit** — pressing backspace right after it removes the whole element

Use the DOM as the source of truth for whether a code badge exists (query `code[data-slash-command]`) rather than tracking separate React state, eliminating desync bugs.

## Files to Modify

| File                                                     | Changes                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/agent/src/components/chat/input/use-chat-input.ts` | Core logic: cursor tracking, slash select, mention select, backspace, send, paste, prefill |
| `apps/agent/src/components/chat/input/ChatInput.tsx`     | Ghost text overlay adjustment                                                              |

## Implementation Steps

### Step 1: Add DOM cursor utilities to `use-chat-input.ts`

Two utility functions at module level (above `useChatInput`):

**`getCursorOffset(container)`** — Returns the cursor's character offset within the full `textContent`, regardless of how many child nodes (text nodes, code elements) exist:

```typescript
function getCursorOffset(container: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const preRange = document.createRange();
  preRange.setStart(container, 0);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}
```

**`setCursorAtTextOffset(container, offset)`** — Places cursor at a character offset by iterating direct `childNodes`. Uses flat iteration (not TreeWalker) to avoid descending into `contentEditable="false"` code badges — the browser's behavior when placing a cursor inside a non-editable node is undefined across engines (Chrome snaps, Safari may throw, WKWebView is untested). Code badges are treated as opaque blocks: their `textContent.length` is counted but the cursor is never placed inside them.

```typescript
function setCursorAtTextOffset(container: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;

  for (const child of container.childNodes) {
    // Treat code badges as opaque — count text length but never enter
    if (child instanceof HTMLElement && child.hasAttribute('data-slash-command')) {
      const len = child.textContent?.length ?? 0;
      if (remaining <= len) {
        // Target is "inside" the badge — snap cursor to after it
        const range = document.createRange();
        range.setStartAfter(child);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
      continue;
    }
    if (child.nodeType === Node.TEXT_NODE) {
      const len = child.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(child, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
    }
  }
  // Fallback: place cursor at end
  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
```

### Step 2: Add `rebuildInputDOM` helper

Rebuilds the contentEditable DOM from text content + optional command name, placing a `<code>` badge at the command position and restoring cursor:

```typescript
function rebuildInputDOM(
  container: HTMLElement,
  text: string,
  commandName: string | null,
  commandStartIndex?: number,
  cursorOffset?: number
): void {
  container.innerHTML = '';
  if (commandName) {
    const cmdText = `/${commandName}`;
    // Use explicit position when available — indexOf is ambiguous if the same
    // command text appears elsewhere in the message (e.g., "try /compact mode")
    const idx = commandStartIndex ?? text.indexOf(cmdText);
    if (idx !== -1 && text.slice(idx, idx + cmdText.length) === cmdText) {
      if (idx > 0) container.appendChild(document.createTextNode(text.slice(0, idx)));
      const code = document.createElement('code');
      code.className = 'rounded bg-muted px-1.5 py-0.5 font-mono text-sm inline-block';
      code.textContent = cmdText;
      code.contentEditable = 'false';
      code.setAttribute('data-slash-command', commandName);
      container.appendChild(code);
      const afterText = text.slice(idx + cmdText.length);
      container.appendChild(document.createTextNode(afterText || ' '));
    } else {
      container.textContent = text;
    }
  } else {
    container.textContent = text;
  }
  if (cursorOffset !== undefined) {
    setCursorAtTextOffset(container, cursorOffset);
  }
}
```

**Helper to read existing command from DOM** (source of truth). Returns both the command name and its character offset within `textContent`, so callers can pass an explicit position to `rebuildInputDOM` (avoids ambiguous `indexOf`):

```typescript
function getActiveCommandFromDOM(
  container: HTMLElement | null
): { name: string; startIndex: number } | null {
  if (!container) return null;
  const code = container.querySelector('code[data-slash-command]');
  if (!code) return null;
  const name = code.getAttribute('data-slash-command');
  if (!name) return null;
  // Compute character offset by summing textContent of preceding siblings
  let startIndex = 0;
  let node = code.previousSibling;
  while (node) {
    startIndex += node.textContent?.length ?? 0;
    node = node.previousSibling;
  }
  return { name, startIndex };
}
```

### Step 3: Fix `handleInputChange` — cursor tracking

Replace `range.startOffset` with `getCursorOffset(inputRef.current)` for ALL cursor position calculations. This is the critical fix that makes everything else work with mixed DOM nodes.

```typescript
// BEFORE (broken with code elements):
const cursorPos = range.startOffset;

// AFTER (works with any DOM structure):
const cursorPos = getCursorOffset(e.currentTarget as HTMLElement);
```

Also remove the now-unnecessary `selection`/`range` variables from this section (we only need them for `getCursorOffset`, which handles them internally).

### Step 4: Modify `handleSlashSelect` — regular commands

Instead of `inputRef.current.textContent = newText`, use `rebuildInputDOM`:

```typescript
// Regular commands: insert code badge
const before = (currentText ?? '').slice(0, start);
const after = (currentText ?? '').slice(tokenEnd);
const replacement = `/${command.name} `;
const newText = before + replacement + after;
setInputText(newText);
rebuildInputDOM(inputRef.current, newText, command.name, start, start + replacement.length);
```

### Step 5: Modify `handleSlashSelect` — skills path

When selecting a skill, preserve any existing code badge:

```typescript
// Read existing command from DOM BEFORE modifying
const existing = getActiveCommandFromDOM(inputRef.current);
// ... compute newText (same as current) ...
setInputText(newText);
rebuildInputDOM(inputRef.current, newText, existing?.name ?? null, existing?.startIndex);
```

### Step 6: Modify `handleMentionSelect`

Same pattern — fix cursor tracking and preserve code badge:

```typescript
// Use getCursorOffset instead of range.startOffset
const cursorPos = getCursorOffset(inputRef.current);
const existing = getActiveCommandFromDOM(inputRef.current);
// ... compute newText (same as current) ...
setInputText(newText);
rebuildInputDOM(inputRef.current, newText, existing?.name ?? null, existing?.startIndex);
```

### Step 7: Add Backspace + Delete handlers in `handleKeyDown`

Insert BEFORE the existing slash popover handling (at the top of `handleKeyDown`).

**Backspace** — removes badge when cursor is immediately after it:

```typescript
if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
  const sel = window.getSelection();
  if (sel?.isCollapsed && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    // Case 1: cursor at start of text node, previous sibling is code element
    if (range.startOffset === 0 && range.startContainer !== inputRef.current) {
      const prev = range.startContainer.previousSibling;
      if (prev instanceof HTMLElement && prev.hasAttribute('data-slash-command')) {
        e.preventDefault();
        prev.remove();
        setInputText(inputRef.current?.textContent ?? '');
        return;
      }
    }
    // Case 2: cursor in container itself between children
    if (range.startContainer === inputRef.current && range.startOffset > 0) {
      const prevChild = inputRef.current.childNodes[range.startOffset - 1];
      if (prevChild instanceof HTMLElement && prevChild.hasAttribute('data-slash-command')) {
        e.preventDefault();
        prevChild.remove();
        setInputText(inputRef.current?.textContent ?? '');
        return;
      }
    }
  }
}
```

**Delete** (forward-delete) — removes badge when cursor is immediately before it:

```typescript
if (e.key === 'Delete' && !e.metaKey && !e.ctrlKey) {
  const sel = window.getSelection();
  if (sel?.isCollapsed && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    // Case 1: cursor at end of text node, next sibling is code element
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const textLen = range.startContainer.textContent?.length ?? 0;
      if (range.startOffset === textLen) {
        const next = range.startContainer.nextSibling;
        if (next instanceof HTMLElement && next.hasAttribute('data-slash-command')) {
          e.preventDefault();
          next.remove();
          setInputText(inputRef.current?.textContent ?? '');
          return;
        }
      }
    }
    // Case 2: cursor in container itself between children
    if (range.startContainer === inputRef.current) {
      const nextChild = inputRef.current.childNodes[range.startOffset];
      if (nextChild instanceof HTMLElement && nextChild.hasAttribute('data-slash-command')) {
        e.preventDefault();
        nextChild.remove();
        setInputText(inputRef.current?.textContent ?? '');
        return;
      }
    }
  }
}
```

### Step 8: Update `handleSend`, `handlePrefill`, `handlePaste`

- **`handleSend`**: No changes needed — `inputRef.current.textContent = ''` already clears everything including code elements. `inputText` (from `textContent`) already includes the command text.
- **`handlePrefill`**: Already uses `inputRef.current.textContent = text` which clears any badge. No changes needed since prefilled text is plain user text.
- **`handlePaste`**: Paste can destroy a badge because the browser replaces content within the selection range. Capture the existing badge BEFORE `e.preventDefault()`, then restore it after paste completes:

```typescript
const handlePaste = useCallback((e: React.ClipboardEvent): void => {
  // Capture badge state before paste modifies the DOM
  const existing = getActiveCommandFromDOM(inputRef.current);

  e.preventDefault();
  const pastedText = e.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(pastedText));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const newText = inputRef.current?.textContent ?? '';
  setInputText(newText);

  // Restore badge if it existed and command text survives in the new content
  if (existing && inputRef.current && newText.includes(`/${existing.name}`)) {
    // Recompute startIndex from the new text (paste may have shifted it)
    const newIdx = newText.indexOf(`/${existing.name}`);
    rebuildInputDOM(inputRef.current, newText, existing.name, newIdx);
  }
}, []);
```

### Step 9: Ghost text — no changes needed in `ChatInput.tsx`

The existing condition `slashGhostText.length > 0` is already sufficient. Ghost text is only non-empty when the slash popover is open (`popover.slashOpen && popover.slashQuery.length > 0`). A badge is inserted when the user _selects_ a command, which closes the popover and clears `slashGhostText` to `''`. So badge existence and ghost text visibility are mutually exclusive by design — no additional DOM query needed.

The original concern about badge padding causing ghost text misalignment doesn't apply because the two states never coexist.

## Known Limitations

- **Single badge only**: Only one code badge per input. Selecting a second slash command replaces the first badge. Current product behavior already limits to one command per message, so this is acceptable.
- **Undo (Cmd+Z)**: Won't restore a deleted badge. `rebuildInputDOM` uses `innerHTML = ''` which bypasses the browser undo stack. ContentEditable undo is unreliable across engines anyway.
- **Manual typing**: Typing `/compact` directly (without popover selection) produces no badge — badge is a UI affordance for popover-confirmed commands only.

## Verification

1. `bun run dev` — open browser at localhost:5176
2. Type `/com` → popover opens with ghost text → select "compact" → **code badge** appears in input
3. Type text after badge → text flows normally, cursor works
4. Press Backspace at the boundary → badge is deleted atomically
5. Press Delete before the badge → badge is deleted atomically
6. Type `@` after badge → mention popover works, selecting a file preserves the badge
7. Select a skill after a command badge → skill becomes a chip, badge preserved
8. Paste text after the badge → badge survives, pasted text appears correctly
9. Cmd+A then type → badge is replaced (acceptable — user replaced all content)
10. Press Enter → message sends with `/compact rest_of_text`, input clears
11. `bun run check` — typecheck + lint + tests pass
