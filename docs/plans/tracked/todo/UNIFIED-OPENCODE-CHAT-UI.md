# Unified Chat UI for OpenCode Backend

> **Status:** Approved with changes (audits: 2026-03-10, 2026-03-11 x3)
> **Audit:** `reviews/audit-plan.md`

## Context

Codex implemented a dual-backend system (Claude agent-bridge + OpenCode HTTP/SSE) but created 10 entirely separate components for OpenCode's chat UI in `components/chat/opencode/`. This parallel UI is bare-bones (basic textarea, no auto-scroll damping, no tool widgets, raw role labels) and looks visually inconsistent with the polished Claude chat UI. The user wants the **same chat UI** for both backends, adding only OpenCode-specific features (provider/model picker, question cards).

**Goal:** Delete the separate OpenCode chat UI and reuse the existing `ChatContent`, `ChatMessages`, `ChatInput`, and `MessageItem` pipeline for both backends via an adapter hook.

---

## Architecture: Adapter-at-the-Hook Pattern

The existing Claude UI is driven by `ChatMessage[]` + `ToolStore` (keyed by messageId). OpenCode uses `OcRenderedMessage[]` with ordered `OcPart[]` (12 part types). The adapter converts OpenCode data into these same structures so the entire rendering pipeline works unchanged.

```
┌─ BackendChatSurface ────────────────────────────────────────┐
│                                                              │
│  activeBackend === 'claude'  →  ClaudeAgentSurface           │
│    └─ useChatMessages() → ChatContent                        │
│                                                              │
│  activeBackend === 'opencode' → OcAgentSurface (NEW)         │
│    └─ useOcChatAdapter() → ChatContent  (SAME component)     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Pre-Implementation: Type Contract Changes

Before building the adapter, these shared interfaces must be extended to support both backends. These are **prerequisites** — the adapter will not type-check without them.

### P1: OpenCode Controls Stay Outside `InputControls` (Decision: Settled)

**Why:** `ChatContentProps` uses Claude-specific `Model`, `ThinkingMode`, `InputMode` types. OpenCode uses `{ providerID, modelID }` pairs and agent modes (`build`/`plan`/`explore`). These are fundamentally different control models.

**Decision:** OpenCode model/provider/agent controls are **owned by `OcAgentSurface`**, passed into the shared layout via a new `extraControls` slot on `ChatContentProps`. This slot is rendered inside the bottom input region that `ChatContent` owns (the `absolute bottom-0` container at `ChatContent.tsx:118`), directly above `ChatInput`. The shared `ChatContent` receives Claude-only control props as no-ops.

**Rationale:** `ChatContent` owns the bottom input region internally (both in empty-state and normal layout). Rendering `OcControlBar` as a sibling _after_ `ChatContent` would place it below the entire chat surface — wrong. The `extraControls` slot gives `OcAgentSurface` a stable insertion point _inside_ the input region without modifying `ChatInputProps` or `InputControlsProps`.

**Minimal `ChatContentProps` addition:**

```typescript
// In types.ts — one new optional field
export interface ChatContentProps {
  // ... existing fields unchanged
  /** Optional controls rendered above ChatInput (used by OpenCode for provider/model/agent) */
  readonly extraControls?: React.ReactNode;
}
```

**In `ChatContent.tsx` — render the slot:**

```tsx
{
  /* Floating input container — transparent with soft fade at top */
}
<div className="absolute bottom-0 inset-x-0 z-20 pb-2 chat-input-frost">
  <TodoBar />
  {extraControls} {/* ← NEW: OpenCode controls render here */}
  <ChatInput {...inputProps} />
</div>;
```

For the empty-state layout, `extraControls` renders in the same position:

```tsx
<div
  className="flex-1 flex flex-col justify-center"
  style={{ paddingBottom: EMPTY_STATE_PADDING_BOTTOM }}
>
  {extraControls}
  <ChatInput {...inputProps} />
</div>
```

**In `OcAgentSurface`:**

```tsx
<ChatContent
  {...adaptedProps}
  inputMode="default"
  thinkingMode="off" // Valid ThinkingMode — NOT "disabled"
  effortLevel="medium"
  onThinkingModeChange={noop}
  onEffortLevelChange={noop}
  onModelChange={noop}
  extraControls={
    <OcControlBar
      providerId={selectedProviderId}
      modelId={selectedModelId}
      agent={selectedAgent}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onAgentChange={setSelectedAgent}
    />
  }
/>
```

`ClaudeAgentSurface` simply doesn't pass `extraControls` — the slot renders nothing.

**`InputControls` behavior:** Read `BackendCapabilities` from store. When backend is `opencode`, hide **all** Claude-only controls: thinking mode, effort level, model selector, **and mode picker** (hide unconditionally, not just when `planMode && acceptMode` are false — the settled design says OpenCode controls are not owned by `InputControls`). Also hide the context meter button when `maxTokens` is 0.

### P2: Extend `PermissionRequest` Interface

**Why:** SDK `PermissionRequest` has `patterns: string[]`, `always: string[]`, and optional `tool?: { messageID, callID }`. The current `PermissionRequest` interface loses this context. The existing `OcPermissionCard` shows patterns and offers three-choice UI.

**Modify:** `apps/agent/src/stores/agent/tool-store.ts`

```typescript
export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  createdAt: number;
  // OpenCode-specific (optional — Claude permissions don't use these)
  patterns?: string[];
  supportsAlwaysAllow?: boolean;
}
```

### P3: Fix `ThinkingBlock` Mapping Shape

**Why:** The actual `ThinkingBlock` interface (`messages/types.ts:8-13`) is `{ content, durationMs, contentOffset?, ordinal? }`. The original plan mapped reasoning parts to `{ id, text, isStreaming }` — wrong field names. The `buildUnifiedSegments()` interleaving algorithm relies on `contentOffset` and `ordinal` to order thinking blocks relative to text and tools.

**Correct mapping:** See Step 1's `adaptParts()` function below.

---

## Implementation Steps

### Step 1: Create `useOcChatAdapter` Hook

**New file:** `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`

Wraps `useOcChat()` and transforms output into `ChatContentProps`-compatible data.

#### Single-Pass Part Adapter

All part types are processed in a single pass that maintains positional ordering via cumulative `contentOffset` and `ordinal` tracking:

```typescript
function adaptParts(
  parts: OcPart[],
  messageId: string,
  sessionId: string
): { content: string; thinkingBlocks: ThinkingBlock[]; tools: ToolExecution[] } {
  let content = '';
  let ordinal = 0;
  const thinkingBlocks: ThinkingBlock[] = [];
  const tools: ToolExecution[] = [];

  for (const part of parts) {
    const offset = content.length;

    switch (part.type) {
      case 'text':
        content += part.text;
        break;

      case 'reasoning':
        thinkingBlocks.push({
          content: part.text, // NOT 'text' — field is 'content'
          durationMs: part.time.end ? part.time.end - part.time.start : 0,
          contentOffset: offset, // Required for interleaving
          ordinal, // Required for interleaving
        });
        break;

      case 'tool':
        tools.push({
          id: part.id,
          messageId,
          sessionId, // REQUIRED — ToolStore is session-aware
          toolName: part.tool.toLowerCase(),
          toolInput: part.state.input ?? {},
          toolOutput:
            part.state.status === 'completed'
              ? part.state.output
              : part.state.status === 'error'
                ? part.state.error
                : undefined,
          status:
            part.state.status === 'completed'
              ? 'success'
              : part.state.status === 'error'
                ? 'error'
                : 'running',
          success: part.state.status === 'completed',
          startedAt: 'time' in part.state && part.state.time ? part.state.time.start : Date.now(),
          completedAt:
            part.state.status === 'completed' || part.state.status === 'error'
              ? part.state.time?.end
              : undefined,
          contentOffset: offset,
          ordinal,
        });
        break;

      case 'step-start':
        // No text — visual marker only
        break;
      case 'step-finish':
        content += `\n\n---\n*Step finished (${part.reason}, ${String(part.tokens.input + part.tokens.output)} tokens)*\n`;
        break;
      case 'compaction':
        content += '\n\n---\n*Context compacted*\n';
        break;
      case 'retry':
        // Handled at message level via interruptReason + isInterrupted
        break;
      case 'file':
        content += `\nReferenced: ${part.filename}\n`;
        break;
      case 'patch':
        content += `\nPatch: ${part.files.join(', ')}\n`;
        break;
      case 'agent':
        content += `\nAgent: ${part.name}\n`;
        break;
      case 'snapshot':
        tools.push({
          id: `snapshot-${ordinal}`,
          messageId,
          sessionId,
          toolName: 'snapshot',
          toolInput: {},
          status: 'success',
          success: true,
          startedAt: Date.now(),
          contentOffset: offset,
          ordinal,
        });
        break;
      case 'subtask':
        // SubtaskPart SDK fields: id, sessionID, messageID, prompt, description,
        // agent, model?: { providerID, modelID }, command?
        // NOTE: SubtaskPart has NO `state` field — no lifecycle status from SDK.
        // Map to 'task' toolName so TaskToolWidget renders it.
        // TaskToolWidget expects: description, prompt, subagent_type, model? via toolInput.
        // Use synthetic 'success' status — SDK delivers subtask parts after completion.
        tools.push({
          id: part.id,
          messageId,
          sessionId,
          toolName: 'task',
          toolInput: {
            description: part.description,
            prompt: part.prompt,
            subagent_type: part.agent,
            ...(part.model ? { model: `${part.model.providerID}/${part.model.modelID}` } : {}),
          },
          status: 'success',
          success: true,
          startedAt: Date.now(),
          contentOffset: offset,
          ordinal,
        });
        break;
      default:
        break;
    }

    ordinal += 1;
  }

  return { content, thinkingBlocks, tools };
}
```

#### Message Mapping (`OcRenderedMessage` → `ChatMessage`)

- `content` / `displayedContent`: from `adaptParts().content`
- `thinkingBlocks`: from `adaptParts().thinkingBlocks` — uses correct `ThinkingBlock` shape
- `isStreaming`: `true` on last assistant message when `status.type === 'busy' || 'retry'`
- `isThinkingActive`: `true` if any reasoning part has `time.end === undefined`
- `interruptReason`: from `retry` parts (`"Retry #N"`) or `message.error.data.message`
- `isInterrupted`: `true` when `message.error` is present

#### Error Mapping

Map `AssistantMessage.error` → visual interrupt indicators:

```typescript
if (message.error) {
  chatMessage.interruptReason = message.error.data?.message ?? 'Error';
  chatMessage.isInterrupted = true;
}
```

Error types to handle: `ProviderAuthError`, `ContextOverflowError`, `ApiError`, `MessageAbortedError`.

#### Tool Sync with Diffing (Critical — Performance)

During streaming, `OcMessageStore` fires on every text delta. Without diffing, tool sync re-processes ALL tools on every render — O(messages × parts) per keystroke.

```typescript
const syncedRef = useRef(new Map<string, ToolStatus>());

useEffect(() => {
  const { startTool, completeTool } = useToolStore.getState();
  const currentIds = new Set<string>();

  for (const { tools } of adaptedMessages) {
    for (const tool of tools) {
      currentIds.add(tool.id);
      const prevStatus = syncedRef.current.get(tool.id);

      if (prevStatus === undefined) {
        // New tool — register it
        startTool(
          tool.id,
          tool.messageId,
          tool.toolName,
          tool.toolInput,
          tool.contentOffset,
          tool.sessionId,
          tool.ordinal
        );
        // If already completed (fast-completing tool), immediately complete
        if (tool.status === 'success' || tool.status === 'error') {
          completeTool(tool.id, tool.toolOutput, tool.status === 'success');
        }
      } else if (
        prevStatus === 'running' &&
        (tool.status === 'success' || tool.status === 'error')
      ) {
        // Status transition: running → completed/error
        completeTool(tool.id, tool.toolOutput, tool.status === 'success');
      }

      syncedRef.current.set(tool.id, tool.status);
    }
  }

  // Cleanup stale entries (tools that disappeared from store)
  for (const [id] of syncedRef.current) {
    if (!currentIds.has(id)) {
      syncedRef.current.delete(id);
    }
  }
}, [adaptedMessages]);

// On OC session change: switch ToolStore session + reset diff state
const prevSessionRef = useRef<string | null>(null);
useEffect(() => {
  if (sessionId && sessionId !== prevSessionRef.current) {
    useToolStore.getState().switchSession(sessionId);
    syncedRef.current.clear(); // Reset diff state for new session
    prevSessionRef.current = sessionId;
  }
}, [sessionId]);

// On unmount: reset local diff state only — do NOT call clearSessionTools()
// clearSessionTools() is deletion-oriented (for deleted sessions). Normal surface
// unmount should preserve session cache so tools survive backend switching.
// switchSession() handles session transitions; the diff ref is adapter-local state.
useEffect(() => {
  return () => {
    syncedRef.current.clear();
  };
}, []);
```

#### ToolStore Session Ownership (Critical)

ToolStore is session-aware with `switchSession()`, per-session caching, and `clearSessionTools()`. The adapter MUST respect this:

1. Call `switchSession(ocSessionId)` when the active OpenCode session changes — this caches/restores tools per session
2. Tag all injected tools with `sessionId: ocSessionId`
3. On surface unmount, **do NOT call `clearSessionTools()`** — that API is deletion-oriented (for permanently deleted sessions). Normal unmount should preserve session cache so tools survive backend switching. Only reset the adapter's local `syncedRef` diff state
4. `clearSessionTools()` should only be called when an OpenCode session is actually _deleted_ (not just switched away from)
5. For `TodoBar`, filter by `sessionId` matching the active backend's session — `TodoBar` currently reads the global latest `TodoWrite` without backend filtering, so switching from OpenCode to Claude would show stale OC todos. Add a `sessionId` check in `TodoBar`'s store selector
6. On backend switch, dismiss any open permission modal — add an effect in the permission modal that closes when `activeBackend` changes

#### Usage Data (from SDK)

Accumulate real token counts from assistant messages:

```typescript
const sessionUsage = useMemo(() => {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tokens) {
      inputTokens += msg.tokens.input ?? 0;
      outputTokens += msg.tokens.output ?? 0;
    }
  }
  return { inputTokens, outputTokens };
}, [messages]);
```

**Context meter (`maxTokens`):** The current `OcProviderInfo` only exposes `{ id, name, env, models }` where each model has `{ id, name }` — no context window metadata. The shared context widget divides by `maxTokens`, so a placeholder `0` yields misleading percentages. **MVP decision: hide the context meter for OpenCode sessions.** Pass `maxTokens={0}` and guard the context widget:

```typescript
// In context.tsx — guard against missing metadata
const shouldShowContext = typeof maxTokens === 'number' && maxTokens > 0;
```

Post-MVP: extend OpenCode provider loading to include context window sizes, then populate `maxTokens` from provider data.

#### Handler Mapping

| ChatContentProps handler                                      | Adapter implementation                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `onSend(text, files, images, elements, skills)`               | `ocSessionService.sendMessage(sessionId, text, { providerId, modelId, agent })` — ignore files/images/elements/skills for now |
| `onStop()`                                                    | `ocSessionService.abortSession(sessionId)`                                                                                    |
| `onRewind(id)`                                                | no-op (rewind not supported)                                                                                                  |
| `onPermissionApprove(reqId, always)`                          | `ocSessionService.replyPermission(reqId, always ? 'always' : 'once')`                                                         |
| `onPermissionDeny(reqId)`                                     | `ocSessionService.replyPermission(reqId, 'reject')`                                                                           |
| `onModeChange`, `onThinkingModeChange`, `onEffortLevelChange` | no-op (Claude-only controls — hidden for OpenCode)                                                                            |
| `onModelChange(model)`                                        | no-op — OpenCode model/provider selection is handled by `OcControlBar` via `extraControls`, not through `ChatContent` props   |
| `onOpenFile(path)`                                            | Reuse `handleOpenFile` from `chat-actions.ts` (NOT raw Tauri invoke)                                                          |
| `onOpenUrl(url)`                                              | Reuse `handleOpenUrl` from `chat-actions.ts` (NOT raw Tauri invoke)                                                           |
| `onCancelQueue`                                               | no-op                                                                                                                         |
| `onFeedback`                                                  | focus input                                                                                                                   |

#### Permission Mapping (`OcPermissionAsked` → `PermissionRequest`)

```typescript
PermissionRequest {
  requestId: permission.id,
  sessionId: permission.sessionID,
  toolName: permission.permission ?? 'tool',
  toolInput: permission.metadata ?? {},
  createdAt: Date.now(),
  patterns: permission.patterns,           // NEW — preserved for display
  supportsAlwaysAllow: true,               // NEW — enables 3-choice UI
}
```

**Key files to reference:**

- `apps/agent/src/hooks/chat/use-oc-chat.ts` — wraps this
- `apps/agent/src/stores/agent/tool-store.ts` — ToolExecution type, startTool/completeTool
- `apps/agent/src/components/layout/chat-area/types.ts` — ChatContentProps interface
- `apps/agent/src/components/chat/messages/types.ts` — ChatMessage, ThinkingBlock interfaces
- `apps/agent/src/types/backend/adapter.ts` — BackendCapabilities, getCapabilities()
- `apps/agent/src/hooks/chat/handlers/chat-actions.ts` — handleOpenFile, handleOpenUrl

### Step 2: Create `OcAgentSurface` Component

**New file:** `apps/agent/src/components/chat/OcAgentSurface.tsx`

Mirrors `ClaudeAgentSurface` structurally but uses `useOcChatAdapter()`:

```tsx
const OcAgentSurface: FC = () => {
  const {
    messages,
    isAgentRunning,
    sessionId,
    pendingPermissions,
    sessionUsage,
    questions,
    handleSend,
    handleStop,
    handleQuestionReply,
    handleQuestionReject,
    ...handlers
  } = useOcChatAdapter();
  const contentRef = useRef<HTMLDivElement>(null);

  // Read transition states from UIStore (same as ClaudeAgentSurface)
  const isLoadingConversation = useUIStore((s) => s.isLoadingConversation);
  const isConversationTransitioning = useUIStore((s) => s.isConversationTransitioning);

  // OpenCode-specific controls (owned by this surface, NOT by InputControls)
  // Source of truth: oc-provider-store — NOT local state (survives remounts and backend switches)
  const selectedProviderId = useOcProviderStore((s) => s.selectedProviderId);
  const selectedModelId = useOcProviderStore((s) => s.selectedModelId);
  const selectedAgent = useOcProviderStore((s) => s.selectedAgent);
  const setSelectedAgent = useOcProviderStore((s) => s.setSelectedAgent);

  // Guard: sessionId is nullable — early return with empty state
  if (sessionId === null) {
    return <EmptyState />;
  }

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
      style={{ contain: 'layout style paint' }}
    >
      <ChatContent
        contentRef={contentRef}
        isTransitioning={isConversationTransitioning}
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={null}
        pendingPermissions={pendingPermissions}
        questions={questions}
        onQuestionReply={handleQuestionReply}
        onQuestionReject={handleQuestionReject}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        sessionUsage={sessionUsage} // Real token counts from SDK
        maxTokens={0} // Hidden — no context window metadata yet
        onSend={handleSend}
        onStop={handleStop}
        onThinkingModeChange={noop}
        onEffortLevelChange={noop}
        onModelChange={noop}
        extraControls={
          <OcControlBar
            providerId={selectedProviderId}
            modelId={selectedModelId}
            agent={selectedAgent}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
            onAgentChange={setSelectedAgent}
          />
        }
        // ... all other handlers from adapter
      />
    </div>
  );
};
```

**Key differences from ClaudeAgentSurface:**

- No `useQueuedMessageHandler` (OpenCode doesn't queue)
- Uses `useLayoutStabilization()` or simplified version (matches Claude UX on session switches)
- Reads `isLoadingConversation` / `isConversationTransitioning` from UIStore (driven by `oc-ui-bridge.ts`)
- Null `sessionId` guard (Claude always has a session; OpenCode may not)
- OpenCode controls passed via `extraControls` slot — rendered inside `ChatContent`'s bottom input region, above `ChatInput`. Works in both empty-state and normal layouts
- `maxTokens={0}` hides context meter (no provider metadata available yet)
- Question answer type is `OcQuestionAnswer[]` (SDK-aligned), not `Record<string, string>`

**Key file to reference:** `apps/agent/src/components/chat/BackendChatSurface.tsx` lines 32-133 (ClaudeAgentSurface pattern)

### Step 3: Wire Into `BackendChatSurface`

**Modify:** `apps/agent/src/components/chat/BackendChatSurface.tsx`

Replace `OcChatController` with `OcAgentSurface`:

```tsx
if (activeBackend === 'opencode') {
  return <OcAgentSurface />; // was: <OcChatController surface={surface} />
}
```

Remove `OcChatController` import.

### Step 4: Hide Claude-Only Controls When Backend Is OpenCode

**Modify:** `apps/agent/src/components/chat/input/InputControls.tsx`

Read `BackendCapabilities` from store (via `useActiveBackend()` + `getCapabilities()`) and conditionally hide Claude-only controls:

1. **Model selector**: Hide when `capabilities.modelSelector !== 'claude-models'`
2. **Thinking/Effort buttons**: Hide when `capabilities.thinkingMode === false` / `capabilities.effortLevel === false`
3. **Mode picker**: Hide **unconditionally** when backend is `opencode` — not just when `planMode && acceptMode` are false. The settled design says all OpenCode controls live in `OcControlBar`, not `InputControls`
4. **Context meter button**: Hide when `maxTokens` is 0 (not just calculate-and-hide — don't render the button at all)

**Keyboard behavior changes** (hiding controls is not enough — shared keyboard handlers must also be gated):

5. **`Shift+Tab` mode cycling** (`use-chat-input.ts:500-507`): Gate by backend. The handler currently intercepts `Shift+Tab` unconditionally and cycles `default → plan → accept`. When backend is `opencode`, the mode picker is hidden and `onModeChange` is a no-op, so this becomes an invisible shortcut that blocks normal reverse-tab navigation. Fix:

```typescript
// In use-chat-input.ts handleKeyDown — guard by backend
if (
  e.key === 'Tab' &&
  e.shiftKey &&
  !e.metaKey && !e.ctrlKey && !e.altKey &&
  activeBackend === 'claude'  // ← NEW: skip in OpenCode mode
) {
  e.preventDefault();
  const nextMode: InputMode = /* ... */;
  onModeChange(nextMode);
  return;
}
```

Pass `activeBackend` into `useChatInput` (or read via `useActiveBackend()` inside the hook).

6. **`inputMode` fixed for OpenCode**: OpenCode does not support shared input-mode switching in MVP. `inputMode` is always `'default'`. Any future OpenCode plan/build toggles live in `OcControlBar`, not the shared mode cycle.

**Key files to modify (in addition to above):**

- `apps/agent/src/components/chat/input/use-chat-input.ts` — gate `Shift+Tab` by backend

**No new controls added to `InputControls`.** OpenCode model/provider/agent selection is handled by `OcControlBar` passed via `ChatContent.extraControls`. This keeps `InputControlsProps` unchanged.

**New file:** `apps/agent/src/components/chat/oc-control-bar/OcControlBar.tsx`

Rendered inside `ChatContent`'s bottom input region via the `extraControls` slot. Contains:

- `OcModelSelector` (relocated from `components/chat/opencode/OcModelSelector.tsx`)
- `OcAgentModePicker` (new — simple 3-button toggle for `build`/`plan`/`explore`)

Reads from `oc-provider-store` directly. Does not touch `InputControls` props.

**Key files to modify:**

- `apps/agent/src/components/chat/input/InputControls.tsx` — add capability guards to hide controls
- `apps/agent/src/components/layout/chat-area/types.ts` — add `extraControls?: React.ReactNode`
- `apps/agent/src/components/layout/chat-area/ChatContent.tsx` — render `extraControls` above `ChatInput` in both layouts
- `apps/agent/src/components/chat/oc-control-bar/OcControlBar.tsx` — new, OpenCode-specific
- `apps/agent/src/components/chat/opencode/OcModelSelector.tsx` → relocate to `components/chat/oc-control-bar/OcModelSelector.tsx`

### Step 5: Extend `PermissionModal` for OpenCode 3-Choice

**Modify:** the existing permission modal component

Add "Always Allow" button when `request.supportsAlwaysAllow` is true:

- Existing: "Allow" → `onApprove(requestId)`
- Existing: "Deny" → `onDeny(requestId)`
- New: "Always Allow" → `onApprove(requestId, true)` — shown when `supportsAlwaysAllow`

Display `patterns` when present:

```tsx
{
  request.patterns && request.patterns.length > 0 ? (
    <div className="text-xs text-muted-foreground">{request.patterns.join(', ')}</div>
  ) : null;
}

{
  request.supportsAlwaysAllow ? (
    <button onClick={() => onApprove(request.requestId, true)}>
      Always <span className="text-background/60 ml-1">⌘⏎</span>
    </button>
  ) : null;
}
```

**Add keyboard shortcut** in `ChatInput.tsx`:

```typescript
// Cmd+Enter for "always allow"
if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
  const first = regularPermissions[0];
  if (first?.supportsAlwaysAllow) {
    e.preventDefault();
    e.stopPropagation();
    onPermissionApprove(first.requestId, true);
  }
}
```

### Step 6: Handle OpenCode Questions in ChatInput

**Move:** `components/chat/opencode/OcQuestionCard.tsx` → `components/chat/input/OcQuestionCard.tsx`

Render question cards inside `ChatInput` when OpenCode questions are pending.

**Prop threading path** (full file list):

1. **`ChatContentProps`** (`components/layout/chat-area/types.ts`) — add optional fields:
   - `questions?: OcQuestionRequest[]`
   - `onQuestionReply?: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>`
   - `onQuestionReject?: (requestId: string) => Promise<void>`

   **Important:** The answer type MUST be `OcQuestionAnswer[]` (which is `string[][]`), NOT `Record<string, string>`. This matches the existing `OcQuestionCard` component (`OcQuestionCard.tsx:12`), `ocSessionService.replyQuestion()` (`oc-session-service.ts:173`), and the SDK `question.reply()` contract end-to-end. No conversion layer needed.

2. **`ChatContent`** (`components/layout/chat-area/ChatContent.tsx`) — pass through to `ChatInput`:

   ```tsx
   <ChatInput
     {...existingProps}
     questions={questions}
     onQuestionReply={onQuestionReply}
     onQuestionReject={onQuestionReject}
   />
   ```

3. **`ChatInputProps`** (`components/chat/input/types.ts`) — add matching optional fields

4. **`ChatInput`** (`components/chat/input/ChatInput.tsx`) — render `OcQuestionCard` in a **separate slot below permissions**, NOT inside `AskUserQuestionModal`:
   ```tsx
   {/* Existing permission cards */}
   {regularPermissions.map(p => <PermissionCard ... />)}
   {/* OpenCode questions — separate from AskUserQuestion overlay */}
   {questions?.map(q => <OcQuestionCard key={q.id} ... />)}
   ```

**Important:** OpenCode questions are NOT `AskUserQuestion` tool calls. They need their own rendering path that does NOT conflict with the `AskUserQuestionModal` overlay logic. The overlay replaces all input content; questions should appear alongside permissions, not inside the modal system.

**Keyboard conflict with permission shortcuts:** `ChatInput.tsx:113-150` installs a capture-phase `keydown` handler that approves/denies the first permission on plain `Enter`/`Escape`, regardless of focus. When OpenCode question cards (which contain `<Input>` elements for custom answers) are rendered below permissions, pressing `Enter` inside a question input would also trigger permission approval. Fix:

```typescript
// In ChatInput.tsx capture-phase permission handler — skip when question input has focus
const handleKeyDown = (e: KeyboardEvent): void => {
  // Don't hijack Enter/Escape when user is typing in a question input
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('[data-oc-question]') !== null) {
    return;
  }
  // ... existing permission shortcut logic
};
```

Add `data-oc-question` attribute to `OcQuestionCard`'s root element so the guard can detect focus inside question inputs.

**Key files to modify (for this step):**

- `apps/agent/src/components/layout/chat-area/types.ts` — add question props
- `apps/agent/src/components/layout/chat-area/ChatContent.tsx` — thread to ChatInput
- `apps/agent/src/components/chat/input/types.ts` — add question props
- `apps/agent/src/components/chat/input/ChatInput.tsx` — render questions + guard permission shortcuts
- `apps/agent/src/components/chat/opencode/OcQuestionCard.tsx` → relocate + add `data-oc-question` attr

### Step 7: Add Generic Tool Fallback in `ToolWidgetRenderer`

**Modify:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Replace `return null` in the `default` case with a generic collapsible widget:

**New file:** `apps/agent/src/components/chat/tools/generic-tool-widget.tsx`

- Collapsible card showing tool name, JSON input, output/error
- Inspired by `OcToolWidget`'s design but matching existing tool widget styling

**Note on `multiedit`:** Map to `'edit'` in the widget table, but `EditToolWidget` expects `file_path`, `old_string`, `new_string` fields. If `multiedit` uses a different schema (array of edits), it should fall through to `GenericToolWidget` instead of rendering an empty `EditToolWidget`. Add a schema check in the tool name mapping.

### Step 8: Handle OpenCode-Specific Part Types

Non-text, non-reasoning, non-tool parts are handled in the `adaptParts()` single-pass function (Step 1). Summary:

| Part Type     | Adapter Strategy                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`        | Append to content as text: `"Referenced: {filename}"`                                                                                                                                                          |
| `step-start`  | No text appended (visual marker only)                                                                                                                                                                          |
| `step-finish` | Append as text: `"Step finished (reason, N tokens)"`                                                                                                                                                           |
| `snapshot`    | Create synthetic tool entry with `toolName: 'snapshot'`                                                                                                                                                        |
| `patch`       | Append as text: `"Patch: {files.join(', ')}"`                                                                                                                                                                  |
| `agent`       | Append as text: `"Agent: {name}"`                                                                                                                                                                              |
| `subtask`     | Synthetic tool with `toolName: 'task'`, `toolInput: { description, prompt, subagent_type: agent, model? }`. Synthetic `status: 'success'` (SDK has no lifecycle state for subtasks). Maps to `TaskToolWidget`. |
| `retry`       | Set `interruptReason: "Retry #{attempt}"` + `isInterrupted: true` on ChatMessage                                                                                                                               |
| `compaction`  | Append as text: `"Context compacted"`                                                                                                                                                                          |

These are processed at their natural position (maintaining part order via cumulative `contentOffset` and `ordinal`).

### Step 9: Delete Codex's Separate OpenCode UI

**Delete:**

- `apps/agent/src/components/chat/opencode/OcChatController.tsx`
- `apps/agent/src/components/chat/opencode/OcChatContent.tsx`
- `apps/agent/src/components/chat/opencode/OcChatInput.tsx`
- `apps/agent/src/components/chat/opencode/OcMessageItem.tsx`
- `apps/agent/src/components/chat/opencode/OcMessageList.tsx`
- `apps/agent/src/components/chat/opencode/OcStatusIndicator.tsx`
- `apps/agent/src/components/chat/opencode/OcToolWidget.tsx`
- `apps/agent/src/components/chat/opencode/index.ts`

**Relocate (keep):**

- `OcModelSelector.tsx` → `components/chat/oc-control-bar/OcModelSelector.tsx`
- `OcQuestionCard.tsx` → `components/chat/input/OcQuestionCard.tsx`
- `OcPermissionCard.tsx` → delete (merged into existing PermissionModal)

**Keep unchanged:**

- All OpenCode stores (`stores/opencode/`) — adapter reads from these
- All OpenCode services (`services/opencode/`) — adapter calls these
- All OpenCode types (`types/opencode/`) — used by adapter
- `hooks/chat/use-oc-chat.ts` — wrapped by adapter
- `hooks/opencode/use-opencode-lifecycle.ts` — manages server lifecycle
- `services/opencode/oc-event-coordinator.ts` — pushes SSE events to stores
- `services/conversations/oc-ui-bridge.ts` — sidebar conversation management
- `types/backend/adapter.ts` — BackendCapabilities (already correct)

### Step 10: Add Test Coverage

**New file:** `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`

(Follows the repo's feature-oriented test organization under `__tests__/unit/`.)

Test cases:

1. **Part ordering**: Mixed text/reasoning/tool parts produce correct `contentOffset` and `ordinal` values
2. **Tool sync diffing**: `syncedRef` only emits `startTool`/`completeTool` for new tools and status transitions, not on every render
3. **Fast-completing tools**: Tool transitioning directly from `pending` to `completed` calls both `startTool()` and `completeTool()` in one pass
4. **Permission mapping**: `patterns` and `supportsAlwaysAllow` are preserved
5. **Question prop threading**: Questions thread from `ChatContentProps` → `ChatContent` → `ChatInput` → `OcQuestionCard`
6. **Capability-driven controls**: Claude controls hidden when backend is OpenCode; `OcControlBar` renders
7. **Error mapping**: `AssistantMessage.error` → `interruptReason` + `isInterrupted`
8. **Session lifecycle**: Unmount resets adapter diff state only — does NOT call `clearSessionTools()`; `switchSession()` preserves cache across backend switches
9. **OC session switch while streaming**: `syncedRef` clears on session change, new session's tools sync fresh
10. **`OcControlBar` layout placement**: Renders inside the bottom input region (above `ChatInput`) in both empty-state and normal message layouts
11. **`SubtaskPart` adaptation**: Maps to `task` tool with `description`, `prompt`, `subagent_type`, optional `model` in `toolInput`. Does NOT reference `part.state`. Uses synthetic `success` status
12. **`Shift+Tab` suppression**: In OpenCode mode, `Shift+Tab` does NOT cycle input mode — allows normal reverse-tab navigation
13. **Question/permission keyboard coexistence**: `Enter`/`Escape` inside an `OcQuestionCard` input does NOT approve/deny a permission card — capture-phase handler skips when `[data-oc-question]` has focus

---

## Critical Data Flow

```
OpenCode SSE events
  → oc-event-coordinator.ts → OcMessageStore, OcPermissionStore, OcSessionStore
  → useOcChat() reads from stores (existing hook, unchanged)
  → useOcChatAdapter() transforms:
      OcRenderedMessage[] → ChatMessage[] (single-pass adaptParts)
      OcToolPart[] → ToolStore entries (via diffing useEffect)
      OcPermissionAsked[] → PermissionRequest[] (with patterns + supportsAlwaysAllow)
      AssistantMessage.error → interruptReason + isInterrupted
      AssistantMessage.tokens → sessionUsage { inputTokens, outputTokens }
      handlers → ChatContentProps handlers (reusing chat-actions.ts)
  → OcAgentSurface passes adapted data to ChatContent
  → ChatContent renders ChatMessages + ChatInput (existing, unchanged)
  → MessageItem renders messages (existing, unchanged)
  → ToolWidgetRenderer renders tools (existing + generic fallback)
```

---

## OpenCode Tool Name → Existing Widget Mapping

| OpenCode `part.tool`     | Maps to `toolName` | Existing Widget                  | Notes                                     |
| ------------------------ | ------------------ | -------------------------------- | ----------------------------------------- |
| `bash`                   | `bash`             | BashToolWidget                   |                                           |
| `read`                   | `read`             | ReadToolWidget                   |                                           |
| `write`                  | `write`            | WriteToolWidget                  |                                           |
| `edit`                   | `edit`             | EditToolWidget                   |                                           |
| `multiedit`              | `edit` or fallback | EditToolWidget or GenericTool    | Schema check: if array-of-edits → generic |
| `glob`                   | `glob`             | GlobToolWidget                   |                                           |
| `grep`                   | `grep`             | GrepToolWidget                   |                                           |
| `websearch`              | `websearch`        | WebSearchToolWidget              |                                           |
| `webfetch`               | `webfetch`         | WebFetchToolWidget               |                                           |
| `task`                   | `task`             | TaskToolWidget                   |                                           |
| `todowrite` / `todoread` | `todowrite`        | (null — rendered in TodoBar)     | Filter TodoBar by sessionId               |
| `skill`                  | `skill`            | SkillToolWidget                  |                                           |
| `ls`                     | —                  | GenericToolWidget (new fallback) |                                           |
| `apply_patch`            | —                  | GenericToolWidget                |                                           |
| `codesearch`             | —                  | GenericToolWidget                |                                           |
| `lsp`                    | —                  | GenericToolWidget                |                                           |
| Others                   | —                  | GenericToolWidget                |                                           |

---

## Edge Cases

These must be handled during implementation:

| Edge Case                                                     | Handling                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionId` is `null`                                         | `useOcChat()` returns `string \| null`. `OcAgentSurface` must guard with early return / empty state before passing to `ChatContent` (which requires `string`).                                                                                                                                                                                                                                                                                  |
| Fast-completing tool (pending → completed between renders)    | Diffing effect must call BOTH `startTool()` and `completeTool()` in the same pass when `prevStatus === undefined && tool.status !== 'running'`.                                                                                                                                                                                                                                                                                                 |
| Backend switch mid-session                                    | `switchSession()` caches OC tools on unmount; when user returns to OC, they are restored. Do NOT call `clearSessionTools()` — that is deletion-only. ToolStore rendering should be filtered by active backend's session.                                                                                                                                                                                                                        |
| Simultaneous question + permission                            | OpenCode questions render in a separate slot from `AskUserQuestionModal`. They must NOT conflict — use a dedicated question area below permissions.                                                                                                                                                                                                                                                                                             |
| `multiedit` schema mismatch                                   | `EditToolWidget` expects `file_path`, `old_string`, `new_string`. If `multiedit` input is an array-of-edits, fall through to `GenericToolWidget`.                                                                                                                                                                                                                                                                                               |
| `OcPermissionAsked.tool` is undefined                         | Some permissions are workspace-level, not tool-specific. Map `toolName: permission.permission ?? 'workspace'` with empty `toolInput`.                                                                                                                                                                                                                                                                                                           |
| `retry`/`snapshot`/`subtask` before any `text` part           | `contentOffset` is 0 — valid but may coexist with another part at offset 0. `ordinal` disambiguates ordering in `buildUnifiedSegments()`.                                                                                                                                                                                                                                                                                                       |
| `loadProviders()` refreshes invalidate selections             | After provider refresh, validate that `selectedProviderId`/`selectedModelId` still exist in the new provider list. Reset to defaults if not.                                                                                                                                                                                                                                                                                                    |
| Switching OC sessions while tools are still streaming         | `switchSession(newOcSessionId)` caches tools for the old session; the diffing effect re-evaluates against the new session's tool set. Old session's streaming tools stop being synced because they belong to a different `adaptedMessages` source. The `syncedRef` must be cleared on session change (not just unmount) to avoid stale diff state.                                                                                              |
| Stale OC todos/permissions after switching to Claude          | `TodoBar` reads the latest `TodoWrite` globally — filter by `sessionId` matching active backend's session. For permissions, `pendingPermissions` is derived from the adapter — when `OcAgentSurface` unmounts, permissions naturally disappear from the render tree. But if a permission modal is already _open_ (stateful), it must dismiss on backend switch. Add an effect in the permission modal that closes when `activeBackend` changes. |
| Surface unmount for non-destructive reasons                   | If `OcAgentSurface` unmounts temporarily (e.g., tab switch, panel collapse), adapter resets local `syncedRef` only. ToolStore session cache is preserved by `switchSession()`. When the surface remounts, `switchSession()` restores tools and the diff ref rebuilds from scratch.                                                                                                                                                              |
| `Shift+Tab` in OpenCode input                                 | Without the backend gate, `Shift+Tab` cycles invisible input modes instead of performing normal reverse-tab navigation. Gate by `activeBackend === 'claude'` in `use-chat-input.ts`.                                                                                                                                                                                                                                                            |
| `Enter`/`Escape` in question input while permission is active | Capture-phase permission handler fires before React `onKeyDown`, hijacking `Enter` from question text inputs. Guard with `document.activeElement.closest('[data-oc-question]')` check.                                                                                                                                                                                                                                                          |
| OpenCode questions + permissions both visible                 | Keyboard input should target the focused control. Permission shortcuts only fire when no question input has focus. Question inputs handle their own `Enter` via React `onKeyDown`.                                                                                                                                                                                                                                                              |

---

## Post-Implementation Acceptance Checklist

These are the criteria for verifying the implementation is complete and correct:

**Build gates:**

- [ ] `bun run typecheck` — no errors
- [ ] `bun run lint` — no warnings
- [ ] `bun test` — adapter tests pass (see Step 10)

**Functional checks:**

- [ ] Switch between Claude and OpenCode in settings — both show the same chat UI
- [ ] Send a message with OpenCode — renders in the same blue user bubble
- [ ] Tool rendering — OpenCode tool parts render via existing tool widgets (bash, read, write, etc.)
- [ ] Streaming — assistant response streams with "Thinking" shimmer and progressive content
- [ ] Provider picker — `OcControlBar` renders inside `ChatContent`'s bottom input region (above `ChatInput`) showing provider/model/agent selector when backend is OpenCode
- [ ] `OcControlBar` placement — renders correctly in both empty-state and normal message layouts
- [ ] Claude controls (thinking mode, effort level, model selector, **mode picker**, context meter) ALL hidden when backend is OpenCode
- [ ] Permissions — OpenCode permission requests show in existing PermissionModal with "Always Allow" option + patterns display
- [ ] Questions — OpenCode question cards render in the input area (separate from AskUserQuestionModal)
- [ ] Rewind button — hidden/disabled when backend is OpenCode
- [ ] Token usage — real input/output token counts shown for OpenCode sessions
- [ ] Context meter — hidden for OpenCode sessions (no `maxTokens` metadata yet)
- [ ] Error display — provider errors, context overflow, aborted messages show interrupt indicator
- [ ] Session switching — skeleton/transition animation matches Claude UX
- [ ] Keyboard shortcuts — Enter approves, Escape denies, Cmd+Enter always-allows (OpenCode permissions)

**Regression checks:**

- [ ] Existing ToolStore tests pass unchanged
- [ ] Existing `build-unified-segments` tests pass unchanged
- [ ] Existing `input-mode` tests pass unchanged
- [ ] Existing `model-selector` tests pass unchanged
- [ ] Existing `oc-message-store` tests pass unchanged

---

## Key Existing Utilities to Reuse

| Utility                            | Location                               | Purpose                                                |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `getCapabilities(backend)`         | `types/backend/adapter.ts`             | Feature flags per backend                              |
| `useActiveBackend()`               | `stores/backend/backend-store.ts`      | Current backend selector                               |
| `ToolExecution` interface          | `stores/agent/tool-store.ts:227`       | Tool data shape                                        |
| `startTool()` / `completeTool()`   | `stores/agent/tool-store.ts`           | ToolStore mutation methods                             |
| `switchSession()`                  | `stores/agent/tool-store.ts`           | Session-aware tool caching                             |
| `clearSessionTools()`              | `stores/agent/tool-store.ts`           | Deletion-only session cleanup (NOT for normal unmount) |
| `ChatContentProps`                 | `components/layout/chat-area/types.ts` | ChatContent interface                                  |
| `ChatMessage`                      | `components/chat/messages/types.ts:22` | Message data shape                                     |
| `ThinkingBlock`                    | `components/chat/messages/types.ts:8`  | Thinking block shape                                   |
| `PermissionRequest`                | `stores/agent/tool-store.ts:246`       | Permission data shape                                  |
| `deduplicateAndSortTools()`        | `stores/agent/tool-store.ts`           | Tool dedup helper                                      |
| `handleOpenFile` / `handleOpenUrl` | `hooks/chat/handlers/chat-actions.ts`  | File/URL open with panel UX                            |
| `CHAT_WIDTH` / `CHAT_WIDTH_VAR`    | `lib/utils/constants.ts`               | Layout constants                                       |
| `OPENCODE_CAPABILITIES`            | `types/backend/adapter.ts:33`          | OpenCode feature flags                                 |
| `useLayoutStabilization()`         | Used by ClaudeAgentSurface             | Skeleton transition animation                          |

---

## Future Enhancements (Post-MVP)

These are not blocking but would improve the unified UI:

1. **Discriminated `ChatControls` union**: Replace the no-op pattern with a typed `SharedChatControls` union that separates Claude vs OpenCode control state. Move `OcControlBar` into the shared `InputControls` behind the discriminated type. This is the right long-term answer once the two control sets have shared concepts (e.g., plan mode exists in both)
2. **Context window metadata**: Extend OpenCode provider loading to include context window sizes per model. Populate `maxTokens` from this data and show the context meter for OpenCode sessions
3. **Formal `ChatRuntimeAdapter` interface**: Explicit contract (`messages`, `tools`, `permissions`, `questions`, `controls`, `actions`) that both Claude and OpenCode implement — prevents `ChatContentProps` from growing unboundedly
4. **Agent mode badge**: Map `AssistantMessage.mode` (build/plan/explore) to a badge on assistant message bubbles
5. **Clickable patch files**: Map `PatchPart.files` to clickable file links using `onOpenFile`
6. **Transcript fixtures**: Representative OpenCode sessions with mixed part types for visual regression testing
7. **Generic tool fallback widget**: Add `GenericToolWidget` after the adapter lands and tool mapping is validated — avoids masking mapping bugs behind a generic renderer during initial development
