# Ghost Commit File Undo for OpenCode Backend

## Context

OpenCode's file rewind is broken. It rewinds conversation context (SQLite message deletion) but does NOT properly rewind file edits made by the agent. The current system uses tree hashes (not full commits), per-file `git checkout` loops (not atomic restore), and takes snapshots too late (on `start-step` instead of before the turn). Codex (OpenAI's CLI agent) has a battle-tested ghost commit system that solves all of these problems. This plan ports Codex's approach to OpenCode, adapted for its TypeScript/Bun runtime and separate-git-dir architecture.

### What's broken (5 issues)

1. **Tree hashes lose untracked files** — `git write-tree` only captures tracked files. Agent-created new files aren't tracked, so undo can't delete them.
2. **Per-file restore is non-atomic** — `revert()` loops `git checkout <hash> -- <file>` per file. If it crashes mid-loop, workspace is half-reverted.
3. **`checkout-index -a -f` overwrites staging** — `restore()` uses `checkout-index` which clobbers the user's `git add`'d changes.
4. **Snapshot timing is wrong** — Snapshot happens on `start-step` (after stream begins), not before the turn. If the first tool call modifies files before the snapshot, pre-turn state is lost.
5. **No cleanup of agent-created files** — No tracking of which files existed before the turn, so undo can't distinguish "agent created this" from "user created this".

### How Codex solves it

- **Ghost commits**: Full `git commit-tree` objects (detached, invisible to `git log`) that capture the entire working tree including untracked files via `git add -A`.
- **Temp index isolation**: `GIT_INDEX_FILE=/tmp/codex-git-index-*` so snapshot operations never touch the user's staging area.
- **Atomic restore**: Single `git restore --source <commit> --worktree -- .` command.
- **Untracked file tracking**: `GhostCommit` struct stores `preexisting_untracked_files` and `preexisting_untracked_dirs` — on undo, any untracked file NOT in this list was agent-created and gets deleted.
- **Readiness gate**: Snapshot must complete before any tool execution begins.
- **Consume-on-undo**: Each undo removes the snapshot from history, enabling sequential undo (turn 3 → turn 2 → turn 1).

---

## Files to Modify

| File                                                        | Change                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Agent-backend/packages/opencode/src/snapshot/index.ts`     | Rewrite core: add `commit()`, `undo()`, `listUntracked()`, temp index isolation |
| `Agent-backend/packages/opencode/src/session/message-v2.ts` | Add `TurnSnapshotPart` type to Part union                                       |
| `Agent-backend/packages/opencode/src/session/processor.ts`  | Move snapshot to turn start, emit `TurnSnapshotPart`, add readiness gate        |
| `Agent-backend/packages/opencode/src/session/revert.ts`     | Rewrite to use ghost commit undo instead of per-file revert                     |
| `Agent-backend/packages/opencode/src/config/config.ts`      | Expand `snapshot` config with thresholds                                        |

## Files to Create

| File                                                                 | Purpose                                |
| -------------------------------------------------------------------- | -------------------------------------- |
| `Agent-backend/packages/opencode/test/snapshot/ghost-commit.test.ts` | Unit tests for ghost commit operations |

## Reference Files (read-only)

| File                                                        | Why                                              |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `reference/codex/codex-rs/utils/git/src/ghost_commits.rs`   | Codex's ghost commit implementation (900+ lines) |
| `reference/codex/codex-rs/utils/git/src/lib.rs`             | `GhostCommit` struct definition                  |
| `reference/codex/codex-rs/core/src/tasks/ghost_snapshot.rs` | Snapshot task + readiness gate                   |
| `reference/codex/codex-rs/core/src/tasks/undo.rs`           | Undo task + consume-on-undo                      |
| `reference/codex/codex-rs/core/tests/suite/undo.rs`         | 10 comprehensive undo tests                      |

---

## Phase 1: Core Snapshot Upgrade (`snapshot/index.ts`)

### 1.1 — GhostCommit type

Add to `snapshot/index.ts`:

```typescript
interface GhostCommit {
  id: string; // full commit SHA
  parent: string | undefined; // parent commit SHA (previous ghost commit)
  preexistingUntrackedFiles: string[]; // untracked files that existed BEFORE this turn
  preexistingUntrackedDirs: string[]; // untracked dirs that existed BEFORE this turn
}
```

### 1.2 — `listUntracked()` function

New function that captures untracked file/dir state before snapshot. Uses `git ls-files --others --exclude-standard` in the PROJECT repo (not the snapshot repo). Applies Codex-style filtering:

- Skip files > 10 MiB (`DEFAULT_IGNORE_LARGE_UNTRACKED_FILES`)
- Skip dirs with > 200 entries (`DEFAULT_IGNORE_LARGE_UNTRACKED_DIRS`)
- Skip known large dirs: `node_modules`, `.venv`, `dist`, `build`, `.next`, `target`, `__pycache__`, `.git`, `.cache`, `vendor`, `bower_components`, `.tox`, `eggs`, `.eggs`, `*.egg-info`

Returns `{ files: string[], dirs: string[] }`.

### 1.3 — `commit()` function (replaces `track()` for ghost commits)

Full ghost commit creation using temp index isolation:

1. Create temp index file: `path.join(os.tmpdir(), "opencode-git-index-" + randomUUID())`
2. Set `GIT_INDEX_FILE` env var to temp index path
3. Run `git add -A` with temp index (captures ALL files including untracked)
4. Run `git write-tree` with temp index → get tree hash
5. Get parent: read last ghost commit from a lightweight ref or pass it in
6. Run `git commit-tree <tree> [-p <parent>] -m "OpenCode Snapshot"` with fake identity:
   - `GIT_AUTHOR_NAME=OpenCode Snapshot`
   - `GIT_AUTHOR_EMAIL=snapshot@opencode.local`
   - `GIT_COMMITTER_NAME=OpenCode Snapshot`
   - `GIT_COMMITTER_EMAIL=snapshot@opencode.local`
7. Delete temp index file (in `finally` block)
8. Return `GhostCommit` object with untracked lists from `listUntracked()`

**Key difference from Codex**: OpenCode uses a separate git dir (`~/.local/share/opencode/snapshot/<projectId>`). The `commit()` function operates in this separate git dir but reads untracked files from the PROJECT dir. The separate git dir already has the project's worktree set via `--work-tree`.

### 1.4 — `undo(ghostCommit: GhostCommit)` function (replaces `restore()`)

Atomic restore using temp index:

1. Create temp index file
2. `git read-tree <ghostCommit.id>` into temp index
3. `git checkout-index -a -f` from temp index with `--work-tree=<projectDir>` → restores ALL tracked files atomically
4. Delete temp index
5. Call `removeNewUntracked(ghostCommit)` to clean up agent-created files

**Why not `git restore --source`**: OpenCode's separate git dir architecture means we can't use `git restore` directly (it expects the commit to be in the project's repo). Instead we use `read-tree` + `checkout-index` in the snapshot repo with `--work-tree` pointing to the project. The temp index ensures the USER's staging area is never touched.

### 1.5 — `removeNewUntracked(ghostCommit: GhostCommit)` function

Matches Codex's `remove_new_untracked()` (lines 816-845 of `ghost_commits.rs`):

1. Get current untracked files in project dir: `git ls-files --others --exclude-standard`
2. Build Sets from `ghostCommit.preexistingUntrackedFiles` and `ghostCommit.preexistingUntrackedDirs`
3. For each current untracked file:
   - If it's in `preexistingUntrackedFiles` → skip (user had it before)
   - If its parent dir is in `preexistingUntrackedDirs` → skip (user had the dir before)
   - Otherwise → `fs.unlink(file)` (agent created it, delete it)
4. Clean up empty directories left behind

### 1.6 — Keep existing functions

`track()`, `restore()`, `revert()`, `patch()` stay for backward compatibility with legacy sessions. Mark them with `@deprecated` JSDoc comments. They will be used as fallback when a session has no `turn-snapshot` parts.

---

## Phase 2: Wire Into Session Processing

### 2.1 — Add `TurnSnapshotPart` to message-v2.ts

```typescript
// In the Part types section (after PatchPart)
export interface TurnSnapshotPart extends PartBase {
  type: 'turn-snapshot';
  ghostCommit: {
    id: string;
    parent: string | undefined;
    preexistingUntrackedFiles: string[];
    preexistingUntrackedDirs: string[];
  };
}
```

Add `TurnSnapshotPart` to the `Part` discriminated union (lines 379-396). Add `"turn-snapshot"` to the `partType` enum in `session.sql.ts`.

### 2.2 — Move snapshot timing in `processor.ts`

**Current** (broken): Snapshot taken on `start-step` event (line 254), AFTER the stream has already begun.

**New**: Snapshot taken BEFORE `process()` starts consuming the stream. In `SessionPrompt` (prompt.ts), after building the LLM call but BEFORE starting the stream:

1. In `prompt.ts` `next()` function (or wherever the LLM call is initiated), BEFORE the stream starts:
   - Call `Snapshot.commit()` → get `GhostCommit`
   - Store the ghost commit on the processor context
2. In `processor.ts` `create()`, the ghost commit is passed in from prompt.ts
3. On the FIRST `start-step` event, emit a `TurnSnapshotPart` with the ghost commit data
4. Remove the old `snapshot = await Snapshot.track()` from `start-step` handler

**Readiness gate**: Unlike Codex (which uses `ReadinessFlag` to block tool execution until snapshot completes), OpenCode's architecture is simpler — the snapshot runs synchronously before the stream starts. The LLM call hasn't even been made yet, so there's no race condition. If snapshot is slow, the LLM call is delayed (acceptable — Codex's warn threshold is 240 seconds).

### 2.3 — Rewrite `revert.ts` to use ghost commits

**Current flow** (broken):

1. Walk messages, collect `patch` parts after target
2. Call `Snapshot.revert(patches)` — per-file checkout loop
3. Store diff for unrevert

**New flow**:

1. Walk messages backward from latest to find the `turn-snapshot` part for the turn being reverted TO
2. If found: call `Snapshot.undo(ghostCommit)` — atomic restore + untracked cleanup
3. If NOT found (legacy session): fall back to existing `Snapshot.revert(patches)` path
4. **Consume-on-undo**: After successful undo, mark the `turn-snapshot` part as consumed (delete it from DB or mark with a `consumed` flag). This enables sequential undo — next undo finds the PREVIOUS turn's snapshot.
5. Store the CURRENT ghost commit (pre-undo state) for unrevert: `Snapshot.commit()` before calling `undo()`, save the commit hash on the session's revert state.

**Unrevert**: Call `Snapshot.undo(savedPreUndoGhostCommit)` to restore to the state before the undo.

### 2.4 — Expand config in `config.ts`

Change `snapshot: z.boolean().optional()` to:

```typescript
snapshot: z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().optional().default(true),
    ignoreLargeUntrackedFiles: z
      .number()
      .optional()
      .default(10 * 1024 * 1024), // 10 MiB
    ignoreLargeUntrackedDirs: z.number().optional().default(200),
    warnSlowSnapshotMs: z.number().optional().default(240_000), // 4 min
    ignoredDirNames: z.array(z.string()).optional(),
  }),
]).optional();
```

Backward compatible: `snapshot: true` still works. `snapshot: { enabled: true, ignoreLargeUntrackedFiles: 5242880 }` for fine-tuning.

---

## Phase 3: Cleanup and Hardening

### 3.1 — Default excludes in `syncExclude()`

Add Codex-style default ignores to the snapshot git dir's exclude file:

```
node_modules/
.venv/
dist/
build/
.next/
target/
__pycache__/
.cache/
vendor/
bower_components/
.tox/
eggs/
.eggs/
*.egg-info/
```

These are appended to whatever the user has in `.git/info/exclude`.

### 3.2 — Slow snapshot warning

In the `commit()` function, measure elapsed time. If > `warnSlowSnapshotMs` (default 240s), log a warning:

```
[Snapshot] Ghost commit took ${elapsed}ms — consider adding large directories to .gitignore
```

### 3.3 — Large file/dir skip logging

When `listUntracked()` skips a file (> 10 MiB) or dir (> 200 entries), log at debug level:

```
[Snapshot] Skipping large untracked file: <path> (12.3 MiB)
[Snapshot] Skipping large untracked dir: <path> (350 entries)
```

### 3.4 — Deprecation of old functions

Add `@deprecated Use commit() for ghost commits` to `track()`, `restore()`, `revert()`. Keep them functional for legacy session support. They can be removed in a future major version.

### 3.5 — Cleanup scheduling

The existing hourly `git gc --prune=7.days` in `cleanup()` is fine. Ghost commits are detached (no ref), so `git gc` will prune them after 7 days. No change needed.

---

## Migration & Backward Compatibility

- **No DB migration needed**: `TurnSnapshotPart` uses the existing `part` table with `type = "turn-snapshot"` and JSON data in the existing content column.
- **Legacy sessions**: Sessions created before this change won't have `turn-snapshot` parts. The `revert.ts` code checks for `turn-snapshot` first, falls back to old `patch`-based revert. Both paths coexist.
- **Config**: `snapshot: true` (boolean) still works. Object form is additive.

---

## Verification

### Unit tests (`test/snapshot/ghost-commit.test.ts`)

Mirror Codex's 10 test cases from `reference/codex/codex-rs/core/tests/suite/undo.rs`:

1. `undo removes new file created during turn` — agent creates a file, undo deletes it
2. `undo restores tracked file edit` — agent edits tracked file, undo restores original
3. `undo restores untracked file edit` — agent edits untracked file, undo restores original
4. `undo reverts only latest turn` — multi-turn session, undo only affects last turn
5. `undo does not touch unrelated files` — files not modified by agent are untouched
6. `undo sequential turns consumes snapshots` — undo turn 3, then undo turn 2 works
7. `undo restores moves and renames` — agent moves/renames files, undo reverses
8. `undo does not touch ignored directory contents` — node_modules etc. are not affected
9. `undo overwrites manual edits after turn` — user edits after agent turn, undo still works (user edits lost — expected behavior matching Codex)
10. `undo preserves unrelated staged changes` — user's `git add`'d files are NOT touched by undo (temp index isolation)

Each test:

1. Creates a temp git repo
2. Initializes snapshot system
3. Makes changes (simulating agent)
4. Calls `commit()` then `undo()`
5. Asserts file system state

### Integration test

After all changes:

```bash
cd Agent-backend/packages/opencode && bun test test/snapshot/ghost-commit.test.ts --timeout 30000
```

### Manual E2E test

1. Start OpenCode: `cd Agent-backend/packages/opencode && bun dev`
2. Ask agent to create a new file and edit an existing file
3. Verify `turn-snapshot` part appears in message parts (check SQLite)
4. Run revert from UI or API: `POST /:sessionID/revert`
5. Verify: new file deleted, edited file restored, user's staged changes untouched
6. Run unrevert: `POST /:sessionID/unrevert`
7. Verify: files restored to post-agent state
