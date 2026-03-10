# packages/app

> **Path:** `Agent-backend/packages/app/`

## Purpose

The OpenCode web UI — a SolidJS single-page application that connects to the headless OpenCode server via HTTP + SSE. Provides the full chat interface, file tree, terminal, settings, model picker, command palette, session management, and all visual tools. Also hosts the Playwright E2E test suite.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                                                    |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Orbit's React UI reimplements the same features. The context provider architecture, component structure, and E2E test patterns are the primary reference. SolidJS code is not directly reusable — only the patterns, data flows, and UI logic translate. |
| Orbit CLI           | `rebuild`   | CLI TUI lives in `packages/opencode`, but this app's routing, settings persistence, and i18n patterns would inform a future web CLI mode                                                                                                                 |

## Key Files

| File                   | Purpose                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/entry.tsx`        | Web entry point — creates `Platform` object (web), renders `AppInterface` with HTTP server connection                  |
| `src/app.tsx`          | Root component — 15+ nested providers, lazy-loaded routes (`/` → Home, `/:slug/session/:id` → Session), error boundary |
| `src/index.css`        | Global styles (Tailwind imports + theme variables)                                                                     |
| `src/index.ts`         | Package exports for consumption by `packages/desktop`                                                                  |
| `package.json`         | `@opencode-ai/app` — SolidJS + Vite + Tailwind + Shiki + Ghostty-web                                                   |
| `vite.config.ts`       | Vite config — port 3000, ESNext target                                                                                 |
| `playwright.config.ts` | E2E test configuration                                                                                                 |
| `AGENTS.md`            | Dev guide — local setup, SolidJS patterns, browser automation                                                          |
| `happydom.ts`          | HappyDOM preload for unit tests (`bun test --preload ./happydom.ts`)                                                   |

## Source Structure

### `src/components/` — UI Components (37 files)

| Category          | Files                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dialogs**       | `dialog-connect-provider`, `dialog-custom-provider`, `dialog-edit-project`, `dialog-fork`, `dialog-manage-models`, `dialog-release-notes`, `dialog-select-directory`, `dialog-select-file`, `dialog-select-mcp`, `dialog-select-model`, `dialog-select-model-unpaid`, `dialog-select-provider`, `dialog-select-server` |
| **Settings tabs** | `settings-agents`, `settings-commands`, `settings-general`, `settings-keybinds`, `settings-mcp`, `settings-models`, `settings-permissions`, `settings-providers`                                                                                                                                                       |
| **Core**          | `prompt-input/` (subdirectory), `prompt-input.tsx`, `terminal.tsx`, `file-tree.tsx`, `titlebar.tsx`, `titlebar-history.ts`, `status-popover.tsx`, `debug-bar.tsx`, `link.tsx`, `model-tooltip.tsx`, `session-context-usage.tsx`                                                                                        |
| **Session**       | `session/` (subdirectory), `server/` (subdirectory)                                                                                                                                                                                                                                                                    |

### `src/context/` — SolidJS Context Providers (37 files)

Every major domain has a dedicated context provider:

| Context                                         | Purpose                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `sdk.tsx` / `global-sdk.tsx`                    | SDK client instance + global SDK for cross-session operations |
| `server.tsx`                                    | Server connection management (HTTP type)                      |
| `sync.tsx` / `global-sync.tsx`                  | SSE subscriptions for real-time updates                       |
| `command.tsx`                                   | Command palette + keybinding system                           |
| `file.tsx` + `file/`                            | File tree state + content eviction                            |
| `layout.tsx` + `layout-scroll.ts`               | Panel layout + scroll position persistence                    |
| `settings.tsx`                                  | Settings persistence (`settings.v3` localStorage)             |
| `terminal.tsx`                                  | Terminal tab state + workspace-scoped persistence             |
| `prompt.tsx`                                    | Prompt input state, history, mentions                         |
| `permission.tsx` + `permission-auto-respond.ts` | Permission request handling + auto-accept                     |
| `models.tsx` + `model-variant.ts`               | Model selection, visibility, variants                         |
| `language.tsx`                                  | i18n with English + Chinese locales                           |
| `notification.tsx`                              | Browser notifications (agent complete, permissions, errors)   |
| `comments.tsx`                                  | Code review comments                                          |
| `highlights.tsx`                                | Syntax highlighting via Shiki                                 |
| `local.tsx`                                     | Local-only state                                              |
| `platform.tsx`                                  | Platform abstraction (web vs desktop)                         |

### `src/pages/` — Route Pages

| Page                     | Route                                     |
| ------------------------ | ----------------------------------------- |
| `home.tsx`               | `/` — project list, new session           |
| `session.tsx`            | `/:slug/session/:id` — chat view          |
| `layout.tsx` + `layout/` | Shared layout (sidebar, titlebar, panels) |
| `directory-layout.tsx`   | Per-directory layout wrapper              |
| `error.tsx`              | Error boundary fallback                   |

### `src/utils/` — Utilities (32 files)

Server health monitoring, notification click handling, terminal writer, persistence helpers, base64 encoding, DOM utilities, UUID generation, speech-to-text, sound playback, drag-and-drop (solid-dnd), server error classification, scoped caching, worktree helpers, time formatting.

### `src/addons/` — Serialization

`serialize.ts` + `serialize.test.ts` — custom serialization for terminal state and other persisted data.

### `src/hooks/` — Custom Hooks

`use-providers.ts` — provider list hook.

### `src/i18n/` — Internationalization

18 locale files (en, zh, de, fr, es, ja, ko, pt, ru, ar, and more). Dictionary-based with `@solid-primitives/i18n`.

## Commands

```bash
# Development (standalone — needs backend server running separately)
bun dev                     # Vite dev server, port 3000
bun dev -- --port 4444      # Custom port

# Backend for local dev (from packages/opencode)
bun run --conditions=browser ./src/index.ts serve --port 4096

# Build
bun run build               # Vite production build
bun run serve               # Preview production build

# Type checking
bun run typecheck            # tsgo -b (TypeScript Go compiler)

# Unit tests
bun run test                 # HappyDOM + Bun test runner
bun run test:unit:watch      # Watch mode

# E2E tests
bun run test:e2e             # Playwright (needs running server)
bun run test:e2e:local       # Full local setup via script
bun run test:e2e:ui          # Playwright interactive UI
bun run test:e2e:report      # View HTML report
```

## Dependencies

- **Internal:** `@opencode-ai/sdk` (API client), `@opencode-ai/ui` (component library), `@opencode-ai/util` (utilities)
- **SolidJS ecosystem:** `solid-js`, `@solidjs/router`, `@solidjs/meta`, `@kobalte/core`, `solid-list`, `virtua` (virtual scrolling), `@thisbeyond/solid-dnd`
- **Terminal:** `ghostty-web` (Ghostty terminal emulator compiled to WASM)
- **Code:** `shiki` + `@shikijs/transformers` (syntax highlighting), `marked` + `marked-shiki` (Markdown rendering)
- **Utilities:** `luxon` (dates), `fuzzysort` (search), `remeda` (FP utilities), `diff` (text diffing), `zod` (validation)

## Development Guide

For Orbit development, this package is purely **reference** — don't modify it. Study:

- **Context provider architecture** — how each domain (files, terminal, settings, permissions) is isolated into its own provider with dedicated state
- **E2E test patterns** — `e2e/` directory has complete test infrastructure (see `e2e/CLAUDE.md`)
- **Platform abstraction** — `Platform` type in `context/platform.tsx` abstracts web vs desktop (notify, openLink, back/forward)
- **Settings persistence** — `settings.v3` localStorage key with `@solid-primitives/storage`
- **Terminal integration** — Ghostty WASM terminal with workspace-scoped buffer persistence

## Notes

- **SolidJS, not React** — all components use SolidJS signals, stores, and context. `createStore` preferred over multiple `createSignal` calls (per AGENTS.md). No React hooks or JSX patterns apply here.
- **15+ nested providers in `app.tsx`** — the provider chain is: Platform → Language → I18n → Theme → Font → Meta → Dialog → File → Server → SDK → Settings → GlobalSDK → GlobalSync → Layout → Models → Permission → Notification → Command → Comments → Highlights → Prompt → Terminal → Router. Order matters.
- **Ghostty WASM terminal** — `ghostty-web` is a WASM build of the Ghostty terminal emulator, loaded from `github:anomalyco/ghostty-web#main`. This is the same terminal used in the E2E tests.
- **`tsgo -b` for typechecking** — uses TypeScript's native Go-based compiler (`@typescript/native-preview`) for faster type checking than standard `tsc`.
- **HappyDOM for unit tests** — `happydom.ts` preload registers DOM globals so SolidJS components can be tested outside a browser. Tests use `bun test` (not Vitest).
- **The `Platform` abstraction** is key for Orbit — `entry.tsx` creates a web platform, while `packages/desktop` creates a Tauri platform with different implementations for `notify`, `openLink`, `back`, `forward`, `restart`, and `getDefaultServerUrl`.
