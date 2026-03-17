# ✅ Phase 9: Desktop App Integration

## How to Execute

**No upstream files to copy — this phase edits Orbit's own frontend and Tauri code.**

1. Regenerate SDK: `cd Agent-backend && ./script/generate.ts`
2. Update shared schemas in `packages/shared-schemas/` to match new API shapes
3. Update React stores/hooks in `apps/agent/src/` if API responses changed
4. Test: `bunx tauri dev`

## Summary

After porting upstream engine changes (v1.2.24 to v1.2.26), the Orbit desktop app (Tauri + React) needs updates to stay compatible. The engine runs as the `orbit-server` sidecar binary, and the React frontend connects via HTTP API + SSE streaming. Changes in the engine's API surface, response shapes, and provider behavior must be reflected across: the auto-generated SDK client, shared schemas, Zustand stores, service layer, adapter hooks, and Tauri sidecar spawner.

This plan catalogues every integration surface affected by the upstream sync and prescribes what to update.

## Architecture Reminder

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri (Rust)                                                │
│  src-tauri/src/opencode/process.rs                           │
│  - Spawns orbit-server binary (port 4096-4196)               │
│  - Health checks GET /global/health (40 retries, 250ms)      │
│  - Monitors child process, emits opencode:ready/crashed      │
│  - Graceful shutdown via POST /global/dispose + SIGTERM       │
└──────────────┬───────────────────────────────────────────────┘
               │ TCP
               ▼
┌──────────────────────────────────────────────────────────────┐
│  orbit-server (OpenCode engine, Bun binary)                  │
│  Agent-backend/packages/opencode/src/server/server.ts        │
│  - Hono API server with CORS, basic auth, workspace router   │
│  - SSE event stream at GET /global/event                     │
│  - Session CRUD, messages, providers, permissions, questions  │
└──────────────┬───────────────────────────────────────────────┘
               │ HTTP + SSE
               ▼
┌──────────────────────────────────────────────────────────────┐
│  React Frontend                                              │
│  apps/agent/src/services/opencode/  — HTTP client + SSE      │
│  apps/agent/src/stores/opencode/    — Zustand state          │
│  apps/agent/src/hooks/chat/         — Adapter hooks           │
│  apps/agent/src/types/opencode.ts   — TS types               │
│  Agent-backend/packages/sdk/js/     — Auto-generated client   │
└──────────────────────────────────────────────────────────────┘
```

## What Changes in the Engine That Affects Desktop

---

### 9A: Session Message Pagination

**Engine change:** The `GET /session/:sessionID/message` endpoint now supports cursor-based pagination via new query parameters (`limit`, `before`). When `limit > 0`, the server returns a page of messages plus `Link` and `X-Next-Cursor` response headers for the next page.

**Wire format impact:** When called WITHOUT `limit` (or `limit=0`), behavior is unchanged -- returns all messages as a flat array. The frontend currently calls `session.messages({ sessionID })` with no limit, so existing behavior is preserved on day one.

**What needs updating:**

| File                                                     | Change                                                                                                                                                    | Priority     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts`  | Regenerate SDK types -- `SessionMessagesData.query` gains `limit?: number` and `before?: string`                                                          | HIGH         |
| `Agent-backend/packages/sdk/js/src/v2/gen/sdk.gen.ts`    | Regenerate SDK client -- `session.messages()` passes new query params                                                                                     | HIGH         |
| `apps/agent/src/services/opencode/oc-session-service.ts` | `loadMessages()` currently passes `{ sessionID }`. No change needed for basic compat. For pagination support later, add optional `limit`/`before` params. | LOW (compat) |
| `apps/agent/src/stores/opencode/oc-session-store.ts`     | No change needed for basic compat. For pagination: add cursor tracking per session, append logic instead of replace.                                      | LATER        |
| `apps/agent/src/stores/opencode/oc-message-store.ts`     | Same -- no change for basic compat. Pagination would need append-merge logic.                                                                             | LATER        |

**Breaking changes:** None if frontend continues to omit `limit`. The response shape (array of messages) is unchanged for the no-limit case.

**Verification:**

- `ocSessionService.loadMessages(sessionId)` returns all messages (no regression)
- SDK type generation succeeds with `./script/generate.ts`

---

### 9B: Server Factory (`createApp`)

**Engine change:** `Server.App()` singleton replaced with `Server.createApp(opts)` factory. The default export is now `Server.Default = lazy(() => createApp({}))`. The CORS whitelist is now passed as a constructor option instead of module-level state.

**Wire format impact:** None -- the HTTP API surface (routes, methods, response shapes) is identical. Health check endpoint unchanged at `GET /global/health`.

**What needs updating:**

| File                                              | Change                                                                                   | Priority |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `src-tauri/src/opencode/process.rs`               | No change -- spawns binary via CLI (`serve --port N`), doesn't interact with `createApp` | NONE     |
| `src-tauri/src/commands/opencode/lifecycle.rs`    | No change -- health check URL unchanged                                                  | NONE     |
| `apps/agent/src/services/opencode/client.ts`      | No change -- connects to `http://127.0.0.1:{port}`                                       | NONE     |
| `apps/agent/src/services/opencode/sse-manager.ts` | No change -- SSE endpoint unchanged                                                      | NONE     |

**Breaking changes:** None for the desktop app. This is an internal refactor of how the server initializes.

**Verification:**

- `bunx tauri dev` starts sidecar successfully
- Health check passes within 40 retries

---

### 9C: Branded IDs in API Responses

**Engine change:** All IDs (SessionID, MessageID, PartID, ProviderID, ModelID, PermissionID, QuestionID, ToolID, WorkspaceID, ProjectID) are now branded Effect Schema types internally. Hono route validators use `SessionID.zod` instead of `z.string()`.

**Wire format impact:** Branded types are compile-time only. On the wire (JSON), these are still plain strings. The Zod validators in routes accept any string that passes `Schema.String.pipe(Schema.brand(...))` -- which is ALL strings, since the brand is a type annotation, not a runtime refinement.

**What needs updating:**

| File                                                     | Change                                                                                                                                             | Priority                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts`  | Regenerate -- JSDoc descriptions removed from many ID fields (cosmetic change, not breaking). Some path params lose their `@description` comments. | HIGH (part of SDK regen) |
| `apps/agent/src/types/opencode.ts`                       | No change -- frontend types already use `string` for all IDs                                                                                       | NONE                     |
| `packages/shared-schemas/`                               | No change -- shared schemas don't validate OpenCode API response IDs                                                                               | NONE                     |
| `apps/agent/src/services/opencode/oc-session-service.ts` | No change -- sends plain strings, receives plain strings                                                                                           | NONE                     |

**Breaking changes:** None. The branded types have no runtime impact on JSON serialization.

**Verification:**

- Frontend creates/reads sessions, messages, and permissions without type errors
- SDK client calls succeed (branded types are erased at runtime)

---

### 9D: Account System API Routes

**Engine change:** New account management module with 5 source files (`src/account/`), CLI commands (`src/cli/cmd/account.ts`), and API routes for OAuth device flow, org switching, and remote config. The server now mounts account-related routes.

**What needs updating:**

| File                             | Change                                                                                  | Priority                 |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------ |
| `Agent-backend/packages/sdk/js/` | Regenerate -- new account endpoints appear in OpenAPI spec                              | HIGH (part of SDK regen) |
| Frontend (all)                   | Nothing required initially -- account routes are additive and unused by the desktop app | NONE                     |

**Breaking changes:** None. New routes don't affect existing endpoints.

**Future consideration:** If Orbit adds cloud accounts later, the frontend would need:

- Account store (`stores/opencode/oc-account-store.ts`)
- Account service methods in `oc-session-service.ts`
- Settings UI for account management
- Tauri credential storage integration

**Verification:**

- Existing endpoints still work (sessions, providers, permissions)
- SDK regeneration includes account types without breaking existing code

---

### 9E: Provider Priority and Sort Order

**Engine change:** The `Provider.sort()` priority list is now `["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]`. The function signature generalized from `sort(models: Model[])` to `sort<T extends { id: string }>(models: T[])`. Provider ID comparisons use branded constants (`ProviderID.amazonBedrock` instead of string literal `"amazon-bedrock"`).

**Wire format impact:** The `GET /provider/` endpoint may return providers/models in a different default order. The `connected` array and `default` model mapping are unchanged in structure.

**What needs updating:**

| File                                                                    | Change                                                                                                                                                                                            | Priority |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/agent/src/stores/opencode/oc-provider-store.ts`                   | The `setProviders` fallback logic (pick first connected provider, then first model) may resolve to a different provider if sort order changes. Review whether the UI should enforce its own sort. | LOW      |
| `apps/agent/src/services/opencode/oc-session-service.ts`                | `mapProviders()` maps response as-is. No change needed.                                                                                                                                           | NONE     |
| `apps/agent/src/data/opencode-providers.json`                           | Static provider cache. Doesn't affect runtime provider list from server.                                                                                                                          | NONE     |
| `apps/agent/src/components/modals/settings/pages/ProvidersSettings.tsx` | Displays providers from store. May show in different order. No functional change needed.                                                                                                          | NONE     |

**Breaking changes:** None functionally. Users may see providers in a different default order in the model selector dropdown.

**Verification:**

- Provider list loads correctly
- Model selector shows expected providers and models
- Default model selection works when no prior selection exists

---

### 9F: SSE Chunk Timeout (New Provider Feature)

**Engine change:** New `chunkTimeout` config option per provider (default 120s). The engine wraps SSE responses with a per-chunk read timeout -- if no SSE chunk arrives within the window, the request is aborted. This prevents hung connections.

**Wire format impact:** None -- this is a server-side timeout on outbound LLM SSE streams, not on the desktop app's SSE connection. The desktop app's SSE connection to the engine is unaffected.

**What needs updating:**

| File | Change                     | Priority |
| ---- | -------------------------- | -------- |
| None | No frontend changes needed | NONE     |

**Breaking changes:** None for the desktop app. LLM requests that previously hung forever will now timeout after 120s (better UX).

**Verification:**

- Long-running agent responses still stream correctly
- No spurious disconnections during normal operation

---

### 9G: SDK Client Regeneration

**Engine change:** Multiple API changes (pagination, branded IDs, account routes, workspaceID param) require regenerating the TypeScript SDK client.

**What needs updating:**

| File                                                    | Change                               | Priority |
| ------------------------------------------------------- | ------------------------------------ | -------- |
| `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts` | Regenerate from updated OpenAPI spec | HIGH     |
| `Agent-backend/packages/sdk/js/src/v2/gen/sdk.gen.ts`   | Regenerate from updated OpenAPI spec | HIGH     |
| `Agent-backend/packages/sdk/openapi.json`               | Update from engine's generated spec  | HIGH     |
| `Agent-backend/packages/sdk/js/package.json`            | Version bump if needed               | LOW      |

**Regeneration command:**

```bash
cd Agent-backend
./script/generate.ts
```

**Breaking changes for frontend:** The `SessionMessagesData` type gains new optional query fields. The `SessionCreateData` body gains optional `workspaceID`. Several path param types lose JSDoc descriptions. All changes are backward-compatible (new fields are optional).

**Frontend files that import SDK types:**

| Frontend file                                            | SDK import                                          | Impact                                        |
| -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| `apps/agent/src/services/opencode/client.ts`             | `createOrbitClient`, `OrbitClient`                  | No change -- client factory is stable         |
| `apps/agent/src/services/opencode/oc-session-service.ts` | `ProviderListResponses`, `SessionMessagesResponses` | Verify response types still match after regen |
| `apps/agent/src/services/opencode/sse-manager.ts`        | Uses `getClient().global.event()`                   | Verify SSE stream type is stable              |
| `apps/agent/src/hooks/chat/use-oc-chat.ts`               | May import SDK types                                | Verify                                        |

**Verification:**

```bash
# Regenerate SDK
cd Agent-backend && ./script/generate.ts

# Verify frontend compiles
bun run typecheck

# Verify SDK client still works at runtime
bunx tauri dev
# Then: create session, send message, check provider list
```

---

### 9H: `workspaceID` in Session Create

**Engine change:** The `POST /session` (create) endpoint now accepts an optional `workspaceID` field in the request body. This ties sessions to a specific workspace context.

**What needs updating:**

| File                                                     | Change                                                                                                                                          | Priority |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/agent/src/services/opencode/oc-session-service.ts` | `createSession()` could pass `workspaceID` but doesn't need to -- the server derives it from the workspace router middleware. No change needed. | NONE     |

**Breaking changes:** None -- field is optional and server behavior is unchanged when omitted.

---

## Files to Update (Summary)

### Must update (HIGH priority)

| File                                                    | What changes           | Why                                                |
| ------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| `Agent-backend/packages/sdk/openapi.json`               | Regenerate from engine | New pagination params, account routes, workspaceID |
| `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts` | Regenerate             | SDK types must match API                           |
| `Agent-backend/packages/sdk/js/src/v2/gen/sdk.gen.ts`   | Regenerate             | SDK client must match API                          |

### Should verify (MEDIUM priority)

| File                                                     | What to check                                                           | Why                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `apps/agent/src/services/opencode/oc-session-service.ts` | `loadMessages()`, `loadProviders()` still compile against new SDK types | SDK type shapes changed                     |
| `apps/agent/src/services/opencode/sse-manager.ts`        | SSE event stream type stable                                            | SDK regen may change event types            |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`       | Part types, message structure unchanged                                 | Adapter maps raw OC messages to ChatMessage |
| `apps/agent/src/stores/opencode/oc-provider-store.ts`    | Provider/model fallback logic                                           | Sort order may change                       |

### No change needed

| File                                           | Why                               |
| ---------------------------------------------- | --------------------------------- |
| `src-tauri/src/opencode/process.rs`            | Sidecar spawning unchanged        |
| `src-tauri/src/commands/opencode/lifecycle.rs` | Health check unchanged            |
| `apps/agent/src/services/opencode/client.ts`   | Client initialization unchanged   |
| `apps/agent/src/types/backend/adapter.ts`      | Capability definitions unchanged  |
| `packages/shared-schemas/`                     | No OpenCode API schemas here      |
| `apps/agent/src/data/opencode-providers.json`  | Static cache, not used at runtime |

---

## Breaking Changes

**Will the desktop app crash if the engine is updated but the frontend isn't?**

**No.** All upstream changes are backward-compatible at the HTTP/JSON level:

1. **Pagination** -- Only activates when `limit` query param is sent. Frontend doesn't send it.
2. **Branded IDs** -- Compile-time only. JSON wire format unchanged (plain strings).
3. **Account routes** -- Additive. Frontend doesn't call them.
4. **createApp factory** -- Internal refactor. CLI `serve` command still works identically.
5. **workspaceID** -- Optional field. Omitting it preserves existing behavior.
6. **chunkTimeout** -- Server-side only.
7. **Provider sort** -- Cosmetic ordering change in dropdown.

**However**, the SDK client (`@opencode-ai/sdk`) MUST be regenerated if you've ported the engine changes, otherwise TypeScript types will be stale and may cause subtle bugs where the frontend expects old response shapes.

---

## Execution Order

1. **Port engine changes** (Phases 0-8) -- update `Agent-backend/packages/opencode/`
2. **Regenerate SDK** -- `cd Agent-backend && ./script/generate.ts`
3. **Verify frontend compiles** -- `bun run typecheck` from monorepo root
4. **Fix any type errors** in `apps/agent/` (likely zero or minimal)
5. **Rebuild sidecar** -- `bun run build:opencode`
6. **Test end-to-end** -- `bunx tauri dev`, create session, send message, switch providers

---

## Verification Checklist

```bash
# 1. SDK regeneration
cd Agent-backend && ./script/generate.ts

# 2. Engine type-checks
cd Agent-backend/packages/opencode && bun run typecheck

# 3. Frontend type-checks
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run typecheck

# 4. Frontend tests pass
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run test

# 5. Build sidecar binary
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run build:opencode

# 6. Full desktop app works
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bunx tauri dev
```

**Manual tests in desktop app:**

- [ ] App launches without errors
- [ ] OpenCode sidecar health check passes (check Rust logs for `[opencode] ...`)
- [ ] Create new session
- [ ] Send message, get streaming response
- [ ] Session list loads in sidebar
- [ ] Provider list loads in model selector
- [ ] Switch provider/model, send another message
- [ ] Rewind (revert) a message
- [ ] Delete a session
- [ ] Permission prompt appears for tool use
