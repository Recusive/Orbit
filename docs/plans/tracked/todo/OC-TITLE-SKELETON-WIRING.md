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

## Changes (7 files + 1 new helper)

### 1. Shared helper — New file `apps/agent/src/lib/utils/oc-title.ts`

Mirrors the exact backend regex from `Agent-backend/packages/opencode/src/session/index.ts:46-50`:

```typescript
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
 * Whether the backend will generate an AI title on the next send.
 * Mirrors ensureTitle() at session/prompt.ts:1970 — requires:
 *   1. No parentID (not a fork/child session)
 *   2. Default timestamp title
 *   3. Zero prior real user messages
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
import { isDefaultOcTitle } from '@/lib/utils/oc-title';
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

return ocSessions.map((session) => ({
  sessionId: session.id,
  title: isDefaultOcTitle(session.title) ? 'Untitled' : session.title,
  createdAt: session.time.created,
  updatedAt: session.time.updated,
  messageCount: ocMessageSessions[session.id] ?? 0,
  ...(session.directory ? { workspacePath: session.directory } : {}),
}));
```

Now the empty-session guard correctly blocks duplicates for empty sessions AND allows new sessions after a message is sent.

### 4. `apps/agent/src/hooks/chat/use-oc-chat.ts` — Trigger loading matching backend contract

Show skeleton only when the backend will actually generate a title: default title AND first real user message.

```typescript
import { useUIStore } from '@/stores/ui/ui-store';
import { willBackendGenerateTitle } from '@/lib/utils/oc-title';

// In handleSend(), AFTER ensuring activeSessionId but BEFORE sendMessage():
const currentSession = useOcSessionStore.getState().sessions[activeSessionId];
const currentMessages = useOcMessageStore.getState().sessions[activeSessionId];
const priorUserCount =
  currentMessages?.messageOrder.filter((id) => currentMessages.messagesById[id]?.role === 'user')
    .length ?? 0;

if (
  currentSession &&
  willBackendGenerateTitle({
    title: currentSession.title,
    parentID: currentSession.parentID,
    realUserMessageCount: priorUserCount,
  })
) {
  useUIStore.getState().setTitleLoading(activeSessionId, true);

  // Safety timeout: last-resort cleanup if SSE settlement never arrives
  const capturedId = activeSessionId;
  setTimeout(() => {
    useUIStore.getState().setTitleLoading(capturedId, false);
  }, 15_000);
}

// In the sendMessage catch block, clear loading:
try {
  await ocSessionService.sendMessage(activeSessionId, text, options);
} catch (error) {
  useUIStore.getState().setTitleLoading(activeSessionId, false);
  logger.error('Failed to send message', error, { sessionId: activeSessionId });
  throw error;
}
```

This correctly handles:

- **New session, first message**: no parentID + default title + 0 user messages → skeleton
- **Restored session, first message**: no parentID + default title + 0 user messages → skeleton
- **Child/fork session**: has parentID → NO skeleton (backend skips `ensureTitle()` for forks)
- **Second message after failed title gen**: default title + 1 user message → NO skeleton (backend won't retry)
- **Session with AI title**: non-default title → NO skeleton

### 5. `apps/agent/src/services/opencode/oc-event-coordinator.ts` — Clear loading on settlement

**Primary**: `session.updated` with non-default title.
**Error**: `session.error` clears immediately.
**Deletion**: `session.deleted` clears.

```typescript
import { useUIStore } from '@/stores/ui/ui-store';
import { isDefaultOcTitle } from '@/lib/utils/oc-title';

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

case 'session.deleted':
  // ...existing code...
  useUIStore.getState().setTitleLoading(payload.properties.info.id, false);
  break;

case 'session.error':
  // ...existing code...
  if (payload.properties.sessionID) {
    useUIStore.getState().setTitleLoading(payload.properties.sessionID, false);
  }
  break;
```

### 6. `apps/agent/src/hooks/sidebar/use-conversation-meta.ts` — Wire header loading + display title for OC

Two changes:

- Change the hardcoded `isTitleLoading: false` to read from UIStore
- Map default OC titles to `'Untitled'` for display consistency with the sidebar list

```typescript
import { isDefaultOcTitle } from '@/lib/utils/oc-title';

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

### 7. `apps/agent/src/services/conversations/oc-ui-bridge.ts` — Wire `getActiveMeta().isTitleLoading`

Change the hardcoded `false` on line 58:

```typescript
import { useUIStore } from '@/stores/ui/ui-store';

getActiveMeta() {
  const state = useOcSessionStore.getState();
  const activeSession = state.activeSessionId
    ? (state.sessions[state.activeSessionId] ?? null)
    : null;
  return {
    id: activeSession?.id ?? null,
    title: activeSession?.title ?? null,
    isTitleLoading: state.activeSessionId
      ? useUIStore.getState().titleLoadingSessions.has(state.activeSessionId)
      : false,
  };
},
```

## Edge Cases

| Edge Case                                                  | How It's Handled                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Double-click "new session" before typing                   | Display title `'Untitled'` + `messageCount === 0` → guard blocks                                                                                                                                                                                                                                                   |
| Send message then click "new session" before title arrives | `messageCount > 0` (real count from store) → guard allows. **Note:** brief race exists — `messageCount` updates when `message.updated` SSE lands, not on send. Very fast click before first SSE can still hit the guard. Acceptable: the window is ~50-200ms and the worst case is a blocked click, not data loss. |
| Restored session with default title, first send            | `willBackendGenerateTitle` → true → skeleton                                                                                                                                                                                                                                                                       |
| Restored session with messages but failed title gen        | `willBackendGenerateTitle` → false (user messages > 0) → no skeleton                                                                                                                                                                                                                                               |
| `sendMessage()` fails after loading set                    | Catch block clears loading                                                                                                                                                                                                                                                                                         |
| Server title gen fails silently                            | 15s safety timeout clears skeleton                                                                                                                                                                                                                                                                                 |
| Title gen >15s                                             | Timeout clears early; title still arrives via `session.updated` with `animate-title-in`                                                                                                                                                                                                                            |
| Session deleted / session error while loading              | Event handlers clear loading immediately                                                                                                                                                                                                                                                                           |
| Child/fork session with default title                      | `parentID` present → `willBackendGenerateTitle` returns false → no skeleton                                                                                                                                                                                                                                        |
| User-set title resembling timestamp                        | Exact regex (including `.000Z$`) prevents false matches                                                                                                                                                                                                                                                            |

## Verification

1. `bun run check` — typecheck + lint + tests pass
2. Manual — new session: click new → "Untitled" → send message → skeleton pulse → AI title
3. Manual — restored: restart app → open default-title session → send → skeleton → AI title
4. Manual — second send after failed gen: no skeleton (backend won't retry)
5. Manual — "new session" after sending: guard allows (messageCount > 0)
6. Error: kill OC server → skeleton clears on `session.error` or 15s timeout
7. Existing Claude title tests unaffected
