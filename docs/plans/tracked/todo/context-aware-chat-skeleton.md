# Plan: Context-Aware Chat Skeleton During Transitions

## Context

When the app transitions from the welcome page to the home page, a `ChatSkeleton` overlay is shown during conversation loading. Currently, it **always** shows the "ongoing chat" pattern (alternating user/assistant message blocks + bottom input bar). But if there are no existing conversations for the workspace, the user lands on the **empty chat state** — a centered input with no messages. The visual mismatch is jarring: the skeleton promises "you're resuming a conversation" but reveals "blank slate."

The fix: make `ChatSkeleton` variant-aware, showing the correct skeleton pattern based on whether we're transitioning to an ongoing conversation or a fresh empty chat.

---

## Approach: Use `conversations.length` as the Signal

**Why this works:** After `initializeWorkspace()` resets `conversations = []` at T+0, the backend responds with the real conversation list at ~T+150ms via `setConversations()`. Both the Claude and OpenCode transition paths go through this flow. The skeleton stays visible for at least 500ms (`SKELETON_MIN_DISPLAY_MS`), so the signal arrives well within the display window.

**Timing for the two paths:**

| Path                  | T+0 (reset)           | T+150ms (list loaded)            | T+500ms+ (reveal)       |
| --------------------- | --------------------- | -------------------------------- | ----------------------- |
| **No conversations**  | `[] → empty skeleton` | `[] → stays empty`               | Empty chat revealed ✓   |
| **Has conversations** | `[] → empty skeleton` | `[conv1,...] → ongoing skeleton` | Ongoing chat revealed ✓ |

The empty→ongoing morph at ~150ms (Path B) happens while the skeleton is still mid-fade-in (250ms `skeleton-fade-in` animation, ~60% opacity at 150ms), making it perceptually invisible.

**OpenCode exception:** The OpenCode backend doesn't populate `UIStore.conversations`. For `OcAgentSurface`, use `sessionId !== null` from `useOcChatAdapter()` instead — already destructured on line 25.

---

## Changes

### 1. `apps/agent/src/components/chat/chat-skeleton.tsx` — Add variant prop

Add `variant?: 'ongoing' | 'empty'` prop (default `'ongoing'` for backward compat).

- **`'ongoing'`** (current behavior): message blocks (`SKELETON_BLOCKS`) + absolute-bottom input skeleton. No markup changes.
- **`'empty'`**: centered input skeleton only. Layout mirrors `ChatContent` empty state:
  - Container: `flex-1 flex flex-col justify-center`
  - `paddingBottom: EMPTY_STATE_PADDING_BOTTOM` (`'40%'` from `chat-area/constants.ts`)
  - Single input skeleton: same `SKELETON_INPUT_HEIGHT` (84px), `maxWidth: 650px`, `rounded-[14px]`, `bg-muted/60`
  - No message blocks

Import `EMPTY_STATE_PADDING_BOTTOM` from `@/components/layout/chat-area/constants`.

### 2. `apps/agent/src/components/chat/BackendChatSurface.tsx` — Pass variant (Claude backend)

In `ClaudeAgentSurface` (~line 98):

```tsx
const conversations = useConversations(); // already exported from ui-store.ts:995
// ...
<ChatSkeleton variant={conversations.length > 0 ? 'ongoing' : 'empty'} />;
```

### 3. `apps/agent/src/components/chat/OcAgentSurface.tsx` — Pass variant (OpenCode backend)

In `OcAgentSurface` (~line 56):

```tsx
// sessionId already destructured from useOcChatAdapter() on line 25
<ChatSkeleton variant={sessionId !== null ? 'ongoing' : 'empty'} />
```

---

## What NOT to Change

- **No new store state.** Existing `conversations` array and `sessionId` are sufficient signals.
- **No animation changes.** `animate-skeleton-in` handles both variants.
- **No changes to `useLayoutStabilization`.** Variant-agnostic — watches container resize, not skeleton content.
- **No changes to `ChatContent`, `SKELETON_MIN_DISPLAY_MS`, or barrel exports.**

---

## Verification

1. **`bun run typecheck`** — Ensure the new variant prop types are correct
2. **`bun run lint`** — Check for lint violations
3. **Manual test (new workspace):** Open a workspace with no existing conversations → skeleton should show centered input only → empty chat revealed (match)
4. **Manual test (existing workspace):** Open a workspace with conversations → skeleton should show message blocks + bottom input → ongoing chat revealed (match)
5. **Manual test (worktree switch):** Switch to a worktree → same skeleton behavior based on conversation count
