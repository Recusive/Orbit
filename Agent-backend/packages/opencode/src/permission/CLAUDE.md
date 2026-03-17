# permission

> **Path:** `Agent-backend/packages/opencode/src/permission/`

## Purpose

Tool permission system controlling what the agent can do without user approval. Supports three response modes: `once` (allow this call), `always` (allow matching pattern for session), and `reject`. Permissions can be pre-configured via rules (allow/deny/ask per pattern) or prompted interactively. Includes bash command arity parsing for permission pattern generation.

## Usage Status

| Product             | Status   | Notes                                                      |
| ------------------- | -------- | ---------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Permission prompts surfaced via SSE events to the frontend |
| Orbit CLI           | `active` | Interactive permission prompts in the TUI                  |

## Key Files

| File       | Purpose                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Permission` namespace -- legacy permission system with `ask()`, `respond()`, wildcard pattern matching, pending/approved state per session                           |
| `next.ts`  | `PermissionNext` namespace -- next-gen rule-based permission system with configurable rulesets (allow/deny/ask per pattern), database persistence                     |
| `arity.ts` | `BashArity` namespace -- command arity dictionary for extracting "human-understandable command" from bash invocations (e.g., `git checkout` from `git checkout main`) |
