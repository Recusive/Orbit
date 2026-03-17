# Fix: Action bar appears with empty tool widget after thinking

## Context

When the agent responds with extended thinking followed by a tool call (e.g., AskUserQuestion), the user sees:

1. Thinking box completes ("Thought for 1.3s")
2. An empty space where the tool widget should be
3. The action bar (copy/like/dislike/rewind) visible
4. Loading dots gone

This looks broken — as if the agent stopped after thinking. In reality, the full response completed (agent:complete fired), but the tool widget rendered **empty** because `ToolWidgetRenderer` returned `null` and the wrapper `<div class="tool-widget">` still renders unconditionally.

**Root cause chain:**

- `AskUserQuestionWidget` returns `null` when `extractQuestions()` finds no valid question strings in `toolInput.questions` (line 104)
- `ToolWidgetRenderer` passes this `null` through
- `MessageItem.tsx` line 314 wraps it in `<div class="tool-widget">` regardless → empty div in DOM
- `agent:complete` sets `isStreaming=false` and `isAgentRunning=false`
- Action bar gate `isComplete && isLastInAssistantGroup` (line 339) → visible
- Loading dots gate `isAgentRunning` (line 279 of chat-messages.tsx) → gone

---

## Audit Review (2026-02-26)

**Verdict:** APPROVE WITH CHANGES

Full audit: `reviews/audit-plan.md`

### Critical Issues Identified

| #   | Problem                                                                                                                                                                                                                                                            | Resolution                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Duplicated visibility policy** — Original plan proposed a `HIDDEN_INLINE_TOOLS` set in `message-utils.ts`, but `ToolWidgetRenderer` already knows which tools return `null` (TodoWrite, ExitPlanMode, unknown non-browser tools). Two separate lists will drift. | **Centralize** — Convert `ToolWidgetRenderer` from a component to a function `renderInlineToolWidget()` that returns `ReactNode \| null`. `MessageItem` calls it, checks for `null`, only renders wrapper div when content exists. Single source of truth. |
| 2   | **No automated tests** — Plan relied on manual DOM inspection only. No regression coverage for tool-widget null rendering.                                                                                                                                         | **Add tests** — Create `MessageItem.tool-widget.test.tsx` and `ask-user-question-widget.test.tsx` covering empty/malformed payloads.                                                                                                                       |
| 3   | **Weak fallback semantics** — "Asked question" label on malformed payloads is misleading. No diagnostic signal for bad data.                                                                                                                                       | **Use "Question unavailable"** — Align with modal parser semantics from `ask-user-question-modal.tsx`. Distinct label makes malformed payloads visible.                                                                                                    |

### Recommended Improvements Accepted

| #   | Improvement                                                                             | Action                                                                                                                       |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tool-name normalization scattered (`toLowerCase()` in multiple places)                  | Add `trim().toLowerCase()` in the centralized renderability function                                                         |
| 2   | Helper placement in `message-utils.ts` mixes tool-routing policy into message utilities | Keep tool-routing in `ToolWidgetRenderer.tsx` (or co-located `tool-render-policy.ts`), not in `message-utils.ts`             |
| 3   | Unknown future tools can silently regress to empty wrapper                              | Centralized approach handles this — if `renderInlineToolWidget()` returns `null`, no wrapper renders regardless of tool name |

---

## Revised Fix — 3 changes

### 1. Centralize inline renderability in ToolWidgetRenderer

**File:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Convert from a component to an exported function that returns `ReactNode | null`:

```typescript
export function renderInlineToolWidget(
  tool: ToolExecution,
  onOpenFile: (path: string) => void,
  onOpenUrl: (url: string) => void
): ReactNode {
  const toolName = tool.toolName.trim().toLowerCase();
  const statusProps = getStatusProps(tool);

  switch (toolName) {
    case 'write': {
      /* ... existing ... */
    }
    case 'todowrite':
      return null;
    case 'exitplanmode':
      return null;
    default:
      if (isBrowserTool(tool.toolName)) {
        /* ... existing ... */
      }
      return null;
  }
}
```

**In MessageItem.tsx** (line 313), replace the unconditional wrapper:

```typescript
// Before:
return (
  <div key={segment.key} className="tool-widget">
    <ErrorBoundary ...>
      <ToolWidgetRenderer tool={segment.tool} ... />
    </ErrorBoundary>
  </div>
);

// After:
const widget = renderInlineToolWidget(segment.tool, onOpenFile, onOpenUrl);
if (widget === null) return null;

return (
  <div key={segment.key} className="tool-widget">
    <ErrorBoundary fallback={...}>{widget}</ErrorBoundary>
  </div>
);
```

No separate `HIDDEN_INLINE_TOOLS` set. No new file. The renderer IS the source of truth.

### 2. AskUserQuestionWidget — "Question unavailable" fallback

**File:** `apps/agent/src/components/chat/tools/ask-user-question-widget.tsx` (line 104)

Replace `if (pairs.length === 0) return null;` with a semantically clear fallback:

```typescript
if (pairs.length === 0) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 py-1.5 px-2.5">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Question unavailable</span>
      </div>
    </div>
  );
}
```

### 3. Add regression tests

**New files:**

- `apps/agent/src/__tests__/unit/components/chat/messages/tool-widget-rendering.test.tsx`
- `apps/agent/src/__tests__/unit/components/chat/tools/ask-user-question-widget.test.tsx`

**Test cases:**

```typescript
// tool-widget-rendering.test.tsx
it('does not render .tool-widget wrapper for TodoWrite', () => {
  /* ... */
});
it('does not render .tool-widget wrapper for ExitPlanMode', () => {
  /* ... */
});
it('does not render .tool-widget wrapper for unknown non-browser tools', () => {
  /* ... */
});
it('renders .tool-widget wrapper for known tools (Bash, Read, etc.)', () => {
  /* ... */
});

// ask-user-question-widget.test.tsx
it('renders "Question unavailable" fallback when questions array is empty', () => {
  /* ... */
});
it('renders "Question unavailable" when questions have no valid string entries', () => {
  /* ... */
});
it('renders question rows when valid questions are present', () => {
  /* ... */
});
```

---

## Files to modify

| File                                                                                    | Change                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`                        | Convert to exported `renderInlineToolWidget()` function              |
| `apps/agent/src/components/chat/messages/MessageItem.tsx`                               | Call function, conditionally render wrapper based on non-null result |
| `apps/agent/src/components/chat/messages/index.ts`                                      | Update barrel export                                                 |
| `apps/agent/src/components/chat/tools/ask-user-question-widget.tsx`                     | "Question unavailable" fallback instead of `return null`             |
| `apps/agent/src/__tests__/unit/components/chat/messages/tool-widget-rendering.test.tsx` | New test file                                                        |
| `apps/agent/src/__tests__/unit/components/chat/tools/ask-user-question-widget.test.tsx` | New test file                                                        |

## What NOT to change

- **No `agentRunningTimers` implementation** — the bridge sends exactly one `result` per `sendMessage()` call (no intermediate `agent:complete` events). The skeleton timer infrastructure is unused intentionally.
- **No action bar gating change** — the action bar showing after `agent:complete` is correct behavior. The visual bug is the empty tool widget, not premature action bar display.
- **No changes to `chat-message-service.ts`** — the event flow is correct.
- **No new `message-utils.ts` helpers** — tool-routing policy stays in `ToolWidgetRenderer.tsx`.

## Edge Cases to Handle

- **Unknown future tools**: Centralized approach returns `null` from default case → no wrapper rendered. No maintenance needed.
- **Tool name casing/whitespace**: `trim().toLowerCase()` in the centralized function handles anomalies like `"TodoWrite "`.
- **Partially valid AskUserQuestion records**: `extractQuestions()` already filters to valid string entries; if some valid, those render. Only fully empty → fallback.
- **Missing `toolOutput` or non-JSON output**: `resolveAnswers()` already handles this with `try/catch` and empty Map fallback.

## Verification

1. `bun run check` — typecheck + lint + tests pass
2. `bun test apps/agent/src/__tests__/unit/components/chat/messages/tool-widget-rendering.test.tsx` — new tests pass
3. `bun test apps/agent/src/__tests__/unit/components/chat/tools/ask-user-question-widget.test.tsx` — new tests pass
4. `bunx tauri dev` — run the app
5. Ask the agent to use AskUserQuestion tool → verify widget shows content or "Question unavailable" fallback
6. Trigger TodoWrite → verify no empty `<div class="tool-widget">` in DOM (DevTools inspect)
