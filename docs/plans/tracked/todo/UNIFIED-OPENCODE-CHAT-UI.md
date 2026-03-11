# Unified Chat UI for OpenCode Backend

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

## Implementation Steps

### Step 1: Create `useOcChatAdapter` Hook

**New file:** `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`

Wraps `useOcChat()` and transforms output into `ChatContentProps`-compatible data.

**Message mapping** (`OcRenderedMessage` → `ChatMessage`):

- `content` / `displayedContent`: concatenate all `text` parts with `\n\n` separator
- `thinking`: concatenate all `reasoning` parts' text
- `thinkingBlocks`: map reasoning parts → `{ id, text, isStreaming: part.time.end === undefined }`
- `isStreaming`: `true` on last assistant message when `status.type === 'busy' || 'retry'`
- `isThinkingActive`: `true` if any reasoning part has `time.end === undefined`

**Tool injection** (populate `ToolStore` from `OcToolPart`s):

- Use `useEffect` to sync tool parts → ToolStore entries as messages update
- Map `OcToolPart` fields → `ToolExecution`:
  - `id`: part.id
  - `messageId`: parent message id
  - `toolName`: part.tool (lowercase)
  - `toolInput`: part.state.input ?? {}
  - `toolOutput`: part.state.output ?? part.state.error
  - `status`: map `pending`/`running` → `'running'`, `completed` → `'success'`, `error` → `'error'`
  - `success`: `part.state.status === 'completed'`
  - `contentOffset`: cumulative character length of text parts preceding this tool part in the parts array
- Call `ToolStore.startTool()` / `ToolStore.completeTool()` via `getState()` (not hooks, since this runs in effect)
- On unmount / backend switch: clear OpenCode tools from ToolStore

**Handler mapping:**

| ChatContentProps handler                                      | Adapter implementation                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `onSend(text, files, images, elements, skills)`               | `ocSessionService.sendMessage(sessionId, text, { providerId, modelId, agent })` — ignore files/images/elements/skills for now |
| `onStop()`                                                    | `ocSessionService.abortSession(sessionId)`                                                                                    |
| `onRewind(id)`                                                | no-op (rewind not supported)                                                                                                  |
| `onPermissionApprove(reqId, always)`                          | `ocSessionService.replyPermission(reqId, always ? 'always' : 'once')`                                                         |
| `onPermissionDeny(reqId)`                                     | `ocSessionService.replyPermission(reqId, 'reject')`                                                                           |
| `onModeChange`, `onThinkingModeChange`, `onEffortLevelChange` | no-op                                                                                                                         |
| `onModelChange(model)`                                        | update OcProviderStore's selectedProviderId/selectedModelId                                                                   |
| `onOpenFile(path)`                                            | Tauri `open_file` invoke                                                                                                      |
| `onOpenUrl(url)`                                              | Tauri `open_external_url` invoke                                                                                              |
| `onCancelQueue`                                               | no-op                                                                                                                         |
| `onFeedback`                                                  | focus input                                                                                                                   |

**Permission mapping** (`OcPermissionAsked` → `PermissionRequest`):

```
PermissionRequest {
  requestId: permission.id,
  sessionId: permission.sessionID,
  toolName: permission.permission ?? 'tool',
  toolInput: permission.metadata ?? {},
  createdAt: Date.now(),
}
```

**Key files to reference:**

- `apps/agent/src/hooks/chat/use-oc-chat.ts` — wraps this
- `apps/agent/src/stores/agent/tool-store.ts` — ToolExecution type, startTool/completeTool
- `apps/agent/src/components/layout/chat-area/types.ts` — ChatContentProps interface
- `apps/agent/src/components/chat/messages/types.ts` — ChatMessage interface
- `apps/agent/src/types/backend/adapter.ts` — BackendCapabilities, getCapabilities()

### Step 2: Create `OcAgentSurface` Component

**New file:** `apps/agent/src/components/chat/OcAgentSurface.tsx`

Mirrors `ClaudeAgentSurface` structurally but uses `useOcChatAdapter()`:

```tsx
const OcAgentSurface: FC = () => {
  const { messages, isAgentRunning, sessionId, pendingPermissions, ... } = useOcChatAdapter();
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
         style={{ contain: 'layout style paint' }}>
      <ChatContent
        contentRef={contentRef}
        isTransitioning={false}
        isLoadingConversation={false}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={null}
        pendingPermissions={pendingPermissions}
        inputMode="default"
        thinkingMode="disabled"
        effortLevel="medium"
        sessionUsage={{ inputTokens: 0, outputTokens: 0 }}
        maxTokens={0}
        onSend={handleSend}
        onStop={handleStop}
        // ... all other handlers from adapter
      />
    </div>
  );
};
```

No `useQueuedMessageHandler` (OpenCode doesn't queue). No `useLayoutStabilization` initially.

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

### Step 4: Add Capabilities-Driven Controls to `ChatInput`

**Modify:** `apps/agent/src/components/chat/input/InputControls.tsx`

Read `BackendCapabilities` from store and conditionally render:

1. **Model selector**: When `capabilities.modelSelector === 'provider-models'`, render `OcModelSelector` instead of existing `ModelSelector`
2. **Thinking/Effort buttons**: Hide when `capabilities.thinkingMode === false` / `capabilities.effortLevel === false`
3. **Mode picker**: Hide when `capabilities.planMode === false && capabilities.acceptMode === false`
4. **Agent selector**: Show OpenCode agent mode picker (`build`/`plan`/`explore`) when backend is `opencode`

Add `BackendCapabilities` as a prop to `InputControls` (or read from store via `useActiveBackend()` + `getCapabilities()`).

**Move `OcModelSelector`:** `components/chat/opencode/OcModelSelector.tsx` → `components/chat/input/OcModelSelector.tsx`

**Key files to modify:**

- `apps/agent/src/components/chat/input/InputControls.tsx`
- `apps/agent/src/components/chat/input/types.ts` — extend InputControlsProps

### Step 5: Extend `PermissionModal` for OpenCode 3-Choice

**Modify:** the existing permission modal component

Add "Always Allow" button when backend is OpenCode. The existing `onPermissionApprove(requestId, always?)` signature already supports `always: true`. Just add a third button:

- Existing: "Allow" → `onApprove(requestId)`
- Existing: "Deny" → `onDeny(requestId)`
- New: "Always Allow" → `onApprove(requestId, true)` — shown when backend is `opencode`

### Step 6: Handle OpenCode Questions in ChatInput

**Move:** `components/chat/opencode/OcQuestionCard.tsx` → `components/chat/input/OcQuestionCard.tsx`

Render question cards inside `ChatInput` when OpenCode questions are pending. The adapter passes questions through a new optional prop on `ChatContentProps`:

- `questions?: OcQuestionRequest[]`
- `onQuestionReply?: (requestId, answers) => Promise<void>`
- `onQuestionReject?: (requestId) => Promise<void>`

Render `OcQuestionCard` in the same location as `AskUserQuestionModal` (replaces the input area).

### Step 7: Add Generic Tool Fallback in `ToolWidgetRenderer`

**Modify:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Replace `return null` in the `default` case with a generic collapsible widget:

**New file:** `apps/agent/src/components/chat/tools/generic-tool-widget.tsx`

- Collapsible card showing tool name, JSON input, output/error
- Inspired by `OcToolWidget`'s design but matching existing tool widget styling

### Step 8: Handle OpenCode-Specific Part Types

Non-text, non-reasoning, non-tool parts are handled by the adapter as follows:

| Part Type                    | Adapter Strategy                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `file`                       | Append to content as text: `"Referenced: {filename}"`                                 |
| `step-start` / `step-finish` | Append as text: `"Step started"` / `"Step finished (reason, N tokens)"`               |
| `snapshot`                   | Create synthetic tool entry with `toolName: 'snapshot'`                               |
| `patch`                      | Append as text: `"Patch: {files.join(', ')}"`                                         |
| `agent`                      | Append as text: `"Agent: {name}"`                                                     |
| `subtask`                    | Create synthetic tool entry with `toolName: 'task'` (maps to existing TaskToolWidget) |
| `retry`                      | Set `interruptReason: "Retry #{attempt}"` on the ChatMessage                          |
| `compaction`                 | Append as text: `"Context compacted"`                                                 |

These are appended at their natural position (maintaining part order via content offset calculation).

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

- `OcModelSelector.tsx` → `components/chat/input/OcModelSelector.tsx`
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

---

## Critical Data Flow

```
OpenCode SSE events
  → oc-event-coordinator.ts → OcMessageStore, OcPermissionStore, OcSessionStore
  → useOcChat() reads from stores (existing hook, unchanged)
  → useOcChatAdapter() transforms:
      OcRenderedMessage[] → ChatMessage[]
      OcToolPart[] → ToolStore entries (via useEffect)
      OcPermissionAsked[] → PermissionRequest[]
      handlers → ChatContentProps handlers
  → OcAgentSurface passes adapted data to ChatContent
  → ChatContent renders ChatMessages + ChatInput (existing, unchanged)
  → MessageItem renders messages (existing, unchanged)
  → ToolWidgetRenderer renders tools (existing + generic fallback)
```

---

## OpenCode Tool Name → Existing Widget Mapping

| OpenCode `part.tool`     | Maps to `toolName` | Existing Widget                  |
| ------------------------ | ------------------ | -------------------------------- |
| `bash`                   | `bash`             | BashToolWidget                   |
| `read`                   | `read`             | ReadToolWidget                   |
| `write`                  | `write`            | WriteToolWidget                  |
| `edit` / `multiedit`     | `edit`             | EditToolWidget                   |
| `glob`                   | `glob`             | GlobToolWidget                   |
| `grep`                   | `grep`             | GrepToolWidget                   |
| `websearch`              | `websearch`        | WebSearchToolWidget              |
| `webfetch`               | `webfetch`         | WebFetchToolWidget               |
| `task`                   | `task`             | TaskToolWidget                   |
| `todowrite` / `todoread` | `todowrite`        | (null — rendered in TodoBar)     |
| `skill`                  | `skill`            | SkillToolWidget                  |
| `ls`                     | —                  | GenericToolWidget (new fallback) |
| `apply_patch`            | —                  | GenericToolWidget                |
| `codesearch`             | —                  | GenericToolWidget                |
| `lsp`                    | —                  | GenericToolWidget                |
| Others                   | —                  | GenericToolWidget                |

---

## Verification

1. `bun run typecheck` — no errors
2. `bun run lint` — no warnings
3. Switch between Claude and OpenCode in settings — both show the same chat UI
4. Send a message with OpenCode — renders in the same blue user bubble
5. Tool rendering — OpenCode tool parts render via existing tool widgets (bash, read, write, etc.)
6. Streaming — assistant response streams with "Thinking" shimmer and progressive content
7. Provider picker — when backend is OpenCode, InputControls shows provider/model selector instead of Claude model selector
8. Permissions — OpenCode permission requests show in existing PermissionModal with "Always Allow" option
9. Questions — OpenCode question cards render in the input area
10. Rewind button — hidden/disabled when backend is OpenCode
11. Thinking/Effort controls — hidden when backend is OpenCode

---

## Key Existing Utilities to Reuse

| Utility                          | Location                               | Purpose                    |
| -------------------------------- | -------------------------------------- | -------------------------- |
| `getCapabilities(backend)`       | `types/backend/adapter.ts`             | Feature flags per backend  |
| `useActiveBackend()`             | `stores/backend/backend-store.ts`      | Current backend selector   |
| `ToolExecution` interface        | `stores/agent/tool-store.ts:227`       | Tool data shape            |
| `startTool()` / `completeTool()` | `stores/agent/tool-store.ts`           | ToolStore mutation methods |
| `ChatContentProps`               | `components/layout/chat-area/types.ts` | ChatContent interface      |
| `ChatMessage`                    | `components/chat/messages/types.ts:22` | Message data shape         |
| `PermissionRequest`              | `stores/agent/tool-store.ts:246`       | Permission data shape      |
| `deduplicateAndSortTools()`      | `stores/agent/tool-store.ts`           | Tool dedup helper          |
| `CHAT_WIDTH` / `CHAT_WIDTH_VAR`  | `lib/utils/constants.ts`               | Layout constants           |
| `OPENCODE_CAPABILITIES`          | `types/backend/adapter.ts:33`          | OpenCode feature flags     |
