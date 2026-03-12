# Fix: TodoBar flicker on consecutive TodoWrite calls

## Context

The `updateToolInput` fix (from `fix-opencode-todobar-realtime.md`) works — TodoBar now appears in real-time. But when a **second** TodoWrite tool fires (e.g., "mark first 2 complete"), the TodoBar **hides then reappears** because:

1. Second TodoWrite Event #1 arrives with `toolInput: {}` → `startTool` adds it to `activeTools` with empty input
2. TodoBar at line 181 unconditionally prefers `latestActive` over `latestCompleted`
3. Active tool has `toolInput['todos']` = `undefined` → `parseTodos(undefined)` → `[]` → component returns `null`
4. ~100ms later, Event #2 populates the input → TodoBar reappears

## Fix

### File 1: `apps/agent/src/components/chat/input/todo-bar.tsx`

**Step A**: Add a `hasTodoPayload` type guard near `parseTodos` (~line 56):

```typescript
/** Whether a tool carries a `todos` key at all — distinguishes "not yet received" from "intentionally empty." */
function hasTodoPayload(tool: ToolExecution | null): boolean {
  return (
    tool !== null &&
    Object.prototype.hasOwnProperty.call(tool.toolInput, 'todos') &&
    tool.toolInput['todos'] !== undefined
  );
}
```

**Step B**: Extract the selection logic into an exported pure helper (near `hasTodoPayload`):

```typescript
/**
 * Resolve which ToolExecution to display in the TodoBar.
 *
 * Prefer the latest active tool once it carries a todo payload. Until then,
 * keep showing the latest completed snapshot to avoid flicker during the
 * empty-input → populated-input transition window (~100ms).
 *
 * `todos: []` is a valid payload (intentional clear) — only the *absence*
 * of the `todos` key triggers fallback.
 */
export function resolveLatestTodoExecution(
  latestActive: ToolExecution | null,
  latestCompleted: ToolExecution | null
): ToolExecution | null {
  if (latestActive === null) return latestCompleted;
  return hasTodoPayload(latestActive) ? latestActive : (latestCompleted ?? latestActive);
}
```

**Step C**: Replace line 180-181 inside `useMemo`:

```typescript
// Before:
// Prefer active (real-time updates) over completed
const latest = latestActive ?? latestCompleted;

// After:
// Prefer active once it carries a todo payload; fall back to completed
// to avoid flicker during the empty-input → populated-input transition.
const latest = resolveLatestTodoExecution(latestActive, latestCompleted);
```

**Step D**: Update the comment at lines 141-146 to match the new behavior:

```typescript
// Before:
// Active tool takes priority over completed (it has the most current state).

// After:
// Active tool takes priority once its todo payload arrives. Until then,
// keep the latest completed snapshot visible to avoid flicker.
```

### Behavior after fix

| Scenario                                   | Active tool             | Completed tool      | Selection                  | TodoBar                                     |
| ------------------------------------------ | ----------------------- | ------------------- | -------------------------- | ------------------------------------------- |
| First TodoWrite Event #1 (empty `{}`)      | no `todos` key          | none                | active (no payload → null) | Hidden (correct — nothing to show)          |
| First TodoWrite Event #2 (populated)       | `{todos: [...]}`        | none                | active                     | Shows                                       |
| First TodoWrite completed                  | none                    | `{todos: [...]}`    | completed                  | Shows                                       |
| Second TodoWrite Event #1 (empty `{}`)     | no `todos` key          | `{todos: [...]}`    | **completed**              | **Stays visible** (no flicker)              |
| Second TodoWrite Event #2 (populated)      | `{todos: [updated...]}` | `{todos: [old...]}` | active                     | Shows new data                              |
| Intentional clear (`todos: []`)            | `{todos: []}`           | `{todos: [...]}`    | **active**                 | Hidden (correct — `parseTodos([])` → `[]`)  |
| Malformed entries filtered by `parseTodos` | `{todos: [{bad}]}`      | `{todos: [...]}`    | **active**                 | Hidden (active has payload, parsed to `[]`) |

### Why payload presence, not array length

`todos: []` is a valid payload — it means "intentionally clear the list." Using `length > 0` would keep stale completed todos visible instead of hiding the bar. The `hasTodoPayload` guard checks whether the `todos` key exists at all, which correctly distinguishes:

- **Absent** (`toolInput: {}`) → Event #1 hasn't populated yet → fall back to completed
- **Present but empty** (`{todos: []}`) → intentional clear → active wins, `parseTodos` returns `[]`, bar hides
- **Present with items** (`{todos: [...]}`) → active wins, bar shows

### File 2: `apps/agent/src/__tests__/unit/components/chat/input/todo-bar.test.ts` (new)

Test the extracted `resolveLatestTodoExecution` helper directly (pure function, no render needed):

```typescript
import { resolveLatestTodoExecution } from '@/components/chat/input/todo-bar';

import type { ToolExecution } from '@/stores/agent/tool-store';

function makeTool(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: 'tool-1',
    messageId: 'msg-1',
    toolName: 'TodoWrite',
    toolInput: {},
    status: 'running',
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('resolveLatestTodoExecution', () => {
  it('returns completed when no active tool exists', () => {
    const completed = makeTool({
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'pending' }] },
    });
    expect(resolveLatestTodoExecution(null, completed)).toBe(completed);
  });

  it('returns null when neither active nor completed exist', () => {
    expect(resolveLatestTodoExecution(null, null)).toBeNull();
  });

  it('returns active when it has a populated todo payload', () => {
    const active = makeTool({ toolInput: { todos: [{ content: 'A', status: 'pending' }] } });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'Old', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(active);
  });

  it('falls back to completed when active has no todos key (empty input)', () => {
    const active = makeTool({ toolInput: {} });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(completed);
  });

  it('does NOT fall back when active has an intentionally empty todos array', () => {
    const active = makeTool({ toolInput: { todos: [] } });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'Stale', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(active);
  });

  it('returns active when active has no todos key and no completed exists', () => {
    const active = makeTool({ toolInput: {} });
    expect(resolveLatestTodoExecution(active, null)).toBe(active);
  });

  it('falls back to completed when todos key exists but value is undefined', () => {
    const active = makeTool({ toolInput: { todos: undefined } });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'pending' }] },
    });
    // undefined value → hasTodoPayload returns false → falls back to completed
    expect(resolveLatestTodoExecution(active, completed)).toBe(completed);
  });
});
```

## Files to Modify

| File                                                                   | Change                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/input/todo-bar.tsx`                    | Add `hasTodoPayload` guard + extract `resolveLatestTodoExecution` helper + update selection + update comments |
| `apps/agent/src/__tests__/unit/components/chat/input/todo-bar.test.ts` | New test file for `resolveLatestTodoExecution` (7 cases)                                                      |

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — ESLint passes
3. `bun run test -- apps/agent/src/__tests__/unit/components/chat/input/todo-bar.test.ts` — all 7 tests pass
4. `bunx tauri dev` with OpenCode backend:
   - Send a message that triggers TodoWrite (e.g., "create a 5-step plan")
   - TodoBar appears in real-time ✓
   - Send a follow-up that triggers another TodoWrite (e.g., "mark first 2 complete")
   - TodoBar stays visible during the transition — no hide/reappear flicker ✓
   - Final state shows updated todos ✓
5. Verify Claude backend: TodoBar still works identically (session matching allows `sessionId === undefined`)
