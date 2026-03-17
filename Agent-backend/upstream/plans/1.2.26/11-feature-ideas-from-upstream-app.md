# Feature Ideas from Upstream App (v1.2.26)

> **This is NOT an execution plan.** It's a pick list of features from OpenCode's SolidJS web app
> that are worth porting to Orbit's React frontend. Browse and pick when ready.
>
> Their app snapshot is at: `upstream/repo/reference/1.2.26/app/`

---

## High-Value Features

Their app is SolidJS (ours is React), so it's concept-porting, not code-copying.

| #   | Feature                         | Their Files                                           | What It Does                                                                                                          | Orbit Equivalent                                             | Effort |
| --- | ------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| 1   | **Follow-up Queue**             | `prompt-input/submit.ts`, `session-followup-dock.tsx` | Users queue multiple prompts before sending. Drafts stored, editable, sent sequentially. Optimistic UI.               | `apps/agent/src/components/input/` — add queue system        | Medium |
| 2   | **Per-Session Model Selection** | `context/local.tsx` (550 lines)                       | Each conversation maintains independent agent/model/variant. Persisted. Handoff between sessions.                     | `apps/agent/src/stores/` — add per-session model state       | Medium |
| 3   | **Terminal Reconnection**       | `components/terminal.tsx`                             | Exponential backoff (250ms \* 2^n, cap 4s). Checks if PTY still alive. Resumes from cursor position.                  | `apps/agent/src/components/terminal/` — add reconnect        | Medium |
| 4   | **Server Connection Gate**      | `app.tsx`                                             | Health check on startup. Splash during blocking check. Auto-retry 1s in background. Shows alternate servers on error. | Orbit already has health check in Tauri — compare approaches | Small  |
| 5   | **Debug Bar**                   | `components/debug-bar.tsx` (447 lines)                | CLS, INP, FPS, frame gaps, jank detection, heap usage, long tasks. Color-coded. PerformanceObserver API.              | New component — `apps/agent/src/components/debug/`           | Small  |
| 6   | **Session Prefetch**            | `global-sync/session-prefetch.ts`                     | Cursor-based pagination. TTL cache (15s). De-duplicated concurrent fetches. Rev counter for invalidation.             | `apps/agent/src/services/opencode/` — add prefetch           | Medium |
| 7   | **Revert/Restore Dock**         | `session-revert-dock.tsx`                             | Visual dock for reverting to previous message states.                                                                 | Already have rewind — compare UX patterns                    | Small  |

## Nice-to-Have

| #   | Feature                         | Notes                                                                                   |
| --- | ------------------------------- | --------------------------------------------------------------------------------------- |
| 8   | Terminal focus retry            | Multiple RAF + timed retries (0ms, 120ms, 240ms) to overcome async focus issues         |
| 9   | Titlebar theme sync             | `onThemeApplied` callback syncs titlebar light/dark with app theme                      |
| 10  | Settings consolidation          | They deleted 4 settings pages (agents, commands, mcp, permissions) — moved to inline UI |
| 11  | Prompt edit mode                | Load previous prompt into composer via `edit` prop — enables message editing            |
| 12  | Cursor-based message pagination | `x-next-cursor` header instead of offset-based                                          |

---

## Desktop Architecture Insights

### Electron Wrapper (reference only)

**Key shift: Sidecar-first, credentials-before-health.**

| Change            | Old                            | New                                | Orbit Impact                                     |
| ----------------- | ------------------------------ | ---------------------------------- | ------------------------------------------------ |
| Server detection  | Try existing → spawn new       | Always spawn local                 | Orbit already does this                          |
| Credential timing | After health check             | Before health check (immediate)    | **Check if Orbit should adopt** — faster startup |
| Loading UI        | Electron splash via ServerGate | Frontend CSS spinner, theme-aware  | Orbit uses Tauri — different pattern             |
| Multi-window      | Not supported                  | `getWindowCount()` IPC + menu item | **Useful for Orbit worktree windows**            |
| Titlebar          | Hardcoded gray (#999)          | Theme-aware (dark/light) via IPC   | **Orbit should sync titlebar with theme**        |

### Tauri Wrapper (reference only)

**Same philosophy shift as Electron, applied to Rust/Tauri.**

| Change        | Old                                                 | New                                        | Orbit Impact                                   |
| ------------- | --------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `lib.rs`      | `ServerState` + `ServerConnection` enum (236 lines) | Simple `SidecarReady` newtype (~100 lines) | **Compare with Orbit's `opencode/process.rs`** |
| `server.rs`   | External server fallback + dialog retry             | Private health check, sidecar-only         | Orbit already sidecar-only                     |
| Multi-window  | Not supported                                       | `disableHealthCheck` when >1 window        | **Useful for Orbit**                           |
| Windows ARM64 | Not supported                                       | `aarch64-pc-windows-msvc` target           | Future platform support                        |
