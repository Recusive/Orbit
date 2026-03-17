# packages

> **Path:** `Agent-backend/packages/`

## Purpose

Bun workspace monorepo containing the OpenCode engine and reference packages. Orchestrated with Turbo (`bun turbo <task>`). Stripped down from the full upstream monorepo — upstream product infrastructure (console, marketing site, Slack bot, Storybook, etc.) has been removed. What remains is the engine plus reference code for studying data flows and UI patterns.

## Usage Status — At a Glance

```
██ active    ░░ reference

Orbit:  ██ opencode  ██ sdk  ██ plugin  ██ util  ██ script  ░░ app  ░░ desktop  ░░ ui
```

## Package Map

### Engine (actively used by Orbit)

| Package     | Name                  | Purpose                                                                                                        |
| ----------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `opencode/` | `opencode`            | CLI, API server, agent orchestration, 30+ tools, 20+ LLM providers, MCP, sessions, permissions. **The heart.** |
| `sdk/js/`   | `@orbit.build/sdk`    | Auto-generated TypeScript API client from `sdk/openapi.json`. Already rebranded (`OrbitClient`).               |
| `plugin/`   | `@orbit.build/plugin` | Plugin SDK — `tool()` factory, 20+ hook points, auth hooks                                                     |
| `util/`     | `@orbit.build/util`   | Shared utilities (array, encoding, error, path, retry, slug)                                                   |
| `script/`   | `@orbit.build/script` | Build script utilities (semver)                                                                                |

### Reference (kept for patterns, not run)

| Package    | Name                   | Purpose                                                                                                    |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `app/`     | `@orbit.build/app`     | SolidJS web UI — context providers, SDK data fetching, SSE event handling, component patterns              |
| `desktop/` | `@orbit.build/desktop` | Tauri v2 desktop app — sidecar lifecycle, native platform abstraction, auto-updater, window chrome         |
| `ui/`      | `@orbit.build/ui`      | 175 SolidJS components — theme system, provider icons, audio assets. Keeps `app/` import paths resolvable. |

### Removed (upstream infrastructure)

The following were removed during the Strip-to-SDK audit. See `docs/plans/STRIP-TO-SDK-AUDIT.md` for full details.

`console/` (5 sub-packages), `containers/`, `desktop-electron/`, `docs/`, `enterprise/`, `extensions/`, `function/`, `identity/`, `slack/`, `storybook/`, `web/`

## Dependency Flow

```
util, sdk/js, plugin, script   (foundational — no internal deps)
        ↓
opencode, ui                    (core engine + component library)
        ↓
app                             (web UI — depends on ui + sdk)
        ↓
desktop                         (wraps app in Tauri + bundles opencode CLI as sidecar)
```

## Common Commands

```bash
# From repo root
bun turbo typecheck              # Type-check all packages
bun turbo build                  # Build all packages

# Engine dev
bun dev                          # CLI (TUI mode)
bun dev serve                    # Headless API server (port 4096)

# Reference app dev servers
bun run --cwd packages/app dev   # Web UI (needs server running)

# Tests (never from repo root — guarded by bunfig.toml)
cd packages/opencode && bun test --timeout 30000

# SDK regeneration (after changing server/API code)
./script/generate.ts
```

## Key Conventions

- All UI uses **SolidJS** (not React) — Orbit's React frontend does NOT import these directly
- Database access uses **Drizzle ORM** — SQLite in `opencode`
- The `ui` package has extensive conditional exports — import from subpaths like `@orbit.build/ui/hooks`

## Development Guide

For Orbit work, focus almost exclusively on `packages/opencode/`. When adding new server endpoints, work in `packages/opencode/src/server/`. When modifying tools, work in `packages/opencode/src/tool/`. The `app/` and `desktop/` packages are read-only reference — study their patterns but don't modify them.

## Notes

- **SolidJS vs React:** All upstream UI packages use SolidJS. Orbit's desktop app uses React. There is zero UI code sharing — we only share the engine (`opencode`) and consume it via HTTP + SDK.
- **Already rebranded:** `packages/opencode` has `scriptName("orbit")` and `"orbit": "./bin/opencode"`. `packages/sdk` exports `OrbitClient` and `createOrbitClient()`.
