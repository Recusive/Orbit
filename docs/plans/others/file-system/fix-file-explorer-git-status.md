# Fix: File Explorer Filtering & Git Source Control Stale Diffs

## Context

The user reported 5 issues in the file explorer and source control panel. After tracing the code, they reduce to **3 bugs in 3 files**:

1. `.git` and `.DS_Store` visible in file explorer — no system file exclusion filter
2. `.gitignore` not showing U/M/A badge; gitignored files not dimmed — `isGitIgnored` field dropped during `FileEntry → FileNode` conversion
3. Source control diff stats don't update when agent edits the same file twice — `setStatus()` equality check compares array **lengths** only, so the `status` reference stays stale when the same file is re-edited

Issues #3/#4 from the user (`.gitignore` missing from source control) are a 5-second polling latency, not a code bug.

---

## Changes

### File 1: `apps/agent/src/hooks/agent/handlers/file-handlers.ts`

**Bug A — System file filtering (issues #1, #2)**

Add an exclusion set above `handleFileTreeRequest`. Use case-insensitive matching for cross-platform safety (macOS/Windows are case-insensitive):

```typescript
/**
 * System entries to hide from the file explorer.
 * Stored in lowercase — matched case-insensitively for macOS/Windows.
 * Distinct from IGNORED_PATH_PATTERNS in use-tauri-file-watcher.ts (which filters change events).
 */
const EXCLUDED_ENTRY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.ds_store',
  '.spotlight-v100',
  '.trashes',
  'thumbs.db',
  'desktop.ini',
]);
```

After line 113 (`const entries = await listDirectory(targetPath, true)`), filter:

```typescript
const filteredEntries = entries.filter(
  (entry: FileEntry) => !EXCLUDED_ENTRY_NAMES.has(entry.name.toLowerCase())
);
```

Then use `filteredEntries` instead of `entries` in the `.map()` below.

**Bug B — Pass `isGitIgnored` to FileNode (issues #3 partial)**

In the `.map()` at line 116, add the missing field:

```typescript
const children = filteredEntries.map((entry: FileEntry) => ({
  name: entry.name,
  path: entry.path,
  isDirectory: entry.isDir,
  isFile: !entry.isDir,
  isSymlink: entry.isSymlink,
  isGitIgnored: entry.isGitIgnored, // ← ADD
}));
```

The schema (`FileNodeSchema` at `protocol.ts:1378`) already declares `isGitIgnored: z.boolean().optional()`. The consumer (`file-explorer.tsx:496`) already reads `node.isGitIgnored` for opacity styling. This completes the data pipeline.

---

### File 2: `apps/agent/src/stores/git/git-store.ts`

**Bug C (root cause) — Fix `setStatus` equality check**

The current equality check at lines 101-114 only compares array **lengths**. This means:

- Same file re-edited → lengths unchanged → `status` reference stays stale → all consumers (file explorer badges, source control diffs) miss the update
- File swap (`a.ts` stops modified, `b.ts` starts) → lengths unchanged → badges and diffs stale

Fix: replace length-only comparison with a canonicalized signature-based approach that compares entry identity. Signatures are **sorted** to prevent oscillation if backend ordering varies between polls:

```typescript
/** Compute a stable, order-independent fingerprint for a status entry list */
function listSignature(entries: readonly StatusEntry[]): string {
  if (entries.length === 0) return '';
  return entries
    .map((e) => `${e.path}\0${e.status}\0${e.oldPath ?? ''}\0${String(e.similarity ?? '')}`)
    .sort()
    .join('\x01');
}

// Inside setStatus, replace the existing unchanged check:
const unchanged =
  prev.branch === status.branch &&
  prev.ahead === status.ahead &&
  prev.behind === status.behind &&
  listSignature(prev.staged) === listSignature(status.staged) &&
  listSignature(prev.modified) === listSignature(status.modified) &&
  listSignature(prev.untracked) === listSignature(status.untracked) &&
  listSignature(prev.conflicted) === listSignature(status.conflicted);
```

This fixes staleness for ALL consumers at the source, not just one hook.

---

### File 3: `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

**Bug C (downstream) — Use `lastUpdated` as diff-fetch trigger**

Two-layer defense:

- **Store signature** (File 2) handles path/status churn — ensures `status` reference updates when files change, swap, or get new statuses
- **`lastUpdated` trigger** (this file) handles diff-content churn — re-fetches diffs when the same file is re-edited (same path, same status, different line changes)

Fix: subscribe to `lastUpdated` and use it as an additional diff-fetch trigger. Keep `status` guard for transient states:

Near line 125, add:

```typescript
const lastUpdated = useGitStore((s) => s.lastUpdated);
```

Change the diff-fetch effect (lines 167-171) to:

```typescript
useEffect(() => {
  if (!repoPath || !status) return;
  void fetchDiffs();
}, [lastUpdated, repoPath, status, fetchDiffs]);
```

This re-fetches diffs every poll cycle (5s) when the source control panel is open. `gitDiffStructured` is a fast libgit2 disk operation, so this is acceptable.

---

## Files Modified (3 total)

| File                                                                       | Changes                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/agent/src/hooks/agent/handlers/file-handlers.ts`                     | Add `EXCLUDED_ENTRY_NAMES` set with case-insensitive matching, filter entries, pass `isGitIgnored` |
| `apps/agent/src/stores/git/git-store.ts`                                   | Replace length-only equality in `setStatus` with signature-based comparison                        |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` | Subscribe to `lastUpdated`, use as diff-fetch trigger (with `status` guard)                        |

## Files Referenced (read-only)

- `crates/common/fs/src/lib.rs` — Rust `list_directory` with `show_hidden` flag
- `apps/agent/src/components/files/file-explorer.tsx` — `node.isGitIgnored` usage at line 496
- `apps/agent/src/types/protocol/protocol.ts` — `FileNodeSchema` with `isGitIgnored` field
- `apps/agent/src/hooks/agent/use-tauri-file-watcher.ts` — `IGNORED_PATH_PATTERNS` reference
- `apps/agent/src/lib/api/files.ts` — Frontend `FileEntry` type with `isGitIgnored`

---

## Verification

### Manual Testing

1. **File explorer filtering**: Open a project → `.git` and `.DS_Store` should NOT appear. `.gitignore`, `.env`, `.eslintrc`, `.github/` should still appear.
2. **Gitignored opacity**: Files matched by `.gitignore` (e.g., `node_modules/`, `dist/`) render at 50% opacity with "(gitignored)" tooltip.
3. **Git status badges**: Create or modify a file → within 5 seconds, U/M/A badge appears in file explorer.
4. **Diff stats update**: Open source control → edit an already-modified file → within 5 seconds, the +/- counts in the DiffFileCard header update.
5. **File swap detection**: Stage one file, unstage another (same count) → source control updates to show the new file.

### Automated Tests

6. **`bun run check`** passes (typecheck + lint + tests).
7. **Git store test** (`apps/agent/src/__tests__/unit/stores/git/git-store.test.ts`): `setStatus` with same-length but different-path entries triggers state update (not early-return). Also test that reordered entries with identical content do NOT trigger update (canonical sort).
8. **File handler test** (`apps/agent/src/__tests__/unit/hooks/agent/file-handlers.test.ts` — new file): `handleFileTreeRequest` response excludes `.git`/`.DS_Store` and includes `isGitIgnored` on returned nodes.

---

## Audit Response

Incorporated all critical and recommended changes from `reviews/audit-plan.md`:

| Audit Finding                                                                        | Resolution                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Critical #1 (v1)**: Fix equality in `setStatus`, not just one consumer             | Added signature-based comparison in `git-store.ts` (File 2)                |
| **Critical #1 (v2)**: Canonicalize signatures (sort) to prevent ordering oscillation | Added `.sort()` to `listSignature`, included `similarity` field            |
| **Critical #2**: Missing automated tests                                             | Added test requirements with explicit file targets in verification section |
| **Recommended #1**: Keep `status` guard in effect                                    | Effect now guards with `if (!repoPath \|\| !status) return`                |
| **Recommended #3**: Case-insensitive exclusion matching                              | `EXCLUDED_ENTRY_NAMES` stores lowercase, matches via `.toLowerCase()`      |
| Edge case: file swap with equal counts                                               | Signature comparison catches path/status changes                           |
| Edge case: rename/copy churn                                                         | Signature includes `oldPath` + `similarity`, catches renames               |
| **Recommended #2 (v2)**: Name explicit test file targets                             | Added file paths to test section                                           |
| **Recommended #1 (v2)**: Clarify two-layer defense narrative                         | Added explanation in File 3 section                                        |
| **Recommended (v3)**: Centralize exclusion patterns                                  | See Follow-up section below                                                |
| **Recommended (v3)**: Debug instrumentation for diff fetch                           | See Follow-up section below                                                |

---

## Follow-up (post-merge)

These are non-blocking improvements flagged by audit. Do after the core fix lands.

### 1. Centralize exclusion patterns

Exclusion rules are currently duplicated:

- `use-tauri-file-watcher.ts` → `IGNORED_PATH_PATTERNS` (path segments like `/.git/`, `/.DS_Store`)
- `file-handlers.ts` → `EXCLUDED_ENTRY_NAMES` (exact file/dir names like `.git`, `.DS_Store`)

These serve different purposes (path-segment matching for change events vs. name matching for directory listings), but share the same intent. Extract a shared module:

**File**: `apps/agent/src/lib/utils/system-files.ts` (new)

```typescript
/**
 * System file/directory names that should be hidden from the user.
 * Stored lowercase for case-insensitive matching on macOS/Windows.
 *
 * Used by:
 * - file-handlers.ts (directory listing filter)
 * - use-tauri-file-watcher.ts (file change event filter)
 */
export const SYSTEM_ENTRY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.ds_store',
  '.spotlight-v100',
  '.trashes',
  'thumbs.db',
  'desktop.ini',
]);

/** Check if an entry name is a system file (case-insensitive) */
export function isSystemEntry(name: string): boolean {
  return SYSTEM_ENTRY_NAMES.has(name.toLowerCase());
}
```

Then update both consumers to import from the shared module instead of maintaining their own lists. The file watcher's `IGNORED_PATH_PATTERNS` has additional path-segment patterns (like `/node_modules/`, `/dist/`) that are NOT system files — those stay in the watcher.

### 2. Debug instrumentation for diff fetch timing

Add lightweight debug logging in `use-source-control.ts` to track diff fetch cost. This helps detect performance issues in large repos without adding production overhead:

In `fetchDiffs()`:

```typescript
const fetchDiffs = useCallback(async (): Promise<void> => {
  const repo = useGitStore.getState().repoPath;
  if (!repo) return;
  try {
    const start = performance.now();
    const [staged, unstaged] = await Promise.all([gitStagedDiff(repo), gitDiffStructured(repo)]);
    logger.debug('Diff fetch completed', {
      durationMs: Math.round(performance.now() - start),
      stagedFiles: staged.length,
      unstagedFiles: unstaged.length,
    });
    setStagedDiffs(staged);
    setUnstagedDiffs(unstaged);
  } catch (error: unknown) {
    logger.debug('Failed to fetch diffs', { error });
  }
}, []);
```

This uses the existing `createLogger('useSourceControl')` — debug level only, so it won't appear in production unless explicitly enabled.
