# Fix: OpenCode TodoBar not showing in real-time

## Context

When using the OpenCode backend, the TodoBar (persistent task list above chat input) doesn't appear in real-time when the agent uses the TodoWrite tool. The user must quit the app and restart, then navigate to the same chat to see the todos. The data persists but the live reactive update path is broken.

## Root Cause

The OpenCode server emits **3 SSE events** per tool call:

| Event | Trigger            | `status`    | `state.input`                  | `state.metadata`   |
| ----- | ------------------ | ----------- | ------------------------------ | ------------------ |
| 1     | `tool-input-start` | `pending`   | `{}` (empty)                   | —                  |
| 2     | `tool-call`        | `running`   | `{ todos: [...] }` (populated) | optional           |
| 3     | `tool-result`      | `completed` | `{ todos: [...] }`             | `{ todos: [...] }` |

**The first event has empty `state.input: {}`.**

`syncOcTools()` in `use-oc-chat-adapter.ts` (line 404-449) processes adapted tools:

1. **Event #1** (pending, `input: {}`): Tool is new (`prev === undefined`) → calls `startTool` with `toolInput: {}` (empty). Tool enters `activeTools` with empty input.

2. **Event #2** (running, `input: { todos: [...] }`): Tool already tracked (`prev === 'running'`), new status is still `'running'`. **No condition matches** — the function only handles `new tool` and `running→completed` transitions. toolInput stays `{}`.

3. **Event #3** (completed): `prev === 'running'`, `tool.status === 'success'` → calls `completeTool`. But `completeTool` (tool-store.ts:478) reads the existing tool from `activeTools` (still with `toolInput: {}`) and moves it to `completedTools`. **toolInput is never updated.**

TodoBar reads `toolInput['todos']` → `undefined` → `parseTodos(undefined)` → `[]` → returns null.

**After restart**: All tools arrive in `completed` state at once. `startTool` gets the full input on first encounter → TodoBar works.

## Fix

Two files. Add `updateToolInput` action to ToolStore and call it from `syncOcTools` before completing a tool.

### File 1: `apps/agent/src/stores/agent/tool-store.ts`

Add `updateToolInput` action (after `completeTool` at ~line 506):

```typescript
updateToolInput: (id: string, toolInput: Record<string, unknown>) => {
  set((state) => {
    const tool = state.activeTools[id];
    if (tool) {
      state.activeTools[id] = { ...tool, toolInput };
    }
  });
},
```

Whole-object replacement (`{ ...tool, toolInput }`) rather than `tool.toolInput = toolInput` to avoid the Immer nested mutation bug documented in memory.

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
  // after the initial pending event (which has empty input)
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

### Why this works

After the fix, the 3-event lifecycle:

1. Event #1 (pending): `startTool` with `toolInput: {}` — tool in `activeTools`
2. Event #2 (running): `updateToolInput` with `{ todos: [...] }` — tool now has correct data. TodoBar sees it in `activeTools` and renders.
3. Event #3 (completed): `updateToolInput` (same data, no-op). Then `completeTool` — reads updated tool from `activeTools`, moves to `completedTools` with correct `toolInput`.

The `updateToolInput` action is a no-op when the tool doesn't exist in `activeTools` (already completed), so calling it unconditionally is safe.

### Why not modify `completeTool` instead

`completeTool` is called from 3 places (Claude backend in `chat-message-service.ts`, OpenCode adapter, and orphan cleanup). Adding a `toolInput` parameter would require updating all callers. The separate `updateToolInput` action is OpenCode-only and keeps blast radius minimal.

## Files to Modify

| File                                               | Change                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/agent/src/stores/agent/tool-store.ts`        | Add `updateToolInput` action (~5 lines)                                   |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts` | Add to `SyncActions`, modify `syncOcTools` else branch, pass in useEffect |

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — ESLint passes
3. `bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts` — existing tests still pass
4. `bunx tauri dev` with OpenCode backend:
   - Send a message that triggers TodoWrite tool
   - Verify TodoBar appears in real-time above the chat input
   - Verify the todo items show correct content and status
   - Verify TodoBar persists after the tool completes
5. Switch to Claude SDK backend → verify TodoBar still works identically
6. Verify other tools (Read, Write, Edit, Bash) still sync correctly
