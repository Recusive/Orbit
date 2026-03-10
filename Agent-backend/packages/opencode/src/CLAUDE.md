# src

> **Path:** `Agent-backend/packages/opencode/src/`

## Purpose

Root source directory for the OpenCode core engine — the heart of the entire system. Contains 40+ subdirectories covering the CLI, API server, agent orchestration, 30+ built-in tools, 20+ LLM providers, session management, MCP, permissions, plugins, skills, storage, and the full TUI application. Every subdirectory has its own CLAUDE.md with detailed documentation.

## Usage Status

| Product             | Status   | Notes                                      |
| ------------------- | -------- | ------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Core engine consumed via HTTP + SSE server |
| Orbit CLI           | `active` | Core engine with rebranded CLI entry point |

## Subdirectory Map

| Directory        | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `acp/`           | Agent Client Protocol server (Zed integration)    |
| `agent/`         | Built-in agent definitions (build, plan, explore) |
| `auth/`          | Credential storage (OAuth, API key)               |
| `bun/`           | Bun process runner and npm installer              |
| `bus/`           | Internal pub/sub event bus                        |
| `cli/`           | CLI infrastructure + 20+ commands + full TUI      |
| `command/`       | Slash-command system                              |
| `config/`        | Multi-layer config loading (JSONC)                |
| `control/`       | Control plane account management                  |
| `control-plane/` | Multi-workspace orchestration                     |
| `env/`           | Environment variable management                   |
| `file/`          | File system operations + ripgrep search           |
| `flag/`          | Feature flags                                     |
| `format/`        | Auto-formatting integration                       |
| `global/`        | XDG-based global paths                            |
| `id/`            | Monotonic ID generation                           |
| `ide/`           | IDE detection                                     |
| `installation/`  | Version management + self-upgrade                 |
| `lsp/`           | Language Server Protocol client                   |
| `mcp/`           | Model Context Protocol client                     |
| `patch/`         | Structured patch parsing                          |
| `permission/`    | Tool permission system                            |
| `plugin/`        | Plugin loading and execution                      |
| `project/`       | Git-based project detection                       |
| `provider/`      | Provider-agnostic LLM integration (20+ providers) |
| `pty/`           | Pseudo-terminal management                        |
| `question/`      | Agent-to-user question system                     |
| `scheduler/`     | Interval-based task scheduler                     |
| `server/`        | Hono HTTP + SSE API server                        |
| `session/`       | Session lifecycle + LLM orchestration             |
| `share/`         | Session sharing                                   |
| `shell/`         | Shell detection                                   |
| `skill/`         | Custom skill/command discovery                    |
| `snapshot/`      | Git-based file snapshots for revert               |
| `storage/`       | SQLite via Drizzle ORM                            |
| `tool/`          | 30+ built-in tools (.ts + .txt prompt pairs)      |
| `util/`          | 28 shared utility modules                         |
| `worktree/`      | Git worktree management                           |

## Notes

- **Entry point:** `index.ts` — yargs CLI with 20+ commands, SQLite migration on first run
- **Already rebranded:** `scriptName("orbit")` and `"orbit": "./bin/opencode"` in package.json
- See `packages/opencode/CLAUDE.md` for build commands, testing, and architecture overview
