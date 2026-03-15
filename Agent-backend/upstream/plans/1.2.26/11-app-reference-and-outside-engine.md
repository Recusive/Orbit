# Phase 11: App Reference + Outside-Engine Changes

## How to Execute

**App: already copied to `repo/reference/1.2.26/app/`. Plugin + util: apply small diffs.**

```bash
cd Agent-backend/upstream/repo/clone

# Plugin ESM fix — apply diff
git diff v1.2.24..v1.2.26 -- packages/plugin/src/index.ts
git diff v1.2.24..v1.2.26 -- packages/plugin/src/example.ts
git diff v1.2.24..v1.2.26 -- packages/plugin/tsconfig.json

# New util file — copy
git show v1.2.26:packages/util/src/module.ts > ../../packages/util/src/module.ts
```

## Summary

This covers everything OUTSIDE `packages/opencode/src/` that we missed in the initial diff:

- Their React web app (`packages/app/`) — copied as reference
- Desktop wrappers (Electron + Tauri) — architecture insights
- Plugin SDK + util package — small but needed fixes
- Root configs

## Reference Copy

Their full `packages/app/` at v1.2.26 is at:

```
Agent-backend/upstream/reference/app-v1.2.26/
```

296 files. Use as reference when building similar features in Orbit.

---

## 11A: packages/app/ — HIGH-VALUE Features to Bring to Orbit

Their app is SolidJS (ours is React), so it's concept-porting, not code-copying.

### Must Adopt (bring the concept to Orbit)

| #   | Feature                         | Their Files                                           | What It Does                                                                                                          | Orbit Equivalent                                             |
| --- | ------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **Follow-up Queue**             | `prompt-input/submit.ts`, `session-followup-dock.tsx` | Users queue multiple prompts before sending. Drafts stored, editable, sent sequentially. Optimistic UI.               | `apps/agent/src/components/input/` — add queue system        |
| 2   | **Per-Session Model Selection** | `context/local.tsx` (550 lines)                       | Each conversation maintains independent agent/model/variant. Persisted. Handoff between sessions.                     | `apps/agent/src/stores/` — add per-session model state       |
| 3   | **Terminal Reconnection**       | `components/terminal.tsx`                             | Exponential backoff (250ms \* 2^n, cap 4s). Checks if PTY still alive. Resumes from cursor position.                  | `apps/agent/src/components/terminal/` — add reconnect        |
| 4   | **Server Connection Gate**      | `app.tsx`                                             | Health check on startup. Splash during blocking check. Auto-retry 1s in background. Shows alternate servers on error. | Orbit already has health check in Tauri — compare approaches |
| 5   | **Debug Bar**                   | `components/debug-bar.tsx` (447 lines)                | CLS, INP, FPS, frame gaps, jank detection, heap usage, long tasks. Color-coded. PerformanceObserver API.              | New component — `apps/agent/src/components/debug/`           |
| 6   | **Session Prefetch**            | `global-sync/session-prefetch.ts`                     | Cursor-based pagination. TTL cache (15s). De-duplicated concurrent fetches. Rev counter for invalidation.             | `apps/agent/src/services/opencode/` — add prefetch           |
| 7   | **Revert/Restore Dock**         | `session-revert-dock.tsx`                             | Visual dock for reverting to previous message states.                                                                 | Already have rewind — compare UX patterns                    |

### Nice-to-Have

| #   | Feature                         | Notes                                                                                   |
| --- | ------------------------------- | --------------------------------------------------------------------------------------- |
| 8   | Terminal focus retry            | Multiple RAF + timed retries (0ms, 120ms, 240ms) to overcome async focus issues         |
| 9   | Titlebar theme sync             | `onThemeApplied` callback syncs titlebar light/dark with app theme                      |
| 10  | Settings consolidation          | They deleted 4 settings pages (agents, commands, mcp, permissions) — moved to inline UI |
| 11  | Prompt edit mode                | Load previous prompt into composer via `edit` prop — enables message editing            |
| 12  | Cursor-based message pagination | `x-next-cursor` header instead of offset-based                                          |

---

## 11B: packages/desktop-electron/ — Architecture Insights

**Key shift: Sidecar-first, credentials-before-health.**

| Change            | Old                            | New                                | Orbit Impact                                     |
| ----------------- | ------------------------------ | ---------------------------------- | ------------------------------------------------ |
| Server detection  | Try existing → spawn new       | Always spawn local                 | Orbit already does this                          |
| Credential timing | After health check             | Before health check (immediate)    | **Check if Orbit should adopt** — faster startup |
| Loading UI        | Electron splash via ServerGate | Frontend CSS spinner, theme-aware  | Orbit uses Tauri — different pattern             |
| Multi-window      | Not supported                  | `getWindowCount()` IPC + menu item | **Useful for Orbit worktree windows**            |
| Titlebar          | Hardcoded gray (#999)          | Theme-aware (dark/light) via IPC   | **Orbit should sync titlebar with theme**        |
| HTML assets       | Absolute paths                 | Relative paths (for `file://`)     | N/A (Orbit uses Tauri webview)                   |

### Files Changed

- `src/main/index.ts` — Simplified initialization (-115 lines)
- `src/main/server.ts` — Removed external server support (-47 lines)
- `src/main/windows.ts` — Theme-aware titlebar
- `src/renderer/index.tsx` — Removed ServerGate, added theme sync
- `src/main/ipc.ts` — New IPC: background color, titlebar, window count
- `src/main/menu.ts` — "New Window" menu item
- `src/preload/types.ts` — TitlebarTheme type, username field

---

## 11C: packages/desktop/ (Tauri) — Architecture Insights

**Same philosophy shift as Electron, applied to Rust/Tauri.**

| Change        | Old                                                 | New                                        | Orbit Impact                                   |
| ------------- | --------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `lib.rs`      | `ServerState` + `ServerConnection` enum (236 lines) | Simple `SidecarReady` newtype (~100 lines) | **Compare with Orbit's `opencode/process.rs`** |
| `server.rs`   | External server fallback + dialog retry             | Private health check, sidecar-only         | Orbit already sidecar-only                     |
| Frontend      | `ServerGate` component                              | Direct `Show when=` guards                 | Compare with Orbit's loading state             |
| Multi-window  | Not supported                                       | `disableHealthCheck` when >1 window        | **Useful for Orbit**                           |
| Windows ARM64 | Not supported                                       | `aarch64-pc-windows-msvc` target           | Future platform support                        |

### Files Changed

- `src-tauri/src/lib.rs` — Major simplification (-136 lines)
- `src-tauri/src/server.rs` — Removed 105 lines of server detection
- `src/index.tsx` — Removed ServerGate, multi-window support
- `scripts/*.ts` — Windows ARM64 build targets

---

## 11D: packages/plugin/ — ESM Fix (MUST BRING)

| File             | Change                                                   | Why                           |
| ---------------- | -------------------------------------------------------- | ----------------------------- |
| `src/index.ts`   | `"./shell"` → `"./shell.js"`, `"./tool"` → `"./tool.js"` | ESM strict mode compatibility |
| `src/example.ts` | Same `.js` extension fix                                 | ESM                           |
| `tsconfig.json`  | `"module": "nodenext"`, `"moduleResolution": "nodenext"` | Modern Node ESM               |
| `package.json`   | Version bump                                             | Consistency                   |

**Action:** Port these 4 small changes to our `packages/plugin/` if it exists.

---

## 11E: packages/util/ — New Module Utility (SHOULD BRING)

| File                            | Change                                                                                  | Why                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/module.ts` (NEW, 10 lines) | `Module.resolve(id, dir)` — resolves package IDs from directories using `createRequire` | Used by plugin system for dependency resolution |
| `package.json`                  | Version bump                                                                            | Consistency                                     |

**Action:** Add `module.ts` to our `packages/util/`.

---

## 11F: Root Configs

| File                              | Change                                                | Action                   |
| --------------------------------- | ----------------------------------------------------- | ------------------------ |
| `package.json`                    | Added `"effect": "4.0.0-beta.31"` to catalog          | **Covered in Phase 0**   |
| `AGENTS.md`                       | "Always run `bun typecheck` from package directories" | Reference only           |
| `.gitignore`                      | `opencode.json` → `/opencode.json` (root-only)        | Port if applicable       |
| `.opencode/.gitignore`            | Added `package-lock.json`                             | N/A                      |
| `.opencode/tool/github-triage.ts` | Team roster update                                    | Skip — OpenCode-specific |

---

## 11G: Rename Notes for This Phase

| Location                    | Current                                   | Should Become               |
| --------------------------- | ----------------------------------------- | --------------------------- |
| Desktop Electron `username` | `"opencode"`                              | `"orbit"`                   |
| Tauri `ServerReadyData`     | References "opencode"                     | `"orbit"`                   |
| Plugin SDK imports          | `@opencode-ai/sdk`, `@opencode-ai/plugin` | Keep — external npm package |
| .opencode/ directory        | `.opencode/`                              | `.orbit/` (after Phase 8)   |

---

## Verification

- Reference app copied: `ls Agent-backend/upstream/reference/app-v1.2.26/`
- Plugin SDK changes compile: `cd packages/plugin && bun run typecheck`
- Util module.ts works: import test

## Files Summary

| Area                       | New              | Modified | Deleted | Total |
| -------------------------- | ---------------- | -------- | ------- | ----- |
| packages/app/ (reference)  | 296 files copied | —        | —       | 296   |
| packages/desktop-electron/ | 2                | 11       | 0       | 13    |
| packages/desktop/ (Tauri)  | 0                | 8        | 0       | 8     |
| packages/plugin/           | 0                | 4        | 0       | 4     |
| packages/util/             | 1                | 1        | 0       | 2     |
| Root configs               | 0                | 4        | 0       | 4     |
