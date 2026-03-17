# Plan: Style Slash Commands as Inline Code Badges in Chat Input

## Context

When a user selects a slash command from the popover (e.g., `/compact`), it currently appears as plain text in the contentEditable input div. The user wants slash commands to render as styled inline code badges — like `<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">/compact</code>` — giving them a distinct visual identity within the input, similar to how inline code looks in rendered markdown.

Skills already render as context chips above the input. File mentions (`@`) also become chips. Regular slash commands are the only token type that remains unstyled plain text.

## Approach

Insert `<code contentEditable="false" data-slash-command="name">` elements into the contentEditable div when a regular slash command is selected. The `contentEditable="false"` attribute makes the element:

- **Non-editable** — cursor can't enter it, skips over it
- **Atomically selectable** — select all or nothing
- **Backspace/Delete-deletable as a unit** — pressing backspace after or delete before removes the whole element

Use the DOM as the source of truth for whether a code badge exists (query `code[data-slash-command]`) rather than tracking separate React state, eliminating desync bugs.

**Constraint — leading commands only**: The backend expands slash commands only when the outgoing message starts with `/` (`agent-bridge/src/agent/core/agent.ts:1340`). Badge styling is limited to slash commands at the start of the input. Mid-message `/tokens` remain plain text to avoid implying they are executable.

## Files to Modify

| File                                                     | Changes                                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/input/use-chat-input.ts` | Core logic: edit helpers, cursor tracking, slash select, mention select, backspace/delete, send, paste, prefill |
| `apps/agent/src/components/chat/input/ChatInput.tsx`     | Ghost text overlay adjustment when badge + second `/query` coexist                                              |

## Implementation Steps

### Step 1: Add pure text-edit helpers to `use-chat-input.ts`

These module-level helpers model text edits as data, returning the new text, cursor position, and remapped badge position together. Every mutation path uses them, keeping DOM logic in `rebuildInputDOM` and edit math in pure testable functions.

**`TextEditResult` type and `remapCommandStartIndex`** — adjusts badge position by edit delta, intentionally drops badge when the edit overlaps it:

```typescript
interface TextEditResult {
  text: string;
  cursorOffset: number;
  commandStartIndex: number | null;
}

/** Remap badge position after a text edit. Returns null if the edit overlaps the badge range. */
function remapCommandStartIndex(
  commandStart: number | null,
  commandLength: number,
  editStart: number,
  removedLength: number,
  insertedLength: number
): number | null {
  if (commandStart === null) return null;

  const commandEnd = commandStart + commandLength;
  const editEnd = editStart + removedLength;

  // Edit is entirely before the badge — shift by delta
  if (editEnd <= commandStart) {
    return commandStart + insertedLength - removedLength;
  }

  // Edit is entirely after the badge — no shift needed
  if (editStart >= commandEnd) {
    return commandStart;
  }

  // Edit overlaps the badge range — drop badge intentionally
  return null;
}
```

**`applyTextEdit`** — the single entry point for all mutation paths. Enforces the leading-only invariant: if the remapped badge position is non-zero, the badge is dropped because the backend only expands `message.startsWith('/')`:

```typescript
function applyTextEdit(
  currentText: string,
  editStart: number,
  editEnd: number,
  insertedText: string,
  existingCommand: { name: string; startIndex: number } | null
): TextEditResult {
  const nextText = currentText.slice(0, editStart) + insertedText + currentText.slice(editEnd);
  const commandLength = existingCommand ? existingCommand.name.length + 1 : 0; // +1 for "/"

  const rawIndex = remapCommandStartIndex(
    existingCommand?.startIndex ?? null,
    commandLength,
    editStart,
    editEnd - editStart,
    insertedText.length
  );

  return {
    text: nextText,
    cursorOffset: editStart + insertedText.length,
    // Hard invariant: badge only exists at index 0
    commandStartIndex: rawIndex === 0 ? 0 : null,
  };
}
```

**`isDelimitedLeadingCommand`** — validates that the badge matches the full leading whitespace-delimited token, not just a prefix. The backend parses the first whitespace-delimited token as the command name (`agent-bridge/src/agent/core/agent.ts:1340`), so `/compactfoo` is a different command than `/compact`. Without this check, deleting the trailing space and typing after the badge would show a `/compact` badge while the actual command token is `/compactfoo`:

```typescript
function isDelimitedLeadingCommand(text: string, name: string): boolean {
  const token = `/${name}`;
  if (!text.startsWith(token)) return false;
  const next = text[token.length];
  return next === undefined || /\s/.test(next);
}
```

**`shouldBadge`** — single predicate used by every rebuild call site. Combines the leading-position check (`commandStartIndex === 0`) with the full-token delimiter check:

```typescript
function shouldBadge(
  result: TextEditResult,
  existing: { name: string; startIndex: number } | null
): { commandName: string | null; commandStartIndex: number | null } {
  if (
    result.commandStartIndex === 0 &&
    existing !== null &&
    isDelimitedLeadingCommand(result.text, existing.name)
  ) {
    return { commandName: existing.name, commandStartIndex: 0 };
  }
  return { commandName: null, commandStartIndex: null };
}
```

### Step 2: Add DOM cursor utilities to `use-chat-input.ts`

Two utility functions at module level (above `useChatInput`):

**`getCursorOffset(container)`** — Returns the cursor's character offset within the full `textContent`, regardless of how many child nodes (text nodes, code elements, `<br>` line breaks) exist:

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

**`setCursorAtTextOffset(container, offset)`** — Places cursor at a character offset. Uses recursive traversal that treats `data-slash-command` elements and `<br>` as atomic units while still traversing editable descendants (handles nested DOM from `Shift+Enter`, paste, or WebKit rewrites):

```typescript
function setCursorAtTextOffset(container: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;

  function walk(parent: Node): boolean {
    for (const child of parent.childNodes) {
      // Code badges are opaque — count text but never enter
      if (child instanceof HTMLElement && child.hasAttribute('data-slash-command')) {
        const len = child.textContent?.length ?? 0;
        if (remaining <= len) {
          const range = document.createRange();
          range.setStartAfter(child);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
        remaining -= len;
        continue;
      }
      // <br> counts as a newline character
      if (child instanceof HTMLBRElement) {
        if (remaining <= 0) {
          const range = document.createRange();
          range.setStartBefore(child);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
        remaining -= 1;
        continue;
      }
      // Text nodes — direct placement
      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent?.length ?? 0;
        if (remaining <= len) {
          const range = document.createRange();
          range.setStart(child, remaining);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
        remaining -= len;
        continue;
      }
      // Element wrappers (e.g., <div>, <span> from browser) — recurse
      if (child instanceof HTMLElement) {
        if (walk(child)) return true;
      }
    }
    return false;
  }

  if (!walk(container)) {
    // Fallback: place cursor at end
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
```

### Step 3: Add `rebuildInputDOM` helper

Rebuilds the contentEditable DOM from text content + optional command name, placing a `<code>` badge at the command position and restoring cursor. Uses `replaceChildren()` instead of `innerHTML = ''` to avoid HTML parser involvement:

```typescript
function rebuildInputDOM(
  container: HTMLElement,
  text: string,
  commandName: string | null,
  commandStartIndex: number | null,
  cursorOffset: number
): void {
  const nodes: Node[] = [];

  if (commandName !== null && commandStartIndex !== null) {
    const cmdText = `/${commandName}`;
    const idx = commandStartIndex;
    const afterCmd = text[idx + cmdText.length];
    const isDelimited = afterCmd === undefined || /\s/.test(afterCmd);
    if (idx >= 0 && text.slice(idx, idx + cmdText.length) === cmdText && isDelimited) {
      if (idx > 0) nodes.push(document.createTextNode(text.slice(0, idx)));
      const code = document.createElement('code');
      code.className = 'rounded-[5px] bg-lg-control px-1.5 py-0.5 font-mono text-sm inline-block';
      code.textContent = cmdText;
      code.contentEditable = 'false';
      code.setAttribute('data-slash-command', commandName);
      nodes.push(code);
      const afterText = text.slice(idx + cmdText.length);
      nodes.push(document.createTextNode(afterText || ' '));
    } else {
      nodes.push(document.createTextNode(text));
    }
  } else {
    nodes.push(document.createTextNode(text));
  }

  container.replaceChildren(...nodes);
  setCursorAtTextOffset(container, cursorOffset);
}
```

**Note on badge classes**: Uses `bg-lg-control` and `rounded-[5px]` to match the existing slash-token styling in `MessageItem.tsx` (line 169), so the input badge matches rendered messages across light/dark modes.

**`findBadgeLocation`** — recursive badge lookup that works regardless of nesting depth. Handles `<div>`/`<span>` wrappers from `Shift+Enter`, WebKit paste, or browser DOM rewrites. Used for both badge state reading and Backspace/Delete adjacency detection:

```typescript
interface BadgeLocation {
  name: string;
  startIndex: number;
  element: HTMLElement;
}

function findBadgeLocation(container: HTMLElement | null): BadgeLocation | null {
  if (!container) return null;
  let offset = 0;

  function walk(node: Node): BadgeLocation | null {
    for (const child of node.childNodes) {
      if (child instanceof HTMLElement && child.hasAttribute('data-slash-command')) {
        const name = child.getAttribute('data-slash-command');
        if (name) return { name, startIndex: offset, element: child };
        // Malformed badge — skip its text and continue
        offset += child.textContent?.length ?? 0;
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE) {
        offset += child.textContent?.length ?? 0;
        continue;
      }
      if (child instanceof HTMLBRElement) {
        offset += 1;
        continue;
      }
      // Nested element — recurse
      if (child instanceof HTMLElement) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(container);
}
```

This replaces the previous `getActiveCommandFromDOM` which only walked direct `previousSibling` — unsafe when the badge is inside a nested wrapper.

### Step 4: Fix `handleInputChange` — cursor tracking + badge demotion

Replace `range.startOffset` with `getCursorOffset(inputRef.current)` for ALL cursor position calculations. This is the critical fix that makes everything else work with mixed DOM nodes.

```typescript
// BEFORE (broken with code elements):
const cursorPos = range.startOffset;

// AFTER (works with any DOM structure):
const cursorPos = getCursorOffset(e.currentTarget as HTMLElement);
```

Also remove the now-unnecessary `selection`/`range` variables from this section (we only need them for `getCursorOffset`, which handles them internally).

**Badge demotion** — At the end of `handleInputChange`, after popover detection, check whether a badge still satisfies the leading invariant. If the user types text before an existing badge (e.g., "hello " before `/compact`), the badge must demote to plain text immediately:

```typescript
// After the existing popover open/close logic, before return:
const badge = findBadgeLocation(e.currentTarget as HTMLElement);
if (badge !== null && !isDelimitedLeadingCommand(text, badge.name)) {
  // Badge no longer matches the full leading token — demote to plain text.
  // Covers: typing before badge, deleting trailing space, typing after badge
  // so `/compact` becomes `/compactfoo`, or typing punctuation like `/compact:`.
  rebuildInputDOM(e.currentTarget as HTMLElement, text, null, null, cursorPos);
}
```

This is the runtime enforcement of the full-token invariant. It fires on every input event, catching all the ways a badge can become invalid: text inserted before it (shifts off index 0), trailing space deleted (badge text merges with following chars), or punctuation appended to the badge token.

### Step 5: Modify `handleSlashSelect` — regular commands

Instead of `inputRef.current.textContent = newText`, route through `applyTextEdit` + `shouldBadge` + `rebuildInputDOM` for consistency with all other mutation paths. For insertion there is no existing badge, so we construct one at index 0 when the command is leading:

```typescript
// Regular commands: insert code badge via applyTextEdit
const currentText = inputRef.current.textContent ?? '';
const replacement = `/${command.name} `;
// No existing badge — pass null. applyTextEdit will produce commandStartIndex: null.
const result = applyTextEdit(currentText, start, tokenEnd, replacement, null);
setInputText(result.text);

// Badge only if leading — construct the badge info manually for first insertion
const isLeading = start === 0;
rebuildInputDOM(
  inputRef.current,
  result.text,
  isLeading ? command.name : null,
  isLeading ? 0 : null,
  result.cursorOffset
);
```

### Step 6: Modify `handleSlashSelect` — skills path

When selecting a skill, preserve any existing code badge using edit-aware remapping. The `shouldBadge` predicate enforces that the badge only survives if it remains at index 0:

```typescript
// Read existing command from DOM BEFORE modifying
const existing = findBadgeLocation(inputRef.current);
const currentText = inputRef.current.textContent ?? '';
// ... compute before/after (same as current) ...
const result = applyTextEdit(currentText, start, tokenEnd, '', existing);
const badge = shouldBadge(result, existing);
setInputText(result.text);
rebuildInputDOM(
  inputRef.current,
  result.text,
  badge.commandName,
  badge.commandStartIndex,
  result.cursorOffset
);
```

### Step 7: Modify `handleMentionSelect`

Same pattern — fix cursor tracking and preserve code badge with edit-aware remapping. Uses `shouldBadge` for the leading-only invariant:

```typescript
// Use getCursorOffset instead of range.startOffset
const cursorPos = getCursorOffset(inputRef.current);
const existing = findBadgeLocation(inputRef.current);
const currentText = inputRef.current.textContent ?? '';
const beforeCursor = currentText.slice(0, cursorPos);
const lastAtIndex = beforeCursor.lastIndexOf('@');
if (lastAtIndex !== -1) {
  const result = applyTextEdit(currentText, lastAtIndex, cursorPos, '', existing);
  const badge = shouldBadge(result, existing);
  setInputText(result.text);
  rebuildInputDOM(
    inputRef.current,
    result.text,
    badge.commandName,
    badge.commandStartIndex,
    result.cursorOffset
  );
}
```

### Step 8: Add Backspace + Delete handlers in `handleKeyDown`

Insert BEFORE the existing slash popover handling (at the top of `handleKeyDown`).

Uses `findBadgeLocation` + cursor offset comparison instead of flat sibling checks. This works regardless of nesting depth — the badge could be inside a browser-created `<div>` wrapper after `Shift+Enter` or a WebKit `<span>`:

```typescript
const sel = window.getSelection();
if (
  (e.key === 'Backspace' || e.key === 'Delete') &&
  !e.metaKey &&
  !e.ctrlKey &&
  inputRef.current &&
  sel?.isCollapsed === true // Only for collapsed selections — non-collapsed should
  // use browser's native selection deletion, not badge removal
) {
  const badge = findBadgeLocation(inputRef.current);
  if (badge !== null) {
    const cursorPos = getCursorOffset(inputRef.current);
    const badgeEnd = badge.startIndex + badge.name.length + 1; // +1 for "/"

    const isCursorAdjacentAfter = e.key === 'Backspace' && cursorPos === badgeEnd;
    const isCursorAdjacentBefore = e.key === 'Delete' && cursorPos === badge.startIndex;

    if (isCursorAdjacentAfter || isCursorAdjacentBefore) {
      e.preventDefault();
      badge.element.remove();
      const newText = inputRef.current.textContent ?? '';
      setInputText(newText);
      // Restore cursor at the badge's former start position
      setCursorAtTextOffset(inputRef.current, badge.startIndex);
      return;
    }
  }
}
```

This replaces the previous Backspace/Delete handlers that assumed the badge was a direct sibling of the caret's container node. The offset-based approach is nesting-agnostic: it compares the caret's character offset against the badge's known character range. The `isCollapsed` guard ensures that when the user selects text spanning the badge boundary and presses Backspace/Delete, the browser's native selection deletion runs instead of atomically removing just the badge.

### Step 9: Update `handleSend`, `handlePrefill`, `handlePaste`

- **`handleSend`**: No changes needed — `inputRef.current.textContent = ''` already clears everything including code elements. `inputText` (from `textContent`) already includes the command text.
- **`handlePrefill`**: Already uses `inputRef.current.textContent = text` which clears any badge. No changes needed since prefilled text is plain user text.
- **`handlePaste`**: Paste can destroy a badge because the browser replaces content within the selection range. Use `applyTextEdit` with edit-aware remapping to restore the badge at the correct shifted position:

```typescript
const handlePaste = useCallback((e: React.ClipboardEvent): void => {
  // Capture badge state and cursor position before paste modifies the DOM
  const existing = findBadgeLocation(inputRef.current);
  const cursorOffset = inputRef.current ? getCursorOffset(inputRef.current) : 0;

  e.preventDefault();
  const pastedText = e.clipboardData.getData('text/plain');
  const currentText = inputRef.current?.textContent ?? '';

  // Model paste as a text edit at the cursor position
  const selection = window.getSelection();
  let editStart = cursorOffset;
  let editEnd = cursorOffset;
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed && inputRef.current) {
    // Selection exists — paste replaces it
    editStart = getCursorOffset(inputRef.current);
    const selRange = selection.getRangeAt(0);
    const endRange = document.createRange();
    endRange.setStart(inputRef.current, 0);
    endRange.setEnd(selRange.endContainer, selRange.endOffset);
    editEnd = endRange.toString().length;
  }

  const result = applyTextEdit(currentText, editStart, editEnd, pastedText, existing);
  const badge = shouldBadge(result, existing);
  setInputText(result.text);

  if (inputRef.current) {
    rebuildInputDOM(
      inputRef.current,
      result.text,
      badge.commandName,
      badge.commandStartIndex,
      result.cursorOffset
    );
  }
}, []);
```

### Step 10: Ghost text adjustment in `ChatInput.tsx`

Ghost text and a badge CAN coexist: the user can have a badge inserted, then type a second `/query` mid-message. In that state, `handleInputChange` opens the slash popover (it triggers after any whitespace, not only at position 0). The ghost text overlay mirrors plain `textContent`, which doesn't account for the badge's padded inline width — causing misalignment.

Suppress ghost text when a badge exists:

```typescript
// In the ghost text rendering condition — add inputText check:
{slashGhostText.length > 0 &&
 !inputText.match(/^\/[\w-]+ /) ? (
  <div
    aria-hidden
    className="absolute top-0 left-0 p-2 text-base pointer-events-none whitespace-pre-wrap wrap-break-word"
    style={{
      minHeight: INPUT_SIZES.textareaMinHeight,
      maxHeight: INPUT_SIZES.textareaMaxHeight,
    }}
  >
    <span className="invisible">{inputRef.current?.textContent ?? ''}</span>
    <span className="text-muted-foreground/40">{slashGhostText}</span>
  </div>
) : null}
```

The regex `/^\/[\w-]+ /` detects a leading slash command followed by a space — the exact state where a badge exists. This uses React state (`inputText`) so it's reactive, not a DOM query.

### Step 11: Add automated tests

Add DOM-level helper tests and hook-level integration tests. Test file: `apps/agent/src/__tests__/unit/components/chat/input/slash-command-badge.test.ts`

**Helper-level tests** (pure functions, no React):

```typescript
describe('remapCommandStartIndex', () => {
  it('shifts badge right when text is inserted before it', () => {
    // Badge at index 0, insert 5 chars at index 0
    expect(remapCommandStartIndex(0, 8, 0, 0, 5)).toBe(5);
  });

  it('does not shift badge when text is inserted after it', () => {
    // Badge at index 0 length 8, insert at index 10
    expect(remapCommandStartIndex(0, 8, 10, 0, 5)).toBe(0);
  });

  it('shifts badge left when text before it is removed', () => {
    // Badge at index 5, remove 3 chars starting at index 0
    expect(remapCommandStartIndex(5, 8, 0, 3, 0)).toBe(2);
  });

  it('returns null when edit overlaps the badge range', () => {
    // Badge at index 2 length 8, edit removes chars 4-6 (inside badge)
    expect(remapCommandStartIndex(2, 8, 4, 2, 0)).toBeNull();
  });
});

describe('applyTextEdit — leading-only invariant', () => {
  it('preserves badge when edit is after it and badge stays at 0', () => {
    const result = applyTextEdit('/compact hello', 9, 14, 'world', {
      name: 'compact',
      startIndex: 0,
    });
    expect(result.text).toBe('/compact world');
    expect(result.cursorOffset).toBe(14);
    expect(result.commandStartIndex).toBe(0); // badge stays leading
  });

  it('drops badge when edit shifts it off index 0', () => {
    // Insert "hi " at position 0 — badge moves to index 3
    const result = applyTextEdit('/compact hello', 0, 0, 'hi ', { name: 'compact', startIndex: 0 });
    expect(result.text).toBe('hi /compact hello');
    expect(result.commandStartIndex).toBeNull(); // no longer leading
  });

  it('drops badge when edit replaces it', () => {
    const result = applyTextEdit('/compact hello', 0, 8, 'replaced', {
      name: 'compact',
      startIndex: 0,
    });
    expect(result.commandStartIndex).toBeNull();
  });
});

describe('isDelimitedLeadingCommand', () => {
  it('returns true when command is followed by a space', () => {
    expect(isDelimitedLeadingCommand('/compact hello', 'compact')).toBe(true);
  });

  it('returns true when command is the entire text', () => {
    expect(isDelimitedLeadingCommand('/compact', 'compact')).toBe(true);
  });

  it('returns false when command merges with following chars', () => {
    expect(isDelimitedLeadingCommand('/compactfoo', 'compact')).toBe(false);
  });

  it('returns false when command has trailing punctuation', () => {
    expect(isDelimitedLeadingCommand('/compact:', 'compact')).toBe(false);
  });

  it('returns false when text does not start with command', () => {
    expect(isDelimitedLeadingCommand('hello /compact', 'compact')).toBe(false);
  });

  it('returns true when command is followed by newline', () => {
    expect(isDelimitedLeadingCommand('/compact\nhello', 'compact')).toBe(true);
  });
});

describe('shouldBadge', () => {
  it('returns commandName when at index 0 and properly delimited', () => {
    const result = shouldBadge(
      { text: '/compact hello', cursorOffset: 14, commandStartIndex: 0 },
      { name: 'compact', startIndex: 0 }
    );
    expect(result.commandName).toBe('compact');
  });

  it('returns null when commandStartIndex is non-zero', () => {
    const result = shouldBadge(
      { text: 'hi /compact', cursorOffset: 11, commandStartIndex: 3 },
      { name: 'compact', startIndex: 0 }
    );
    expect(result.commandName).toBeNull();
  });

  it('returns null when at index 0 but not properly delimited', () => {
    const result = shouldBadge(
      { text: '/compactfoo', cursorOffset: 11, commandStartIndex: 0 },
      { name: 'compact', startIndex: 0 }
    );
    expect(result.commandName).toBeNull();
  });

  it('returns null when no existing badge', () => {
    const result = shouldBadge({ text: 'hello', cursorOffset: 5, commandStartIndex: null }, null);
    expect(result.commandName).toBeNull();
  });
});
```

**DOM-level tests** (jsdom):

```typescript
describe('setCursorAtTextOffset', () => {
  it('places cursor in text node after code badge', () => {
    const container = document.createElement('div');
    const code = document.createElement('code');
    code.setAttribute('data-slash-command', 'compact');
    code.textContent = '/compact';
    code.contentEditable = 'false';
    container.appendChild(code);
    container.appendChild(document.createTextNode(' hello'));
    document.body.appendChild(container);

    setCursorAtTextOffset(container, 10); // after "/compact h"
    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    expect(sel.getRangeAt(0).startContainer.textContent).toBe(' hello');
    expect(sel.getRangeAt(0).startOffset).toBe(2); // " h" = offset 2

    document.body.removeChild(container);
  });

  it('snaps to after badge when target offset is inside badge text', () => {
    const container = document.createElement('div');
    const code = document.createElement('code');
    code.setAttribute('data-slash-command', 'compact');
    code.textContent = '/compact';
    code.contentEditable = 'false';
    container.appendChild(code);
    container.appendChild(document.createTextNode(' world'));
    document.body.appendChild(container);

    setCursorAtTextOffset(container, 3); // inside "/compact"
    const sel = window.getSelection()!;
    // Should snap to after the badge, not inside it
    expect(sel.getRangeAt(0).startContainer).not.toBe(code.firstChild);

    document.body.removeChild(container);
  });

  it('handles multiline content with <br> elements', () => {
    const container = document.createElement('div');
    container.appendChild(document.createTextNode('line1'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createTextNode('line2'));
    document.body.appendChild(container);

    setCursorAtTextOffset(container, 7); // "line1\nl" = 7
    const sel = window.getSelection()!;
    expect(sel.getRangeAt(0).startContainer.textContent).toBe('line2');
    expect(sel.getRangeAt(0).startOffset).toBe(1);

    document.body.removeChild(container);
  });
});
```

**`findBadgeLocation` tests** (DOM with nesting):

```typescript
describe('findBadgeLocation', () => {
  it('finds badge as direct child', () => {
    const container = document.createElement('div');
    const code = document.createElement('code');
    code.setAttribute('data-slash-command', 'compact');
    code.textContent = '/compact';
    container.appendChild(code);
    container.appendChild(document.createTextNode(' text'));
    document.body.appendChild(container);

    const loc = findBadgeLocation(container);
    expect(loc?.name).toBe('compact');
    expect(loc?.startIndex).toBe(0);

    document.body.removeChild(container);
  });

  it('finds badge inside a browser-created wrapper after Shift+Enter', () => {
    // Simulates: <div>line1<br><div><code>/compact</code> text</div></div>
    const container = document.createElement('div');
    container.appendChild(document.createTextNode('line1'));
    container.appendChild(document.createElement('br'));
    const wrapper = document.createElement('div');
    const code = document.createElement('code');
    code.setAttribute('data-slash-command', 'compact');
    code.textContent = '/compact';
    wrapper.appendChild(code);
    wrapper.appendChild(document.createTextNode(' text'));
    container.appendChild(wrapper);
    document.body.appendChild(container);

    const loc = findBadgeLocation(container);
    expect(loc?.name).toBe('compact');
    expect(loc?.startIndex).toBe(6); // "line1\n" = 6 chars
    expect(loc?.element).toBe(code);

    document.body.removeChild(container);
  });

  it('returns null when no badge exists', () => {
    const container = document.createElement('div');
    container.textContent = 'plain text';
    expect(findBadgeLocation(container)).toBeNull();
  });
});
```

**Hook-level integration tests** (follow existing pattern from `use-chat-input-file-chip.test.tsx`):

```typescript
describe('slash command badge in useChatInput', () => {
  it('preserves badge when inserting a mention after it', () => {});
  it('drops badge when @mention before it shifts it off index 0', () => {});
  it('drops badge when paste replaces the command text', () => {});
  it('drops badge when paste shifts it off index 0', () => {});
  it('removes badge atomically with Backspace (collapsed cursor)', () => {});
  it('removes badge atomically with Delete (collapsed cursor)', () => {});
  it('lets browser handle Backspace with non-collapsed selection across badge', () => {});
  it('does not badge mid-message slash commands', () => {});
  it('demotes badge to plain text when user types before it', () => {});
  it('demotes badge when trailing space is deleted and chars follow', () => {});
  it('demotes badge when punctuation is typed directly after badge text', () => {});
});
```

**Rendered component test** (ChatInput.tsx — ghost text suppression):

```typescript
describe('ChatInput ghost text with badge', () => {
  it('hides ghost text when a badge exists and second /query is typed', () => {});
});
```

**Source file test comment** — add to `use-chat-input.ts` per repo convention:

```typescript
// TESTED: apps/agent/src/__tests__/unit/components/chat/input/slash-command-badge.test.ts
// Run: bun run test apps/agent/src/__tests__/unit/components/chat/input/slash-command-badge.test.ts
```

## Known Limitations

- **Single badge only**: Only one code badge per input. Selecting a second slash command replaces the first badge. Current product behavior already limits to one command per message, so this is acceptable.
- **Leading commands only**: Badge is only applied when the slash command is at position 0 in the input. Mid-message `/tokens` remain plain text, matching backend execution semantics.
- **Undo (Cmd+Z)**: Won't restore a deleted badge. `replaceChildren()` bypasses the browser undo stack. ContentEditable undo is unreliable across engines anyway.
- **Manual typing**: Typing `/compact` directly (without popover selection) produces no badge — badge is a UI affordance for popover-confirmed commands only.

## Verification

1. `bun run dev` — open browser at localhost:5176
2. Type `/com` → popover opens with ghost text → select "compact" → **code badge** appears in input
3. Type text after badge → text flows normally, cursor works
4. Press `Shift+Enter` to add a newline after badge → multiline works, badge survives
5. Press Backspace at the boundary → badge is deleted atomically
6. Press Delete before the badge → badge is deleted atomically
7. Type `@` after badge → mention popover works, selecting a file preserves the badge
8. Type `@` before badge → mention selection shifts badge — if badge moves off index 0, it demotes to plain text
9. Select a skill after a command badge → skill becomes a chip, badge preserved (if still leading)
10. Paste text after the badge → badge survives at index 0
11. Paste text before the badge → badge demotes (no longer leading)
12. Paste text that replaces the badge → badge is intentionally dropped
13. Cmd+A then type → badge is replaced (acceptable — user replaced all content)
14. Type plain text before the badge (place cursor at start) → badge demotes to plain text immediately
15. Delete the trailing space after badge, type "foo" → `/compactfoo` — badge demotes (no longer a valid token)
16. Type `:` immediately after badge text → `/compact:` — badge demotes (punctuation breaks token)
17. Select text spanning the badge boundary, press Backspace → browser deletes selection normally (not atomic badge removal)
18. Type a second `/` mid-message → no badge for mid-message command (only leading gets badge)
19. Press Enter → message sends with `/compact rest_of_text`, input clears
20. `bun run test` — helper-level + DOM-level + hook-level + component tests pass
21. `bun run check` — typecheck + lint + tests pass
