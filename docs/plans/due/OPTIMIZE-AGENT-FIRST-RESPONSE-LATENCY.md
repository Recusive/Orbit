# Optimize Agent First-Response Latency

## Context

When a user starts a new session and sends their first message, Orbit takes significantly longer to get a response than Claude Code CLI. After tracing the full chain (frontend → Rust → agent-bridge sidecar → SDK), I identified **6 sequential bottlenecks** that collectively add 1-4+ seconds of unnecessary latency.

### Current First-Message Latency Chain (Sequential!)

```
User sends message
  → await ensureSession()                          # BLOCKS on session creation
    → await getWorkspacePath()                     #   ~5-10ms  (Tauri invoke)
    → await agentGetStoredSession()                #   ~5-20ms  (Tauri invoke, usually null)
    → await agentCreateSession()                   #   ~800-4000ms total:
      → new OrbitAgent()                           #     instant
      → agent.initializeBrowserMcp()               #     instant
      → await agent.startSession()                 #     THE BOTTLENECK:
        → getShellEnvironment()                    #       200-2000ms (spawnSync!)
        → await ClaudeCredentials.getCredentials() #       50-300ms  (spawnSync!)
        → set env vars                             #       instant
        → _createOptions()                         #       instant (but builds ~4KB system prompt)
        → await withRetry(query(), aggressive)     #       500-2000ms (SDK init)
  → await agentSendMessage()                       # BLOCKS on credential re-check
    → await agent.refreshCredentials()             #   50-300ms (ANOTHER spawnSync!)
    → agent.queueMessage()                         #   instant

TOTAL: ~810-4630ms before the message even reaches the API
```

### Why Claude Code CLI is Faster

Claude Code CLI pre-warms everything at startup: shell environment is captured once at process init, credentials are cached in memory, and the SDK session is created before the user types anything. The first message goes straight into an already-running query.

---

## Optimization Plan (Ordered by Impact)

### 1. Pre-warm shell environment at sidecar startup (saves ~200-2000ms)

**File:** `agent-bridge/src/index.ts`

Currently `getShellEnvironment()` is called inside `startSession()` on EVERY first session creation. It uses `spawnSync` which blocks the entire event loop while it sources `.zshrc`/`.bashrc`.

**Fix:** Call `getShellEnvironment()` at sidecar startup (in `index.ts`, right after the `ready` event is sent). The function already caches its result — we just need to trigger the cache population early, so by the time `startSession()` runs, it returns instantly from cache.

```typescript
// index.ts — after emitting 'ready' event
// Pre-warm shell environment cache (blocks briefly but happens before any session)
getShellEnvironment();
```

**Risk:** Low. The function is already cached and idempotent. Moving it earlier just front-loads the work.

### 2. Pre-create session when chat opens, not on first message (saves ~500-2500ms)

**Files:**

- `apps/agent/src/hooks/agent/use-tauri-session.ts` — `ensureSession()`
- `apps/agent/src/services/chat/chat-message-service.ts` or UI store

Currently, `ensureSession()` is called from `handleMessageSend()` — meaning the entire session creation chain runs AFTER the user hits Enter. This adds the full `startSession()` latency to first-response time.

**Fix:** Eagerly call `ensureSession(sessionId)` when:

- A new conversation is created (user clicks "New Chat" or app starts with no session)
- The component mounts with a sessionId that isn't in `createdSessions`

This way, by the time the user types and sends their first message, the session is already created and `ensureSession()` returns immediately from the `createdSessions.has()` guard.

**Implementation:**

- Add a `preCreateSession(sessionId)` call in the new-conversation flow (likely in `useChatStore` or wherever the new sessionId is generated)
- Fire-and-forget (`void preCreateSession(...)`) — don't block UI
- If it fails, `ensureSession()` on first message still works as fallback

**Risk:** Low-medium. Need to handle the race where user sends a message before pre-creation completes. The existing `ensureSession` guard handles this — if `createdSessions` doesn't have it, it creates synchronously.

### 3. Cache credentials in memory, skip redundant Keychain reads (saves ~100-600ms)

**File:** `agent-bridge/src/common/auth/credentials.ts`

Three problems:

1. `getCredentials()` calls `readKeychainCredentials()` which does `spawnSync('security', ...)` — blocks the event loop
2. `sendMessage()` calls `refreshCredentials()` which does ANOTHER `readKeychainCredentials()` — even though credentials were just validated seconds ago in `startSession()`
3. No in-memory cache — every check shells out to macOS Keychain

**Fix A — In-memory credential cache with TTL:**

```typescript
let cachedCredentials: { result: CredentialResult; timestamp: number } | null = null;
const CREDENTIAL_CACHE_TTL_MS = 60_000; // 1 minute

async function getCredentials(): Promise<CredentialResult> {
  if (cachedCredentials && Date.now() - cachedCredentials.timestamp < CREDENTIAL_CACHE_TTL_MS) {
    return cachedCredentials.result;
  }
  // ... existing Keychain read logic ...
  cachedCredentials = { result, timestamp: Date.now() };
  return result;
}
```

**Fix B — Skip refreshCredentials() for recent sessions:**
In `sendMessage()` (session-manager.ts:1848-1862), skip the `refreshCredentials()` call if the session was created within the last 60 seconds. The credential was JUST validated during `startSession()`.

```typescript
// session-manager.ts sendMessage()
const sessionAge = Date.now() - (this.sessionCreateTimes.get(sessionId) ?? 0);
if (sessionAge > 60_000) {
  const hasCredentials = await agent.refreshCredentials();
  // ... existing error handling
}
```

**Risk:** Low. The auto-refresh timer (5-min interval) already handles expiry. The per-send check is just a safety net that's wasteful on the first message.

### 4. Parallelize shell env + credential loading (saves ~50-200ms)

**File:** `agent-bridge/src/agent/core/agent.ts` — `startSession()` (lines 1131-1138)

Currently sequential:

```typescript
const shellEnv = getShellEnvironment(); // sync, ~200-2000ms
const credentials = await ClaudeCredentials.getCredentials(); // async, ~50-300ms
```

If we make `getShellEnvironment()` async (use `spawn` instead of `spawnSync`), we can parallelize:

```typescript
const [shellEnv, credentials] = await Promise.all([
  getShellEnvironmentAsync(),
  ClaudeCredentials.getCredentials(),
]);
```

**However**, if Optimization #1 is implemented (pre-warm at startup), this becomes less important because `getShellEnvironment()` returns from cache instantly. **Defer this unless #1 proves insufficient.**

**Risk:** Medium. Converting from spawnSync to async changes the execution model. Skip if #1 gives enough improvement.

### 5. Skip `agentGetStoredSession` for brand-new sessions (saves ~5-20ms)

**File:** `apps/agent/src/hooks/agent/use-tauri-session.ts` — `ensureSession()` (lines 121-134)

For brand-new conversations (not rewind forks, not app restarts), the `agentGetStoredSession()` call is a wasted round trip — it always returns `null` because no SDK session exists yet.

**Fix:** Only call `agentGetStoredSession()` when we have reason to believe there's a stored session. Add a parameter or check:

```typescript
// Skip stored session lookup for brand-new conversations
const isNewConversation = !forkedSessionResumeMap.has(sessionId);
if (isNewConversation) {
  // Don't bother checking for stored session — it won't exist
} else {
  // ... existing stored session lookup
}
```

Actually, the better fix: the forked session check already handles rewind. The stored session lookup is for app restarts. We can check if the sessionId was JUST generated (exists only in frontend memory, not in sidebar conversations list from backend):

```typescript
const conversations = useUIStore.getState().conversations;
const existsOnDisk = conversations.some((c) => c.id === sessionId);
if (!existsOnDisk) {
  // Brand new — skip stored session lookup
}
```

**Risk:** Very low. Worst case: a restarted session doesn't resume (falls back to fresh session).

### 6. Reduce retry preset for initial query() (saves ~1s on failure path)

**File:** `agent-bridge/src/agent/core/agent.ts` — `startSession()` (lines 1189-1202)

Currently uses `RetryPresets.aggressive` (5 retries, 1s initial delay, 30s max, 2x backoff). If the CLI subprocess fails to start, retrying 5 times with exponential backoff wastes up to ~30s before surfacing the error.

**Fix:** Use `RetryPresets.quick` (2 retries, 500ms initial delay, 2s max):

```typescript
this.currentQuery = await withRetry(
  () => { ... },
  {
    ...RetryPresets.quick,  // was: RetryPresets.aggressive
    operationName: 'startSession.query',
  }
);
```

**Risk:** Low. If the Claude CLI can't start, it's usually a missing binary or permissions issue — not a transient error. 2 retries is sufficient. The user gets faster error feedback.

---

## Bonus Optimizations (Lower Priority)

### 7. Conditional browser docs in system prompt (saves API latency)

**File:** `agent-bridge/src/agent/core/agent.ts` — `_createOptions()` (lines 546-626)

The system prompt appends ~4KB of browser automation + DevTools documentation even when the user never uses the browser. Claude Code loads this as MCP tool descriptions instead.

**Fix:** Only append browser docs when browser MCP servers are registered:

```typescript
if (Object.keys(this._mcpServers).length > 0) {
  options.systemPrompt.append += browserDocs;
}
```

**Risk:** Medium. The browser MCP servers are always registered currently. Would need to make registration conditional on browser panel state.

### 8. Pre-warm credentials at sidecar startup (saves ~50-300ms on first session)

**File:** `agent-bridge/src/index.ts`

Like shell env pre-warming, trigger credential read at startup:

```typescript
// Pre-warm credential cache
void ClaudeCredentials.getCredentials();
```

**Risk:** Very low. Fire-and-forget, populates cache for later use.

---

## Files to Modify

| File                                                                       | Change                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `agent-bridge/src/index.ts`                                                | Pre-warm shell env + credentials at startup (#1, #8)              |
| `agent-bridge/src/common/auth/credentials.ts`                              | Add in-memory credential cache with TTL (#3A)                     |
| `agent-bridge/src/agent/session/session-manager.ts`                        | Track session create times, skip redundant credential check (#3B) |
| `agent-bridge/src/agent/core/agent.ts`                                     | Change retry preset to quick (#6)                                 |
| `apps/agent/src/hooks/agent/use-tauri-session.ts`                          | Skip stored session lookup for new conversations (#5)             |
| `apps/agent/src/services/chat/chat-message-service.ts` or relevant UI hook | Trigger eager session pre-creation on new chat (#2)               |

---

## Verification

1. **Measure before:** Add timing logs around each step in `startSession()` and `sendMessage()` to get baseline latency numbers
2. **Apply optimizations incrementally:** One at a time, re-measure after each
3. **Test first message latency:** Open Orbit fresh → New Chat → type message → measure time to first streaming token
4. **Test subsequent messages:** Should be unaffected (already fast)
5. **Test app restart resume:** Ensure stored session lookup still works for restarted sessions
6. **Test rewind:** Ensure fork/resume flow still works correctly
7. **Run `bun run check`** after all changes to verify no type/lint errors
8. **Run `cd agent-bridge && bun test`** to verify integration tests pass

## Expected Impact

| Optimization                  | Savings                         | Confidence |
| ----------------------------- | ------------------------------- | ---------- |
| #1 Pre-warm shell env         | 200-2000ms                      | High       |
| #2 Eager session creation     | 500-2500ms (perceived)          | High       |
| #3 Credential caching         | 100-600ms                       | High       |
| #5 Skip stored session lookup | 5-20ms                          | High       |
| #6 Quick retry preset         | 0ms happy path, ~30s on failure | Medium     |
| #8 Pre-warm credentials       | 50-300ms                        | High       |
| **Combined**                  | **~855-5420ms**                 |            |

The biggest perceived improvement will come from #2 (eager session creation) because it moves the entire `startSession()` chain OFF the critical path of the first message send.
