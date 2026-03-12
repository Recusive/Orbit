# Plan: Wire OpenCode Title Loading into Existing Skeleton UI

## Context

The Claude backend shows a pulsing skeleton bar in the sidebar while AI title generation is in progress, then animates in the real title. The OpenCode backend has the same server-side title generation (`ensureTitle()` → `Session.setTitle()` → `session.updated` SSE), but Orbit never triggers the loading skeleton for OC sessions. Everything already exists — skeleton UI, loading state, SSE pipeline — we just need to connect them.

Frontend is a pure viewer: backend owns all title data, frontend only manages the "am I waiting?" presentation state.

## What Already Exists (no changes needed)

| Piece                          | Location                                                | Status                                               |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| Skeleton pulse UI              | `ConversationItem.tsx:189-195`                          | Works — reads `useIsTitleLoading(sessionId)`         |
| `setTitleLoading(id, bool)`    | `ui-store.ts:554`                                       | Works — adds/removes from `titleLoadingSessions` Set |
| `useIsTitleLoading(id)`        | `ui-store.ts:949`                                       | Works — reads from `titleLoadingSessions`            |
| Server title generation        | `session/prompt.ts:1970` (`ensureTitle()`)              | Works — fires after first user message               |
| SSE `session.updated` delivery | `oc-event-coordinator.ts:44-49`                         | Works — calls `updateSession()` on store             |
| Empty-session guard            | `content-top-bar.tsx:300`, `use-sidebar-actions.ts:231` | Checks `title === 'Untitled' && messageCount === 0`  |

## Backend Title-Generation Contract

`ensureTitle()` at `Agent-backend/packages/opencode/src/session/prompt.ts:1970` runs when ALL of:

1. Session has no `parentID` (not a fork)
2. Title is still a default timestamp (`isDefaultTitle()`)
3. The send is the **first real user message** in the session

This means: if title generation fails and the title stays default, later sends will NOT retry.

## Changes (7 files + 1 new helper + 2 test files)

### 1. Shared helper — New file `apps/agent/src/services/opencode/oc-title-utils.ts`

Mirrors the exact backend regex from `Agent-backend/packages/opencode/src/session/index.ts:46-50`
and the eligibility logic from `ensureTitle()` at `session/prompt.ts:1970-1988`.

Placed under `services/opencode/` (not `lib/utils/`) because the logic is tightly coupled to the
backend contract and co-locating with the owning domain makes drift easier to detect.

```typescript
import type { OcPart } from '@/types/opencode';

/**
 * Whether a title is the OpenCode server's auto-generated default.
 * Matches exact backend pattern: "New session - 2026-03-11T10:30:00.000Z"
 * Backend source: Agent-backend/packages/opencode/src/session/index.ts:46
 */
const OC_DEFAULT_TITLE_RE =
  /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isDefaultOcTitle(title: string): boolean {
  return OC_DEFAULT_TITLE_RE.test(title);
}

/**
 * Count non-synthetic user messages, mirroring backend ensureTitle() semantics.
 *
 * Backend (session/prompt.ts:1979-1988) counts a user message as "real" only
 * when NOT every part has `synthetic === true`. The `synthetic` field exists
 * only on TextPart (type: "text") in the SDK — other part types are never
 * synthetic, so a user message with any non-text part is always "real".
 */
export function countRealUserMessages(
  messageOrder: readonly string[],
  messagesById: Readonly<Record<string, { role: string }>>,
  partsByMessage: Readonly<Record<string, readonly OcPart[]>>
): number {
  return messageOrder.filter((messageId) => {
    const message = messagesById[messageId];
    if (!message || message.role !== 'user') {
      return false;
    }

    const parts = partsByMessage[messageId] ?? [];
    if (parts.length === 0) {
      // No parts yet — treat as real (user just typed it)
      return true;
    }

    // Mirror backend: m.parts.every((p) => "synthetic" in p && p.synthetic)
    const allSynthetic = parts.every(
      (part) => 'synthetic' in part && (part as { synthetic?: boolean }).synthetic === true
    );
    return !allSynthetic;
  }).length;
}

/**
 * Whether the backend will generate an AI title on the next send.
 * Mirrors ensureTitle() at session/prompt.ts:1970 — requires:
 *   1. No parentID (not a fork/child session)
 *   2. Default timestamp title
 *   3. Exactly zero prior non-synthetic user messages
 */
interface TitleEligibilityInput {
  readonly title: string;
  readonly parentID?: string;
  readonly realUserMessageCount: number;
}

export function willBackendGenerateTitle(input: TitleEligibilityInput): boolean {
  return (
    input.parentID === undefined &&
    isDefaultOcTitle(input.title) &&
    input.realUserMessageCount === 0
  );
}
```

### 2. `apps/agent/src/services/opencode/oc-session-service.ts` — Strip "Untitled" from create

Don't forward `'Untitled'` — let the server set its timestamp default so `ensureTitle()` runs.

```typescript
async createSession(input?: { title?: string }): Promise<OcSession> {
  const effectiveTitle = input?.title === 'Untitled' ? undefined : input?.title;
  const response = await getClient().session.create(
    effectiveTitle ? { title: effectiveTitle } : undefined,
    { throwOnError: true }
  );
  // ...rest unchanged
```

### 3. `apps/agent/src/hooks/sidebar/use-conversation-list.ts` — Real display title + message count

**Two fixes**:

- Map default OC titles to `'Untitled'` for display (preserves empty-session guard)
- Derive real `messageCount` from `useOcMessageStore` (fixes guard for sessions with messages)

```typescript
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';
import { useOcMessageStore } from '@/stores/opencode';

// Inside the hook, subscribe to OC message state for counts:
const ocMessageSessions = useOcMessageStore(
  useShallow((state) => {
    // Only extract message order lengths to minimize re-renders
    const counts: Record<string, number> = {};
    for (const [id, session] of Object.entries(state.sessions)) {
      counts[id] = session.messageOrder.length;
    }
    return counts;
  })
);

// Also read the pending-send record for the optimistic guard (see Section 3.1):
const pendingSendSessions = useOcSessionStore(useShallow((state) => state.pendingSendSessions));

return ocSessions.map((session) => ({
  sessionId: session.id,
  title: isDefaultOcTitle(session.title) ? 'Untitled' : session.title,
  createdAt: session.time.created,
  updatedAt: session.time.updated,
  // Optimistic: treat pending-send sessions as having messages so the
  // empty-session guard allows "new session" immediately after send.
  messageCount:
    session.id in pendingSendSessions
      ? Math.max(ocMessageSessions[session.id] ?? 0, 1)
      : (ocMessageSessions[session.id] ?? 0),
  ...(session.directory ? { workspacePath: session.directory } : {}),
}));
```

Now the empty-session guard correctly blocks duplicates for empty sessions AND allows new sessions after a message is sent — including the narrow post-send/pre-SSE window.

### 3.1. `apps/agent/src/stores/opencode/oc-session-store.ts` — Optimistic pending-send signal

Add a `pendingSendSessions` record and two actions. This removes the post-send race window
where clicking "new session" was blocked because `messageCount` only updated on SSE arrival.

**Important**: This store is plain Zustand with `persist` (NOT immer). All updates MUST return
new partial state objects — never mutate. Uses `Record<string, true>` instead of `Set` to
match the store's existing idiom and avoid `Set` serialization issues with persist middleware.

```typescript
// Add to OcSessionState interface:
pendingSendSessions: Record<string, true>;
markPendingSend: (sessionId: string) => void;
clearPendingSend: (sessionId: string) => void;

// Add to initial state (inside create(persist((set) => ({ ... })))):
pendingSendSessions: {},

// Actions (return new partial state — never mutate):
markPendingSend: (sessionId) => {
  set((state) => ({
    pendingSendSessions: {
      ...state.pendingSendSessions,
      [sessionId]: true as const,
    },
  }));
},
clearPendingSend: (sessionId) => {
  set((state) => ({
    pendingSendSessions: Object.fromEntries(
      Object.entries(state.pendingSendSessions).filter(([id]) => id !== sessionId)
    ),
  }));
},
```

Note: `partialize` already restricts persistence to `activeSessionId` only, so
`pendingSendSessions` is ephemeral (cleared on app restart) — which is correct.

**Clearing the signal**: `clearPendingSend` is called in three places:

1. **`oc-event-coordinator.ts`** — on first `message.updated` SSE for the session (real count now available)
2. **`use-oc-chat.ts`** — in the catch block when `sendMessage()` fails
3. **`oc-event-coordinator.ts`** — on `session.deleted` or `session.error`

### 4. `apps/agent/src/hooks/chat/use-oc-chat.ts` — Trigger loading matching backend contract

Show skeleton only when the backend will actually generate a title: default title AND first real user message.

```typescript
import { useUIStore } from '@/stores/ui/ui-store';
import {
  willBackendGenerateTitle,
  countRealUserMessages,
} from '@/services/opencode/oc-title-utils';

// In handleSend(), AFTER ensuring activeSessionId but BEFORE sendMessage():
const currentSession = useOcSessionStore.getState().sessions[activeSessionId];
const currentMessages = useOcMessageStore.getState().sessions[activeSessionId];

// Count non-synthetic user messages — mirrors backend ensureTitle() semantics exactly.
// Backend (session/prompt.ts:1979-1988) filters out user messages where ALL parts
// have `synthetic === true`. The `synthetic` field only exists on TextPart.
const priorRealUserCount = currentMessages
  ? countRealUserMessages(
      currentMessages.messageOrder,
      currentMessages.messagesById,
      currentMessages.partsByMessage
    )
  : 0;

if (
  currentSession &&
  willBackendGenerateTitle({
    title: currentSession.title,
    parentID: currentSession.parentID,
    realUserMessageCount: priorRealUserCount,
  })
) {
  useUIStore.getState().setTitleLoading(activeSessionId, true);

  // Safety timeout: last-resort cleanup if SSE settlement never arrives
  const capturedId = activeSessionId;
  setTimeout(() => {
    useUIStore.getState().setTitleLoading(capturedId, false);
  }, 15_000);
}

// Optimistic signal: mark session as having a pending first real user message
// so the empty-session guard allows "new session" immediately after send
// (before message.updated SSE arrives). See Section 3.1 for store changes.
useOcSessionStore.getState().markPendingSend(activeSessionId);

// In the sendMessage catch block, clear loading AND optimistic signal:
try {
  await ocSessionService.sendMessage(activeSessionId, text, options);
} catch (error) {
  useUIStore.getState().setTitleLoading(activeSessionId, false);
  useOcSessionStore.getState().clearPendingSend(activeSessionId);
  logger.error('Failed to send message', error, { sessionId: activeSessionId });
  throw error;
}
```

This correctly handles:

- **New session, first message**: no parentID + default title + 0 real user messages → skeleton
- **Restored session, first message**: no parentID + default title + 0 real user messages → skeleton
- **Restored session with synthetic-only history**: subtask-only user messages don't count → skeleton fires correctly
- **Child/fork session**: has parentID → NO skeleton (backend skips `ensureTitle()` for forks)
- **Second message after failed title gen**: default title + 1 real user message → NO skeleton (backend won't retry)
- **Session with AI title**: non-default title → NO skeleton

### 5. `apps/agent/src/services/opencode/oc-event-coordinator.ts` — Clear loading + pending-send on settlement

**Primary**: `session.updated` with non-default title clears title loading.
**Message arrival**: `message.updated` clears the optimistic pending-send signal.
**Error**: `session.error` clears both immediately.
**Deletion**: `session.deleted` clears both.

```typescript
import { useUIStore } from '@/stores/ui/ui-store';
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';

case 'session.updated': {
  const info = payload.properties.info;
  logger.debug('Event dispatched', { eventType: payload.type, sessionId: info.id });
  useOcSessionStore.getState().updateSession(info);

  // Clear title skeleton when server has set a real title
  if (!isDefaultOcTitle(info.title)) {
    useUIStore.getState().setTitleLoading(info.id, false);
  }
  break;
}

case 'message.updated': {
  // ...existing message handling code...

  // Clear optimistic pending-send signal — real message count is now available
  useOcSessionStore.getState().clearPendingSend(payload.properties.info.sessionID);
  break;
}

case 'session.deleted':
  // ...existing code...
  useUIStore.getState().setTitleLoading(payload.properties.info.id, false);
  useOcSessionStore.getState().clearPendingSend(payload.properties.info.id);
  break;

case 'session.error':
  // ...existing code...
  if (payload.properties.sessionID) {
    useUIStore.getState().setTitleLoading(payload.properties.sessionID, false);
    useOcSessionStore.getState().clearPendingSend(payload.properties.sessionID);
  }
  break;
```

### 6. `apps/agent/src/hooks/sidebar/use-conversation-meta.ts` — Wire header loading + display title for OC

Two changes:

- Change the hardcoded `isTitleLoading: false` to read from UIStore
- Map default OC titles to `'Untitled'` for display consistency with the sidebar list

```typescript
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';

const ocTitleLoading = useIsTitleLoading(ocActiveSessionId);
const ocDisplayTitle = ocActiveSession?.title
  ? isDefaultOcTitle(ocActiveSession.title)
    ? 'Untitled'
    : ocActiveSession.title
  : null;

return {
  activeSessionId: ocActiveSessionId,
  title: ocDisplayTitle,
  isTitleLoading: ocTitleLoading,
};
```

Add `ocTitleLoading` to the useMemo deps array.

### 7. `apps/agent/src/services/conversations/oc-ui-bridge.ts` — Wire `getActiveMeta().isTitleLoading` + normalize display title

Two changes: wire title loading from UIStore AND normalize default OC titles to `'Untitled'`
so all consumers of `getActiveMeta()` see consistent display titles (not raw timestamps).

```typescript
import { useUIStore } from '@/stores/ui/ui-store';
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';

getActiveMeta() {
  const state = useOcSessionStore.getState();
  const activeSession = state.activeSessionId
    ? (state.sessions[state.activeSessionId] ?? null)
    : null;

  // Normalize display title — same logic as sidebar list and header
  const rawTitle = activeSession?.title ?? null;
  const displayTitle = rawTitle !== null && isDefaultOcTitle(rawTitle)
    ? 'Untitled'
    : rawTitle;

  return {
    id: activeSession?.id ?? null,
    title: displayTitle,
    isTitleLoading: state.activeSessionId
      ? useUIStore.getState().titleLoadingSessions.has(state.activeSessionId)
      : false,
  };
},
```

## Edge Cases

| Edge Case                                                  | How It's Handled                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double-click "new session" before typing                   | Display title `'Untitled'` + `messageCount === 0` → guard blocks                                                                                                                                                                                                                                                                                                                                   |
| Send message then click "new session" before title arrives | `pendingSendSessions` optimistic signal bumps `messageCount` to ≥1 immediately at send time → guard allows. Cleared on first `message.updated` SSE, send failure, or session deletion/error.                                                                                                                                                                                                       |
| Restored session with default title, first send            | `willBackendGenerateTitle` → true → skeleton                                                                                                                                                                                                                                                                                                                                                       |
| Restored session with synthetic-only user history          | `countRealUserMessages` excludes synthetic-only user messages → correctly detects 0 real → skeleton fires. Matches backend's `!m.parts.every(p => "synthetic" in p && p.synthetic)` filter.                                                                                                                                                                                                        |
| Restored session with messages but failed title gen        | `willBackendGenerateTitle` → false (real user messages > 0) → no skeleton                                                                                                                                                                                                                                                                                                                          |
| `sendMessage()` fails after loading set                    | Catch block clears both loading and pending-send                                                                                                                                                                                                                                                                                                                                                   |
| Server title gen fails silently                            | 15s safety timeout clears skeleton                                                                                                                                                                                                                                                                                                                                                                 |
| Title gen >15s                                             | Timeout clears early; title still arrives via `session.updated` with `animate-title-in`                                                                                                                                                                                                                                                                                                            |
| Workspace/backend change while title loading               | `useOpencodeLifecycle` teardown should clear all pending title-loading and pending-send state on workspace switch (see Recommended Improvement below)                                                                                                                                                                                                                                              |
| Session deleted / session error while loading              | Event handlers clear loading and pending-send immediately                                                                                                                                                                                                                                                                                                                                          |
| Child/fork session with default title                      | `parentID` present → `willBackendGenerateTitle` returns false → no skeleton                                                                                                                                                                                                                                                                                                                        |
| Session trimmed while in pendingSendSessions               | `trimSessions` in oc-session-store removes old sessions beyond MAX_SESSIONS. `clearPendingSend` is never called for trimmed sessions, but orphaned entries in `pendingSendSessions` are harmless — the `use-conversation-list` mapper only reads entries for sessions in `ocSessions`, so orphaned IDs are never consumed. They're cleaned up on next `clearAll` or app restart (ephemeral state). |
| User manually renames session to timestamp format          | Exact regex (including `.000Z$` with millisecond precision) makes false positives extremely unlikely. User-typed titles would need to match `New session - 2026-03-11T10:30:00.000Z` exactly — effectively impossible via manual rename.                                                                                                                                                           |
| `ocUiBridge.getActiveMeta()` consumed by other surfaces    | Returns normalized display title (`'Untitled'` for default timestamps) — consistent with sidebar and header. All OC surfaces see the same display title.                                                                                                                                                                                                                                           |

## Automated Tests

New test file: `apps/agent/src/__tests__/unit/services/opencode/oc-title-utils.test.ts`

### Helper tests (`oc-title-utils.ts`)

```typescript
describe('isDefaultOcTitle', () => {
  it('matches parent default title format', () => {
    expect(isDefaultOcTitle('New session - 2026-03-11T10:30:00.000Z')).toBe(true);
  });
  it('matches child default title format', () => {
    expect(isDefaultOcTitle('Child session - 2026-03-11T10:30:00.000Z')).toBe(true);
  });
  it('rejects AI-generated titles', () => {
    expect(isDefaultOcTitle('Refactor auth middleware')).toBe(false);
  });
  it('rejects partial matches', () => {
    expect(isDefaultOcTitle('New session - not-a-date')).toBe(false);
  });
  it('rejects user-renamed titles that partially match', () => {
    expect(isDefaultOcTitle('New session - 2026')).toBe(false);
  });
});

describe('countRealUserMessages', () => {
  it('returns 0 for empty session', () => {
    expect(countRealUserMessages([], {}, {})).toBe(0);
  });
  it('counts normal user messages as real', () => {
    // user message with a text part (no synthetic flag)
    expect(
      countRealUserMessages(
        ['m1'],
        { m1: { role: 'user' } },
        {
          m1: [{ id: 'p1', type: 'text', text: 'hello' }],
        }
      )
    ).toBe(1);
  });
  it('excludes user messages where ALL parts are synthetic', () => {
    expect(
      countRealUserMessages(
        ['m1'],
        { m1: { role: 'user' } },
        {
          m1: [{ id: 'p1', type: 'text', text: 'auto', synthetic: true }],
        }
      )
    ).toBe(0);
  });
  it('counts user message as real when at least one part is non-synthetic', () => {
    expect(
      countRealUserMessages(
        ['m1'],
        { m1: { role: 'user' } },
        {
          m1: [
            { id: 'p1', type: 'text', text: 'auto', synthetic: true },
            { id: 'p2', type: 'text', text: 'real' },
          ],
        }
      )
    ).toBe(1);
  });
  it('counts user message with non-text parts as real', () => {
    // Non-text parts (tool, subtask) don't have synthetic field → always real
    expect(
      countRealUserMessages(
        ['m1'],
        { m1: { role: 'user' } },
        {
          m1: [{ id: 'p1', type: 'subtask' /* ... */ }],
        }
      )
    ).toBe(1);
  });
  it('treats user message with no parts as real', () => {
    // Freshly sent message before parts arrive
    expect(countRealUserMessages(['m1'], { m1: { role: 'user' } }, {})).toBe(1);
  });
  it('ignores assistant messages', () => {
    expect(countRealUserMessages(['m1'], { m1: { role: 'assistant' } }, {})).toBe(0);
  });
});

describe('willBackendGenerateTitle', () => {
  it('returns true for root session with default title and 0 real user messages', () => {
    expect(
      willBackendGenerateTitle({
        title: 'New session - 2026-03-11T10:30:00.000Z',
        realUserMessageCount: 0,
      })
    ).toBe(true);
  });
  it('returns false for child session', () => {
    expect(
      willBackendGenerateTitle({
        title: 'New session - 2026-03-11T10:30:00.000Z',
        parentID: 'parent-123',
        realUserMessageCount: 0,
      })
    ).toBe(false);
  });
  it('returns false when real user messages > 0', () => {
    expect(
      willBackendGenerateTitle({
        title: 'New session - 2026-03-11T10:30:00.000Z',
        realUserMessageCount: 1,
      })
    ).toBe(false);
  });
  it('returns false when title is already AI-generated', () => {
    expect(
      willBackendGenerateTitle({
        title: 'Refactor auth middleware',
        realUserMessageCount: 0,
      })
    ).toBe(false);
  });
});
```

### Integration tests (OC title-loading lifecycle)

New test file: `apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts`

```typescript
describe('OC title-loading lifecycle', () => {
  it('starts title loading on first real user message send for root session with default title');
  it('does NOT start title loading for child sessions (parentID set)');
  it('does NOT start title loading when session has synthetic-only user history');
  it('does NOT start title loading when session already has an AI-generated title');
  it('clears title loading on session.updated with non-default title');
  it('clears title loading on session.error');
  it('clears title loading on session.deleted');
  it('clears title loading on sendMessage failure');
  it('clears title loading after 15s safety timeout');
  it('marks pendingSend optimistically and clears on message.updated');
  it('maps default OC titles to Untitled in sidebar list');
  it('maps default OC titles to Untitled in active conversation header');
  it('empty-session guard allows new session when pendingSend is set');
  it('ocUiBridge.getActiveMeta() returns Untitled for default OC titles');
  it('clearPendingSend uses plain object return (not Set mutation)');
});
```

After implementation, add `[warning] TESTED` comments to `oc-title-utils.ts`, `oc-event-coordinator.ts`,
and `use-oc-chat.ts` with the test file paths and run commands.

## Recommended Improvement: Lifecycle cleanup

Add explicit cleanup in `useOpencodeLifecycle` teardown (workspace change, backend switch):

```typescript
// On workspace change or OC teardown:
const { titleLoadingSessions } = useUIStore.getState();
for (const sessionId of titleLoadingSessions) {
  useUIStore.getState().setTitleLoading(sessionId, false);
}
// Reset pending-send state via store action (not direct mutation):
useOcSessionStore.setState({ pendingSendSessions: {} });
```

This prevents stale loading states when the SSE stream reconnects or the user switches workspaces.

## Verification

1. `bun run check` — typecheck + lint + tests pass
2. `bun test apps/agent/src/__tests__/unit/services/opencode/oc-title-utils.test.ts` — helper tests pass
3. `bun test apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts` — lifecycle tests pass
4. Manual — new session: click new → "Untitled" → send message → skeleton pulse → AI title
5. Manual — restored: restart app → open default-title session → send → skeleton → AI title
6. Manual — second send after failed gen: no skeleton (backend won't retry)
7. Manual — "new session" after sending: guard allows immediately (no SSE wait)
8. Error: kill OC server → skeleton clears on `session.error` or 15s timeout
9. Existing Claude title tests unaffected
