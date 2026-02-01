# Plan: Read Sessions from `~/.claude/projects/` (SDK Native Storage)

## Summary

Replace Orbit's duplicate `ConversationManager` JSON store with direct reads from `~/.claude/projects/{workspace}/*.jsonl` — the same storage that Claude Code CLI uses. This makes all Claude Code sessions visible in Orbit's sidebar and eliminates data duplication.

---

## Why This Works

Orbit already uses the Claude Agent SDK, which writes JSONL session files to `~/.claude/projects/`. Both Orbit-created sessions AND Claude Code CLI sessions live there. The current `ConversationManager` at `~/Library/Application Support/orbit/projects/` is a redundant copy. By reading from the SDK's native storage:

1. Claude Code CLI sessions appear automatically in Orbit
2. Deleting Orbit's app data doesn't lose session history
3. No more dual-write overhead
4. Session IDs = JSONL filenames = SDK session IDs (simplifies resume)

---

## Phase 1: JSONL Reader Module (Rust)

**New file: `crates/common/conversations/src/jsonl.rs`**

### Types

```rust
/// Lightweight session summary for sidebar (extracted from first ~20 lines)
pub struct SdkSessionSummary {
    pub session_id: String,        // UUID from filename
    pub title: String,             // First user message content (truncated to 80 chars)
    pub created_at: u64,           // First entry timestamp (ms)
    pub updated_at: u64,           // File mtime (ms) — avoids parsing last line
    pub message_count: usize,      // Count of user + assistant lines
    pub model: Option<String>,     // From first assistant message
}

/// Parsed message for full session loading
pub struct SdkMessage {
    pub id: String,                // uuid field from JSONL line
    pub role: MessageRole,         // User | Assistant
    pub content: String,           // Text content
    pub thinking: Option<String>,  // Thinking block content
    pub timestamp: u64,            // ms
    pub tool_uses: Vec<ToolUse>,   // From assistant content blocks
    pub usage: Option<TokenUsage>, // From assistant message.usage
}
```

### Key Functions

```rust
/// Resolve ~/.claude/projects/ directory
fn claude_projects_dir() -> Option<PathBuf>

/// Encode workspace path: /Users/foo/bar → -Users-foo-bar
fn encode_workspace_path(path: &str) -> String

/// Extract metadata from JSONL by reading first ~30 lines
/// Only parses enough to get: title, created_at, message_count estimate, model
fn extract_session_metadata(jsonl_path: &Path) -> Result<SdkSessionSummary>

/// List all sessions for a workspace (reads *.jsonl, extracts metadata)
/// Uses .orbit-cache.json for sessions whose mtime+size haven't changed
fn list_sdk_sessions(workspace_path: &str) -> Result<Vec<SdkSessionSummary>>

/// Parse full JSONL session into displayable messages
/// Skips: isMeta lines, file-history-snapshot, isSidechain
fn parse_full_session(jsonl_path: &Path) -> Result<Vec<SdkMessage>>
```

### Metadata Cache

Store at `~/.claude/projects/{workspace}/.orbit-cache.json`:

```json
{
  "version": 1,
  "sessions": {
    "uuid-1": {
      "title": "Fix the login bug",
      "createdAt": 1706000000000,
      "updatedAt": 1706001000000,
      "messageCount": 12,
      "model": "claude-sonnet-4-20250514",
      "fileMtime": 1706001000,
      "fileSize": 45230
    }
  }
}
```

Cache invalidation: compare file mtime + size. If either changed, re-parse first 30 lines.

**Modify: `crates/common/conversations/src/lib.rs`**

- Add `pub mod jsonl;`
- Keep existing `Conversation`, `Message`, `ToolUse`, `TokenUsage` types (they map to display format)
- Keep `ConversationSummary` but source it from `SdkSessionSummary`

---

## Phase 2: Update ConversationManager

**File: `crates/common/conversations/src/lib.rs`**

### Remove (SDK handles persistence)

- `create()` — SDK creates JSONL on session start
- `save()` / `save_to_workspace()` — SDK appends to JSONL
- `add_message()` — SDK appends to JSONL
- Atomic write logic (temp files, rename)

### Modify to read from `~/.claude/projects/`

- `load_summaries_for_workspace()` → delegates to `jsonl::list_sdk_sessions()`
- `load()` / `load_from_workspace()` → delegates to `jsonl::parse_full_session()`
- Keep `base_dir` for backward compat but add `claude_projects_dir` as primary source

### Keep (Orbit-specific features)

- `delete()` — deletes JSONL file from `~/.claude/projects/`
- `update_title()` — writes to `.orbit-cache.json` (title is Orbit-specific enrichment)
- `fork()` — for rewind support (creates forked conversation data)
- In-memory `RwLock<Vec<ConversationSummary>>` cache

### New field on ConversationSummary

```rust
pub source: Option<String>,  // "orbit" | "claude-code" — informational only
```

---

## Phase 3: Update Tauri Commands

**File: `src-tauri/src/commands/agent/conversations.rs`**

| Command                     | Change                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `conversation_list`         | Now returns JSONL-sourced summaries from `~/.claude/projects/`      |
| `conversation_load`         | Now parses JSONL file, returns messages in existing DTO format      |
| `conversation_delete`       | Now deletes from `~/.claude/projects/`                              |
| `conversation_update_title` | Writes to `.orbit-cache.json` only                                  |
| `conversation_create`       | **Remove** — sessions are created by SDK when first message is sent |
| `conversation_add_message`  | **Remove** — SDK handles persistence                                |
| `conversation_fork`         | Keep for rewind (may need adaptation)                               |
| `conversation_data_path`    | Return `~/.claude/projects/{workspace}/` instead                    |

**DTO changes: `ConversationSummaryDto`**

- Add optional `source: Option<String>` field

**DTO changes: `MessageDto`**

- Map JSONL content blocks (text, thinking, tool_use, tool_result) to existing fields

---

## Phase 4: Simplify Session Storage (agent-bridge)

**File: `agent-bridge/src/agent/session/session-storage.ts`**

The `orbit-sessions.json` mapping file becomes unnecessary because session IDs ARE SDK session IDs (the JSONL filename UUID).

**Changes:**

- Remove `saveSession()` — no mapping needed
- Remove `getSDKSessionIdForSession()` — sessionId = sdkSessionId
- Remove `touchSession()`, `cleanupOldSessions()`
- Keep `invalidateCache()` for testing

**File: `agent-bridge/src/agent/session/session-manager.ts`**

In `_startBackgroundConsumer()`, the `session_init` event currently stores the SDK session ID via `saveSession()`. Change this:

- Remove the `saveSession()` call
- The `session_init` event still fires to frontend (for real-time tracking)
- `sdkSessionId` from the event IS the same as `sessionId` (which is now the JSONL filename UUID)

In `createSession()`:

- When creating a NEW session, generate UUID that becomes both Orbit's session ID and the SDK session ID
- When RESUMING (clicking an existing session), pass the JSONL filename UUID as `resumeSessionId`

---

## Phase 5: Update Frontend

### `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`

| Handler                         | Change                                                  |
| ------------------------------- | ------------------------------------------------------- |
| `handleConversationCreate`      | **Remove** — new sessions created on first message send |
| `handleConversationList`        | Unchanged (API contract same, data now from JSONL)      |
| `handleConversationLoad`        | Unchanged (API contract same, data now from JSONL)      |
| `handleConversationDelete`      | Unchanged                                               |
| `handleConversationUpdateTitle` | Unchanged                                               |
| `handleConversationRewind`      | Keep — rewind still uses fork + checkpoint              |

### `apps/agent/src/lib/api/conversations.ts`

- Remove `conversationCreate()` — no longer needed
- Remove `conversationAddMessage()` — SDK handles persistence
- Keep all other functions (list, load, delete, updateTitle, fork)

### `apps/agent/src/hooks/agent/use-tauri.ts` (or tauri-handlers)

When user sends first message in a new session:

1. Frontend generates a UUID for the session
2. Calls `agent_create_session` (agent-bridge) with that UUID
3. SDK creates `~/.claude/projects/{workspace}/{uuid}.jsonl`
4. Next `conversation_list` call picks it up

When user clicks an existing session to resume:

1. Frontend calls `conversation_load` to display history
2. On first new message, frontend calls `agent_create_session` with `resumeSessionId: uuid`
3. SDK resumes from that session ID

### `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`

**`handleStartConversation()`** — Simplify:

- Generate UUID
- Set it as active conversation
- Don't call `conversation:create` backend command
- The JSONL file gets created when user actually sends first message

### `apps/agent/src/stores/ui/ui-store.ts`

- Remove `loadConversationsFromStorage()` / `saveConversationsToStorage()` (localStorage fallback)
- `~/.claude/projects/` is the persistent source, localStorage cache unnecessary
- Keep `conversations` state array, but only populated from backend `conversation_list` calls

### `apps/agent/src/hooks/chat/handlers/message-handler.ts`

- `conversation:created` case — simplified or removed (no backend call needed)
- `conversation:list` case — unchanged
- `conversation:loaded` case — unchanged (same DTO shape)

---

## Phase 6: Session Resume Flow (New)

Currently when loading a session, Orbit just displays stored messages but doesn't actually resume the SDK session until the user sends a new message.

**New flow for resuming any session (Orbit or Claude Code CLI):**

```
1. User clicks session in sidebar
2. Frontend: conversation_load(sessionId) → parse JSONL → display messages
3. User types a message and hits send
4. Frontend: agent_create_session(sessionId, { resumeSessionId: sessionId })
   — sessionId IS the SDK session ID (JSONL filename)
5. agent-bridge: OrbitAgent.startSession() with resume option
6. SDK loads full context from JSONL, ready for continuation
7. Frontend: agent_send_message(sessionId, text)
8. SDK appends to existing JSONL file
```

**Key insight:** `resumeSessionId` and `sessionId` are now the SAME value. The agent-bridge session-manager already supports this via `config.resumeSessionId` (line 571 of session-manager.ts).

---

## Files Modified

| File                                                                            | Change Type  | Description                                        |
| ------------------------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| `crates/common/conversations/src/jsonl.rs`                                      | **NEW**      | JSONL parser, metadata extractor, cache            |
| `crates/common/conversations/src/lib.rs`                                        | **Major**    | Read from `~/.claude/projects/`, remove write path |
| `src-tauri/src/commands/agent/conversations.rs`                                 | **Major**    | Remove create/addMessage, adapt list/load to JSONL |
| `agent-bridge/src/agent/session/session-storage.ts`                             | **Major**    | Remove mapping layer (sessionId = sdkSessionId)    |
| `agent-bridge/src/agent/session/session-manager.ts`                             | **Moderate** | Remove saveSession calls, simplify init flow       |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`                  | **Moderate** | Remove create handler, simplify                    |
| `apps/agent/src/lib/api/conversations.ts`                                       | **Minor**    | Remove unused API functions                        |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | **Minor**    | Simplify new session flow                          |
| `apps/agent/src/stores/ui/ui-store.ts`                                          | **Minor**    | Remove localStorage fallback                       |
| `apps/agent/src/hooks/chat/handlers/message-handler.ts`                         | **Minor**    | Simplify conversation:created handling             |

---

## Verification

1. **Rust compilation**: `cargo check` — no errors
2. **TypeScript**: `bun run typecheck` — no errors
3. **Lint**: `./scripts/lint-all.sh` — passes
4. **Manual test — Session discovery**:
   - Open a folder that has Claude Code CLI sessions
   - Verify sessions appear in Orbit's sidebar
   - Verify titles/timestamps are reasonable
5. **Manual test — Session resume**:
   - Click a Claude Code CLI session
   - Verify conversation history displays correctly
   - Send a message — verify SDK resumes the session
   - Verify the response continues in context
6. **Manual test — New session**:
   - Click "New Session"
   - Send a message
   - Verify JSONL file created at `~/.claude/projects/{workspace}/`
   - Close and reopen — verify session persists in sidebar
7. **Manual test — Delete session**:
   - Delete a session from sidebar
   - Verify JSONL file removed from `~/.claude/projects/`
8. **Manual test — Rewind**:
   - Use rewind on a message
   - Verify fork + file restoration still works

---

## Risks & Mitigations

| Risk                                              | Mitigation                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Large JSONL files (MBs)                           | Metadata extraction reads only first ~30 lines. Full parse is lazy (on click). Use `BufReader` line-by-line. |
| Concurrent access (CLI writing while Orbit reads) | JSONL is append-only. `BufReader` handles partial last lines safely.                                         |
| Breaking rewind                                   | Fork logic preserved. Checkpoint IDs come from SDK's user message UUIDs.                                     |
| Title quality                                     | First user message truncated to 80 chars. Users can rename via `.orbit-cache.json`.                          |
| Migration from old store                          | One-time: import custom titles from old JSON files to `.orbit-cache.json`. Old files left as-is.             |
