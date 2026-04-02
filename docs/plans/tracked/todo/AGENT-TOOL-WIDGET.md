# Plan: Agent Tool Widget — Proper Rendering for Subagent Tools

## Context

The Claude SDK's "Agent" tool (for spawning subagents) renders with the **GenericToolWidget** — showing a wrench icon and raw JSON dump — because `ToolWidgetRenderer.tsx` has `case 'task'` but no `case 'agent'`. The backend sends `tool_name: 'Agent'`, which lowercases to `'agent'` and falls through to the default case. The existing `TaskToolWidget` already exists and handles the same conceptual data, but it also has a bland collapsed state (just "Task" with no context).

**Goal:** Route `'agent'` tools to the TaskToolWidget AND redesign it to be polished, matching the quality of other widgets like BashToolWidget and WebSearchToolWidget.

---

## Changes

### 1. Enhance `task-tool-widget.tsx`

**File:** `apps/agent/src/components/chat/tools/task-tool-widget.tsx`

**Current issues:**

- No icon in the header (every other widget has one)
- Collapsed header only shows "Task" or "Running Task" — no context about what the agent is doing
- Missing `name` prop (Agent tool sends `name` field)
- Description prop exists but isn't shown in collapsed state

**Redesign:**

**Collapsed header** (single line, scannable):

```
[Bot icon] [description text] [type badge: Explore] [model badge: haiku] [status] [chevron]
```

- Use `Bot` icon from lucide-react (semantically correct for AI agent)
- Show `description` as the main text (truncated) — gives immediate context without expanding
- Show `subagentType` as a small inline badge (e.g., "Explore", "Plan")
- Show `model` as a secondary badge if present
- Standard status indicators (Loader2 spinner when running, XCircle on failure)
- Standard ChevronRight with rotate-90 on expand

**Expanded content** (bordered card, consistent with all other widgets):

```
┌──────────────────────────────────────────┐
│ [agent label] [Explore badge] [(haiku)]  │
│ [prompt label]                           │
│ [prompt text, line-clamp-3, 300 chars]   │
├──────────────────────────────────────────┤
│ [output section]                         │
│ [Streamdown markdown OR spinner OR done] │
└──────────────────────────────────────────┘
```

**Props changes:**

- Add `name?: string` prop (from Agent tool's `name` field)
- Keep all existing props: `toolId`, `description`, `prompt`, `subagentType`, `model`, `output`, `isRunning`, `success`

**Reuse existing patterns from the codebase:**

- `useToolWidgetExpanded(toolId)` from `./shared`
- Animation constants: `TOOL_EXPAND_ENTER`, `TOOL_EXPAND_EXIT`, `TOOL_EXPAND_TRANSITION_NONE`
- `useReducedMotion()` from `motion/react`
- `cn()` from `@/lib/utils`
- `Streamdown` + `remarkGfm` for markdown output (already imported)
- `parseTaskOutput()` helper (already exists, extracts text from JSON content blocks)

### 2. Route `'agent'` in `ToolWidgetRenderer.tsx`

**File:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Add `case 'agent':` right next to `case 'task':` that extracts the same fields plus `name`:

```typescript
case 'agent':
case 'task':
  return (
    <TaskToolWidget
      toolId={tool.id}
      name={getStringInput(tool, 'name', '') || undefined}
      description={getStringInput(tool, 'description', '')}
      prompt={getStringInput(tool, 'prompt', '')}
      subagentType={getStringInput(tool, 'subagent_type', 'general-purpose')}
      model={getStringInput(tool, 'model', '') || undefined}
      output={statusProps.output}
      isRunning={statusProps.isRunning}
      success={statusProps.success}
    />
  );
```

No other files need changes — barrel export already includes `TaskToolWidget`.

---

## Verification

1. `bun run typecheck` — ensure no type errors from new prop
2. `bun run lint` — ensure ESLint passes with zero warnings
3. Visual test: `bunx tauri dev` → trigger an agent tool (plan mode or ask Claude to use a subagent) → verify:
   - Collapsed header shows description + type badge + Bot icon
   - Expanding shows prompt + output with proper markdown rendering
   - Running state shows spinner
   - Failed state shows XCircle + opacity reduction
   - Animation matches other tool widgets
