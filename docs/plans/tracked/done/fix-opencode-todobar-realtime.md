# Fix: OpenCode TodoBar not showing in real-time

## Context

When using the OpenCode backend, the TodoBar (persistent task list above chat input) doesn't appear in real-time when the agent uses the TodoWrite tool. The user must quit the app and restart, then navigate to the same chat to see the todos. The data persists but the live reactive update path is broken.

## Root Cause

The OpenCode server emits **3 SSE events** per tool call. The frontend adapter normalizes upstream states to `ToolStatus` — non-terminal states become `'running'`, terminal states become `'success'` or `'error'`:

| Event | Upstream trigger   | Frontend `ToolStatus` | `state.input`                  | `state.metadata`   |
| ----- | ------------------ | --------------------- | ------------------------------ | ------------------ |
| 1     | `tool-input-start` | `running`             | `{}` (empty)                   | —                  |
| 2     | `tool-call`        | `running`             | `{ todos: [...] }` (populated) | optional           |
| 3     | `tool-result`      | `success` / `error`   | `{ todos: [...] }`             | `{ todos: [...] }` |

**The first event has empty `state.input: {}`.**

`syncOcTools()` in `use-oc-chat-adapter.ts` (line 404-449) processes adapted tools:

1. **Event #1** (running, `input: {}`): Tool is new (`prev === undefined`) → calls `startTool` with `toolInput: {}` (empty). Tool enters `activeTools` with empty input.

2. **Event #2** (running, `input: { todos: [...] }`): Tool already tracked (`prev === 'running'`), new status is still `'running'`. **No condition matches** — the function only handles `new tool` and `running→completed` transitions. toolInput stays `{}`.

3. **Event #3** (completed): `prev === 'running'`, `tool.status === 'success'` → calls `completeTool`. But `completeTool` (tool-store.ts:478) reads the existing tool from `activeTools` (still with `toolInput: {}`) and moves it to `completedTools`. **toolInput is never updated.**

TodoBar reads `toolInput['todos']` → `undefined` → `parseTodos(undefined)` → `[]` → returns null.

**After restart**: All tools arrive in `completed` state at once. `startTool` gets the full input on first encounter → TodoBar works.

## Fix

Three files. Add `updateToolInput` action to ToolStore (with equality guard), call it from `syncOcTools`, and update existing tests.

### File 1: `apps/agent/src/stores/agent/tool-store.ts`

**Step A**: Add `updateToolInput` to the `ToolState` interface (after `completeTool` at line 314):

```typescript
  completeTool: (id: string, toolOutput: unknown, success: boolean) => void;
  updateToolInput: (id: string, toolInput: Record<string, unknown>) => void;
```

**Step B**: Add `updateToolInput` action implementation (after `completeTool` at ~line 506):

```typescript
updateToolInput: (id: string, toolInput: Record<string, unknown>) => {
  set((state) => {
    const tool = state.activeTools[id];
    if (!tool) return;
    // Bail out when payload is unchanged — prevents repeated persist(immer(...))
    // writes and TodoBar rerenders on every adapter recompute.
    // JSON.stringify is adequate here: tool input objects are small, flat, and
    // non-circular. getToolInput() in the adapter rebuilds a new object each
    // time, so reference equality always fails.
    if (JSON.stringify(tool.toolInput) === JSON.stringify(toolInput)) return;
    state.activeTools[id] = { ...tool, toolInput };
  });
},
```

Whole-object replacement (`{ ...tool, toolInput }`) rather than `tool.toolInput = toolInput` to avoid the Immer nested mutation bug documented in memory.

The `JSON.stringify` equality guard is critical: `adapted` is recomputed whenever `visibleMessages` or `status` changes, and `getToolInput()` rebuilds a fresh object each time. Without the guard, every adapter recompute causes a persisted store write and TodoBar rerender even when the tool input did not materially change.

### File 2: `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`

**Step A**: Add `updateToolInput` to `SyncActions` interface (line 47-58):

```typescript
interface SyncActions {
  startTool: typeof useToolStore.getState extends () => infer T
    ? T extends { startTool: infer F }
      ? F
      : never
    : never;
  completeTool: typeof useToolStore.getState extends () => infer T
    ? T extends { completeTool: infer F }
      ? F
      : never
    : never;
  updateToolInput: typeof useToolStore.getState extends () => infer T
    ? T extends { updateToolInput: infer F }
      ? F
      : never
    : never;
}
```

**Step B**: Modify `syncOcTools` (line 431-436) — add `updateToolInput` call before `completeTool` in the existing-tool branch, and also call it for running→running transitions:

```typescript
// Replace the existing else-if block:
} else {
  // Tool already tracked — update input to pick up data that arrived
  // after the initial pending event (which has empty input).
  // The store action bails out when input is unchanged (JSON equality).
  actions.updateToolInput(tool.id, tool.toolInput);

  if (
    (prev === 'pending' || prev === 'running') &&
    (tool.status === 'success' || tool.status === 'error')
  ) {
    actions.completeTool(tool.id, tool.toolOutput, tool.status === 'success');
  }
}
```

**Step C**: Pass `updateToolInput` in the useEffect that creates sync actions (line 595-601):

```typescript
useEffect(() => {
  const actions = useToolStore.getState();
  syncedRef.current = syncOcTools(adapted, syncedRef.current, {
    startTool: actions.startTool,
    completeTool: actions.completeTool,
    updateToolInput: actions.updateToolInput,
  });
}, [adapted]);
```

### File 3: `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`

Update all existing `syncOcTools` test call sites to include the new `updateToolInput` action, and add new regression tests.

**Step A**: Update existing tests — every `{ startTool, completeTool }` becomes `{ startTool, completeTool, updateToolInput }`:

```typescript
const updateToolInput = vi.fn();

// In every syncOcTools call:
syncOcTools(messages, synced, { startTool, completeTool, updateToolInput });
```

**Step B**: Add new regression tests for the actual bug path:

```typescript
it('updates tool input when a tracked tool stays running (running→running)', () => {
  const startTool = vi.fn();
  const completeTool = vi.fn();
  const updateToolInput = vi.fn();

  // Event 1: tool starts with empty input
  let synced = syncOcTools(
    [{ chat: mockChat, tools: [makeTool({ id: 'tool-1', status: 'running', toolInput: {} })] }],
    new Map(),
    { startTool, completeTool, updateToolInput }
  );

  expect(startTool).toHaveBeenCalledTimes(1);
  expect(updateToolInput).not.toHaveBeenCalled();

  // Event 2: same tool, still running, but now has populated input
  synced = syncOcTools(
    [
      {
        chat: mockChat,
        tools: [
          makeTool({
            id: 'tool-1',
            status: 'running',
            toolInput: { todos: [{ id: '1', content: 'Test', status: 'pending' }] },
          }),
        ],
      },
    ],
    synced,
    { startTool, completeTool, updateToolInput }
  );

  expect(startTool).toHaveBeenCalledTimes(1); // Not called again
  expect(updateToolInput).toHaveBeenCalledWith('tool-1', { todos: expect.any(Array) });
  expect(completeTool).not.toHaveBeenCalled();
});

it('preserves updated input through completion (running→running→completed)', () => {
  const startTool = vi.fn();
  const completeTool = vi.fn();
  const updateToolInput = vi.fn();

  // Event 1: start with empty input
  let synced = syncOcTools(
    [{ chat: mockChat, tools: [makeTool({ id: 'tool-1', status: 'running', toolInput: {} })] }],
    new Map(),
    { startTool, completeTool, updateToolInput }
  );

  // Event 2: running with populated input
  synced = syncOcTools(
    [
      {
        chat: mockChat,
        tools: [
          makeTool({
            id: 'tool-1',
            status: 'running',
            toolInput: { todos: [{ id: '1', content: 'Done', status: 'completed' }] },
          }),
        ],
      },
    ],
    synced,
    { startTool, completeTool, updateToolInput }
  );

  // Event 3: completed
  syncOcTools(
    [
      {
        chat: mockChat,
        tools: [
          makeTool({
            id: 'tool-1',
            status: 'success',
            toolOutput: 'ok',
            toolInput: { todos: [{ id: '1', content: 'Done', status: 'completed' }] },
          }),
        ],
      },
    ],
    synced,
    { startTool, completeTool, updateToolInput }
  );

  // updateToolInput called for both Event 2 and Event 3 (before completeTool)
  expect(updateToolInput).toHaveBeenCalledTimes(2);
  expect(completeTool).toHaveBeenCalledTimes(1);
});

it('calls updateToolInput for already-completed tool on first encounter (no-op path)', () => {
  const startTool = vi.fn();
  const completeTool = vi.fn();
  const updateToolInput = vi.fn();

  // Tool arrives already completed (e.g., after app restart)
  syncOcTools(
    [
      {
        chat: mockChat,
        tools: [
          makeTool({ id: 'tool-1', status: 'success', toolOutput: 'ok', toolInput: { todos: [] } }),
        ],
      },
    ],
    new Map(),
    { startTool, completeTool, updateToolInput }
  );

  // startTool + completeTool called, but NOT updateToolInput (new tool path, not else branch)
  expect(startTool).toHaveBeenCalledTimes(1);
  expect(completeTool).toHaveBeenCalledTimes(1);
  expect(updateToolInput).not.toHaveBeenCalled();
});
```

**Step C**: Add `TESTED:` warning comment to `use-oc-chat-adapter.ts` near `syncOcTools` function declaration:

```typescript
// [warning] TESTED: apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts
// Run: bun test apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts
export function syncOcTools(
```

### Why this works

After the fix, the 3-event lifecycle:

1. Event #1 (running, empty): `startTool` with `toolInput: {}` — tool in `activeTools`
2. Event #2 (running, populated): `updateToolInput` with `{ todos: [...] }` — equality guard detects change, writes to store. TodoBar sees it in `activeTools` and renders.
3. Event #3 (completed): `updateToolInput` (same data as Event #2 — equality guard bails, no store write). Then `completeTool` — reads updated tool from `activeTools`, moves to `completedTools` with correct `toolInput`.

The `updateToolInput` action is a no-op when:

- The tool doesn't exist in `activeTools` (already completed or removed)
- The tool input hasn't changed (`JSON.stringify` equality guard)

This means calling it unconditionally in the `else` branch is safe and performant.

### Why not modify `completeTool` instead

`completeTool` is called from 3 places (Claude backend in `chat-message-service.ts`, OpenCode adapter, and orphan cleanup). Adding a `toolInput` parameter would require updating all callers. The separate `updateToolInput` action is OpenCode-only and keeps blast radius minimal.

### Naming note

The codebase already has `mergeToolInputAnswers` which partially mutates `toolInput` for AskUserQuestion. `updateToolInput` replaces the entire input object rather than merging — the name distinction is intentional. If API coherence is a concern, `replaceActiveToolInput` is an alternative name.

## Edge Cases

| Scenario                                                                     | Behavior                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple identical `running` snapshots (same input)                          | `JSON.stringify` equality guard bails — no store write, no rerender                                                                                                                                                                                                                                                                    |
| TodoWrite updates input multiple times before completion (`0/3 → 1/3 → 2/3`) | Each unique input triggers `updateToolInput` → store updates → TodoBar shows latest. `completeTool` reads the most recent state from `activeTools`.                                                                                                                                                                                    |
| Session switch while TodoWrite is active                                     | `switchSession()` moves active tools to session cache. `updateToolInput` acts on `activeTools` keyed by tool ID — session switch clears them, so stale updates are no-ops.                                                                                                                                                             |
| Session ID remap while TodoWrite is active                                   | `remapSession()` re-keys session cache AND rewrites `sessionId` on both active and completed tool entries (tool-store.ts:705-714). The tool stays in `activeTools` keyed by tool ID, and `updateToolInput` continues to find it by ID — remap only changes the tool's `sessionId` field so ownership filtering works under the new ID. |
| Restored completed TodoWrite + new live TodoWrite                            | TodoBar prefers active tools over completed tools (existing logic). New live tool gets updated input; old completed tool is untouched in `completedTools`.                                                                                                                                                                             |
| Duplicate/out-of-order completion after `completeTool` removed active entry  | `updateToolInput` checks `if (!tool) return` — no-op. `completeTool` also checks `if (tool)` — no-op. Store state is not corrupted.                                                                                                                                                                                                    |

## Files to Modify

| File                                                                   | Change                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/agent/tool-store.ts`                            | Add `updateToolInput` to `ToolState` interface + action implementation (~10 lines)            |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`                     | Add to `SyncActions`, modify `syncOcTools` else branch, pass in useEffect, add TESTED comment |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts` | Update all existing `SyncActions` call sites + add 3 new regression tests                     |

## Verification

1. `bun run typecheck` — no type errors (confirms `ToolState` and `SyncActions` are in sync)
2. `bun run lint` — ESLint passes
3. `bun test apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts` — existing tests still pass + 3 new tests pass
4. `bunx tauri dev` with OpenCode backend:
   - Send a message that triggers TodoWrite tool
   - Verify TodoBar appears in real-time above the chat input (not after completion)
   - Verify the todo items show correct content and status
   - Verify TodoBar persists after the tool completes
   - Switch sessions while a TodoWrite is active → verify no crash or stale state
   - Trigger a TodoWrite with multiple items (e.g., "create a 5-step plan") — verify TodoBar updates progressively as items complete (`0/5 → 1/5 → ...`), not just once
5. Switch to Claude SDK backend → verify TodoBar still works identically
6. Verify other tools (Read, Write, Edit, Bash) still sync correctly — `updateToolInput` is called but bails out via equality guard (no-op for tools whose input doesn't change between events)
