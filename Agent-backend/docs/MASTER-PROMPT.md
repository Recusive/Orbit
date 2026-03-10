# Master Prompt: Agent-backend Folder-by-Folder Review & CLAUDE.md Generation

> **How to use:** Copy this entire file and paste it into a new Claude Code session opened at `/Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/`. The session will walk through every folder and subfolder, creating a `CLAUDE.md` file for each one.

---

## Who You Are

You are helping build **Orbit** — an AI-powered code editor. This `Agent-backend/` directory is a fork of [opencode](https://github.com/anomalyco/opencode), an open-source AI coding assistant. We are rebranding it and using it to build **two products**:

### Product 1: Orbit Desktop App (existing — `/Users/no9labs/Developer/Recursive/Snowflake-v0/`)

- **Stack:** Tauri 2 (Rust backend) + React 19 (TypeScript frontend)
- **Current AI backend:** `agent-bridge/` — a sidecar that wraps the Claude Agent SDK, communicates via stdin/stdout JSON pipe to Rust
- **Migration goal:** Replace `agent-bridge` with this `Agent-backend` running as an **HTTP + SSE server** (SDK format). The React frontend will call `fetch()` directly to the server. Rust only spawns the sidecar process.
- **What stays:** All existing UI components, stores, hooks, Rust crates (file system, git, terminal, browser, search, LSP, settings). Only the AI layer changes.

### Product 2: Orbit CLI (new — built from this `Agent-backend/`)

- **What it is:** A rebranded version of opencode's CLI/TUI, shipped as a standalone terminal-based AI coding tool
- **Stack:** Bun + TypeScript, standalone binary via `bun build --compile`
- **Approach:** Rebuild the CLI UI (TUI), keep the core engine, ship as "Orbit CLI"

### The SDK Format Concept

The `Agent-backend` serves as the **shared engine** for both products:

```
Agent-backend (this repo)
├── packages/opencode/src/server/    ← HTTP server (SDK for desktop app)
├── packages/opencode/src/session/   ← AI session engine (shared core)
├── packages/opencode/src/tool/      ← Tool execution (shared core)
├── packages/opencode/src/provider/  ← LLM providers (shared core)
├── packages/opencode/src/mcp/       ← MCP client (shared core)
├── packages/app/                    ← Their SolidJS UI (reference for Orbit CLI TUI)
├── packages/tui/                    ← Their terminal UI (reference/rebuild for Orbit CLI)
└── packages/desktop/                ← Their Tauri shell (reference for our desktop integration)
```

**The development workflow:**

1. Developer works in `Agent-backend/`
2. Runs `bun run dev` to test features in CLI mode
3. Once working in CLI, build the binary for the desktop app
4. Wire up the new endpoint in the Snowflake React frontend

**The SDK consumption pattern:**

```
Developer: "I added POST /session/:id/my-feature to the server"
Frontend:  "Got it — I'll call fetch('/session/:id/my-feature') from React"
```

The desktop app (Snowflake-v0) consumes Agent-backend purely via HTTP. No shared imports, no monorepo workspace linking. The binary is compiled, copied to `src-tauri/binaries/`, and spawned as a Tauri sidecar.

---

## Your Task

**Go through every folder and subfolder in this `Agent-backend/` directory and create a `CLAUDE.md` file for each one.**

### How This Works

1. I will give you a folder path (e.g., `packages/opencode/src/tool/`)
2. You read every file in that folder (not subfolders — just the immediate files)
3. You create a `CLAUDE.md` in that folder that documents:
   - **What this folder does** (2-3 sentences)
   - **Key files** (table: filename, purpose, one-liner description)
   - **Usage status** for both products (see template below)
   - **Dependencies** (what this folder imports from / is imported by)
   - **How to modify** (brief guide for adding/changing features here)
4. You tell me what you found and if anything needs attention
5. I give you the next folder

### CLAUDE.md Template

Use this template for every folder. Adapt the content, but keep the structure consistent:

```markdown
# [Folder Name]

> **Path:** `Agent-backend/[full/path/from/root]`

## Purpose

[2-3 sentences explaining what this folder does]

## Usage Status

| Product             | Status                            | Notes        |
| ------------------- | --------------------------------- | ------------ |
| Orbit Desktop (SDK) | `active` / `planned` / `not used` | [Brief note] |
| Orbit CLI           | `active` / `planned` / `not used` | [Brief note] |

## Key Files

| File          | Purpose              |
| ------------- | -------------------- |
| `filename.ts` | One-line description |

## Dependencies

- **Imports from:** `../other-module`, `../another`
- **Imported by:** `../consumer`, `../../parent`

## Development Guide

[1-3 sentences on how to add/modify features in this folder]

## Notes

[Any important caveats, gotchas, or future plans. Remove this section if empty.]
```

### Usage Status Definitions

| Status      | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `active`    | Currently used or will be used in the migration                                |
| `planned`   | Not used yet, but we plan to use it (e.g., enterprise, slack)                  |
| `not used`  | Not applicable to this product, but kept for reference or potential future use |
| `rebuild`   | We'll rebuild/rebrand this for our product (e.g., TUI, CLI UI)                 |
| `reference` | Kept as reference implementation, not used directly                            |

---

## Context: What Agent-backend Replaces

### Current Architecture (agent-bridge — being replaced)

```
React Frontend
  → invoke('agent_*')        ← 40+ Tauri commands
  → Rust Backend
    → stdin/stdout JSON pipe ← proprietary protocol (~1000 lines Rust + ~1000 lines TS)
    → agent-bridge (Bun sidecar)
      → Claude Agent SDK     ← Claude-only, no other providers
```

**Problems with agent-bridge:**

- Claude-only (no other LLM providers)
- Proprietary stdin/stdout protocol duplicated in Rust AND TypeScript
- ~2500 lines of Rust bridge/protocol code that's pure overhead
- SDK type workarounds (LocalSDKMessage mirror types)
- Blocking IPC (one request at a time)

### Target Architecture (Agent-backend — the replacement)

```
React Frontend
  → fetch() + EventSource   ← standard HTTP + SSE, direct from browser
  → Agent-backend HTTP server (Bun)
    → Vercel AI SDK          ← 17+ providers (Anthropic, OpenAI, Google, etc.)

Rust Backend (minimal involvement):
  → Spawns Agent-backend process on app startup
  → Returns URL + password to frontend (one Tauri command)
  → Handles non-AI features: file system, git, terminal, browser, search, LSP, settings
```

**What this gains:**

- 17+ LLM providers out of the box
- Standard HTTP API (debuggable with curl, browser DevTools)
- No protocol duplication (Rust agent bridge code deleted entirely)
- SQLite persistence (replaces hand-rolled JSONL conversation system)
- Native MCP support with OAuth
- Active open-source community for bug fixes and new features

### Feature Mapping (what maps to what)

| Current (agent-bridge)     | Agent-backend (opencode)            | Notes                                 |
| -------------------------- | ----------------------------------- | ------------------------------------- |
| `agent_create_session`     | `POST /session`                     | Direct mapping                        |
| `agent_send_message`       | `POST /session/:id/prompt_async`    | Fire-and-forget, SSE events           |
| `agent_interrupt`          | `POST /session/:id/abort`           | Direct mapping                        |
| `agent_respond_permission` | `POST /permission/:id/reply`        | `once`/`always`/`reject`              |
| `agent_set_model`          | Per-message `PromptInput.model`     | Model set per-prompt, not per-session |
| `agent_fork_session_at`    | `POST /session/:id/fork`            | Data copy, creates new session        |
| `agent_rewind_files`       | `POST /session/:id/revert`          | Git-snapshot-based file restore       |
| `agent_generate_title`     | **Automatic** — built-in            | `session.updated` SSE event           |
| `agent_list_agents`        | `GET /agent`                        | Direct mapping                        |
| `agent_list_commands`      | `GET /command`                      | Direct mapping                        |
| `agent_list_skills`        | `GET /skill`                        | Direct mapping                        |
| `conversation_list`        | `GET /session`                      | Sessions from SQLite                  |
| `conversation_load`        | `GET /session/:id/message`          | Messages from SQLite                  |
| Streaming text             | `message.part.delta` SSE event      | Field: `text`                         |
| Streaming thinking         | `message.part.delta` SSE event      | Field: `reasoning`                    |
| Tool start/end             | `message.part.updated` SSE event    | `ToolPart` with state                 |
| Permission request         | `permission.asked` SSE event        | Direct mapping                        |
| Turn complete              | `session.status` → `idle` SSE event | Direct mapping                        |

### Custom Endpoints We Need to Add

These don't exist in opencode and need to be built in our fork:

| Endpoint                   | Purpose                                         | Priority |
| -------------------------- | ----------------------------------------------- | -------- |
| `POST /agent`              | Create agent definition                         | High     |
| `PUT /agent/:name`         | Update agent definition                         | High     |
| `DELETE /agent/:name`      | Delete agent definition                         | High     |
| `POST /command`            | Create slash command                            | High     |
| `PUT /command/:name`       | Update slash command                            | High     |
| `DELETE /command/:name`    | Delete slash command                            | High     |
| `POST /agent/generate`     | AI-generate agent definition from description   | Medium   |
| `POST /command/generate`   | AI-generate command definition from description | Medium   |
| `POST /enhance-bug-report` | AI-enhance bug report with context              | Low      |
| Browser tool bridge        | Custom tool for WKWebView integration           | Medium   |

---

## Context: The Parent Repository (Snowflake-v0)

The `Agent-backend/` folder lives inside the Snowflake-v0 monorepo:

```
/Users/no9labs/Developer/Recursive/Snowflake-v0/
├── apps/agent/              ← React frontend (main app)
├── apps/Canvas-UI-Builder/  ← Canvas UI Builder
├── apps/editor/             ← Editor app (stub)
├── agent-bridge/            ← OLD AI sidecar (being replaced by Agent-backend)
├── Agent-backend/           ← THIS — opencode fork, the new AI engine
├── src-tauri/               ← Rust backend (Tauri)
├── crates/                  ← Rust library crates
├── packages/shared-schemas/ ← Zod schemas shared across apps
├── docs/                    ← Documentation
└── CLAUDE.md                ← Root project guidance
```

**Important:** Agent-backend is NOT in the Bun workspaces array. It's an independent codebase that happens to live inside Snowflake-v0. It has its own `package.json`, `tsconfig.json`, `turbo.json`, linting rules, CI/CD workflows, and git hooks. Run `bun install` inside `Agent-backend/` separately.

---

## Context: Upstream Sync Strategy

This is a fork of `anomalyco/opencode`. We will selectively sync upstream releases:

- **Always grab:** Security fixes, new provider adapters, tool improvements, MCP updates
- **Review carefully:** Server route changes, SSE event format changes, session data model changes
- **Skip:** Their app UI changes (we have our own React UI), their desktop changes (we have our own Tauri app)

Full upstream sync guide: `Agent-backend/docs/plans/git/upstream-sync.md`

---

## Rules for Creating CLAUDE.md Files

1. **Read before writing.** Read every file in the folder before creating the CLAUDE.md. Understand what the code does.
2. **Be accurate.** If you're unsure about a file's purpose, say so. Don't guess.
3. **Be concise.** The CLAUDE.md is a quick reference, not documentation. 2-3 sentences per section max.
4. **Use the template.** Every CLAUDE.md follows the same structure for consistency.
5. **Mark usage status honestly.** If something is `not used` but we're keeping it, say that. If it's `planned`, say that.
6. **Note cross-product relevance.** Some modules are shared core (used by both products), some are product-specific.
7. **Don't modify any source code.** Only create CLAUDE.md files. Do not edit, rename, or delete any existing files.
8. **Include the folder path.** Every CLAUDE.md starts with the full path from Agent-backend root.

---

## Let's Begin

Start by reading the root `Agent-backend/` directory listing. Then I'll give you the first folder path to review. We'll go breadth-first: root level first, then into packages, then into sub-packages, then into src directories.

**Read the root directory and tell me what you see. Then I'll give you the first folder.**
