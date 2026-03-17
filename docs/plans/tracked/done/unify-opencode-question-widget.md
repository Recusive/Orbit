# Unify OpenCode Question Tool Widget

## Context

Both backends have a tool that asks the user questions with selectable options. The **post-completion inline widget** (`AskUserQuestionWidget` in `ToolWidgetRenderer.tsx`) is already shared. The problem is the **interactive pending-question UI** in the input area:

- **Claude backend** → `AskUserQuestionModal` — full overlay, paginated, numbered options, "Something else" input
- **OpenCode backend** → `OcQuestionCard` — inline card, all questions at once, pill-style toggles, multi-select support

Goal: identical question UX for both backends without losing OpenCode's richer contract (`multiple`, `custom`, positional `string[][]` answers).

### Why not the original adapter approach

The v1 plan proposed a synthetic `PermissionRequest` adapter. The audit (`reviews/audit-plan.md` at repo root) identified three critical issues:

1. **Keyboard conflict**: The capture-phase permission shortcut handler fires from `regularPermissions.length > 0`, not from which JSX branch is visible. Hiding permissions behind the question overlay doesn't disable their shortcuts.
2. **Lossy answer conversion**: Claude's modal uses `Record<string, string>` (text-keyed, single answer). OpenCode uses `string[][]` (positional, multi-select). The adapter collapsed multi-select and ignored `custom: false`.
3. **Wrong abstraction layer**: `AskUserQuestionModal` owns Claude-specific state (text-keyed answers, auto-advance on single click). Forcing OpenCode through it smuggles one backend's semantics through another's.

## Approach: Shared Presenter + Thin Backend Wrappers

Extract the visual/interaction layer into a **backend-agnostic presenter** (`QuestionPrompt`). Each backend gets a thin wrapper that converts its native types to/from the presenter's interface.

```
┌─────────────────────────────────────────────────┐
│              QuestionPrompt (shared)             │
│  - Paginated questions (1 of N)                  │
│  - Numbered option buttons                       │
│  - Single-select: click → auto-advance           │
│  - Multi-select: toggle + explicit Continue      │
│  - "Something else" (hideable via allowCustom)   │
│  - Keyboard: Escape → cancel                     │
│  - Output: onSubmit(string[][]) by index         │
├──────────────────┬──────────────────────────────┤
│ AskUserQuestion  │  OpenCodeQuestionModal       │
│ Modal (Claude)   │  (OpenCode)                  │
│                  │                              │
│ PermissionReq →  │  OcQuestionReq →             │
│   QuestionItem[] │    QuestionItem[]            │
│                  │                              │
│ string[][] →     │  string[][] →                │
│   Record<s,s>    │    OcQuestionAnswer[]        │
│   onApprove()    │    onReply()                 │
└──────────────────┴──────────────────────────────┘
```

## Files

| File                                                               | Action                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `apps/agent/src/components/chat/input/question-prompt.tsx`         | **Create** — shared presenter                             |
| `apps/agent/src/components/chat/input/ask-user-question-modal.tsx` | **Refactor** — thin Claude wrapper using `QuestionPrompt` |
| `apps/agent/src/components/chat/input/oc-question-modal.tsx`       | **Create** — thin OpenCode wrapper using `QuestionPrompt` |
| `apps/agent/src/components/chat/input/ChatInput.tsx`               | **Modify** — use `OcQuestionModal`, fix keyboard guard    |
| `apps/agent/src/components/chat/input/index.ts`                    | **Modify** — swap exports                                 |
| `apps/agent/src/components/chat/input/OcQuestionCard.tsx`          | **Delete**                                                |

**Not modified:** `types.ts`, `use-oc-chat.ts`, `oc-permission-store.ts`, `oc-session-service.ts`, `use-oc-chat-adapter.ts`

## Steps

### Step 1: Create shared presenter (`question-prompt.tsx`)

Extract the visual/interaction logic from `ask-user-question-modal.tsx` into a backend-agnostic component.

**Interface:**

```typescript
interface QuestionItem {
  readonly header: string;
  readonly prompt: string; // question text
  readonly options: readonly { label: string; description: string }[];
  readonly multiple: boolean; // toggle selection vs auto-advance
  readonly allowCustom: boolean; // show/hide "Something else" row
}

interface QuestionPromptProps {
  readonly questions: readonly QuestionItem[];
  readonly onSubmit: (answers: readonly string[][]) => void;
  readonly onCancel: () => void;
  /** Called when questions array is empty/invalid. Each wrapper decides what to do. */
  readonly onInvalid?: () => void;
}
```

**Behavior (mostly extracted from current modal):**

- Paginated: one question at a time, Previous/Next navigation, "X of N" counter
- **Single-select** (`multiple: false`): click option → 150ms visual feedback → auto-advance to next question or submit. Same as current modal behavior.
- **Multi-select** (`multiple: true`): click option → toggle in/out of selection set. Show a "Continue →" button (or "Submit" on last question) to explicitly advance.
- **Custom input**: shown only when `allowCustom: true`. "Something else" row with text input + submit arrow.
- **Keyboard**: Escape → `onCancel()`. Enter in custom input → submit custom text.
- **Answer state**: `selectedAnswers: Map<number, string[]>` keyed by question index. Each entry is an array of selected option labels (+ custom text if provided).
- **On submit**: calls `onSubmit(answers)` where `answers[i] = string[]` — the selected labels for question `i`.
- **Empty/invalid guard**: if `questions.length === 0`, render nothing and call `onInvalid()` via useEffect if provided. **The presenter does NOT auto-submit** — each wrapper decides what to do with invalid data (see wrappers below).

**Visual source-of-truth** (extract from `ask-user-question-modal.tsx:214-341`):

- Container: `bg-background/90 backdrop-blur-md`, `rounded-2xl`, `shadow-[0_0.25rem_1.25rem_...]`, `pt-4`
- Header row: question text (`text-sm font-medium`), pagination controls, X dismiss button
- Option rows: `h-[3.25rem]`, numbered badge (`size-[28px] rounded-[10px]`), label, hover arrow
- Separators: `h-px bg-lg-control mx-3`
- Custom input row: Pencil icon badge, text input, arrow submit button
- Selected state: `bg-foreground/8` on row, `bg-foreground/10` on badge

### Step 2: Refactor `AskUserQuestionModal` as Claude wrapper

Slim down to ~40 lines. Keep its current props interface unchanged.

```typescript
export const AskUserQuestionModal: FC<AskUserQuestionModalProps> = ({
  request,
  onApprove,
  onDeny,
}) => {
  const questions = useMemo(() => parseQuestions(request.toolInput), [request.toolInput]);

  // Convert QuestionPrompt's index-based answers → Record<string, string>
  const handleSubmit = useCallback(
    (answersByIndex: readonly string[][]) => {
      const answersMap: Record<string, string> = {};
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const selected = answersByIndex[i];
        if (q && selected && selected.length > 0) {
          answersMap[q.question] = selected.join(', ');
        }
      }
      onApprove(request.requestId, false, answersMap);
    },
    [questions, onApprove, request.requestId]
  );

  const handleCancel = useCallback(() => {
    onDeny(request.requestId);
  }, [onDeny, request.requestId]);

  // Convert parsed questions → QuestionItem[]
  const items: QuestionItem[] = useMemo(
    () => questions.map((q) => ({
      header: q.header,
      prompt: q.question,
      options: q.options.map((o) => ({ label: o.label, description: o.description })),
      multiple: q.multiSelect,
      allowCustom: true, // Claude always shows custom input
    })),
    [questions]
  );

  // Claude: auto-approve on invalid/empty questions (preserves existing behavior)
  const handleInvalid = useCallback(() => {
    onApprove(request.requestId);
  }, [onApprove, request.requestId]);

  return (
    <QuestionPrompt
      questions={items}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onInvalid={handleInvalid}
    />
  );
};
```

Keep `parseQuestions()` helper and the `AskUserQuestionModalProps` interface in this file. The `Question`/`QuestionOption` local types stay here too (they mirror the SDK's `AskUserQuestionInput`).

### Step 3: Create `OcQuestionModal` (`oc-question-modal.tsx`)

Thin OpenCode wrapper, ~40 lines.

```typescript
import type { OcQuestionAnswer, OcQuestionRequest } from '@/types/opencode';

interface OcQuestionModalProps {
  readonly question: OcQuestionRequest;
  readonly onReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  readonly onReject: (requestId: string) => Promise<void>;
}

export const OcQuestionModal: FC<OcQuestionModalProps> = ({
  question,
  onReply,
  onReject,
}) => {
  // Convert OcQuestionRequest → QuestionItem[]
  const items: QuestionItem[] = useMemo(
    () => question.questions.map((q) => ({
      header: q.header,
      prompt: q.question,
      options: q.options.map((o) => ({ label: o.label, description: o.description })),
      multiple: q.multiple ?? false,
      allowCustom: q.custom !== false, // SDK default is true
    })),
    [question.questions]
  );

  // Pass string[][] directly as OcQuestionAnswer[]
  const handleSubmit = useCallback(
    (answersByIndex: readonly string[][]) => {
      const ocAnswers: OcQuestionAnswer[] = answersByIndex.map((a) => [...a]);
      void onReply(question.id, ocAnswers);
    },
    [onReply, question.id]
  );

  const handleCancel = useCallback(() => {
    void onReject(question.id);
  }, [onReject, question.id]);

  // OpenCode: reject on invalid/empty questions (never auto-reply with empty answers)
  const handleInvalid = useCallback(() => {
    logger.warn('OpenCode question has empty/malformed questions array, rejecting', {
      requestId: question.id,
    });
    void onReject(question.id);
  }, [onReject, question.id]);

  return (
    <QuestionPrompt
      questions={items}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onInvalid={handleInvalid}
    />
  );
};
```

**Key**: No synthetic `PermissionRequest`. No lossy conversion. `multiple` and `custom` are preserved. Answers stay positional `string[][]`. Invalid questions are rejected (never auto-replied).

### Step 4: Update `ChatInput.tsx`

**4a. Replace OcQuestionCard with OcQuestionModal in JSX (lines 224-238):**

Replace the inline `OcQuestionCard` block with `OcQuestionModal` in the overlay branch (before the else). Show only the first pending question, rendered as a full overlay matching Claude's behavior:

```tsx
{
  /* Claude AskUserQuestion — full overlay */
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
  ) : /* OpenCode question — full overlay, same visual */
  activeOcQuestion !== undefined &&
    onQuestionReply !== undefined &&
    onQuestionReject !== undefined ? (
    <OcQuestionModal
      question={activeOcQuestion}
      onReply={onQuestionReply}
      onReject={onQuestionReject}
    />
  ) : (
    <>
      {/* Regular Permission Modals (lines 208-222 — unchanged) */}
      {/* Context Chips, Lexical Editor, Popovers, Controls — unchanged */}
    </>
  );
}
```

Where `activeOcQuestion` is:

```typescript
// OpenCode questions are stored in insertion order via Record in oc-permission-store.
// Object.values() preserves insertion order (ES2015+). We intentionally serialize
// them one-at-a-time, matching Claude's single-question-at-a-time UX.
const activeOcQuestion = questions !== undefined && questions.length > 0 ? questions[0] : undefined;
```

**4b. Fix keyboard shortcut conflict (lines 135-185):**

Replace the `[data-oc-question]` DOM guard with an explicit store-level check. The useEffect should bail when an OpenCode question overlay is active:

```typescript
// Shared flag: suppress permission shortcuts when ANY question overlay is active
const isQuestionOverlayActive = activeAskQuestion !== undefined || activeOcQuestion !== undefined;

useEffect(() => {
  if (regularPermissions.length === 0 || !onPermissionApprove || !onPermissionDeny) {
    return;
  }
  // Don't fire permission shortcuts while any question overlay is active
  if (isQuestionOverlayActive) {
    return;
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    // ... existing permission shortcut logic (unchanged) ...
  };

  document.addEventListener('keydown', handleKeyDown, true);
  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
  };
}, [regularPermissions, onPermissionApprove, onPermissionDeny, isQuestionOverlayActive]);
```

This covers both the OpenCode AND Claude overlay cases — if a Claude AskUserQuestion is active, regular permission shortcuts are also suppressed.

Remove the 4-line `[data-oc-question]` DOM check inside the handler (lines 141-144) — it's now replaced by the early return above.

**4c. Update imports:**

```diff
- import { OcQuestionCard } from './OcQuestionCard';
+ import { OcQuestionModal } from './oc-question-modal';
```

### Step 5: Update barrel export (`index.ts`)

```diff
- export { OcQuestionCard } from './OcQuestionCard';
+ export { OcQuestionModal } from './oc-question-modal';
```

### Step 6: Delete `OcQuestionCard.tsx`

Dead code after Step 4.

## Edge Cases Addressed

| Edge Case                                                        | Handling                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any question overlay + regular permission pending simultaneously | `isQuestionOverlayActive` (Claude OR OpenCode) early return in keyboard useEffect prevents permission shortcuts from firing while any question overlay is shown. Permission UI hidden behind overlay; rendered after question is answered.                                                                                                                                                      |
| Two questions in same request share same `question` text         | Presenter uses index-based answers (`string[][]`), not text-keyed. No collision. Claude wrapper's `Record<string, string>` conversion may collapse duplicates, but that's Claude's own SDK contract.                                                                                                                                                                                            |
| `multiple: true`                                                 | Presenter supports toggle selection + explicit Continue button. Answers include all selected labels.                                                                                                                                                                                                                                                                                            |
| `custom: false`                                                  | Presenter hides "Something else" row when `allowCustom: false`.                                                                                                                                                                                                                                                                                                                                 |
| Multiple `QuestionRequest`s queued                               | Only first is shown (`activeOcQuestion = questions[0]`). SSE `question.replied` removes it → next appears. Same serialization Claude uses.                                                                                                                                                                                                                                                      |
| Empty questions array                                            | Presenter renders nothing and fires `onInvalid()` via useEffect. Claude wrapper auto-approves (existing behavior). OpenCode wrapper rejects with a warning log — never auto-replies with empty answers. Note: OpenCode data arrives via typed SDK (`QuestionRequest`), so structural malformation is handled upstream by the SDK client. The wrapper only needs to handle the empty-array case. |

## Verification

### Static checks

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run knip` — no dead exports

### Automated tests (Vitest + RTL)

**`apps/agent/src/__tests__/unit/components/chat/input/question-prompt.test.tsx`:**

- Single-select: clicking option calls `onSubmit` with `[[selectedLabel]]` after auto-advance
- Multi-select: toggling options accumulates selections; Continue button triggers `onSubmit` with `[[label1, label2]]`
- Multi-select + custom text: selected options + custom text combined in answer array
- `allowCustom: false`: "Something else" row not rendered
- `allowCustom: true`: custom text submitted via Enter
- Empty questions array: `onInvalid` called (not `onSubmit`)
- Pagination: Previous/Next navigation, "X of N" counter
- Escape key: calls `onCancel`

**`apps/agent/src/__tests__/unit/components/chat/input/ask-user-question-modal.test.tsx`:**

- Converts `PermissionRequest.toolInput` → `QuestionItem[]` correctly
- On submit: `string[][]` → `Record<string, string>` (joined by ", ")
- On cancel: calls `onDeny(requestId)`
- Invalid/empty questions: calls `onApprove(requestId)` (auto-approve fallback)

**`apps/agent/src/__tests__/unit/components/chat/input/oc-question-modal.test.tsx`:**

- Converts `OcQuestionRequest` → `QuestionItem[]` with `multiple` and `allowCustom` preserved
- On submit: `string[][]` passed through as `OcQuestionAnswer[]` to `onReply`
- On cancel: calls `onReject(requestId)`
- Invalid/empty questions: calls `onReject(requestId)` (never auto-replies)

**`apps/agent/src/__tests__/unit/components/chat/input/chat-input-question-shortcuts.test.tsx`:**

- Regular permission shortcuts (Enter/Escape) fire when no OpenCode question active
- Regular permission shortcuts do NOT fire when OpenCode question overlay is active
- After question answered/rejected, permission shortcuts resume working

### Manual tests

4. **OpenCode backend:**
   - Trigger question tool → paginated overlay appears (not inline card)
   - Single-select → click option → auto-advances
   - Multi-select → toggle options → click Continue → advances
   - `custom: false` → "Something else" row hidden
   - Escape → question rejected
   - Answer delivered to server (check `/question/reply` in network tab)
5. **Claude backend:**
   - AskUserQuestion → same overlay UX as before (regression check)
   - Answers still arrive as `Record<string, string>` in permission response
6. **Simultaneous permission + question:**
   - Queue both a regular permission and an OpenCode question
   - Question overlay shows; Enter does NOT approve hidden permission
   - Answer question → permission modal appears → Enter approves it
