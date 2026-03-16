# Lexical Migration: Chat Input Editor

## Context

The chat input uses raw `contentEditable` with a transparent-text + overlay hack for slash command highlighting. This causes cursor positioning bugs in WebKit (Tauri's WKWebView) because React re-renders mutate the contentEditable's style, resetting the cursor. The overlay approach is fundamentally fragile — two divs pretending to be one, with manual scroll sync and cursor management.

**Goal:** Replace the contentEditable + overlay system with Lexical — a lightweight React editor framework by Meta. Text, decorations, and cursor live in one unified model. Cursor positioning after slash command completion "just works" because Lexical manages it natively.

**Scope:** Only the editor surface changes. The chrome around it (permission modals, context chips, popovers, InputControls) stays unchanged. `ChatInputProps` (the public API) does not change — the parent component needs zero modifications.

**External consumers that must survive:** Demo typing engine (`demo/typing-engine.ts`), MentionPopover DOM anchoring (`mention-popover.tsx:28-35`), Canvas UI Builder wrapper (`CanvasInputArea.tsx`), existing hook tests (`slash-command-badge.test.tsx`, `use-chat-input-file-chip.test.tsx`).

---

## Dependencies

```bash
bun add lexical @lexical/react @lexical/plain-text @lexical/history @lexical/selection
```

<!-- REVIEWER: @lexical/utils was in the original plan but nothing used it.
     Replaced with @lexical/selection which provides $setBlocksType, $selectAll,
     and higher-level helpers. Used by bridge.ts for offset resolution.
     Verify during implementation that @lexical/selection covers all needs —
     if not, add @lexical/utils back. -->

**Bundle impact:** ~25-30KB gzipped estimate — **must be measured** with `bun build --analyze` or bundlephobia before merging. For reference: CodeMirror is ~500KB, Shiki ~300KB, Mermaid ~900KB.

**Chunk splitting** (add to `vite.config.ts` `manualChunks`):

```typescript
if (id.includes('node_modules/lexical') || id.includes('node_modules/@lexical')) {
  return 'vendor-lexical';
}
```

---

## Architecture

```
ChatInput.tsx (container — keeps permission modals, context chips, controls)
│
├── LexicalChatEditor (NEW — replaces contentEditable + overlays)
│   │   Exposes TWO refs:
│   │     editorRef      → LexicalEditor (for text mutations, focus, clear)
│   │     editorElementRef → HTMLDivElement (for popover anchoring, demo tooling)
│   │
│   └── LexicalComposer
│       ├── PlainTextPlugin           (base editing — no rich text)
│       ├── HistoryPlugin             (undo/redo — free)
│       ├── ContentEditable           (the actual editable div)
│       ├── TextChangePlugin          (sync editor text → inputText state)
│       ├── SlashCommandPlugin        (/ detection → popover + blue highlighting)
│       ├── MentionTriggerPlugin      (@ detection → popover trigger)
│       ├── KeyboardPlugin            (Enter/Tab/Shift+Tab/Escape)
│       ├── PrefillPlugin             (handle prefillChatInput event)
│       └── FocusPlugin               (handle focusChatInput event)
│
│   Ghost text overlay               (external div, NOT a Lexical plugin)
│
├── SlashCommandPopover              (UNCHANGED)
├── MentionPopover                   (anchored to editorElementRef — same DOM contract)
├── ContextChips                     (UNCHANGED)
└── InputControls                    (UNCHANGED)
```

### Dual-Ref Contract

<!-- AUDIT FIX #1: The original plan replaced inputRef with editorRef, breaking
     MentionPopover (needs HTMLElement for getBoundingClientRect via Radix
     PopoverAnchor virtualRef) and demo tooling (needs [data-demo-input] DOM
     element for textContent mutation). Solution: expose BOTH refs. -->

The migration maintains **two separate refs** for different consumers:

| Ref                | Type             | Used by                                                                                                                                          |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editorRef`        | `LexicalEditor`  | `handleSlashSelect`, `handleMentionSelect`, `handleSend` (clear), `focus()`, Lexical plugins                                                     |
| `editorElementRef` | `HTMLDivElement` | `MentionPopover` (Radix PopoverAnchor needs `getBoundingClientRect()`), demo typing engine (`[data-demo-input]`), ghost text overlay positioning |

`LexicalChatEditor` gets the DOM element via `editor.getRootElement()` inside a `useEffect` and assigns it to `editorElementRef`. This is stable because Lexical's root element doesn't change after mount.

---

## New Files

### 1. `apps/agent/src/components/chat/input/lexical/theme.ts`

Lexical editor theme — maps Lexical's CSS class tokens to our Tailwind classes.

```typescript
import type { EditorThemeClasses } from 'lexical';

export const chatInputTheme: EditorThemeClasses = {
  root: 'p-2 text-base outline-none overflow-y-auto overflow-x-hidden wrap-break-word',
  paragraph: 'm-0', // Reset paragraph margins (Lexical wraps lines in <p>)
  text: {
    base: 'text-foreground',
  },
  // SlashCommandNode uses its own createDOM with 'text-git-untracked'
};
```

Key: Lexical renders inside a `<div contentEditable>` with `<p>` elements for lines. The theme ensures it matches the current input's visual appearance (same padding, font size, line spacing).

<!-- REVIEWER: `wrap-break-word` IS a valid Tailwind v4 utility class
     (maps to overflow-wrap: break-word; word-break: break-word).
     Already used in the current contentEditable. Not a typo. -->

### 2. `apps/agent/src/components/chat/input/lexical/SlashCommandNode.ts`

<!-- REVIEWER: Flat file, NOT in a nodes/ subfolder.
     Project convention: only create folders when there are multiple files.
     Single custom node = single file at the lexical/ level. -->

Custom TextNode that renders slash commands in blue. NOT an entity — the user can backspace into it character by character.

```typescript
import type { EditorConfig, SerializedTextNode } from 'lexical';

import { TextNode } from 'lexical';

export class SlashCommandNode extends TextNode {
  static getType(): string {
    return 'slash-command';
  }

  static clone(node: SlashCommandNode): SlashCommandNode {
    return new SlashCommandNode(node.__text, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add('text-git-untracked');
    return dom;
  }

  updateDOM(prevNode: TextNode, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    dom.classList.add('text-git-untracked');
    return updated;
  }

  static importJSON(serializedNode: SerializedTextNode): SlashCommandNode {
    return $createSlashCommandNode(serializedNode.text);
  }

  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: 'slash-command' };
  }
}

export function $createSlashCommandNode(text: string): SlashCommandNode {
  return new SlashCommandNode(text);
}

export function $isSlashCommandNode(node: unknown): node is SlashCommandNode {
  return node instanceof SlashCommandNode;
}
```

**Why not `isTextEntity()`?** Entity nodes are atomic — backspace deletes the whole node. We want character-by-character editing so the user can fix typos in the command name without re-typing it.

<!-- REVIEWER: Verify HistoryPlugin undo behavior with node transforms.
     If user types "/com" → transform creates SlashCommandNode → user presses Cmd+Z,
     does undo reverse the keystroke (removing "m") or reverse the transform
     (converting back to TextNode)? If undo reverses the transform, that's confusing.
     Test this explicitly during implementation. If problematic, consider using
     registerNodeTransform with the SKIP_NOTIFY flag or restructuring transforms. -->

### 3. `apps/agent/src/components/chat/input/lexical/bridge.ts`

<!-- AUDIT FIX #2: Trigger detection must work on the FULL editor text with
     absolute offsets, not anchorNode.getTextContent() which breaks after
     node transforms split text into multiple nodes (TextNode + SlashCommandNode)
     and when Shift+Enter creates multiple paragraphs. This shared module
     provides root-level trigger resolution that all plugins use. -->

Shared Lexical-to-React bridge utilities. Keeps Lexical-specific editor math out of `use-chat-input.ts` and makes trigger resolution unit-testable.

```typescript
import type { EditorState, LexicalEditor, RangeSelection } from 'lexical';

import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';

/** Absolute text range for a trigger token (/ or @) in the full editor text. */
export interface TriggerRange {
  readonly kind: 'slash' | 'mention';
  readonly start: number; // Absolute offset of the trigger char in full text
  readonly end: number; // Absolute offset of cursor (end of query)
  readonly query: string; // Text after trigger char, e.g. "com" for "/com"
}

/**
 * Compute the absolute cursor offset across the entire Lexical document.
 * Walks all text nodes depth-first, summing lengths until reaching the anchor node.
 * Handles: repeated text, multi-paragraph (\n joins), SlashCommandNode splits.
 */
export function getAbsoluteCursorOffset(selection: RangeSelection): number {
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  const root = $getRoot();
  let offset = 0;

  // Walk all text nodes in document order
  const allTextNodes = root.getAllTextNodes();
  for (const node of allTextNodes) {
    if (node.getKey() === anchorNode.getKey()) {
      return offset + anchor.offset;
    }
    offset += node.getTextContentSize();
    // Add 1 for \n between paragraphs (getTextContent() joins with \n)
    const nextSibling = node.getNextSibling();
    if (nextSibling === null && node.getParent()?.getNextSibling() !== null) {
      offset += 1;
    }
  }

  // Fallback: cursor in empty paragraph (anchorNode is ParagraphNode, not TextNode)
  // Count paragraphs before the anchor's parent to compute offset
  return offset + anchor.offset;
}

/**
 * Find the active trigger (/ or @) before the cursor in the full editor text.
 * Returns null if no valid trigger is active.
 */
export function readActiveTrigger(editorState: EditorState): TriggerRange | null {
  return editorState.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

    const fullText = $getRoot().getTextContent();
    const cursor = getAbsoluteCursorOffset(selection);
    const beforeCursor = fullText.slice(0, cursor);

    // Check for slash trigger
    const lastSlash = beforeCursor.lastIndexOf('/');
    if (
      lastSlash !== -1 &&
      (lastSlash === 0 ||
        beforeCursor[lastSlash - 1] === ' ' ||
        beforeCursor[lastSlash - 1] === '\n')
    ) {
      const afterSlash = beforeCursor.slice(lastSlash + 1);
      if (!afterSlash.includes(' ') && !afterSlash.includes('\n')) {
        return { kind: 'slash', start: lastSlash, end: cursor, query: afterSlash };
      }
    }

    // Check for mention trigger
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const afterAt = beforeCursor.slice(lastAt + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        return { kind: 'mention', start: lastAt, end: cursor, query: afterAt };
      }
    }

    return null;
  });
}

/**
 * Replace a trigger range in the editor with new text.
 * Works across node boundaries by operating on absolute offsets.
 */
export function replaceTriggerRange(
  editor: LexicalEditor,
  range: TriggerRange,
  replacement: string
): void {
  editor.update(() => {
    const root = $getRoot();
    const fullText = root.getTextContent();

    // Build new full text with the replacement
    const newText = fullText.slice(0, range.start) + replacement + fullText.slice(range.end);

    // Clear and rebuild — simple but correct.
    // For a more surgical approach, walk nodes and find the exact split points.
    // Start with clear-and-rebuild; optimize only if performance demands it.
    root.clear();
    const { $createParagraphNode, $createTextNode } = require('lexical');
    const lines = newText.split('\n');
    for (const line of lines) {
      const p = $createParagraphNode();
      if (line.length > 0) p.append($createTextNode(line));
      root.append(p);
    }

    // Position cursor after the replacement
    const cursorOffset = range.start + replacement.length;
    // Walk to the correct node and set selection
    // (Implementation: iterate text nodes, accumulate lengths, set anchor)
  });
}

/**
 * Clear all editor content. Used by handleSend.
 */
export function clearEditor(editor: LexicalEditor): void {
  editor.update(() => {
    $getRoot().clear();
  });
}
```

<!-- REVIEWER: Edge case — cursor in an empty paragraph. anchorNode is a
     ParagraphNode (element type), not a TextNode. The fallback at the end
     of getAbsoluteCursorOffset handles this, but verify during step 3 that
     anchor.offset is 0 in this case and the paragraph count is correct. -->

### 4. `apps/agent/src/components/chat/input/lexical/plugins/SlashCommandPlugin.tsx`

**Three responsibilities:**

1. **Detection** — while typing, detect `/` at position 0 or after whitespace → open popover with query
2. **Highlighting** — when known commands exist in text, convert TextNode segments to SlashCommandNode
3. **Completion** — insert completed command text OR handle skill selection on popover select

**Detection** uses the shared `readActiveTrigger` from bridge.ts — works across paragraphs and split nodes:

```typescript
// Listen to editor updates, resolve trigger against FULL editor text
editor.registerUpdateListener(({ editorState }) => {
  const trigger = readActiveTrigger(editorState);

  if (trigger?.kind === 'slash') {
    // Only keep popover open if matches exist (or query is empty → show all)
    if (trigger.query === '' || getFilteredCommandsCount(trigger.query, commands) > 0) {
      popover.setSlashQuery(trigger.query);
      popover.setSlashStartIndex(trigger.start); // ABSOLUTE offset in full text
      popover.setSlashOpen(true);
    } else {
      popover.closeSlashPopover();
    }
  } else if (popover.slashOpen) {
    popover.closeSlashPopover();
  }
});
```

**Highlighting** (replaces `parseCommandSegments` + overlay):

```typescript
// Node transform: when a TextNode contains a /command pattern, split and convert
editor.registerNodeTransform(TextNode, (node) => {
  if ($isSlashCommandNode(node)) return;
  const text = node.getTextContent();
  // Find /command patterns, split node, create SlashCommandNode for matching part
  // Must handle: multiple commands in one line, mid-text commands
});

// Reverse transform: when SlashCommandNode text no longer matches, convert back
editor.registerNodeTransform(SlashCommandNode, (node) => {
  const text = node.getTextContent();
  if (!knownCommandNames.has(text.replace(/^\//, ''))) {
    node.replace($createTextNode(text));
  }
});
```

<!-- REVIEWER: knownCommandNames comes from the slash commands store.
     The registerNodeTransform callback captures the value at registration time.
     When commands change (store updates), the useEffect dependency array must
     include knownCommandNames to re-register the transform. Verify this
     doesn't cause performance issues with frequent re-registration. -->

**Command completion — TWO branches, both via `replaceTriggerRange()`:**

<!-- FINAL AUDIT FIX: The previous version used local node offsets
     (anchorNode.getKey(), slashStartOffset) with what are absolute offsets
     from bridge.ts. This breaks when the trigger is on a different node than
     the cursor (e.g., slash command on line 2 after Shift+Enter, or after
     node transforms split text). FIX: Both branches now use replaceTriggerRange()
     from bridge.ts, which operates on absolute offsets across the full root text.
     One coherent replacement model for all completion flows. -->

Both slash command and skill completion are handled in `use-chat-input.ts` `handleSlashSelect`, using the shared `replaceTriggerRange()` from `bridge.ts`. No local node offset manipulation — everything goes through absolute offsets.

```typescript
// In use-chat-input.ts handleSlashSelect:
const handleSlashSelect = useCallback(
  (command: SlashCommand): void => {
    if (!editorRef.current) return;

    // Build the trigger range from popover state (absolute offsets, safe across nodes/paragraphs)
    const triggerRange: TriggerRange = {
      kind: 'slash',
      start: popover.slashStartIndex,
      end: popover.slashStartIndex + 1 + popover.slashQuery.length, // "/" + query
      query: popover.slashQuery,
    };

    if (command.kind === 'skill') {
      // ── SKILL BRANCH ──────────────────────────────────────────────
      // Skills become context chips — remove /query from text entirely.
      replaceTriggerRange(editorRef.current, triggerRange, '');

      // Add skill as context chip (OUTSIDE editor.update — calls React setState)
      setAttachedContext((prev) => {
        if (prev.some((item) => item.type === 'skill' && item.name === command.name)) return prev;
        return [
          ...prev,
          { id: crypto.randomUUID(), type: 'skill', name: command.name, path: command.name },
        ];
      });
    } else {
      // ── COMMAND BRANCH ────────────────────────────────────────────
      // Replace /query with /commandName + trailing space.
      replaceTriggerRange(editorRef.current, triggerRange, `/${command.name} `);
      // ✅ Cursor automatically positioned after the space by replaceTriggerRange
    }

    // Set leadingCommand for blue highlighting if at position 0
    if (triggerRange.start === 0 && command.kind !== 'skill') {
      setLeadingCommand(command.name);
    }

    popover.closeSlashPopover();
    editorRef.current.focus();
  },
  [popover]
);
```

This eliminates the `completeSlashCommand()` helper entirely — `handleSlashSelect` calls `replaceTriggerRange()` directly. Same pattern as `handleMentionSelect`.

### 4. `apps/agent/src/components/chat/input/lexical/plugins/MentionTriggerPlugin.tsx`

**Two responsibilities:**

1. **Detection** — detect `@` while typing → open mention popover with query
2. **Completion** — remove `@query` text from editor on file selection

Detection follows the same pattern as SlashCommandPlugin (registerUpdateListener, check text before cursor for `@` trigger).

**Mention completion** is handled entirely in `use-chat-input.ts` `handleMentionSelect` via `replaceTriggerRange()` — no plugin-level completion helper needed. The plugin only detects the `@` trigger and opens the popover.

The full `handleMentionSelect` flow in `use-chat-input.ts`:

1. Resolve absolute path from `FileEntry`
2. Add file/folder context chip (with dedup check)
3. `replaceTriggerRange(editor, mentionRange, '')` — removes `@query` using absolute offsets
4. `popover.closeMentionPopover()`
5. `editor.focus()`

This mirrors the slash command flow — both use `replaceTriggerRange()` as the single mutation path.

### 5. `apps/agent/src/components/chat/input/lexical/plugins/KeyboardPlugin.tsx`

Handles all keyboard shortcuts that the contentEditable currently handles:

| Key              | Action                                                    |
| ---------------- | --------------------------------------------------------- |
| Enter (no Shift) | Send message (when no popover open)                       |
| Shift+Enter      | Newline (Lexical default — free)                          |
| Tab              | Accept popover selection (when open)                      |
| Shift+Tab        | Cycle input mode / OpenCode agent                         |
| Escape           | Close popover OR stop agent (delegates to global handler) |
| Arrow Up/Down    | Popover navigation (when open)                            |

Uses Lexical's `COMMAND_PRIORITY_HIGH` to intercept before default handling:

```typescript
editor.registerCommand(
  KEY_ENTER_COMMAND,
  (event) => {
    if (event?.shiftKey) return false; // Let Lexical handle newline
    if (popover.slashOpen || popover.mentionOpen) return false; // Let popover handle
    event?.preventDefault();
    handleSend();
    return true;
  },
  COMMAND_PRIORITY_HIGH
);
```

<!-- REVIEWER: MUST VERIFY — does PlainTextPlugin handle Shift+Enter as a line
     break by default? PlainTextPlugin registers its own KEY_ENTER_COMMAND handler.
     If it doesn't create a line break on Shift+Enter, the KeyboardPlugin must
     explicitly handle it:
       if (event?.shiftKey) {
         editor.update(() => { $getSelection()?.insertLineBreak(); });
         return true;
       }
     Test this during implementation step 4. -->

### 6. `apps/agent/src/components/chat/input/lexical/plugins/TextChangePlugin.tsx`

Syncs Lexical's editor state to React state (`inputText`) on every change:

```typescript
import type { FC } from 'react';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

interface TextChangePluginProps {
  readonly onChange: (text: string) => void;
}

const TextChangePlugin: FC<TextChangePluginProps> = ({ onChange }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerTextContentListener((text) => {
      onChange(text);
    });
  }, [editor, onChange]);

  return null;
};

export { TextChangePlugin };
```

### 7. `apps/agent/src/components/chat/input/lexical/plugins/PrefillPlugin.tsx`

Handles `prefillChatInput` custom event (from rewind) — sets editor text and moves cursor to end:

```typescript
useEffect(() => {
  const handler = (e: Event): void => {
    const text = (e as CustomEvent<{ text: string }>).detail.text;
    if (!text) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      root.append(paragraph);
      root.selectEnd();
    });
    editor.focus();
  };
  window.addEventListener('prefillChatInput', handler);
  return () => window.removeEventListener('prefillChatInput', handler);
}, [editor]);
```

### 8. `apps/agent/src/components/chat/input/lexical/plugins/FocusPlugin.tsx`

Handles `focusChatInput` custom event (from feedback button and other external triggers):

```typescript
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

/**
 * Listens for the 'focusChatInput' window event and focuses the Lexical editor.
 * Replaces the useEffect in use-chat-input.ts:167-176 that called inputRef.current?.focus().
 */
function FocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleFocusEvent = (): void => {
      editor.focus();
    };
    window.addEventListener('focusChatInput', handleFocusEvent);
    return () => {
      window.removeEventListener('focusChatInput', handleFocusEvent);
    };
  }, [editor]);

  return null;
}

export { FocusPlugin };
```

### 9. `apps/agent/src/components/chat/input/lexical/LexicalChatEditor.tsx`

Assembles the Lexical editor with all plugins. This is what `ChatInput.tsx` renders instead of the contentEditable + overlays.

```typescript
const LexicalChatEditor: FC<LexicalChatEditorProps> = ({
  onTextChange,
  onSend,
  popover,
  slashCommands,
  knownCommandNames,
  slashGhostText,
  handleSlashSelect,
  handleMentionSelect,
  inputMode,
  isInputEmpty,
  editorRef,
  // ...
}) => {
  const initialConfig: InitialConfigType = {
    namespace: 'ChatInput',
    theme: chatInputTheme,
    nodes: [SlashCommandNode],
    onError: (error) => logger.error('Lexical error', error),
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="p-2 text-base outline-none overflow-y-auto overflow-x-hidden wrap-break-word"
              style={{
                minHeight: INPUT_SIZES.textareaMinHeight,
                maxHeight: INPUT_SIZES.textareaMaxHeight,
              }}
              aria-label="Chat message"
              spellCheck
              data-demo-input
              data-empty={isInputEmpty}
            />
          }
          placeholder={
            <div className="absolute top-0 left-0 p-2 text-base text-muted-foreground pointer-events-none select-none">
              Plan, @ for context, / for commands
            </div>
          }
        />
        <HistoryPlugin />
        <TextChangePlugin onChange={onTextChange} />
        <SlashCommandPlugin popover={popover} commands={slashCommands} knownNames={knownCommandNames} />
        <MentionTriggerPlugin popover={popover} />
        <KeyboardPlugin popover={popover} onSend={onSend} ... />
        <PrefillPlugin />
        <FocusPlugin />
        <EditorRefPlugin editorRef={editorRef} />

        {/* Ghost text overlay — external div, NOT a Lexical plugin.
            Uses the same positioning approach as before: invisible text span
            to offset, then gray ghost text span for the untyped suffix. */}
        {slashGhostText.length > 0 ? (
          <div
            aria-hidden
            className="absolute top-0 left-0 p-2 text-base pointer-events-none whitespace-pre-wrap wrap-break-word"
            style={{
              minHeight: INPUT_SIZES.textareaMinHeight,
              maxHeight: INPUT_SIZES.textareaMaxHeight,
            }}
          >
            <span className="invisible">{/* mirror of current editor text for positioning */}</span>
            <span className="text-muted-foreground/40">{slashGhostText}</span>
          </div>
        ) : null}
      </div>
    </LexicalComposer>
  );
};
```

<!-- REVIEWER: Ghost text overlay positioning needs care.
     The current overlay uses the inputText as invisible text to offset the
     ghost text to the right position. With Lexical, the editor may have <p>
     tags and different DOM structure. The ghost text mirror span must match
     Lexical's rendered text position exactly. Consider using
     editor.getElementByKey() + getBoundingClientRect() to position
     the ghost text relative to the cursor instead of the text-mirroring
     approach. This would be more reliable with Lexical's DOM structure.
     Alternatively, investigate Lexical's DecoratorNode for ghost text
     if the overlay approach proves too fragile with <p> wrapping. -->

### 10. `apps/agent/src/components/chat/input/lexical/plugins/EditorRefPlugin.tsx`

Exposes the Lexical editor instance to the parent via a React ref. Lexical doesn't ship this — it's a standard ~8 line custom plugin:

```typescript
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import type { LexicalEditor } from 'lexical';

interface EditorRefPluginProps {
  readonly editorRef: React.MutableRefObject<LexicalEditor | null>;
}

function EditorRefPlugin({ editorRef }: EditorRefPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
}

export { EditorRefPlugin };
```

This is how `use-chat-input.ts` gets access to the editor for `handleSlashSelect`, `handleMentionSelect`, `handleSend` (clear), and `focus()` calls.

### 11. `apps/agent/src/components/chat/input/lexical/index.ts`

Barrel export per project convention:

```typescript
export { LexicalChatEditor } from './LexicalChatEditor';
export { SlashCommandNode, $createSlashCommandNode, $isSlashCommandNode } from './SlashCommandNode';
export type { TriggerRange } from './bridge';
export { readActiveTrigger, replaceTriggerRange, clearEditor } from './bridge';
```

### 12. `apps/agent/src/components/chat/input/lexical/plugins/index.ts`

Barrel export for plugins:

```typescript
export { EditorRefPlugin } from './EditorRefPlugin';
export { FocusPlugin } from './FocusPlugin';
export { KeyboardPlugin } from './KeyboardPlugin';
export { MentionTriggerPlugin } from './MentionTriggerPlugin';
export { PrefillPlugin } from './PrefillPlugin';
export { SlashCommandPlugin } from './SlashCommandPlugin';
export { TextChangePlugin } from './TextChangePlugin';
```

---

## Modified Files

### 1. `ChatInput.tsx`

**Remove:**

- `parseCommandSegments` function and `TextSegment` interface
- `commandSegments` memo
- `hasAnyCommand` variable

<!-- AUDIT RECOMMENDED FIX #2: knownCommandNames ownership.
     The original plan said to remove knownCommandNames from ChatInput.tsx
     but also said leadingCommand must feed it. Resolution: KEEP the
     knownCommandNames memo in ChatInput.tsx. It's computed from leadingCommand
     (explicit state) + slashCommands (from store). Pass it down to
     LexicalChatEditor as a prop. The SlashCommandPlugin uses it for both
     node transforms (highlighting) and popover filtering. Single source of
     truth: ChatInput.tsx owns it, passes it down. -->

- `knownCommandNames` memo stays in ChatInput.tsx — passed as prop to LexicalChatEditor
- The contentEditable div (lines 301-328)
- The command highlight overlay (lines 333-351)
- The ghost text overlay (lines 354-366) — moves into LexicalChatEditor
- `onInput`, `onKeyDown`, `onPaste`, `onScroll` handlers on contentEditable

**Add:**

- Import and render `LexicalChatEditor` in place of the contentEditable + overlays
- Pass through the same props (popover, commands, handlers)

**Keep unchanged:**

- Permission modals (+ capture-phase keyboard shortcuts)
- OC question cards
- Context chips
- Mention popover (positioned relative to the editor)
- Slash command popover (positioned relative to the editor)
- InputControls
- Input box wrapper with mode-based ring styling

### 2. `use-chat-input.ts`

**Remove:**

- `getTextOffset`, `getSelectionOffsets`, `getCursorOffset`, `setCursorAtTextOffset` — all manual cursor utilities

<!-- REVIEWER: Before deleting these utilities, verify no external consumers.
     getCursorOffset and setCursorAtTextOffset are EXPORTED (line 50, 57).
     Search for imports across the codebase:
       grep -r "getCursorOffset\|setCursorAtTextOffset" apps/ --include="*.ts" --include="*.tsx"
     If anything outside input/ imports them, either keep them or migrate those
     consumers too. -->

- `handleInputChange` — popover detection moves to Lexical plugins
- `handlePaste` — Lexical handles paste natively (plain text mode)
- `handleKeyDown` — moves to KeyboardPlugin
- Inline DOM manipulation in `handleSlashSelect` (textContent, Range)
- Inline DOM manipulation in `handleMentionSelect` (textContent, cursor)
- `inputRef` (contentEditable ref) — replaced by `editorRef: LexicalEditor | null`

**Refactor:**

`handleSlashSelect` — see Section 4 (SlashCommandPlugin) for the canonical implementation using `replaceTriggerRange()`. The snippet is not duplicated here to avoid contradictions — it lives in one place only.

`handleMentionSelect`:

```typescript
// Before: DOM manipulation + cursor positioning
// After: delegate to Lexical, keep context chip logic
const handleMentionSelect = useCallback(
  (file: FileEntry): void => {
    if (!editorRef.current) return;

    // 1. Resolve path (same as current)
    const rootPath = useFileStore.getState().rootPath;
    const absolutePath =
      rootPath && !file.path.startsWith('/') ? `${rootPath}/${file.path}` : file.path;

    // 2. Add file/folder context chip (with dedup check — same as current)
    const newContext: ContextItem = {
      id: crypto.randomUUID(),
      type: file.isDirectory ? 'folder' : 'file',
      name: file.name,
      path: absolutePath,
    };
    setAttachedContext((prev) => {
      if (
        prev.some(
          (item) => (item.type === 'file' || item.type === 'folder') && item.path === absolutePath
        )
      ) {
        return prev;
      }
      return [...prev, newContext];
    });

    // 3. Remove @query from editor text.
    //    Uses mentionStartIndex tracked by MentionTriggerPlugin during detection.
    //    This is an ABSOLUTE offset in the full editor text, safe across paragraphs
    //    and split nodes. No lastIndexOf('@') fallback — multi-mention safety.
    //
    //    IMPORTANT: Read and write are SEPARATE phases. Do NOT call editor.update()
    //    from inside editorState.read(). The trigger range was already captured
    //    during detection (stored in popover.mentionStartIndex).
    const mentionRange: TriggerRange = {
      kind: 'mention',
      start: popover.mentionStartIndex,
      end: popover.mentionStartIndex + 1 + popover.mentionQuery.length, // @ + query
      query: popover.mentionQuery,
    };
    replaceTriggerRange(editorRef.current, mentionRange, '');

    // 4. Close popover + focus
    popover.closeMentionPopover();
    editorRef.current.focus();
  },
  [popover]
);
```

`handleSend` — reads from `inputText` state (synced by TextChangePlugin), clears editor:

```typescript
const handleSend = useCallback((): void => {
  const text = inputText.trim();
  if (text.length === 0) return;

  // Build message text with context tokens — UNCHANGED from current logic:
  // - Prepend /skillName (must be first for agent-bridge detection)
  // - Append @filename tokens for file/folder context
  // - Append <ComponentName> tokens for element contexts
  // ... (existing serialization logic stays exactly as-is)

  onSend(finalText, contextFiles, images, elements, skillNames);

  // Clear editor
  if (editorRef.current) {
    editorRef.current.update(() => { $getRoot().clear(); });
  }
  setInputText('');
  setAttachedContext([]);
  clearElementContexts();
}, [inputText, onSend, ...]);
```

<!-- REVIEWER: The handleSend message assembly logic (prepending /skill,
     appending @file tokens, etc.) at use-chat-input.ts:318-390 is complex
     and stays EXACTLY as-is. It reads from inputText (string) and
     attachedContext (array), both of which work identically with Lexical.
     Do NOT refactor the serialization during this migration — touch only
     the editor surface, not the message pipeline. -->

**Keep `leadingCommand` as explicit state:**

<!-- REVIEWER: Original plan said to delete leadingCommand and derive it from
     SlashCommandNode presence. This was flagged in review as a flicker risk.
     DECISION: Keep leadingCommand as explicit React state. Set it in
     handleSlashSelect when a command is selected (start === 0). Clear it in
     TextChangePlugin's onChange callback when text no longer starts with the
     command token. The SlashCommandNode highlighting is independent — it uses
     node transforms based on knownCommandNames from the store. leadingCommand
     is used by knownCommandNames memo in ChatInput to include the just-selected
     command before the store updates. Both systems coexist safely. -->

**Keep unchanged:**

- `handleImageClick`, `handleImageSelect`
- `handleRemoveContext`
- `handleStop` (+ `isStoppingRef` guard)
- `cycleInputMode`, `cycleThinkingMode`, `cycleEffortLevel`
- `getThinkingInfo`, `getActiveDots`, `getEffortInfo`, `getInputBoxClasses`
- `slashGhostText` computation
- Pending context store subscription (useEffect with `usePendingContextStore`)
- Global ESC handler (useEffect, window listener)
- Message assembly logic in `handleSend`

### 3. `use-popover-navigation.ts`

<!-- AUDIT FIX #4: Add mentionStartIndex to popover state.
     Without it, mention completion uses lastIndexOf('@') which matches
     the wrong @ in multi-mention text like "review @foo then @bar".
     Mirrors the existing slashStartIndex pattern. -->

**Add `mentionStartIndex`:** Track the absolute offset of the `@` trigger, matching the existing `slashStartIndex` pattern:

```typescript
// New state
const [mentionStartIndex, setMentionStartIndex] = useState(0);

// Exposed in PopoverNavigationState
mentionStartIndex: number;
setMentionStartIndex: (index: number) => void;

// Reset on close
const closeMentionPopover = useCallback((): void => {
  setMentionOpen(false);
  setMentionQuery('');
  setMentionSelectedIndex(0);
  setMentionStartIndex(0);  // NEW
}, []);
```

**Update `types.ts` `PopoverNavigationState`** to include `mentionStartIndex` and `setMentionStartIndex`.

### 4. `slash-command-popover.tsx`

**Minimal change:** Add `e.preventDefault()` to `onMouseDown` (with HTMLInputElement guard) — prevents WebKit from blurring the editor on popover click:

```tsx
onMouseDown={(e) => {
  e.stopPropagation();
  // Prevent mousedown from blurring the Lexical editor when clicking command items.
  // Don't prevent default on the search input — it needs focus on click.
  if (!(e.target instanceof HTMLInputElement)) {
    e.preventDefault();
  }
}}
```

### 5. `mention-popover.tsx`

**No changes.** Still receives `query`, `selectedIndex`, renders results.

### 6. `types.ts`

**Change:**

- `inputRef: React.RefObject<HTMLDivElement | null>` → TWO refs:
  - `editorRef: React.MutableRefObject<LexicalEditor | null>` — for Lexical API calls
  - `editorElementRef: React.RefObject<HTMLDivElement | null>` — for DOM positioning (MentionPopover anchor, demo tooling)
- Remove `handleInputChange`, `handleKeyDown`, `handlePaste` from `UseChatInputReturn` (moved to plugins)
- Add `clearEditor: () => void` (used by handleSend and external reset)
- Add `mentionStartIndex` and `setMentionStartIndex` to `PopoverNavigationState`

### 7. `vite.config.ts`

**Add** Lexical chunk splitting (see Dependencies section above).

### 8. `package.json`

**Add** Lexical dependencies.

---

## What Gets Deleted

| Code                                                                                       | Reason                                             |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `parseCommandSegments()` in ChatInput.tsx                                                  | Replaced by SlashCommandNode transforms            |
| `TextSegment` interface                                                                    | No overlay segments needed                         |
| Command highlight overlay div                                                              | Blue text rendered by SlashCommandNode's DOM       |
| `color: transparent` + `caretColor` conditional styling                                    | No overlay = no transparent text                   |
| `setCursorAtTextOffset()`, `getCursorOffset()`, `getSelectionOffsets()`, `getTextOffset()` | Lexical manages cursor natively                    |
| `handleInputChange` body (popover detection logic)                                         | Moved to SlashCommandPlugin + MentionTriggerPlugin |
| `handlePaste`                                                                              | Lexical PlainTextPlugin handles paste              |
| `handleKeyDown`                                                                            | Moved to KeyboardPlugin                            |
| Inline Range manipulation in `handleSlashSelect`                                           | `replaceTriggerRange()` from bridge.ts             |
| Inline DOM manipulation in `handleMentionSelect`                                           | `replaceTriggerRange()` from bridge.ts             |
| Scroll sync handler (`onScroll`)                                                           | No overlay to sync                                 |

**NOT deleted:** `leadingCommand` state — kept as explicit state for flicker-free command highlighting (see reviewer comment above).

---

## Demo Typing Engine Migration

<!-- AUDIT FIX #3: The demo typing engine (demo/typing-engine.ts) mutates
     textContent directly and dispatches 'input' events. Lexical does NOT
     respond to textContent mutations — it manages its own DOM. The engine
     must be migrated to use InputEvent('beforeinput') which Lexical does
     process, or use the Lexical editor API directly. -->

The demo typing engine (`apps/agent/src/demo/typing-engine.ts`) currently types by:

1. Setting `inputElement.textContent += character` (line 74)
2. Dispatching `new InputEvent('input', { bubbles: true })` (line 18)

Lexical ignores `textContent` mutations. The engine must use `beforeinput` events:

```typescript
// BEFORE (current — won't work with Lexical):
inputElement.textContent = `${inputElement.textContent}${character}`;
dispatchInputEvent(inputElement); // dispatches 'input'

// AFTER (Lexical-compatible):
inputElement.dispatchEvent(
  new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: character === '\n' ? 'insertParagraph' : 'insertText',
    data: character === '\n' ? null : character,
  })
);
```

**`clearInput`** (line 41-43) must also change — `textContent = ''` doesn't work with Lexical, and a single `deleteContentBackward` only deletes one character:

```typescript
// BEFORE:
inputElement.textContent = '';

// AFTER: Expose editor clear via window global (dev/demo only)
// LexicalChatEditor registers this in a useEffect:
//   window.__orbit_editor_clear = () => editor.update(() => $getRoot().clear())
//
// Demo engine calls it:
export function clearInput(inputElement: HTMLElement): void {
  const clear = (window as Record<string, unknown>).__orbit_editor_clear;
  if (typeof clear === 'function') {
    (clear as () => void)();
  }
  // No fallback needed — demo only runs with Lexical
}
```

**Files to modify:** `apps/agent/src/demo/typing-engine.ts`, `apps/agent/src/demo/actions.ts` (verify `[data-demo-input]` still resolves to the Lexical ContentEditable element).

---

## Test Migration Strategy

<!-- AUDIT FIX #3: Existing tests mutate contentEditable directly via
     (result.current.inputRef as { current: HTMLDivElement }).current = input
     and set textContent manually. This won't work with Lexical. -->

### Existing tests that need migration

| Test file                           | What it does                                                                      | Migration                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `slash-command-badge.test.tsx`      | Creates fake `contentEditable` div, sets `textContent`, calls `handleSlashSelect` | Rewrite as component test: render `<ChatInput>` with Lexical, dispatch `beforeinput` events, verify DOM output |
| `use-chat-input-file-chip.test.tsx` | Tests pending context store drain, mention select, skill select                   | Keep store-level tests, add component test for mention/skill flows through real Lexical                        |
| `use-oc-chat-adapter.test.ts`       | Tests `prefillChatInput` rewind event                                             | Keep — `PrefillPlugin` listens to same window event, contract unchanged                                        |

### New integration tests to add

| Test                     | What to verify                                                                   |
| ------------------------ | -------------------------------------------------------------------------------- |
| Slash command completion | Type `/com` → Tab → verify `/commit ` in editor with cursor after space          |
| Skill selection          | Type `/ski` → select skill → verify text removed, context chip added             |
| Mention completion       | Type `@foo` → select file → verify `@foo` removed, context chip added            |
| Multi-trigger safety     | Type `@foo then @bar` → select from second popover → verify only `@bar` replaced |
| Send + clear             | Type text → Enter → verify editor cleared, `onSend` called with correct text     |
| Multi-paragraph          | Shift+Enter → type `/com` on line 2 → Tab → verify completion works              |
| Demo typing              | Call `typeText('hello')` → verify Lexical reflects the text                      |

### Test utilities

Use Lexical's testing helpers:

- `createTestEditor()` for unit tests on plugins/nodes
- Render `<LexicalComposer>` with real plugins for integration tests
- Dispatch `InputEvent('beforeinput')` for simulating typing (matches demo engine pattern)

---

## Canvas UI Builder Compatibility

<!-- RECOMMENDED IMPROVEMENT #3: CanvasInputArea wraps ChatInput with
     canvas-specific state. It must continue working after migration. -->

`apps/Canvas-UI-Builder/src/components/layout/canvas-input/CanvasInputArea.tsx` imports `ChatInput` directly and passes the same `ChatInputProps`. Since the public API is unchanged, it should work without modification. **Add to manual verification:** open Canvas UI Builder after migration and type a message.

---

## Migration Strategy

**Build alongside, swap atomically.** Create all Lexical files first, then swap `ChatInput.tsx` in one commit. No feature flag needed — the Lexical version replaces the contentEditable 1:1 with the same public API.

### Implementation Order

1. **Add dependencies + chunk config** — `bun add lexical @lexical/react @lexical/plain-text @lexical/history @lexical/selection`, update `vite.config.ts`
2. **Create theme + SlashCommandNode + barrel exports** — foundational building blocks
3. **Create bridge.ts** — `TriggerRange`, `readActiveTrigger`, `replaceTriggerRange`, `clearEditor`. Unit-testable without React.
4. **Create TextChangePlugin + PrefillPlugin + FocusPlugin + EditorRefPlugin** — simple plugins
5. **Create KeyboardPlugin** — Enter/Tab/Escape handling. **Verify Shift+Enter creates line break.**
6. **Create SlashCommandPlugin** — detection (via bridge.ts) + highlighting + completion. Both command AND skill branches.
7. **Create MentionTriggerPlugin** — @ detection (via bridge.ts) + text removal. Uses `mentionStartIndex`.
8. **Update use-popover-navigation.ts** — add `mentionStartIndex` + `setMentionStartIndex`
9. **Assemble LexicalChatEditor** — compose all plugins + ghost text overlay + dual ref wiring
10. **Refactor use-chat-input.ts** — remove DOM manipulation, wire to Lexical via bridge.ts, keep message assembly
11. **Swap in ChatInput.tsx** — replace contentEditable + overlays with LexicalChatEditor. Keep `knownCommandNames` memo.
12. **Migrate demo typing engine** — `beforeinput` events instead of `textContent` mutation
13. **Migrate tests** — component-level tests with real Lexical, new integration tests for multi-trigger/multi-paragraph
14. **Verify Canvas UI Builder** — smoke test `CanvasInputArea` with Lexical-powered ChatInput
15. **Clean up** — remove dead code, update types, verify no broken imports

---

## Files Summary

### New files (13)

| File                                       | Purpose                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `lexical/theme.ts`                         | Editor theme (CSS classes)                                                                     |
| `lexical/SlashCommandNode.ts`              | Blue-highlighted command text node                                                             |
| `lexical/bridge.ts`                        | Shared trigger resolution + editor math (TriggerRange, readActiveTrigger, replaceTriggerRange) |
| `lexical/LexicalChatEditor.tsx`            | Assembles editor + plugins, exposes dual refs                                                  |
| `lexical/index.ts`                         | Barrel export                                                                                  |
| `lexical/plugins/TextChangePlugin.tsx`     | Sync editor → inputText state                                                                  |
| `lexical/plugins/SlashCommandPlugin.tsx`   | / detection, highlighting, completion (commands + skills)                                      |
| `lexical/plugins/MentionTriggerPlugin.tsx` | @ detection, text removal                                                                      |
| `lexical/plugins/KeyboardPlugin.tsx`       | Enter/Tab/Shift+Tab/Escape                                                                     |
| `lexical/plugins/PrefillPlugin.tsx`        | Handle rewind prefill event                                                                    |
| `lexical/plugins/FocusPlugin.tsx`          | Handle focusChatInput event                                                                    |
| `lexical/plugins/EditorRefPlugin.tsx`      | Expose editor instance to parent via ref                                                       |
| `lexical/plugins/index.ts`                 | Barrel export for plugins                                                                      |

### Modified files (8)

| File                        | Change                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `ChatInput.tsx`             | Replace contentEditable + overlays with LexicalChatEditor; keep `knownCommandNames` memo |
| `use-chat-input.ts`         | Remove DOM manipulation, wire to Lexical API via bridge.ts; dual refs                    |
| `use-popover-navigation.ts` | Add `mentionStartIndex` + `setMentionStartIndex`                                         |
| `types.ts`                  | Dual refs (editorRef + editorElementRef), add mentionStartIndex to popover state         |
| `slash-command-popover.tsx` | Add preventDefault to mousedown                                                          |
| `demo/typing-engine.ts`     | Migrate from textContent mutation to beforeinput events                                  |
| `vite.config.ts`            | Add vendor-lexical chunk                                                                 |
| `package.json`              | Add lexical dependencies                                                                 |

---

## Assumptions to Verify During Implementation

<!-- REVIEWER: These are things the plan assumes but cannot confirm without
     running code. Each should be explicitly tested during the corresponding
     implementation step. -->

| #   | Assumption                                                                                      | Step to verify                                                                   | Fallback                                                                                   |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | PlainTextPlugin strips HTML on paste (matching current plain-text-only behavior)                | Step 4 — paste rich HTML from browser, verify only plain text appears            | Add custom PASTE_COMMAND handler that reads `text/plain` from clipboard                    |
| 2   | Shift+Enter creates line break in PlainTextPlugin                                               | Step 4 — press Shift+Enter, verify newline                                       | Add explicit `insertLineBreak()` in KeyboardPlugin                                         |
| 3   | HistoryPlugin undo works correctly with node transforms (doesn't undo the transform separately) | Step 5 — type `/commit`, Cmd+Z, verify it removes a character not the whole node | Wrap transforms in `editor.update(() => {}, { tag: 'historic' })` to merge with user edits |
| 4   | Bundle size ≤ 40KB gzipped for all Lexical packages                                             | Step 1 — measure with `bun build --analyze`                                      | Acceptable up to ~50KB given existing heavy deps                                           |
| 5   | `data-demo-input` attribute on ContentEditable is preserved for any E2E tests or tooling        | Step 9 — search codebase for `data-demo-input` consumers                         | Keep or remove based on findings                                                           |

---

## Verification

### Manual testing — Core

1. Type `/com` → Tab → cursor after `/commit ` with space, blue text, ready to type
2. Click command from popover → same result
3. Enter on popover → same result
4. `hello /com` → Tab → mid-text completion works
5. Type `/skills` → select skill → context chip added (NOT text), focus stays on input
6. Type `@` → mention popover → select file → context chip added, `@query` removed from text
7. Paste rich HTML → only plain text appears
8. Shift+Enter → newline
9. Enter → send message
10. Undo (Cmd+Z) → removes last typed character, not entire command highlight
11. Placeholder visible when empty, disappears when typing
12. Dynamic height (grows to max, scrolls after)
13. Rewind prefill → text populated, cursor at end
14. Feedback button → editor focuses (FocusPlugin)
15. Permission modals → capture-phase keyboard shortcuts still work (Enter approve, ESC deny)
16. Text selection → visible highlight (no transparent text issues)
17. IME composition (CJK input) → works naturally (no transparent text to hide it)

### Manual testing — Edge cases (from audit)

18. **Multi-paragraph slash command:** Shift+Enter → type `/com` on second line → Tab → completion works across paragraph boundary
19. **Multi-mention safety:** Type `review @foo then @bar` → select from second popover → only `@bar` replaced, `@foo` untouched
20. **Multiple slash commands:** Type `/compact then /plan` → both highlighted blue, not just the first
21. **Node boundary editing:** After `/commit` is highlighted → place cursor between `t` and space → type characters → command highlighting updates correctly
22. **Demo typing:** Run a demo conversation → verify typing animation works in Lexical input
23. **MentionPopover anchoring:** Type `@` when editor is empty → popover positions correctly. Type `@` after Shift+Enter on line 2 → popover still positioned correctly.
24. **Canvas UI Builder:** Open Canvas → type a message → send → verify ChatInput works identically

### Automated

```bash
bun run typecheck    # No type errors
bun run lint         # No lint errors
bun run test         # All tests pass (migrated + new integration tests)
```
