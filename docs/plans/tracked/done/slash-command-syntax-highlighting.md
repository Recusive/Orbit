# Plan: Slash Command Syntax Highlighting in Chat Input

## Context

When a user types or selects a known slash command (e.g., `/compact`) in the chat input, it should be visually highlighted in blue — the same `text-git-untracked` color used for untracked files in the explorer. This is a standard feature in modern apps: known commands get colored, unknown text stays normal.

Previous attempts tried inserting styled DOM elements (`<code>`, `<span>`) inside the contentEditable div. All failed because WebKit extends styled elements when you type at their boundary, causing text to merge with the command. The overlay approach was tried but flickered because it conditionally toggled `color: transparent` on/off.

## Approach: Always-on text overlay (like CodeMirror)

The contentEditable text is **always** invisible (`color: transparent`). A React overlay **always** renders the visible text on top with syntax coloring. No conditional toggling, no flicker, no DOM elements inside contentEditable.

This is how CodeMirror, Monaco, and every modern code editor work: the editable layer is invisible, the visual layer is a separate render. The cursor and selection still work because the browser handles them natively on the contentEditable (selection highlight bleeds through behind the overlay text).

## Files to modify

| File                                                     | Changes                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/input/ChatInput.tsx`     | Make contentEditable always transparent, replace ghost text + command overlay with single always-on overlay |
| `apps/agent/src/components/chat/input/use-chat-input.ts` | Keep `leadingCommand` computation (already exists), no other changes needed                                 |

## Implementation

### Step 1: Make contentEditable always transparent

**File:** `ChatInput.tsx`

Remove the conditional `leadingCommand !== null` transparency toggle. Make it permanent:

```tsx
<div
  ref={inputRef}
  className="p-2 text-base outline-none overflow-y-auto overflow-x-hidden wrap-break-word"
  style={{
    minHeight: INPUT_SIZES.textareaMinHeight,
    maxHeight: INPUT_SIZES.textareaMaxHeight,
    color: 'transparent',
    caretColor: 'var(--foreground)',
  }}
  contentEditable
  ...
/>
```

The caret stays visible via `caretColor`. Selection highlighting works because it's a browser-native background layer independent of text color. The `data-placeholder` CSS pseudo-element has its own color and is unaffected.

### Step 2: Replace ghost text + command overlay with single always-on overlay

**File:** `ChatInput.tsx`

Delete the separate "leading command overlay" and "ghost text overlay" blocks. Replace with one always-on overlay that handles both:

```tsx
{
  /* Text rendering overlay — always visible, renders colored text on top of the
    transparent contentEditable. Same font/padding ensures pixel-perfect alignment.
    Handles both slash command highlighting AND ghost text autocomplete. */
}
<div
  aria-hidden
  className="absolute top-0 left-0 p-2 text-base pointer-events-none whitespace-pre-wrap wrap-break-word overflow-hidden"
  style={{
    minHeight: INPUT_SIZES.textareaMinHeight,
    maxHeight: INPUT_SIZES.textareaMaxHeight,
  }}
>
  {leadingCommand !== null ? (
    <>
      <span className="text-git-untracked">{`/${leadingCommand}`}</span>
      <span className="text-foreground">{inputText.slice(leadingCommand.length + 1)}</span>
    </>
  ) : (
    <span className="text-foreground">{inputText}</span>
  )}
  {slashGhostText.length > 0 ? (
    <span className="text-muted-foreground/40">{slashGhostText}</span>
  ) : null}
</div>;
```

This single overlay:

- Always renders (no flicker from conditional mount/unmount)
- Shows `/compact` in blue when `leadingCommand` matches
- Shows the rest of the text in normal foreground color
- Appends ghost text suffix when the popover is open
- Uses identical `p-2 text-base` positioning for pixel-perfect alignment with the contentEditable

### What this does NOT change

- `handleSlashSelect` — still inserts plain text `/compact ` with cursor after the space (already working correctly)
- `leadingCommand` computation in `use-chat-input.ts` — already exists, already correct
- `handleSend` — reads `inputText` which contains the plain command text
- `handlePaste`, `handleMentionSelect` — plain text operations, unaffected
- No DOM elements inside the contentEditable — ever

## Verification

1. `bun run dev` — type `/compact` → text turns blue as soon as it matches a known command
2. Press space after `/compact` → blue stays on the command, typed text after is normal color
3. Type `/unknown` → stays normal color (not in command list)
4. Select a command from popover → `/compact ` inserted, blue highlight, cursor after space, typing works
5. Delete characters from `/compact` → blue disappears when it no longer matches (e.g., `/compac` = not a known command)
6. Ghost text still works: type `/com` → ghost suffix `mit` appears in muted color after the typed text
7. Placeholder text still visible when input is empty
8. Text selection works (highlight background bleeds through from contentEditable)
9. `bun run check` — typecheck + lint + tests pass
