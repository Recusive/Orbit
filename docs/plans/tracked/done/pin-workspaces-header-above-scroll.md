# Plan: Pin Workspaces Header Above Scroll Container

## Context

When the sidebar's conversation list gets long, scrolling moves **everything** off the top — including the "Workspaces" heading and the workspace/worktree row (e.g., "orbit-marketing"). The user wants these to stay pinned while only conversation items scroll.

CSS `sticky` was considered but rejected: `--sidebar` resolves to a semi-transparent color (`#0000001a`) in liquid glass mode, so scrolled conversations would bleed through the sticky header. Instead, we follow the **existing PrimarySidebar pattern** — move the header outside the scroll container as a `shrink-0` flex child, matching how the search bar, "Sessions" heading, and action items already work.

## Changes

### 1. `ConversationList.tsx` — Simplify to conversation items only

**Remove** the "Workspaces" heading, worktree rows, and workspace row from this component. It becomes a thin wrapper around `renderConversations()`.

**New props interface** (removed worktree-related props):

```tsx
interface ConversationListProps {
  readonly conversations: ConversationSummary[];
  readonly expanded: boolean; // ← NEW: replaces internal worktree lookup
  readonly activeConversationId: string | null;
  readonly editingConversationId: string | null;
  readonly onLoadConversation: (sessionId: string) => void;
  readonly onStartEditConversation: (sessionId: string) => void;
  readonly onRenameConversation: (sessionId: string, newTitle: string) => void;
  readonly onCancelEditConversation: () => void;
  readonly onDeleteConversation: (conv: ConversationSummary) => void;
  readonly onDuplicateConversation: (sessionId: string) => void;
}
```

**Removed props:** `worktrees`, `workspaceName`, `activeWorktreePath`, `onToggleWorktree`, `onSelectWorktree`, `onRemoveWorktree`, `onOpenCreateWorktree`.

**Removed code:**

- "Workspaces" heading JSX + Tooltip/Plus imports
- Worktree map rendering
- WorkspaceItem rendering
- `effectiveActiveWorktreePath` / `mainWorktreePath` computed values
- WorkspaceItem / WorktreeItem imports

**Kept:** `renderConversations()` function (grid animation, timeline, ConversationItem list). The component just calls `renderConversations(conversations, expanded)`.

### 2. `PrimarySidebar.tsx` — Add workspaces header as shrink-0 section

Add a new `shrink-0` section between the action items and the scroll container.

**Updated React import** (add `useLayoutEffect` to existing import at line 25):

```tsx
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
```

**New component imports:**

```tsx
import { WorktreeItem } from '@/components/sidebar';
import { WorkspaceItem } from './components/WorkspaceItem';
```

**New computed values, ref, and effect** — placement order matters. These go after `activeTab`/`editorTab` (line ~240), `isWelcome` (line ~286), and `worktrees`/`activeWorktreePath` (line ~222) are all defined:

```tsx
const mainWorktreePath = worktrees.find((wt) => wt.worktree.isMain)?.worktree.path ?? null;
const effectiveActiveWorktreePath = activeWorktreePath ?? mainWorktreePath;
const activeWorktreeExpanded =
  worktrees.length > 0
    ? (worktrees.find((wt) => wt.worktree.path === effectiveActiveWorktreePath)?.isExpanded ?? true)
    : true;

// Ref for the worktree list container — used by the auto-scroll effect
const worktreeListRef = useRef<HTMLDivElement>(null);
```

**New derived boolean** — must be placed after `isWelcome`, `vaultOpen`, `settingsOpen`, `isEditorMode`, `activeTab`, `editorTab` are all defined (best spot: right after the `useSidebarActions` block, ~line 285):

```tsx
const showingSessionsUi =
  !isWelcome &&
  !vaultOpen &&
  !settingsOpen &&
  ((!isEditorMode && activeTab === 'conversations') || (isEditorMode && editorTab === 'sessions'));
```

**New useLayoutEffect** — place immediately after `showingSessionsUi`:

```tsx
useLayoutEffect(() => {
  if (!showingSessionsUi || !effectiveActiveWorktreePath || !worktreeListRef.current) return;
  const el = worktreeListRef.current.querySelector<HTMLElement>(
    `[data-worktree-path="${CSS.escape(effectiveActiveWorktreePath)}"]`
  );
  el?.scrollIntoView({ block: 'nearest' });
}, [showingSessionsUi, effectiveActiveWorktreePath, worktrees.length]);
```

- `effectiveActiveWorktreePath` — fires on active worktree switch
- `showingSessionsUi` — fires when Explorer → Sessions or Source Control → Sessions tab switch reveals the list
- `worktrees.length` — fires when rows arrive after delayed hydration (`loadWorktrees()` completes)
- `useLayoutEffect` runs before paint — no visible flash of wrong scroll position
- `block: 'nearest'` is a no-op if already visible

**New JSX section** — insert between the action items `</div>` (~line 567) and the scroll container `<div ref={scrollContainerRef}>` (~line 570):

```tsx
{
  /* Workspaces header — pinned above scroll */
}
{
  showingSessionsUi ? (
    <div className="shrink-0 py-1.5 animate-title-in">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
          Workspaces
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Create worktree"
              className="relative h-5 w-5 flex items-center justify-center rounded-md hover:bg-lg-sidebar-hover active:scale-90 transition-transform duration-75 text-muted-foreground hover:text-foreground shrink-0 before:absolute before:content-[''] before:inset-[-10px]"
              onClick={handleOpenCreateWorktree}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span>Create worktree</span>
          </TooltipContent>
        </Tooltip>
      </div>
      {/* Worktree list — capped at ~5 rows (160px) to prevent starving the conversation scroll area.
         Each WorktreeItem is h-8 (32px). With 8+ worktrees this inner container scrolls independently.
         Active worktree auto-scrolls into view via useEffect keyed on effectiveActiveWorktreePath. */}
      <div
        ref={worktreeListRef}
        className="flex flex-col gap-0.5 mt-1 max-h-[160px] overflow-y-auto overscroll-y-contain"
      >
        {worktrees.length > 0 ? (
          worktrees.map((wt) => (
            <div key={wt.worktree.path} data-worktree-path={wt.worktree.path}>
              <WorktreeItem
                worktreeState={wt}
                active={wt.worktree.path === effectiveActiveWorktreePath}
                onToggle={() => {
                  toggleWorktreeExpanded(wt.worktree.path);
                }}
                onSelect={() => {
                  useUIStore.getState().switchToWorktree(wt.worktree.path);
                  useChatStore.getState().clearActiveSession();
                }}
                onRemove={() => {
                  handleOpenDeleteWorktreeDialog(wt.worktree);
                }}
              />
            </div>
          ))
        ) : workspaceName ? (
          <WorkspaceItem name={workspaceName} active expanded onToggle={() => {}} />
        ) : null}
      </div>
    </div>
  ) : null;
}
```

**Update ConversationList call sites** (both at ~line 665 and ~line 692) — remove worktree props, add `expanded`:

```tsx
<ConversationList
  conversations={conversations}
  expanded={activeWorktreeExpanded}
  activeConversationId={activeConversationId}
  editingConversationId={editingConversationId}
  onLoadConversation={handleLoadConversation}
  onStartEditConversation={setEditingConversationId}
  onRenameConversation={(sessionId, newTitle) => {
    handleRenameConversation(sessionId, newTitle);
  }}
  onCancelEditConversation={() => {
    setEditingConversationId(null);
  }}
  onDeleteConversation={handleOpenDeleteDialog}
  onDuplicateConversation={handleDuplicateConversation}
/>
```

Note: There are TWO ConversationList render sites in PrimarySidebar — one for agent mode (~line 692) and one for editor mode sessions tab (~line 665). Both need the same prop update.

## Files Modified

| File                                                                               | Change                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/layout/primary-sidebar/components/ConversationList.tsx` | Remove header/worktree rendering, simplify to conversation items + `expanded` prop                               |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`              | Add workspaces header section as `shrink-0`, import WorktreeItem/WorkspaceItem, compute `activeWorktreeExpanded` |

## Why Not `position: sticky`

`--sidebar` resolves to `var(--orbit-background-alpha-200)` → `#0000001a` (10% opacity) in liquid glass mode. A sticky header with this background would let conversation items show through as they scroll underneath. Making it opaque with `bg-background` would create a visible solid band on the frosted glass sidebar. Moving the header outside the scroll container avoids all background issues and matches the existing pattern.

## Review Notes

- **Approved with changes** by audit. One critical issue addressed (see below).
- **`useConversationList()` verified**: Returns ALL workspace conversations (not filtered by worktree). Safe to extract.
- **Visual behavior change in multi-worktree**: Conversations shift from "nested under active worktree row" to "below all worktree rows." Worth a visual check.
- **PrimarySidebar length**: Adding ~40 lines of JSX to an 879-line file. Consider extracting a `WorkspacesHeader` component later if it feels heavy — not blocking.

### Audit fix: Cap worktree list height

**Problem**: Pinning the full worktree list as `shrink-0` can consume most sidebar height in repos with many worktrees (8-20), leaving near-zero height for conversations.

**Fix**: Added `max-h-[160px] overflow-y-auto overscroll-y-contain` to the worktree container. This caps at ~5 visible rows (each WorktreeItem is `h-8` = 32px). Beyond 5, the worktree list scrolls independently within the pinned section. The "Workspaces" heading always stays visible above.

### Audit fix 2: Auto-scroll active worktree into view (stable layout effect)

**Problem**: The capped inner scroller can hide the active worktree row (e.g., restored from persisted state below row 5, or when switching tabs back to Sessions). Conversations render below a row the user can't see.

**Fix (v3 — stable + complete)**: Use a `useLayoutEffect` with three deps: `showingSessionsUi`, `effectiveActiveWorktreePath`, and `worktrees.length`. Uses a container ref + `data-worktree-path` attributes to query the active row and call `scrollIntoView({ block: 'nearest' })`.

Three deps cover all scenarios:

- **Path change**: active worktree switch
- **Tab visibility**: Explorer → Sessions reveals the list with same path
- **Row hydration**: `loadWorktrees()` populates rows after initial render

`useLayoutEffect` runs before paint (no flash). `block: 'nearest'` is a no-op if already visible. The `showingSessionsUi` guard prevents the effect from running when the worktree list isn't mounted.

### Edge cases from audit (covered by fixes)

- 8-20 worktrees → worktree list scrolls within capped container
- Active worktree below row 5 → auto-scrolled into view on mount/switch
- Explorer → Sessions tab switch (same path) → `showingSessionsUi` dep fires the effect
- Delayed row hydration (`loadWorktrees()`) → `worktrees.length` dep fires the effect
- Restoring persisted active worktree → effect fires after hydration, scrolls to it
- Zero conversations → pinned section shows, empty scroll area below
- Narrow sidebar with long names → WorktreeItem already handles overflow with text truncation
- Worktree refresh during `loadWorktrees()` → `effectiveActiveWorktreePath` falls back to main worktree via `?? mainWorktreePath`

## Verification

1. `bun run typecheck` — no type errors from the prop changes
2. `bun run lint` — no lint issues
3. `bunx tauri dev` — visual verification:
   - Scroll a long conversation list → "Workspaces" heading and workspace row stay pinned
   - Expand/collapse worktree → grid animation still works
   - Switch between worktrees → correct conversations appear
   - Single workspace (no worktrees) → workspace row stays pinned
   - Switch to Explorer tab → workspaces header disappears
   - Switch to editor mode sessions tab → workspaces header appears
   - BranchBadge popover on worktree row → opens correctly above scroll container
   - Bottom fade mask on scroll container → still fades correctly
   - Many worktrees (8+) → worktree list scrolls within capped 160px container
   - Active worktree at position 7+ → auto-scrolled into view on mount
   - Explorer → Sessions tab switch (same path, 8+ worktrees) → active row scrolled into view
   - Liquid glass mode → no visual artifacts
