# Plan: Structured Logging for OpenCode Pipeline

## Context

The opencode backend (dual-backend migration) sends messages successfully via HTTP POST but never receives responses. The UI shows IDLE after sending. The entire SSE→Store→UI pipeline has **only 3 log statements across ~10 files** — all at error/warn level. Zero visibility into whether SSE connects, events arrive, the directory filter rejects them, or stores mutate. We're flying blind.

This plan adds structured logging at every boundary crossing in the pipeline so the exact failure point becomes immediately visible in the console.

---

## Files to Modify (10 files, priority order)

### 1. `apps/agent/src/services/opencode/oc-event-coordinator.ts`

**Logger:** `OcEventCoordinator` (exists)

- Add `extractEventIds()` helper to pull sessionId/messageId from any event payload
- `debug` — directory mismatch filter (log both directories + event type)
- `debug` — event dispatched (event type + IDs), skip for `message.part.delta`
- `warn` — unhandled event type in default case

### 2. `apps/agent/src/services/opencode/sse-manager.ts`

**Logger:** `OcSseManager` (exists)

- `info` — SSE connecting (generation)
- `info` — SSE disconnecting (generation)
- `info` — SSE stream opened (generation), after `getClient().global.event()` resolves
- `debug` — SSE event received (generation, eventType, directory), inside `for await` loop
- `info` — SSE reconnecting (generation, delay, nextDelay)
- `debug` — SSE reconnect cancelled / stale generation

### 3. `apps/agent/src/services/opencode/oc-session-service.ts`

**Logger:** `OcSessionService` (exists)

- `info` — listing sessions / sessions loaded (count)
- `info` — creating session / session created (sessionId)
- `info` — deleting session (sessionId)
- `info` — sending message (sessionId, hasModel, agent) — **never log message text**
- `info` — message sent HTTP accepted (sessionId)
- `error` — failed to send message (sessionId, error)
- `info` — aborting session (sessionId)
- `info` — loading messages / messages loaded (sessionId, count)
- `info` — replying to permission (requestId, reply)
- `info` — validating session (sessionId)

### 4. `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`

**Logger:** `OpenCodeLifecycle` (exists)

- `info` — starting OpenCode (reason, workspacePath, generation)
- `info` — status check result (running, port, healthy)
- `info` — port assigned (port, source: existing vs started)
- `info` — client initialized, connecting SSE (port, workspacePath)
- `info` — data loaded, restoring selection
- `info` — startup complete (port, workspacePath, reason)
- `info` — startup cancelled / stale generation
- `info` — backend switched away, cleaning up
- `warn` — no workspace path, cleaning up

### 5. `apps/agent/src/services/opencode/client.ts`

**Logger:** `OcClient` (new — add import)

- `info` — client initialized (port, directory)
- `info` — client directory updated (port, directory, previousDirectory)
- `info` — client destroyed (port, directory)
- `warn` — getClient called before initialization

### 6. `apps/agent/src/stores/opencode/oc-session-store.ts`

**Logger:** `OcSessionStore` (new — add import)

- `info` — active session changed (sessionId, previousSessionId)
- `debug` — session status changed (sessionId, statusType)
- `warn` — session error set (sessionId)
- `debug` — sessions bulk loaded (count)
- `debug` — session added / removed (sessionId)

### 7. `apps/agent/src/stores/opencode/oc-message-store.ts`

**Logger:** `OcMessageStore` (new — add import)

- `debug` — session messages set (sessionId, messageCount)
- `debug` — message upserted (sessionId, messageId, role)
- `debug` — message removed (sessionId, messageId)
- `debug` — part upserted (sessionId, messageId, partId, partType)
- `debug` — session cleared (sessionId)
- Do NOT log `appendDelta` or `flushDeltaBuffer` (fires per-character)

### 8. `apps/agent/src/hooks/chat/use-oc-chat.ts`

**Logger:** `OcChat` (new — add import)

- `info` — user sending message (activeSessionId, willCreateSession)
- `info` — created new session for message (sessionId)
- `error` — failed to send message (sessionId, error)
- `info` — user stopping agent (sessionId)

### 9. `apps/agent/src/stores/opencode/oc-permission-store.ts`

**Logger:** `OcPermissionStore` (new — add import)

- `debug` — permission added/removed (requestId, sessionId)
- `debug` — question added/removed (requestId, sessionId)

### 10. `apps/agent/src/services/conversations/oc-ui-bridge.ts`

**Logger:** `OcUiBridge` (new — add import)

- `info` — selecting/restoring/creating/removing session
- `warn` — restored session no longer valid

---

## Rules

- Use `createLogger('Name')` from `@orbit/common/lib`
- `debug` for high-frequency events (store mutations, per-event SSE logs)
- `info` for lifecycle transitions and user actions
- `warn` for unexpected but recoverable states
- `error` for failures
- **Never log message text/content** (privacy)
- **Never log inside `appendDelta`/`flushDeltaBuffer`** (fires per-character during streaming)
- Include structured context: `{ sessionId, messageId, eventType }` — not string interpolation

---

## Expected Diagnostic Patterns

After implementation, the "message sent but no response" failure will show one of:

| Pattern                    | Console Shows                                        | Root Cause                                         |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| SSE never connected        | `SSE connecting` but no `SSE stream opened`          | Stream connection failed                           |
| Directory mismatch         | `Event filtered: directory mismatch` with both paths | Client/server directory disagreement               |
| Events arrive, no messages | `session.status → busy` but no `message.updated`     | Backend processing but not emitting message events |
| HTTP POST fails            | `Failed to send message` with error                  | SDK/server communication error                     |
| No active session          | `willCreateSession: true` then error                 | Session creation failed                            |

---

## Verification

1. Switch to opencode backend — confirm startup logs appear in sequence
2. Send a message — confirm `Sending message` + `Message sent (HTTP accepted)` appear
3. Check for SSE event flow — `SSE event received` logs should follow
4. If no response: the last log in the chain pinpoints the failure
5. Run `bun run check` to verify no type errors
