# Agent-Backend: Strip-to-SDK Audit

## What This Is

We forked OpenCode (an open-source AI coding agent) to use as the engine for **Orbit** — our AI-powered code editor. This repo (`Agent-backend/`) is that fork. It contains the full OpenCode monorepo: the core engine, CLI, server, plus all of upstream's product surfaces (web app, desktop app, marketing site, billing console, etc.).

We're walking through every package and directory to decide what stays and what goes — stripping it down to a clean SDK while preserving reference code we can learn from.

## Instructions for Claude

Walk through every package and major directory in this repo, one by one. For each one:

1. **Read the folder** — read the CLAUDE.md, package.json, and key source files to understand what it actually does.
2. **Tell me what it does** — explain it in plain language. What is this? What does it power? Who uses it?
3. **Give your recommendation** — should we keep it, keep as reference, or remove it? And WHY.
4. **Ask me** — "Should we keep this or delete it?" Wait for my answer before moving on.
5. **If we keep it**, update its CLAUDE.md with:
   - What it does and the recommendation
   - Why we're keeping it
   - A "When to Reference This" lookup table (if it's reference code) — maps "if you're building X" → "read this file" so future sessions don't need to read every file
   - Key data patterns that are portable to React/Zustand
   - An "Orbit Mapping" table showing what Orbit already has vs. what's still unbuilt

## The Three Categories

### KEEP (engine — actively used)

Code that Orbit runs directly. The core engine, CLI, server, SDK client, tools, providers, plugins, sessions, MCP, permissions, config, storage.

### KEEP AS REFERENCE (not run, but valuable for patterns)

Upstream's desktop app and web app codebase. We won't run this SolidJS code, but it shows:

- **How to fetch data** from the engine (SDK calls, SSE event handling)
- **How to wire up features** (model picker, settings, permissions, file tree, terminal)
- **State management patterns** (two-tier global/session state, optimistic updates, cache eviction)
- **Data shapes and API call patterns** we'll reimplement in React

When keeping as reference, update the CLAUDE.md so it serves as a **lookup guide** — future sessions should be able to read just the CLAUDE.md and know exactly which file to open for what they're building, without reading all the source files.

### REMOVE (not related to the product)

Upstream infrastructure with no reference value:

- Marketing/docs sites
- Admin/billing console (PlanetScale, Stripe)
- CI/Docker containers
- Email templates
- Brand assets (we have our own)
- Cloud deployment recipes (SST/Cloudflare)
- Nix packaging
- E2E tests for the SolidJS web app

## What We Need (engine)

- All 30+ built-in tools (bash, read, write, edit, grep, glob, websearch, etc.)
- All 20+ LLM providers (Anthropic, OpenAI, Google, Azure, Bedrock, Groq, etc.)
- The HTTP + SSE server (`serve` command)
- The TUI (terminal UI)
- The SDK client (TypeScript API client)
- MCP support (Model Context Protocol)
- Plugin system
- Session management, permissions, config, storage, multi-workspace — ALL of it

## How to Walk Through

Format each entry like this:

---

### `packages/[name]/`

**What it does:** [2-3 sentences based on reading it]

**What depends on it:** [List packages that import from this one]

**My recommendation:** KEEP (engine) / KEEP AS REFERENCE / REMOVE

**Why:** [1-2 sentences]

**Should we keep this or delete it?**

---

Then wait for my response. If I say keep, update its CLAUDE.md and move on. If I say delete, remove it and move on.

## After All Packages

Give the final summary:

- List of packages **DELETED**
- List of packages **KEPT** (engine)
- List of packages **KEPT AS REFERENCE**
- Updated `workspaces` array for package.json

## Safety Rules

- **ALWAYS read the actual code** before recommending. Don't guess from the name.
- **ALWAYS check if `packages/opencode/` imports from a package** before recommending removal.
- **When in doubt, recommend KEEP.** We can always remove more later.
- **Never recommend removing anything inside `packages/opencode/src/`.** That's the engine. All 40+ subdirectories stay.
- If a package is a dependency of something we're keeping, it stays — even if we don't use it directly.
- When removing, always chase the import chain — delete root config files (like `sst.config.ts`, `flake.nix`) that reference removed directories.

## Progress

### Removed

| Directory                    | What it was                                                                 | Why removed                                             |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `infra/` + `sst.config.ts`   | SST cloud deployment (Cloudflare, PlanetScale, Stripe)                      | Upstream SaaS infrastructure — Orbit runs locally       |
| `nix/` + `flake.nix`         | Nix packaging recipes                                                       | Orbit has its own build pipeline                        |
| `packages/app/e2e/`          | Playwright E2E tests for SolidJS web app                                    | Tests SolidJS DOM selectors, can't run against React    |
| `packages/app/public/`       | OpenCode branding (favicons, manifests, social images)                      | Orbit has its own branding                              |
| `packages/app/script/`       | E2E test orchestrator                                                       | Dead after e2e/ removal                                 |
| `packages/app/src/addons/`   | Ghostty WASM terminal serialization                                         | Orbit uses xterm.js, not Ghostty                        |
| `packages/app/src/i18n/`     | 18 locale translation files (~800KB)                                        | SolidJS-specific string keys, Orbit writes its own i18n |
| `packages/console/`          | Admin/billing console (5 sub-packages: core, app, function, mail, resource) | PlanetScale + Stripe billing — upstream SaaS            |
| `packages/containers/`       | CI Docker images                                                            | Upstream CI infrastructure                              |
| `packages/desktop-electron/` | Electron alternative desktop app                                            | Orbit has its own Tauri app                             |
| `packages/docs/`             | Mintlify documentation site                                                 | Upstream public docs                                    |
| `packages/enterprise/`       | Enterprise/teams app (SolidStart SSR)                                       | Upstream enterprise product                             |
| `packages/extensions/`       | Zed editor extension                                                        | Upstream integration                                    |
| `packages/function/`         | Cloudflare Worker API (GitHub App auth, webhooks)                           | Upstream cloud function                                 |
| `packages/identity/`         | Brand assets (SVG logos, PNG marks)                                         | Orbit has its own branding                              |
| `packages/slack/`            | Slack bot (@slack/bolt)                                                     | Upstream integration                                    |
| `packages/storybook/`        | Storybook v10 for SolidJS UI library                                        | SolidJS-specific, not applicable to React               |
| `packages/web/`              | Marketing/docs site (Astro + Starlight)                                     | Upstream marketing site                                 |
| `github/`                    | GitHub Action for triggering agent from issue/PR comments                   | Upstream product feature                                |
| All `sst-env.d.ts` files     | SST environment type declarations (7 files across repo)                     | SST infra deleted                                       |

### Kept (Engine)

| Directory            | What it is                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/opencode/` | **The heart** — CLI, HTTP+SSE server, agent orchestration, 30+ tools, 20+ LLM providers, MCP, sessions, permissions, config, storage, TUI |
| `packages/sdk/`      | Auto-generated TypeScript SDK client from OpenAPI spec. Already rebranded (`OrbitClient`).                                                |
| `packages/plugin/`   | Plugin SDK — `tool()` factory, 20+ hook points, auth hooks                                                                                |
| `packages/util/`     | Shared utilities — arrays, encoding, errors, retry, slugs, paths                                                                          |
| `packages/script/`   | Build script utilities (semver)                                                                                                           |
| `patches/`           | Bun patch-package overrides for buggy npm deps                                                                                            |
| `script/`            | Repo-level scripts — SDK regeneration (`generate.ts`), versioning, release                                                                |

### Kept (Reference)

| Directory                                       | Category  | Why kept                                                                                                                                                      |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/`                                 | Reference | SolidJS web UI — context providers, component patterns, SDK data fetching, SSE event handling                                                                 |
| `packages/app/src/components/prompt-input/`     | Reference | Submit logic, request part building, history navigation, attachment handling                                                                                  |
| `packages/app/src/components/session/`          | Reference | Session toolbar, token metrics (pure logic), context breakdown, tab management                                                                                |
| `packages/app/src/components/server/`           | Reference | Server health indicator and connection status                                                                                                                 |
| `packages/app/src/context/`                     | Reference | **Most valuable reference layer** — SDK client setup, SSE event reduction, optimistic updates, settings, permissions, layout, file tree, platform abstraction |
| `packages/app/src/hooks/`                       | Reference | Provider filtering and categorization (popular/connected/paid) for model picker                                                                               |
| `packages/app/src/pages/layout/`                | Reference | Sidebar architecture — project/workspace/session hierarchy, drag-and-drop, deep links                                                                         |
| `packages/app/src/pages/session/` + `composer/` | Reference | Session view blueprint — message timeline, composer state machine, permission/question/todo docks, session commands, file tabs, terminal panel                |
| `packages/app/src/utils/`                       | Reference | **Most portable directory** — 30/32 files are pure TypeScript. Server health, terminal writer, LRU cache, worktree state machine, aim-aware hover             |
| `packages/app/src/` root files                  | Reference | Provider nesting order (`app.tsx`), platform abstraction (`entry.tsx`), theme variables (`index.css`)                                                         |
| `packages/desktop/`                             | Reference | Tauri v2 desktop app — sidecar lifecycle, native platform abstraction, auto-updater, window chrome, deep links                                                |
| `packages/ui/`                                  | Reference | 175 SolidJS components — theme system, provider icons, audio assets. Keeps `packages/app/` import paths resolvable.                                           |
| `sdks/vscode/`                                  | Reference | VS Code extension — shows how to integrate engine into an external editor                                                                                     |
| `specs/`                                        | Reference | Project spec documents                                                                                                                                        |
| `reviews/`                                      | Reference | Audit plan documents                                                                                                                                          |
| `docs/`                                         | Reference | Internal dev documentation and plans                                                                                                                          |

### CLAUDE.md Updated

- `packages/app/src/components/prompt-input/CLAUDE.md` — created with full file inventory
- `packages/app/src/components/session/CLAUDE.md` — updated with "When to Reference This" table, key data patterns, Orbit mapping
- `packages/app/src/context/CLAUDE.md` — updated with "When to Reference This" table, key data patterns, constants, Orbit mapping
- `packages/app/src/pages/layout/CLAUDE.md` — updated with "When to Reference This" table, portability markers, key data patterns
- `packages/app/src/pages/session/CLAUDE.md` — updated with "When to Reference This" table (17 rows), portability markers, Orbit mapping
- `packages/app/src/pages/session/composer/CLAUDE.md` — updated with focused lookup table
- `packages/app/src/utils/CLAUDE.md` — updated with "When to Reference This" table, portability markers
- `packages/desktop/CLAUDE.md` — updated with "When to Reference This" table (10 rows)

### Workspaces (Updated in package.json)

```json
"workspaces": {
  "packages": [
    "packages/*",
    "packages/sdk/js"
  ]
}
```

## Status: AUDIT COMPLETE
