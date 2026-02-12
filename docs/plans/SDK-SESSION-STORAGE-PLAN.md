# Plan: Read Sessions from `~/.claude/projects/` (SDK Native Storage)

## Summary

Replace Orbit's duplicate `ConversationManager` JSON store with direct reads from `~/.claude/projects/{workspace}/*.jsonl` — the same storage that Claude Code CLI uses. This makes all Claude Code sessions visible in Orbit's sidebar and eliminates data duplication.

---

## Why This Works

Orbit already uses the Claude Agent SDK, which writes JSONL session files to `~/.claude/projects/`. Both Orbit-created sessions AND Claude Code CLI sessions live there. The current `ConversationManager` at `~/Library/Application Support/orbit/projects/` is a redundant copy. By reading from the SDK's native storage:

1. Claude Code CLI sessions appear automatically in Orbit
2. Deleting Orbit's app data doesn't lose session history
3. No more dual-write overhead
4. Session resume uses SDK session IDs (JSONL filename UUIDs)

---

## Key Design Decisions

### Session ID Lifecycle

The SDK assigns session IDs — callers cannot pre-assign them. The session ID is returned in the `system:init` message after the first `query()` call. This means:

- **New sessions**: Frontend uses a temporary UUID until the SDK assigns the real one via `session_init` event
- **Resumed sessions**: The JSONL filename UUID is passed as `resumeSessionId` — the SDK reuses this ID
- **Forked sessions**: SDK's `forkSession: true` generates a new UUID — returned in a new `session_init`

### Orbit Enrichment Cache

Orbit-specific metadata (custom titles, worktree paths, fork relationships) is stored separately from SDK data in Orbit's own data directory, NOT inside `~/.claude/projects/`. This avoids polluting another tool's directory.

**Cache location**: `~/Library/Application Support/orbit/session-cache/{encoded-workspace}.json`

### Sidebar Grouping (worktree_path)

The existing sidebar groups conversations by `worktree_path`. JSONL files don't contain this concept — it's Orbit-specific. The enrichment cache stores `worktreePath` per session, written when Orbit creates a session and preserved across restarts.

### Fork & Rewind Strategy

The SDK provides **two separate mechanisms** that Orbit uses together:

- **File rewind**: `rewindFiles(checkpointId)` — SDK restores files on disk to a checkpoint UUID ✅ (fully documented, integration tested)
- **Session forking**: `forkSession: true` — SDK creates a new JSONL when the next message is sent, preserving the original ✅ (fully documented)

**Conversation positioning** (which messages Claude sees) is handled by **Orbit's context-prepend system**, NOT by the SDK. The SDK's `resumeSessionAt` option exists in the Options table but is **undocumented** (one line, zero examples, zero docs pages). The current codebase intentionally avoids it — see notes at `agent.ts:138-140` and `session-manager.ts:188-191`.

**The existing rewind flow is preserved with one change** — the data source switches from Orbit's JSON store to SDK JSONL files:

1. `rewindFiles(checkpointId)` → SDK restores files on disk
2. `conversationFork(old, new, messageId)` → **reads JSONL** (was: reads JSON), returns messages up to point (read-only, no write)
3. `setRewindContext(messages)` → stores truncated history in-memory
4. `markSessionAsForked(newId, sdkId)` → tracks fork for checkpointing
5. On next message send → `consumeRewindContext()` → `formatConversationContext()` → prepend to user message
6. Message goes to fresh SDK session → SDK creates new JSONL

### SDK Compatibility Notes (verified against SDK docs)

These behaviors are confirmed in the SDK documentation and existing `agent.ts` code:

1. **Session ID assignment**: SDK generates session IDs — returned in `system:init` message (`message.type === 'system' && message.subtype === 'init'` → `message.session_id`). Callers cannot pre-assign IDs. (SDK ref: `Options.resume`, Session Management doc)

2. **`resumeSessionAt` — NOT USED**: The SDK Options table lists `resumeSessionAt: string` but it has **zero documentation** beyond one line — no examples, no tutorial, not mentioned in Session Management or File Checkpointing docs. The current codebase's NOTE comments correctly warn against using it. **This plan does NOT use `resumeSessionAt`** — conversation positioning uses the proven context-prepend mechanism.

3. **`replay-user-messages` guard**: The existing `agent.ts:942-957` disables `replay-user-messages` for resumed/forked sessions. **No changes needed** — the current guard is correct for the context-prepend flow:
   - **New sessions** (no `_resumeSessionId`): Enable `replay-user-messages` — needed for checkpoint UUID tracking ✅
   - **Forked/rewind sessions**: Create FRESH SDK sessions (not resumed), so `_resumeSessionId` is unset → `replay-user-messages` ON → checkpoint UUIDs available for future rewinds ✅
   - **Plain resume** (continue existing session): `_resumeSessionId` set → `replay-user-messages` OFF → prevents replay bug ✅

   Current logic (unchanged):

   ```typescript
   // Only enable replay-user-messages for NEW sessions (not forked/resumed)
   if (!this._resumeSessionId) {
     options.extraArgs = { ...options.extraArgs, 'replay-user-messages': null };
   }
   ```

4. **`rewindFiles()` requires active query**: The SDK's `rewindFiles()` can only be called on an active `Query` object. After the stream completes, you must resume with an empty prompt first. The existing `agent.ts:rewindFiles()` already handles this correctly. Two patterns:
   - **During active stream**: Call `query.rewindFiles(uuid)` directly (`rewindFilesInLoop()` at `agent.ts:1484`)
   - **After stream completes**: Resume with empty prompt → call `rewindFiles()` inside for-await loop → break (`rewindFiles()` at `agent.ts:1522`)

5. **`enableFileCheckpointing` + env var**: Both `options.enableFileCheckpointing = true` AND `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` env var are required. Already set in `agent.ts:940` and `agent.ts:967`.

6. **File rewind ≠ conversation rewind**: The SDK's `rewindFiles()` restores **files on disk only** — it does not rewind the conversation. Conversation positioning is handled by Orbit's context-prepend system (`setRewindContext` → `consumeRewindContext` → `formatConversationContext`). These are two distinct operations used together for a full rewind.

### Context-Prepend — PRESERVED

The context-prepend rewind system is **kept as-is**. It is integration tested (`combined-rewind.test.ts`, `conversation-rewind.test.ts`) and works correctly. The only change is the data source for `conversationFork()`:

**Before:** `conversationFork()` reads `{session_id}.json` from Orbit's store → copies messages → writes new JSON file
**After:** `conversationFork()` reads `{session_id}.jsonl` from `~/.claude/projects/` → returns messages (read-only, no write)

Items **preserved** (no changes):

- `setRewindContext()` / `consumeRewindContext()` in `use-tauri-session.ts`
- `rewindContextMap` in `use-tauri-session.ts`
- Context prepend logic in `agent-sdk-handlers.ts:62-72`
- `formatConversationContext()` in `use-tauri-context.ts`
- `markSessionAsForked()` / `forkedSessionResumeMap` in `use-tauri-session.ts`
- NOTE comments in `agent.ts:138-140` and `session-manager.ts:188-191`
- `replay-user-messages` guard in `agent.ts:942-957` (unchanged)

### Platform Considerations

**Tauri filesystem ACL**: The `~/.claude/` directory must be accessible via Tauri's FS permissions. Currently:

- `capabilities/filesystem.json` allows `$HOME/**` for read/write
- `capabilities/filesystem.json` denies `$HOME/.config/**`

**Issues:**

- On **macOS/Windows**: `~/.claude/` is at `$HOME/.claude/` — allowed by `$HOME/**`, not blocked by any deny rule ✅
- On **Linux**: Claude may store data at `$HOME/.config/claude/` which is **blocked** by the `$HOME/.config/**` deny rule ❌

**Fix required**: Add an explicit allow for `~/.claude/` and `~/.config/claude/` in `capabilities/filesystem.json`:

```json
{
  "allow": [{ "path": "$HOME/.claude/**" }, { "path": "$HOME/.config/claude/**" }]
}
```

### Workspace Path Encoding Edge Case

The workspace path encoder (`/Users/foo/bar` → `-Users-foo-bar`) replaces `/` with `-`. This is **lossy for paths containing hyphens**:

- `/Users/foo/my-project` → `-Users-foo-my-project`
- `/Users/foo/my/project` → `-Users-foo-my-project` (collision!)

This is an existing issue in both Orbit's `ConversationManager` and the Claude CLI. Since we're reading from `~/.claude/projects/` which uses the same encoding, we inherit the same limitation. No action needed for this plan, but worth documenting.

**Mitigation**: When resolving encoded paths back to real paths, prefer checking if the directory actually exists on disk rather than attempting to decode the path string.

---

## Phase 1: JSONL Reader Module (Rust)

**New file: `crates/common/conversations/src/jsonl.rs`**

### Performance Requirement (MANDATORY)

The enrichment cache is **not optional** — it is a mandatory Phase 1 deliverable. Real workspaces have 1,300+ JSONL files. Without the cache, `list_sdk_sessions()` must parse the first ~30 lines of every file on each sidebar refresh, which is unacceptable.

**Implementation priority:**

1. Build enrichment cache read/write first
2. Build JSONL metadata extractor second
3. Wire `list_sdk_sessions()` to check cache before parsing

**Cache invalidation**: For each session, store `(fileMtime, fileSize)`. On `list_sdk_sessions()`:

- If JSONL file's mtime+size match cache → return cached metadata (O(1) stat call)
- If mismatch → re-parse first ~30 lines → update cache entry
- If JSONL file deleted → remove cache entry
- If new JSONL file (no cache entry) → parse and add to cache

**Concurrent access**: Use atomic write (write to temp file, `rename()`) for cache updates. Single Tauri command thread prevents concurrent writes.

### JSONL Line Filtering Rules

Not all JSONL lines are displayable messages. The parser must filter:

| Line Type               | `type` field                         | Action                                                                                  |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `file-history-snapshot` | `"file-history-snapshot"`            | **Skip** — file checkpoint data, not a message                                          |
| `isSidechain`           | any (has `isSidechain: true`)        | **Skip** — internal SDK branching data                                                  |
| `isMeta`                | any (has `isMeta: true`)             | **Skip** — metadata entries                                                             |
| `user`                  | `"user"`                             | **Parse** — content is a `string`                                                       |
| `assistant`             | `"assistant"`                        | **Parse** — content is `Array<ContentBlock>`                                            |
| Duplicate assistant IDs | `"assistant"` with same `message.id` | **Deduplicate** — keep last occurrence (streaming appends multiple entries per message) |

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
/// Merges JSONL metadata with enrichment cache (titles, worktree_path)
fn list_sdk_sessions(workspace_path: &str) -> Result<Vec<SdkSessionSummary>>

/// Parse full JSONL session into displayable messages
/// Skips: isMeta lines, file-history-snapshot, isSidechain
fn parse_full_session(jsonl_path: &Path) -> Result<Vec<SdkMessage>>
```

### Enrichment Cache

**Location**: `~/Library/Application Support/orbit/session-cache/{encoded-workspace}.json`

This is Orbit's own data directory — NOT inside `~/.claude/projects/` (avoids polluting another tool's storage).

```json
{
  "version": 1,
  "sessions": {
    "uuid-1": {
      "customTitle": "Fix the login bug",
      "worktreePath": "/Users/dev/my-project",
      "forkedFrom": null,
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

Cache invalidation: compare JSONL file mtime + size. If either changed, re-parse first 30 lines for metadata. Custom fields (`customTitle`, `worktreePath`, `forkedFrom`) are never invalidated — they're Orbit-owned.

**Modify: `crates/common/conversations/src/lib.rs`**

- Add `pub mod jsonl;`
- Keep existing `Conversation`, `Message`, `ToolUse`, `TokenUsage` types (they map to display format)
- Keep `ConversationSummary` but source it from `SdkSessionSummary` + enrichment cache

---

## Phase 2: Update ConversationManager

**File: `crates/common/conversations/src/lib.rs`**

### Remove (SDK handles persistence)

- `save()` / `save_to_workspace()` — SDK appends to JSONL
- `add_message()` — SDK appends to JSONL
- Atomic write logic (temp files, rename)

### Modify `fork()` to read-only JSONL

- `fork()` — **Changed from write to read-only**: reads `{session_id}.jsonl` from `~/.claude/projects/`, extracts messages up to `up_to_message_id`, returns `Vec<Message>` **without writing a new file**. The SDK creates the new JSONL when the user sends the first message to a fresh session. This function is needed by the rewind flow to provide messages for `setRewindContext()`.

### Modify to read from `~/.claude/projects/`

- `load_summaries_for_workspace()` → delegates to `jsonl::list_sdk_sessions()`, merges with enrichment cache
- `load()` / `load_from_workspace()` → delegates to `jsonl::parse_full_session()`
- Keep `base_dir` pointing to enrichment cache dir

### Keep (lightweight, cache-only)

- `create()` — **Simplified**: writes a placeholder entry to enrichment cache only (stores `worktreePath`, sets `customTitle` to null). No JSONL file created — SDK does that on first message.
- `delete()` — deletes JSONL file from `~/.claude/projects/` AND removes enrichment cache entry
- `update_title()` — writes `customTitle` to enrichment cache
- In-memory `RwLock<Vec<ConversationSummary>>` cache

### Remove `conversation_cleanup_orphaned()`

No longer meaningful — sessions are SDK-owned. Orphan detection doesn't apply when the source of truth is `~/.claude/projects/`.

### Updated ConversationSummary Fields

```rust
pub struct ConversationSummary {
    pub id: String,
    pub title: String,               // customTitle from cache, or first user message from JSONL
    pub created_at: u64,
    pub updated_at: u64,
    pub message_count: usize,
    pub model: Option<String>,
    pub worktree_path: Option<String>,  // From enrichment cache (Orbit-specific)
    pub forked_from: Option<String>,    // From enrichment cache (Orbit-specific)
    pub source: Option<String>,         // "orbit" | "claude-code" — sessions with cache entry = orbit
}
```

**Source detection heuristic**: If a session ID exists in the enrichment cache, `source = "orbit"`. Otherwise, `source = "claude-code"` (discovered from JSONL files not created by Orbit).

---

## Phase 3: Update Tauri Commands

**File: `src-tauri/src/commands/agent/conversations.rs`**

| Command                         | Change                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `conversation_list`             | Returns JSONL-sourced summaries merged with enrichment cache                                                                         |
| `conversation_load`             | Parses JSONL file, returns messages in existing DTO format                                                                           |
| `conversation_delete`           | Deletes JSONL from `~/.claude/projects/` + enrichment cache entry                                                                    |
| `conversation_update_title`     | Writes `customTitle` to enrichment cache                                                                                             |
| `conversation_create`           | **Simplified** — writes placeholder to enrichment cache only (no JSONL)                                                              |
| `conversation_add_message`      | **Remove** — SDK handles persistence (remove 6 frontend call sites only AFTER JSONL parser verified)                                 |
| `conversation_fork`             | **Modified** — read-only: parses JSONL up to message ID, returns messages (no write). Needed by rewind flow for `setRewindContext()` |
| `conversation_data_path`        | Return `~/.claude/projects/{workspace}/`                                                                                             |
| `conversation_cleanup_orphaned` | **Remove** — replaced by enrichment cache cleanup (remove entries without matching JSONL files)                                      |

**DTO changes: `ConversationSummaryDto`**

- Add `worktree_path: Option<String>` (already exists, now sourced from cache)
- Add `forked_from: Option<String>`
- Add `source: Option<String>`

**DTO changes: `MessageDto`**

- Map JSONL content blocks (text, thinking, tool_use, tool_result) to existing fields

---

## Phase 4: Simplify Session Storage (agent-bridge)

**File: `agent-bridge/src/agent/session/session-storage.ts`**

The `orbit-sessions.json` mapping file becomes unnecessary because session IDs are SDK-assigned and stored as JSONL filenames.

**Changes:**

- Remove `saveSession()` — no mapping needed
- Remove `getSDKSessionIdForSession()` — the SDK session ID IS the canonical ID
- Remove `touchSession()`, `cleanupOldSessions()`
- Keep `invalidateCache()` for testing

**File: `agent-bridge/src/agent/session/session-manager.ts`**

### Session Init Handling

In `_startBackgroundConsumer()`, the `session_init` event currently stores the SDK session ID via `saveSession()`. Change this:

- Remove the `saveSession()` call
- The `session_init` event still fires to frontend (carries the SDK-assigned session ID)
- **NEW**: Frontend uses this event to swap its temporary ID for the real SDK session ID

### New Session Flow

In `createSession()` for NEW sessions:

1. Frontend sends `create_session` with a **temporary UUID** and `worktreePath`
2. agent-bridge creates `OrbitAgent`, calls `startSession()` → SDK's `query()` runs
3. SDK assigns a real session ID, returned in `session_init` event
4. Frontend receives `session_init`, swaps temporary UUID → real SDK session ID
5. Frontend updates enrichment cache via `conversation_create` (stores `worktreePath` keyed by real ID)

### Resume Session Flow

In `createSession()` for RESUMED sessions:

1. Frontend sends `create_session` with `resumeSessionId: <JSONL-filename-UUID>`
2. agent-bridge creates `OrbitAgent` with `resume` option
3. SDK resumes from existing JSONL — session ID stays the same
4. `session_init` fires with the same ID (no swap needed)

### Fork/Rewind Session Flow (Context-Prepend — Preserved)

The rewind flow uses Orbit's context-prepend system, NOT `resumeSessionAt`. The only change is that `conversationFork()` now reads from JSONL instead of JSON:

1. Frontend calls `handleConversationRewind()` with `message_id` + `user_message_id`
2. `getRewindCheckpoints()` → get turnEnd checkpoint UUID from `CheckpointStore`
3. `agentRewindFiles(checkpointId)` → SDK restores files on disk
4. `conversationFork(old, new, messageId)` → **reads JSONL** (was: reads JSON), returns messages up to point
5. `setRewindContext(messages)` → stores truncated history in `rewindContextMap`
6. `markSessionAsForked(newId, sdkId)` → tracks fork for checkpointing
7. Frontend creates a fresh session (no SDK resume) → `session_init` fires
8. On first message send → `consumeRewindContext()` → `formatConversationContext()` → prepend to user message
9. Claude receives full prior context as XML prefix, responds with awareness of history

**No changes to `agent.ts` or `session-manager.ts`:**

- Do NOT add `_resumeSessionAt` field
- Do NOT modify the `replay-user-messages` guard (current logic is correct)
- Do NOT remove NOTE comments at `agent.ts:138-140` or `session-manager.ts:188-191`
- The `OrbitAgentConfig` type is unchanged

**Context-prepend system — fully preserved:**

- `setRewindContext()` / `consumeRewindContext()` in `use-tauri-session.ts`
- `rewindContextMap` in `use-tauri-session.ts`
- Context prepend in `agent-sdk-handlers.ts:62-72`
- `formatConversationContext()` in `use-tauri-context.ts`
- `markSessionAsForked()` / `forkedSessionResumeMap` in `use-tauri-session.ts`

---

## Phase 5: Update Frontend

### `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`

| Handler                         | Change                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `handleConversationCreate`      | **Simplified** — writes enrichment cache entry only (worktreePath, no JSONL)                                     |
| `handleConversationList`        | Unchanged (API contract same, data now from JSONL + cache)                                                       |
| `handleConversationLoad`        | Unchanged (API contract same, data now from JSONL)                                                               |
| `handleConversationDelete`      | Unchanged                                                                                                        |
| `handleConversationUpdateTitle` | Unchanged                                                                                                        |
| `handleConversationRewind`      | **Adapted** — data source change only (reads JSONL instead of JSON). Context-prepend rewind flow preserved as-is |

**Rewind flow (preserved — data source change only):**

The existing `handleConversationRewind()` is kept with one change — `conversationFork()` reads from JSONL instead of Orbit's JSON store:

```
Flow (unchanged logic, new data source):
  1. getRewindCheckpoints() → get checkpoint UUID
  2. agentRewindFiles(checkpointId) → SDK restores files on disk
  3. conversationFork(oldId, newId, messageId) → reads JSONL (was: JSON), returns messages up to point (read-only)
  4. setRewindContext(messages) → stores truncated history in-memory
  5. markSessionAsForked(newId, sdkId) → tracks fork for checkpointing
  6. On next send → consumeRewindContext() → formatConversationContext() → prepend to user message
  7. Message goes to fresh SDK session → SDK creates new JSONL
```

**Keep `handleConversationCreate` and `conversation:create → conversation:created` event cycle.** The frontend's `use-sidebar-actions.ts` → `handleStartConversation()` → `conversation:create` flow is deeply wired into the UI lifecycle (clears messages, switches active session, updates sidebar). Removing it would break the UI. Instead, make the backend handler lightweight (cache-only, returns immediately).

### `apps/agent/src/lib/api/conversations.ts`

- **Phase out** `conversationAddMessage()` — SDK handles persistence. Remove only after JSONL parser returns same DTO shape and all 6 call sites are verified. Called in `conversation-handlers.ts`, `agent-sdk-handlers.ts`, `message-handler.ts`, `use-tauri-session.ts`.
- **Modify** `conversationFork()` — read-only from JSONL (reads messages up to point, returns `Vec<Message>`, no write). Needed by rewind flow for `setRewindContext()`.
- Remove `conversationCleanupOrphaned()` — no longer meaningful
- Keep: `conversationCreate()`, `conversationList()`, `conversationLoad()`, `conversationDelete()`, `conversationUpdateTitle()`

### `apps/agent/src/stores/checkpoint-store.ts` (or equivalent)

- **Keep** `setRewindContext()` / `getRewindContext()` — used by context-prepend rewind flow (unchanged)
- **Keep** `markSessionAsForked()` — used by rewind flow in `conversation-handlers.ts` (unchanged)
- **Keep** checkpoint tracking (checkpoint UUIDs from user messages)
- **Keep** `turnStartCheckpoints` / `turnEndCheckpoints` / `getRewindCheckpoints()` — all unchanged
- No changes to this store — it works correctly with the data source change

### `apps/agent/src/hooks/agent/use-tauri.ts` (or tauri-handlers)

**New session (first message):**

1. Frontend already called `conversation:create` on "New Session" click → has a temporary UUID
2. User types message, hits send
3. Frontend calls `agent_create_session(tempUuid, { worktreePath })` — agent-bridge starts SDK session
4. SDK assigns real session ID → `session_init` event fires with real ID
5. Frontend swaps `tempUuid` → `realId` in:
   - Active conversation state
   - Sidebar conversation list
   - Enrichment cache (re-key the entry)
6. Frontend calls `agent_send_message(realId, text)`
7. Next `conversation_list` call picks up the new JSONL file

**Resume existing session:**

1. Frontend calls `conversation_load(sessionId)` → parse JSONL → display messages
2. User types a message and hits send
3. Frontend calls `agent_create_session(sessionId, { resumeSessionId: sessionId })`
4. SDK resumes from existing JSONL — `session_init` fires with same ID
5. Frontend calls `agent_send_message(sessionId, text)`
6. SDK appends to existing JSONL file

### `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`

**`handleStartConversation()`** — Keep existing flow:

- Generate temporary UUID
- Call `conversation:create` backend command (writes enrichment cache with `worktreePath`)
- Set temporary UUID as active conversation
- JSONL file gets created when user sends first message (SDK assigns real ID at that point)

### `apps/agent/src/stores/ui/ui-store.ts`

- **Keep** `loadConversationsFromStorage()` / `saveConversationsToStorage()` (localStorage fallback) — needed for browser-only dev mode (`bun run dev`) where Tauri backend is unavailable
- `~/.claude/projects/` is the primary source in production
- Keep `conversations` state array, populated from backend `conversation_list` calls in production, localStorage in dev mode

### `apps/agent/src/hooks/chat/handlers/message-handler.ts`

- `conversation:created` case — **kept**, same flow (backend now writes cache-only, returns immediately)
- `conversation:list` case — unchanged
- `conversation:loaded` case — unchanged (same DTO shape)

---

## Phase 6: Session ID Swap Mechanism

When the SDK assigns a session ID (different from the frontend's temporary UUID), the frontend must atomically swap all references.

### Implementation

**New event from agent-bridge: `session_init` already carries `sdkSessionId`.**

In `use-tauri.ts` handler for `session_init`:

```
1. Receive session_init { sessionId: tempId, sdkSessionId: realId }
2. If tempId !== realId:
   a. Update ui-store: rename conversation entry from tempId → realId
   b. Update active session ID if it matches tempId
   c. Call conversation_create(realId, { worktreePath }) to re-key enrichment cache
   d. Delete old tempId entry from enrichment cache
3. If tempId === realId (resume case): no swap needed
```

### Edge Cases

- **User sends second message before swap completes**: Queue outgoing messages behind the swap. The `session_init` event fires before any assistant response, so the swap happens before the first `agent_send_message`.
- **App crashes before swap**: Orphan temp-UUID entries in enrichment cache are harmless — they have no matching JSONL file and get cleaned up on next `conversation_list` (cache entries without JSONL files are silently removed).

---

## Phase 7: Live Sidebar Refresh (File Watcher)

Currently the sidebar only updates on explicit `conversation_list` calls. With sessions living in `~/.claude/projects/`, a Claude Code CLI session created while Orbit is open won't appear until the user triggers a refresh.

### Implementation

**File: `src-tauri/src/commands/agent/conversations.rs`** (or a new watcher module)

Use `notify` crate to watch `~/.claude/projects/{encoded-workspace}/` for new/modified `*.jsonl` files:

```rust
/// Start watching the workspace's JSONL directory for changes
fn start_session_watcher(workspace_path: &str, app_handle: AppHandle) -> Result<()>

/// Stop watching when workspace changes or app closes
fn stop_session_watcher() -> Result<()>
```

When a new JSONL file appears or an existing one is modified:

1. Debounce events (500ms) to batch rapid writes
2. Re-run `list_sdk_sessions()` for the workspace
3. Emit `conversation:list` event to frontend with updated summaries
4. Frontend's existing `conversation:list` handler updates the sidebar

### Scope

- Only watch the **active workspace's** directory, not all of `~/.claude/projects/`
- Swap watchers when the user changes workspace
- Use `notify::RecommendedWatcher` (uses FSEvents on macOS — efficient, no polling)

---

## Phase 8: Migration from Old Store

**One-time migration** from `~/Library/Application Support/orbit/projects/` to the enrichment cache.

### What to Migrate

- **Custom titles**: If a user renamed a session, preserve that title in `customTitle`
- **worktree_path**: Preserve existing grouping
- **forked_from**: Preserve fork relationships

### Implementation

```rust
/// Migrate old ConversationManager data to enrichment cache
/// Called once on first launch after update, sets a "migrated" flag
fn migrate_old_store() -> Result<MigrationReport>
```

**Steps:**

1. Check if `~/Library/Application Support/orbit/session-cache/.migrated` exists → skip if so
2. Scan old store at `~/Library/Application Support/orbit/projects/{workspace}/*.json`
3. For each old conversation JSON:
   a. Find matching JSONL file in `~/.claude/projects/{workspace}/` by session ID
   b. If found: copy `title` → `customTitle`, `worktree_path`, `forked_from` to enrichment cache
   c. If not found: skip (session was local-only, no SDK equivalent)
4. Write `.migrated` flag file
5. Old files left as-is (not deleted)

---

## Files Modified

| File                                                                            | Change Type   | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `crates/common/conversations/src/jsonl.rs`                                      | **NEW**       | JSONL parser, metadata extractor                                                |
| `crates/common/conversations/src/lib.rs`                                        | **Major**     | Read from `~/.claude/projects/`, enrichment cache, fork → read-only JSONL       |
| `src-tauri/src/commands/agent/conversations.rs`                                 | **Major**     | Remove addMessage/cleanup, fork → read-only, adapt list/load to JSONL           |
| `src-tauri/capabilities/filesystem.json`                                        | **Minor**     | Add explicit allow for `$HOME/.claude/**` and `$HOME/.config/claude/**`         |
| `agent-bridge/src/agent/session/session-storage.ts`                             | **Major**     | Remove mapping layer (SDK assigns session IDs)                                  |
| `agent-bridge/src/agent/session/session-manager.ts`                             | **Minor**     | Remove saveSession calls only. No `resumeSessionAt` changes. Keep NOTE comments |
| `agent-bridge/src/agent/core/agent.ts`                                          | **No change** | Keep as-is. NOTE comments preserved. `replay-user-messages` guard unchanged     |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`                  | **Minor**     | Simplify create (cache-only). Rewind adapted (JSONL data source, same logic)    |
| `apps/agent/src/hooks/agent/use-tauri.ts`                                       | **Moderate**  | Add session ID swap on `session_init`, adapt resume flow                        |
| `apps/agent/src/lib/api/conversations.ts`                                       | **Minor**     | Modify fork (read-only JSONL), phase out addMessage, remove cleanupOrphaned     |
| `apps/agent/src/stores/checkpoint-store.ts`                                     | **No change** | Keep all: rewindContext, markSessionAsForked, checkpoint tracking               |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | **Minor**     | Keep existing flow (create still calls backend)                                 |
| `apps/agent/src/stores/ui/ui-store.ts`                                          | **Minor**     | Keep localStorage fallback for dev mode                                         |
| `apps/agent/src/hooks/chat/handlers/message-handler.ts`                         | **Minor**     | Keep conversation:created handling                                              |

---

## Verification

### Build Checks

1. **Rust compilation**: `cargo check` — no errors
2. **TypeScript**: `bun run typecheck` — no errors
3. **Lint**: `./scripts/lint-all.sh` — passes

### Manual Tests — Session Discovery

4. Open a folder that has Claude Code CLI sessions
5. Verify sessions appear in Orbit's sidebar with `source: "claude-code"` indicator
6. Verify titles (first user message) and timestamps are reasonable
7. Verify Orbit-created sessions show `source: "orbit"`

### Manual Tests — Session Resume

8. Click a Claude Code CLI session → verify conversation history displays correctly
9. Send a message → verify SDK resumes the session (response has full context)
10. Verify the JSONL file was appended to (not a new file)

### Manual Tests — New Session

11. Click "New Session" → verify `conversation:created` event fires, UI resets
12. Send a message → verify `session_init` fires with SDK-assigned ID
13. Verify temporary UUID is swapped to real ID in sidebar
14. Verify JSONL file created at `~/.claude/projects/{workspace}/`
15. Close and reopen → verify session persists in sidebar

### Manual Tests — Delete Session

16. Delete a session from sidebar
17. Verify JSONL file removed from `~/.claude/projects/`
18. Verify enrichment cache entry removed

### Manual Tests — Rewind (context-prepend preserved, JSONL data source)

19. Use rewind on a message mid-conversation
20. Verify `rewindFiles()` restores disk state to the checkpoint
21. Verify `conversationFork()` reads messages from JSONL (not old JSON store)
22. Verify `setRewindContext()` stores truncated message history
23. Send a new message → verify `consumeRewindContext()` prepends formatted context to user message
24. Verify new SDK session creates a new JSONL file (original preserved)
25. Verify `forkedFrom` relationship tracked in enrichment cache
26. Verify `replay-user-messages` is enabled for the fresh session (checkpoint UUIDs available for future rewinds)
27. Use rewind again from the forked session → verify nested rewind works

### Manual Tests — Live Refresh

27. While Orbit is open, start a Claude Code CLI session in the same workspace
28. Verify new session appears in Orbit's sidebar within ~1 second (file watcher)

### Manual Tests — Migration

29. With old-format conversations in `~/Library/Application Support/orbit/projects/`
30. Launch updated Orbit → verify custom titles migrated to enrichment cache
31. Verify `.migrated` flag prevents re-migration on subsequent launches

### Manual Tests — Dev Mode

32. Run `bun run dev` (browser-only, no Tauri backend)
33. Verify localStorage fallback still works for conversation list

### Manual Tests — Platform

34. On macOS: verify `~/.claude/projects/` is accessible
35. On Linux: verify `~/.config/claude/projects/` fallback works (if applicable)
36. Verify Tauri FS ACL allows reads from both paths

---

## Risks & Mitigations

| Risk                                              | Mitigation                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Large JSONL files (MBs)                           | Metadata extraction reads only first ~30 lines. Full parse is lazy (on click). Use `BufReader` line-by-line.                                                 |
| Concurrent access (CLI writing while Orbit reads) | JSONL is append-only. `BufReader` handles partial last lines safely.                                                                                         |
| Session ID swap race condition                    | `session_init` fires before any assistant response. Queue messages behind the swap.                                                                          |
| SDK changes JSONL format                          | Pin SDK version. JSONL parsing uses defensive `serde_json::Value` with graceful skip on unknown fields.                                                      |
| Enrichment cache concurrent writes                | Use atomic write (write to temp file, rename) for cache updates. Single-writer in Tauri command thread.                                                      |
| Breaking rewind                                   | Context-prepend rewind preserved as-is. Only data source changes (JSONL instead of JSON). Integration tested in `combined-rewind.test.ts`.                   |
| Title quality                                     | First user message truncated to 80 chars. Users can rename via enrichment cache `customTitle`.                                                               |
| Migration data loss                               | Old files left as-is. Migration is additive (copies to cache). `.migrated` flag prevents re-runs.                                                            |
| 500+ JSONL files in workspace                     | Enrichment cache stores pre-parsed metadata. Only re-parse files whose mtime+size changed.                                                                   |
| `~/.claude/` doesn't exist                        | Graceful fallback: return empty session list. No error shown to user.                                                                                        |
| Worktree grouping for CLI sessions                | CLI sessions have no `worktreePath` — grouped under "Other" or shown ungrouped. Orbit sessions retain it.                                                    |
| File watcher overhead                             | Only watch active workspace directory. Use FSEvents (macOS) — no polling. Stop on workspace change.                                                          |
| Linux `~/.config/claude/` path                    | Add explicit Tauri FS ACL allow for `$HOME/.config/claude/**`. Detect path at runtime via `dirs` crate.                                                      |
| Tauri FS ACL blocks `~/.claude/`                  | Add explicit allow for `$HOME/.claude/**` in `capabilities/filesystem.json` (don't rely on `$HOME/**` minus deny rules).                                     |
| Workspace path encoding collisions                | `/Users/foo/my-project` and `/Users/foo/my/project` both encode to `-Users-foo-my-project`. Inherited from SDK — no fix needed, but document the limitation. |
| `resumeSessionAt` undocumented in SDK             | NOT USED. Context-prepend rewind is preserved. NOTE comments in `agent.ts` and `session-manager.ts` kept as warnings.                                        |
| Checkpoint UUIDs in forked sessions               | Forked sessions are fresh SDK sessions (not resumed), so `replay-user-messages` is ON → checkpoint UUIDs available. No change to existing guard.             |
