# composer

> **Path:** `Agent-backend/packages/app/src/pages/session/composer/`

## Purpose

The bottom dock area of the session view — handles when the agent is blocked waiting for user input (permission requests, questions, todos). Contains a state machine that detects the blocked state and renders the appropriate dock UI.

## Usage Status

| Product             | Status      | Notes                                                                                                                                   |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Permission dock, question dock, and blocked-state detection patterns directly inform Orbit's tool approval and interactive question UIs |
| Orbit CLI           | `not used`  | CLI TUI handles permissions differently                                                                                                 |

## When to Reference This

| If you're building...                                    | Read this file                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| **"Agent is blocked" detection**                         | `session-composer-state.ts` → `createSessionComposerBlocked()` |
| **Permission request UI** (Allow Once / Always / Reject) | `session-permission-dock.tsx`                                  |
| **Agent question UI** with freeform text input           | `session-question-dock.tsx`                                    |
| **Todo checklist UI**                                    | `session-todo-dock.tsx`                                        |
| **Extracting next pending request** from arrays          | `session-request-tree.ts` (pure logic, no SolidJS)             |
| **Auto-dismiss dock** after resolution                   | `session-composer-state.ts` → `closeMs` timer pattern          |

## Notes

- `session-request-tree.ts` is **pure logic** — directly portable to React
- `session-composer-state.ts` has portable logic wrapped in SolidJS reactivity — the blocked detection algorithm (`!!permissionRequest || !!questionRequest`) is trivial to reimplement
- Orbit already has permission approval UI — reference this for question dock and todo dock patterns
