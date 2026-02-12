# Plan: Replace Orbit JSON Storage with Claude Code JSONL

## Goal

Remove Orbit's own conversation storage. Use `~/.claude/projects/` JSONL files as the **single source of truth** — both read and write. Sessions created in Orbit appear in Claude Code CLI and vice versa.

## Why This Is Fast

- **Listing**: `readdir` + `stat` (mtime) + scan last ~200 bytes for summary per file = ~15ms for 100 files
- **Writing**: JSONL append is O(1) — no read-modify-write cycle (current JSON approach rewrites entire file)
- **Loading**: Sequential line scan, skip unknown types — simple and fast

## Architecture

```
~/.claude/projects/{encoded-workspace}/
├── {session-id-1}.jsonl     ← Claude Code CLI sessions
├── {session-id-2}.jsonl     ← Orbit-created sessions
└── {session-id-3}.jsonl     ← Both can read/write all files
```

## File Changes

### 1. `crates/common/conversations/Cargo.toml`

- Add `chrono = { workspace = true }` dependency (already in workspace)

### 2. `crates/common/conversations/src/lib.rs` — Core Rewrite

**Storage path**: Change `default_base_dir()` from platform-specific orbit dir → `~/.claude/`
**File extension**: `.json` → `.jsonl`

**New types** (JSONL line discriminated union):

```rust
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum JsonlLine {
    #[serde(rename = "user")]
    User {
        uuid: String,
        #[serde(rename = "parentUuid")]
        parent_uuid: Option<String>,
        #[serde(rename = "sessionId")]
        session_id: String,
        message: UserMessagePayload,
        cwd: String,
        timestamp: String,
        // Reading: all other fields ignored via deny_unknown_fields NOT set
    },
    #[serde(rename = "assistant")]
    Assistant {
        uuid: String,
        #[serde(rename = "parentUuid")]
        parent_uuid: Option<String>,
        #[serde(rename = "sessionId")]
        session_id: String,
        message: serde_json::Value,  // passthrough — rich content arrays
        cwd: String,
        timestamp: String,
    },
    #[serde(rename = "summary")]
    Summary {
        summary: String,
        #[serde(rename = "leafUuid")]
        leaf_uuid: String,
    },
    #[serde(other)]
    Unknown,  // system, file-history-snapshot, tool_result, etc.
}
```

**Key designs** (from audit):

- Assistant `message` field is `serde_json::Value` (passthrough for reading). Orbit writes correct array-of-blocks format.
- All line parsing wrapped in `serde_json::from_str().ok()` — handles both unknown types AND malformed lines.
- Summary search scans last 3 non-empty lines backwards (not just last line — summaries may not be final line).
- Skip subdirectories (e.g. `subagents/`) when scanning for `.jsonl` files.
- Log `tracing::warn!` for skipped unparseable lines.

**Orbit-written user lines include required fields:**

```json
{
  "type": "user",
  "uuid": "id",
  "parentUuid": null,
  "sessionId": "sid",
  "message": { "role": "user", "content": "text" },
  "cwd": "/workspace",
  "timestamp": "ISO-8601",
  "version": "1.0.0",
  "userType": "external",
  "isSidechain": false,
  "gitBranch": "main"
}
```

**Orbit-written assistant lines use array-of-blocks format:**

```json
{
  "type": "assistant",
  "uuid": "id",
  "parentUuid": "prev",
  "sessionId": "sid",
  "message": { "role": "assistant", "content": [{ "type": "text", "text": "Response" }] },
  "cwd": "/workspace",
  "timestamp": "ISO-8601"
}
```

**Method rewrites:**

| Method                           | Current (JSON)                                  | New (JSONL)                                                                                          |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `load_summaries_for_workspace()` | Read entire JSON, deserialize full Conversation | `readdir` + `stat` + scan last bytes for summary. Skip subdirs. `created_at = mtime`.                |
| `load_from_workspace()`          | `serde_json::from_str` entire file              | Parse line-by-line, build Message vec. Extract tool_uses + usage from assistant `serde_json::Value`. |
| `create()`                       | Write full Conversation JSON                    | Create file with initial summary line                                                                |
| `add_message()`                  | Load all → append → rewrite entire file         | **Append single line** (O(1)). User lines include version/userType/isSidechain/gitBranch.            |
| `update_title()`                 | Load → modify → rewrite                         | **Append summary line**                                                                              |
| `fork()`                         | Load → slice → write new JSON                   | Read source lines → write subset to new file                                                         |
| `delete()`                       | Delete .json                                    | Delete .jsonl                                                                                        |
| `save()` / `save_to_workspace()` | Write entire JSON atomically                    | **Remove** — replaced by append                                                                      |

**Remove**: `cleanup_orphaned_conversations()`, `save()`, `save_to_workspace()`

**Helper functions:**

- `read_last_summary(path) -> Option<String>` — reads last ~4KB, scans backwards through last 3 non-empty lines for `"type":"summary"`
- `extract_assistant_content(value) -> (String, Vec<ToolUse>)` — extracts text and tool_use blocks from content array
- `extract_usage(value) -> Option<TokenUsage>` — extracts usage from `message.usage` via `serde_json::from_value` with `#[serde(default)]`
- `chrono_timestamp_from_millis(u64) -> String` — epoch ms → ISO-8601
- `parse_iso_timestamp(str) -> u64` — ISO-8601 → epoch ms

### 3. `src-tauri/src/commands/agent/conversations.rs`

- Remove `conversation_cleanup_orphaned` command
- Remove `conversation_data_path` command (unused)
- All other commands unchanged — same signatures, same DTOs

### 4. `src-tauri/src/lib.rs`

- Remove `conversation_cleanup_orphaned` and `conversation_data_path` from `generate_handler![]`

### 5. `apps/agent/src/lib/api/conversations.ts`

- Remove `conversationCleanupOrphaned()` and `conversationDataPath()` functions (never called)

### 6. All other frontend files — NO CHANGES

The Tauri command interface is identical. All 10+ frontend callers work as-is.

- `messageCount` will be 0 for listed sessions (sidebar doesn't prominently display this)
- `createdAt` approximated as `mtime` in summaries, accurate from first user line timestamp when loading full conversation
- `forkedFrom` omitted from JSONL (rewind handler checks `forked.messages` not `forkedFrom`, so it works)
- `toolUses` extracted from assistant content blocks during `load_from_workspace()`
- `usage` extracted from `message.usage` during load

## Edge Cases (from audit)

- **`~/.claude/` doesn't exist**: Create it on first write. Return empty list on read.
- **Workspace dir doesn't exist**: Create on write. Empty list on read.
- **Empty JSONL file (0 bytes)**: Show as "Untitled" in sidebar, empty conversation on load.
- **No summary line**: Use "Untitled" as title fallback.
- **Trailing newlines**: `read_last_summary` skips empty lines when scanning backwards.
- **Concurrent access (Orbit + Claude CLI)**: POSIX append atomicity under PIPE_BUF (4KB). Acceptable for v1.
- **Crash during write**: May lose in-flight line. Same as Claude Code CLI behavior.

## What We're NOT Doing

- No migration of old Orbit JSON files (they stay in the old dir, user starts fresh)
- No session watcher / file watcher
- No enrichment cache
- No session ID remapping
- No background threads

## Implementation Order

1. Add `chrono` to conversations Cargo.toml
2. Rewrite `lib.rs` — new types + all method implementations
3. Remove cleanup/data_path commands from Tauri
4. Remove unused frontend API functions
5. `cargo check` → `bun run check` → `bunx tauri dev`

## Verification

1. `cargo check` — Rust compiles
2. `bun run check` — TypeScript + ESLint pass
3. `bunx tauri dev` — App launches
4. Sidebar shows Claude Code sessions from `~/.claude/projects/`
5. Create new conversation in Orbit → `.jsonl` file appears in `~/.claude/projects/`
6. Send messages → lines appended to JSONL
7. Switch conversations → messages load correctly
8. Rename conversation → new summary line appended
