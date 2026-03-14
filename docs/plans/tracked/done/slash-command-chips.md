# Plan: Convert Slash Command Badges to Context Chips

## Context

The inline `<code contentEditable="false">` badge approach for slash commands fundamentally doesn't work in WKWebView (Tauri's renderer). WKWebView ignores `contentEditable="false"` on inline elements — typed characters leak into the badge, turning `/compact` into `/compactand`. Multiple fix attempts (cursor placement, badge text repair) all failed because the root cause is a WebKit engine limitation, not a code bug.

The codebase already has a proven pattern that works perfectly in WKWebView: **context chips** rendered above the contentEditable div. Skills and files use this pattern today. This plan converts **leading** slash commands to use the same chip infrastructure.

**Key constraint**: Both commands and skills are transported to the backend exclusively via text content — the `skillNames` parameter in `onSend` is accepted by `chat-actions.ts:38` but never included in the actual `message:send` payload (`chat-actions.ts:224`) and is dropped by the first-message replay path (`use-chat-messages.ts:282`). The only execution path is `message.startsWith('/')` at `agent-bridge/src/agent/core/agent.ts:1340`. Therefore commands and skills are **mutually exclusive** — only one can occupy position 0.

## Changes

### 1. Add `'command'` to ContextItem type

**File:** `apps/agent/src/types/agent/context.ts`

- Add `'command'` to `ContextTypeSchema` enum: `z.enum(['file', 'folder', 'url', 'code', 'image', 'skill', 'command'])`
- Add `isCommandContext` type guard

### 2. Render command chips in ContextChips

**File:** `apps/agent/src/components/chat/input/context-chips.tsx`

Add `isCommand` branch with distinct visual styling — monospace font, `bg-lg-control` background (matching the sent-message slash token style from `MessageItem.tsx:169`), `/` prefix icon:

```
isCommand → <span className="font-mono text-[12px] shrink-0 opacity-60">/</span>
isSkill   → <IconSkills ... />
isImage   → <img ... />
default   → <FileIcon ... />
```

Command chip container uses `bg-lg-control` + `font-mono` to look like a code badge rendered safely as a chip. Display name: `/${item.name}` (same prefix as skills).

### 3. Convert `handleSlashSelect` — leading commands only, mutually exclusive with skills

**File:** `apps/agent/src/components/chat/input/use-chat-input.ts`

Replace the `else` branch (lines ~748-767). **Only leading selections (`start === 0`) become chips.** Mid-message selections stay as plain text. Selecting a command removes any existing skill chip (and vice versa — the existing skill path should remove command chips):

```typescript
} else {
  const isLeading = start === 0;

  if (isLeading) {
    // Leading commands → context chip
    // Commands and skills are mutually exclusive at position 0 —
    // both rely on message.startsWith('/') for backend expansion.
    const commandContext: ContextItem = {
      id: crypto.randomUUID(),
      type: 'command',
      name: command.name,
      path: command.name,
    };
    setAttachedContext((prev) => {
      // Remove any existing command OR skill chip (mutually exclusive)
      const filtered = prev.filter(
        (item) => item.type !== 'command' && item.type !== 'skill'
      );
      return [...filtered, commandContext];
    });

    // Remove the /query token from input text
    const before = (currentText ?? '').slice(0, start);
    const after = (currentText ?? '').slice(tokenEnd).replace(/^ /, '');
    const newText = (before + after).trim();
    inputRef.current.textContent = newText;
    setInputText(newText);
  } else {
    // Mid-message: insert as plain text (not a chip)
    const before = (currentText ?? '').slice(0, start);
    const after = (currentText ?? '').slice(tokenEnd);
    const replacement = `/${command.name} `;
    const newText = before + replacement + after;
    inputRef.current.textContent = newText;
    setInputText(newText);
    // Place cursor after the inserted command text
    setCursorAtTextOffset(inputRef.current, start + replacement.length);
  }
}
```

Similarly, update the **skill path** to remove command chips when a skill is selected:

```typescript
if (command.kind === 'skill') {
  const skillContext: ContextItem = {
    id: crypto.randomUUID(),
    type: 'skill',
    name: command.name,
    path: command.name,
  };
  setAttachedContext((prev) => {
    // Remove any existing skill OR command chip (mutually exclusive)
    const filtered = prev.filter((item) => item.type !== 'skill' && item.type !== 'command');
    if (filtered.some((item) => item.type === 'skill' && item.name === command.name)) {
      return prev;
    }
    return [...filtered, skillContext];
  });

  // Remove the /query token from input text
  const before = (currentText ?? '').slice(0, start);
  const after = (currentText ?? '').slice(tokenEnd).replace(/^ /, '');
  const newText = (before + after).trim();
  inputRef.current.textContent = newText;
  setInputText(newText);
}
```

### 4. Fix `isInputEmpty` to account for command chips

**File:** `apps/agent/src/components/chat/input/use-chat-input.ts`

The current `isInputEmpty` (line 981) only checks editor text. A message with just `/compact` (chip, no body text) is valid and sendable:

```typescript
const hasCommandChip = attachedContext.some((item) => item.type === 'command');
const isInputEmpty = inputText.length === 0 && !hasCommandChip;
```

This fixes:

- **Send button**: `InputControls.tsx:329` uses `isInputEmpty` to disable — now stays enabled with command chip
- **Send handler**: Update the early bail:

```typescript
const handleSend = useCallback((): void => {
  let text = inputText.trim();
  const commandItems = attachedContext.filter((item) => item.type === 'command');
  // Allow send with just a command chip and no body text
  if (!text && commandItems.length === 0) return;
  // ... rest of send logic
```

### 5. Command prepend in `handleSend` — same position 0 slot as skills

**File:** `apps/agent/src/components/chat/input/use-chat-input.ts`

Since commands and skills are mutually exclusive (Step 3 enforces this), only one will ever be prepended. Add command prepend alongside the existing skill prepend:

```typescript
// Prepend skill OR command invocation (mutually exclusive — Step 3 enforces this).
// Both rely on message.startsWith('/') for backend expansion.
const skillItems = attachedContext.filter((item) => item.type === 'skill');
if (skillItems.length > 0) {
  const skillPrefix = skillItems.map((s) => `/${s.name}`).join(' ');
  text = `${skillPrefix} ${text}`;
}

const commandItems = attachedContext.filter((item) => item.type === 'command');
if (commandItems.length > 0) {
  const commandPrefix = commandItems.map((c) => `/${c.name}`).join(' ');
  text = `${commandPrefix} ${text}`;
}
```

Since they're mutually exclusive, at most one of these blocks executes. The result is always a single `/token` at position 0.

### 6. Delete badge-specific code only (keep cursor helpers)

**File:** `apps/agent/src/components/chat/input/use-chat-input.ts`

**Delete** (badge-specific, now dead code):

- `remapCommandStartIndex`, `applyTextEdit`
- `isDelimitedLeadingCommand`, `shouldBadge`
- `findBadgeLocation`, `rebuildInputDOM`
- Interfaces: `ExistingCommand`, `TextEditResult`, `BadgeDecision`, `BadgeLocation`

**Keep** (still used by `handleInputChange`, `handleMentionSelect`, `handlePaste`, and the mid-message cursor placement):

- `getTextOffset` — used by `getCursorOffset` and `getSelectionOffsets`
- `getSelectionOffsets` — used by `handlePaste` (line 919)
- `getCursorOffset` — used by `handleInputChange` (line 466) and `handleMentionSelect` (line 688)
- `setCursorAtTextOffset` — used by mid-message cursor placement in Step 3 and `handleMentionSelect`

**Remove from `handleInputChange`**: badge integrity repair block + badge demotion block (the `findBadgeLocation` + `isDelimitedLeadingCommand` section, lines ~522-548)

**Remove from `handleKeyDown`**: Backspace/Delete badge handler block (lines ~817-840)

**Simplify `handleMentionSelect`**: remove `findBadgeLocation`/`applyTextEdit`/`shouldBadge`/`rebuildInputDOM`. Use `getCursorOffset` (kept) for cursor position, then direct `textContent` manipulation:

```typescript
if (inputRef.current) {
  const cursorPos = getCursorOffset(inputRef.current);
  const text = inputRef.current.textContent ?? '';
  const beforeCursor = text.slice(0, cursorPos);
  const lastAtIndex = beforeCursor.lastIndexOf('@');
  if (lastAtIndex !== -1) {
    const newText = text.slice(0, lastAtIndex) + text.slice(cursorPos);
    inputRef.current.textContent = newText;
    setInputText(newText);
    setCursorAtTextOffset(inputRef.current, lastAtIndex);
  }
}
```

**Simplify `handlePaste`**: remove badge-aware logic, keep `getSelectionOffsets` for multi-node selection handling:

```typescript
const handlePaste = useCallback((e: React.ClipboardEvent): void => {
  const container = inputRef.current;
  if (container === null) return;
  e.preventDefault();
  const pastedText = e.clipboardData.getData('text/plain');
  const currentText = container.textContent ?? '';
  const { start, end } = getSelectionOffsets(container);
  const newText = currentText.slice(0, start) + pastedText + currentText.slice(end);
  const cursorPos = start + pastedText.length;
  container.textContent = newText;
  setInputText(newText);
  setCursorAtTextOffset(container, cursorPos);
}, []);
```

### 7. Clean up ChatInput.tsx

**File:** `apps/agent/src/components/chat/input/ChatInput.tsx`

- Delete `hasSlashBadge` variable (line 117)
- Simplify ghost text condition from `slashGhostText.length > 0 && !hasSlashBadge` to `slashGhostText.length > 0`

### 8. Update tests

**File:** `apps/agent/src/__tests__/unit/components/chat/input/slash-command-badge.test.tsx`

Delete badge DOM/helper tests. Replace with chip-based tests:

- Leading command selection creates a command chip and removes text from input
- Mid-message command selection stays as plain text (no chip created)
- Only one command chip at a time (new replaces old)
- Command chip replaces any existing skill chip (mutual exclusivity)
- Skill chip replaces any existing command chip (mutual exclusivity)
- Command-only send (no body text) works — `isInputEmpty` is false when chip exists
- Command prepended at position 0 on send
- Removing command chip doesn't affect input text

## Edge Cases Addressed

| Edge Case                                 | Behavior                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `/compact` with no body text              | Sendable — `isInputEmpty` accounts for command chips                            |
| Mid-message `/compact`                    | Stays as plain text in editor, no chip. Uses `setCursorAtTextOffset` for cursor |
| Skill then command selected               | Command chip replaces skill chip (mutually exclusive)                           |
| Command then skill selected               | Skill chip replaces command chip (mutually exclusive)                           |
| Manual `/command` typed while chip exists | Works — chip is the leading command, typed text is message body                 |
| Rewind/prefill with `/command`            | Appears as plain text (no chip reconstruction) — same as current                |
| Multi-line input with mentions            | `getCursorOffset`/`getSelectionOffsets` preserved — handles split text nodes    |

## Verification

1. `bunx tauri dev` — select `/compact` from popover → command chip appears above input, cursor stays in input
2. Type message after selecting command → text flows normally, no merging
3. Select `/compact` with no other text → send button enabled, sends `/compact`
4. Click X on command chip → chip removed, send button reflects empty state
5. Select a different command → replaces previous command chip
6. Type `hello `, then select `/compact` mid-message → plain text `hello /compact `, no chip
7. Select a skill, then select a command → skill chip replaced by command chip
8. Select a command, then select a skill → command chip replaced by skill chip
9. Paste text into multi-line input → cursor lands correctly (uses `getSelectionOffsets`)
10. Press Enter → message sends with `/compact rest_of_text`
11. `bun run check` — typecheck + lint + tests pass
