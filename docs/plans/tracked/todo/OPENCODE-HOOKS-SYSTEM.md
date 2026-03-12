# Plan: Claude Code SDK-Compatible Hooks System for OpenCode Backend

## Context

Orbit supports two backends: **Agent Bridge** (Claude Agent SDK) and **Agent-backend** (OpenCode fork). Agent Bridge already has the full hooks system internally via the SDK. OpenCode has a plugin system with 17 hook points, but these are in-process mutate-in-place callbacks — they cannot return decisions (allow/deny/modify) or spawn external processes with JSON I/O.

**The goal:** Build the Claude Code SDK hooks contract natively inside OpenCode so that any feature requiring hooks (security guardrails, auto-approval, audit logging, input rewriting) works identically regardless of which backend is active. The Claude Code SDK hook spec IS the contract — same event names, same JSON I/O format, same exit code semantics.

**What we're NOT touching:** Agent Bridge, the existing Plugin system, or any frontend code.

---

## New Files

### 1. `packages/opencode/src/hook/types.ts` — Event & output schemas

Zod schemas matching Claude Code SDK's JSON stdin/stdout format exactly:

- **12 event input types:** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `Notification`, `PreCompact`
- **Common fields** (all events): `session_id`, `cwd`, `hook_event_name`
- **HookOutput schema:** `continue?`, `stopReason?`, `systemMessage?`, `decision?` ("block"), `reason?`, `hookSpecificOutput?` (`permissionDecision`, `permissionDecisionReason`, `updatedInput`, `additionalContext`)
- **HookHandler schema:** `{ matcher?, command, timeout?, async? }`
- **HooksConfig schema:** `Record<HookEventName, HookHandler[]>`

### 2. `packages/opencode/src/hook/command-hook.ts` — Shell command executor

Spawns hook command, pipes JSON to stdin, reads JSON from stdout, interprets exit codes.

- Use `Bun.spawn()` (following OpenCode's Bun-native patterns) with `stdin: "pipe"`, `stdout: "pipe"`, `stderr: "pipe"`
- Write serialized JSON input to stdin, close stdin
- Apply timeout via `setTimeout` + process kill
- **Exit code contract (matches Claude Code SDK exactly):**
  - `0` → parse stdout JSON via `HookOutput.safeParse()`. Invalid JSON = empty response (continue)
  - `2` → blocking deny. Return `{ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: stderr } }`
  - Other → non-blocking error. Log warning, return empty (continue)
- Set `CLAUDE_PROJECT_DIR` env var (Claude Code SDK compat)
- Never let a hook crash the agent — all errors caught and logged

### 3. `packages/opencode/src/hook/dispatcher.ts` — Matcher + dispatch engine

Core dispatch function: `dispatch(event, input, matcherQuery?) → Promise<HookOutput>`

- Read hooks config from `Config.get()` (already cached + hot-reloaded)
- For each matcher group under the event name:
  - If `matcher` regex defined AND `matcherQuery` provided → `new RegExp(matcher).test(matcherQuery)`, skip on no match
  - Execute each hook command sequentially (Claude Code fires in order, not parallel)
- **Aggregation with priority semantics:**
  - `permissionDecision`: deny > ask > allow (deny from ANY hook = deny)
  - `updatedInput`: last hook's value wins
  - `additionalContext`: concatenated across hooks
  - `systemMessage`: concatenated across hooks
  - `continue: false` from any hook = stop
- Short-circuit on `permissionDecision: "deny"` (don't run remaining hooks)
- Log via `Log.create({ service: "hook" })`

### 4. `packages/opencode/src/hook/index.ts` — Public API

```typescript
export namespace Hook {
  export async function dispatch(event, input, matcherQuery?): Promise<HookOutput>;
  export function hasHooks(event: HookEventName): boolean; // fast check
}
```

No `Instance.state()` needed — hooks are stateless config-driven commands. Config is already lazy-cached by the Config module.

---

## Modified Files

### 5. `packages/opencode/src/config/config.ts` — Add `hooks` field

**Location:** Line ~1182, before `.strict()` on `Config.Info`

Add one field + one import:

```typescript
hooks: HooksConfig.optional().describe("Claude Code SDK-compatible hooks"),
```

This is a ~2 line change. The `.strict()` on Config.Info means we MUST add the field or configs with `hooks` will fail validation.

### 6. `packages/opencode/src/session/prompt.ts` — 6 hook dispatch points

**6a. PreToolUse** — inside `resolveTools()` execute wrapper (~line 843)

Insert BEFORE `Plugin.trigger("tool.execute.before")` and BEFORE `item.execute()`:

```
Hook.dispatch("PreToolUse", { tool_name, tool_input, tool_use_id, ... }, item.id)
→ if permissionDecision === "deny" → throw PermissionNext.DeniedError(...)
→ if permissionDecision === "allow" → skip ctx.ask() (auto-approve)
→ if updatedInput → rewrite args before execute
→ if continue === false → throw Error(stopReason)
```

**Important:** Must also wrap the `ctx.ask()` call so it's skippable when hook allows. Currently `ctx.ask()` is defined in `context()` at line 825 — the hook result needs to be accessible inside the execute wrapper to conditionally skip it. Pass a flag or restructure the permission check.

Same pattern for MCP tools at lines 888-908.

**6b. PostToolUse** — after tool execution (~line 866)

Insert AFTER `Plugin.trigger("tool.execute.after")`:

```
Hook.dispatch("PostToolUse", { tool_name, tool_input, tool_response, ... }, item.id)
→ if additionalContext → append to output.output
```

Same for MCP tools at line 928.

**6c. UserPromptSubmit** — top of `prompt()` function (~line 175)

Insert AFTER `createUserMessage()` (line 180), BEFORE `loop()`:

```
Hook.dispatch("UserPromptSubmit", { prompt: extractTextFromParts(input.parts), ... })
→ if decision === "block" → return message early (don't enter loop)
→ if continue === false → return early
```

**6d. Stop** — end of loop when model finishes (~line 741-755)

Insert when `modelFinished && !processor.message.error`:

```
Hook.dispatch("Stop", { stop_hook_active: false, last_assistant_message: ... })
→ if decision === "block" → continue loop instead of breaking
```

Must track `stop_hook_active` flag to prevent infinite loops (if Stop hook always blocks).

**6e. SubagentStart** — before subtask execution (~line 451)

Insert BEFORE `Plugin.trigger("tool.execute.before")` for tasks:

```
void Hook.dispatch("SubagentStart", { agent_id: part.id, agent_type: task.agent }, task.agent)
```

Fire-and-forget (observational).

**6f. SubagentStop** — after subtask execution (~line 500)

Insert AFTER `Plugin.trigger("tool.execute.after")` for tasks:

```
void Hook.dispatch("SubagentStop", { agent_id: part.id, agent_type: task.agent }, task.agent)
```

Fire-and-forget (observational).

### 7. `packages/opencode/src/session/processor.ts` — PostToolUseFailure

**Location:** `tool-error` case (~line 224)

Insert AFTER the existing error handling logic:

```
void Hook.dispatch("PostToolUseFailure", {
  tool_name: /* from toolcalls map */,
  tool_input: value.input,
  error: value.error message,
  is_interrupt: value.error instanceof RejectedError,
}, /* tool_name */)
```

Fire-and-forget (observational).

### 8. `packages/opencode/src/permission/next.ts` — PermissionRequest

**Location:** Inside `ask()`, in the `action === "ask"` branch (~line 146), BEFORE `Bus.publish(Event.Asked, info)`

```
Hook.dispatch("PermissionRequest", { tool_name: request.permission, tool_input: request.metadata, ... }, request.permission)
→ if permissionDecision === "allow" → return (auto-approve, skip Bus.publish)
→ if permissionDecision === "deny" → throw DeniedError(...)
→ otherwise → fall through to normal "ask" flow (Bus.publish → user prompt)
```

This is the most impactful integration: hooks can auto-approve or auto-deny at the permission layer before the user is ever prompted.

### 9. `packages/opencode/src/session/compaction.ts` — PreCompact

**Location:** Top of `process()` function (~line 112)

```
Hook.dispatch("PreCompact", { trigger: input.auto ? "auto" : "manual" }, input.auto ? "auto" : "manual")
→ if continue === false → return "stop" (block compaction)
```

### 10. `packages/opencode/src/session/index.ts` — SessionStart

**Location:** Inside `createNext()`, after the session is inserted into DB

```
void Hook.dispatch("SessionStart", { source: input.parentID ? "resume" : "startup" })
```

Fire-and-forget.

---

## Implementation Order

| Step | File                        | Type   | Effort                                                              |
| ---- | --------------------------- | ------ | ------------------------------------------------------------------- |
| 1    | `src/hook/types.ts`         | New    | Zod schemas — foundational, everything depends on this              |
| 2    | `src/hook/command-hook.ts`  | New    | Process spawner with JSON I/O                                       |
| 3    | `src/hook/dispatcher.ts`    | New    | Matcher + sequential dispatch + aggregation                         |
| 4    | `src/hook/index.ts`         | New    | Namespace re-export                                                 |
| 5    | `src/config/config.ts`      | Modify | Add `hooks` field to Config.Info (~2 lines)                         |
| 6    | `src/session/prompt.ts`     | Modify | PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStart/Stop |
| 7    | `src/permission/next.ts`    | Modify | PermissionRequest integration                                       |
| 8    | `src/session/processor.ts`  | Modify | PostToolUseFailure integration                                      |
| 9    | `src/session/compaction.ts` | Modify | PreCompact integration                                              |
| 10   | `src/session/index.ts`      | Modify | SessionStart integration                                            |

---

## Key Design Decisions

1. **Hooks run BEFORE Plugin.trigger()** at the tool level — hooks are the first gate, matching Claude Code SDK semantics
2. **Denial throws `PermissionNext.DeniedError`** — leverages existing error propagation through AI SDK stream → `tool-error` event → processor handling
3. **No Instance.state()** — hooks are stateless (commands spawn fresh each time). Config is already cached
4. **Config hot-reload for free** — `Config.get()` is already file-watched and hot-reloaded
5. **Sequential execution** — multiple hooks fire in array order (not parallel), matching Claude Code SDK
6. **Fire-and-forget for observational hooks** — SessionStart, SessionEnd, SubagentStart/Stop, PostToolUseFailure, Notification are `void`-ed (don't block the pipeline)

---

## Config Format

In `opencode.jsonc` (project or global):

```jsonc
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "command": ".orbit/hooks/block-rm.sh", "timeout": 30 },
      { "matcher": "Write|Edit", "command": "python3 ./scripts/file-guard.py" },
    ],
    "PostToolUse": [
      { "command": "./scripts/audit-logger.sh" }, // no matcher = fires for all tools
    ],
    "Stop": [{ "command": "./scripts/verify-tests.sh" }],
  },
}
```

Hook scripts receive JSON on stdin and return JSON on stdout — identical format to Claude Code SDK shell command hooks. A script written for `claude` CLI works with `orbit` CLI with zero changes.

---

## Verification

1. **Unit tests** (`test/hook/`):
   - `command-hook.test.ts` — test exit code 0/2/other handling, JSON parsing, timeout
   - `dispatcher.test.ts` — test matcher regex, aggregation, deny priority, short-circuit
2. **Integration test**:
   - Configure a PreToolUse hook in test config that blocks `Bash` commands containing "rm -rf"
   - Send a prompt that triggers a Bash tool call with "rm -rf"
   - Verify the tool is blocked and the model receives the deny reason
3. **Manual verification**:
   - `cd Agent-backend && bun dev serve`
   - Add hooks to `opencode.jsonc`
   - Send messages via the SDK/API and verify hooks fire (check logs with `--debug`)
4. **Type checking**: `cd packages/opencode && bun run typecheck`
5. **Existing tests pass**: `cd packages/opencode && bun test --timeout 30000`
