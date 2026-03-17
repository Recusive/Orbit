# Plan: End-to-End Plan Mode for OpenCode Backend

## Context

OpenCode's plan mode doesn't produce the structured file→review→accept flow that Claude Code does. When using the OpenCode backend in Orbit, the plan agent just responds inline with text instead of writing a `.md` plan file and calling `plan_exit` for structured review. The user must manually switch from plan→build and tell the agent to implement.

**Root causes:**

1. `PlanExitTool` is double-gated in `registry.ts:131`: requires `OPENCODE_EXPERIMENTAL_PLAN_MODE=true` AND `OPENCODE_CLIENT === "cli"`. Orbit's Tauri sidecar sets neither flag.
2. Without the experimental flag, `insertReminders()` in `prompt.ts` falls back to the old `PROMPT_PLAN` (plan.txt) which just says "be read-only" — no instruction to write a plan file or call `plan_exit`.
3. Frontend `ToolWidgetRenderer.tsx:78` only detects `/.claude/plans/` paths, not `.orbit/plans/` or `~/.local/share/orbit/plans/`.

**Goal:** Make OpenCode plan mode work identically to Claude Code — agent writes a `.md` plan file, calls `plan_exit`, frontend renders plan as a rich markdown preview with accept/reject/refine flow.

## Changes

### 1. Engine: Remove client gate on PlanExitTool

**File:** `Agent-backend/packages/opencode/src/tool/registry.ts` (line 131)

Change:

```typescript
...(Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE && Flag.OPENCODE_CLIENT === "cli" ? [PlanExitTool] : []),
```

To:

```typescript
...(Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE ? [PlanExitTool] : []),
```

**Why:** `PlanExitTool` should be available for all clients (cli, app, desktop) when plan mode is enabled. The `OPENCODE_CLIENT === "cli"` gate was likely a development safeguard — the tool's Question-based approval works across all frontends via the existing `OcQuestionCard` component.

### 2. Tauri: Enable experimental plan mode when spawning sidecar

**File:** `src-tauri/src/commands/opencode/lifecycle.rs` (lines 96-101)

Change the `Command::new` to include environment variables:

```rust
let mut child = Command::new(&binary_path)
    .args(["serve", "--port", &port.to_string()])
    .env("OPENCODE_EXPERIMENTAL_PLAN_MODE", "true")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|error| format!("Failed to spawn OpenCode: {error}"))?;
```

**Why:** This enables the 5-phase plan workflow in `insertReminders()` and registers the `PlanExitTool`. The experimental plan mode prompt is well-structured (identical to Claude Code's plan workflow) and ready for production use.

### 3. Frontend: Detect OpenCode plan file paths in ToolWidgetRenderer

**File:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx` (lines 76-88)

Change:

```typescript
if (filePath.includes('/.claude/plans/') || filePath.includes('\\.claude\\plans\\')) {
```

To:

```typescript
if (
  filePath.includes('/.claude/plans/') || filePath.includes('\\.claude\\plans\\') ||
  filePath.includes('/.orbit/plans/') || filePath.includes('\\.orbit\\plans\\') ||
  filePath.includes('/orbit/plans/') // catches ~/.local/share/orbit/plans/
) {
```

**Why:** OpenCode writes plan files to `.orbit/plans/{timestamp}-{slug}.md` (in git repos) or `~/.local/share/orbit/plans/{timestamp}-{slug}.md` (outside git). Both paths need to route to `PlanToolWidget` for the rich markdown preview with "Ready for review" status.

## What Already Works (No Changes Needed)

These components are already wired up correctly:

| Component                                | Location                                                    | Status                                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| **OC Agent picker** (build/plan/explore) | `apps/agent/src/components/chat/input/InputControls.tsx`    | Working — cycles between agents               |
| **Agent param in messages**              | `use-oc-chat-adapter.ts:576` → `oc-session-service.ts:129`  | Working — passes `agent: "plan"`              |
| **Question card UI**                     | `apps/agent/src/components/chat/input/OcQuestionCard.tsx`   | Working — renders yes/no for `plan_exit`      |
| **Plan agent definition**                | `Agent-backend/.../agent/agent.ts:98-120`                   | Working — read-only with plan file exceptions |
| **5-phase workflow prompt**              | `Agent-backend/.../session/prompt.ts:1432-1565`             | Working — just needs the flag enabled         |
| **Plan file path generation**            | `Agent-backend/.../session/index.ts:349-354`                | Working — `Session.plan()`                    |
| **PlanToolWidget**                       | `apps/agent/src/components/chat/tools/plan-tool-widget.tsx` | Working — markdown preview with Streamdown    |
| **Permission system**                    | `Agent-backend/.../permission/next.ts`                      | Working — plan agent can only edit plan files |

## End-to-End Flow After Changes

```
1. User clicks "Plan" in InputControls → selectedAgent = "plan"
2. User sends message → POST /:sessionID/message { agent: "plan", ... }
3. insertReminders() detects entering plan mode → injects 5-phase workflow prompt
4. Plan agent explores codebase (read-only tools)
5. Plan agent writes plan to .orbit/plans/{timestamp}-{slug}.md (write tool)
6. Frontend: ToolWidgetRenderer detects .orbit/plans/ → renders PlanToolWidget
   → Shows plan as formatted markdown with "Ready for review" status
7. Plan agent calls plan_exit tool
8. Frontend: OcQuestionCard appears → "Switch to build agent and start implementing?"
9. User clicks "Yes" → Question.reply() resolves
10. plan_exit creates synthetic user message with agent: "build"
    → Text: "The plan at {path} has been approved. Execute the plan"
11. Build agent processes next → full edit access → implements the plan
```

## Verification

1. **Build the sidecar:** `bun run build:opencode` (from monorepo root)
2. **Start Tauri:** `bunx tauri dev`
3. **Switch to OpenCode backend** in Settings
4. **Select "Plan" agent** in the input controls (click the agent mode button)
5. **Send a message** like "Plan how to add a dark mode toggle"
6. **Verify:** Agent should research (read-only), write a `.md` plan file (rendered as PlanToolWidget), then call `plan_exit` showing the question card
7. **Click "Yes"** → Agent should switch to build mode and begin implementation
8. **Click "No"** → Agent should stay in plan mode for refinement

### Edge cases to test:

- Sending another message while still in plan mode (should continue planning)
- Switching from plan back to build manually via the agent picker
- Plan mode with a non-git directory (plan file goes to `~/.local/share/orbit/plans/`)
