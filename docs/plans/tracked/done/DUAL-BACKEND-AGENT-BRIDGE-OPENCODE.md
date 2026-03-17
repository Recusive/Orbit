# Dual AI Backend: Agent-bridge (Claude) + Agent-backend (OpenCode)

**Status:** REWORKED (2026-03-10) — 6 audit rounds
**Audit 1:** 4 critical + 6 recs + 8 edge cases → addressed
**Audit 2:** 3 critical + 5 edge cases → addressed
**Audit 3:** 1 critical + 5 edge cases → addressed
**Audit 4:** 0 critical, 3 advisory edge cases → acknowledged
**Audit 5 (deep):** 6 critical + 9 edge cases + 4 recs + 3 nice-to-haves → addressed
**Audit 6:** 3 critical + 4 recs + 3 nice-to-haves → **addressed in this version**

## Context

Orbit currently uses a single AI backend — **agent-bridge**, a compiled Bun sidecar wrapping the Claude Agent SDK. All AI operations (sessions, messages, tools, permissions) flow through stdin/stdout NDJSON between Tauri (Rust) and agent-bridge.

We're adding **Agent-backend** (OpenCode engine) as a second, completely separate AI backend. OpenCode is a full AI engine with 20+ LLM providers, SQLite sessions, 24 built-in tools, and an HTTP+SSE server. It ships an auto-generated TypeScript SDK (`@orbit.build/sdk` v1.2.24, zero runtime deps).

**The two backends share nothing.** When the user switches backends in settings, the entire experience changes — sessions, tools, permissions, model selection, everything. No mid-conversation switching.

### Why This Architecture

- Agent-backend already has a production HTTP+SSE API (its own TUI consumes it this way)
- The auto-generated SDK v2 gives us type-safe access to every endpoint
- No protocol translation layer needed — we consume events as Agent-backend emits them
- Rust only manages process lifecycle (spawn/health/shutdown) — zero AI protocol in Rust
- When Agent-backend updates upstream, we update the SDK and it works

---

## Architecture

```
Frontend (React)
├── Backend Mode: "claude" ──────────────────────────────────────────────
│   ClaudeChatController + existing stores/services
│   → Tauri IPC → Rust AgentBridge → stdin/stdout → agent-bridge sidecar
│   → JSONL conversations via Rust crates/conversations
│
├── Backend Mode: "opencode" ────────────────────────────────────────────
│   OcChatController + new stores/services
│   → HTTP+SSE via @orbit.build/sdk/v2 → Agent-backend server
│   → SQLite sessions managed by Agent-backend
│
├── Shared Shell (backend-agnostic) ─────────────────────────────────────
│   Layout frame, scroll containers, sidebar structure, settings shell
│   File explorer, terminal, editor, git, browser
│   → Tauri IPC → Rust crates (fs, terminal, git, lsp, search)
```

Rust manages Agent-backend's process lifecycle only:

```
src-tauri/src/opencode/process.rs
  spawn("opencode serve --port {port}") → health check loop → ready event
  shutdown() → POST /instance/dispose → SIGTERM → SIGKILL
```

---

## Audit Corrections Applied

| Audit Critical Issue                                         | How Addressed                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1: ChatInput/ChatArea not backend-agnostic**              | Separate `ClaudeChatController` and `OcChatController` with backend-specific composer, permissions, and model controls. Shared layout shell only. (Phase 3)                                                                   |
| **C2: Conversation/sidebar/title source of truth undefined** | `ConversationRepository` interface with Claude (JSONL) and OpenCode (SDK HTTP) implementations. Sidebar reads from active repository. (Phase 4)                                                                               |
| **C3: SDK contract wrong**                                   | Pinned to `@orbit.build/sdk/v2`. Events are `{ directory, payload: Event }`. Delta is `message.part.delta` (separate event). Permissions use `permission.asked`. All 45 event types mapped. (Phase 2)                         |
| **C4: Build path not executable**                            | `file:` dependency for SDK. Deterministic `scripts/build-opencode.ts` that resolves `dist/opencode-darwin-arm64/bin/opencode`, renames to `orbit-server-{target}`. Network-dependent `models.dev` fetch documented. (Phase 9) |

| Audit Edge Case                                                  | How Addressed                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend switch during health check / SSE reconnect               | `switchingBackend` guard flag; abort in-flight health check before switching (Phase 8)                                                                                                                  |
| Stale persisted `orbit-oc-sessionId` after workspace change      | Validate session exists via `GET /session/:id` on restore; fall back to session list if 404 (Phase 4)                                                                                                   |
| SSE events for wrong directory/workspace                         | Filter `event.directory !== activeDirectory` before dispatch (Phase 2)                                                                                                                                  |
| Delta before part creation                                       | Buffer deltas keyed by `partId`; flush when `message.part.updated` arrives (Phase 2)                                                                                                                    |
| Claude queued messages / permissions leaking across switch       | `cleanupClaudeState()` on switch: `clearQueue()`, `clearPermissions()`, `clearSessionCheckpoints(activeSession)` — actual store API names verified (Phase 8)                                            |
| Rewind UI for OpenCode                                           | Backend capability matrix: `supportsRewind: false` for OpenCode; rewind button hidden (Phase 3)                                                                                                         |
| Provider auth split between AccountSettings and BackendSettings  | BackendSettings selects backend + shows health only. Provider auth in dedicated `ProvidersSettings` page (always visible; live auth when OpenCode running, static catalog when Claude active) (Phase 7) |
| Offline build failures from `models.dev` fetch                   | `MODELS_DEV_API_JSON` env var pointing to cached `api.json`; CI caches the snapshot file; wrapper script pre-fetches once (Phase 9)                                                                     |
| Process crash after `opencode:ready` but before SSE subscription | Health check continues after ready; SSE connect failure triggers re-spawn (Phase 8)                                                                                                                     |

| Re-Audit Critical Issue                                            | How Addressed                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC1: ClaudeConversationRepository.create() vs optimistic remap** | `ClaudeConversationRepo.create()` preserves existing flow: posts `conversation:create` → optimistic sidebar insertion → `system:init` remap → title via Haiku. Does NOT call `conversationCreate()` Tauri command directly. (Phase 4) |
| **RC2: content-top-bar.tsx not in modified set**                   | Added to modified files. `handleNewSession` routes through `ConversationRepository.create()` based on `activeBackend`. Top-bar button + `newSession` keyboard shortcut now backend-aware. (Phase 4)                                   |
| **RC3: Phase 9 `--skip-models` flag doesn't exist upstream**       | Replaced with real upstream contract: `MODELS_DEV_API_JSON` env var pointing to a cached `api.json` file. Wrapper script pre-fetches once and reuses across builds. (Phase 9)                                                         |

| Re-Audit Edge Case                                       | How Addressed                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-bar `newSession` shortcut routed to Claude           | `content-top-bar.tsx` reads `activeBackend`, routes to correct repo (Phase 4)                                                                                                                     |
| Claude repo create diverging from remap/title flow       | `ClaudeConversationRepo.create()` delegates to `postMessage('conversation:create')`, not direct Tauri invoke (Phase 4)                                                                            |
| Offline build with no raw cached `api.json`              | Wrapper script uses committed `bootstrap-api.json` as fallback (Phase 9). No `models-snapshot.ts` fallback — that file is itself generated. (Audit 6 C2)                                          |
| OpenCode server title updates racing sidebar refresh     | `session.updated` event from SSE is authoritative — oc-event-coordinator updates `oc-session-store`, sidebar reads reactively. No manual sidebar refresh needed. (Phase 2)                        |
| Users wanting to see OpenCode providers before switching | `ProvidersSettings` page is always accessible — shows static informational catalog in Claude mode with "Switch to OpenCode to connect" banner. Live auth only when OpenCode is running. (Phase 7) |

| Re-Audit 2 Critical Issue                                                                            | How Addressed                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC2-1: ProvidersSettings preconfiguration impossible — OpenCode server is stopped in Claude mode** | `ProvidersSettings` in Claude mode is now **static/informational only**: shows a hardcoded list of supported providers (Anthropic, OpenAI, Google, etc.) with "Switch to OpenCode to connect" banner. NO live API calls — no `GET /provider`, no OAuth. Live provider list + auth only loads when OpenCode is actually running. (Phase 7) |

| Re-Audit 2 Edge Case                                                                    | How Addressed                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Opening ProvidersSettings while OpenCode is stopped                                     | Page shows static provider catalog from bundled data, not live API. No API calls attempted. (Phase 7)                                                                                                                                                                                                                          |
| OAuth started then backend switched or settings closed mid-flow                         | OAuth callbacks are fire-and-forget to the OpenCode server. If backend switches mid-OAuth: the callback completes server-side but the UI won't reflect it until user switches back to OpenCode and the provider list reloads. No dangling state — `oc-provider-store` is reloaded fresh on each OpenCode activation. (Phase 8) |
| Cleanup logic referencing nonexistent store APIs                                        | Fixed: `clearPendingPermissions()` → `clearPermissions()` (actual ToolStore API), `clearAllCheckpoints()` → `clearSessionCheckpoints(sessionId)` per active session (actual CheckpointStore API). (Phase 8)                                                                                                                    |
| Top bar and sidebar creating sessions through different abstractions                    | Both route through `ConversationRepository`. `content-top-bar.tsx` calls `getConversationRepo(activeBackend).create()`, sidebar `use-sidebar-actions.ts` calls the same. Single abstraction, no drift. (Phase 4)                                                                                                               |
| Dual OpenCode sidebar sources: `UIStore.ocConversations` vs `oc-session-store.sessions` | Removed ambiguity: `oc-session-store.sessions` is the SINGLE source of truth for OpenCode sessions. `UIStore.ocConversations` field is NOT created. `useConversationList()` hook reads from `oc-session-store` directly when backend is 'opencode'. (Phase 4/5)                                                                |

| Re-Audit 3 Edge Case                                                    | How Addressed                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static Claude-mode provider catalog drifting from real provider set     | Catalog is generated from `Agent-backend/packages/opencode/src/provider/provider.ts` at build time by `scripts/build-opencode.ts`. Output: `apps/agent/src/data/opencode-providers.json`. Regenerated on every `build:opencode` run, so it stays in sync with the binary. (Phase 9)                                                                                                          |
| Top bar and sidebar drifting to different session-creation abstractions | Enforced structurally: `getConversationRepo()` is the only export that returns a `ConversationRepository`. Both `content-top-bar.tsx` and `use-sidebar-actions.ts` import from the same barrel (`services/conversations`). An ESLint `no-restricted-syntax` rule flags direct `postMessage({ type: 'conversation:create' })` calls outside the Claude repo implementation file. (Phase 4)    |
| Cached `api.json` for `MODELS_DEV_API_JSON` going stale                 | Refresh policy: `build:opencode` (no flag) uses cached `api.json` if it exists, falls back to committed `bootstrap-api.json`. `build:opencode:full` (release builds) always fetches fresh from `models.dev` and overwrites the cache. CI runs `build:opencode:full` on release tags only; PR builds use cached. Cache file is gitignored; bootstrap file is committed. (Phase 9, Audit 6 C2) |

| Audit 5 Critical Issue                                                           | How Addressed                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A5-1: Editor mode chat still Claude-only**                                     | Added `BackendChatSurface` component shared by `ChatArea` (agent mode) and `EditorChatPanel` (editor mode). Both use the same backend branch: Claude → existing controllers, OpenCode → `OcChatController`. `EditorChatPanel` becomes a thin layout wrapper around `BackendChatSurface`. (Phase 3)                                                                          |
| **A5-2: Message store shape wrong — flat partId map loses per-message ordering** | Redesigned `oc-message-store` to store `partsByMessage: Record<messageId, OcPart[]>` (ordered array) plus `partsById: Record<partId, OcPart>` (for delta lookups). `OcMessageItem` renders from the per-message ordered array. Matches upstream TUI pattern. (Phase 5)                                                                                                      |
| **A5-3: Question UI too simple for real OpenCode contract**                      | Redesigned `OcQuestionCard` around `QuestionRequest`: renders `questions: Array<QuestionInfo>`, each with options chips/selectors, `multiple` for multi-select, `custom` for freeform input. Reply calls `sdk.question.reply({ requestID, answers: Array<QuestionAnswer> })` where each answer is `Array<string>`. (Phase 3)                                                |
| **A5-4: Provider auth incomplete — missing API key + OAuth authorize/callback**  | Redesigned `ProvidersSettings` with auth-method dispatcher: `type: 'api'` → API key input dialog, `type: 'oauth'` → `authorize()` → `Authorization { url, method: 'auto' \| 'code', instructions }` → either open URL (auto) or show code input (code) → `callback({ code? })`. (Phase 7)                                                                                   |
| **A5-5: Shared header/sidebar/workspace still Claude-owned**                     | Introduced `ConversationUiBridge` interface owning `activeTitle`, `isTitleLoading`, `create`, `rename`, `remove`, `hydrateWorkspace`. `content-top-bar.tsx`, `PrimarySidebar.openProject()`, `use-sidebar-actions.ts` all read from bridge instead of Claude-specific `UIStore` state. `ConversationRepository.create()` is the ONLY public session-creation API. (Phase 4) |
| **A5-6: Rust/build path not wired to real launch model**                         | Added `resolve_opencode_binary_path()` mirroring existing `resolve_sidecar_path()`. `OpenCodeProcess` uses `parking_lot::Mutex<Option<Child>>` matching `PreviewServerState` pattern. Root scripts updated: `dev`, `build`, `ci` all include `build:opencode`. Committed `scripts/opencode-models-cache/bootstrap-api.json` for offline first-build. (Phase 6, 9)           |

| Audit 5 Edge Case                                   | How Addressed                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor mode backend switch                          | `EditorChatPanel` delegates to `BackendChatSurface` — same branch point as agent mode (Phase 3)                                                                                                         |
| Part ordering with flat map                         | `partsByMessage` maintains insertion-order arrays per messageId; `upsertPart` inserts at correct position (Phase 5)                                                                                     |
| Multi-question `question.asked` payload             | `OcQuestionCard` renders all `questions[]` as a form; each question renders options, multi-select, freeform (Phase 3)                                                                                   |
| API-key-only provider auth                          | Auth method dispatcher: `type: 'api'` shows key input dialog, `type: 'oauth'` shows OAuth flow (Phase 7)                                                                                                |
| OAuth `authorize -> callback` with `auto` vs `code` | `auto`: open URL in browser, callback completes server-side. `code`: show instructions + code input → call `callback({ code })` (Phase 7)                                                               |
| Workspace open while OpenCode active                | `PrimarySidebar.openProject()` calls `bridge.hydrateWorkspace()` which routes to correct backend's session list (Phase 4)                                                                               |
| OpenCode title update vs shared header              | `ConversationUiBridge.activeTitle` reads from `oc-session-store` when OpenCode active, `UIStore` when Claude. SSE `session.updated` updates `oc-session-store` → bridge → header reactively (Phase 4)   |
| Missing `orbit-server` binary on startup            | `resolve_opencode_binary_path()` returns `Result`. If binary missing, `opencode_start()` returns clear error → frontend shows "OpenCode not built" in BackendSettings with build instructions (Phase 6) |
| Clean checkout offline build                        | Committed `scripts/opencode-models-cache/bootstrap-api.json` (vendor snapshot). `build:opencode` uses this when no cached `api.json` exists. (Phase 9)                                                  |

| Audit 6 Critical Issue                                                | How Addressed                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A6-1: ConversationUiBridge missing select/load/getActiveSessionId** | Added `select(sessionId)`, `restoreSelection()`, and `getActiveSessionId()` to `ConversationUiBridge`. Bridge is the single source of truth for selected session. Sidebar row highlighting, header title, and chat area all read through bridge — NEVER from `UIStore.activeConversationId` or `oc-session-store.activeSessionId` directly. `use-sidebar-actions.ts` routes `handleLoadConversation` through `bridge.select()`. (Phase 4) |
| **A6-2: Offline build fallback internally inconsistent**              | Removed all `models-snapshot.ts` fallback references (that file is itself generated, doesn't exist on clean checkout). Single precedence chain: cached `api.json` → committed `bootstrap-api.json` → FAIL with clear message. `--with-models` fetches fresh and overwrites cache. (Phase 9)                                                                                                                                               |
| **A6-3: CI rewrite drops Rust fmt/lint/test**                         | Preserved the existing `ci` script in full (all TS typechecks + ESLint + Vitest + `rust:fmt` + `rust:lint` + `rust:test`) and appended `&& bun run build:opencode`. Also wired `build:opencode` into `dev:debug`, `dev:quiet`, `build:debug`. (Phase 9)                                                                                                                                                                                   |

| Audit 6 Recommendation                                   | How Addressed                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1: Provider store only documents `GET /provider`        | `oc-provider-store` now loaded via `Promise.all([sdk.provider.list(), sdk.provider.auth()])` in lifecycle hook. `isLoading` flag shown as skeleton in `ProvidersSettings`. (Phase 5) |
| R2: Part ordering ambiguous (append vs sorted insertion) | Clarified: `upsertPart` uses sorted insertion by `part.id` matching upstream TUI binary-search pattern. Replaces in-place if part already exists. (Phase 5)                          |
| R3: Sibling dev scripts not wired                        | `dev:debug`, `dev:quiet`, `build:debug` all include `build:opencode`. Script entrypoint matrix added to Phase 9. (Phase 9)                                                           |
| R4: ProvidersSettings remount behavior                   | Documented as safe to remount — all data is store-backed, no API calls on remount. Loading skeleton while `isLoading === true`. (Phase 7)                                            |

---

## Phase 1: Foundation — Backend Mode Store + Capability Matrix

**Goal:** Global backend switch with persisted state and a typed capability contract that prevents Claude semantics from leaking into OpenCode.

### New Files

| File                                             | Purpose                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/agent/src/stores/backend/backend-store.ts` | Zustand + persist. State: `activeBackend: 'claude' \| 'opencode'`, `opencodePort: number \| null`, `opencodeHealthy: boolean`, `switchingBackend: boolean`. Actions: `setBackend()`, `setOpencodePort()`, `setOpencodeHealthy()`, `setSwitchingBackend()`. Persisted to `orbit-backend-mode`. Default: `'claude'`. |
| `apps/agent/src/stores/backend/index.ts`         | Barrel export                                                                                                                                                                                                                                                                                                      |
| `apps/agent/src/types/backend/adapter.ts`        | Backend capability matrix and adapter contract (see below)                                                                                                                                                                                                                                                         |
| `apps/agent/src/types/backend/index.ts`          | Barrel export                                                                                                                                                                                                                                                                                                      |

### Backend Capability Matrix

```typescript
// types/backend/adapter.ts
type BackendId = 'claude' | 'opencode';

interface BackendCapabilities {
  readonly rewind: boolean; // Claude: true, OpenCode: false (uses revert, different semantics)
  readonly planMode: boolean; // Claude: true, OpenCode: true (via agent system)
  readonly acceptMode: boolean; // Claude: true, OpenCode: false
  readonly thinkingMode: boolean; // Claude: true, OpenCode: false (handled per-provider)
  readonly effortLevel: boolean; // Claude: true, OpenCode: false
  readonly permissionUi: 'inline'; // Both use inline permission cards
  readonly modelSelector: 'claude-models' | 'provider-models';
  readonly titleGeneration: 'agent-bridge' | 'server-side';
  readonly conversationStorage: 'jsonl' | 'sqlite';
  readonly worktreeIsolation: boolean; // Claude: true, OpenCode: false
  readonly sessionSharing: boolean; // Claude: false, OpenCode: true
  readonly subagents: boolean; // Claude: true, OpenCode: true (via task tool)
}

const CLAUDE_CAPABILITIES: BackendCapabilities = {
  rewind: true,
  planMode: true,
  acceptMode: true,
  thinkingMode: true,
  effortLevel: true,
  permissionUi: 'inline',
  modelSelector: 'claude-models',
  titleGeneration: 'agent-bridge',
  conversationStorage: 'jsonl',
  worktreeIsolation: true,
  sessionSharing: false,
  subagents: true,
};

const OPENCODE_CAPABILITIES: BackendCapabilities = {
  rewind: false,
  planMode: true,
  acceptMode: false,
  thinkingMode: false,
  effortLevel: false,
  permissionUi: 'inline',
  modelSelector: 'provider-models',
  titleGeneration: 'server-side',
  conversationStorage: 'sqlite',
  worktreeIsolation: false,
  sessionSharing: true,
  subagents: true,
};
```

### Verification

- `useBackendStore((s) => s.activeBackend)` returns persisted value on reload
- `getCapabilities('opencode').rewind === false`
- Default is `'claude'` for existing users

---

## Phase 2: SDK Client + SSE Service (Correct v2 Contract)

**Goal:** Frontend service layer wrapping `@orbit.build/sdk/v2` with correct event envelope handling.

### Pinned SDK Contract

```typescript
// Import from v2, NOT v1
import { createOrbitClient } from '@orbit.build/sdk/v2/client';
import type { GlobalEvent, Event, Part, Session, Message } from '@orbit.build/sdk/v2';

// GlobalEvent is { directory: string, payload: Event }
// Event is discriminated union on payload.type (45 event types)
// message.part.delta is SEPARATE from message.part.updated
// permission.asked (not permission.updated)
```

### New Files

| File                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/types/opencode/index.ts`                   | Re-exports from `@orbit.build/sdk/v2`. Aliases: `OcSession` (Session), `OcMessage` (Message), `OcPart` (Part), `OcUserMessage` (UserMessage), `OcAssistantMessage` (AssistantMessage), `OcToolPart` (ToolPart), `OcTextPart` (TextPart), `OcPermissionAsked` (EventPermissionAsked properties), `OcSessionStatus` (SessionStatus). Single import point — SDK upgrades touch only this file. |
| `apps/agent/src/services/opencode/client.ts`               | Module singleton: `initClient(port, directory)`, `getClient()`, `destroyClient()`, `updateDirectory(directory)`. Uses `createOrbitClient({ baseUrl, directory })` from v2.                                                                                                                                                                                                                  |
| `apps/agent/src/services/opencode/sse-manager.ts`          | SSE connection via `sdk.event.subscribe({}, { signal })` → async iterable. Generation counter for stale event discard. Reconnect with exponential backoff (1s→2s→4s→8s, max 30s). On each event: filter by `event.directory`, dispatch `event.payload` to coordinator.                                                                                                                      |
| `apps/agent/src/services/opencode/oc-event-coordinator.ts` | Module singleton (mirrors `ChatMessageService` pattern). Owns cross-store orchestration — not just message mutations. Dispatcher on `event.payload.type`. See dispatch table below.                                                                                                                                                                                                         |
| `apps/agent/src/services/opencode/oc-session-service.ts`   | Session CRUD via SDK: `createSession()`, `deleteSession()`, `listSessions()`, `sendMessage()` (via `promptAsync`), `abortSession()`, `forkSession()`, `loadMessages()`, `replyPermission()`, `replyQuestion()`.                                                                                                                                                                             |
| `apps/agent/src/services/opencode/index.ts`                | Barrel export                                                                                                                                                                                                                                                                                                                                                                               |

### Event Dispatch Table (oc-event-coordinator.ts)

```typescript
function handleEvent(event: GlobalEvent): void {
  // CRITICAL: Filter by workspace directory
  if (event.directory !== getActiveDirectory()) return;

  const payload = event.payload;
  switch (payload.type) {
    // --- Session lifecycle ---
    case 'session.created':
      ocSessionStore.addSession(payload.properties.info);
      break;
    case 'session.updated':
      ocSessionStore.updateSession(payload.properties.info);
      // Also update sidebar title if changed
      break;
    case 'session.deleted':
      ocSessionStore.removeSession(payload.properties.info.id);
      break;
    case 'session.status':
      ocSessionStore.setSessionStatus(payload.properties.sessionID, payload.properties.status);
      break;
    case 'session.idle':
      ocSessionStore.setSessionStatus(payload.properties.sessionID, { type: 'idle' });
      break;
    case 'session.error':
      ocSessionStore.setSessionError(payload.properties.sessionID, payload.properties.error);
      break;

    // --- Messages ---
    case 'message.updated':
      ocMessageStore.upsertMessage(payload.properties.info);
      break;
    case 'message.removed':
      ocMessageStore.removeMessage(payload.properties.sessionID, payload.properties.messageID);
      break;

    // --- Parts (streaming) ---
    case 'message.part.updated':
      // Insert or replace entire part (tool state transitions, step markers, etc.)
      ocMessageStore.upsertPart(payload.properties.part);
      // Flush any buffered deltas for this partId
      ocMessageStore.flushDeltaBuffer(payload.properties.part.id);
      break;
    case 'message.part.delta':
      // Append streaming delta to field
      // If part doesn't exist yet, buffer the delta
      ocMessageStore.appendDelta(
        payload.properties.sessionID,
        payload.properties.messageID,
        payload.properties.partID,
        payload.properties.field, // usually "text"
        payload.properties.delta
      );
      break;
    case 'message.part.removed':
      ocMessageStore.removePart(payload.properties.sessionID, payload.properties.partID);
      break;

    // --- Permissions ---
    case 'permission.asked':
      ocPermissionStore.addPermission(payload.properties);
      break;
    case 'permission.replied':
      ocPermissionStore.removePermission(payload.properties.requestID);
      break;

    // --- Questions (agent → user) ---
    case 'question.asked':
      ocPermissionStore.addQuestion(payload.properties);
      break;
    case 'question.replied':
    case 'question.rejected':
      ocPermissionStore.removeQuestion(payload.properties.requestID);
      break;

    // --- File system (refresh file tree) ---
    case 'file.edited':
      // Trigger file store refresh via existing Tauri commands
      refreshFileTree(payload.properties.path);
      break;

    // --- Session compaction ---
    case 'session.compacted':
      // Reload messages for compacted session (context window was trimmed)
      ocSessionService.loadMessages(payload.properties.sessionID);
      break;

    // Ignore TUI-specific, MCP, PTY, worktree events (not applicable to our UI)
    default:
      break;
  }
}
```

### Delta Buffering (Edge Case: delta before part creation)

```typescript
// Inside oc-message-store.ts
// Uses the dual-structure store shape from Phase 5:
//   partsById: Record<partId, OcPart>        — fast lookup for delta append
//   partsByMessage: Record<messageId, OcPart[]> — ordered arrays for rendering
//   deltaBufferByPart: Record<partId, Array<{ field, delta }>> — pending deltas

appendDelta(sessionId, messageId, partId, field, delta): void {
  const session = state.sessions[sessionId];
  if (!session) return;
  const part = session.partsById[partId];
  if (!part) {
    // Part not yet created — buffer the delta
    if (!session.deltaBufferByPart[partId]) session.deltaBufferByPart[partId] = [];
    session.deltaBufferByPart[partId].push({ field, delta });
    return;
  }
  // Part exists — append directly to partsById (fast lookup)
  // Replace entire part object (avoid Immer nested mutation bug)
  const current = (part as Record<string, unknown>)[field] as string ?? '';
  const updatedPart = { ...part, [field]: current + delta };
  session.partsById[partId] = updatedPart;
  // Also update the ordered array in partsByMessage
  const msgParts = session.partsByMessage[messageId];
  if (msgParts) {
    const idx = msgParts.findIndex((p) => p.id === partId);
    if (idx !== -1) msgParts[idx] = updatedPart;
  }
}

flushDeltaBuffer(partId): void {
  // Find session containing this partId (part just arrived via upsertPart)
  const buffered = session.deltaBufferByPart[partId];
  if (!buffered || buffered.length === 0) return;
  delete session.deltaBufferByPart[partId];
  for (const { field, delta } of buffered) {
    this.appendDelta(/* ... */, partId, field, delta);
  }
}
```

### Modified Files

| File                  | Change                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `package.json` (root) | Add `"@orbit.build/sdk": "file:./Agent-backend/packages/sdk/js"` dependency |

### Verification

- `initClient(4096, '/workspace')` → `getClient()` makes successful API calls
- SSE connects, receives events, filters by directory, dispatches to coordinator
- SSE reconnects after disconnect (kill server, verify reconnection with new generation)
- Delta buffer: send delta for nonexistent part → buffer → part.updated arrives → buffer flushed → text correct

---

## Phase 3: Backend Chat Controllers (Separate, Not Shared)

**Goal:** Two distinct chat controllers — one for Claude, one for OpenCode — shared across BOTH agent-mode and editor-mode chat surfaces. (Audit 5 C1: editor mode was missed in earlier drafts.)

### Architecture (Audit 5 C1: covers both agent and editor chat surfaces)

```
BackendChatSurface (shared branch point — used by BOTH surfaces)
  ├── activeBackend === 'claude'
  │   └── ClaudeChatController
  │       ├── useChatMessages() (existing hook, untouched)
  │       ├── ChatContent (existing component, untouched)
  │       └── ChatInput with Claude controls (thinking, effort, model, rewind)
  │
  └── activeBackend === 'opencode'
      └── OcChatController
          ├── useOcChat() (new hook)
          ├── OcChatContent (new component)
          └── OcChatInput with OpenCode controls (provider/model, agent selector)

ChatArea.tsx (agent mode)
  └── BackendChatSurface surface="agent"

EditorChatPanel.tsx (editor mode)
  └── BackendChatSurface surface="editor"
```

### Why BackendChatSurface (Audit 5 C1)

`EditorChatPanel.tsx` currently imports `useChatMessages()`, `ChatInput`, `ChatMessages`, `useThinkingMode`, `useEffortLevel`, `useInputMode` — 100% Claude-specific. Without a shared branch point, switching to OpenCode in settings would leave editor mode stuck on Claude hooks. `BackendChatSurface` is the single backend branch used by both surfaces.

### Why Not Shared ChatInput

The audit correctly identified that `ChatInput.tsx` embeds:

- `useModel()` from ToolStore (Claude models only)
- `getThinkingInfo()` / `getEffortInfo()` (Claude-only adaptive thinking)
- `<PermissionModal>` / `<AskUserQuestionModal>` (Claude SDK permission flow)
- `thinking:set`, `effort:set`, `model:set` messages (Claude protocol)

These are not "settings that OpenCode doesn't use" — they're structural differences in how the two backends handle model selection, permissions, and configuration. Trying to share would create a rat's nest of conditionals.

### New Files

| File                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/BackendChatSurface.tsx`         | Shared branch point. Reads `activeBackend` from store. When `'claude'`: renders `ClaudeChatController` (wraps existing `ChatContent` + `ChatInput`). When `'opencode'`: renders `OcChatController`. Accepts `surface: 'agent' \| 'editor'` prop for layout differences. Used by both `ChatArea.tsx` and `EditorChatPanel.tsx`.                                                                                                                                                  |
| `apps/agent/src/components/chat/opencode/OcChatController.tsx`  | Top-level OpenCode chat orchestrator. Reads from `oc-session-store`, `oc-message-store`, `oc-permission-store`. Passes props to OcChatContent. Manages session creation on first send.                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/components/chat/opencode/OcChatContent.tsx`     | OpenCode chat content: message list + input. Empty state, messages state. Renders `OcMessageList` + `OcChatInput`.                                                                                                                                                                                                                                                                                                                                                              |
| `apps/agent/src/components/chat/opencode/OcChatInput.tsx`       | OpenCode-specific composer. Provider/model selector (from `oc-provider-store`). Agent selector (build/plan/explore). No thinking/effort controls. Send via `oc-session-service.sendMessage()`. Stop via `oc-session-service.abortSession()`.                                                                                                                                                                                                                                    |
| `apps/agent/src/components/chat/opencode/OcMessageList.tsx`     | Scrollable list of OpenCode messages. Virtual scrolling. Maps messageOrder → OcMessageItem. Renders parts from `partsByMessage[messageId]` (ordered array).                                                                                                                                                                                                                                                                                                                     |
| `apps/agent/src/components/chat/opencode/OcMessageItem.tsx`     | Single message: iterates `partsByMessage[messageId]` ordered array, renders by type (see Part Mapping below).                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/agent/src/components/chat/opencode/OcToolWidget.tsx`      | Tool part card. States: pending (spinner), running (spinner + title), completed (title + expandable output), error (error msg). Maps tool name to icon.                                                                                                                                                                                                                                                                                                                         |
| `apps/agent/src/components/chat/opencode/OcPermissionCard.tsx`  | Permission request card for `permission.asked`. Buttons: Allow Once, Always Allow, Deny. Calls `oc-session-service.replyPermission()`.                                                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/components/chat/opencode/OcQuestionCard.tsx`    | Question form for `question.asked`. (Audit 5 C3: redesigned for real contract.) Renders `questions: Array<QuestionInfo>` — each question shows: header, question text, option chips (single or multi-select when `multiple: true`), optional freeform input (when `custom: true`, default). Submit calls `sdk.question.reply({ requestID, answers: Array<QuestionAnswer> })` where each `QuestionAnswer` is `Array<string>`. Reject calls `sdk.question.reject({ requestID })`. |
| `apps/agent/src/components/chat/opencode/OcModelSelector.tsx`   | Provider + model picker. Groups by provider (Anthropic, OpenAI, Google, etc.). Shows connected/disconnected status. Data from `oc-provider-store`.                                                                                                                                                                                                                                                                                                                              |
| `apps/agent/src/components/chat/opencode/OcStatusIndicator.tsx` | Session status badge (idle/busy/retry with countdown).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/components/chat/opencode/index.ts`              | Barrel                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/hooks/chat/use-oc-chat.ts`                      | OpenCode chat hook. Returns: `messages`, `partsByMessage` (ordered arrays), `isAgentBusy`, `sessionId`, `handleSend`, `handleStop`, `permissions`, `questions`. Creates session on first send.                                                                                                                                                                                                                                                                                  |

### Part Type → Component Mapping

| Part Type                          | Component                                     | Notes                                               |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `TextPart`                         | Reuse existing `streamdown` markdown renderer | Same rendering engine, reads from `part.text`       |
| `ReasoningPart`                    | Reuse existing `ThinkingBox`                  | Map `part.text` to thinking content                 |
| `ToolPart`                         | `OcToolWidget` (new)                          | Purpose-built for OpenCode's 4-state tool lifecycle |
| `FilePart`                         | File attachment display                       | Image/file preview                                  |
| `StepStartPart` / `StepFinishPart` | Step boundary markers with cost/tokens        | New                                                 |
| `SnapshotPart` / `PatchPart`       | Diff display                                  | Reuse existing diff utils                           |
| `AgentPart`                        | Agent name badge                              | Shows which agent is active                         |
| `SubtaskPart`                      | Subtask card                                  | Parallel task indicator                             |
| `RetryPart`                        | Retry notice with error                       | Error recovery                                      |
| `CompactionPart`                   | Context compaction marker                     | Automatic context trimming                          |

### Modified Files

| File                                                      | Change                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/layout/chat-area/ChatArea.tsx` | Replace inline chat rendering with `<BackendChatSurface surface="agent" />`. Layout container and skeleton stay.                                                                                                                                                  |
| `apps/editor/src/components/EditorChatPanel.tsx`          | Replace Claude-specific imports (`useChatMessages`, `ChatInput`, `ChatMessages`, `useThinkingMode`, `useEffortLevel`, `useInputMode`) with `<BackendChatSurface surface="editor" />`. Becomes a thin layout wrapper — header + `BackendChatSurface`. (Audit 5 C1) |

### Verification

- Claude mode: everything works exactly as before in BOTH agent and editor mode, zero regression
- OpenCode mode: OcChatController renders in both agent and editor surfaces
- Messages stream, tools animate, question cards render multi-question forms
- Switching: no cross-contamination of props/state
- Editor mode: backend switch works the same as agent mode

---

## Phase 4: ConversationRepository — Sidebar + Title Source of Truth

**Goal:** Abstract the conversation/sidebar/title system so each backend provides its own implementation. The current system is deeply JSONL-coupled (conversation:list/load/delete, title retry/flush, remap, worktree isolation).

### Architecture

### Two Layers (Audit 5 C5: shared UI seams)

**Layer 1: ConversationRepository** — persistence/data operations (list, load, create, remove, title).

```typescript
// types/backend/conversation-repository.ts
interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messagePreview?: string;
}

interface ConversationRepository {
  list(context: {
    workspacePath: string | null;
    worktreePath: string | null;
  }): Promise<ConversationSummary[]>;
  load(sessionId: string): Promise<void>;
  create(input: { title?: string }): Promise<ConversationSummary>;
  remove(sessionId: string): Promise<void>;
  updateTitle(sessionId: string, title: string): Promise<void>;
  getActiveSessionKey(): string;
  restoreActiveSession(): string | null;
}
```

**Layer 2: ConversationUiBridge** — UI state ownership (active title, loading, selection, workspace bootstrap). Shared components (`content-top-bar`, `PrimarySidebar`, `use-sidebar-actions`, `ConversationList`) read from this bridge instead of Claude-specific UIStore state.

```typescript
// types/backend/conversation-ui-bridge.ts
interface ConversationUiBridge {
  // Active session — single source of truth for selected session (Audit 6 C1)
  getActiveSessionId(): string | null;
  select(sessionId: string): Promise<void>; // sidebar click → load + highlight
  restoreSelection(): Promise<void>; // app startup → restore persisted session
  // Active session metadata — header reads this
  getActiveMeta(): { id: string | null; title: string | null; isTitleLoading: boolean };
  // Session CRUD — all UI entrypoints go through this
  list(): ConversationSummary[];
  create(input?: { title?: string }): Promise<void>;
  rename(sessionId: string, title: string): Promise<void>;
  remove(sessionId: string): Promise<void>;
  // Workspace bootstrap — PrimarySidebar.openProject() calls this
  hydrateWorkspace(context: { workspacePath: string; worktreePath: string | null }): Promise<void>;
}
```

**Session selection ownership (Audit 6 C1):**

The bridge is the **single source of truth** for which session is selected. Shared components NEVER read `UIStore.activeConversationId` or `oc-session-store.activeSessionId` directly — they call `bridge.getActiveSessionId()`.

- **Claude bridge `select()`**: sets `UIStore.activeConversationId`, calls `conversation:load`, triggers pending-load state — mirrors current `handleLoadConversation()` in `use-sidebar-actions.ts:253-285`.
- **OpenCode bridge `select()`**: sets `oc-session-store.activeSessionId`, calls `oc-session-service.loadMessages()`. Uses the same `isLoadingConversation` / `isConversationTransitioning` UX states as Claude for the content-swap skeleton — keeping transition behavior consistent across backends.
- **Claude bridge `restoreSelection()`**: reads `localStorage['orbit-sessionId']`, validates via `conversation:load`, falls back to empty state.
- **OpenCode bridge `restoreSelection()`**: reads `localStorage['orbit-oc-sessionId']`, validates via `GET /session/:id` (404 → clear and show empty state).
- **Sidebar row highlighting**: `ConversationList.tsx` uses `bridge.getActiveSessionId()` instead of `UIStore.activeConversationId`.

The bridge delegates to the underlying store for actual state storage (`UIStore.activeConversationId` for Claude, `oc-session-store.activeSessionId` for OpenCode), but external consumers only go through the bridge.

The Claude implementation delegates to `UIStore.conversations`, `session-title-service`, and `conversationList()`. The OpenCode implementation delegates to `oc-session-store` and `oc-session-service`. Shared UI never touches backend-specific state directly.

### New Files

| File                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/types/backend/conversation-repository.ts`           | Repository interface (persistence layer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/agent/src/types/backend/conversation-ui-bridge.ts`            | UI bridge interface (Audit 5 C5: owns active title, loading state, workspace bootstrap)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/agent/src/services/conversations/claude-conversation-repo.ts` | Claude implementation. `list()` delegates to `conversationList()` Tauri command + worktree filtering. `load()` delegates to `conversationLoad()`. `create()` **preserves existing optimistic flow**: calls `postMessage({ type: 'conversation:create' })` → optimistic insertion → `system:init` remap → title via Haiku. Does NOT call `conversationCreate()` directly. `remove()` delegates to `conversationDelete()`. `updateTitle()` delegates to `conversationUpdateTitle()`. Active session key: `orbit-sessionId`. |
| `apps/agent/src/services/conversations/oc-conversation-repo.ts`     | OpenCode implementation. Uses `oc-session-service` for all operations. Active session key: `orbit-oc-sessionId`. Title: server-side. No worktree isolation. Session validation: 404 → fall back to session list.                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/services/conversations/claude-ui-bridge.ts`         | Claude UI bridge. `getActiveMeta()` reads from `UIStore.activeConversationTitle`, `session-title-service.isTitleLoading`. `hydrateWorkspace()` calls `conversationList()` → `UIStore.setConversations()`. All CRUD delegates to `claude-conversation-repo`.                                                                                                                                                                                                                                                               |
| `apps/agent/src/services/conversations/oc-ui-bridge.ts`             | OpenCode UI bridge. `getActiveMeta()` reads from `oc-session-store`. `hydrateWorkspace()` calls `oc-session-service.listSessions()` → `oc-session-store`. Title comes from `session.updated` SSE events (server-side generation).                                                                                                                                                                                                                                                                                         |
| `apps/agent/src/services/conversations/index.ts`                    | Factory: `getConversationRepo()`, `getConversationUiBridge()`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/agent/src/hooks/sidebar/use-conversation-list.ts`             | Backend-aware hook. Returns `ConversationSummary[]` from active bridge.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/agent/src/hooks/sidebar/use-conversation-meta.ts`             | Backend-aware hook. Returns `{ title, isTitleLoading }` for header. Replaces direct `useActiveConversationTitle()` in shared components.                                                                                                                                                                                                                                                                                                                                                                                  |

### Modified Files

| File                                                                            | Change                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/layout/primary-sidebar/`                             | Session list uses `useConversationList()` hook. Conversation item actions delegate to bridge.                                                                                                                                            |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`           | `openProject()` calls `bridge.hydrateWorkspace()` instead of `conversationList()` → `UIStore.setConversations()` directly. (Audit 5 C5: workspace bootstrap is backend-aware.)                                                           |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | Session selection (`handleLoadConversation`) routes through `bridge.select()`. All session CRUD routes through `ConversationUiBridge`. Worktree logic only runs when `getCapabilities(backend).worktreeIsolation === true`. (Audit 6 C1) |
| `apps/agent/src/components/layout/content-top-bar.tsx`                          | Title reads from `useConversationMeta()` instead of `useActiveConversationTitle()`. `handleNewSession` calls `bridge.create()`. (Audit 5 C5: no direct UIStore conversation reads.)                                                      |

### What Happens to UIStore.conversations

- `UIStore.conversations` stays as-is for Claude mode — `claude-ui-bridge` reads/writes it
- For OpenCode mode, `oc-ui-bridge` reads from `oc-session-store.sessions` — NO `UIStore.ocConversations` field
- `UIStore.activeConversationId` stays as Claude's internal selected-session state — `claude-ui-bridge.select()` writes it, `claude-ui-bridge.getActiveSessionId()` reads it
- Shared components NEVER read `UIStore.activeConversationId` directly — they call `bridge.getActiveSessionId()` (Audit 6 C1: single source of truth for selection)
- `UIStore.remapConversation()` only called in Claude mode
- Shared components (`content-top-bar`, `PrimarySidebar`, sidebar actions, `ConversationList`) NEVER read `UIStore.conversations`, `UIStore.activeConversationId`, or `useActiveConversationTitle()` directly — they go through the bridge hooks

### Drift Prevention (Re-Audit 3 Edge Case)

To prevent top bar and sidebar from drifting to different session-creation abstractions:

- All session creation goes through `getConversationRepo(activeBackend).create()` — the only public API
- An ESLint `no-restricted-syntax` rule flags direct `postMessage({ type: 'conversation:create' })` calls outside of `claude-conversation-repo.ts`. This catches accidental bypasses during future development.
- Both `content-top-bar.tsx` and `use-sidebar-actions.ts` import from the same barrel (`services/conversations`)

### Active Session Persistence Per Backend

```
Claude mode:   localStorage['orbit-sessionId']       → existing behavior
OpenCode mode: localStorage['orbit-oc-sessionId']    → new
```

On backend switch: read the correct key. On restore: validate session exists (OpenCode: HTTP GET, Claude: conversation:load). If stale: clear and show empty state.

### Verification

- Sidebar shows correct sessions for each backend
- Switching backend → sidebar repopulates from correct source
- Delete/rename work through both repositories
- Stale session ID after workspace change → graceful fallback

---

## Phase 5: OpenCode Frontend Stores

**Goal:** Zustand stores for OpenCode's data model. Uses plain objects (not Map) for hot paths per audit recommendation.

### New Files

| File                                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/opencode/oc-session-store.ts`    | Sessions + status. State: `sessions: Record<string, OcSession>`, `activeSessionId: string \| null` (persisted to `orbit-oc-sessionId`), `sessionStatuses: Record<string, OcSessionStatus>`, `sessionErrors: Record<string, string>`. Plain objects, not Map. LRU eviction (max 30 sessions).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/stores/opencode/oc-message-store.ts`    | Messages + parts per session. (Audit 5 C2: redesigned for per-message part ordering.) State per session: `messagesById: Record<messageId, OcMessage>`, `messageOrder: string[]`, `partsByMessage: Record<messageId, OcPart[]>` (ordered arrays — insertion order preserved), `partsById: Record<partId, OcPart>` (for delta lookups by partId), `deltaBufferByPart: Record<partId, Array<{field, delta}>>`. Actions: `upsertMessage`, `removeMessage`, `upsertPart` (inserts into `partsById` + sorted insertion by part ID into `partsByMessage[messageId]` — matches upstream TUI binary-search pattern for out-of-order robustness; replaces in-place if part already exists), `removePart`, `appendDelta` (uses `partsById` for lookup, buffers if part missing), `flushDeltaBuffer`, `clearSession`. NOT persisted. (Audit 6 R2) |
| `apps/agent/src/stores/opencode/oc-permission-store.ts` | Pending permissions + questions. State: `permissions: Record<id, OcPermissionAsked>`, `questions: Record<id, QuestionRequest>` (Audit 5 C3: full `QuestionRequest` shape with `questions: Array<QuestionInfo>`). Actions: `addPermission`, `removePermission`, `addQuestion`, `removeQuestion`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/agent/src/stores/opencode/oc-provider-store.ts`   | Available providers + auth. State: `providers: OcProvider[]`, `connectedProviders: string[]`, `defaultModels: Record<providerId, modelId>`, `authMethods: Record<providerId, Array<{ type: 'oauth' \| 'api'; label: string }>>` (Audit 5 C4: both auth method types), `isLoading: boolean`. **Initialization (Audit 6 R1):** `use-opencode-lifecycle.ts` calls `loadProviders()` on activation which runs `Promise.all([sdk.provider.list(), sdk.provider.auth()])` → populates both `providers` and `authMethods` in a single batch. `ProvidersSettings` renders a loading skeleton until `isLoading === false`. Re-fetched on every OpenCode activation (handles provider config changes between sessions).                                                                                                                         |
| `apps/agent/src/stores/opencode/index.ts`               | Barrel exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Why Plain Objects, Not Map

The audit noted that `ChatStore` deliberately avoids `Map` for session state due to Zustand middleware costs. Following the same pattern:

- `Record<string, T>` for all keyed lookups
- Immer draft mutations with whole-object replacement for nested updates
- No `persist` middleware on hot message data (only `oc-session-store.activeSessionId` is persisted)

### Verification

- `appendDelta` produces correct accumulated text
- Delta buffer fills and flushes correctly
- Tool parts transition through all 4 states
- `upsertPart` uses sorted insertion by `part.id` into `partsByMessage[messageId]` — matches upstream TUI binary-search pattern for robustness against out-of-order events (Audit 6 R2). If part already exists (same id), replaces in-place without changing position.
- `partsById` stays in sync with `partsByMessage` arrays
- LRU eviction works (add 31 sessions, oldest evicted)
- Plain object operations match Map performance for <1000 keys

---

## Phase 6: Rust Process Manager

**Goal:** Spawn, health-check, and shutdown Agent-backend. Mirrors Orbit's existing sidecar patterns. (Audit 5 C6: wired to real launch model.)

### Key Design (Audit 5 C6: mirrors existing sidecar patterns)

**Binary resolution** — mirrors `resolve_sidecar_path()` in `src-tauri/src/lib.rs:133-183`:

```rust
fn resolve_opencode_binary_path() -> Result<PathBuf, String> {
    let target_triple = /* same cfg! detection as resolve_sidecar_path */;
    let binary_name = format!("orbit-server-{target_triple}");

    // Production: look next to executable (Tauri bundle naming)
    if let Ok(exe) = env::current_exe() {
        let exe_dir = exe.parent().unwrap();
        let prod_path = exe_dir.join("orbit-server");
        if prod_path.exists() { return Ok(prod_path); }
        let named_path = exe_dir.join(&binary_name);
        if named_path.exists() { return Ok(named_path); }
    }

    // Dev: CARGO_MANIFEST_DIR/binaries/
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries").join(&binary_name);
    if dev_path.exists() { return Ok(dev_path); }

    Err(format!("orbit-server binary not found. Run `bun run build:opencode` first."))
}
```

**Process state** — uses `parking_lot::Mutex` matching `PreviewServerState` pattern in `canvas/preview.rs:79-119`:

```rust
pub struct OpenCodeProcessState {
    pub process: parking_lot::Mutex<Option<Child>>,
    pub port: parking_lot::Mutex<Option<u16>>,
    pub healthy: Arc<AtomicBool>,
    pub binary_path: parking_lot::Mutex<Option<PathBuf>>,
}
```

**Managed state injection** — follows the existing `Arc::clone` + `.manage()` pattern before `.setup()`.

**Shutdown** — explicit `RunEvent::Exit` handler alongside existing SessionManager shutdown:

```rust
// In RunEvent::Exit handler (alongside agent-bridge shutdown):
let oc_state = app.state::<OpenCodeProcessState>();
if let Some(mut child) = oc_state.process.lock().take() {
    // POST /instance/dispose, then SIGTERM, then SIGKILL
}
```

### New Files

| File                                           | Purpose                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/opencode/mod.rs`                | Module declaration                                                                                                                                                         |
| `src-tauri/src/opencode/process.rs`            | `OpenCodeProcessState`, `resolve_opencode_binary_path()`, `spawn()`, `shutdown()`, `is_healthy()`                                                                          |
| `src-tauri/src/commands/opencode/mod.rs`       | Command module                                                                                                                                                             |
| `src-tauri/src/commands/opencode/lifecycle.rs` | Tauri commands: `opencode_start` (resolves binary, spawns, health checks), `opencode_stop`, `opencode_status`. If binary missing → returns clear error string (not panic). |

### Modified Files

| File                            | Change                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`          | Add `mod opencode`. Register commands. Add `OpenCodeProcessState` via `.manage()` (separate from `SessionManager`, uses `parking_lot::Mutex`). Shutdown in `RunEvent::Exit` alongside agent-bridge. `resolve_opencode_binary_path()` called at init — stores in managed state. If missing → logs warning, sets `binary_path: None` (frontend shows "not built" in BackendSettings). |
| `src-tauri/src/commands/mod.rs` | Add `pub mod opencode`                                                                                                                                                                                                                                                                                                                                                              |
| `src-tauri/tauri.conf.json`     | Add `"binaries/orbit-server"` to `externalBin`                                                                                                                                                                                                                                                                                                                                      |

### Verification

- `opencode_start()` returns port, `opencode:ready` emitted
- `opencode_start()` with missing binary → returns error string "orbit-server not found"
- `opencode_stop()` process exits, port freed
- Kill process manually → `opencode:crashed` emitted
- Port conflict → retry with new port (max 5)
- `RunEvent::Exit` → OpenCode process shut down alongside agent-bridge

---

## Phase 7: Settings Pages

**Goal:** Backend toggle in settings. Provider auth as separate page (not crammed into BackendSettings).

### New Files

| File                                                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/modals/settings/pages/BackendSettings.tsx`   | Radio group: "Claude Agent SDK" / "OpenCode Engine". Warning: "Switching ends active sessions." When opencode selected: connection status indicator (green/red dot + port), Start/Stop/Restart buttons. No provider auth here — just backend selection + health.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/agent/src/components/modals/settings/pages/ProvidersSettings.tsx` | Always visible. **When OpenCode active:** live provider list from `oc-provider-store`. Each provider shows: name, connected status, available auth methods from `authMethods: Array<{ type: 'oauth' \| 'api', label }>`. (Audit 5 C4: full auth method support.) **Auth method dispatcher:** `type: 'api'` → inline API key input + save (calls `sdk.auth.set()`). `type: 'oauth'` → calls `sdk.provider.oauth.authorize()` → receives `Authorization { url, method: 'auto' \| 'code', instructions }` → if `method === 'auto'`: opens URL in browser, callback completes server-side → if `method === 'code'`: shows instructions + code input field → on submit calls `sdk.provider.oauth.callback({ code })`. Default model selector per provider. **When Claude active (OpenCode stopped):** static provider catalog from `opencode-providers.json` (build-time generated). Shows "Switch to OpenCode to connect" banner. No API calls. |

### Modified Files

| File                                                            | Change                                                                                                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/modals/settings/types.ts`            | Add `'backend'` and `'providers'` to `SettingsSection` union                                                                                                                                                          |
| `apps/agent/src/components/modals/settings/SettingsSidebar.tsx` | Add "Backend" nav item (first position). Add "Providers" nav item (after "Agent", always visible). When Claude active, Providers page shows static informational catalog with "Switch to OpenCode to connect" banner. |
| `apps/agent/src/components/modals/settings/SettingsDialog.tsx`  | Add cases for `'backend'` and `'providers'` rendering                                                                                                                                                                 |
| `apps/agent/src/components/modals/settings/pages/index.ts`      | Export new pages, add to `SETTINGS_PAGE_COMPONENTS`                                                                                                                                                                   |

### Auth UX Separation (Audit Recommendation R4)

- `AccountSettings` stays as-is — Claude OAuth / API key management
- `ProvidersSettings` (new) — OpenCode provider auth (20+ providers)
- `BackendSettings` — only selects backend + shows health status
- No duplication: each auth flow lives in exactly one page

### ProvidersSettings Remount Behavior (Audit 6 R4)

`ProvidersSettings` is safe to remount. All provider data is backed by `oc-provider-store` (populated by lifecycle hook on activation). Remounting triggers a fresh read from the store, not new API calls. Loading skeleton shown while `oc-provider-store.isLoading === true`. OAuth flows in progress are not interrupted by remount — they complete server-side and the store refreshes on next activation.

### Verification

- Backend toggle visible, persists choice
- Providers page visible in both modes: live list when OpenCode active, static catalog when Claude active
- API-key auth: enter key → save → provider shows as connected
- OAuth `auto` method: click Connect → browser opens → callback completes → provider connected
- OAuth `code` method: click Connect → instructions shown → paste code → submit → provider connected
- Provider connect button only active when OpenCode is running; disabled/hidden in Claude mode
- Switch to Claude → switch back to OpenCode → provider list reloads fresh from API

---

## Phase 8: Lifecycle Integration + Backend Switch Cleanup

**Goal:** Wire process manager to frontend. Handle all switch edge cases.

### New Files

| File                                                      | Purpose                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts` | App-level hook. Startup: if `activeBackend === 'opencode'`, invoke `opencode_start()`, wait for `opencode:ready`, `initClient()`, `sseManager.connect()`, load sessions. Switch to opencode: same. Switch to claude: `cleanupOpenCodeState()`, disconnect SSE, destroy client, `opencode_stop()`. Crash: toast + auto-restart (max 3). |
| `apps/agent/src/lib/api/opencode.ts`                      | Tauri command wrappers: `opencodeStart()`, `opencodeStop()`, `opencodeStatus()`                                                                                                                                                                                                                                                        |

### Backend Switch Cleanup (Audit Edge Case)

```typescript
// When switching FROM Claude TO OpenCode:
function cleanupClaudeState(): void {
  // Clear Claude-specific transient state — using ACTUAL store API names
  useQueuedMessageStore.getState().clearQueue(); // exists: queued-message-store.ts:21
  useToolStore.getState().clearPermissions(); // exists: tool-store.ts:317 (NOT clearPendingPermissions)
  // Checkpoint cleanup is per-session, not global:
  const activeSession = useChatStore.getState().activeSessionId;
  if (activeSession) {
    useCheckpointStore.getState().clearSessionCheckpoints(activeSession); // exists: checkpoint-store.ts:169
  }
  // Don't clear UIStore.conversations — they persist for when user switches back
  // Don't clear ChatStore — session data stays cached
}

// When switching FROM OpenCode TO Claude:
function cleanupOpenCodeState(): void {
  // Disconnect SSE
  sseManager.disconnect();
  // Clear OpenCode-specific transient state
  useOcPermissionStore.getState().clearAll();
  useOcMessageStore.getState().clearAll();
  // Don't clear oc-session-store.sessions — they persist for when user switches back
  // Destroy SDK client
  destroyClient();
}
```

### Switch-During-Health-Check Guard (Audit Edge Case)

```typescript
// use-opencode-lifecycle.ts
const abortController = useRef<AbortController | null>(null);

async function startOpenCode(): Promise<void> {
  // Cancel any in-flight startup
  abortController.current?.abort();
  abortController.current = new AbortController();
  const signal = abortController.current.signal;

  backendStore.setSwitchingBackend(true);
  try {
    const port = await opencodeStart();
    if (signal.aborted) return; // User switched away during startup

    backendStore.setOpencodePort(port);
    initClient(port, workspacePath);

    if (signal.aborted) {
      destroyClient();
      return;
    }

    sseManager.connect(port, signal);
    await ocSessionService.listSessions();

    if (signal.aborted) {
      sseManager.disconnect();
      destroyClient();
      return;
    }

    backendStore.setOpencodeHealthy(true);
  } catch (error) {
    if (!signal.aborted) {
      showToast('Failed to start OpenCode backend', 'error');
    }
  } finally {
    backendStore.setSwitchingBackend(false);
  }
}
```

### Modified Files

| File                                          | Change                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/agent/src/providers/tauri-provider.tsx` | Register listeners for `opencode:ready`, `opencode:crashed` Tauri events → dispatch to BackendStore |
| `apps/agent/src/App.tsx`                      | Mount `useOpencodeLifecycle()` hook at app level                                                    |

### Verification

- App starts with correct backend from persisted preference
- Switch to opencode → process starts → SSE connects → sessions load
- Switch to claude → SSE disconnects → process stops → Claude sessions appear
- Switch rapidly back and forth → abort guards prevent stale state
- Process crash → toast → auto-restart (up to 3) → SSE reconnects
- Claude queued messages do NOT appear in OpenCode mode after switch

---

## Phase 9: Build System (Deterministic)

**Goal:** Compile Agent-backend binary and bundle as Tauri sidecar with a reproducible build path.

### Build Script

```typescript
// scripts/build-opencode.ts
// 1. cd Agent-backend
// 2. Models snapshot resolution (single precedence chain — Audit 6 C2):
//      const cachePath = "scripts/opencode-models-cache/api.json";
//      const bootstrapPath = "scripts/opencode-models-cache/bootstrap-api.json";
//      If --with-models flag: fetch from models.dev → save to cachePath → use cachePath
//      Else if cachePath exists: use cachePath (previous build's cache)
//      Else if bootstrapPath exists: use bootstrapPath (committed vendor snapshot)
//      Else: FAIL with "No cached or bootstrap provider snapshot. Run with --with-models first."
//    Set MODELS_DEV_API_JSON=<resolved path> (bypasses network fetch in upstream build)
// 3. Run: ./packages/opencode/script/build.ts --single
//    Output: dist/opencode-{platform}-{arch}/bin/opencode (e.g. dist/opencode-darwin-arm64/bin/opencode)
// 4. Copy to: src-tauri/binaries/orbit-server-aarch64-apple-darwin
// 5. Generate static provider catalog:
//    Parse Agent-backend/packages/opencode/src/provider/provider.ts → extract provider names/types
//    Write to: apps/agent/src/data/opencode-providers.json
//    (Used by ProvidersSettings in Claude mode when OpenCode server isn't running)
// 6. Verify binary exists and is executable
// 7. Fail loudly if any step fails
```

### New Files

| File                        | Purpose                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/build-opencode.ts` | Deterministic build script. Resolves `Agent-backend/packages/opencode/dist/opencode-{platform}-{arch}/bin/opencode`. Copies + renames to `src-tauri/binaries/orbit-server-{target}`. |

### New Committed Files

| File                                               | Purpose                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/opencode-models-cache/bootstrap-api.json` | Vendor snapshot of models.dev API response. Committed to repo so first-time / offline builds work without network. Updated manually when releasing new provider support. `build:opencode` falls back to this when no cached `api.json` exists. |

### Modified Files

| File                        | Change                                                |
| --------------------------- | ----------------------------------------------------- |
| `src-tauri/tauri.conf.json` | Add `"binaries/orbit-server"` to `externalBin`        |
| `package.json` (root)       | Add scripts AND wire into existing chains (see below) |

### Root Script Integration (Audit 5 C6)

The existing dev/build/CI scripts must include `build:opencode` alongside `build:sidecar`:

```jsonc
// package.json — scripts section
{
  // New standalone scripts
  "build:opencode": "bun run scripts/build-opencode.ts",
  "build:opencode:full": "bun run scripts/build-opencode.ts --with-models",

  // Updated existing scripts (add build:opencode AFTER build:sidecar)
  "dev": "bun run build:sidecar && bun run build:opencode && ORBIT_LOG_MODE=dev tauri dev",
  "build": "bun run build:sidecar && bun run build:opencode:full && ./scripts/build-with-env.sh",
  // Preserve current CI semantics (includes Rust fmt/lint/test), then add OpenCode build (Audit 6 C3)
  "ci": "bun run typecheck && bun run canvas:typecheck && bun run common:typecheck && bun run bridge:typecheck && bun run schemas:typecheck && bun run lint && bun run test && bun run rust:fmt && bun run rust:lint && bun run rust:test && bun run build:opencode",

  // Wire into sibling dev scripts too (Audit 6 R3)
  "dev:debug": "bun run build:sidecar && bun run build:opencode && ORBIT_LOG_MODE=debug tauri dev",
  "dev:quiet": "bun run build:sidecar && bun run build:opencode && ORBIT_LOG_MODE=prod tauri dev",
  "build:debug": "bun run build:sidecar && bun run build:opencode && ./scripts/build-with-env.sh --debug",
}
```

**Why `build:opencode` (not `:full`) in `dev`:** Dev builds use cached `api.json` or committed `bootstrap-api.json` — no network fetch. Fast iteration.

**Why `build:opencode:full` in `build`:** Release builds fetch fresh models from `models.dev` to ensure the provider catalog is current.

**Why `build:opencode` (not `:full`) in `ci`:** PR CI validates the binary compiles but doesn't need fresh models. Release CI (tag trigger) should use `:full`.

**Script entrypoint matrix (Audit 6 N3):**

| Script        | `build:sidecar`  | `build:opencode` | Notes                     |
| ------------- | :--------------: | :--------------: | ------------------------- |
| `dev`         |       Yes        |       Yes        | cached/bootstrap snapshot |
| `dev:debug`   |       Yes        |       Yes        | cached/bootstrap snapshot |
| `dev:quiet`   |       Yes        |       Yes        | cached/bootstrap snapshot |
| `build`       |       Yes        |  Yes (`:full`)   | fresh models.dev fetch    |
| `build:debug` |       Yes        |       Yes        | cached/bootstrap snapshot |
| `ci`          | No (source-only) |       Yes        | after TS/Rust validation  |

### Network Dependency (Audit Issue C4 + Re-Audit RC3)

The upstream build script uses `MODELS_DEV_API_JSON` env var (NOT a `--skip-models` flag — that doesn't exist):

- **Default (dev/CI)**: `scripts/build-opencode.ts` sets `MODELS_DEV_API_JSON` to resolved path. Precedence: cached `api.json` → committed `bootstrap-api.json` → FAIL. No `models-snapshot.ts` fallback — that file is itself generated and won't exist on a clean checkout. (Audit 6 C2)
- **`--with-models` flag**: fetches fresh from `models.dev`, saves to `api.json` cache, then builds. For releases.
- **CI**: caches `scripts/opencode-models-cache/api.json` across runs. First run uses committed `bootstrap-api.json`.
- **If `--with-models` fetch fails**: falls back to cached `api.json` if it exists, otherwise `bootstrap-api.json`, otherwise FAIL with clear message.

### Binary Name Mapping

| Upstream Output                           | Tauri Sidecar Name                                         |
| ----------------------------------------- | ---------------------------------------------------------- |
| `dist/opencode-darwin-arm64/bin/opencode` | `src-tauri/binaries/orbit-server-aarch64-apple-darwin`     |
| `dist/opencode-darwin-x64/bin/opencode`   | `src-tauri/binaries/orbit-server-x86_64-apple-darwin`      |
| `dist/opencode-linux-x64/bin/opencode`    | `src-tauri/binaries/orbit-server-x86_64-unknown-linux-gnu` |

### Verification

- `bun run build:opencode` produces binary at correct path
- `bun run build:opencode` generates `apps/agent/src/data/opencode-providers.json` (static catalog)
- `bunx tauri build` includes binary in .app bundle
- Binary starts when invoked by Rust process manager
- Build works offline with cached/generated `api.json` (uses `MODELS_DEV_API_JSON` env var)
- `bun run build:opencode:full` fetches fresh models + overwrites cache

---

## File Inventory Summary

### New Files (46 + 1 generated + 1 committed data + 1 gitignored)

**Types (5)**

- `apps/agent/src/types/backend/adapter.ts` — Capability matrix
- `apps/agent/src/types/backend/conversation-repository.ts` — Repository interface
- `apps/agent/src/types/backend/conversation-ui-bridge.ts` — UI bridge interface (Audit 5 C5: owns active title, loading, workspace bootstrap)
- `apps/agent/src/types/backend/index.ts`
- `apps/agent/src/types/opencode/index.ts` — SDK v2 re-exports

**Stores (7)**

- `apps/agent/src/stores/backend/backend-store.ts`
- `apps/agent/src/stores/backend/index.ts`
- `apps/agent/src/stores/opencode/oc-session-store.ts`
- `apps/agent/src/stores/opencode/oc-message-store.ts`
- `apps/agent/src/stores/opencode/oc-permission-store.ts`
- `apps/agent/src/stores/opencode/oc-provider-store.ts`
- `apps/agent/src/stores/opencode/index.ts`

**Services (10)**

- `apps/agent/src/services/opencode/client.ts`
- `apps/agent/src/services/opencode/sse-manager.ts`
- `apps/agent/src/services/opencode/oc-event-coordinator.ts`
- `apps/agent/src/services/opencode/oc-session-service.ts`
- `apps/agent/src/services/opencode/index.ts`
- `apps/agent/src/services/conversations/claude-conversation-repo.ts`
- `apps/agent/src/services/conversations/oc-conversation-repo.ts`
- `apps/agent/src/services/conversations/claude-ui-bridge.ts` — Claude UI bridge (Audit 5 C5: reads UIStore, delegates to claude-conversation-repo)
- `apps/agent/src/services/conversations/oc-ui-bridge.ts` — OpenCode UI bridge (Audit 5 C5: reads oc-session-store, delegates to oc-conversation-repo)
- `apps/agent/src/services/conversations/index.ts`

**Components (14)**

- `apps/agent/src/components/chat/BackendChatSurface.tsx` — Shared backend branch point (Audit 5 C1: covers agent + editor mode)
- `apps/agent/src/components/chat/opencode/OcChatController.tsx`
- `apps/agent/src/components/chat/opencode/OcChatContent.tsx`
- `apps/agent/src/components/chat/opencode/OcChatInput.tsx`
- `apps/agent/src/components/chat/opencode/OcMessageList.tsx`
- `apps/agent/src/components/chat/opencode/OcMessageItem.tsx`
- `apps/agent/src/components/chat/opencode/OcToolWidget.tsx`
- `apps/agent/src/components/chat/opencode/OcPermissionCard.tsx`
- `apps/agent/src/components/chat/opencode/OcQuestionCard.tsx` — Full QuestionRequest rendering (Audit 5 C3)
- `apps/agent/src/components/chat/opencode/OcModelSelector.tsx`
- `apps/agent/src/components/chat/opencode/OcStatusIndicator.tsx`
- `apps/agent/src/components/chat/opencode/index.ts`
- `apps/agent/src/components/modals/settings/pages/BackendSettings.tsx`
- `apps/agent/src/components/modals/settings/pages/ProvidersSettings.tsx` — Full auth method dispatcher (Audit 5 C4)

**Hooks (4)**

- `apps/agent/src/hooks/chat/use-oc-chat.ts`
- `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`
- `apps/agent/src/hooks/sidebar/use-conversation-list.ts`
- `apps/agent/src/hooks/sidebar/use-conversation-meta.ts` — Backend-aware title/loading for header (Audit 5 C5)

**API (1)**

- `apps/agent/src/lib/api/opencode.ts`

**Rust (4)**

- `src-tauri/src/opencode/mod.rs`
- `src-tauri/src/opencode/process.rs` — `OpenCodeProcessState`, `resolve_opencode_binary_path()` (Audit 5 C6)
- `src-tauri/src/commands/opencode/mod.rs`
- `src-tauri/src/commands/opencode/lifecycle.rs`

**Scripts (1)**

- `scripts/build-opencode.ts`

**Committed Data (1)**

- `scripts/opencode-models-cache/bootstrap-api.json` — Vendor snapshot of models.dev API. Committed for offline first-build. (Audit 5 C6)

**Generated Data (1)**

- `apps/agent/src/data/opencode-providers.json` — Static provider catalog generated by `build-opencode.ts` from Agent-backend source. Used by `ProvidersSettings` in Claude mode. Regenerated on every `build:opencode` run.

**Gitignored (1)**

- `scripts/opencode-models-cache/api.json` — Live cached models data. Populated by `build:opencode:full`, reused by `build:opencode`. NOT committed (ephemeral cache).

### Modified Files (16)

- `src-tauri/src/lib.rs` — register opencode module + commands + `OpenCodeProcessState` managed state (separate from SessionManager, uses `parking_lot::Mutex`), shutdown in `RunEvent::Exit`
- `src-tauri/src/commands/mod.rs` — add `pub mod opencode`
- `src-tauri/tauri.conf.json` — add `"binaries/orbit-server"` to `externalBin`
- `package.json` (root) — add `@orbit.build/sdk` file dep, `build:opencode` scripts, wire into `dev`/`build`/`ci`
- `apps/agent/src/components/layout/chat-area/ChatArea.tsx` — replace inline chat with `<BackendChatSurface surface="agent" />`
- `apps/agent/src/components/layout/content-top-bar.tsx` — title via `useConversationMeta()`, `handleNewSession` via `bridge.create()` (Audit 5 C5)
- `apps/agent/src/components/layout/primary-sidebar/` — use `useConversationList()` hook
- `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx` — `openProject()` via `bridge.hydrateWorkspace()` (Audit 5 C5)
- `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — route through `ConversationUiBridge`
- `apps/agent/src/components/modals/settings/types.ts` — add `'backend'`, `'providers'` sections
- `apps/agent/src/components/modals/settings/SettingsSidebar.tsx` — add Backend + Providers nav items
- `apps/agent/src/components/modals/settings/SettingsDialog.tsx` — add new section cases
- `apps/agent/src/components/modals/settings/pages/index.ts` — export new pages
- `apps/agent/src/providers/tauri-provider.tsx` — `opencode:ready`, `opencode:crashed` Tauri event listeners
- `apps/agent/src/App.tsx` — mount `useOpencodeLifecycle()` hook
- `apps/editor/src/components/EditorChatPanel.tsx` — replace Claude-specific imports with `<BackendChatSurface surface="editor" />` (Audit 5 C1)

### Untouched

- `agent-bridge/` — zero changes
- `Agent-backend/` — zero changes (consumed as-is via SDK + binary)
- All existing Claude stores, services, components — unchanged when backend is 'claude'
- `ChatContent.tsx`, `ChatInput.tsx`, `use-chat-messages.ts`, `chat-actions.ts`, `agent-sdk-handlers.ts`, `conversation-handlers.ts`, `session-title-service.ts` — all untouched (Claude path preserved as-is)
- File explorer, terminal, editor, git, browser — backend-agnostic, unchanged

---

## Implementation Order

```
Phase 1 (Foundation)        → no dependencies
Phase 2 (SDK + SSE)         → Phase 1 (needs types)
Phase 3 (Chat Controllers)  → Phase 2, 5 (needs stores + services)
Phase 4 (ConversationRepo)  → Phase 1, 2, 5 (interface needs types; impls need oc-session-store + oc-session-service)
Phase 5 (Stores)            → Phase 1 (needs types)
Phase 6 (Rust process)      → no dependencies
Phase 7 (Settings)          → Phase 1, 5 (needs stores)
Phase 8 (Lifecycle)         → Phase 2, 6, 7 (needs SDK + Rust + settings)
Phase 9 (Build)             → Phase 6 (needs Rust process config)
```

**Recommended sequence:**

1. Phase 1 + 6 (foundation + Rust, parallel — no dependencies)
2. Phase 2 + 5 (SDK + stores, parallel — both need Phase 1 only)
3. Phase 3 + 4 (chat controllers + conversation repos, parallel — both need Phase 2 + 5)
4. Phase 7 + 8 (settings + lifecycle)
5. Phase 9 (build/bundle — wire into dev/build/ci)

---

## Test Plan (Audit Recommendation R5)

### New Tests Required

| Test                               | Scope       | What It Validates                                                                                                                                                                                     |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend-store.test.ts`            | Unit        | Persist/restore, switch guards, cleanup triggers                                                                                                                                                      |
| `oc-message-store.test.ts`         | Unit        | Delta append, delta buffer flush, part upsert into both `partsById` and `partsByMessage`, part ordering preserved, LRU eviction, Immer whole-object replacement (Audit 5 C2)                          |
| `oc-event-coordinator.test.ts`     | Unit        | Event dispatch for all 15+ handled event types, directory filtering, delta-before-part buffering                                                                                                      |
| `oc-conversation-repo.test.ts`     | Unit        | Session list/create/delete mapping, stale session validation                                                                                                                                          |
| `claude-conversation-repo.test.ts` | Unit        | Delegates to existing Tauri commands correctly, does NOT call `conversationCreate()` directly                                                                                                         |
| `use-conversation-list.test.ts`    | Unit        | Backend-aware hook returns correct data source                                                                                                                                                        |
| `use-conversation-meta.test.ts`    | Unit        | Returns title/loading from correct bridge per backend (Audit 5 C5)                                                                                                                                    |
| `conversation-ui-bridge.test.ts`   | Unit        | `select()` sets correct store per backend, `getActiveSessionId()` reads from correct store, `restoreSelection()` validates and handles stale/404 sessions, sidebar highlight uses bridge (Audit 6 C1) |
| `backend-switch-cleanup.test.ts`   | Integration | Switch Claude→OpenCode: Claude queued messages cleared. Switch OpenCode→Claude: SSE disconnected, OpenCode permissions cleared.                                                                       |
| `sse-manager.test.ts`              | Unit        | Reconnect backoff, generation counter, directory filter                                                                                                                                               |
| `build-opencode.test.ts`           | Script      | Binary produced at expected path, rename correct, `bootstrap-api.json` used when no cache                                                                                                             |
| `backend-chat-surface.test.tsx`    | Unit        | Renders `ClaudeChatController` in claude mode, `OcChatController` in opencode mode. Works with both `surface="agent"` and `surface="editor"`. (Audit 5 C1)                                            |
| `oc-question-card.test.tsx`        | Unit        | Renders multi-question form with options, multi-select, freeform. Reply sends `Array<QuestionAnswer>` with correct shape. Reject calls `question.reject`. (Audit 5 C3)                                |
| `providers-settings.test.tsx`      | Unit        | Shows static catalog in Claude mode (no API calls). Shows live provider list in OpenCode mode. API-key auth flow. OAuth auto + code flows. (Audit 5 C4)                                               |
| `resolve-binary.test.rs`           | Rust        | `resolve_opencode_binary_path()` finds prod path, falls back to dev, returns error when missing (Audit 5 C6)                                                                                          |

### Existing Tests to Verify (No Regressions)

- `tool-store.test.ts` — Claude model/thinking/effort state unchanged
- `model-selector.test.tsx` — Claude model picker unchanged
- `use-sidebar-actions.test.tsx` — Sidebar actions still work in Claude mode
- `use-chat-messages-title.test.tsx` — Title generation in Claude mode unchanged

### Smoke Test (Audit Nice-to-Have N3)

```bash
# Desktop smoke test script
# 1. Build opencode binary
# 2. Start Tauri app
# 3. Switch to OpenCode backend in settings
# 4. Verify process spawned (check port)
# 5. Send one prompt via UI automation or direct HTTP
# 6. Verify response received
# 7. Switch back to Claude
# 8. Verify opencode process stopped
```

---

## Risks and Mitigations

| Risk                                           | Mitigation                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE reconnection race (stale events)           | Generation counter — discard events from old connections                                                                                                     |
| Process crash mid-conversation                 | Save activeSessionId. Session persists in SQLite. Reload via API after restart.                                                                              |
| Backend switch while agent busy                | Confirmation dialog. If confirmed, abort session first, then cleanup.                                                                                        |
| Backend switch during startup/health-check     | AbortController guard — cancel in-flight operations on switch                                                                                                |
| Workspace directory change                     | Watch workspacePath; call `updateDirectory()` on SDK client, reconnect SSE                                                                                   |
| Port conflict on spawn                         | Verify port free, retry with new port (max 5)                                                                                                                |
| Stale persisted session after workspace change | Validate via HTTP GET on restore; 404 → clear and show empty state                                                                                           |
| Delta arrives before part created              | Delta buffer per partId; flush when `message.part.updated` arrives                                                                                           |
| Claude state leaks across switch               | `cleanupClaudeState()` / `cleanupOpenCodeState()` on every switch                                                                                            |
| OpenCode has no Claude-style rewind            | Capability matrix: `rewind: false` → rewind button hidden                                                                                                    |
| `models.dev` fetch fails in CI                 | `MODELS_DEV_API_JSON` env var with cached `api.json` → committed `bootstrap-api.json` fallback chain; FAIL with clear message if neither exists (Audit 6 C2) |
| Upstream binary name mismatch                  | `scripts/build-opencode.ts` does explicit rename                                                                                                             |

---

## Verification (End-to-End)

1. **Start app in Claude mode** — everything works exactly as before, zero regressions
2. **Editor mode in Claude** — `EditorChatPanel` renders via `BackendChatSurface`, same behavior as before (Audit 5 C1)
3. **Switch to OpenCode in settings** — process spawns, SSE connects, sidebar loads OpenCode sessions
4. **Create new OpenCode session** — appears in sidebar with auto-generated title
5. **Send message** — streaming text via SSE `message.part.delta` events
6. **Part ordering** — parts render in correct per-message order via `partsByMessage` arrays (Audit 5 C2)
7. **Tool execution** — OcToolWidget shows pending → running → completed/error
8. **Permission request** — OcPermissionCard appears from `permission.asked`, approve/deny works
9. **Question from agent** — OcQuestionCard renders multi-question form with options, multi-select, freeform (Audit 5 C3)
10. **Provider auth (API key)** — enter key in ProvidersSettings → save → provider connected (Audit 5 C4)
11. **Provider auth (OAuth)** — Connect → authorize URL → callback → provider connected (Audit 5 C4)
12. **Editor mode in OpenCode** — `EditorChatPanel` renders OcChatController, same as agent mode (Audit 5 C1)
13. **Header title** — reads from `useConversationMeta()`, updates reactively for both backends (Audit 5 C5)
14. **Workspace open** — `PrimarySidebar.openProject()` loads sessions from correct backend (Audit 5 C5)
15. **Switch back to Claude** — OpenCode process stops, Claude sessions appear, no leaked state
16. **Switch rapidly 3 times** — abort guards prevent stale connections
17. **Kill OpenCode process** — crash detected, toast, auto-restart, SSE reconnects
18. **App restart** — correct backend starts based on persisted preference
19. **Missing binary** — `opencode_start()` returns "orbit-server not found" error, settings shows build instructions (Audit 5 C6)
20. **Stale session restore** — returns 404, falls back gracefully
21. **`bun run check`** — TypeScript, ESLint, tests pass
22. **`cargo clippy`** — no warnings
23. **`bun run dev`** — builds both sidecar AND opencode binary before starting Tauri (Audit 5 C6)
24. **`bun run build:opencode`** — binary produced, renamed, placed correctly; uses `bootstrap-api.json` offline
25. **`bunx tauri build`** — both sidecar + opencode binary included in .app bundle

---

## Source Reference

All files explored during planning. Read these for full context before reviewing or implementing.

### Agent-backend (OpenCode) — Consumed As-Is

**SDK v2 (pinned contract)**

- `Agent-backend/packages/sdk/js/package.json` — `@orbit.build/sdk` v1.2.24, zero deps, ES module
- `Agent-backend/packages/sdk/js/src/v2/client.ts` — `createOrbitClient()` v2 factory, directory + workspace headers
- `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts` — **Authoritative types:** `GlobalEvent = { directory, payload: Event }`, 45-member `Event` union, `Session`, `Message = UserMessage | AssistantMessage`, 12-member `Part` union, `ToolState` discriminated union, `SessionStatus`, `EventMessagePartDelta` (separate from Updated), `EventPermissionAsked`
- `Agent-backend/packages/sdk/js/src/v2/index.ts` — v2 exports

**Server (HTTP + SSE)**

- `Agent-backend/packages/opencode/src/server/server.ts` — Hono app, SSE `/global/event`, CORS (tauri://localhost)
- `Agent-backend/packages/opencode/src/server/routes/session.ts` — Session CRUD, prompt (sync + async), abort, fork, revert, diff
- `Agent-backend/packages/opencode/src/server/routes/permission.ts` — Permission list, reply (once/always/reject)
- `Agent-backend/packages/opencode/src/server/routes/provider.ts` — Provider list, auth methods, OAuth flow
- `Agent-backend/packages/opencode/src/server/routes/global.ts` — Health check, global event stream

**TUI Event Consumer (reference pattern)**

- `Agent-backend/packages/opencode/src/cli/cmd/tui/context/sync.tsx` — Switch-case reducer on `event.type`, binary search for sorted insertion, `produce()` for batch mutations, 16ms event flush debounce, delta handling: `(existing ?? "") + event.properties.delta`
- `Agent-backend/packages/opencode/src/cli/cmd/tui/context/sdk.tsx` — `sdk.event.subscribe({}, {signal}).stream` async iterable pattern

**Session + Message System**

- `Agent-backend/packages/opencode/src/session/index.ts` — Session namespace, create/fork/list/remove
- `Agent-backend/packages/opencode/src/session/message-v2.ts` — MessageV2 types, all Part types, ToolState discriminated union
- `Agent-backend/packages/opencode/src/session/processor.ts` — AI SDK stream → parts, doom loop detection
- `Agent-backend/packages/opencode/src/session/prompt.ts` — SessionPrompt.prompt(): busy guard, loop orchestration

**Build**

- `Agent-backend/packages/opencode/script/build.ts` — Binary output: `dist/opencode-{platform}-{arch}/bin/opencode`. Fetches `models.dev` unless `MODELS_DEV_API_JSON` env var is set (points to cached file). `--single` for current platform only. `--skip-install` flag.

**Infrastructure + Documentation**

- `Agent-backend/packages/opencode/src/bus/bus-event.ts` — BusEvent.define() factory
- `Agent-backend/packages/opencode/src/bus/index.ts` — Bus: publish, subscribe, GlobalBus forwarding
- `Agent-backend/packages/opencode/src/agent/agent.ts` — 6 built-in agents
- `Agent-backend/packages/opencode/src/permission/next.ts` — PermissionNext: Ruleset, ask() flow
- `Agent-backend/packages/opencode/src/provider/provider.ts` — 20+ providers via @ai-sdk/\*
- `Agent-backend/packages/opencode/src/cli/cmd/serve.ts` — `orbit serve --port --host`
- `Agent-backend/CLAUDE.md`, `packages/CLAUDE.md`, `packages/sdk/CLAUDE.md`, `packages/opencode/CLAUDE.md`

### Orbit Frontend (apps/agent) — Claude-Coupled Files (NOT Modified)

These files contain Claude-specific logic and are LEFT UNTOUCHED. Listed for reference to understand the coupling boundary.

- `apps/agent/src/components/chat/input/ChatInput.tsx` — `useModel()`, thinking/effort controls, Claude permission modals
- `apps/agent/src/hooks/chat/handlers/chat-actions.ts` — 8 Claude message types: `thinking:set`, `effort:set`, `model:set`, `permission:response`, `conversation:rewind`, `message:send` with `parent_uuid`
- `apps/agent/src/hooks/chat/use-chat-messages.ts` — JSONL `conversation:list/load`, `orbit-sessionId`, session remap, title generation via Haiku
- `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts` — 100% Claude SDK wrappers: `agentSendMessage`, `agentInterrupt`, `agentSetThinkingMode`, `agentSetModel`
- `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` — JSONL conversation persistence, 240-line rewind function (parentUuid chains + file checkpoints)
- `apps/agent/src/services/session/session-title-service.ts` — Title via Haiku (agent-bridge), remap on fork
- `apps/agent/src/services/chat/chat-message-service.ts` — Cross-store coordinator for Claude events

### Orbit Frontend — Files TO BE Modified

- `apps/agent/src/components/layout/chat-area/ChatArea.tsx` — Replace inline chat with `<BackendChatSurface surface="agent" />`
- `apps/agent/src/components/layout/content-top-bar.tsx` — Title via `useConversationMeta()`, `handleNewSession` via bridge (Audit 5 C5)
- `apps/agent/src/components/layout/primary-sidebar/` — Use `useConversationList()` hook
- `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx` — `openProject()` via `bridge.hydrateWorkspace()` (Audit 5 C5)
- `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — Route through `ConversationUiBridge`
- `apps/agent/src/components/modals/settings/types.ts` — Add `'backend'`, `'providers'` sections
- `apps/agent/src/components/modals/settings/SettingsSidebar.tsx` — Add Backend + Providers nav items
- `apps/agent/src/components/modals/settings/SettingsDialog.tsx` — Add new section cases
- `apps/agent/src/components/modals/settings/pages/index.ts` — Export new pages
- `apps/agent/src/providers/tauri-provider.tsx` — `opencode:ready`, `opencode:crashed` event listeners
- `apps/agent/src/App.tsx` — Mount `useOpencodeLifecycle()` hook

### Orbit Editor — Files TO BE Modified

- `apps/editor/src/components/EditorChatPanel.tsx` — Replace Claude imports with `<BackendChatSurface surface="editor" />` (Audit 5 C1)

### Orbit Rust Backend — To Be Modified

- `src-tauri/src/lib.rs` — Add `OpenCodeProcessState` managed state (`parking_lot::Mutex`), commands, `RunEvent::Exit` shutdown
- `src-tauri/src/commands/mod.rs` — Add `pub mod opencode`
- `src-tauri/tauri.conf.json` — Add `"binaries/orbit-server"` to `externalBin`

### Root Config — To Be Modified

- `package.json` — Add `@orbit.build/sdk` file dep, `build:opencode` scripts, wire into `dev`/`build`/`ci`

### Agent Bridge — Unchanged

- `agent-bridge/` — zero changes, reference only
