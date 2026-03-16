# Unify OpenCode Question Tool to Use AskUserQuestionModal

## Context

Both backends (Claude and OpenCode) have a tool that asks the user a question during a conversation. The **post-completion inline widget** (`AskUserQuestionWidget`) is already shared — both backends render identical collapsible "Asked question" blocks in the message stream.

The problem is the **interactive pending-question card** that appears in the input area while waiting for the user's answer:

- **Claude backend** → `AskUserQuestionModal` — polished full overlay replacing the entire input, paginated one-question-at-a-time, numbered option buttons, "Something else" custom input
- **OpenCode backend** → `OcQuestionCard` — simpler inline card with pill-style option buttons, all questions at once

Goal: Make OpenCode use the same `AskUserQuestionModal` so both backends have identical question UX.

## Approach: Adapter in ChatInput (zero changes to the modal)

The `AskUserQuestionModal` accepts a `PermissionRequest` and callbacks. Rather than refactoring the modal, we add a thin adapter in `ChatInput.tsx` that converts `OcQuestionRequest` → synthetic `PermissionRequest` and wraps the callbacks to convert the answer format back.

This keeps the change surface minimal — one file modified, one file deleted.

## Steps

### 1. Add adapter `useMemo` in ChatInput.tsx (after line 118)

Convert the first pending `OcQuestionRequest` into the shape `AskUserQuestionModal` expects:

```typescript
// Adapt first OpenCode question → AskUserQuestionModal format
const adaptedOcQuestion = useMemo(() => {
  if (
    questions === undefined ||
    questions.length === 0 ||
    onQuestionReply === undefined ||
    onQuestionReject === undefined
  ) {
    return undefined;
  }
  const q = questions[0];
  if (q === undefined) return undefined;

  const request: PermissionRequest = {
    requestId: q.id,
    sessionId: q.sessionID,
    toolName: 'AskUserQuestion',
    toolInput: {
      questions: q.questions.map((item) => ({
        question: item.question,
        header: item.header,
        options: item.options.map((o) => ({ label: o.label, description: '' })),
        multiSelect: item.multiple ?? false,
      })),
    },
    createdAt: Date.now(),
  };

  return { request, question: q };
}, [questions, onQuestionReply, onQuestionReject]);
```

### 2. Add wrapped callbacks (after the useMemo)

```typescript
const handleOcQuestionApprove = useCallback(
  (requestId: string, _always?: boolean, answers?: Record<string, string>): void => {
    if (adaptedOcQuestion === undefined || onQuestionReply === undefined) return;
    const ocAnswers: OcQuestionAnswer[] = adaptedOcQuestion.question.questions.map((q) => {
      const answer = answers?.[q.question];
      return answer !== undefined ? [answer] : [];
    });
    void onQuestionReply(requestId, ocAnswers);
  },
  [adaptedOcQuestion, onQuestionReply]
);

const handleOcQuestionDeny = useCallback(
  (requestId: string): void => {
    if (onQuestionReject === undefined) return;
    void onQuestionReject(requestId);
  },
  [onQuestionReject]
);
```

**Note:** Need to add `useCallback` to the import on line 8.

### 3. Update JSX rendering (lines 193–238)

Replace the current branching to add OpenCode question as second branch:

```tsx
{
  /* AskUserQuestion — Claude backend (permission-based) */
}
{
  activeAskQuestion !== undefined &&
  onPermissionApprove !== undefined &&
  onPermissionDeny !== undefined ? (
    <AskUserQuestionModal
      request={activeAskQuestion}
      onApprove={onPermissionApprove}
      onDeny={onPermissionDeny}
    />
  ) : /* AskUserQuestion — OpenCode backend (question-based, adapted) */
  adaptedOcQuestion !== undefined ? (
    <AskUserQuestionModal
      request={adaptedOcQuestion.request}
      onApprove={handleOcQuestionApprove}
      onDeny={handleOcQuestionDeny}
    />
  ) : (
    <>
      {/* Regular Permission Modals */}
      ...existing code (lines 208-222)...
      {/* REMOVE: OcQuestionCard block (lines 224-238) — replaced by adapted modal above */}
      ...rest of input UI (context chips, editor, popovers, controls)...
    </>
  );
}
```

### 4. Remove `data-oc-question` keyboard guard (lines 141-144)

This guard prevented Enter from firing permission approval when focused inside `OcQuestionCard`. With the unified modal, the question renders in the overlay branch (before the `else` containing permission modals), so the keyboard handler for regular permissions never fires when a question is active.

```typescript
// DELETE these 4 lines:
const active = document.activeElement;
if (active instanceof HTMLElement && active.closest('[data-oc-question]') !== null) {
  return;
}
```

### 5. Update imports in ChatInput.tsx

- **Remove:** `import { OcQuestionCard } from './OcQuestionCard';` (line 11)
- **Add:** `import type { OcQuestionAnswer } from '@/types/opencode';`
- **Update:** Add `useCallback` to the React import on line 8

### 6. Remove OcQuestionCard barrel export

In `apps/agent/src/components/chat/input/index.ts`, delete line 3:

```
export { OcQuestionCard } from './OcQuestionCard';
```

### 7. Delete OcQuestionCard.tsx

Delete `apps/agent/src/components/chat/input/OcQuestionCard.tsx` — it's dead code after steps 3-6.

## Files

| File                                                      | Action                                         |
| --------------------------------------------------------- | ---------------------------------------------- |
| `apps/agent/src/components/chat/input/ChatInput.tsx`      | Modify — add adapter, update JSX, remove guard |
| `apps/agent/src/components/chat/input/index.ts`           | Modify — remove export                         |
| `apps/agent/src/components/chat/input/OcQuestionCard.tsx` | Delete                                         |

**Not modified:** `ask-user-question-modal.tsx`, `types.ts`, `use-oc-chat.ts`, `oc-permission-store.ts`, `oc-session-service.ts`

## Known Limitations (acceptable)

1. **Multi-select**: The modal advances after one selection. OpenCode questions with `multiple: true` will only get one answer per question. This matches Claude's current behavior.
2. **Custom input always shown**: The modal always renders "Something else". OpenCode questions with `custom: false` will still show it. Users can simply ignore it.
3. **One at a time**: OpenCode could queue multiple `OcQuestionRequest`s. The adapter shows only the first. When answered, the SSE `question.replied` event removes it from the store, and the next one appears.

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run knip` — no dead exports from deleted file
4. **Manual test (OpenCode backend):** Trigger a question tool → verify the paginated modal appears overlaying the input, select an option → verify answer is sent and modal dismisses
5. **Manual test (Claude backend):** Trigger AskUserQuestion → verify it still works identically (regression check)
