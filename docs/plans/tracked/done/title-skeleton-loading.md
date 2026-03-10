# Title Skeleton Loading State

## Context

When a user sends their first message in a new conversation, the sidebar and header immediately show the raw message text (e.g., "hello") as a fallback title. After ~1-2 seconds, the AI-generated title replaces it. This flash of user text looks unpolished. Instead, show a pulsing skeleton bar until the AI title arrives.

## Approach

Add a `titleLoadingSessions` Set to UIStore. The session-title-service toggles it when AI title generation starts/completes. Components check the set and render a skeleton bar instead of the title text. The fallback title is still stored internally for persistence and crash recovery — the skeleton is purely a visual override.

## Files to Modify

| File                                                                               | Change                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/ui/ui-store.ts`                                             | Add `titleLoadingSessions` Set + `setTitleLoading` action + `useIsTitleLoading` selector                                                                         |
| `apps/agent/src/services/session/session-title-service.ts`                         | Call `setTitleLoading(true)` in `generateAITitle`, `setTitleLoading(false)` in finally block. Clear loading in `clearSessionTitleState` and `clearAllTitleState` |
| `apps/agent/src/components/layout/primary-sidebar/components/ConversationItem.tsx` | Show skeleton bar when session is loading                                                                                                                        |
| `apps/agent/src/components/layout/content-top-bar.tsx`                             | Show skeleton bar when active session title is loading                                                                                                           |
| `apps/agent/src/components/chat/chat-header.tsx`                                   | Show skeleton bar when active session title is loading                                                                                                           |
| `apps/agent/src/stores/ui/index.ts`                                                | Export `useIsTitleLoading`                                                                                                                                       |

## Implementation Steps

### Step 1: UIStore — Add loading state

In `apps/agent/src/stores/ui/ui-store.ts`:

**UIState interface** (~line 101, after `editingConversationId`):

```typescript
titleLoadingSessions: Set<string>;
```

**UIActions interface** (~line 158, after `setEditingConversationId`):

```typescript
setTitleLoading: (sessionId: string, loading: boolean) => void;
```

**Initial state** (in `create` call):

```typescript
titleLoadingSessions: new Set<string>(),
```

**Action** (after `setEditingConversationId`):

```typescript
setTitleLoading: (sessionId: string, loading: boolean): void => {
  set((state) => {
    if (loading) {
      state.titleLoadingSessions.add(sessionId);
    } else {
      state.titleLoadingSessions.delete(sessionId);
    }
  });
},
```

> **Why direct mutation?** `enableMapSet()` is already called in ui-store.ts (line 27), so Immer tracks Set mutations natively. This matches the `sessionWorktreeMap` pattern (lines 832-841) which uses direct `.set()`/`.delete()`.

**Selector** (after `useActiveConversationTitle` ~line 876):

```typescript
export const useIsTitleLoading = (sessionId: string | null): boolean => {
  return useUIStore((state) =>
    sessionId !== null ? state.titleLoadingSessions.has(sessionId) : false
  );
};
```

**Export** from `apps/agent/src/stores/ui/index.ts`: add `useIsTitleLoading` to the exports.

### Step 2: session-title-service — Toggle loading state

In `apps/agent/src/services/session/session-title-service.ts`:

**Add title generation epoch** (module-level, after `aiTitleInFlight`):

A per-session epoch counter prevents stale AI completions from overwriting manual renames, deletes,
or session reuse. Each `generateAITitle` captures the epoch at call time; the async callback only
applies its result if the epoch hasn't been bumped by a manual action in the meantime.

```typescript
/** Per-session generation epoch — bumped on manual rename, delete, or new AI request. */
const titleGenerationEpoch = new Map<string, number>();

function bumpTitleEpoch(sessionId: string): number {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  const next = (titleGenerationEpoch.get(canonicalId) ?? 0) + 1;
  titleGenerationEpoch.set(canonicalId, next);
  return next;
}
```

**In `generateAITitle`** (~line 362):

```typescript
export function generateAITitle(sessionId: string, userMessage: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  if (aiTitleGenerated.has(canonicalId) || aiTitleInFlight.has(canonicalId)) return;

  const requestEpoch = bumpTitleEpoch(canonicalId); // ← ADD
  aiTitleInFlight.add(canonicalId);
  useUIStore.getState().setTitleLoading(canonicalId, true); // ← ADD

  void (async (): Promise<void> => {
    try {
      const title = await generateSessionTitle(userMessage);
      const resolvedId = resolveCanonicalTitleSessionId(sessionId);
      // Stale-result guard: if epoch was bumped (manual rename, delete, etc.), discard.
      if (titleGenerationEpoch.get(resolvedId) !== requestEpoch) return; // ← ADD
      aiTitleGenerated.add(resolvedId);
      applySessionTitle(resolvedId, title);
      logger.info('AI title generated', { sessionId: resolvedId, title });
    } catch (err: unknown) {
      logger.warn('AI title generation failed, will retry on next turn', { sessionId, err });
    } finally {
      const resolvedId = resolveCanonicalTitleSessionId(sessionId);
      // Always clean up in-flight state — this is a resource/bookkeeping concern.
      // Without this, a stale epoch mismatch leaves aiTitleInFlight stuck, which
      // coincidentally blocks retries but is not the intended protection mechanism.
      aiTitleInFlight.delete(resolvedId);
      // Only clear loading UI if this request still owns the epoch.
      // If epoch was bumped (manual rename/delete), loading was already cleared
      // by the bumper, and we must not re-clear it (it may now belong to a new request).
      if (titleGenerationEpoch.get(resolvedId) === requestEpoch) {
        // ← ADD
        useUIStore.getState().setTitleLoading(resolvedId, false);
      }
    }
  })();
}
```

**Split `clearAllTitleState` and `clearAllTitleLoading`** (~line 91):

`clearAllTitleState()` is called from the workspace-path subscription (`session-title-service.ts:103-115`).
Writing to UIStore inside that subscriber can re-enter the same callback because `__orbitSessionTitlePrevWorkspacePath__`
is updated _after_ `clearAllTitleState()` returns. To avoid recursion, keep the function free of UIStore writes
and advance the previous-path token _before_ clearing the loading Set.

```typescript
function clearAllTitleState(): void {
  freshestTitles.clear();
  pendingTitles.clear();
  aiTitleGenerated.clear();
  aiTitleInFlight.clear();
  titlesNeedingRetry.clear();
  titleSessionAliases.clear();
  titleGenerationEpoch.clear(); // ← ADD (see epoch mechanism below)
  // NOTE: Do NOT call useUIStore.setState() here — this function runs inside a
  // useUIStore.subscribe() callback. Writing to the store would re-trigger the
  // subscriber before __orbitSessionTitlePrevWorkspacePath__ is advanced, causing
  // infinite recursion on workspace switch.
}

function clearAllTitleLoading(): void {
  useUIStore.setState({ titleLoadingSessions: new Set<string>() });
}
```

**Update the workspace-path subscription** to advance the previous-path token _before_ clearing:

```typescript
sessionTitleGlobals.__orbitSessionTitleWorkspaceUnsub__ = useUIStore.subscribe((state) => {
  const previousWorkspacePath = sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__;
  const workspacePath = state.workspacePath;

  if (
    previousWorkspacePath !== undefined &&
    previousWorkspacePath !== null &&
    previousWorkspacePath !== workspacePath
  ) {
    // Advance the comparison token FIRST so any nested store writes
    // from clearAllTitleLoading() do not re-trigger this branch.
    sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__ = workspacePath;
    clearAllTitleState();
    clearAllTitleLoading();
    return;
  }

  sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__ = workspacePath;
});
```

**In `applyManualSessionTitle`** (~line 309, replace the full function):

```typescript
export function applyManualSessionTitle(sessionId: string, title: string): Promise<boolean> {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);

  // Snapshot whether this session was already settled before we latch it.
  // If persistence fails below, we must undo only the flag WE introduced —
  // not one that was already present from a prior successful AI or manual title.
  const wasAlreadySettled = aiTitleGenerated.has(canonicalId);

  // Mark title as settled — blocks future generateAITitle retry attempts from agent:complete.
  // Bump epoch to invalidate any currently in-flight AI request.
  // Clear skeleton immediately — user provided an explicit title.
  aiTitleGenerated.add(canonicalId);
  bumpTitleEpoch(canonicalId);
  useUIStore.getState().setTitleLoading(canonicalId, false);

  freshestTitles.set(canonicalId, title);
  useUIStore.getState().updateConversationTitle(canonicalId, title);

  return persistTitle(canonicalId, title).catch((err: unknown) => {
    // Roll back freshestTitles (existing behavior)
    if (freshestTitles.get(canonicalId) === title) {
      freshestTitles.delete(canonicalId);
    }
    titlesNeedingRetry.delete(canonicalId);

    // Roll back the settled flag ONLY if this rename introduced it.
    // Without this, a failed rename leaves aiTitleGenerated latched —
    // use-sidebar-actions.ts reverts the visible title, but generateAITitle
    // stays blocked, so the conversation is stuck on its fallback title
    // with no way to recover via AI retry.
    if (!wasAlreadySettled) {
      aiTitleGenerated.delete(canonicalId);
    }

    throw err;
  });
}
```

> **Why snapshot `wasAlreadySettled`?** If the session already had a successful AI title or a prior
> successful manual rename, `aiTitleGenerated` was already set. A failed second rename must NOT
> remove that flag — the earlier title is still valid and should remain settled. Only remove it
> when this rename was the call that first introduced the flag.
>
> **Why all three optimistic actions?**
>
> - `aiTitleGenerated.add()` prevents `agent:complete` from starting a _new_ AI title request on future turns. Without this, a manual rename after a failed first attempt would be overwritten by the next retry.
> - `bumpTitleEpoch()` invalidates any _currently in-flight_ AI callback's stale-result guard.
> - `setTitleLoading(false)` clears the skeleton so the user sees their title immediately.

**In `clearSessionTitleState`** (~line 322, add before the alias loop):

```typescript
bumpTitleEpoch(canonicalId); // Invalidate any in-flight AI request for deleted session
useUIStore.getState().setTitleLoading(canonicalId, false);
useUIStore.getState().setTitleLoading(sessionId, false);
```

**In `remapSessionTitleState`** (~line 253, add at end):

```typescript
// Transfer epoch from old to new session ID (preserves stale-result protection)
const epoch = titleGenerationEpoch.get(oldSessionId);
if (epoch !== undefined) {
  titleGenerationEpoch.delete(oldSessionId);
  titleGenerationEpoch.set(newSessionId, epoch);
}

// Transfer loading state from old to new session ID
const uiStore = useUIStore.getState();
if (uiStore.titleLoadingSessions.has(oldSessionId)) {
  uiStore.setTitleLoading(oldSessionId, false);
  uiStore.setTitleLoading(newSessionId, true);
}
```

**Export** `setTitleLoading` is not needed from session service — it's only called internally.

### Step 3: ConversationItem — Skeleton in sidebar

In `apps/agent/src/components/layout/primary-sidebar/components/ConversationItem.tsx`:

**Add import**:

```typescript
import { useIsTitleLoading } from '@/stores/ui';
```

**Add hook call** inside the component (after existing hooks, ~line 51):

```typescript
const isTitleLoading = useIsTitleLoading(conversation.sessionId);
```

**Replace title text** (~line 184-185). Change `{conversation.title}` to:

```typescript
{isTitleLoading ? (
  <span className={cn(
    'inline-block h-3.5 w-28 rounded animate-pulse',
    active ? 'bg-foreground/20' : 'bg-foreground/10'
  )} />
) : (
  conversation.title
)}
```

> The skeleton bar: `h-3.5` matches `text-base` line height, `w-28` (~112px) gives a natural title-width feel, `rounded` for soft edges, `animate-pulse` for the loading animation. Active row uses `bg-foreground/20` for contrast against the `bg-foreground/10` button background; inactive uses `bg-foreground/10`. Reduced motion is handled globally in `globals.css` (line 1966-1971) — `animate-pulse` is disabled under `prefers-reduced-motion: reduce`, leaving a static colored bar as a loading indicator.

Also update the parent `<button>` (~line 162) to suppress the tooltip but preserve the accessible name:

```typescript
title={isTitleLoading ? undefined : conversation.title}
aria-label={conversation.title}
```

> **Why `aria-label`?** Replacing the visible title text with a decorative skeleton removes the button's accessible name for keyboard and screen-reader users. The fallback title still exists in state — `aria-label` preserves it as the accessible name while the skeleton is visible. The `aria-label` is unconditional because it matches the visible text when not loading and overrides the hidden text when loading.

### Step 4: content-top-bar — Skeleton in header

In `apps/agent/src/components/layout/content-top-bar.tsx`:

**Add import** (~line 30, alongside existing UI store imports):

```typescript
import { useIsTitleLoading } from '@/stores/ui';
```

**Add hook call** (after the `useShallow` block, ~line 302):

```typescript
// Use existing `activeConversationId` from the useShallow destructure above (line 294).
// Do NOT add a separate useUIStore selector — it would create a redundant subscription.
const isTitleLoading = useIsTitleLoading(activeConversationId);
```

**Update overflow effect deps** (~line 260-267). Add `isTitleLoading` so the fade recalculates when the visible content changes from real text to a fixed-width skeleton:

```typescript
// Re-check when content, sidebar state, or title loading changes
useEffect(() => {
  checkOverflow();
  const timer = setTimeout(checkOverflow, 250);
  return (): void => {
    clearTimeout(timer);
  };
}, [sidebarOpen, workspaceName, conversationTitle, isTitleLoading, checkOverflow]);
```

**Update rendering** (~line 469). Change the condition and content:

```typescript
{conversationTitle || isTitleLoading ? (
  <>
    <div className="w-px h-3.5 bg-lg-separator shrink-0" />
    {isTitleLoading ? (
      <span className="inline-block h-3.5 w-28 rounded bg-foreground/10 animate-pulse" />
    ) : (
      <span
        data-tauri-drag-region={false}
        className="text-base text-foreground cursor-pointer hover:text-foreground transition-colors whitespace-nowrap"
      >
        {conversationTitle}
      </span>
    )}
  </>
) : null}
```

### Step 5: chat-header — Skeleton in breadcrumb

In `apps/agent/src/components/chat/chat-header.tsx`:

**Add import** (~line 19):

```typescript
useIsTitleLoading,
```

**Add hook call** (~line 95):

```typescript
const activeConversationId = useUIStore((state) => state.activeConversationId);
const isTitleLoading = useIsTitleLoading(activeConversationId);
```

**Update rendering** (~line 128). Change the condition and content:

```typescript
{activeConversationTitle || isTitleLoading ? (
  <>
    <span className="mx-2 opacity-30 shrink-0">/</span>
    {isTitleLoading ? (
      <span className="inline-block h-3.5 w-28 rounded bg-foreground/10 animate-pulse" />
    ) : (
      <span
        className="opacity-70 truncate flex-1 min-w-0"
        title={activeConversationTitle}
      >
        {activeConversationTitle}
      </span>
    )}
  </>
) : null}
```

## Edge Cases

| Scenario                                                  | Behavior                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI title generation fails                                 | `finally` block sets `loading = false` (if epoch matches) → fallback title becomes visible                                                                                                                                                                                                                                               |
| User renames while loading                                | `applyManualSessionTitle` adds to `aiTitleGenerated` (blocks future retries) + bumps epoch (invalidates in-flight) + clears loading. Skeleton disappears immediately, user's title shows. Late AI callback sees epoch mismatch → discards result. Future `agent:complete` retries are blocked by `aiTitleGenerated`.                     |
| User renames after failed AI title (no in-flight request) | `applyManualSessionTitle` adds to `aiTitleGenerated` — next `agent:complete` retry sees `aiTitleGenerated.has(canonicalId)` → returns immediately without starting a new AI request. Manual title is never overwritten.                                                                                                                  |
| Workspace switch                                          | `clearAllTitleState` clears module-level state (including epoch map). `clearAllTitleLoading` clears UIStore Set. Previous-path token is advanced _before_ either runs to prevent subscriber recursion.                                                                                                                                   |
| Session delete                                            | `clearSessionTitleState` bumps epoch + clears loading for that session. Late AI callback for deleted session is discarded.                                                                                                                                                                                                               |
| Session remap (system:init)                               | `remapSessionTitleState` transfers loading to new session ID                                                                                                                                                                                                                                                                             |
| User sends 2nd message before AI title arrives            | `aiTitleInFlight` gate prevents duplicate `generateAITitle` calls; loading remains true until first call completes                                                                                                                                                                                                                       |
| Deleted session ID reused before AI resolves              | Epoch was bumped on delete; late callback sees epoch mismatch → no-op                                                                                                                                                                                                                                                                    |
| ContentTopBar overflow during loading                     | `isTitleLoading` is in the overflow effect deps → fade recalculates when skeleton replaces/restores text                                                                                                                                                                                                                                 |
| Screen reader / keyboard user during loading              | `aria-label={conversation.title}` preserves the accessible name even when visible text is replaced by a decorative skeleton                                                                                                                                                                                                              |
| Manual rename fails (persistence error)                   | `use-sidebar-actions.ts` catch path reverts visible title. `applyManualSessionTitle` catch rolls back `aiTitleGenerated` (if this rename introduced it) so `agent:complete` retries are unblocked. Epoch bump from the failed rename still invalidates any in-flight AI callback — the next `agent:complete` will start a fresh request. |
| Manual rename fails after earlier AI failure              | AI title failed on turn 1 → user renames → rename persistence fails → `aiTitleGenerated` rolled back → `agent:complete` on turn 2 calls `generateAITitle` → allowed (not blocked) → AI title replaces fallback.                                                                                                                          |
| Manual rename fails after successful AI title             | AI title succeeded earlier (set `aiTitleGenerated`) → user renames → rename persistence fails → `wasAlreadySettled` is `true` → `aiTitleGenerated` NOT rolled back → session stays settled on the earlier AI title.                                                                                                                      |

## Verification

### Required automated tests

**1. `apps/agent/src/__tests__/unit/services/session/session-title-service.test.ts`** — loading state lifecycle:

```typescript
it('sets loading on generateAITitle and clears on success', async () => {
  const { generateAITitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');
  mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');

  generateAITitle('session-1', 'hello');
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);

  await flushAsync();
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
});

it('clears loading on generateAITitle failure', async () => {
  const { generateAITitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');
  mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

  generateAITitle('session-1', 'hello');
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);

  await flushAsync();
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
});

it('discards stale AI completion after manual rename (epoch guard)', async () => {
  const { generateAITitle, applyManualSessionTitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');

  const deferred = createDeferred<string>();
  mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

  generateAITitle('session-1', 'hello');
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);

  // Manual rename bumps epoch → skeleton clears
  void applyManualSessionTitle('session-1', 'My Custom Title');
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);

  // Late AI result arrives — should NOT overwrite manual title
  deferred.resolve('AI Title');
  await flushAsync();
  const conv = useUIStore.getState().conversations.find((c) => c.sessionId === 'session-1');
  expect(conv?.title).toBe('My Custom Title');
});

it('blocks future AI title retries after manual rename', async () => {
  const { generateAITitle, applyManualSessionTitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');
  mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

  // First AI title attempt fails
  generateAITitle('session-1', 'hello');
  await flushAsync();
  expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);

  // User manually renames
  void applyManualSessionTitle('session-1', 'My Custom Title');

  // Simulate agent:complete retry — should be blocked by aiTitleGenerated
  mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');
  generateAITitle('session-1', 'hello');
  await flushAsync();

  // Manual title should NOT be overwritten
  const conv = useUIStore.getState().conversations.find((c) => c.sessionId === 'session-1');
  expect(conv?.title).toBe('My Custom Title');
  // generateSessionTitle should NOT have been called again
  expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);
});

it('always cleans up aiTitleInFlight even on epoch mismatch', async () => {
  const { generateAITitle, applyManualSessionTitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');

  const deferred = createDeferred<string>();
  mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

  generateAITitle('session-1', 'hello');
  // Manual rename bumps epoch while request is in-flight
  void applyManualSessionTitle('session-1', 'My Custom Title');

  // Late result arrives — epoch mismatch, but aiTitleInFlight should still be cleaned up
  deferred.resolve('AI Title');
  await flushAsync();

  // aiTitleInFlight must NOT be stuck — a future generateAITitle should not be blocked
  // by a stale in-flight entry (it's blocked by aiTitleGenerated from the manual rename instead)
  // We verify by checking that the session is in aiTitleGenerated, not aiTitleInFlight
  const conv = useUIStore.getState().conversations.find((c) => c.sessionId === 'session-1');
  expect(conv?.title).toBe('My Custom Title');
});

it('rolls back aiTitleGenerated when manual rename persistence fails', async () => {
  const { generateAITitle, applyManualSessionTitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');
  mockGenerateSessionTitle.mockRejectedValueOnce(new Error('network'));

  // First AI title attempt fails
  generateAITitle('session-1', 'hello');
  await flushAsync();

  // User manually renames — persistence will fail
  mockConversationUpdateTitle.mockRejectedValueOnce(new Error('disk full'));
  await expect(applyManualSessionTitle('session-1', 'My Title')).rejects.toThrow('disk full');

  // aiTitleGenerated should be rolled back — AI retry should be allowed
  mockGenerateSessionTitle.mockResolvedValueOnce('AI Recovery Title');
  generateAITitle('session-1', 'hello');
  await flushAsync();

  const conv = useUIStore.getState().conversations.find((c) => c.sessionId === 'session-1');
  expect(conv?.title).toBe('AI Recovery Title');
});

it('preserves aiTitleGenerated when failed rename follows a successful AI title', async () => {
  const { generateAITitle, applyManualSessionTitle, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-1');
  mockGenerateSessionTitle.mockResolvedValueOnce('AI Title');

  // Successful AI title
  generateAITitle('session-1', 'hello');
  await flushAsync();

  // User renames — persistence fails
  mockConversationUpdateTitle.mockRejectedValueOnce(new Error('disk full'));
  await expect(applyManualSessionTitle('session-1', 'My Title')).rejects.toThrow('disk full');

  // aiTitleGenerated should NOT be rolled back — it was set by the AI, not this rename
  mockGenerateSessionTitle.mockResolvedValueOnce('Should Not Run');
  generateAITitle('session-1', 'hello');
  await flushAsync();

  // generateSessionTitle should NOT have been called again (still blocked)
  expect(mockGenerateSessionTitle).toHaveBeenCalledTimes(1);
});

it('transfers loading state on remap', async () => {
  const { generateAITitle, remapSessionTitleState, useUIStore } = await loadModules();
  seedConversation(useUIStore, 'session-old');

  const deferred = createDeferred<string>();
  mockGenerateSessionTitle.mockReturnValueOnce(deferred.promise);

  generateAITitle('session-old', 'hello');
  expect(useUIStore.getState().titleLoadingSessions.has('session-old')).toBe(true);

  useUIStore.getState().remapConversation('session-old', 'session-new');
  remapSessionTitleState('session-old', 'session-new');
  expect(useUIStore.getState().titleLoadingSessions.has('session-new')).toBe(true);
  expect(useUIStore.getState().titleLoadingSessions.has('session-old')).toBe(false);

  deferred.resolve('AI Title');
  await flushAsync();
  expect(useUIStore.getState().titleLoadingSessions.size).toBe(0);
});
```

**2. Component render tests** — skeleton rendering and accessible name:

```tsx
// apps/agent/src/__tests__/components/layout/primary-sidebar/conversation-item-skeleton.test.tsx
it('renders skeleton with accessible name while title is loading', () => {
  useUIStore.setState({
    ...useUIStore.getState(),
    titleLoadingSessions: new Set(['session-1']),
  });

  render(<ConversationItem conversation={{ sessionId: 'session-1', title: 'Fallback Title', ... }} />);

  // Accessible name preserved via aria-label
  expect(screen.getByRole('button', { name: 'Fallback Title' })).toBeInTheDocument();
  // Skeleton is rendered
  expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
});

it('renders title text when not loading', () => {
  render(<ConversationItem conversation={{ sessionId: 'session-1', title: 'My Title', ... }} />);
  expect(screen.getByText('My Title')).toBeInTheDocument();
  expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
});
```

**3. Header render tests** — skeleton rendering in ContentTopBar and ChatHeader:

```tsx
// apps/agent/src/__tests__/components/layout/content-top-bar-skeleton.test.tsx
it('renders skeleton in ContentTopBar while active title is loading', () => {
  useUIStore.setState({
    ...useUIStore.getState(),
    activeConversationId: 'session-1',
    activeConversationTitle: 'Fallback Title',
    titleLoadingSessions: new Set(['session-1']),
  });

  render(<ContentTopBar sidebarOpen={false} />);

  expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  expect(screen.queryByText('Fallback Title')).not.toBeInTheDocument();
});

it('renders title text in ContentTopBar when not loading', () => {
  useUIStore.setState({
    ...useUIStore.getState(),
    activeConversationId: 'session-1',
    activeConversationTitle: 'Real Title',
    titleLoadingSessions: new Set(),
  });

  render(<ContentTopBar sidebarOpen={false} />);

  expect(screen.getByText('Real Title')).toBeInTheDocument();
  expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
});
```

```tsx
// apps/agent/src/__tests__/components/chat/chat-header-skeleton.test.tsx
it('renders skeleton in ChatHeader while active title is loading', () => {
  useUIStore.setState({
    ...useUIStore.getState(),
    activeConversationId: 'session-1',
    activeConversationTitle: 'Fallback Title',
    titleLoadingSessions: new Set(['session-1']),
  });

  render(<ChatHeader />);

  expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  expect(screen.queryByText('Fallback Title')).not.toBeInTheDocument();
});

it('renders title text in ChatHeader when not loading', () => {
  useUIStore.setState({
    ...useUIStore.getState(),
    activeConversationId: 'session-1',
    activeConversationTitle: 'Real Title',
    titleLoadingSessions: new Set(),
  });

  render(<ChatHeader />);

  expect(screen.getByText('Real Title')).toBeInTheDocument();
  expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
});
```

### Build & lint checks

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run test` — all new and existing tests pass

### Manual verification

1. `bunx tauri dev` — manual test:
   - Create new conversation, type "hello", press enter
   - Sidebar should show pulsing skeleton bar (not "hello")
   - Header should show pulsing skeleton bar
   - After ~1-2s, AI title replaces skeleton in both locations
   - If AI title fails (disconnect network), fallback "hello" should appear after timeout
2. Manual rename during loading — rename a conversation while the skeleton is pulsing → skeleton should disappear immediately, renamed title should show, AI title should NOT overwrite it
3. Accessibility — tab to a loading conversation row → screen reader should announce fallback title text

---

## Audit findings incorporated

_From `reviews/audit-plan.md` — four audit rounds (2026-03-07):_

### Round 1 — Initial audit

| Finding                                                                                                               | Severity    | Resolution                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `clearAllTitleState` calls `useUIStore.getState().set(...)` — `set` not on UIStore interface, crashes at runtime      | Critical    | Changed to `useUIStore.setState()` via separate `clearAllTitleLoading()` function             |
| `applyManualSessionTitle` doesn't clear loading — skeleton persists during manual rename                              | Critical    | Added `bumpTitleEpoch()` + `setTitleLoading(false)` at top of `applyManualSessionTitle`       |
| `content-top-bar.tsx` adds redundant `useUIStore` selector for `activeConversationId` (already in `useShallow` block) | Critical    | Removed duplicate selector, use existing `activeConversationId` from `useShallow` destructure |
| Skeleton `bg-foreground/10` invisible on active row (`bg-foreground/10` background)                                   | Recommended | Active row uses `bg-foreground/20`; inactive uses `bg-foreground/10` via `cn()`               |
| `setTitleLoading` creates new Set unnecessarily — `enableMapSet()` already called                                     | Recommended | Changed to direct `.add()`/`.delete()` mutation matching `sessionWorktreeMap` pattern         |
| Skeleton markup duplicated in 3 components                                                                            | Recommended | Noted — consider extracting `TitleSkeleton` component during implementation                   |

### Round 2 — Deep lifecycle audit

| Finding                                                                                                                                                                                            | Severity    | Resolution                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useUIStore.setState()` inside `clearAllTitleState()` re-enters the workspace-path subscriber before `__orbitSessionTitlePrevWorkspacePath__` is advanced — infinite recursion on workspace switch | Critical    | Split into `clearAllTitleState()` (no store writes) + `clearAllTitleLoading()`. Subscriber advances the previous-path token _before_ calling either function.                                                                                        |
| Late AI completion overwrites manual rename — `applyManualSessionTitle` clears skeleton but `generateAITitle` callback still calls `applySessionTitle`                                             | Critical    | Added `titleGenerationEpoch` per-session counter. `generateAITitle` captures epoch; callback discards result if epoch was bumped by manual rename, delete, or session reuse. `applyManualSessionTitle` and `clearSessionTitleState` both bump epoch. |
| Verification section too thin for a stateful async change — no automated tests for loading-state transitions or UI rendering                                                                       | Critical    | Added required automated test section: lifecycle tests (success, failure, remap, epoch guard) in `session-title-service.test.ts` + component render tests for skeleton and accessible name in ConversationItem.                                      |
| Removing visible title text from sidebar button removes accessible name for screen readers                                                                                                         | Recommended | Added `aria-label={conversation.title}` on the button — preserves accessible name while skeleton is visible.                                                                                                                                         |
| ContentTopBar overflow/fade measurement does not depend on `isTitleLoading` — fade state can become stale when skeleton replaces text                                                              | Recommended | Added `isTitleLoading` to the overflow effect dependencies.                                                                                                                                                                                          |
| Skeleton styling (`bg-foreground/10`) does not match existing skeleton patterns (`bg-lg-control`, `bg-muted/60`)                                                                                   | Recommended | Noted — consider using semantic tokens during implementation for visual consistency.                                                                                                                                                                 |

### Round 3 — Retry path and in-flight cleanup

| Finding                                                                                                                                                                                                                                                         | Severity    | Resolution                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent:complete` retries `generateAITitle()` on every turn. Epoch only invalidates in-flight requests, but `applyManualSessionTitle` never adds to `aiTitleGenerated` — a retry after manual rename starts a fresh AI request that overwrites the manual title. | Critical    | `applyManualSessionTitle` now adds the session to `aiTitleGenerated` before bumping epoch, blocking all future `generateAITitle` retry attempts from `agent:complete`. |
| When epoch mismatches in `finally`, `aiTitleInFlight` is never deleted — leaves it stuck. Coincidentally protective but not intentional; inconsistent if state is later cleared by workspace switch.                                                            | Critical    | `aiTitleInFlight.delete()` moved outside the epoch guard in `finally` — always cleans up. Only `setTitleLoading(false)` remains epoch-gated.                           |
| Automated tests don't cover retry-after-manual-rename or in-flight cleanup on epoch mismatch                                                                                                                                                                    | Recommended | Added two tests: `blocks future AI title retries after manual rename` and `always cleans up aiTitleInFlight even on epoch mismatch`.                                   |

### Round 4 — Failed rename rollback and header test coverage

| Finding                                                                                                                                                                                                                                                                                                                                         | Severity    | Resolution                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyManualSessionTitle` adds to `aiTitleGenerated` before persistence succeeds, but the `.catch()` path does not roll it back. If the rename fails, `use-sidebar-actions.ts` reverts the visible title, but `aiTitleGenerated` stays latched — blocking all future AI title retries and leaving the conversation stuck on its fallback title. | Critical    | `applyManualSessionTitle` now snapshots `wasAlreadySettled` before adding to `aiTitleGenerated`. The `.catch()` path rolls back `aiTitleGenerated.delete(canonicalId)` only if this rename introduced the flag (`!wasAlreadySettled`). A failed rename after a prior successful AI title preserves the settled state. |
| Header skeleton branches (ContentTopBar, ChatHeader) rely on manual verification only — no automated render coverage protects against regressions.                                                                                                                                                                                              | Recommended | Added render tests for both `ContentTopBar` and `ChatHeader` that assert skeleton-vs-title switching for an active loading session.                                                                                                                                                                                   |
| No automated tests cover the failed-rename rollback path or the snapshot/conditional-rollback of `aiTitleGenerated`.                                                                                                                                                                                                                            | Recommended | Added two tests: `rolls back aiTitleGenerated when manual rename persistence fails` and `preserves aiTitleGenerated when failed rename follows a successful AI title`.                                                                                                                                                |
