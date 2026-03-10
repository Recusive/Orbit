# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OpenCode is an AI-powered coding agent (CLI and headless server) built with TypeScript and Bun. It's provider-agnostic, supporting Anthropic, OpenAI, Google, Azure, and many others via `@ai-sdk/*`. The default branch is `dev` (not `main`).

This repo has been stripped to its engine core plus reference code from the upstream SolidJS web/desktop apps. See `docs/plans/STRIP-TO-SDK-AUDIT.md` for what was removed and why.

## Commands

```bash
# Install dependencies (Bun 1.3+ required)
bun install

# Run CLI in development mode (TUI)
bun dev
bun dev <directory>        # Run against specific directory
bun dev .                  # Run against repo root

# Run headless API server
bun dev serve              # Default port 4096
bun dev serve --port 8080

# Type checking (all packages via Turbo)
bun turbo typecheck

# Type checking (engine only — faster)
cd packages/opencode && bun run typecheck   # Uses tsgo --noEmit

# Tests (MUST run from package directory, not repo root)
cd packages/opencode && bun test --timeout 30000
cd packages/opencode && bun test test/tool/bash.test.ts  # Single test file

# Build standalone executable
./packages/opencode/script/build.ts --single

# Regenerate JS SDK after changing server/API code
./script/generate.ts

# Database migrations
cd packages/opencode && bun drizzle-kit

# Formatting (Prettier)
bunx prettier --check .    # Check formatting
bunx prettier --write .    # Auto-fix formatting
```

## Code Quality Status

> **WARNING:** This codebase is significantly less strict than Orbit's main repo.

### What exists

| Tool                    | Config                                                 | What it checks                                                                       |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **TypeScript** (`tsgo`) | `packages/opencode/tsconfig.json`                      | Type checking with `strict: true` via `@tsconfig/bun`                                |
| **Prettier**            | Root `package.json` (`semi: false`, `printWidth: 120`) | Formatting only — no enforcement hook                                                |
| **Pre-push hook**       | `.husky/pre-push`                                      | Runs `bun typecheck` before push. Checks Bun version matches `packageManager` field. |
| **Turbo**               | `turbo.json`                                           | Orchestrates `typecheck` and `build` tasks across packages                           |

### What does NOT exist (vs Orbit)

| Missing                        | Orbit has                                                                                    | Impact                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **ESLint**                     | 15+ strict rules (no `any`, explicit returns, import order, no console, exhaustive switches) | No static analysis for unsafe patterns                                      |
| **`noUncheckedIndexedAccess`** | Enabled                                                                                      | Disabled in opencode tsconfig — `array[0]` returns `T` not `T \| undefined` |
| **Knip** (dead code analysis)  | Configured and running                                                                       | No unused file/export detection                                             |
| **Pre-commit hook**            | Formatting + lint on commit                                                                  | Only pre-push (typecheck only)                                              |
| **CI pipeline**                | `bun run ci` = typecheck + lint + tests + rust checks                                        | No CI config (`.github/` removed)                                           |
| **Structured logging**         | `createLogger('Name')` required                                                              | `console.log` used directly (119 occurrences)                               |

### Current violations (if Orbit's rules were applied)

| Pattern                           | Count   | Files                                                             |
| --------------------------------- | ------- | ----------------------------------------------------------------- |
| `: any` or `as any`               | **136** | 46 files (worst: `provider/provider.ts` = 16, `util/log.ts` = 11) |
| `@ts-ignore` / `@ts-expect-error` | **20**  | 14 files (worst: `provider/provider.ts` = 4)                      |
| `console.log/warn/error`          | **119** | 21 files (mostly CLI code — acceptable in CLI, not in engine)     |
| `eslint-disable`                  | 0       | N/A — no ESLint to disable                                        |

### TypeScript config details

The engine (`packages/opencode/tsconfig.json`) extends `@tsconfig/bun` which provides:

- `strict: true` (includes `strictNullChecks`, `noImplicitAny`, etc.)
- `noFallthroughCasesInSwitch: true`
- `noImplicitOverride: true`
- `verbatimModuleSyntax: true`

But opencode OVERRIDES:

- `noUncheckedIndexedAccess: false` — weakens null safety on indexed access
- `jsx: "preserve"` with `jsxImportSource: "@opentui/solid"` — SolidJS JSX for TUI

## Architecture

Bun workspace monorepo orchestrated with Turbo. After stripping:

### Engine (actively used)

- **`packages/opencode`** — CLI, API server, agent logic, tools, session management. **The heart.**
- **`packages/sdk/js`** — Auto-generated TypeScript SDK from OpenAPI spec.
- **`packages/plugin`** — Plugin SDK (`@opencode-ai/plugin`).
- **`packages/util`** — Shared utilities (array, encoding, error, path, retry, slug).
- **`packages/script`** — Build script utilities (semver).

### Reference (read-only — SolidJS, not used by Orbit)

- **`packages/app`** — Web UI (SolidJS). Reference for data flows, SDK usage, SSE patterns.
- **`packages/desktop`** — Tauri desktop app. Reference for sidecar lifecycle, native abstractions.
- **`packages/ui`** — 175 SolidJS components. Keeps `app/` imports resolvable. Theme/icon reference.

### `packages/opencode/src/` internals

| Directory        | Purpose                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `agent/`         | Agent definitions and prompts (build agent, plan agent)                                                |
| `cli/cmd/`       | CLI commands (serve, web, tui, auth, mcp, etc.)                                                        |
| `cli/cmd/tui/`   | Terminal UI built with SolidJS + [opentui](https://github.com/sst/opentui)                             |
| `provider/`      | LLM provider integration via AI SDK                                                                    |
| `tool/`          | Built-in tools (bash, edit, read, write, grep, glob, etc.) — each has a `.ts` and `.txt` (prompt) file |
| `server/`        | Hono-based API server with routes                                                                      |
| `session/`       | Conversation session management                                                                        |
| `mcp/`           | Model Context Protocol server/client                                                                   |
| `config/`        | Configuration loading and schema                                                                       |
| `storage/`       | Database layer (Drizzle ORM, SQLite)                                                                   |
| `permission/`    | Tool permission system                                                                                 |
| `control-plane/` | Agent orchestration                                                                                    |
| `skill/`         | Custom skill/command system                                                                            |
| `plugin/`        | Plugin loading and execution                                                                           |

### Two built-in agents

1. **build** — Full-access agent for development tasks (can use all tools)
2. **plan** — Read-only agent for analysis and exploration

## Style Guide

From `AGENTS.md` — these are conventions (advisory, NOT enforced by tooling):

- **No semicolons** — Prettier config: `semi: false`, `printWidth: 120`
- **Single-word names** preferred for variables and functions
- **Inline single-use variables** — don't create intermediate vars
- **`const` over `let`** — use ternaries or early returns instead of reassignment
- **Early returns** — avoid `else` statements
- **No unnecessary destructuring** — use dot notation to preserve context
- **Avoid `try`/`catch`** — prefer `.catch(...)` when possible
- **Avoid `any`** — reach for precise types (NOT ENFORCED — 136 violations exist)
- **Bun APIs** — use `Bun.file()` and other Bun helpers when available
- **Drizzle schemas** — use snake_case for field names
- **Functional array methods** — prefer `flatMap`, `filter`, `map` over for loops
- **Avoid mocks in tests** — test actual implementations

## Testing

```bash
# Tests CANNOT run from repo root (guarded by bunfig.toml)
cd packages/opencode && bun test --timeout 30000

# Single test file
cd packages/opencode && bun test test/tool/bash.test.ts

# Test directories mirror src/ structure
# test/tool/     → tool tests with snapshots and fixtures
# test/session/  → session lifecycle tests
# test/server/   → API route tests
# test/provider/ → provider integration tests
```

- **Framework:** Bun test (not Vitest)
- **Philosophy:** No mocks — test actual implementations
- **33 test directories** mirroring `src/` structure
