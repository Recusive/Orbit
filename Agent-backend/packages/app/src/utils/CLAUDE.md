# utils

> **Path:** `Agent-backend/packages/app/src/utils/`

## Purpose

Shared utility functions for the OpenCode web app. Framework-agnostic (mostly pure TypeScript) except for `solid-dnd.tsx` and `persist.ts` which depend on SolidJS primitives. Covers persistence, server communication, terminal I/O, sound playback, speech, DOM helpers, caching, error formatting, and more.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `reference` | Several utilities are directly reusable or adaptable: `server-health.ts` (health polling pattern), `server-errors.ts` (error formatting), `terminal-writer.ts` (write batching), `scoped-cache.ts` (LRU cache), `worktree.ts` (worktree state machine). The `persist.ts` pattern maps to Orbit's Zustand `persist` middleware. |
| Orbit CLI           | `reference` | Same                                                                                                                                                                                                                                                                                                                           |

## Recommendation

**KEEP AS REFERENCE** — Most portable directory in `packages/app/`. 30 out of 32 files are pure TypeScript with no SolidJS dependency. Several utilities (terminal-writer, server-health, scoped-cache, worktree state machine, aim-aware hover) are directly copy-pasteable into Orbit's React codebase.

## When to Reference This

| If you're building...                                         | Read this file          | Portable?                                        |
| ------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| **Server health polling** with retry and timeout              | `server-health.ts`      | **Yes** — pure async                             |
| **Server error formatting** (config invalid, model not found) | `server-errors.ts`      | **Yes** — pure logic                             |
| **SDK client factory** for a server URL                       | `server.ts`             | **Yes** — thin wrapper                           |
| **Terminal write batching** to prevent interleaving           | `terminal-writer.ts`    | **Yes** — pure async, uses `queueMicrotask`      |
| **LRU cache** with TTL and dispose callbacks                  | `scoped-cache.ts`       | **Yes** — generic, no framework                  |
| **Worktree state machine** (pending → ready → failed)         | `worktree.ts`           | **Yes** — deferred promise pattern               |
| **Aim-aware hover** for submenus (Amazon mega-menu algorithm) | `aim.ts`                | **Yes** — pure DOM/math                          |
| **Sound effects** (46 AAC clips in 5 categories)              | `sound.ts`              | Needs asset URL adaptation                       |
| **Speech-to-text** (browser SpeechRecognition API)            | `speech.ts`             | **Yes** — browser API                            |
| **localStorage persistence** with LRU caching                 | `persist.ts`            | SolidJS-specific (use Zustand `persist` instead) |
| **Deep equality check**                                       | `same.ts`               | **Yes** — JSON comparison                        |
| **UUID generation**                                           | `uuid.ts`               | **Yes** — `crypto.randomUUID()` wrapper          |
| **Base64 decode**                                             | `base64.ts`             | **Yes** — `atob` wrapper                         |
| **Time formatting** (relative, duration)                      | `time.ts`               | **Yes** — pure formatting                        |
| **Notification click routing**                                | `notification-click.ts` | Pattern reusable                                 |
| **Drag-and-drop helpers**                                     | `solid-dnd.tsx`         | SolidJS-specific (use `@dnd-kit` instead)        |
| **Runtime capability detection** (optional APIs)              | `runtime-adapters.ts`   | **Yes** — safe wrappers                          |
| **Comment/note parsing** for code review                      | `comment-note.ts`       | **Yes** — pure parsing                           |

## File Inventory

### Persistence & Storage (2 files)

| File              | Purpose                                                                                                                                                                                                                                                                                          | Tests                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `persist.ts`      | localStorage wrapper with LRU caching (500 entries, 8MB limit). `Persist` namespace defines standard keys (`GLOBAL_STORAGE = "opencode.global.dat"`, `LOCAL_PREFIX = "opencode."`). `persisted()` wraps `@solid-primitives/storage`'s `makePersisted()` with cache and legacy migration support. | `persist.test.ts`      |
| `scoped-cache.ts` | Generic LRU cache factory — `createScopedCache()` with `maxEntries`, `ttlMs`, and `dispose` callback. Used for caching per-key computed values.                                                                                                                                                  | `scoped-cache.test.ts` |

### Server Communication (3 files)

| File               | Purpose                                                                                                                                                                          | Tests                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `server-health.ts` | Server health checking — `checkServerHealth()` with configurable timeout (3s default), retry (2 retries, 100ms delay), and abort signal support. Returns `{ healthy, version }`. | `server-health.test.ts` |
| `server-errors.ts` | Server error formatting — `formatServerError()` handles `ConfigInvalidError` and `ProviderModelNotFoundError` with i18n-aware messages. Parses Zod validation issues.            | `server-errors.test.ts` |
| `server.ts`        | SDK client factory — `createSdkForServer()` creates an `OpencodeClient` for a given server connection URL.                                                                       |                         |

### Terminal & I/O (2 files)

| File                  | Purpose                                                                                                                                                                                    | Tests                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `terminal-writer.ts`  | Write batching for terminal output — coalesces multiple `write()` calls into batched flushes using `queueMicrotask`. Prevents write interleaving and supports `waitForFlush()`.            | `terminal-writer.test.ts`  |
| `runtime-adapters.ts` | Runtime capability detection — `isDisposable()`, `disposeIfDisposable()`, `setOptionIfSupported()`, `getHoveredLinkText()`. Safe wrappers for optional APIs (Ghostty terminal extensions). | `runtime-adapters.test.ts` |

### Audio & Speech (2 files)

| File        | Purpose                                                                                                                                                                                                 | Tests |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `sound.ts`  | Sound playback — 46 AAC sound effects in 5 categories (alert, bip-bop, staplebops, nope, yup). `playSound(src)` creates `Audio` element, returns cleanup function. `soundSrc(id)` maps sound ID to URL. |       |
| `speech.ts` | Speech-to-text — browser `SpeechRecognition` API wrapper for voice input.                                                                                                                               |       |

### DOM & UI (3 files)

| File            | Purpose                                                                                                                                                                                              | Tests |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `dom.ts`        | DOM utilities — re-exported via `index.ts`.                                                                                                                                                          |       |
| `aim.ts`        | Aim-aware hover — `createAim()` implements the "aim triangle" algorithm (like Amazon mega-menus) to prevent accidental hover exits when moving cursor toward a submenu. Uses mouse position history. |       |
| `solid-dnd.tsx` | `@thisbeyond/solid-dnd` helpers — drag-and-drop collision detection wrappers for SolidJS.                                                                                                            |       |

### Data & Encoding (3 files)

| File        | Purpose                                                                              | Tests          |
| ----------- | ------------------------------------------------------------------------------------ | -------------- |
| `base64.ts` | Base64 decode — `decode64()` wrapper around `atob` with error handling.              |                |
| `uuid.ts`   | UUID generation — `createUUID()` wrapper around `crypto.randomUUID()` with fallback. | `uuid.test.ts` |
| `same.ts`   | Deep equality — `same()` for comparing objects by JSON serialization.                |                |

### Time & Formatting (1 file)

| File      | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `time.ts` | Time formatting utilities — relative time display, duration formatting. |

### Notifications (1 file)

| File                    | Purpose                                                                                                                                 | Tests                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `notification-click.ts` | Notification click routing — `setNavigate()` stores router navigate function, notification click handlers route to the correct session. | `notification-click.test.ts` |

### State Management (2 files)

| File          | Purpose                                                                                                                                                   | Tests              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `worktree.ts` | Worktree state machine — tracks worktree creation status (`pending` → `ready` → `failed`) per directory. Deferred promise pattern for async coordination. | `worktree.test.ts` |
| `agent.ts`    | Agent-related utilities.                                                                                                                                  |                    |

### Other (2 files)

| File              | Purpose                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `comment-note.ts` | Comment/note parsing — `parseCommentNote()`, `readCommentMetadata()` for code review annotations. |
| `prompt.ts`       | Prompt-related utilities.                                                                         |
| `index.ts`        | Barrel — re-exports `dom.ts`.                                                                     |

## Test Coverage

| Test File                    | Covers                                               |
| ---------------------------- | ---------------------------------------------------- |
| `persist.test.ts`            | localStorage wrapper, cache limits, legacy migration |
| `scoped-cache.test.ts`       | LRU eviction, TTL expiry, dispose callbacks          |
| `server-health.test.ts`      | Health check polling, timeout, retry                 |
| `server-errors.test.ts`      | Error formatting, config invalid, model not found    |
| `terminal-writer.test.ts`    | Write batching, flush ordering                       |
| `runtime-adapters.test.ts`   | Capability detection, safe wrappers                  |
| `notification-click.test.ts` | Navigate function storage and routing                |
| `uuid.test.ts`               | UUID generation                                      |
| `worktree.test.ts`           | State machine transitions                            |

## Dependencies

- **SolidJS:** `solid-js` (only in `persist.ts` and `solid-dnd.tsx`)
- **Internal:** `@/context/platform`, `@/context/server` (for server utils)
- **UI library:** `@orbit.build/ui/audio/*` (46 AAC sound files), `@orbit.build/ui/theme`
- **Utilities:** `@orbit.build/util/encode` (`checksum`), `@solid-primitives/storage` (`makePersisted`)
- **External:** `@thisbeyond/solid-dnd` (drag helpers)

## Development Guide

For Orbit, these utilities are most directly reusable:

1. **`terminal-writer.ts`** — write batching pattern is critical for terminal performance. Orbit's terminal uses the same coalescing approach to prevent write interleaving.

2. **`server-health.ts`** — health polling with retry and timeout. The pattern maps to Orbit's agent-bridge health checking.

3. **`scoped-cache.ts`** — generic LRU cache with TTL and dispose. Useful for any keyed resource caching (file contents, syntax highlights, etc.).

4. **`worktree.ts`** — deferred promise state machine. Clean pattern for tracking async multi-step operations.

5. **`aim.ts`** — the Amazon mega-menu algorithm for hover-stable submenus. Reusable for any popover/dropdown that needs aim-aware hover.

## Notes

- **`sound.ts` imports 46 AAC files** — all from `@orbit.build/ui/audio/`. These are Vite asset imports (resolved to URLs at build time). Categories: alert (10), bip-bop (10), staplebops (7), nope (12), yup (6). Each has a string ID for settings persistence.
- **`persist.ts` LRU cache** is localStorage-level, not application-level. It caches raw `getItem()` values (max 500 entries, 8MB) to avoid repeated localStorage reads. Separate from `scoped-cache.ts` which is a general-purpose data cache.
- **`index.ts` is minimal** — only re-exports `dom.ts`. Most utils are imported directly by path.
- **9 test files** — most utilities have accompanying tests. Tests use HappyDOM (via `happydom.ts` preload).
