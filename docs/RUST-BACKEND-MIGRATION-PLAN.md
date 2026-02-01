# Plan: Migrate Business Logic from Sidecar/Frontend → Rust Backend

## Goal

Transform the Rust backend from a "dumb pipe" into intelligent middleware by moving pure business logic out of the agent-bridge sidecar and frontend into Rust. This eliminates unnecessary IPC round-trips, improves streaming precision, and reduces sidecar GC pressure.

---

## Phase 1: Agent/Command Definitions → Rust

**Impact: ~200ms faster per operation (eliminates full sidecar IPC round-trip)**

### Problem

Reading `.claude/agents/*.md` and `.claude/commands/*.md` files currently flows:

```
Frontend → Tauri → Rust → stdin JSON → Bun reads files → parses → stdout JSON → Rust → Frontend
```

This is pure file I/O + string parsing — no SDK dependency.

### Changes

#### 1. New crate: `crates/common/definitions/`

```
crates/common/definitions/
├── Cargo.toml          # deps: serde, thiserror
└── src/
    ├── lib.rs           # Public API re-exports
    ├── error.rs         # DefinitionError enum
    ├── parser.rs        # YAML frontmatter parser (regex, no YAML lib)
    ├── agents.rs        # list/get/create/update/delete agents
    ├── commands.rs      # list/get/create/update/delete commands (4 scopes)
    └── builtins.rs      # Hardcoded builtin + default commands
```

**Parser**: Regex-based `---\n(key: value lines)\n---\n(content)` — matches sidecar exactly.

**Types**: Reuse existing `SubagentDefinition`, `SlashCommandDefinition`, `CommandScope` from `src-tauri/src/agent/protocol.rs`. Move them to the new crate and re-export from protocol.

#### 2. Modify `src-tauri/src/agent/session.rs` (lines 410-589)

Replace 10 sidecar-proxied methods with direct Rust calls:

```rust
// Before: self.ensure_running()? → bridge.send_request() → sidecar IPC
// After:  orbit_definitions::list_agents(Path::new(workspace_path))
```

Methods to replace: `list_agents`, `get_agent`, `create_agent`, `update_agent`, `delete_agent`, `list_commands`, `get_command`, `create_command`, `update_command`, `delete_command`.

#### 3. Remove from sidecar

- Delete `agent-bridge/src/agent/definitions/agent-definitions.ts` (~320 lines)
- Delete `agent-bridge/src/agent/definitions/command-definitions.ts` (~522 lines)
- Remove 10 IPC cases from `agent-bridge/src/index.ts`
- Remove related Zod schemas from `agent-bridge/src/protocol/schemas.ts`

#### 4. No frontend changes needed

Same Tauri commands, same return types, same API.

### Testing

- Unit tests in Rust crate: parser, CRUD lifecycle, scope merging
- Integration: create temp workspace with real .md files, compare outputs with sidecar
- `cargo test -p orbit-definitions`

---

## Phase 2: Text Event Batching → Rust

**Impact: 10-30ms less latency per batch, eliminates timer drift under load**

### Problem

SDK emits ~200 text deltas per response. The Bun sidecar batches them using `setTimeout(16ms)` — imprecise under GC pressure, causing jittery streaming.

### Changes

#### 1. New file: `src-tauri/src/agent/text_batcher.rs`

```rust
pub struct TextEventBatcher {
    buffer: Arc<Mutex<HashMap<(String, String), String>>>,        // (session, msg) → text
    accumulated_lengths: Arc<Mutex<HashMap<(String, String), usize>>>, // for contentOffset
    emit_fn: Arc<dyn Fn(String, String, String) + Send + Sync>,   // (session, msg, content)
}
```

Key methods:

- `add(session_id, message_id, content)` — accumulate text
- `flush_session(session_id)` — immediate flush (before tool events)
- `drain_session(session_id, chunk_size, interval_ms)` — gradual drain on turn complete
- `get_accumulated_length(session_id, message_id)` — for tool contentOffset
- Background `tokio::time::interval(50ms)` for periodic flush

**Critical invariants preserved**:

- Flush before tool events (contentOffset accuracy)
- Gradual drain on turn complete (smooth finish)
- Accumulated length tracking across batches

#### 2. Modify `src-tauri/src/agent/bridge.rs` reader thread

Intercept text events before emission, route through batcher:

```rust
if event.is_text_event() {
    batcher.add(session_id, message_id, content);
    // Don't emit raw — batcher emits batched
} else {
    // Non-text events: emit immediately
    callback(event);
}
```

#### 3. Simplify sidecar

- Remove `TextEventBatcher` class from `agent-bridge/src/common/batching/`
- Session manager sends raw unbatched text events to stdout
- Delete accumulated length tracking from sidecar

### Testing

- Stress test: 10,000 rapid events, verify zero loss
- Timing test: batch intervals must be <55ms (vs current 55-65ms drift)
- ContentOffset test: tool widgets at correct positions
- `cargo test` for batcher unit tests

---

## Phase 3: Message Transformation → Rust

**Impact: 2-5ms per message, compounds over long conversations**

### Problem

The sidecar transforms every SDK message: generates stable turn IDs, calculates content offsets, tracks tool status transitions. This is ~200 lines of pure data processing in JS that Rust could do faster with zero GC.

### Changes

#### 1. New file: `src-tauri/src/agent/transformer.rs`

```rust
pub struct MessageTransformer {
    turn_ids: Mutex<HashMap<String, String>>,                  // session → current turn_id
    tool_states: Mutex<HashMap<String, ToolStatus>>,           // tool_id → status
}
```

Key operations:

- **Stable turn ID**: Generate one UUID per assistant turn, reuse across all events in that turn
- **Tool status tracking**: `awaiting-permission → running → success/error`
- **Turn reset**: Clear turn ID on `result` event

**Note**: ContentOffset is handled by the TextEventBatcher (Phase 2), so the transformer delegates to it.

#### 2. Integrate into bridge reader

Raw SDK events → transformer → batched/transformed AgentMessage → frontend.

#### 3. Simplify sidecar session-manager

Remove from `agent-bridge/src/agent/session/session-manager.ts`:

- Turn ID map and generation (~30 lines)
- Tool status state machine (~40 lines)
- Content loss metrics (~40 lines)

Keep: SDK session creation, raw event forwarding, permission callbacks, file checkpointing.

### Testing

- Turn ID stability: same ID across all events in a turn
- Tool status: correct transitions visible in UI
- Compare transformed output with sidecar's output (parity check)

---

## Phase 4: Frontend Logic → Rust

**Impact: Structural cleanup + minor perf gains**

### 4a. Icon Mapping

**File**: `apps/agent/src/lib/utils/iconMap.ts` (~400 lines) → `crates/common/fs/`

- Add `pub fn get_icon_name(path: &str, is_dir: bool) -> String` to fs crate
- Add `icon_name: String` field to `FileEntry` struct in `orbit-core`
- Populate in `list_directory()`
- Remove `iconMap.ts` from frontend, use `entry.icon_name`

### 4b. Language Detection

**Files**: Duplicated in `diff-utils.ts` AND `file-viewer-store.ts` → `crates/common/fs/`

- Add `pub fn get_language_id(path: &str) -> String` to fs crate
- Add `language_id: String` field to `FileEntry` struct
- Add new Tauri command: `get_language_id(path: String) -> String` (for non-FileEntry use)
- Remove both frontend copies

### 4c. Diff Computation

**File**: `apps/agent/src/lib/utils/diff-utils.ts` → `crates/common/git/`

- Add `similar` crate dependency (Myers diff algorithm)
- Add `pub fn compute_diff(old: &str, new: &str) -> FileDiff` using existing `FileDiff` type
- Add Tauri command: `compute_file_diff(old: String, new: String) -> FileDiff`
- Frontend calls `invoke('compute_file_diff')` instead of local computation

### 4d. Git Derived Values

**File**: `apps/agent/src/stores/git/git-store.ts` selectors → `crates/common/git/`

- Add to `GitStatus` struct: `is_clean: bool`, `total_changes: usize`, `has_conflicts: bool`
- Compute once in `git_status()` before returning
- Frontend uses fields directly instead of computing from arrays

---

## Execution Order

| Order | Phase                    | Risk   | Effort | Can Ship Independently             |
| ----- | ------------------------ | ------ | ------ | ---------------------------------- |
| 1     | Phase 1 (Definitions)    | Low    | Medium | ✅ Yes                             |
| 2     | Phase 4a-d (Frontend)    | Low    | Low    | ✅ Yes (each sub-item independent) |
| 3     | Phase 2 (Batching)       | Medium | Medium | ✅ Yes                             |
| 4     | Phase 3 (Transformation) | Medium | High   | ✅ Yes                             |

Phases 1 and 4 are safest — no streaming coordination. Phases 2-3 touch the hot path and need careful testing.

---

## Files Modified Summary

### New Files

- `crates/common/definitions/` — entire new crate (5 files)
- `src-tauri/src/agent/text_batcher.rs` — Rust batcher
- `src-tauri/src/agent/transformer.rs` — message transformer

### Modified Files

- `Cargo.toml` (workspace root) — add `orbit-definitions` member
- `src-tauri/Cargo.toml` — add `orbit-definitions`, `similar` deps
- `src-tauri/src/agent/session.rs` — replace 10 sidecar proxy methods
- `src-tauri/src/agent/bridge.rs` — integrate batcher + transformer
- `src-tauri/src/agent/mod.rs` — add new modules
- `crates/common/core/src/types.rs` — add `icon_name`, `language_id` to `FileEntry`
- `crates/common/fs/src/lib.rs` — add icon/language functions, populate in list_directory
- `crates/common/git/src/lib.rs` — add `compute_diff`, derived GitStatus fields
- `crates/common/git/Cargo.toml` — add `similar` dependency
- `src-tauri/src/commands/common/files.rs` — pass through new FileEntry fields
- `src-tauri/src/commands/common/git.rs` — add `compute_file_diff` command
- `src-tauri/src/lib.rs` — register new commands

### Deleted Files (from sidecar)

- `agent-bridge/src/agent/definitions/agent-definitions.ts`
- `agent-bridge/src/agent/definitions/command-definitions.ts`
- `agent-bridge/src/common/batching/text-event-batcher.ts` (after Phase 2)

### Deleted/Simplified Files (from frontend)

- `apps/agent/src/lib/utils/iconMap.ts` — delete entirely
- `apps/agent/src/lib/utils/diff-utils.ts` — remove `computeSimpleDiff`, keep `getLanguageFromPath` until Phase 4b
- `apps/agent/src/stores/git/git-store.ts` — remove derived selectors

---

## Verification

### Phase 1

```bash
cargo test -p orbit-definitions          # Unit tests
bunx tauri dev                            # Manual: open command picker, create/edit agents
```

### Phase 2

```bash
cargo test -p orbit-tauri                 # Batcher unit tests
bunx tauri dev                            # Manual: send message, verify smooth streaming
```

### Phase 3

```bash
cargo test -p orbit-tauri                 # Transformer tests
bunx tauri dev                            # Manual: verify tool widgets render correctly
```

### Phase 4

```bash
cargo test -p orbit-fs                    # Icon/language tests
cargo test -p orbit-git                   # Diff/derived value tests
bun run typecheck                         # Frontend compiles after removals
bun run test                              # Frontend tests pass
bunx tauri dev                            # Manual: file tree icons, diff views, git panel
```

### Full validation

```bash
./scripts/lint-all.sh                     # Everything passes
bun run ci                                # Full CI suite
```
