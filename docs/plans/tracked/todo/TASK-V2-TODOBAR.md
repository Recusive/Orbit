# Plan: Extend TodoBar to Support Task V2 Tools

## Context

Claude Agent SDK has migrated from `TodoWrite` (V1 — one tool writes all todos at once) to individual **Task V2 tools** (`TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`). Orbit's TodoBar only handles V1 — V2 tools fall through to `GenericToolWidget`, showing raw JSON with a wrench icon. This plan extends the existing TodoBar to handle both V1 and V2 tools with no new components.

---

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx` | Add null-return cases for V2 tool names |
| 2 | `apps/agent/src/components/chat/input/todo-bar.tsx` | Core change: V2 aggregation + UI enhancements |
| 3 | `agent-bridge/src/agent/core/agent.ts` | Auto-approve V2 task tools (line 651) |
| 4 | `agent-bridge/src/agent/utils/formatter.ts` | Add formatters for V2 task tools |

### Files NOT modified (verified not needed)
- `tool-store.ts` — No changes; V2 tools already flow through as `ToolExecution` objects
- `session-mode.ts` — V2 tools are SDK-internal, reach UI regardless of allowlist
- No new component files — reusing TodoBar per user requirement

---

## Step 1: ToolWidgetRenderer — Suppress V2 inline rendering

**File:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Add cases after the existing `todowrite`/`todoread` block (line 189):

```
case 'taskcreate':
case 'taskupdate':
case 'taskget':
case 'tasklist':
case 'taskoutput':
case 'taskstop':
  // Task V2 tools are rendered in the persistent TodoBar above the input box,
  // same as TodoWrite/TodoRead. No inline widget needed.
  return null;
```

This prevents V2 tools from showing as GenericToolWidget in the message stream.

---

## Step 2: TodoBar — Extend TodoItem type

**File:** `apps/agent/src/components/chat/input/todo-bar.tsx`

Extend `TodoItem` with optional V2 fields:

```typescript
interface TodoItem {
  id?: string;              // V2 only — sequential task ID ("1", "2", ...)
  content: string;          // V1: content field, V2: subject field
  activeForm: string;       // Same in both V1 and V2
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy?: string[];     // V2 only — IDs of tasks blocking this one
}
```

These additions are backward-compatible — V1 parsing continues to work since both fields are optional.

---

## Step 3: TodoBar — Add V2 aggregation logic

**File:** `apps/agent/src/components/chat/input/todo-bar.tsx`

### 3a. V2 tool name constants

```typescript
const V2_TASK_TOOL_NAMES = new Set([
  'taskcreate', 'taskupdate', 'taskget', 'tasklist', 'taskoutput', 'taskstop',
]);
```

### 3b. Aggregation function: `aggregateTaskV2Tools`

**Core challenge:** V1 TodoWrite sends the complete list every call. V2 is incremental — one task at a time. Must aggregate chronologically.

```
function aggregateTaskV2Tools(tools: ToolExecution[]): TodoItem[]
```

**Algorithm:**
1. Filter tools to V2 task tools matching the session
2. Sort by startedAt (or use array order for completed tools)
3. Maintain a `Map<string, TodoItem>` keyed by task ID
4. Process each tool chronologically:
   - **`taskcreate`**: Extract `subject` from `toolInput`, `id` from `toolOutput.task.id` → add to map
   - **`taskupdate`**: Extract `taskId` from `toolInput`, merge changed fields (status, subject, activeForm) → patch in map. If `status === 'deleted'`, remove from map.
   - **`tasklist`**: If `toolOutput.tasks` array exists, **reset map** to this snapshot (it's the complete state)
   - **`taskget`**: If `toolOutput.task` exists, merge into map (fills in details)
   - **`taskoutput`/`taskstop`**: No state changes needed (read-only / lifecycle)
5. Return `Array.from(map.values())` sorted by numeric ID

**TaskList optimization:** If a `tasklist` tool exists, use it as a snapshot base. Only process `taskcreate`/`taskupdate` tools that came AFTER it. This avoids replaying the full history.

### 3c. Defensive parsing (same pattern as existing `parseTodos`)

- Check `typeof` before accessing fields
- Default missing fields to sensible values
- Filter out tasks with empty `subject`/`content`
- Validate status is one of 3 enum values

---

## Step 4: TodoBar — Extend useMemo to detect and handle V2

**File:** `apps/agent/src/components/chat/input/todo-bar.tsx`

Modify the `useMemo` block (lines 171-209) to:

1. **Scan for BOTH V1 and V2 tools** in the same pass over `activeTools` and `completedTools`
2. **Detect which version is in use:**
   - If any V2 task tools exist → use V2 aggregation
   - If only V1 tools exist → use existing V1 logic (unchanged)
   - If both exist → prefer V2 (V1 is deprecated)
3. **For V2:** Collect all matching task tools (active + completed), pass to `aggregateTaskV2Tools()`
4. **Determine `isRunning`:** For V2, check if any active V2 task tool is currently `status === 'running'`

The V1 code path remains completely untouched — this is purely additive.

---

## Step 5: TodoBar — UI enhancements for V2 extras

**File:** `apps/agent/src/components/chat/input/todo-bar.tsx`

### 5a. Task ID display (in expanded list)

When `todo.id` is defined, prefix the task content with `#id`:
```
#1 Fix authentication bug        ✓
#2 Write integration tests        ⟳
#3 Update documentation           ○ (blocked by #2)
```

### 5b. Blocked indicator (in expanded list)

When `todo.blockedBy` has unresolved entries (i.e., tasks in the map that aren't completed), show a subtle "blocked" indicator. Use existing muted-foreground styling.

### 5c. React keys improvement

Use `todo.id` when available for stable React keys (V2), fall back to existing `content-index` pattern (V1).

---

## Step 6: Agent-Bridge — Auto-approve V2 task tools

**File:** `agent-bridge/src/agent/core/agent.ts` (line 649-651)

Currently only `TodoWrite` and `Skill` are auto-approved in the PreToolUse hook. V2 task tools (`TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`) just update UI state — no file modifications — so they should also be auto-approved.

Extend the condition:

```typescript
const AUTOAPPROVE_TOOLS = new Set([
  'TodoWrite', 'Skill',
  'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop',
]);

if (AUTOAPPROVE_TOOLS.has(toolName)) {
  return Promise.resolve({ ... allow ... });
}
```

Without this, V2 task tools would trigger unnecessary permission dialogs every time the agent creates or updates a task.

---

## Step 7: Agent-Bridge — Add V2 task formatters

**File:** `agent-bridge/src/agent/utils/formatter.ts` (line 64)

Add cases for V2 tools so logging is clean instead of using `formatGeneric`:

```typescript
case 'TaskCreate':
  return `Created task: ${toolInput.subject}`;
case 'TaskUpdate':
  return `Updated task #${toolInput.taskId}${toolInput.status ? ` → ${toolInput.status}` : ''}`;
case 'TaskGet':
  return `Read task #${toolInput.taskId}`;
case 'TaskList':
  return `Listed all tasks`;
```

---

## Verification

1. **TypeScript:** `bun run typecheck` — ensure no type errors
2. **Lint:** `bun run lint` — ensure no ESLint violations
3. **Visual test with V1:** Run app (`bunx tauri dev`), trigger a TodoWrite tool → TodoBar should render exactly as before
4. **Visual test with V2:** Trigger TaskCreate/TaskUpdate tools → should appear in TodoBar instead of GenericToolWidget
5. **Edge cases to verify:**
   - TaskCreate without completed output (still pending) — should show subject from input
   - TaskUpdate with `status: 'deleted'` — task should disappear from list
   - Multiple TaskCreate in rapid succession — all should aggregate correctly
   - TaskList tool — should show complete snapshot
   - Session filtering — V2 tools from other sessions should not appear
