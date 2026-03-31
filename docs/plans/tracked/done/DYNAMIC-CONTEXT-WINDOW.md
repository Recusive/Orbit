# Fix Context Window Meter — Two Issues

## Context

The context window meter in Orbit has two user-visible bugs that compound to make the display wildly inaccurate. Investigation of Claude Code's CLI (`/context` command) revealed how it should work.

### Issue 1: Wrong context window size

`MODEL_CONTEXT_WINDOWS` in `tool-store.ts:217-221` hardcodes all models at 200k. Opus 4.6 is 1M on subscription (model ID includes `[1m]` suffix). Sonnet 4.6 is 200k on subscription but 1M with an API key + the `context-1m-2025-08-07` beta flag. Claude Code resolves this dynamically via model-name + beta-flag check.

### Issue 2: Wrong usage calculation (two independent causes)

**Cause A — Double-counting (wrong accumulation model):**
The SDK's result message `usage` is **cumulative** — each result includes ALL tokens consumed in the session so far. Our `addUsage()` at `tool-store.ts:581` does `+=`, summing on top of already-cumulative values. After N turns, we show ~Nx the real usage.

**Cause B — Wrong formula:**
Our formula (`tool-store.ts:777`): `inputTokens + outputTokens`
Claude Code's formula: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`

We include output tokens (don't consume context window) and exclude cache tokens (which do).

## How Claude Code Does It

```javascript
// 1. Context window from model name + beta flag
function xG(model, betas) {
  if (model.includes('[1m]') || (betas?.includes('context-1m-2025-08-07') && isEligible(model)))
    return 1_000_000;
  return 200_000;
}

// 2. Usage from LAST assistant message (cumulative, not summed)
function yH6(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.type === 'assistant' && messages[i].message.usage)
      return messages[i].message.usage;
  }
}

// 3. Context percentage — input-side tokens only
function ZiA(usage, contextWindow) {
  const used =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  return Math.min(100, Math.round((used / contextWindow) * 100));
}
```

## Design Decisions

- **Session-scoped updates.** Usage and context window updates carry `sessionId`. Store writes go to `sessionCache[sessionId]` first and only mirror to active state when `sessionId === currentSessionId`. Prevents background sessions from overwriting the viewed session.
- **Context window resolved at session init.** The SDK's `system:init` message includes `betas` and `model`. The bridge resolves `contextWindow` there and emits it with `SessionInitEvent`. The meter is correct from the first render — no waiting for a result event.
- **Cumulative replace, not sum.** `addUsage()` replaces (`=`) instead of accumulating (`+=`). SDK usage is cumulative — last write is authoritative.
- **Shared `getContextUsedTokens()` helper.** One function for the metric: `input + cacheRead + cacheCreation`. Used in `getContextPercentage()`, `getUsedTokens()`, `restoreSessionUsage()` comparison, and `InputControls` props.
- **Hover card shows cache explicitly.** Add a "Cache" row to the context breakdown so the header number reconciles with the body.
- **Hardcoded defaults updated.** Opus=1M, Sonnet=1M, Haiku=200k. Dynamic override from SDK `modelUsage.contextWindow` on result events.

## Changes

### 1. Shared usage helper

**File:** `apps/agent/src/stores/agent/tool-store.ts`

Extract a single function used everywhere:

```typescript
function getContextUsedTokens(usage: UsageData): number {
  return usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
}
```

Use in: `getContextPercentage()`, `getUsedTokens()`, `restoreSessionUsage()` comparison, `InputControls` props.

### 2. Fix context window resolution (Issue 1)

**File:** `apps/agent/src/stores/agent/tool-store.ts`

**2a.** Update `MODEL_CONTEXT_WINDOWS` defaults:

```typescript
const MODEL_CONTEXT_WINDOWS: Record<Model, number> = {
  haiku: 200_000,
  'claude-sonnet-4-6': 200_000, // 1M only with API key + context-1m beta
  'claude-opus-4-6': 1_000_000,
};
```

**2b.** Add to `CachedSessionData`:

```typescript
interface CachedSessionData {
  usage: UsageData;
  processedIds: string[];
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
  contextWindow?: number; // NEW — per-session, from SDK
}
```

**2c.** Add `currentContextWindow: number | null` to `ToolState` (active session's resolved value).

**2d.** Extract `resolveMaxTokens(state)` helper:

```typescript
function resolveMaxTokens(state: ToolState): number {
  return state.currentContextWindow ?? MODEL_CONTEXT_WINDOWS[state.model];
}
```

Used by both `getMaxTokens()` and `getContextPercentage()`.

**2e.** Add `setContextWindow(sessionId, contextWindow)` action — session-aware:

```typescript
setContextWindow: (sessionId: string, contextWindow: number) => {
  if (contextWindow <= 0) return;
  set((state) => {
    // Update or create session cache entry
    const cached = state.sessionCache[sessionId];
    if (cached) {
      state.sessionCache[sessionId] = { ...cached, contextWindow };
    } else {
      // Create entry if none exists (init event can arrive before first result)
      state.sessionCache[sessionId] = {
        usage: { ...initialUsage },
        processedIds: [],
        activeTools: {},
        completedTools: [],
        contextWindow,
      };
    }
    // Only update active state if this is the viewed session
    if (state.currentSessionId === sessionId) {
      state.currentContextWindow = contextWindow;
    }
  });
},
```

**2f.** Full `currentContextWindow` lifecycle in `switchSession()`:

```typescript
// When LEAVING current session — cache contextWindow alongside usage/tools
if (state.currentSessionId) {
  state.sessionCache[state.currentSessionId] = {
    // ...existing cached fields (usage, processedIds, tools)...
    contextWindow: state.currentContextWindow ?? undefined,
  };
}

// When ENTERING new session — all three branches must set currentContextWindow
const cached = state.sessionCache[newSessionId];
if (cached) {
  state.currentContextWindow = cached.contextWindow ?? null;
  // ...existing restore logic...
} else if (isInitLoad) {
  state.currentContextWindow = null;
} else {
  state.currentContextWindow = null;
}
```

**2g.** `remapSession()` — no special handling needed. `contextWindow` lives in `CachedSessionData`, which `remapSession` already migrates from oldId to newId. If `setContextWindow` fires before remap, value is stored under oldId and migrated automatically.

**2h.** Clear in `resetUsage()`:

```typescript
state.currentContextWindow = null;
```

**2i.** Clear in store-wide `reset()`:

```typescript
state.currentContextWindow = null;
state.sessionCache = {};
```

### 3. Fix usage accumulation — session-aware replace (Issue 2, Cause A)

**File:** `apps/agent/src/stores/agent/tool-store.ts`

**3a.** Change `addUsage()` to session-aware replacement:

```typescript
addUsage: (sessionId: string, messageId: string, usage: { ... }, totalCostUsd?: number) => {
  set((state) => {
    const newUsage: UsageData = {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      totalCostUsd: totalCostUsd ?? 0,
    };

    // Update session cache
    const cached = state.sessionCache[sessionId];
    if (cached) {
      state.sessionCache[sessionId] = { ...cached, usage: newUsage };
    }

    // Only update active state if this is the viewed session
    if (state.currentSessionId === sessionId) {
      state.sessionUsage = newUsage;
    }
  });
},
```

**3b.** Update caller in `chat-message-service.ts` to pass `sessionId`:

```typescript
// The agent:complete message has session_id
useToolStore.getState().addUsage(
  message.session_id,
  message.message_id,
  { ... },
  message.total_cost_usd
);
```

**3c.** Remove `processedMessageIds` guard from `addUsage()`. With replace model, dedup is unnecessary.

### 4. Fix usage formula (Issue 2, Cause B)

**File:** `apps/agent/src/stores/agent/tool-store.ts`

**4a.** `getContextPercentage()` and `getUsedTokens()` use the shared helper:

```typescript
getContextPercentage: () => {
  const state = get();
  const maxTokens = resolveMaxTokens(state);
  const usedTokens = getContextUsedTokens(state.sessionUsage);
  return Math.min(100, Math.round((usedTokens / maxTokens) * 100));
},

getUsedTokens: () => getContextUsedTokens(get().sessionUsage),
```

**4b.** `restoreSessionUsage()` comparison uses the same metric:

```typescript
const existingTotal = getContextUsedTokens(existingCache?.usage ?? initialUsage);
const incomingTotal = getContextUsedTokens(usage);
if (incomingTotal >= existingTotal) {
  /* replace */
}
```

**File:** `apps/agent/src/components/chat/input/InputControls.tsx`

**4c.** Update `usedTokens` prop:

```typescript
usedTokens={usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens}
```

**4d.** Update `usage` prop to include cache:

```typescript
usage={{
  promptTokens: usage.inputTokens,
  cacheTokens: usage.cacheReadInputTokens + usage.cacheCreationInputTokens,
  completionTokens: usage.outputTokens,
}}
```

**File:** `apps/agent/src/components/chat/input/context.tsx`

**4e.** Add `cacheTokens` to `TokenUsage` interface and render a "Cache" row in the hover card:

```typescript
interface TokenUsage {
  promptTokens?: number;
  cacheTokens?: number; // NEW
  completionTokens?: number;
  totalTokens?: number;
}
```

Add `ContextCacheUsage` component alongside `ContextInputUsage` and `ContextOutputUsage`.

### 5. Hydrate context window at session init

**File:** `agent-bridge/src/agent/session/session-manager.ts`

**5a.** Add `betas` and `model` to `SDKSystemMessage` (line ~298):

```typescript
interface SDKSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  betas?: string[]; // NEW
  model?: string; // NEW
}
```

**5b.** Add `contextWindow` to `SessionInitEvent` (line ~180):

```typescript
export interface SessionInitEvent {
  sessionId: string;
  sdkSessionId: string;
  isResumed: boolean;
  isForked: boolean;
  contextWindow?: number; // NEW — resolved from model + betas
}
```

**5c.** New helper `agent-bridge/src/agent/utils/context-window.ts`:

```typescript
const CONTEXT_1M_BETA = 'context-1m-2025-08-07';

export function resolveContextWindowFromInit(
  model: string | undefined,
  betas: string[] | undefined
): number {
  if (!model) return 200_000;
  const m = model.toLowerCase();
  // Match Claude Code's xG() logic
  if (m.includes('[1m]')) return 1_000_000;
  if (betas?.includes(CONTEXT_1M_BETA)) {
    if (m.includes('claude-sonnet-4') || m.includes('opus-4-6')) return 1_000_000;
  }
  return 200_000;
}

// For result-event modelUsage extraction (existing alias-based lookup)
export function resolveContextWindowFromModelUsage(...): number | undefined { ... }
```

**5d.** In the `system:init` handler (line ~1295), resolve and emit:

```typescript
const resolvedContextWindow = resolveContextWindowFromInit(sdkMessage.model, sdkMessage.betas);

this._onSessionInit.fire({
  sessionId: orbitSessionId,
  sdkSessionId,
  isResumed: resumeState.isResumed,
  isForked: resumeState.isForked,
  contextWindow: resolvedContextWindow,
});
```

**File:** `src-tauri/src/agent/protocol.rs`

**5e.** Add to `SessionInitEvent` in `protocol.rs`:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub context_window: Option<u32>,
```

**5e-ii.** **Explicit update to `lifecycle.rs`**: `emit_session_init()` (line ~535) hand-builds its JSON payload — new fields do NOT auto-serialize here (unlike `AgentMessage` which serializes the full struct). Add `contextWindow`:

```rust
fn emit_session_init(app: &AppHandle, init_event: &SessionInitEvent) {
    drop(app.emit(
        "agent:session_init",
        serde_json::json!({
            "sessionId": init_event.session_id,
            "sdkSessionId": init_event.sdk_session_id,
            "isResumed": init_event.is_resumed,
            "isForked": init_event.is_forked,
            "contextWindow": init_event.context_window,  // NEW — must be explicit
        }),
    ));
}
```

**File:** `apps/agent/src/providers/tauri-provider.tsx`

**5f.** Forward in `postWindowMessage` for session init:

```typescript
postWindowMessage({
  type: 'system:init',
  // ...existing fields...
  context_window: event.contextWindow,
});
```

**File:** `apps/agent/src/types/protocol/protocol.ts`

**5g.** Add `context_window: z.number().optional()` to `SystemInitSchema`.

**File:** Frontend handler for `system:init`

**5h.** On receiving `system:init`, call `setContextWindow(sessionId, contextWindow)`.

### 6. Thread context window from result events (dynamic override)

Same as previous plan sections 4a–4h, but `setContextWindow` now takes `sessionId` instead of `model`.

**Bridge:** Add `modelUsage` to `SDKResultMessage`, extract with `resolveContextWindowFromModelUsage()`, include `contextWindow` and `model` in result event.

**Rust:** Add `context_window: Option<u32>` and `model: Option<String>` to `AgentMessage`.

**Frontend:** Forward through tauri-provider, call `setContextWindow(sessionId, contextWindow)` in chat-message-service.

### 7. Tests

**File:** `apps/agent/src/__tests__/unit/stores/agent/tool-store.test.ts`

- Fix `getMaxTokens` expected values: Opus=1M, Sonnet=200k (1M only with beta), Haiku=200k
- Test `addUsage` REPLACES (not sums) cumulative values
- Test `addUsage` is session-scoped: background session doesn't overwrite active session
- Test `getContextPercentage` uses `input + cache` (not output)
- Test `setContextWindow` per-session + `switchSession` restores it
- Test `restoreSessionUsage` comparison uses `getContextUsedTokens`
- Test `getUsedTokens` excludes output tokens

**New file:** `agent-bridge/src/__tests__/context-window.test.ts`

- `resolveContextWindowFromInit`: with/without 1M beta, eligible/ineligible models
- `resolveContextWindowFromModelUsage`: exact match, alias match, versioned key, missing, zero

### 8. Historical conversation loads — scoped to fallback

Opening an old conversation from disk does NOT get a live `system:init` event. The `conversation:loaded` path currently carries `session_usage` only — no `contextWindow`.

**Decision: historical views use `MODEL_CONTEXT_WINDOWS` fallback.** This is acceptable because:

- The fallback defaults are now correct for all current models (Opus=1M, Sonnet=1M, Haiku=200k)
- The first new turn in a historical session triggers `system:init` → hydrates the real value
- Persisting `contextWindow` in `.usage.json` + extending the Rust conversation DTO + updating `conversation:loaded` adds cross-layer complexity for minimal benefit

**If Anthropic changes a model's context window in the future**, old conversations opened before updating the defaults would briefly show the stale fallback until the user sends a message. This is the same behavior Claude Code has (hardcoded in the binary, updated with new CLI versions).

> **Future enhancement:** If this fallback becomes problematic, persist `contextWindow` alongside `.usage.json` and surface through `conversation:loaded`. This is a separate plan.

## What Does NOT Change

- **`BackendChatSurface` / `ChatContent` / `ChatInput`** — prop passthrough only
- **`.usage.json` persistence** — already stores cumulative usage correctly, no new fields

## Verification

1. `cargo check` — Rust compiles with new fields
2. `bun run typecheck` — TypeScript types align
3. `bun run test` — All store tests pass with new accumulation model + formula
4. `bunx tauri dev` — Start app:
   - Context meter shows correct % on first render (init hydration, not waiting for result)
   - Multi-turn conversation: meter doesn't inflate with each turn
   - Compare with Claude Code `/context` output — should match
   - Switch sessions: each session keeps its own context window and usage
   - Hover card shows Input / Cache / Output breakdown that reconciles with header
5. `./scripts/lint-all.sh` — Full lint pass
