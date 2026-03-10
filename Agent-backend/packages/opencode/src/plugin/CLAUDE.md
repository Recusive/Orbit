# plugin

> **Path:** `Agent-backend/packages/opencode/src/plugin/`

## Purpose

Plugin loading and execution system. Loads internal plugins (Codex auth, Copilot auth, GitLab auth), npm-published plugins (installed via Bun at runtime), and file-based plugins. Plugins can provide auth methods, event hooks, tools, and config hooks. The built-in `opencode-anthropic-auth` plugin is loaded by default.

## Usage Status

| Product             | Status   | Notes                                                        |
| ------------------- | -------- | ------------------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Plugin hooks for auth, permissions, events, and custom tools |
| Orbit CLI           | `active` | Plugin hooks for auth, permissions, events, and custom tools |

## Key Files

| File         | Purpose                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `index.ts`   | `Plugin` namespace -- plugin lifecycle (load, init), hook triggering, npm plugin installation via BunProc |
| `codex.ts`   | `CodexAuthPlugin` -- built-in OpenAI/Codex authentication plugin                                          |
| `copilot.ts` | `CopilotAuthPlugin` -- built-in GitHub Copilot authentication plugin                                      |
