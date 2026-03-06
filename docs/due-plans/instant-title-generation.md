# Plan: Instant Conversation Title Generation

## Context

Title generation is slow (~5-35s) and fails ~50% of the time. Two root causes:

1. **Timing**: Waits for entire agent response (`agent:complete`) before starting Haiku call — adds 5-30s of dead time
2. **Path**: Uses `query()` from `@anthropic-ai/claude-agent-sdk` which spawns a **full Claude CLI subprocess** through 4 IPC layers. SDK docs confirm there is no lightweight/headless mode — `query()` always bootstraps the full CLI infrastructure (tools, permissions, file checkpointing). This is the core bottleneck and likely cause of the 50% failure rate.

**Fix**: Replace `query()` with a direct `@anthropic-ai/sdk` `messages.create()` call (already a dependency at ^0.74.0). Trigger at message-send time instead of after agent response. Uses existing OAuth/API key credentials via `ClaudeCredentials.getCredentials()`.

**OAuth confirmed**: `@anthropic-ai/sdk` has first-class OAuth support via the `authToken` constructor option — sends `Authorization: Bearer` header. No API key needed for OAuth users (most Orbit users). Existing `ClaudeCredentials` handles token refresh automatically.

**Result**: Title appears within ~200-500ms of pressing Enter (vs 5-35s today). Zero additional cost — uses existing auth credentials.

---

## Changes (12 touch points across 3 layers)

### Layer 1: Agent Bridge — Replace `query()` with direct `@anthropic-ai/sdk`

**1. `agent-bridge/src/agent/session/session-manager.ts`** (line 2533-2585)

- Rewrite `generateTitle()` method:
  - Remove `assistantResponse` parameter (only need user message, like OpenCode)
  - Remove `query()` import usage for this method
  - Import `Anthropic` from `@anthropic-ai/sdk`
  - Import `ClaudeCredentials` from `../../common/auth/credentials.js`
  - Call `ClaudeCredentials.getCredentials()` to get token (handles OAuth refresh + API key fallback)
  - Branch on credential type:
    - OAuth: `new Anthropic({ authToken: token })` → sends `Authorization: Bearer` header
    - API key: `new Anthropic({ apiKey: token })` → sends `X-Api-Key` header
  - Call `client.messages.create({ model: 'claude-haiku-4-20250514', max_tokens: 100, messages: [...] })`
  - Extract text from `response.content` blocks
  - Keep existing cleanup logic (strip quotes, "Title:" prefix, truncate at 50 chars word boundary)

**2. `agent-bridge/src/protocol/protocol.ts`** (line 364-368)

- Remove `assistantResponse` field from `GenerateTitleRequest` interface

**3. `agent-bridge/src/protocol/schemas.ts`** (line 494-501)

- Remove `assistantResponse` from `GenerateTitleRequestSchema` Zod schema

**4. `agent-bridge/src/index.ts`** (line 682-686)

- Update dispatch: `sessionManager.generateTitle(request.userMessage)` (drop second arg)

### Layer 2: Rust Backend — Remove `assistant_response` parameter

**5. `src-tauri/src/agent/protocol.rs`** (line 463-468)

- Remove `assistant_response` field from `GenerateTitle` variant

**6. `src-tauri/src/agent/session.rs`** (line 723-735)

- Update `generate_title(&self, user_message: &str)` — remove `assistant_response` param
- Update `BridgeRequest::GenerateTitle` construction

**7. `src-tauri/src/commands/agent/lifecycle.rs`** (line 482-490)

- Update `agent_generate_title` command: remove `assistant_response` parameter

### Layer 3: Frontend — Trigger at message-send time, not agent:complete

**8. `apps/agent/src/lib/api/agent.ts`** (line 505-510)

- Update `generateSessionTitle(userMessage: string)` — remove `assistantResponse` param

**9. `apps/agent/src/services/session/session-title-service.ts`** (line 142-163)

- Update `generateAITitle(sessionId, userMessage)` — remove `assistantResponse` param
- Update internal call to `generateSessionTitle(userMessage)`

**10. `apps/agent/src/services/chat/chat-message-service.ts`** (line 680-701)

- **DELETE** the title generation block in `handleAgentComplete()` (lines 680-701)
- Remove `generateAITitle` from imports

**11. `apps/agent/src/hooks/chat/handlers/chat-actions.ts`** (line 147-149)

- Add `generateAITitle` to imports from `@/services/session`
- After `applySessionTitle(sessionId, generateFallbackTitle(text))` on line 148, add:
  ```typescript
  generateAITitle(sessionId, text);
  ```
- This covers the "existing conversation, first message" path

**12. `apps/agent/src/hooks/chat/use-chat-messages.ts`** (line 272-377)

- In the `useEffect` that processes `pendingMessage` after `conversation:created`:
  After `useChatStore.getState().setPendingMessage(null)` (line 279), add:
  ```typescript
  generateAITitle(lastCreatedSessionId, text);
  ```
- This covers the "new conversation" path (fallback title already set in `conversation:create` at line 138)
- Add `generateAITitle` import from `@/services/session`

---

## What stays the same

- `generateFallbackTitle()` — instant placeholder, works perfectly
- `applySessionTitle()` + `flushPendingTitle()` — persistence pipeline unchanged
- `aiTitleGenerated` / `aiTitleInFlight` Sets — deduplication still needed
- `pendingTitles` Map — JSONL timing handling unchanged
- Cost — zero additional cost. OAuth users: covered by existing auth. API key users: same Haiku call as before, just faster path

---

## Key reuse points

| Existing code                        | Location                                                   | Reuse                                       |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| `ClaudeCredentials.getCredentials()` | `agent-bridge/src/common/auth/credentials.ts`              | OAuth token + API key with auto-refresh     |
| `@anthropic-ai/sdk`                  | `agent-bridge/package.json` (^0.74.0)                      | Direct Anthropic client, no new deps        |
| `generateFallbackTitle()`            | `apps/agent/src/services/session/session-title-service.ts` | Instant placeholder — unchanged             |
| `applySessionTitle()`                | same file                                                  | Persist to UIStore + JSONL — unchanged      |
| Title cleanup logic                  | `session-manager.ts` line 2570-2582                        | Strip quotes, prefix, truncate — keep as-is |

---

## Verification

1. **Build sidecar**: `cd agent-bridge && bun run build:dev`
2. **Typecheck**: `bun run typecheck`
3. **Lint**: `bun run lint`
4. **Rust check**: `cargo check`
5. **Run app**: `bunx tauri dev`
6. **Manual test**:
   - New conversation → send first message → title should appear within ~500ms
   - "New conversation" button → send message → same instant title
   - Fallback title shows immediately, AI title replaces it shortly after
   - Sidebar updates reactively
   - Second message → no duplicate title generation
   - Test with both OAuth and API key auth if possible
   - Verify title persists in JSONL (switch away and back, title still there)
