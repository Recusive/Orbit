# Fix Context Meter + Context Detail Dialog

## Context

The context window meter shows wildly wrong values (3.7M/1M = 100% when Claude Code shows 246k/1M = 24.6% for the same session). The root cause: we read cumulative session usage from the SDK's `result` message instead of per-turn usage from the last `assistant` message. Additionally, the user wants a "More" button in the context hover card that opens a full detail dialog showing session metadata, visual progress graph, and breakdown — inspired by Claude Code's `/context` command.

**Codex already implemented** session scoping, context window resolution, and replace-not-sum semantics (uncommitted on v0.0.9). Those changes are correct but use the wrong usage source. This plan fixes the source and adds the detail dialog.

## Two Deliverables

### Deliverable 1: Fix usage source (per-turn from assistant message)

The SDK's `result.usage.cache_read_input_tokens` is cumulative across ALL turns (3.7M after many turns). The `assistant.message.usage.cache_read_input_tokens` is per-turn (246k = actual context occupancy). Claude Code reads the last assistant message (`yH6()`). We need to do the same.

### Deliverable 2: Context detail dialog

"More" button in the context hover card → opens dialog showing:

- Visual progress bar/graph (used vs free, color-coded)
- Token breakdown: Input / Cache Read / Cache Creation / Output / Total
- Session metadata: Model, context window size, tools, MCP servers
- Percentages and formatted token counts

## How Claude Code Does It (Reference)

```
// Two usage modes:
// 1. Before any API call: estimate from known components
// 2. After API calls: last assistant message's per-turn usage (preferred)

z1 = (Y1?.input_tokens + Y1?.cache_creation_input_tokens + Y1?.cache_read_input_tokens) ?? N1
percentage = Math.round(z1 / contextWindow * 100)
```

Categories shown: System prompt, System tools, MCP tools, Custom agents, Memory files, Skills, Messages, Autocompact buffer, Free space — each with individual token counts from a token counter API.

We'll show the aggregate breakdown (Input/Cache/Output) since we don't have per-category token counting infrastructure.

## Changes

### 1. Bridge: Capture per-turn usage from assistant messages

**File:** `agent-bridge/src/agent/session/session-manager.ts`

**1a.** Add `usage` to `SDKAssistantMessage` local type (line ~321):

```typescript
interface SDKAssistantMessage {
  type: 'assistant';
  uuid?: string;
  session_id?: string;
  message?: {
    content?: ContentBlock[];
    usage?: {
      // NEW — per-turn usage from SDK
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
  };
  parent_tool_use_id?: string | null;
}
```

**1b.** Add per-session Map to track last assistant usage (near other per-session Maps ~line 960):

```typescript
private lastAssistantUsage = new Map<string, {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}>();
```

**1c.** In the `assistant` message handler (line ~1477), capture usage **BEFORE** the content guard. The current handler does `if (content === undefined) continue;` early — usage must be saved before that gate, because assistant messages can have `usage` without renderable `content`:

```typescript
if (sdkMessage.type === 'assistant') {
  // Capture per-turn usage BEFORE content guard — usage exists even without content blocks
  const assistantUsage = sdkMessage.message?.usage;
  if (assistantUsage) {
    this.lastAssistantUsage.set(sessionId, {
      input_tokens: assistantUsage.input_tokens ?? 0,
      output_tokens: assistantUsage.output_tokens ?? 0,
      cache_read_input_tokens: assistantUsage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: assistantUsage.cache_creation_input_tokens ?? 0,
    });
  }

  const content = sdkMessage.message?.content;
  if (content === undefined) continue; // Existing early exit — usage already saved above

  // ...existing content handling...
}
```

**1d.** Add `turnUsage` to `AgentMessage` interface (line ~130):

```typescript
/** Per-turn usage from the last assistant message.
 *  Reflects actual context window occupancy for this turn.
 *  Only populated on 'result' type messages. */
turnUsage?: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};
```

**1e.** In the result handler (line ~1750), include saved turn usage in the fired event:

```typescript
// Map from SDK snake_case to AgentMessage camelCase
const savedTurnUsage = this.lastAssistantUsage.get(sessionId);
const turnUsage = savedTurnUsage ? {
  inputTokens: savedTurnUsage.input_tokens,
  outputTokens: savedTurnUsage.output_tokens,
  cacheReadInputTokens: savedTurnUsage.cache_read_input_tokens,
  cacheCreationInputTokens: savedTurnUsage.cache_creation_input_tokens,
} : undefined;

this._onAgentMessage.fire({
  sessionId,
  message: {
    type: 'result',
    ...existing fields...,
    turnUsage,  // NEW
  },
});
```

**1f.** Clean up `lastAssistantUsage` in deleteSession and after result processing. Do **NOT** clean up in the interrupt handler:

```typescript
// In deleteSession:
this.lastAssistantUsage.delete(sessionId);

// After result processing (line ~1799, alongside currentTurnId.delete):
this.lastAssistantUsage.delete(sessionId);
```

> **Why NOT on interrupt:** The `interrupt()` method does not stop the consumer loop immediately — it flushes text and lets the SDK finish. A `result` or `cancel` event still arrives after `interrupt()`. Deleting `lastAssistantUsage` there would erase the valid turn snapshot before the result event can read it. Instead, cleanup happens naturally when the result/cancel event processes and hits the delete above.
>
> **Stale data concern:** If a user interrupts and then sends a new message, the next `assistant` message overwrites the Map entry, so stale data from the interrupted turn is replaced before it matters.

### 1g. Persist per-turn usage for reload/history restore

**Serialization contract — one shape per boundary:**

| Boundary                 | Format                          | Example key                  | Owner                                             |
| ------------------------ | ------------------------------- | ---------------------------- | ------------------------------------------------- |
| `.usage.json` (disk)     | camelCase (existing convention) | `lastTurnUsage`              | `agent-bridge/persistSessionUsage()`              |
| Rust internal struct     | snake_case (Rust naming)        | `last_turn_usage`            | `crates/common/conversations/src/lib.rs`          |
| Rust DTO → frontend      | camelCase (`serde(rename_all)`) | `lastTurnUsage`              | `src-tauri/conversations.rs`                      |
| Frontend protocol schema | camelCase (matches DTO)         | `lastTurnUsage`              | `apps/agent/src/types/protocol/protocol.ts`       |
| Frontend service/hooks   | camelCase (TypeScript)          | `sessionUsage.lastTurnUsage` | `chat-message-service.ts`, `use-chat-messages.ts` |

**Backward compat:** Old `.usage.json` files without `lastTurnUsage` deserialize with `undefined` — no migration needed.

---

**File:** `agent-bridge/src/agent/session/session-manager.ts`

In `persistSessionUsage()`, add `lastTurnUsage` to the sidecar data (camelCase, matching existing keys like `inputTokens`):

```typescript
const data = {
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
  cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
  totalCostUsd: totalCostUsd ?? 0,
  lastTurnUsage: turnUsage
    ? {
        inputTokens: turnUsage.inputTokens,
        outputTokens: turnUsage.outputTokens,
        cacheReadInputTokens: turnUsage.cacheReadInputTokens ?? 0,
        cacheCreationInputTokens: turnUsage.cacheCreationInputTokens ?? 0,
      }
    : undefined,
};
```

Update the call site (line ~1782) to pass `turnUsage`:

```typescript
persistSessionUsage(..., totalCostUsd, turnUsage);
```

---

**File:** `crates/common/conversations/src/lib.rs`

Two changes:

**A.** The internal `Conversation` model (line ~399) currently has `session_usage: Option<TokenUsage>`. Change to a richer type that carries per-turn data:

```rust
/// Create a new SessionUsage type (or extend TokenUsage — but cleaner to separate)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_cost_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_turn_usage: Option<TokenUsage>,  // NEW
}

// Update Conversation struct:
pub session_usage: Option<SessionUsage>,  // Was Option<TokenUsage>
```

**B.** Update `read_session_usage()` (line ~2191) — currently manually reads camelCase JSON fields into `TokenUsage`. Add `lastTurnUsage` extraction:

```rust
fn read_session_usage(jsonl_path: &Path) -> Option<SessionUsage> {
    let usage_path = jsonl_path.with_extension("usage.json");
    let data = fs::read_to_string(&usage_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&data).ok()?;

    let to_u32 = |v: u64| -> u32 { u32::try_from(v).unwrap_or(u32::MAX) };

    // Read optional lastTurnUsage (absent in old sidecar files → None)
    let last_turn_usage = json.get("lastTurnUsage").and_then(|lt| {
        Some(TokenUsage {
            input_tokens: lt.get("inputTokens")?.as_u64().map(to_u32)?,
            output_tokens: lt.get("outputTokens")?.as_u64().map(to_u32)?,
            cache_read_input_tokens: lt.get("cacheReadInputTokens").and_then(|v| v.as_u64()).map(to_u32),
            cache_creation_input_tokens: lt.get("cacheCreationInputTokens").and_then(|v| v.as_u64()).map(to_u32),
            total_cost_usd: None,
        })
    });

    Some(SessionUsage {
        input_tokens: json.get("inputTokens").and_then(Value::as_u64).map_or(0, to_u32),
        output_tokens: json.get("outputTokens").and_then(Value::as_u64).map_or(0, to_u32),
        cache_read_input_tokens: json.get("cacheReadInputTokens").and_then(Value::as_u64).map(to_u32),
        cache_creation_input_tokens: json.get("cacheCreationInputTokens").and_then(Value::as_u64).map(to_u32),
        total_cost_usd: json.get("totalCostUsd").and_then(Value::as_f64),
        last_turn_usage,
    })
}
```

> **Backward compat:** Old `.usage.json` files without `lastTurnUsage` → the field is `None`. The frontend `toContextUsage()` helper falls back to cumulative values in that case.

---

**File:** `src-tauri/src/commands/agent/conversations.rs`

Create `SessionUsageDto` — a dedicated wrapper distinct from `TokenUsageDto`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageDto {
    pub input_tokens: u32,
    pub output_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_turn_usage: Option<TokenUsageDto>,  // Reuses existing TokenUsageDto
}
```

Update `ConversationDto.session_usage` type from `Option<TokenUsageDto>` to `Option<SessionUsageDto>`.

Add the conversion glue — currently line 340 does `conv.session_usage.map(TokenUsageDto::from)`:

```rust
impl From<SessionUsage> for SessionUsageDto {
    fn from(usage: SessionUsage) -> Self {
        Self {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            total_cost_usd: usage.total_cost_usd,
            last_turn_usage: usage.last_turn_usage.map(TokenUsageDto::from),
        }
    }
}

// Update ConversationDto::from (line ~340):
session_usage: conv.session_usage.map(SessionUsageDto::from),  // Was TokenUsageDto::from
```

**File:** `apps/agent/src/lib/api/conversations.ts`

Update the frontend `ConversationDto` interface — this is the typed boundary that `conversationLoad()` returns and `use-chat-messages.ts` consumes:

```typescript
export interface ConversationDto {
  // ...existing fields...
  /** Session usage with optional per-turn snapshot for context meter. */
  sessionUsage?: SessionUsageDto; // Was TokenUsageDto
}

// Either import SessionUsageDto from a shared type, or define inline:
export interface SessionUsageDto {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  totalCostUsd?: number;
  lastTurnUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
}
```

> **Critical:** Without this, `use-chat-messages.ts` cannot access `conv.sessionUsage?.lastTurnUsage` — TypeScript compile error. This is the invoked API path (`conversationLoad()`), separate from the protocol path (`conversation:loaded`).

---

**File:** `apps/agent/src/types/protocol/protocol.ts`

Create `SessionUsageSchema` — camelCase, matching the Rust DTO:

```typescript
export const SessionUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number().optional(),
    cacheCreationInputTokens: z.number().optional(),
    totalCostUsd: z.number().optional(),
    lastTurnUsage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadInputTokens: z.number().optional(),
        cacheCreationInputTokens: z.number().optional(),
      })
      .optional(),
  })
  .strip();
```

Update `ConversationLoadedSchema.session_usage` to use `SessionUsageSchema`.

---

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts` AND `apps/agent/src/services/chat/chat-message-service.ts`

Both restore paths use a shared helper. All field access is **camelCase** (it's the DTO, not the sidecar):

```typescript
// Shared helper — used by BOTH restore paths
function toContextUsage(sessionUsage: SessionUsage): UsageData {
  const source = sessionUsage.lastTurnUsage ?? sessionUsage;
  return {
    inputTokens: source.inputTokens,
    outputTokens: source.outputTokens,
    cacheReadInputTokens: source.cacheReadInputTokens ?? 0,
    cacheCreationInputTokens: source.cacheCreationInputTokens ?? 0,
    totalCostUsd: sessionUsage.totalCostUsd ?? 0,
  };
}

// In use-chat-messages.ts (initial mount):
if (conv.sessionUsage) {
  restoreSessionUsage(sessionId, toContextUsage(conv.sessionUsage));
}

// In chat-message-service.ts (sidebar-open / conversation:loaded):
if (message.session_usage) {
  restoreSessionUsage(sessionId, toContextUsage(message.session_usage));
}
```

> **Both paths now use identical logic.** The helper prefers `lastTurnUsage` (per-turn, correct for context meter) and falls back to the cumulative values (for old sessions without per-turn data).

### 2. Bridge: Thread session metadata from system:init

**File:** `agent-bridge/src/agent/session/session-manager.ts`

**2a.** Expand `SDKSystemMessage` (line ~298) to include dropped fields:

```typescript
interface SDKSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  model?: string;
  betas?: string[];
  tools?: string[];
  mcp_servers?: Array<{ name: string; status: string }>;
}
```

**2b.** Expand `SessionInitEvent` (line ~180):

```typescript
export interface SessionInitEvent {
  sessionId: string;
  sdkSessionId: string;
  isResumed: boolean;
  isForked: boolean;
  contextWindow?: number;
  // NEW — session metadata for context detail dialog
  model?: string;
  tools?: string[];
  mcpServers?: Array<{ name: string; status: string }>;
}
```

**2c.** In the `system:init` handler (line ~1295), include metadata:

```typescript
this._onSessionInit.fire({
  sessionId: orbitSessionId,
  sdkSessionId,
  isResumed: resumeState.isResumed,
  isForked: resumeState.isForked,
  contextWindow: resolvedContextWindow,
  model: sdkMessage.model,
  tools: sdkMessage.tools,
  mcpServers: sdkMessage.mcp_servers,
});
```

### 3. Rust: Add `turn_usage` to AgentMessage, metadata to SessionInitEvent

**File:** `src-tauri/src/agent/protocol.rs`

**3a.** Add to `AgentMessage`:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub turn_usage: Option<TokenUsage>,
```

**3b.** Add to `SessionInitEvent`:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub model: Option<String>,
#[serde(skip_serializing_if = "Option::is_none")]
pub tools: Option<Vec<String>>,
#[serde(skip_serializing_if = "Option::is_none")]
pub mcp_servers: Option<Vec<McpServerStatus>>,
```

Add `McpServerStatus` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub status: String,
}
```

**File:** `src-tauri/src/commands/agent/lifecycle.rs`

**3c.** Update `emit_session_init()` (hand-built JSON) to include new fields:

```rust
let mut payload = serde_json::json!({
    "sessionId": init_event.session_id,
    "sdkSessionId": init_event.sdk_session_id,
    "isResumed": init_event.is_resumed,
    "isForked": init_event.is_forked,
});
if let Some(cw) = init_event.context_window {
    payload["contextWindow"] = serde_json::json!(cw);
}
if let Some(model) = &init_event.model {
    payload["model"] = serde_json::json!(model);
}
if let Some(tools) = &init_event.tools {
    payload["tools"] = serde_json::json!(tools);
}
if let Some(servers) = &init_event.mcp_servers {
    payload["mcpServers"] = serde_json::json!(servers);
}
```

### 4. Frontend protocol + provider + API types: Forward turnUsage and metadata

**File:** `apps/agent/src/lib/api/agent.ts`

**4-pre.** Add `turnUsage` to the `AgentMessage` interface and metadata to `SessionInitEvent` — these are the typed boundaries that `tauri-provider.tsx` consumes:

```typescript
// In AgentMessage interface:
turnUsage?: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

// In SessionInitEvent interface (or wherever session init types live):
model?: string;
tools?: string[];
mcpServers?: Array<{ name: string; status: string }>;
```

> **Critical:** Without this, `tauri-provider.tsx` cannot access `message.turnUsage` or `event.model/tools/mcpServers` — TypeScript compile errors.

**File:** `apps/agent/src/types/protocol/protocol.ts`

**4a.** Add `turn_usage` to `AgentCompleteSchema`:

```typescript
turn_usage: z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
}).strict().optional(),
```

**4b.** Add metadata to `SystemInitSchema` — **`model` and `tools` already exist** (protocol.ts:1032-1033). Only add `mcp_servers`:

```typescript
// model: z.string().optional(),          — ALREADY EXISTS, do NOT re-add
// tools: z.array(z.string()).optional(),  — ALREADY EXISTS, do NOT re-add
mcp_servers: z.array(z.object({ name: z.string(), status: z.string() })).optional(),  // NEW
```

**File:** `apps/agent/src/providers/tauri-provider.tsx`

**4c.** Forward `turn_usage` in result/turn_complete case:

```typescript
turn_usage: message.turnUsage ? {
  input_tokens: message.turnUsage.inputTokens,
  output_tokens: message.turnUsage.outputTokens,
  cache_read_input_tokens: message.turnUsage.cacheReadInputTokens,
  cache_creation_input_tokens: message.turnUsage.cacheCreationInputTokens,
} : undefined,
```

**4d.** Forward metadata in system:init:

```typescript
model: event.model,
tools: event.tools,
mcp_servers: event.mcpServers,
```

### 5. Frontend: Use turnUsage for context meter

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

**5a.** In `handleAgentComplete`, use `turn_usage` for context meter. Do NOT fall back to cumulative `usage` — it shows wrong values (3.7M). Instead, keep previous per-turn value and only update cost:

```typescript
if (message.turn_usage) {
  // Per-turn usage available — update context meter with actual context occupancy
  useToolStore.getState().addUsage(
    sid,
    message.message_id,
    {
      input_tokens: message.turn_usage.input_tokens,
      output_tokens: message.turn_usage.output_tokens,
      cache_read_input_tokens: message.turn_usage.cache_read_input_tokens,
      cache_creation_input_tokens: message.turn_usage.cache_creation_input_tokens,
    },
    message.total_cost_usd
  );
} else if (message.usage && message.total_cost_usd !== undefined) {
  // No per-turn usage (error case, interrupted). Only update cost.
  // Keep previous per-turn token values — do NOT replace with cumulative.
  const current = useToolStore.getState().sessionUsage;
  useToolStore.getState().addUsage(
    sid,
    message.message_id,
    {
      input_tokens: current.inputTokens,
      output_tokens: current.outputTokens,
      cache_read_input_tokens: current.cacheReadInputTokens,
      cache_creation_input_tokens: current.cacheCreationInputTokens,
    },
    message.total_cost_usd
  );
}
```

### 6. Frontend: Session metadata store

**File:** `apps/agent/src/stores/agent/tool-store.ts`

**6a.** Add session metadata to state:

```typescript
// In ToolState interface:
sessionModel: string | null;
sessionTools: string[];
sessionMcpServers: Array<{ name: string; status: string }>;
```

**6b.** Add session-scoped action (same pattern as `setContextWindow`):

```typescript
setSessionMetadata: (
  sessionId: string,
  model: string | null,
  tools: string[],
  mcpServers: Array<{ name: string; status: string }>
) => void;
```

**Implementation:**

```typescript
setSessionMetadata: (sessionId, model, tools, mcpServers) => {
  set((state) => {
    // Update or create session cache entry
    const cached = state.sessionCache[sessionId] ?? {
      usage: { ...initialUsage },
      processedIds: [],
      activeTools: {},
      completedTools: [],
    };
    state.sessionCache[sessionId] = {
      ...cached,
      sessionModel: model ?? undefined,
      sessionTools: [...tools],
      sessionMcpServers: [...mcpServers],
    };
    // Only update active state if this is the viewed session
    if (state.currentSessionId === sessionId) {
      state.sessionModel = model;
      state.sessionTools = [...tools];
      state.sessionMcpServers = [...mcpServers];
    }
  });
},
```

> Session-scoped like `setContextWindow` and `addUsage` — background `system:init` events cannot overwrite the viewed session's metadata.

**6c.** Initialize:

```typescript
sessionModel: null,
sessionTools: [],
sessionMcpServers: [],
```

**6d.** Implement — set on system:init, clear on resetUsage/reset.

**6e.** Concrete `CachedSessionData` and `switchSession()` changes:

```typescript
// CachedSessionData — add metadata fields:
interface CachedSessionData {
  usage: UsageData;
  processedIds: string[];
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
  contextWindow?: number;
  sessionModel?: string; // NEW
  sessionTools?: string[]; // NEW
  sessionMcpServers?: Array<{ name: string; status: string }>; // NEW
}

// switchSession() — CACHE when leaving (~line 682):
state.sessionCache[state.currentSessionId] = {
  ...existingCacheFields,
  sessionModel: state.sessionModel ?? undefined,
  sessionTools: state.sessionTools.length > 0 ? [...state.sessionTools] : undefined,
  sessionMcpServers: state.sessionMcpServers.length > 0 ? [...state.sessionMcpServers] : undefined,
};

// switchSession() — RESTORE from cache (~line 738):
if (cached) {
  state.sessionModel = cached.sessionModel ?? null;
  state.sessionTools = cached.sessionTools ?? [];
  state.sessionMcpServers = cached.sessionMcpServers ?? [];
  // ...existing restore...
}

// switchSession() — RESET in no-cache branches (~line 748):
state.sessionModel = null;
state.sessionTools = [];
state.sessionMcpServers = [];

// resetUsage() and reset():
state.sessionModel = null;
state.sessionTools = [];
state.sessionMcpServers = [];
```

**File:** Frontend handler for `system:init`

**6f.** When receiving system:init, call `setSessionMetadata()`.

### 7. Frontend: Context detail dialog

**New file:** `apps/agent/src/components/chat/input/context-detail-dialog.tsx`

A dialog component showing full context information:

```
┌──────────────────────────────────────────┐
│  Context Window                    [X]   │
│  claude-opus-4-6 · 1M context           │
├──────────────────────────────────────────┤
│                                          │
│  ████████░░░░░░░░░░░░░░░░░░░░░  24.6%   │
│  246k / 1M tokens                        │
│                                          │
├──────────────────────────────────────────┤
│  Token Breakdown                         │
│                                          │
│  Input              29 tokens            │
│  Cache Read         243k tokens          │
│  Cache Creation     3.1k tokens          │
│  Output             4.5k tokens          │
│  ─────────────────────────────           │
│  Context Used       246k tokens  (24.6%) │
│  Free               754k tokens  (75.4%) │
│                                          │
├──────────────────────────────────────────┤
│  Session Info                            │
│                                          │
│  Model       claude-opus-4-6             │
│  Tools       42 available                │
│  MCP Servers 5 connected                 │
│  Cost        $1.23                       │
│                                          │
└──────────────────────────────────────────┘
```

**Implementation:**

- Use existing `Dialog` component from `apps/agent/src/components/ui/dialog.tsx`
- Use `DialogContentGlass` variant (matches existing `element-context-detail-dialog.tsx` pattern)
- Progress bar reuses the existing gradient styles from `context.tsx` (green/warning/error)
- Extract `formatTokens()` from `context.tsx` into a shared utility (currently module-private)
- Render lazily — only mount dialog subtree when opened

**Historical/restored session handling:**

- Token breakdown: shows restored per-turn values from `.usage.json` `lastTurnUsage` (step 1g). Falls back to "No usage data" if the session has never had a turn.
- Model: show `sessionModel` if available, otherwise show the selected model from `state.model` with "(default)" suffix
- Tools / MCP Servers: show "—" when metadata is unavailable (no `system:init` received). Do NOT show "0 available" — that implies an empty session, not missing data.
- Add a subtle label: "Live" when data is from `system:init`, "Restored" when from disk cache.
- Long tool/MCP server lists: scrollable container with `max-h-40 overflow-y-auto`

**File:** `apps/agent/src/components/chat/input/context.tsx`

**7a.** Add "More" button inside `ContextContent` (the hover card popup), below the existing breakdown:

```typescript
<button onClick={() => setDetailOpen(true)} className="...">
  More details
</button>
```

**7b.** Render `ContextDetailDialog` alongside the hover card, controlled by state.

### 8. Export hooks for metadata

**File:** `apps/agent/src/stores/agent/tool-store.ts`

```typescript
export const useSessionModel = (): string | null => useToolStore((s) => s.sessionModel);
export const useSessionTools = (): string[] => useToolStore((s) => s.sessionTools);
export const useSessionMcpServers = () => useToolStore((s) => s.sessionMcpServers);
```

### 9. Tests

**File:** `apps/agent/src/__tests__/unit/stores/agent/tool-store.test.ts`

- Test `addUsage` with turn_usage values shows correct per-turn context percentage
- Test session metadata set/cache/restore/clear lifecycle
- Test `getContextUsedTokens` with per-turn values (not cumulative)

**File:** `agent-bridge/src/__tests__/context-window.test.ts`

- Test `lastAssistantUsage` map populated from assistant messages
- Test `turnUsage` included in result event
- Test cleanup on session delete

## What Does NOT Change

- Codex's session scoping, context window resolution, replace semantics — all correct, keep as-is
- `getContextUsedTokens()` formula (input + cacheRead + cacheCreation) — correct
- `resolveContextWindowFromInit` / `resolveContextWindowFromModelUsage` — correct
- `MODEL_CONTEXT_WINDOWS` defaults — correct
- Cost tracking via `totalCostUsd` — stays from cumulative result
- Hover card basic view (pie + percentage) — stays, just adds "More" button

## Verification

1. `cargo check` — Rust compiles
2. `bun run typecheck` — TypeScript types align
3. `bun run test` — Tests pass
4. `bunx tauri dev` — Start app, have a multi-turn conversation:
   - Context meter shows ~24% (not 100%) for a 246k/1M session
   - Matches Claude Code's `/context` output
   - Click "More" → dialog opens with breakdown + session info
   - Switch sessions → metadata and usage cached/restored correctly
5. `./scripts/lint-all.sh` — Full lint pass
