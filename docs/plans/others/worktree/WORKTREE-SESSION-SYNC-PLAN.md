# Fix Worktree ↔ Session Synchronization

## Context

The worktree system has a fundamental coordination gap: when a user clicks a worktree in the sidebar, only `activeWorktreePath` is updated (layers 1–2: UI state + file tree), but `activeSessionId` (layer 3: session management) is never switched. This causes chats to appear inconsistently under worktrees, and message persistence can write data to the wrong worktree.

Three fixes address all identified bugs. BUG 5 (conversation:list effect) and BUG 6 (loadWorktrees abort guard) are intentionally skipped — BUG 5 is correct behavior, BUG 6 is a rare race with minimal impact.

---

## Fix 1: Auto-switch conversation on worktree select (BUG 1 + BUG 3)

**Problem:** `onSelectWorktree` only calls `setActiveWorktree(path)` — never touches `activeSessionId`. User sees stale chat from previous worktree.

**Files:**

- `apps/agent/src/lib/utils/worktree-utils.ts` — **NEW** shared utility
- `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — new `handleSelectWorktree`
- `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx` — wire up `handleSelectWorktree`

**Changes:**

1. **Extract `conversationBelongsToWorktree` to `apps/agent/src/lib/utils/worktree-utils.ts`:**
   - Move the function from `use-sidebar-actions.ts` (currently module-local at lines 34-53) into a shared utility at `@/lib/utils/worktree-utils.ts`
   - This is a pure data function with no UI dependency — belongs in `@/lib/utils/`, not under a component folder

2. **Add `handleSelectWorktree(path: string)` to `useSidebarActions` return value:**

   ```typescript
   const handleSelectWorktree = useCallback(
     (path: string | null): void => {
       // 1. Update UI state
       useUIStore.getState().setActiveWorktree(path);

       // 2. Find most recent conversation for this worktree
       const conv = conversations.find((c) => conversationBelongsToWorktree(c, path));

       if (conv) {
         // Fast path: session already cached in ChatStore — no IPC round-trip
         const chatStore = useChatStore.getState();
         if (chatStore.isSessionLoaded(conv.sessionId)) {
           chatStore.setActiveSession(conv.sessionId);
           useUIStore.getState().setActiveConversation(conv.sessionId, conv.title);
           useToolStore.getState().switchSession(conv.sessionId);
           useFileStore.getState().switchSession(conv.sessionId);
         } else {
           // Cold session — full load from disk
           handleLoadConversation(conv.sessionId);
         }
       } else {
         // No conversations for this worktree — create one (fixes BUG 3)
         handleStartConversation();
       }
     },
     [conversations, handleLoadConversation, handleStartConversation]
   );
   ```

   - **Critical**: The fast-path check (`isSessionLoaded`) avoids a full `conversation:load` IPC round-trip for cached sessions, preventing visible loading flash on every worktree switch
   - Need to verify `isSessionLoaded` exists on ChatStore — if not, check `sessions[id]` directly

3. **Wire up in PrimarySidebar.tsx:**
   - Replace inline `onSelectWorktree` callbacks (~lines 500-502, 526-528) with `handleSelectWorktree`
   - Replace `CreateWorktreeDialog.onCreated` callback (~lines 602-605) with `handleSelectWorktree(worktree.path)`

---

## Fix 2: Session-pinned worktree path for message persistence (BUG 2)

**Problem:** All 5 `conversationAddMessage` call sites read live `activeWorktreePath` instead of the session's recorded worktree. If user switches worktree mid-stream, messages persist to the wrong worktree.

**Files:**

- `apps/agent/src/stores/ui/ui-store.ts` — add `resolveSessionWorktreePath` helper
- `apps/agent/src/services/chat/chat-message-service.ts` — 1 call site (~line 564)
- `apps/agent/src/hooks/chat/handlers/chat-actions.ts` — 3 call sites (handleSend ~line 98, handleStop ~line 293, handlePermissionDeny ~line 485)
- `apps/agent/src/hooks/chat/use-chat-messages.ts` — 1 call site (Effect 4, ~line 340)

**Changes:**

1. **Export `resolveSessionWorktreePath` from `ui-store.ts` — NO `activeWorktreePath` fallback:**

   ```typescript
   export function resolveSessionWorktreePath(sessionId: string): string | undefined {
     return useUIStore.getState().sessionWorktreeMap.get(sessionId);
   }
   ```

   - **Critical audit fix**: The original plan fell back to `activeWorktreePath`, which reintroduces the exact race condition this fix eliminates. Sessions without a map entry are main-workspace sessions — `undefined` is semantically correct for them.

2. **Replace all 5 call sites** — replace the entire destructuring pattern, not just downstream usage:
   - `chat-message-service.ts` ~line 564:
     ```typescript
     // BEFORE: const { workspacePath, activeWorktreePath } = useUIStore.getState();
     // AFTER:
     const { workspacePath } = useUIStore.getState();
     const worktreePath = resolveSessionWorktreePath(activeSessionId);
     ```
   - `chat-actions.ts` handleSend ~line 98: use `resolveSessionWorktreePath(sessionId)`
   - `chat-actions.ts` handleStop ~line 264/293: replace `const { workspacePath, activeWorktreePath } = useUIStore.getState()` with separate `workspacePath` destructure + `resolveSessionWorktreePath(sessionIdRef.current)`
   - `chat-actions.ts` handlePermissionDeny ~line 456/485: same pattern as handleStop
   - `use-chat-messages.ts` Effect 4 ~line 340: use `resolveSessionWorktreePath(activeSessionId)`

3. **Verify `recordSessionWorktree` is called on conversation creation:**
   - Check `handleConversationCreated` in `chat-message-service.ts` (~line 800-843)
   - If not already present, add: `if (message.worktree_path) { uiStore.recordSessionWorktree(sid, message.worktree_path); }`
   - This ensures the map is populated for all sessions, not just those created via `ensureSession`

**Note on `handleSend` new conversation path (~line 117-119):** When creating a NEW conversation, `handleSend` reads `activeWorktreePath` directly for the `conversation:create` message. This is **correct** — the worktree you're on IS the intended target for new conversations. Leave as-is.

---

## Fix 3: Clean up on worktree deletion (BUG 4)

**Problem:** `removeWorktree` in UIStore deletes the worktree from `worktrees[]` but doesn't clean `sessionWorktreeMap` entries or switch to main worktree.

**Files:**

- `apps/agent/src/stores/ui/ui-store.ts` — enhance `removeWorktree`
- `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — enhance `handleRemoveWorktree`

**Changes:**

1. **`removeWorktree` in ui-store.ts (~line 650-659):** Collect matching session IDs BEFORE entering Immer's `set()`, then batch-delete inside for atomicity:

   ```typescript
   removeWorktree: (path: string): void => {
     // Collect outside Immer proxy to avoid slow Map iteration under proxy
     const sessionIdsToClean: string[] = [];
     for (const [sid, wpath] of get().sessionWorktreeMap.entries()) {
       if (wpath === path) {
         sessionIdsToClean.push(sid);
       }
     }

     set((state) => {
       state.worktrees = state.worktrees.filter((w) => w.worktree.path !== path);
       if (state.activeWorktreePath === path) {
         state.activeWorktreePath = null;
         saveActiveWorktreeToStorage(null);
       }
       for (const sid of sessionIdsToClean) {
         state.sessionWorktreeMap.delete(sid);
       }
       saveWorktreesToStorage(state.worktrees);
     });
   },
   ```

2. **`handleRemoveWorktree` in use-sidebar-actions.ts (~line 288-313):** After successful removal, switch to main worktree using `handleSelectWorktree(null)` from Fix 1 (reuse the same auto-switch logic).

---

## Files Modified (Summary)

| File                                                                            | Fix  | Change                                                                                |
| ------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/utils/worktree-utils.ts`                                    | 1    | **NEW** — `conversationBelongsToWorktree` shared utility                              |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | 1, 3 | Add `handleSelectWorktree`, import shared util, enhance `handleRemoveWorktree`        |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`           | 1    | Wire `handleSelectWorktree` to callbacks                                              |
| `apps/agent/src/stores/ui/ui-store.ts`                                          | 2, 3 | Add `resolveSessionWorktreePath`, enhance `removeWorktree`                            |
| `apps/agent/src/services/chat/chat-message-service.ts`                          | 2    | Use `resolveSessionWorktreePath` + verify `recordSessionWorktree` in creation handler |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`                            | 2    | Use `resolveSessionWorktreePath` (3 sites), clean destructuring                       |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`                                | 2    | Use `resolveSessionWorktreePath` (1 site)                                             |

---

## Known Edge Cases (Deferred)

These are real but low-frequency — document for future hardening:

1. **Rapid worktree switching**: User clicks worktree A → starts loading → clicks worktree B before load completes. The `conversation:loaded` for A could override B. Mitigation: existing `conversationLoadEpoch` guards may partially cover this, but Fix 1 doesn't explicitly bump the epoch.

2. **Orphaned conversation on quick switch**: `handleStartConversation()` sends `conversation:create` IPC. If user switches away before `conversation:created` arrives, the session could bind to the wrong worktree.

3. **Leaked map entries from `handleConversationDeleted`**: `removeConversation` cleans `sessionWorktreeMap`, but `handleConversationDeleted` in `chat-message-service.ts` (~line 1213-1220) calls `destroySession` without `clearSessionWorktree`. Map entry leaks.

4. **`sessionWorktreeMap` is in-memory only**: Doesn't survive app restart. After restart, all sessions fall back to `undefined` (main workspace). Consider persisting to localStorage alongside `worktrees` and `activeWorktreePath`.

5. **Effect 2 stale responses**: `conversation:list` fires on `activeWorktreePath` change. Rapid switching → multiple in-flight list requests → stale responses could overwrite the conversation list.

---

## Verification

1. **Create a worktree** via plus button → new conversation should auto-create
2. **Switch between main and worktree** via sidebar → chat should switch to the correct conversation
3. **Switch to worktree with existing conversations** → should load the most recent one (no loading flash for cached sessions)
4. **Send messages in worktree** → verify they persist under the worktree (check JSONL metadata)
5. **Switch worktree mid-stream** (while agent is responding) → verify messages persist to the original session's worktree, not the newly selected one
6. **Delete a worktree** → should auto-switch to main, sessionWorktreeMap cleaned
7. **Rapid switching** → no crashes, no blank pages, correct conversation displayed
8. **Run quality checks:** `bun run check` and `./scripts/lint-all.sh`
