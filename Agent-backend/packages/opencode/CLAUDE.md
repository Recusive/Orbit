# packages/opencode

> **Path:** `Agent-backend/packages/opencode/`

## Purpose

The heart of OpenCode — CLI, headless API server, agent orchestration, LLM provider integration, built-in tools, MCP support, session management, permission system, and terminal UI. This is the single most important package for Orbit. It runs as a headless HTTP + SSE server that both the web UI and desktop app connect to.

## Usage Status

| Product             | Status   | Notes                                                                                                                                                                                                   |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Orbit's Agent-backend IS this package. The HTTP server (`serve` command) replaces the existing agent-bridge sidecar. All agent logic, tool execution, provider management, and session state live here. |
| Orbit CLI           | `active` | The CLI (`orbit` binary) is this package compiled to a standalone executable. TUI mode, headless mode, and all subcommands ship directly.                                                               |

## Key Files

| File                | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `src/index.ts`      | CLI entry point — yargs with 20+ commands, database migration on first run, SIGHUP handling |
| `package.json`      | `opencode` / `orbit` — dual binary names, 20+ AI SDK providers, Drizzle ORM, Hono server    |
| `AGENTS.md`         | Database guide — Drizzle schema conventions, migration generation                           |
| `bin/opencode`      | Shell script entry point (runs `bun src/index.ts`)                                          |
| `drizzle.config.ts` | Drizzle Kit config — schema from `src/**/*.sql.ts`, output to `migration/`                  |
| `parsers-config.ts` | Tree-sitter parser configuration for syntax-aware operations                                |
| `Dockerfile`        | Container build for the CLI                                                                 |
| `bunfig.toml`       | Bun configuration for this package                                                          |

## Source Architecture (`src/`)

### Agent System

| Directory        | Purpose                              | Key Files                                                                   |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `agent/`         | Agent definitions and system prompts | `agent.ts` (build + plan agents), `prompt/` (agent prompts), `generate.txt` |
| `control/`       | Agent execution control flow         | Single module                                                               |
| `control-plane/` | Multi-workspace orchestration        | `workspace.ts`, `workspace-server/`, `sse.ts`, `types.ts`, `adaptors/`      |
| `scheduler/`     | Task scheduling                      | Single module                                                               |

### CLI & UI

| Directory      | Purpose                         | Key Files                                                                                                                                                                                                           |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/cmd/`     | 20+ CLI commands                | `run.ts` (default TUI), `serve.ts` (headless server), `web.ts`, `auth.ts`, `mcp.ts`, `agent.ts`, `models.ts`, `upgrade.ts`, `export.ts`, `import.ts`, `github.ts`, `pr.ts`, `session.ts`, `db.ts`, `debug/`, `tui/` |
| `cli/cmd/tui/` | Terminal UI (SolidJS + opentui) | `component/` (prompt, workspace), `routes/` (session), `context/` (theme), `ui/`, `util/`, `attach.ts`, `thread.ts`                                                                                                 |
| `cli/`         | CLI infrastructure              | `ui.ts` (logo, spinners), `error.ts` (error formatting)                                                                                                                                                             |

### Server (HTTP + SSE)

| Directory        | Purpose                       | Key Files                                                                                                                                                                       |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`        | Hono-based API server         | `server.ts` (main), `event.ts` (SSE), `error.ts`, `mdns.ts` (mDNS discovery)                                                                                                    |
| `server/routes/` | API route handlers (13 files) | `session.ts`, `permission.ts`, `question.ts`, `file.ts`, `pty.ts`, `mcp.ts`, `provider.ts`, `config.ts`, `project.ts`, `workspace.ts`, `global.ts`, `tui.ts`, `experimental.ts` |

### Session & Conversation

| Directory   | Purpose                             | Key Files                                                                                                                                                                                                                                                               |
| ----------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session/`  | Session lifecycle and messaging     | `index.ts`, `llm.ts` (LLM calls), `message.ts` + `message-v2.ts`, `processor.ts`, `prompt/` + `prompt.ts`, `system.ts` (system prompts), `status.ts`, `retry.ts`, `revert.ts` (undo/redo), `summary.ts`, `compaction.ts`, `instruction.ts`, `todo.ts`, `session.sql.ts` |
| `share/`    | Session sharing (publish/unpublish) | Single module                                                                                                                                                                                                                                                           |
| `snapshot/` | Session snapshots                   | Single module                                                                                                                                                                                                                                                           |

### Tools (30+ built-in)

| Directory | Purpose                    | Key Files                                                     |
| --------- | -------------------------- | ------------------------------------------------------------- |
| `tool/`   | Tool definitions + prompts | Each tool has a `.ts` (implementation) + `.txt` (prompt) pair |

**Tool inventory:**
`bash`, `read`, `write`, `edit`, `multiedit`, `glob`, `grep`, `ls`, `apply_patch`, `codesearch`, `webfetch`, `websearch`, `lsp`, `plan` (enter/exit), `question`, `skill`, `task`, `todo` (read/write), `batch`, `truncation`, `invalid`, `external-directory`, `registry.ts` (tool registry), `tool.ts` (base types)

### LLM Providers

| Directory       | Purpose                                      | Key Files                                                                                                                                               |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider/`     | Provider-agnostic LLM integration via AI SDK | `provider.ts` (provider registry), `auth.ts` (credential management), `models.ts` (model definitions), `transform.ts` (response transforms), `error.ts` |
| `provider/sdk/` | Provider-specific SDK adapters               | `copilot/` (GitHub Copilot: `chat/`, `responses/`, `responses/tool/`)                                                                                   |

**Supported providers (via `@ai-sdk/*`):** Anthropic, OpenAI, Google, Google Vertex, Azure, Amazon Bedrock, Groq, Mistral, Cerebras, Cohere, DeepInfra, Perplexity, TogetherAI, xAI, Vercel, OpenRouter, GitLab, AI Gateway, OpenAI-compatible (custom endpoints).

### Infrastructure

| Directory       | Purpose                                         | Key Files                                                                                   |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `config/`       | Configuration loading                           | `config.ts`, `paths.ts`, `tui.ts` + `tui-schema.ts`, `markdown.ts`, `migrate-tui-config.ts` |
| `storage/`      | Database layer (Drizzle + SQLite)               | `db.ts`, `storage.ts`, `schema.sql.ts`, `schema.ts`, `json-migration.ts`                    |
| `permission/`   | Tool permission system                          | `index.ts`, `arity.ts`, `next.ts`                                                           |
| `mcp/`          | Model Context Protocol                          | `index.ts`, `auth.ts`, `oauth-callback.ts`, `oauth-provider.ts`                             |
| `plugin/`       | Plugin loading                                  | `index.ts`, `codex.ts` (Codex plugin), `copilot.ts` (Copilot plugin)                        |
| `skill/`        | Custom skill/command system                     | `index.ts`, `discovery.ts`, `skill.ts`                                                      |
| `command/`      | Command definitions                             | `template/`                                                                                 |
| `question/`     | User question system (for agent → user queries) | Single module                                                                               |
| `file/`         | File system operations                          | Single module                                                                               |
| `lsp/`          | Language Server Protocol                        | Single module                                                                               |
| `pty/`          | Pseudo-terminal management                      | Single module                                                                               |
| `shell/`        | Shell integration                               | Single module                                                                               |
| `worktree/`     | Git worktree management                         | `index.ts`                                                                                  |
| `project/`      | Project management                              | Single module                                                                               |
| `auth/`         | Authentication (OpenAuth, GitHub, GitLab)       | Single module                                                                               |
| `installation/` | Installation detection and version              | Single module                                                                               |
| `ide/`          | IDE integration                                 | Single module                                                                               |
| `acp/`          | Agent Client Protocol                           | Single module                                                                               |
| `patch/`        | Patch application                               | Single module                                                                               |

### Utilities

| Directory | Purpose                                     |
| --------- | ------------------------------------------- |
| `util/`   | Logging (`log.ts`), filesystem, and helpers |
| `bus/`    | Event bus for internal pub/sub              |
| `env/`    | Environment variable management             |
| `flag/`   | Feature flags                               |
| `format/` | Output formatting                           |
| `global/` | Global state (data paths)                   |
| `id/`     | ID generation (ULID)                        |
| `bun/`    | Bun-specific utilities                      |

## Test Structure (`test/`)

33 test directories/files mirroring `src/` structure. Tests use `bun test` (not Vitest). Key test areas:

| Directory                                 | What's tested                                            |
| ----------------------------------------- | -------------------------------------------------------- |
| `tool/`                                   | All built-in tools with `__snapshots__/` and `fixtures/` |
| `session/`                                | Session lifecycle, messaging                             |
| `server/`                                 | API route handlers                                       |
| `provider/` + `provider/copilot/`         | Provider integration                                     |
| `permission/` + `permission-task.test.ts` | Permission system                                        |
| `config/` + `config/fixtures/`            | Configuration loading                                    |
| `mcp/`                                    | MCP server/client                                        |
| `storage/`                                | Database operations                                      |
| `skill/`                                  | Skill discovery + execution                              |
| `plugin/`                                 | Plugin loading                                           |
| `patch/`                                  | Patch application                                        |
| `acp/`                                    | Agent Client Protocol                                    |
| `cli/` + `cli/tui/`                       | CLI commands, TUI components                             |
| `fixture/`                                | Shared test fixtures including LSP and sample skills     |

```bash
# Run all tests (from this directory, not repo root)
cd packages/opencode && bun test --timeout 30000

# Run single test file
cd packages/opencode && bun test test/tool/bash.test.ts
```

## Commands (20+ CLI subcommands)

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| _(default)_         | TUI mode — interactive terminal UI             |
| `serve`             | Headless HTTP + SSE server (default port 4096) |
| `web`               | Open web UI                                    |
| `auth`              | Authentication management                      |
| `agent`             | Run agent non-interactively                    |
| `models`            | List available models                          |
| `mcp`               | MCP server management                          |
| `upgrade`           | Self-upgrade                                   |
| `uninstall`         | Remove installation                            |
| `export` / `import` | Session export/import                          |
| `github`            | GitHub integration                             |
| `pr`                | Pull request workflows                         |
| `session`           | Session management                             |
| `db`                | Database operations (Drizzle Kit)              |
| `debug`             | Debug utilities                                |
| `stats`             | Usage statistics                               |
| `acp`               | Agent Client Protocol                          |
| `generate`          | SDK code generation                            |
| `completion`        | Shell completion script                        |
| `workspace-serve`   | Multi-workspace server (dev only)              |
| `attach`            | Attach to existing TUI session                 |
| `thread`            | TUI thread management                          |

## Database

- **Engine:** SQLite via Drizzle ORM
- **Schema files:** `src/**/*.sql.ts` (convention: co-located with domain code)
- **Migrations:** `migration/` directory (6 migrations), generated via `bun run db generate --name <slug>`
- **First-run migration:** `json-migration.ts` migrates legacy JSON data to SQLite with progress bar

## Dependencies (Highlights)

- **AI:** `ai` (Vercel AI SDK core), 18 `@ai-sdk/*` provider packages, `@modelcontextprotocol/sdk`
- **Server:** `hono` + `hono-openapi` + `@hono/zod-validator`
- **Database:** `drizzle-orm` + `drizzle-kit` (SQLite)
- **TUI:** `@opentui/core` + `@opentui/solid` + `solid-js`
- **Terminal:** `bun-pty` (pseudo-terminal)
- **File watching:** `@parcel/watcher` + `chokidar`
- **Auth:** `@openauthjs/openauth`, `@octokit/rest`, `@octokit/graphql`, `@gitlab/opencode-gitlab-auth`
- **Parsing:** `web-tree-sitter` + `tree-sitter-bash`
- **CLI:** `yargs`, `@clack/prompts`

## Development Guide

This is the primary package for Orbit development. Key areas:

1. **Server routes** (`src/server/routes/`) — Add new HTTP endpoints here for desktop app features
2. **Tools** (`src/tool/`) — Add or modify agent tools. Each tool has `.ts` (logic) + `.txt` (system prompt)
3. **Session** (`src/session/`) — Session lifecycle, message processing, undo/redo (revert)
4. **Provider** (`src/provider/`) — LLM provider integration. Add new providers via AI SDK adapters
5. **Permission** (`src/permission/`) — Tool permission system (allow once/always/deny)
6. **MCP** (`src/mcp/`) — Model Context Protocol server/client with OAuth

For Orbit CLI: the binary is `bin/opencode` (aliased as `orbit` in package.json). The TUI in `cli/cmd/tui/` uses SolidJS + opentui for terminal rendering.

## Notes

- **Already rebranded to `orbit`** — `scriptName("orbit")` in `index.ts` and `"orbit": "./bin/opencode"` in package.json bin field. The CLI already runs as `orbit`.
- **20+ LLM providers** — the most provider-agnostic AI agent on the market. All via Vercel's AI SDK abstraction layer. Custom endpoints supported via `@ai-sdk/openai-compatible`.
- **SQLite, not PlanetScale** — unlike the `console/` packages (MySQL/PlanetScale for cloud), the core engine uses local SQLite for sessions, messages, and settings. Zero network dependency for data storage.
- **JSON → SQLite migration** — `json-migration.ts` handles the one-time migration from legacy JSON file storage to SQLite. Shows a progress bar on first run. This is a recent addition — older installations may still have JSON files.
- **Tool prompt pairs** — every tool has a `.ts` implementation and a `.txt` prompt file side-by-side. The `.txt` is the system prompt fragment that instructs the LLM how to use the tool. Modifying the prompt changes agent behavior without touching code.
- **mDNS discovery** — `server/mdns.ts` uses `bonjour-service` to advertise the server on the local network, enabling automatic discovery by desktop clients.
- **The `control-plane/` handles multi-workspace** — a single server can manage multiple project directories simultaneously. Each workspace gets its own session context, file state, and terminal.
- **`bun-pty`** — native pseudo-terminal via Bun FFI, not `node-pty`. Lighter weight and Bun-native.
