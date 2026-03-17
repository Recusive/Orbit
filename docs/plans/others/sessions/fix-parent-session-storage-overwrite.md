# Fix: Parent session storage overwrite after fork/rewind

## Context

After rewinding a conversation (which internally calls `forkSessionAt`), the user gets rerouted to the forked session when they navigate back to the original (parent) session. The forked session also shows duplicated messages.

**Trigger scenario**: User opens old session → rewinds → sends messages in forked session → navigates back to original session → sends message → gets yanked to forked session.

## Root Cause

`forkSessionAt` in `session-manager.ts` reuses the same `sessionId` for the fork child:

```
forkSessionAt('f275658a', messageUuid)
  → deleteSession('f275658a')         // in-memory cleanup only
  → createSession('f275658a', { resumeSessionId: intermediate, forkSession: true })
```

When the fork's `system:init` fires in the background consumer:

```
orbitSessionId = 'f275658a'   // captured before rekey
sdkSessionId = '0efc7ca1'    // new SDK ID for the fork
→ saveSession({ sessionId: 'f275658a', sdkSessionId: '0efc7ca1' })
```

This **overwrites** the parent's existing entry `{ sessionId: 'f275658a', sdkSessionId: 'f275658a' }` in `orbit-sessions.json`.

Later, when the user navigates to the parent session (visible in sidebar because original JSONL is preserved — non-destructive fork):

```
ensureSession('f275658a')
  → agentGetStoredSession('f275658a')
  → getSDKSessionIdForSession('f275658a')  →  returns '0efc7ca1'  ← WRONG! Should be 'f275658a'
  → config.resumeSessionId = '0efc7ca1'    ← Resumes from FORK's JSONL!
  → system:init: sdkSessionId = '0efc7ca1'
  → remapSession('f275658a', '0efc7ca1')   ← User yanked to forked session
```

The duplicate key React error happens because the sidebar now has two entries with ID `0efc7ca1`.

## Implementation

Four changes across three files, plus three test files.

### Change 1 — P1-2: Collision-aware `saveSessionInitMapping`

**File: `agent-bridge/src/agent/session/session-storage.ts`**

Add a new exported function `saveSessionInitMapping()` that replaces the direct `saveSession()` call in `onSessionInit`. It detects when a fork init would overwrite an existing parent entry and self-maps the fork instead.

Also add private helpers `upsertBySessionId()` and `makeRecord()`.

```typescript
// ============================================
// Collision-aware session init persistence (P1-2)
// ============================================

interface SessionInitPersistenceEvent {
  sessionId: string;
  sdkSessionId: string;
  isForked: boolean;
}

function upsertBySessionId(sessions: StoredSession[], record: StoredSession): void {
  const idx = sessions.findIndex((s) => s.sessionId === record.sessionId);
  if (idx >= 0) {
    sessions[idx] = record;
  } else {
    sessions.push(record);
  }
}

function makeRecord(
  existing: StoredSession | undefined,
  sessionId: string,
  sdkSessionId: string,
  now: number
): StoredSession {
  return {
    sessionId,
    sdkSessionId,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
    workspacePath: existing?.workspacePath,
    displayName: existing?.displayName,
  };
}

/**
 * Collision-aware persistence for session:init events.
 *
 * When a fork's system:init fires with the parent's orbit ID as sessionId,
 * a naive saveSession() would overwrite the parent's storage entry. This function
 * detects the collision and self-maps the fork under its SDK ID instead, preserving
 * the parent's entry.
 *
 * For non-colliding inits (new sessions, keepAlive forks with unique orbit IDs),
 * the default orbit-key mapping is preserved.
 */
export function saveSessionInitMapping(event: SessionInitPersistenceEvent): void {
  const sessions = getSessions();
  const now = Date.now();

  const existingOrbit = sessions.find((s) => s.sessionId === event.sessionId);
  const existingSdk = sessions.find((s) => s.sessionId === event.sdkSessionId);

  // Also check: is event.sessionId someone else's sdkSessionId?
  // This catches the "resumed parent → fork" case where the parent entry has
  // sessionId: 'f275658a' but sdkSessionId: '9541b1e0', and the fork fires
  // with sessionId '9541b1e0' (the rekeyed ID). Without this, existingOrbit
  // is undefined (no entry has sessionId === '9541b1e0'), collision detection
  // fails, and the default path creates { 9541b1e0 → 0efc7ca1 } — a shadow
  // entry that overwrites the parent's SDK ID on lookup.
  const existingBySdk = !existingOrbit
    ? sessions.find((s) => s.sdkSessionId === event.sessionId)
    : undefined;

  const wouldOverwriteExistingOrbitMapping =
    event.isForked &&
    existingOrbit !== undefined &&
    existingOrbit.sdkSessionId !== event.sdkSessionId;

  // Resumed parent collision: event.sessionId matches an existing entry's
  // sdkSessionId but not its sessionId. Creating a new entry keyed by
  // event.sessionId would shadow the parent's sdkSessionId on lookup via
  // getSDKSessionIdForSession's dual-key fallback.
  const wouldCreateShadowEntry = event.isForked && !existingOrbit && existingBySdk !== undefined;

  if (wouldOverwriteExistingOrbitMapping || wouldCreateShadowEntry) {
    // Collision path: preserve parent, add fork self-map only.
    //
    // Touch parent's lastActiveAt so it survives MAX_SESSIONS eviction.
    // Without this, a fork on an old parent could push the parent below
    // the eviction threshold — the fork self-map entry (with lastActiveAt=now)
    // and the new record together exceed MAX_SESSIONS, and persistSessions
    // sorts by lastActiveAt desc → old parent gets pruned → lookup breaks.
    const parentEntry = existingOrbit ?? existingBySdk;
    if (parentEntry) {
      parentEntry.lastActiveAt = now;
    }

    upsertBySessionId(
      sessions,
      makeRecord(existingSdk, event.sdkSessionId, event.sdkSessionId, now)
    );
    persistSessions(sessions);
    return;
  }

  // Default path: preserve caller-visible key (orbit ID) for non-colliding init events.
  upsertBySessionId(sessions, makeRecord(existingOrbit, event.sessionId, event.sdkSessionId, now));

  // Also persist sdk self-map for resilient sdk-key lookups after rekey/remap.
  if (event.isForked) {
    upsertBySessionId(
      sessions,
      makeRecord(existingSdk, event.sdkSessionId, event.sdkSessionId, now)
    );
  }

  persistSessions(sessions);
}
```

### Change 2 — P1-1: One-time startup migration for corrupted storage

**File: `agent-bridge/src/agent/session/session-storage.ts`**

Add `hasJsonlForSessionId()` and `repairOverwrittenParentMappings()`. Call repair from `loadSessionsFromDisk()`, **gated by a one-time flag** so it runs exactly once.

**Legacy corruption shape**: The original bug produces `{ parent → fork }` with NO separate `{ fork → fork }` entry — `saveSession` just overwrites the parent entry in-place. A repair heuristic that requires the fork's self-map entry to exist would miss this exact case.

**Repair criteria** — only repair when BOTH conditions are met:

1. `sessionId !== sdkSessionId` (it's an alias, not self-mapped)
2. `hasJsonlForSessionId(sessionId)` (parent JSONL exists on disk — proves `sessionId` was once a real SDK session ID, i.e., it was self-mapped before the overwrite)

**Why one-time gating is critical**: Conditions 1+2 also match legitimate resume aliases (`{ f275658a → 9541b1e0 }` where `f275658a.jsonl` exists from the original session). If the repair runs on every startup, it would cyclically reset resume aliases: user resumes a session → P1-2 stores `{ f275658a → 3a4b5c6d }` → next startup repair resets to `{ f275658a → f275658a }` → user loses continuation context → resumes again → cycle repeats. Gating to a one-time migration fixes pre-existing corruption without disturbing future resume aliases.

The alternative — requiring a third condition to distinguish fork corruption from resume aliases — is not possible with storage data alone (both look structurally identical). The one-time gate sidesteps this ambiguity entirely: it repairs what exists at deploy time and trusts P1-2 to prevent future corruption.

```typescript
// ============================================
// One-time repair flag
// ============================================

const REPAIR_V1_FLAG = '.orbit-sessions-repaired-v1';

/**
 * Check whether the one-time repair has already run.
 *
 * Uses a simple flag file existence check. No mtime or content comparison —
 * normal app writes to orbit-sessions.json (saveSessionInitMapping,
 * touchSession, etc.) update its mtime on every session activity, which
 * would invalidate any mtime-based staleness check and re-run repair on
 * every startup, defeating the one-time gate.
 *
 * Trade-off: if a user manually restores orbit-sessions.json from a
 * corrupted backup while the flag exists, repair won't re-run automatically.
 * They must also delete the flag file. This is acceptable — manual file
 * manipulation is an unsupported power-user scenario.
 */
function hasRepairRun(): boolean {
  try {
    return fs.existsSync(path.join(getStorageDir(), REPAIR_V1_FLAG));
  } catch {
    // If we can't check the flag (permissions, I/O error), treat as
    // not-yet-repaired to be safe — repair will re-run (idempotent).
    return false;
  }
}

/**
 * Mark the one-time repair as complete.
 *
 * Writes a zero-byte sentinel file. The flag means "this installation
 * has been checked for pre-P1-2 corruption", not "repairs were applied".
 */
function markRepairComplete(): boolean {
  try {
    ensureStorageDir();
    fs.writeFileSync(path.join(getStorageDir(), REPAIR_V1_FLAG), '', 'utf-8');
    return true;
  } catch (error) {
    logger.warn({ error }, 'Failed to write repair flag file');
    return false;
  }
}

// ============================================
// JSONL existence check (for repair heuristic)
// ============================================

// ============================================
// persistSessions return-value hardening
// ============================================
// Change existing persistSessions() signature from `void` to `boolean`:
//   function persistSessions(sessions: StoredSession[]): boolean
// Return `true` on success, `false` on caught write error.
// Existing callers ignore the return value (fire-and-forget), so this is
// backwards-compatible. Only the repair integration path checks it.

// NOTE: Scans all subdirectories under ~/.claude/projects/ for a matching JSONL.
// Cost is O(entries × dirs) but only runs once per installation (gated by repair flag).
//
// Returns { found, scanError }:
//   - found: true if a matching JSONL was found in any project directory
//   - scanError: true if any directory couldn't be read (I/O, permissions)
//
// Why scanError matters: if we can't read a directory, we might miss a JSONL
// that proves an entry is corrupted. The caller must NOT write the repair flag
// when scanErrors occurred — otherwise corruption becomes permanently unrepairable.
function hasJsonlForSessionId(sessionId: string): { found: boolean; scanError: boolean } {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return { found: false, scanError: false };
  }

  let scanError = false;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const jsonlPath = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
        if (fs.existsSync(jsonlPath)) {
          return { found: true, scanError: false };
        }
      } catch (error) {
        logger.warn(
          { error, sessionId, dir: dir.name },
          'Failed to check JSONL in project directory during repair'
        );
        scanError = true;
        // Continue scanning other directories — a partial scan is better than none
      }
    }
  } catch (error) {
    logger.warn({ error, sessionId }, 'Failed to read projects directory listing during repair');
    return { found: false, scanError: true };
  }

  return { found: false, scanError };
}

// ============================================
// One-time startup migration (P1-1)
// ============================================

interface RepairResult {
  /** Repaired sessions array (same reference, mutated in-place), or null if nothing was repaired */
  sessions: StoredSession[] | null;
  /** Number of entries that were repaired */
  repairedCount: number;
  /** True if any JSONL scan encountered I/O errors — flag must NOT be written */
  hadScanFailures: boolean;
}

function repairOverwrittenParentMappings(sessions: StoredSession[]): RepairResult {
  let repairedCount = 0;
  let hadScanFailures = false;

  for (const session of sessions) {
    // Skip self-mapped entries (already correct)
    if (session.sessionId === session.sdkSessionId) continue;

    // Parent JSONL must exist on disk — proves sessionId was once a valid SDK session ID
    const { found, scanError } = hasJsonlForSessionId(session.sessionId);

    if (scanError) {
      hadScanFailures = true;
      // Don't skip this entry — if found is true despite scan errors in
      // other directories, we can still repair. Only skip if not found.
    }

    if (!found) continue;

    // Restore self-mapping
    session.sdkSessionId = session.sessionId;
    session.lastActiveAt = Date.now();
    repairedCount += 1;
  }

  if (repairedCount > 0) {
    logger.warn({ repairedCount }, 'Repaired overwritten parent session mappings in storage');
  }

  if (hadScanFailures) {
    logger.warn(
      {
        repairedCount,
        totalCandidates: sessions.filter((s) => s.sessionId !== s.sdkSessionId).length,
      },
      'JSONL scan had I/O failures — some candidates may have been skipped, repair flag will NOT be written'
    );
  }

  return {
    sessions: repairedCount > 0 ? sessions : null,
    repairedCount,
    hadScanFailures,
  };
}
```

Update `loadSessionsFromDisk()` — after Zod parse + version check, before returning:

```typescript
// One-time migration: repair storage corrupted before the P1-2 fix.
// Gated by a flag file so it runs exactly once per installation.
// Without the gate, the repair would cyclically reset legitimate resume
// aliases on every startup (resume creates { A → B }, repair resets to
// { A → A }, next resume creates { A → C }, repair resets again...).
if (!hasRepairRun()) {
  const result = repairOverwrittenParentMappings(parsed.sessions);
  const sessions = result.sessions ?? parsed.sessions;

  // Only mark repair complete when ALL three conditions are met:
  //   1. Repaired data was successfully persisted (or no repairs needed)
  //   2. No JSONL scan failures occurred (could have skipped candidates)
  //   3. Flag write itself succeeds (checked by markRepairComplete)
  //
  // If any condition fails, leave flag unset so next startup retries.
  const persisted = result.sessions !== null ? persistSessions(sessions) : true;

  if (!persisted) {
    logger.warn(
      'Skipping repair flag — repaired sessions were not persisted, will retry next startup'
    );
  } else if (result.hadScanFailures) {
    logger.warn(
      'Skipping repair flag — JSONL scan had I/O failures, candidates may have been skipped'
    );
  } else {
    const flagWritten = markRepairComplete();
    if (!flagWritten) {
      // Surface the flag path so the user/operator can fix permissions.
      // Without this, the only signal is the generic warn inside markRepairComplete().
      logger.warn(
        { flagPath: path.join(getStorageDir(), REPAIR_V1_FLAG) },
        'Repair completed but flag could not be written — repair will re-run on every startup until this path is writable'
      );
    }
  }

  logger.info(
    { count: sessions.length, repaired: result.repairedCount },
    'Loaded sessions from storage (initial load, repair pass)'
  );
  return sessions;
}

logger.info({ count: parsed.sessions.length }, 'Loaded sessions from storage (initial load)');
return parsed.sessions;
```

**Key design decisions**:

- `repairOverwrittenParentMappings` mutates in-place and returns `{ sessions: null, ... }` when nothing was repaired. This avoids spurious disk writes.
- The flag file (`.orbit-sessions-repaired-v1`) is separate from `orbit-sessions.json` to avoid schema changes. It's a zero-byte sentinel — no mtime or content comparison, because normal app writes to the sessions file would invalidate any such check and break the one-time gate.
- `markRepairComplete()` is called even when no repairs were needed — the flag means "this installation has been checked", not "repairs were applied". Prevents re-scanning on every startup for clean installations.
- **Atomicity**: `markRepairComplete()` is only called after `persistSessions()` succeeds. If session persistence fails but the flag write would succeed, legacy corruption would become permanently unrepairable. Linking flag creation to persistence success ensures repair retries on next startup.
- **Scan failure isolation**: `hasJsonlForSessionId` catches errors per-directory, not per-call. A single unreadable project directory doesn't abort the full scan — other directories are still checked. The `hadScanFailures` flag is aggregated and prevents the repair flag from being written, so missed candidates are re-evaluated on next startup.
- **Idempotent repair**: The function is safe to re-run on already-repaired data. Self-mapped entries are skipped by the `sessionId === sdkSessionId` guard, producing zero repairs and identical output. This makes edge cases 1 (flag write failure) and 2 (concurrent processes) safe without additional guards.

### Change 3 — Update `onSessionInit` caller

**File: `agent-bridge/src/index.ts` (~line 154)**

**Before:**

```typescript
sessionManager.onSessionInit((event) => {
  // ...logging...
  saveSession({
    sessionId: event.sessionId,
    sdkSessionId: event.sdkSessionId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  });
  sendEvent({ type: 'session_init', event });
});
```

**After:**

```typescript
sessionManager.onSessionInit((event) => {
  // ...logging...
  saveSessionInitMapping({
    sessionId: event.sessionId,
    sdkSessionId: event.sdkSessionId,
    isForked: event.isForked,
  });
  sendEvent({ type: 'session_init', event });
});
```

Import change: `saveSession` → `saveSessionInitMapping` from `./agent/session/session-storage.js`.

### Change 4 — Update barrel export + deprecate `saveSession`

**File: `agent-bridge/src/agent/session/index.ts`**

Add `saveSessionInitMapping` to the barrel export so it's available to any future consumer.

```typescript
export {
  saveSession, // @deprecated — use saveSessionInitMapping for init events
  saveSessionInitMapping,
  getSDKSessionIdForSession,
  touchSession,
  deleteSession,
  cleanupOldSessions,
} from './session-storage.js';
```

Add a JSDoc `@deprecated` tag to `saveSession` in `session-storage.ts` to prevent accidental reuse:

```typescript
/**
 * Save or update a single session.
 *
 * @deprecated Use `saveSessionInitMapping` for session:init events.
 * Direct `saveSession` does not detect fork collisions and can overwrite
 * parent entries. Only retained for non-init callers (if any).
 */
export function saveSession(session: StoredSession): void {
```

### Why this works

| Session | Before fix (orbit-sessions.json) | After fix (orbit-sessions.json)   |
| ------- | -------------------------------- | --------------------------------- |
| Parent  | `f275658a → 0efc7ca1` (WRONG)    | `f275658a → f275658a` (preserved) |
| Fork    | (overwrote parent)               | `0efc7ca1 → 0efc7ca1` (own entry) |

- **Parent session**: `getSDKSessionIdForSession('f275658a')` → returns `'f275658a'` → resumes from original JSONL
- **Fork session**: `getSDKSessionIdForSession('0efc7ca1')` → returns `'0efc7ca1'` → resumes from fork JSONL
- **App restart**: Both entries survive, each pointing to the correct JSONL
- **Multi-fork chains**: Each fork gets its own `{ sessionId: sdkId, sdkSessionId: sdkId }` entry — no collisions
- **Non-rewind forks** (`fork_session` keepAlive path with unique orbit IDs): orbit-key mapping preserved as before
- **Already-corrupted storage**: Repaired on first startup after patch (one-time migration gated by flag file), persisted to disk

### Edge case: resumed parent (IDs already differ)

If the parent was itself a resume (`sessionId: 'f275658a', sdkSessionId: '9541b1e0'`) and the fork uses the re-keyed ID (`forkSessionAt('9541b1e0', ...)`):

- Without fix: `saveSession({ sessionId: '9541b1e0', sdkSessionId: '0efc7ca1' })` → creates entry linking `9541b1e0` to `0efc7ca1`. `getSDKSessionIdForSession('9541b1e0')` returns `'0efc7ca1'` instead of `'9541b1e0'` → user yanked to fork.
- With fix (P1-2): `existingOrbit` is `undefined` (no entry has `sessionId === '9541b1e0'`), but `existingBySdk` finds `{ f275658a → 9541b1e0 }` → `wouldCreateShadowEntry` is true → collision path takes effect → adds `{ 0efc7ca1 → 0efc7ca1 }` only → no shadow entry for `9541b1e0`.
- `9541b1e0` sidebar entry: `getSDKSessionIdForSession('9541b1e0')` → primary lookup fails (no `sessionId === '9541b1e0'`), fallback finds `{ sdkSessionId: '9541b1e0' }` in parent's entry → returns `'9541b1e0'` → correct.

### Edge case: legitimate resume alias (P1-1 trade-off)

`{ sessionId: 'f275658a', sdkSessionId: '9541b1e0' }` with `f275658a.jsonl` on disk:

- Condition 1: `f275658a !== 9541b1e0` → true
- Condition 2: `hasJsonlForSessionId('f275658a')` → true
- Result: Repaired to `{ f275658a → f275658a }` (false positive)
- Impact: Next open resumes from `f275658a.jsonl` instead of `9541b1e0.jsonl`. No data loss — `9541b1e0.jsonl` remains as a separate sidebar entry. One-time disruption at deploy time.

This is the known trade-off. Cannot distinguish from fork corruption with storage data alone — both produce the same `{ A → B }` + `A.jsonl exists` shape. The one-time repair gate ensures this disruption happens only once per installation (at deploy time), not on every restart. Accepted because the false-positive damage (one-time session state reset, all data preserved) is far less than missed-repair damage (permanent fork-yanking, duplicate key errors).

### Edge case mitigations

Five edge cases surfaced during audit review. Each is now addressed:

| #   | Edge case                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Safety guarantee                                                                                        |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Repair flag write fails → repair reruns next startup                       | **Idempotent by design + actionable logging.** Repairing an already-self-mapped entry (`sessionId === sdkSessionId`) is a no-op — the `if` guard skips it. Re-running repair produces identical results. When `markRepairComplete()` fails, a warn-level log includes the flag file path so the user/operator can fix permissions. Overhead: one O(entries × dirs) scan per startup until the path is writable. Bounded by MAX_SESSIONS (50) × project directory count.                                                    | Safe — no data corruption. Operator can resolve by fixing write permissions on the logged path.         |
| 2   | Two bridge processes run first-boot repair concurrently                    | **Last-write-wins is safe due to idempotency.** Both processes compute identical repair results (same input → same output). Last-write-wins produces the correct file regardless of ordering. The flag may be written twice (harmless). Concurrent `persistSessions` calls can interleave, but since both write the same sorted content, the result is correct. A debug-level log in `persistSessions` when a stale-read is detected (entry count differs from cached) provides observability.                             | Safe — pre-existing single-file storage limitation. No new risk introduced.                             |
| 3   | MAX_SESSIONS overflow during fork double-upsert                            | **Parent entry touched in collision path.** When a fork collision is detected, the parent's `lastActiveAt` is updated to `now` before persisting. This prevents `persistSessions`'s stale-first eviction from pruning the parent entry. The fork self-map also has `lastActiveAt=now`, so both survive. Only entries older than both parent and fork are candidates for eviction.                                                                                                                                          | Safe — parent is never evicted by its own fork.                                                         |
| 4   | `~/.claude/projects` scan failures skip repair candidates                  | **Scan failure tracking prevents premature flag write.** `hasJsonlForSessionId` returns `{ found, scanError }`. `repairOverwrittenParentMappings` aggregates `hadScanFailures`. When true, `loadSessionsFromDisk` skips `markRepairComplete()` so the next startup retries the full scan. Partial repairs ARE applied (candidates with successful scans), but the flag is deferred until a clean run.                                                                                                                      | Safe — corruption candidates are never permanently skipped.                                             |
| 5   | Manual tampering: `orbit-sessions.json` restored while repair flag remains | **Accepted as unsupported scenario + discoverable recovery.** Mtime-based staleness detection was evaluated and rejected — normal app writes break the one-time gate. Manual file restoration requires also deleting the flag file. The flag path is logged at warn-level when repair runs and flag write fails, and the flag filename (`.orbit-sessions-repaired-v1`) is documented in the verification steps. A future troubleshooting entry in `agent-bridge/CLAUDE.md` will reference this file for support scenarios. | Accepted trade-off — manual file manipulation is a power-user scenario with a documented recovery path. |

## Tests

### Test file 1: `agent-bridge/src/__tests__/session-storage-migration.test.ts`

P1-1 regression tests — one-time startup migration for corrupted storage.

```typescript
// Test 1: Legacy corruption without fork self-map IS repaired
it('should repair overwritten parent mapping (no fork self-map entry)', () => {
  // Storage: { parent-id → fork-id } (single entry, no { fork-id → fork-id })
  // Disk: parent-id.jsonl exists, no repair flag
  // Conditions 1+2 met → repair to { parent-id → parent-id }
  // Assert: getSDKSessionIdForSession('parent-id') === 'parent-id'
});

// Test 2: Corruption WITH fork self-map also repaired
it('should repair overwritten parent mapping when fork self-map entry also exists', () => {
  // Storage: { parent-id → fork-id } + { fork-id → fork-id }
  // Disk: parent-id.jsonl exists, no repair flag
  // Assert: getSDKSessionIdForSession('parent-id') === 'parent-id'
  // Assert: getSDKSessionIdForSession('fork-id') === 'fork-id' (untouched)
});

// Test 3: Self-mapped entries are NOT touched
it('should NOT repair entries that are already self-mapped', () => {
  // Storage: { session-id → session-id }
  // Disk: session-id.jsonl exists, no repair flag
  // Condition 1 fails (sessionId === sdkSessionId) → skipped
  // Assert: getSDKSessionIdForSession('session-id') === 'session-id'
});

// Test 4: Entries without JSONL on disk are NOT repaired
it('should NOT repair alias when sessionId has no JSONL on disk', () => {
  // Storage: { orbit-id → sdk-id } (orbit-id.jsonl does NOT exist), no repair flag
  // Condition 2 fails → skipped
  // Assert: getSDKSessionIdForSession('orbit-id') === 'sdk-id'
});

// Test 5: Repair persists to disk so reload stays correct
it('should persist repaired mapping so reload stays correct', () => {
  // Setup corrupted entry + repair + invalidateCache + re-read
  // Assert: persisted file shows repaired sdkSessionId
});

// Test 6: No spurious disk write when nothing repaired
it('should NOT write to disk when no repairs are needed', () => {
  // Setup: only self-mapped entries, no corruption, no repair flag
  // Assert: file mtime unchanged after loadSessionsFromDisk
  // Assert: repair flag IS created (marks as checked)
});

// Test 7: Repair does NOT run when flag file already exists
it('should skip repair entirely when repair flag exists', () => {
  // Setup: corrupted entry + repair flag already present
  // Assert: corruption is NOT repaired (flag prevents re-scan)
  // Assert: getSDKSessionIdForSession('parent-id') === 'fork-id' (unchanged)
});

// Test 8: Repair flag prevents resume alias cycle
it('should not reset legitimate resume aliases on subsequent startups', () => {
  // Setup: { f275658a → 9541b1e0 } with f275658a.jsonl on disk + repair flag exists
  // Assert: getSDKSessionIdForSession('f275658a') === '9541b1e0' (preserved)
});

// Test 9: Persist failure prevents repair flag write (retry on next startup)
it('should NOT mark repair complete when persistSessions fails', () => {
  // Setup: corrupted entry, no repair flag, make storage dir read-only (or mock writeFileSync to throw on sessions file)
  // Call: loadSessionsFromDisk() — triggers repair pass
  // Assert: in-memory sessions ARE repaired (cache is correct for this process)
  // Assert: repair flag does NOT exist on disk
  // Teardown: restore write permissions
  // Call: invalidateCache() + loadSessionsFromDisk() — simulates next startup
  // Assert: repair runs again (flag wasn't written, so it retries)
});

// Test 10: Scan failure prevents repair flag write (retry on next startup)
it('should NOT mark repair complete when JSONL scan has I/O failures', () => {
  // Setup: corrupted entry { parent → fork }, no repair flag
  //        Make one project directory unreadable (chmod 000 or mock readdirSync to throw for one dir)
  // Call: loadSessionsFromDisk() — triggers repair pass
  // Assert: any entries with successful scans ARE repaired (partial repair applied)
  // Assert: repair flag does NOT exist on disk (hadScanFailures = true)
  // Teardown: restore permissions
  // Call: invalidateCache() + loadSessionsFromDisk() — simulates next startup
  // Assert: repair runs again (full scan this time, flag written on success)
});

// Test 11: Flag existence check is resilient to I/O errors
it('should treat flag check I/O errors as not-yet-repaired', () => {
  // Setup: storage directory is unreadable (chmod 000 on parent)
  // Call: loadSessionsFromDisk() → hasRepairRun() catch path returns false
  // Assert: repair runs (catch path does NOT fall through to return true)
  // Teardown: restore permissions
});

// Test 12: Normal app writes don't break one-time gate
it('should NOT re-run repair after normal saveSessionInitMapping calls', () => {
  // Setup: corrupted entry repaired on first load, flag written
  // Call: saveSessionInitMapping (simulates normal app activity) — updates sessions file
  // Call: invalidateCache() + loadSessionsFromDisk() — simulates next startup
  // Assert: repair does NOT re-run (flag still exists, one-time gate holds)
  // Assert: session mappings from saveSessionInitMapping are preserved (not reset)
});

// Test 13: Repair idempotency — re-run on already-repaired data is a no-op
it('should produce identical results when repair runs on already-repaired data', () => {
  // Setup: all entries self-mapped, no repair flag
  // Call: loadSessionsFromDisk() — triggers repair pass
  // Assert: zero repairs applied (repairedCount === 0)
  // Assert: repair flag IS written (marks as checked)
  // Assert: sessions unchanged
});
```

### Test file 2: `agent-bridge/src/__tests__/session-storage-init-mapping.test.ts`

P1-2 regression tests — collision-aware persistence.

```typescript
// Test 1: Fork collision → preserve parent, add fork self-map
it('should preserve parent mapping and add fork self-map on collision', () => {
  // Setup: parent { parent-session → parent-session } exists
  // Call: saveSessionInitMapping({ sessionId: 'parent-session', sdkSessionId: 'fork-session', isForked: true })
  // Assert: getSDKSessionIdForSession('parent-session') === 'parent-session'
  // Assert: getSDKSessionIdForSession('fork-session') === 'fork-session'
});

// Test 2: Non-colliding keepAlive fork → preserve orbit-key mapping
it('should retain orbit->sdk mapping for non-colliding keepAlive fork IDs', () => {
  // Call: saveSessionInitMapping({ sessionId: 'parent_fork_170...', sdkSessionId: 'sdk-fork-uuid', isForked: true })
  // Assert: getSDKSessionIdForSession('parent_fork_170...') === 'sdk-fork-uuid'
  // Assert: getSDKSessionIdForSession('sdk-fork-uuid') === 'sdk-fork-uuid'
});

// Test 3: Repeated init events don't accumulate duplicates
it('should update existing sdk self-map instead of accumulating duplicates', () => {
  // Call saveSessionInitMapping twice with same args
  // Assert: stable lookup, no duplicate entries
});

// Test 4: Resumed parent → fork → shadow entry prevented
it('should detect resumed parent collision via sdkSessionId lookup', () => {
  // Setup: parent { f275658a → 9541b1e0 } exists (was resumed)
  // Call: saveSessionInitMapping({ sessionId: '9541b1e0', sdkSessionId: '0efc7ca1', isForked: true })
  // Assert: NO entry with sessionId '9541b1e0' created (shadow entry prevented)
  // Assert: getSDKSessionIdForSession('9541b1e0') === '9541b1e0' (fallback via parent's sdkSessionId)
  // Assert: getSDKSessionIdForSession('0efc7ca1') === '0efc7ca1' (fork self-map)
  // Assert: getSDKSessionIdForSession('f275658a') === '9541b1e0' (parent unchanged)
});

// Test 5: Non-forked resume creates normal alias (no collision)
it('should allow non-forked resume to update orbit mapping normally', () => {
  // Setup: parent { f275658a → f275658a } exists
  // Call: saveSessionInitMapping({ sessionId: 'f275658a', sdkSessionId: '9541b1e0', isForked: false })
  // Assert: getSDKSessionIdForSession('f275658a') === '9541b1e0' (updated)
});

// Test 6: MAX_SESSIONS boundary — fork double-upsert doesn't corrupt
it('should handle fork self-map at MAX_SESSIONS boundary without losing parent', () => {
  // Setup: storage has exactly MAX_SESSIONS entries, parent { parent-id → parent-id } is the oldest
  // Call: saveSessionInitMapping({ sessionId: 'parent-id', sdkSessionId: 'fork-id', isForked: true })
  //   (collision path: adds { fork-id → fork-id }, does NOT overwrite parent)
  // Assert: getSDKSessionIdForSession('parent-id') === 'parent-id' (preserved)
  // Assert: getSDKSessionIdForSession('fork-id') === 'fork-id' (added)
  // Assert: total entry count === MAX_SESSIONS (oldest NON-parent entry was evicted)
});

// Test 7: MAX_SESSIONS eviction order — stale sessions evicted first
it('should evict oldest non-active sessions when fork causes overflow', () => {
  // Setup: MAX_SESSIONS entries with staggered lastActiveAt timestamps
  // Call: saveSessionInitMapping with isForked: true (adds sdk self-map → exceeds MAX_SESSIONS)
  // Assert: the entry with the oldest lastActiveAt was evicted
  // Assert: all recently active entries survive
});

// Test 8: Parent entry touched during collision — survives eviction
it('should touch parent lastActiveAt in collision path to prevent eviction', () => {
  // Setup: MAX_SESSIONS entries, parent { parent-id → parent-id } has very old lastActiveAt (= 1)
  // Call: saveSessionInitMapping({ sessionId: 'parent-id', sdkSessionId: 'fork-id', isForked: true })
  // Assert: getSDKSessionIdForSession('parent-id') === 'parent-id' (survived, not evicted)
  // Assert: parent's lastActiveAt is updated to ~now (not still 1)
  // Assert: fork self-map also present
  // Assert: a different stale entry was evicted instead
});
```

### Test file 3: `agent-bridge/src/__tests__/session-storage-bridge.test.ts`

Bridge-level integration test — exercises the full `onSessionInit` → storage → restart → lookup flow.

```typescript
// Test 1: Full fork lifecycle through storage with restart simulation
it('should preserve parent mapping across fork init + restart cycle', () => {
  // This test simulates the exact runtime choreography that caused the original bug:
  //   1. Create parent session → onSessionInit persists { parent → parent }
  //   2. Fork session → onSessionInit fires with { sessionId: parent, sdkSessionId: fork, isForked: true }
  //   3. Verify parent mapping preserved, fork self-mapped
  //   4. invalidateCache() — simulates app restart (forces re-read from disk)
  //   5. Verify lookups still correct after restart
  //   6. Simulate "user opens parent from sidebar": getSDKSessionIdForSession(parent) === parent
  //   7. Simulate "user opens fork from sidebar": getSDKSessionIdForSession(fork) === fork

  // Setup
  invalidateCache();

  // Step 1: Parent session init
  saveSessionInitMapping({ sessionId: 'parent-aaa', sdkSessionId: 'parent-aaa', isForked: false });
  expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa');

  // Step 2: Fork session init (reuses parent orbit ID — the bug trigger)
  saveSessionInitMapping({ sessionId: 'parent-aaa', sdkSessionId: 'fork-bbb', isForked: true });

  // Step 3: Verify in-memory state
  expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa'); // NOT 'fork-bbb'
  expect(getSDKSessionIdForSession('fork-bbb')).toBe('fork-bbb');

  // Step 4: Simulate restart
  invalidateCache();

  // Step 5: Verify post-restart lookups (from disk)
  expect(getSDKSessionIdForSession('parent-aaa')).toBe('parent-aaa');
  expect(getSDKSessionIdForSession('fork-bbb')).toBe('fork-bbb');
});

// Test 2: Resumed parent → fork → restart cycle
it('should preserve resumed parent mapping when fork uses rekeyed SDK ID', () => {
  invalidateCache();

  // Step 1: Fresh session
  saveSessionInitMapping({ sessionId: 'orbit-aaa', sdkSessionId: 'orbit-aaa', isForked: false });

  // Step 2: Session resumed after app restart → gets new SDK ID
  saveSessionInitMapping({ sessionId: 'orbit-aaa', sdkSessionId: 'sdk-bbb', isForked: false });
  expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb');

  // Step 3: User rewinds from resumed session → fork uses rekeyed ID 'sdk-bbb'
  saveSessionInitMapping({ sessionId: 'sdk-bbb', sdkSessionId: 'fork-ccc', isForked: true });

  // Step 4: Verify no shadow entry, parent alias intact
  expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb'); // parent unchanged
  expect(getSDKSessionIdForSession('sdk-bbb')).toBe('sdk-bbb'); // fallback via parent's sdkSessionId
  expect(getSDKSessionIdForSession('fork-ccc')).toBe('fork-ccc'); // fork self-mapped

  // Step 5: Restart
  invalidateCache();

  // Step 6: All lookups survive
  expect(getSDKSessionIdForSession('orbit-aaa')).toBe('sdk-bbb');
  expect(getSDKSessionIdForSession('sdk-bbb')).toBe('sdk-bbb');
  expect(getSDKSessionIdForSession('fork-ccc')).toBe('fork-ccc');
});
```

### TESTED warning comments

Per repository convention (`agent-bridge/CLAUDE.md` integration test coverage), add `TESTED:` comments to the source functions covered by the new tests:

```typescript
// In session-storage.ts, above saveSessionInitMapping:
// TESTED: agent-bridge/src/__tests__/session-storage-init-mapping.test.ts
// TESTED: agent-bridge/src/__tests__/session-storage-bridge.test.ts
// Run: cd agent-bridge && bun test

// In session-storage.ts, above loadSessionsFromDisk repair block:
// TESTED: agent-bridge/src/__tests__/session-storage-migration.test.ts
// Run: cd agent-bridge && bun test
```

### MAX_SESSIONS pressure note

Fork self-maps add extra records (`orbit→sdk` + `sdk→sdk`), increasing pressure on `MAX_SESSIONS=50`. Heavy fork users could see older aliases evicted earlier. This is acceptable — `persistSessions` sorts by `lastActiveAt` descending, so only stale sessions are evicted. Add a debug log inside `persistSessions` when pruning occurs during a fork-heavy session:

```typescript
if (sessions.length > MAX_SESSIONS) {
  logger.debug(
    { total: sessions.length, pruned: sessions.length - MAX_SESSIONS },
    'Pruned sessions exceeding MAX_SESSIONS limit'
  );
}
```

### Concurrent write observability note

When two bridge processes write to `orbit-sessions.json` simultaneously (edge case 2), the last-write-wins result is correct because both compute identical repairs. For non-repair writes (concurrent `saveSessionInitMapping` calls from different processes), interleaving can cause one process's write to be overwritten by another. This is the pre-existing single-file storage limitation.

Add a debug-level log in `persistSessions` to surface when the written entry count differs from the cache expectation, providing observability for support:

```typescript
function persistSessions(sessions: StoredSession[]): boolean {
  try {
    ensureStorageDir();
    const sortedSessions = [...sessions]
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, MAX_SESSIONS);

    if (sessions.length > MAX_SESSIONS) {
      logger.debug(
        { total: sessions.length, pruned: sessions.length - MAX_SESSIONS },
        'Pruned sessions exceeding MAX_SESSIONS limit'
      );
    }

    sessionsCache = sortedSessions;
    const data: SessionStorageData = { version: STORAGE_VERSION, sessions: sortedSessions };
    fs.writeFileSync(getStoragePath(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to save sessions to storage');
    return false;
  }
}
```

## Verification

1. `bunx tauri dev`
2. Open an existing conversation (or create one and send a message)
3. Rewind to an earlier message
4. Send a new message in the rewound/forked session
5. Navigate to the original session in the sidebar
6. Send a message — should stay in the original session, NOT get rerouted to the fork
7. Check that the forked session is still accessible separately in the sidebar
8. Verify no React duplicate key errors in console
9. Close and reopen the app — verify resumed sessions maintain continuity (not reset to original JSONL)
10. Check that `.orbit-sessions-repaired-v1` flag file exists in the storage directory

### Troubleshooting

**Storage directory** (where `orbit-sessions.json` and `.orbit-sessions-repaired-v1` live):

- macOS: `~/Library/Application Support/Orbit/`
- Windows: `%APPDATA%/Orbit/`
- Linux: `~/.config/orbit/` (or `$XDG_CONFIG_HOME/orbit/`)

| Symptom                                                               | Cause                                                                                  | Resolution                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Repair completed but flag could not be written" log on every startup | Storage directory is not writable                                                      | Fix write permissions on the path shown in the log message. The repair is safe to re-run but adds startup overhead. |
| Parent session still redirects to fork after upgrade                  | Repair flag was present from a previous run, or the entry wasn't detected as corrupted | Delete `.orbit-sessions-repaired-v1` from the storage directory and restart. Repair will re-run.                    |
| Session navigates to old JSONL after restore from backup              | `orbit-sessions.json` was restored but repair flag still exists                        | Delete `.orbit-sessions-repaired-v1` from the storage directory and restart. Repair will re-evaluate all entries.   |

---

## Audit Trail

### Audit 1 — Claude (February 27, 2026)

**File**: `reviews/audit-plan.md` (original version)

Changes incorporated:

1. **P1-1 one-time gate** (Critical) — Added `.orbit-sessions-repaired-v1` flag file to prevent the repair from cyclically resetting legitimate resume aliases on every startup. Without the gate, sessions resumed across app restarts would lose conversation continuity each time.

2. **P1-2 shadow entry detection** (Critical) — Extended collision detection to check `sessions.find(s => s.sdkSessionId === event.sessionId)` in addition to `sessions.find(s => s.sessionId === event.sessionId)`. Catches the "resumed parent → fork" case where `event.sessionId` is a rekeyed SDK ID that doesn't match any stored `sessionId` key but DOES match a stored `sdkSessionId`.

3. **Change 4 added** — Barrel export update + `@deprecated` JSDoc on `saveSession` to prevent accidental reuse of the unchecked save path.

4. **Tests expanded** — Added Test 7 (repair flag gating), Test 8 (resume alias cycle prevention), P1-2 Test 4 (resumed parent shadow entry), P1-2 Test 5 (non-forked resume allows normal update). Verification step 9-10 added for restart continuity and flag file.

### Audit 2 — Codex (February 27, 2026)

**File**: `reviews/audit-plan.md` (updated version)

Changes incorporated:

5. **Repair flag atomicity** (Critical) — `markRepairComplete()` now only called after `persistSessions()` succeeds. If session persistence fails but flag write succeeds, corruption becomes permanently unrepairable. `persistSessions` return type changed from `void` to `boolean`. `markRepairComplete` also returns `boolean` with error handling.

6. **Warn-level logging for JSONL scan failures** — `hasJsonlForSessionId` catch block upgraded from `logger.debug` to `logger.warn` during the repair pass so support can diagnose non-repaired installs.

7. **TESTED warning comments** — Per repository convention, added `TESTED:` comment blocks on `saveSessionInitMapping` and `loadSessionsFromDisk` repair block.

8. **MAX_SESSIONS pressure documentation** — Fork self-maps add extra records. Added debug log when pruning occurs and documented the tradeoff.

Additional edge cases surfaced by Codex (accepted as known limitations):

- Two bridge processes starting simultaneously → last-write-wins race (pre-existing single-file storage limitation)
- User deletes `orbit-sessions.json` but leaves repair flag → repair skipped on restored corrupted data (acceptable — manual file manipulation is unsupported)
- `MAX_SESSIONS` boundary with fork double-upsert → older aliases may be evicted (acceptable — stale-first eviction order)

### Final pass — remaining recommended improvements (February 27, 2026)

All three recommended improvements from Codex Audit 2 added to the plan:

9. **Bridge-level integration test** — New test file 3 (`session-storage-bridge.test.ts`) with two tests exercising the full `saveSessionInitMapping` → `invalidateCache` → re-lookup flow. Covers both fresh-parent and resumed-parent fork lifecycles across simulated restarts.

10. **Persist-failure retry test** — Migration test 9 verifies that when `persistSessions` fails during repair, the flag file is NOT written and repair retries on next startup.

11. **MAX_SESSIONS boundary tests** — Init-mapping tests 6-7 verify fork double-upserts at the 50-session cap don't corrupt parent mappings and evict stale-first.

### Edge case mitigations (February 27, 2026)

All five edge cases from the Codex audit addressed with concrete mitigations:

12. **Edge case 1 & 2: Idempotent retry safety** — Documented that repair re-runs (from flag write failure or concurrent processes) are safe by design. Self-mapped entries are skipped by the `sessionId === sdkSessionId` guard, making the repair function a no-op on already-repaired data.

13. **Edge case 3: MAX_SESSIONS parent eviction** — Added `parentEntry.lastActiveAt = now` touch in the collision path of `saveSessionInitMapping`. Prevents `persistSessions`'s stale-first sort from evicting the parent when a fork self-map pushes past the 50-entry cap. Added init-mapping test 8 to verify.

14. **Edge case 4: Scan failure tracking** — Restructured `hasJsonlForSessionId` to return `{ found, scanError }` and `repairOverwrittenParentMappings` to return `RepairResult` with `hadScanFailures`. `loadSessionsFromDisk` now skips `markRepairComplete()` when scan failures occurred, ensuring corrupted entries are re-evaluated on next startup. Per-directory error isolation: a single unreadable directory doesn't abort the entire scan. Added migration test 10 to verify.

15. **Edge case 5: Manual tampering** — Mtime-based staleness detection evaluated and rejected (normal app writes break the one-time gate). Accepted as unsupported power-user scenario — manual file restoration requires also deleting the flag file. Documented in edge case mitigations table and key design decisions.

16. **Test coverage expansion** — New migration tests (10-14 for scan failures, staleness, catch-path, idempotency) and one new init-mapping test (8 for parent touch/eviction).

### Audit 3 — mtime staleness removal and flag simplification (February 27, 2026)

Critical bug identified: mtime-based staleness check in `hasRepairRun()` broke the one-time gate.

17. **Critical: mtime staleness check defeats one-time gate** — Normal app writes (`saveSessionInitMapping`, `touchSession`, etc.) update `orbit-sessions.json` mtime on every session activity. The `!==` mtime comparison flagged these as "stale", causing repair to re-run on every startup — reintroducing the exact alias-reset cycle the one-time gate was designed to prevent. **Fix**: Removed mtime storage and comparison entirely. `hasRepairRun()` reverted to simple flag existence check. `markRepairComplete()` writes a zero-byte sentinel. Edge case 5 (manual file tampering) accepted as unsupported power-user scenario — requires manually deleting the flag file.

18. **Retained: catch-path safety** — `hasRepairRun()` catch block correctly returns `false` (not-yet-repaired) on I/O errors, ensuring repair re-runs when the flag can't be checked.

19. **Test updates** — Removed staleness-specific tests (mtime comparison no longer exists). Added test 11 (I/O error catch-path safety) and test 12 (normal app writes don't break one-time gate). Total test count: 13 migration + 8 init-mapping + 2 bridge = **23 tests**.

### Audit 4 — operational observability for remaining edge cases (February 27, 2026)

Three edge cases addressed with logging and documentation improvements:

20. **Repeated flag write failures (edge case 1)** — When `markRepairComplete()` fails, `loadSessionsFromDisk` now logs the flag file path at warn-level so the operator can fix permissions. Previously the only signal was a generic "Failed to write repair flag file" inside `markRepairComplete()` without the path.

21. **Concurrent bridge writes (edge case 2)** — Added `persistSessions` function body to the plan with the existing MAX_SESSIONS prune log. Concurrent write behavior documented as pre-existing limitation in a new "Concurrent write observability" section.

22. **Manual restore recovery (edge case 5)** — Added a troubleshooting table to the Verification section with three symptom→cause→resolution rows covering: repeated repair log, persistent fork redirect after upgrade, and backup restore. All three resolutions point to deleting `.orbit-sessions-repaired-v1`. Makes the recovery path discoverable without reading the plan document.
