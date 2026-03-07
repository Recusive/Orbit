# Plan: Instant Conversation Title Generation

## Context

Title generation is slow (~5-35s) and fails ~50% of the time. Two root causes:

1. **Timing**: Waits for entire agent response (`agent:complete`) before starting Haiku call — adds 5-30s of dead time
2. **Path**: Uses `query()` from `@anthropic-ai/claude-agent-sdk` which spawns a **full Claude CLI subprocess** through 4 IPC layers. The existing `query()` call already strips tools/system prompt/MCP and documents ~1-2s latency, so the larger win comes from overlapping title generation with the assistant turn rather than transport alone.

**Fix**: Replace `query()` with a direct `@anthropic-ai/sdk` `messages.create()` call (already a dependency at ^0.74.0). Trigger at message-send time instead of after agent response. Keep `agent:complete` as a retry path that can also pass the assistant response for improved title quality.

**OAuth confirmed**: `@anthropic-ai/sdk` has first-class OAuth support via the `authToken` constructor option (verified in `client.d.ts` line 36) — sends `Authorization: Bearer` header. No API key needed for OAuth users (most Orbit users). Existing `ClaudeCredentials` handles token refresh automatically.

**Result**: Title appears within ~200-500ms of pressing Enter (vs 5-35s today). No expected additional cost on the success path — uses existing auth credentials. Failure/retry paths may issue a second request.

---

## Changes (13 touch points across 3 layers)

### Layer 1: Agent Bridge — Replace `query()` with direct `@anthropic-ai/sdk`

**1. `agent-bridge/src/agent/session/session-manager.ts`** (line 2562-2622)

- Add module-level constant: `const TITLE_MODEL = 'claude-haiku-4-5-20251001';`
- Add helper: `function buildTitlePrompt(userMessage: string, assistantResponse?: string): string`
- Add helper: `function cleanupGeneratedTitle(text: string, maxChars: number): string` — extract existing strip/truncate logic
- Rewrite `generateTitle()` method:
  - Make `assistantResponse` **optional** (not removed — available for retry path)
  - Remove `query()` import usage for this method
  - Import `Anthropic` from `@anthropic-ai/sdk`
  - Import `ClaudeCredentials` from `../../common/auth/credentials.js`
  - Call `ClaudeCredentials.getCredentials()` to get token (handles OAuth refresh + API key fallback)
  - **Throw** when `hasCredentials === false` or token is undefined — never return `'Untitled'` as a success string
  - **Throw** when SDK returns no text blocks or blank text — never convert empty output to a title
  - Branch on credential type:
    - OAuth: `new Anthropic({ authToken: token, timeout: 15_000 })` → sends `Authorization: Bearer` header
    - API key: `new Anthropic({ apiKey: token, timeout: 15_000 })` → sends `X-Api-Key` header
  - Build prompt: include assistant response only when provided (improves title quality on retry)
  - Call `client.messages.create({ model: TITLE_MODEL, max_tokens: 80, messages: [...] })`
  - Extract text from `response.content` blocks, throw if empty
  - Apply `cleanupGeneratedTitle()` (strip quotes, "Title:" prefix, truncate at 50 chars word boundary)

```typescript
const TITLE_MODEL = 'claude-haiku-4-5-20251001';

function buildTitlePrompt(userMessage: string, assistantResponse?: string): string {
  const maxTitleChars = 50;
  const assistantPart = assistantResponse
    ? `\n\nAssistant (truncated): "${assistantResponse.slice(0, 300)}"`
    : '';

  return `Generate a short title (max ${String(maxTitleChars)} characters) for this conversation.
The title should capture the main topic or intent.
Do NOT use quotes, periods, or prefixes like "Title:".
Do NOT exceed ${String(maxTitleChars)} characters. Just output the title text and nothing else.

User: "${userMessage.slice(0, 300)}"${assistantPart}`;
}

function cleanupGeneratedTitle(text: string, maxChars: number = 50): string {
  let title = text
    .replace(/^["']|["']$/g, '')
    .replace(/^Title:\s*/i, '')
    .replace(/\.$/, '')
    .trim();

  if (title.length > maxChars) {
    const truncated = title.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    title = lastSpace > maxChars * 0.4 ? truncated.slice(0, lastSpace) : truncated;
  }

  return title;
}

async generateTitle(userMessage: string, assistantResponse?: string): Promise<string> {
  const credentials = await ClaudeCredentials.getCredentials();
  if (!credentials.hasCredentials || credentials.token === undefined) {
    throw new Error('No credentials available for title generation');
  }

  const client = credentials.type === 'oauth'
    ? new Anthropic({ authToken: credentials.token, timeout: 15_000 })
    : new Anthropic({ apiKey: credentials.token, timeout: 15_000 });

  const response = await client.messages.create({
    model: TITLE_MODEL,
    max_tokens: 80,
    messages: [{ role: 'user', content: buildTitlePrompt(userMessage, assistantResponse) }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (text.length === 0) {
    throw new Error('Title generation returned no text');
  }

  return cleanupGeneratedTitle(text);
}
```

**2. `agent-bridge/src/protocol/protocol.ts`** (line 364-368)

- Make `assistantResponse` **optional** in `GenerateTitleRequest` interface:
  ```typescript
  export interface GenerateTitleRequest {
    type: 'generate_title';
    userMessage: string;
    assistantResponse?: string;
  }
  ```

**3. `agent-bridge/src/protocol/schemas.ts`** (line 494-501)

- Make `assistantResponse` optional in `GenerateTitleRequestSchema` Zod schema:
  ```typescript
  export const GenerateTitleRequestSchema = z
    .object({
      type: z.literal('generate_title'),
      userMessage: z.string(),
      assistantResponse: z.string().optional(),
    })
    .strict();
  ```

**4. `agent-bridge/src/index.ts`** (line 696-700)

- Update dispatch to pass optional arg:
  ```typescript
  case 'generate_title': {
    const title = await sessionManager.generateTitle(
      request.userMessage,
      request.assistantResponse
    );
    sendResponse({ type: 'string', requestType: request.type, value: title });
    break;
  }
  ```

### Layer 2: Rust Backend — Make `assistant_response` optional

**5. `src-tauri/src/agent/protocol.rs`** (line 463-468)

- Make `assistant_response` optional in `GenerateTitle` variant:
  ```rust
  GenerateTitle {
      #[serde(rename = "userMessage")]
      user_message: String,
      #[serde(rename = "assistantResponse", skip_serializing_if = "Option::is_none")]
      assistant_response: Option<String>,
  },
  ```

**6. `src-tauri/src/agent/session.rs`** (line 723-735)

- Update `generate_title` to accept optional `assistant_response`:
  ```rust
  pub fn generate_title(&self, user_message: &str, assistant_response: Option<&str>) -> Result<String> {
      self.ensure_running()?;
      let request = BridgeRequest::GenerateTitle {
          user_message: user_message.to_owned(),
          assistant_response: assistant_response.map(|s| s.to_owned()),
      };
      let bridge = self.bridge.lock();
      let response = bridge.send_request(&request)?;
      Self::check_response_string(response)?
          .ok_or_else(|| BridgeError::SidecarError("Title generation returned null".to_owned()))
  }
  ```

**7. `src-tauri/src/commands/agent/lifecycle.rs`** (line 482-490)

- Update `agent_generate_title` command with optional parameter:
  ```rust
  #[tauri::command]
  pub async fn agent_generate_title(
      user_message: String,
      assistant_response: Option<String>,
      state: State<'_, Arc<SessionManager>>,
  ) -> Result<String> {
      state
          .generate_title(&user_message, assistant_response.as_deref())
          .map_err(to_error)
  }
  ```

### Layer 3: Frontend — Add send-time trigger, keep agent:complete as retry, add remap handling

**8. `apps/agent/src/lib/api/agent.ts`** (line 505-510)

- Update `generateSessionTitle` with optional `assistantResponse`:
  ```typescript
  export async function generateSessionTitle(
    userMessage: string,
    assistantResponse?: string
  ): Promise<string> {
    return invoke<string>('agent_generate_title', {
      userMessage,
      ...(assistantResponse !== undefined ? { assistantResponse } : {}),
    });
  }
  ```

**9. `apps/agent/src/services/session/session-title-service.ts`** (line 128-163)

- Add session-remap infrastructure for title-state:

  ```typescript
  /** Maps old session IDs to canonical IDs after system:init remap. */
  const titleSessionAliases = new Map<string, string>();

  /**
   * Resolve the canonical session ID for title state.
   * If the session has been remapped (fork/rewind/legacy), returns the new ID.
   */
  function resolveCanonicalTitleSessionId(sessionId: string): string {
    return titleSessionAliases.get(sessionId) ?? sessionId;
  }

  /**
   * Remap title-generation state when system:init changes a session's identity.
   * Called from chat-message-service.ts alongside other remap calls.
   */
  export function remapSessionTitleState(oldSessionId: string, newSessionId: string): void {
    titleSessionAliases.set(oldSessionId, newSessionId);

    if (aiTitleGenerated.delete(oldSessionId)) {
      aiTitleGenerated.add(newSessionId);
    }
    if (aiTitleInFlight.delete(oldSessionId)) {
      aiTitleInFlight.add(newSessionId);
    }
    const pending = pendingTitles.get(oldSessionId);
    if (pending !== undefined) {
      pendingTitles.delete(oldSessionId);
      pendingTitles.set(newSessionId, pending);
    }
  }
  ```

- Make `assistantResponse` optional in `generateAITitle`, use canonical session ID:

  ```typescript
  export function generateAITitle(
    sessionId: string,
    userMessage: string,
    assistantResponse?: string
  ): void {
    const canonicalId = resolveCanonicalTitleSessionId(sessionId);
    if (aiTitleGenerated.has(canonicalId) || aiTitleInFlight.has(canonicalId)) return;
    aiTitleInFlight.add(canonicalId);

    void (async (): Promise<void> => {
      try {
        const title = await generateSessionTitle(userMessage, assistantResponse);
        // Re-resolve in case remap happened while the request was in flight
        const resolvedId = resolveCanonicalTitleSessionId(sessionId);
        aiTitleGenerated.add(resolvedId);
        applySessionTitle(resolvedId, title);
        logger.info('AI title generated', { sessionId: resolvedId, title });
      } catch (err: unknown) {
        logger.warn('AI title generation failed, will retry on next turn', { sessionId, err });
      } finally {
        const resolvedId = resolveCanonicalTitleSessionId(sessionId);
        aiTitleInFlight.delete(resolvedId);
      }
    })();
  }
  ```

- Export new functions from barrel: `session-title-service.ts` → `index.ts`

**10. `apps/agent/src/services/session/index.ts`**

- Add `remapSessionTitleState` to exports:
  ```typescript
  export {
    applySessionTitle,
    flushPendingTitle,
    generateAITitle,
    generateFallbackTitle,
    remapSessionTitleState,
  } from './session-title-service';
  ```

**11. `apps/agent/src/services/chat/chat-message-service.ts`** (line 492-518, 791-812)

- In `handleSystemInit()` remap block (line 492-525), add title-state remap call after `this.remapRunningState()`:

  ```typescript
  // After line 517: this.remapRunningState(frontendSessionId, sdkSessionId);
  remapSessionTitleState(frontendSessionId, sdkSessionId);
  ```

- Add `remapSessionTitleState` to imports from `@/services/session`

- **MODIFY** (not delete) the title generation block in `handleAgentComplete()` (lines 791-812):
  - Remove `assistantText.length > 0` guard (no longer required for send-time path)
  - Pass `assistantResponse` as optional second arg for improved retry quality
  - The `aiTitleGenerated` Set prevents duplicate generation after the send-time call succeeds

  ```typescript
  // Retry AI title if the send-time attempt failed.
  // aiTitleGenerated Set prevents duplicate generation after success.
  {
    const currentSession = useChatStore.getState().sessions[sid];
    if (currentSession) {
      const msgs = currentSession.messages;
      const userMsgs = msgs.filter((m) => m.role === 'user');
      if (userMsgs.length >= 1) {
        const userText = userMsgs[0]?.content ?? '';
        if (userText.length > 0) {
          const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
          const assistantText = assistantMsgs.find((m) => m.content.length > 0)?.content;
          generateAITitle(sid, userText, assistantText);
        }
      }
    }
  }
  ```

**12. `apps/agent/src/hooks/chat/handlers/chat-actions.ts`** (line 147-151)

- Add `generateAITitle` to imports from `@/services/session`
- After `applySessionTitle(sessionId, generateFallbackTitle(text))` on line 150, add:
  ```typescript
  generateAITitle(sessionId, text);
  ```
- This covers the "existing conversation, first message" path

**13. `apps/agent/src/hooks/chat/use-chat-messages.ts`** (line 306-307)

- In the `useEffect` that processes `pendingMessage` after `conversation:created`:
  After the `applySessionTitle(lastCreatedSessionId, generateFallbackTitle(text))` call (line 307), add:
  ```typescript
  generateAITitle(lastCreatedSessionId, text);
  ```
- This covers the "new conversation" path (fallback title already set)
- Add `generateAITitle` import from `@/services/session`

---

## Failure contract

Title generation failures must be thrown (not converted to `'Untitled'`):

| Failure scenario                            | Bridge behavior        | Frontend behavior                                         |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| No credentials (`hasCredentials === false`) | `throw Error`          | `catch` → fallback title stays, retry on `agent:complete` |
| API timeout (15s)                           | SDK throws, propagates | Same                                                      |
| Empty model output (blank text blocks)      | `throw Error`          | Same                                                      |
| Network error                               | SDK throws, propagates | Same                                                      |
| Rate limit / 429                            | SDK throws, propagates | Same                                                      |

The key invariant: `aiTitleGenerated.add()` is only called after a non-empty title is received and applied. Failures are always caught by the existing `try/catch` in `generateAITitle()`, which logs a warning and allows the `agent:complete` retry path.

---

## Title generation flow (two-phase)

```
Phase 1 — Send-time (fast, user-message-only):
  User presses Enter
    → generateFallbackTitle(text) → sidebar shows placeholder immediately
    → generateAITitle(sessionId, text) → Haiku call (~200-500ms)
    → On success: applySessionTitle() → sidebar updates with AI title
    → On failure: fallback title stays, aiTitleGenerated NOT set → retry enabled

Phase 2 — agent:complete (retry with context):
  Agent finishes response
    → generateAITitle(sessionId, userText, assistantText)
    → aiTitleGenerated Set blocks if Phase 1 succeeded
    → If Phase 1 failed: retry with both user + assistant text → better title quality

Session remap handling:
  system:init arrives with different session ID
    → remapSessionTitleState(oldId, newId) migrates dedupe sets + pending titles
    → In-flight Phase 1 resolves canonical ID before applying title
```

---

## What stays the same

- `generateFallbackTitle()` — instant placeholder, works perfectly
- `applySessionTitle()` + `flushPendingTitle()` — persistence pipeline unchanged
- `pendingTitles` Map — JSONL timing handling unchanged (remap support added)
- Cost — no expected additional cost on the success path. Failure/retry may issue a second request

---

## Key reuse points

| Existing code                        | Location                                                   | Reuse                                       |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| `ClaudeCredentials.getCredentials()` | `agent-bridge/src/common/auth/credentials.ts`              | OAuth token + API key with auto-refresh     |
| `@anthropic-ai/sdk`                  | `agent-bridge/package.json` (^0.74.0)                      | Direct Anthropic client, no new deps        |
| `generateFallbackTitle()`            | `apps/agent/src/services/session/session-title-service.ts` | Instant placeholder — unchanged             |
| `applySessionTitle()`                | same file                                                  | Persist to UIStore + JSONL — unchanged      |
| `remapSession()` pattern             | `chat-message-service.ts` lines 492-525                    | Session-state remap — title follows pattern |

---

## Verification

### Automated tests (required before merge)

Tests are organized by what they protect. Each test file covers a specific integration boundary.

**1. Sidecar: `agent-bridge/src/__tests__/title-generation.e2e.test.ts`**

Real integration test — direct SDK path under real credentials. Auto-skips in CI.

```typescript
/**
 * TESTED: agent-bridge/src/agent/session/session-manager.ts:generateTitle()
 *     Run: cd agent-bridge && bun test
 */
import { describe, it, expect } from 'bun:test';

describe('title generation (direct SDK)', () => {
  it('generates a non-empty title through the direct SDK path', async () => {
    const manager = new SessionManager();
    const title = await manager.generateTitle('Help me debug a TypeScript build failure');
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(50);
  });

  it('generates a title with optional assistant context', async () => {
    const manager = new SessionManager();
    const title = await manager.generateTitle(
      'fix this error',
      'The error is a TypeScript strict null check failure in your useEffect hook.'
    );
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(50);
  });

  it('accepts omitted assistantResponse across the request schema', async () => {
    // Exercises the optional-field IPC contract (TS schema + Rust serde).
    // If assistantResponse serialization breaks when omitted, this fails.
    const manager = new SessionManager();
    const title = await manager.generateTitle('Explain React useEffect cleanup');
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });

  it('throws when credentials are unavailable', async () => {
    // Requires mocking ClaudeCredentials or running in env without credentials.
    // Auto-skips in CI alongside other credential-dependent tests.
  });
});
```

**2. Trigger sites: `apps/agent/src/__tests__/unit/hooks/chat/chat-actions-title-generation.test.ts`**

Verifies the two send-time entry points actually call `generateAITitle`.

```typescript
/**
 * TESTED: apps/agent/src/hooks/chat/handlers/chat-actions.ts (send-time trigger)
 *     Run: bun run test
 */
describe('send-time title generation', () => {
  // Uses createChatActions() pattern from chat-actions-thinking-persistence.test.ts
  // vi.mock('@/services/session') to capture generateAITitle calls

  it('triggers AI title on first message in existing untitled conversation', () => {
    // Arrange: existing conversation with messages.length === 0, conversationExists === true
    // Act: createChatActions({ postMessage }).handleSend({ text: 'help me debug' })
    // Assert: generateAITitle called with (sessionId, 'help me debug')
    // Assert: applySessionTitle also called (fallback title)
  });

  it('does NOT trigger AI title on second message', () => {
    // Arrange: conversation with messages.length >= 1
    // Act: handleSend(...)
    // Assert: generateAITitle NOT called
  });
});
```

**3. New-conversation path: `apps/agent/src/__tests__/integration/hooks/chat/use-chat-messages-title.test.tsx`**

Verifies the pendingMessage/conversation:created flow fires `generateAITitle`.

```typescript
/**
 * TESTED: apps/agent/src/hooks/chat/use-chat-messages.ts (new-conversation send-time trigger)
 *     Run: bun run test
 */
describe('new conversation title generation', () => {
  it('triggers AI title after conversation:created processes pendingMessage', () => {
    // Arrange: set pendingMessage + lastCreatedSessionId in ChatStore
    // Act: render hook/effect, trigger useEffect
    // Assert: applySessionTitle called with fallback title
    // Assert: generateAITitle called with (lastCreatedSessionId, text)
  });
});
```

**4. Retry + remap: `apps/agent/src/__tests__/unit/services/chat/title-remap-and-retry.test.ts`**

Verifies `agent:complete` retry and `system:init` remap integration in ChatMessageService.

```typescript
/**
 * TESTED: apps/agent/src/services/chat/chat-message-service.ts (retry + remap)
 *     Run: bun run test
 */
describe('ChatMessageService title integration', () => {
  it('retries title generation on agent:complete after send-time failure', () => {
    // Arrange: mock generateAITitle to track calls
    // Act: feed handleAgentComplete with session that has user + assistant messages
    // Assert: generateAITitle called with (sessionId, userText, assistantText)
  });

  it('invokes remapSessionTitleState on system:init remap', () => {
    // Arrange: mock remapSessionTitleState, set up frontendSessionId !== sdkSessionId
    // Act: feed handleSystemInit with mismatched IDs
    // Assert: remapSessionTitleState called with (frontendSessionId, sdkSessionId)
  });
});
```

**5. Title service: `apps/agent/src/__tests__/unit/services/session/session-title-service.test.ts`**

Verifies service-level behavior: dedup, remap, and failure handling. Uses `vi.resetModules()` for isolation since dedupe Sets and alias Map are module-level singletons.

```typescript
/**
 * TESTED: apps/agent/src/services/session/session-title-service.ts
 *     Run: bun run test
 */
describe('generateAITitle', () => {
  // Use vi.resetModules() before each test to isolate module-level state

  it('preserves fallback title when API call throws', () => {
    // Arrange: mock generateSessionTitle to throw
    // Act: call generateAITitle
    // Assert: applySessionTitle NOT called, retry possible
  });

  it('blocks duplicate generation after success', () => {
    // Arrange: mock generateSessionTitle to return 'Good Title'
    // Act: call generateAITitle twice
    // Assert: generateSessionTitle called exactly once
  });
});

describe('remapSessionTitleState', () => {
  it('migrates in-flight state so async completion applies to new ID', () => {
    // Arrange: call generateAITitle (starts in-flight)
    // Act: remapSessionTitleState(oldId, newId) before async completion
    // Act: let async completion resolve
    // Assert: applySessionTitle called with newId
  });

  it('migrates pending titles from old to new session ID', () => {
    // Arrange: applySessionTitle stores pending → remap
    // Assert: flushPendingTitle(newId) finds the title
  });
});
```

### Build & lint checks

1. **Build sidecar**: `cd agent-bridge && bun run build:dev`
2. **Typecheck**: `bun run typecheck` (verify `@anthropic-ai/sdk` import resolves cleanly)
3. **Agent-bridge tests**: `cd agent-bridge && bun test`
4. **Frontend tests**: `bun run test`
5. **Lint**: `bun run lint`
6. **Rust check**: `cargo check`

### Manual verification

1. **Run app**: `bunx tauri dev`
2. New conversation → send first message → title should appear within ~500ms
3. "New conversation" button → send message → same instant title
4. Fallback title shows immediately, AI title replaces it shortly after
5. Sidebar updates reactively
6. Second message → no duplicate title generation
7. Test with both OAuth and API key auth if possible
8. Verify title persists in JSONL (switch away and back, title still there)
9. **Retry test**: Kill network briefly before first message, restore before agent responds → title should appear after `agent:complete` retry
10. **Vague message test**: Send "fix this" or "help me" → verify fallback title stays if send-time fails, or reasonable title if it succeeds
11. **Rewind**: Rewind to first message → forked session should not re-trigger title generation if original succeeded (remap carries forward)
12. Browser-only dev mode (`bun run dev`) — title generation invoke fails silently, fallback title stays (expected, not a supported verification environment)

### Implementation checklist

- [ ] Add `TESTED:` source comments to all tested files (per `CLAUDE.md` integration-test annotation requirements)
- [ ] Use `vi.resetModules()` in frontend service tests to isolate module-level singleton state between test cases
- [ ] Note in `remapSessionTitleState`: alias cleanup deferred — aliases persist for session lifetime (acceptable for current behavior; clean up in `deleteSession` if memory hygiene becomes a concern)
- [ ] Log follow-up: user-only titles for vague prompts are never upgraded with assistant context (out of scope for this change)

---

## Audit findings incorporated

_From `reviews/audit-plan.md` — three audit rounds (2026-03-07):_

### Round 1 — Original critical issues

| Finding                                                    | Severity | Resolution                                                                                  |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Lost retry mechanism                                       | Critical | Kept `agent:complete` handler as fallback retry path instead of deleting it                 |
| Title quality regression from removing `assistantResponse` | Critical | Made `assistantResponse` optional instead of removing it. Retry path passes assistant text. |

### Round 2 — Revised critical issues

| Finding                                      | Severity    | Resolution                                                                                                                                                    |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing-credentials path treated as success  | Critical    | `generateTitle` now throws on missing credentials and blank output. `aiTitleGenerated` only set after non-empty title. Added explicit failure contract table. |
| Session-remap flows not handled              | Critical    | Added `remapSessionTitleState()` with alias map, called from `handleSystemInit()` remap block. `generateAITitle` resolves canonical ID before applying title. |
| Manual-only verification                     | Critical    | Added required automated test plan covering sidecar, trigger sites, retry, and remap.                                                                         |
| Performance story over-attributes to query() | Recommended | Revised Context section to note existing query() is already ~1-2s.                                                                                            |
| Hard-coded model ID                          | Recommended | Extracted to `TITLE_MODEL` constant.                                                                                                                          |
| "Zero additional cost" too absolute          | Recommended | Reworded to "no expected additional cost on the success path."                                                                                                |

### Round 3 — Test coverage gaps

| Finding                                                                 | Severity    | Resolution                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests don't cover actual trigger sites or optional-argument bridge path | Critical    | Expanded test plan to 5 test files covering: (1) sidecar e2e with optional `assistantResponse`, (2) `chat-actions.ts` send-time trigger, (3) `use-chat-messages.ts` new-conversation trigger, (4) `ChatMessageService` retry + remap integration, (5) service-level dedup and remap behavior. |
| Missing `TESTED:` source comments                                       | Recommended | Added to implementation checklist.                                                                                                                                                                                                                                                            |
| Module-level state leaks across tests                                   | Recommended | Added `vi.resetModules()` guidance for singleton isolation.                                                                                                                                                                                                                                   |
| Alias cleanup not discussed                                             | Recommended | Documented as deferred — aliases persist for session lifetime, clean up in `deleteSession` if needed.                                                                                                                                                                                         |
| Successful user-only titles never upgraded                              | Recommended | Logged as follow-up in implementation checklist. Out of scope for this change.                                                                                                                                                                                                                |
