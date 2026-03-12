# Plan: Convert Settings from Dialog to Page (Vault Pattern)

## Context

Settings currently renders as a Radix UI dialog modal (`SettingsDialog.tsx`) with its own internal sidebar and lazy-loaded page components. The user wants settings to behave like vault: when triggered, the primary sidebar items change to show settings navigation, and the main content area shows the settings page content. No UI/style changes — just a structural swap from modal overlay to inline page.

## Pattern Reference: How Vault Works

1. **UIStore flag**: `vaultOpen: boolean` + `setVaultOpen()` / `toggleVault()`
2. **PrimarySidebar**: Conditionally renders vault heading, "New Note" action, and `VaultNoteList` based on `vaultOpen`
3. **ChatContent**: Conditionally renders `<VaultPage />` instead of chat when `vaultOpen === true`
4. **Back button**: Sidebar header back arrow sets `vaultOpen = false`

## Implementation Steps

### Step 1: UIStore — Replace dialog state with page state + add `closeSecondarySurface` helper

**File:** `apps/agent/src/stores/ui/ui-store.ts`

**State renames:**

- Rename `settingsDialogOpen` → `settingsOpen` (boolean, same as `vaultOpen`)
- Rename `settingsDialogSection` → `settingsSection` (tracks active settings tab)
- Rename `setSettingsDialogOpen` → `setSettingsOpen`

**New centralized helper — `closeSecondarySurface()`:**

- Clears both `settingsOpen` and `vaultOpen` in a single action
- Consumed by session navigation flows (new session, load conversation, Cmd+N) so they don't need to know which surface is open

```ts
closeSecondarySurface: (): void => {
  set((state) => {
    state.vaultOpen = false;
    state.settingsOpen = false;
  });
},
```

**Update `openSettings(section?)`:**

- Set `settingsOpen = true`, `settingsSection = section ?? state.settingsSection`, `vaultOpen = false`
- **Auto-expand sidebar if collapsed**: settings page depends on the sidebar being visible for navigation. `openSettings` is triggered from keyboard (Cmd+,), toast clicks (`account-banner.tsx`), and demo mode (`App.tsx`), not just sidebar buttons. If `leftSidebarWidth <= SIDEBAR.collapsed`, restore to `lastExpandedSidebarWidth` (or `SIDEBAR.expanded` fallback).

```ts
openSettings: (section?: SettingsSection): void => {
  set((state) => {
    state.settingsSection = section ?? state.settingsSection;
    state.settingsOpen = true;
    state.vaultOpen = false;
    // Auto-expand sidebar — settings nav lives there
    if (state.leftSidebarWidth <= SIDEBAR.collapsed) {
      state.leftSidebarWidth =
        state.lastExpandedSidebarWidth > SIDEBAR.collapsed
          ? state.lastExpandedSidebarWidth
          : SIDEBAR.expanded;
    }
  });
},
```

**Update `setSettingsOpen(open)`:**

- When `open === true`: also set `vaultOpen = false` and auto-expand sidebar
- When `open === false`: just clear `settingsOpen`

**Update `setVaultOpen(open)`:**

- When `open === true`: also set `settingsOpen = false`

**Update `toggleVault()`:**

- When opening: also set `settingsOpen = false`

**New selector hooks:**

- `useSettingsOpen` selector hook (like `useVaultOpen`)
- `useSettingsSection` selector hook

### Step 2: Update session navigation flows to close settings

**Files:**

- `apps/agent/src/components/layout/content-top-bar.tsx`
- `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`

**Problem:** `handleNewSession` (content-top-bar.tsx:297-308) and `handleStartConversation` / `handleLoadConversation` (use-sidebar-actions.ts:225-249) currently only call `setVaultOpen(false)`. If the user is on the settings page and presses Cmd+N or clicks a conversation in the sidebar, settings stays open.

**Fix:** Replace `setVaultOpen(false)` with `closeSecondarySurface()` in:

- `content-top-bar.tsx:298` — `handleNewSession`
- `use-sidebar-actions.ts:227` — `handleStartConversation`
- `use-sidebar-actions.ts:243` — `handleLoadConversation`

### Step 3: Create SubagentsStore — persist fetched data across unmounts

**File:** `apps/agent/src/stores/agent/subagents-store.ts` (new)

**Problem:** `SubagentsSettings` (lines 459-518) stores `agents`, `error`, `isInitialLoad`, and `hasFetched` in component-local `useState`/`useRef`. When `SettingsPage` unmounts (settings closed), all fetched data is lost. Reopening settings triggers a re-fetch with loading flash. A UIStore `visitedSections` Set cannot solve this — it tracks visitation but the actual data still lives in the component.

**Solution:** Mirror the existing `commands-store.ts` pattern. `SlashCommandsSettings` already uses a persistent Zustand store (`useCommandsStore`) for its data, so subagents should follow suit.

```ts
// stores/agent/subagents-store.ts
interface SubagentsState {
  agents: SubagentDefinition[];
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;
}

interface SubagentsActions {
  setAgents: (agents: SubagentDefinition[]) => void;
  addAgent: (agent: SubagentDefinition) => void;
  updateAgent: (agent: SubagentDefinition) => void;
  removeAgent: (name: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  markFetched: () => void;
}
```

**`fetchSubagents` action with dedupe semantics** (mirrors `commands-store.ts` fetch behavior):

```ts
fetchSubagents: (postMessage): void => {
  const state = get();
  // Dedupe: skip if already fetched or currently loading
  if (state.hasFetched || state.isLoading) return;

  set((draft) => {
    draft.isLoading = true;
    draft.error = null;
  });

  postMessage({
    type: 'subagents:list',
    uuid: crypto.randomUUID(),
  });
},
```

The `hasFetched || isLoading` guard is the critical behavior — it prevents re-fetch on remount AND prevents concurrent requests. The response handler (in the `useTauri({ onMessage })` callback) calls `setAgents()` + `markFetched()` on success, or `setError()` on failure. On failure, `hasFetched` stays `false` so the next mount retries.

Then refactor `SubagentsSettings` to read from `useSubagentsStore()` instead of local `useState`. The `useTauri({ onMessage })` handler updates the store.

**Export from barrel:** `apps/agent/src/stores/agent/index.ts`

### Step 4: PrimarySidebar — Render settings nav items when settingsOpen

**File:** `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`

**Tab heading section** (around line 436):

- Add `settingsOpen` check alongside `vaultOpen`
- When `settingsOpen`: render "Settings" heading (like vault renders "Notes")

**Main actions section** (around line 502):

- When `settingsOpen`: hide all action buttons (New Session, Projects, Vault, Powers) — settings has no actions bar, just nav

**Tab content section** (around line 596):

- When `settingsOpen`: render a `SettingsNavList` component (reuses `NAV_ITEMS` from `SettingsSidebar.tsx`)
- Active item highlighted based on `settingsSection`

**Bottom utilities** (around line 731):

- When `settingsOpen`: hide the "Settings | Feedback" row (already inside settings)

**Back button** (around line 380):

- Add: `if (settingsOpen) { setSettingsOpen(false); }` alongside the vault check

**Cleanup:**

- Remove the `<SettingsDialog>` component render (line 785-789)
- Remove `LazySettingsDialog` lazy import (line 83-92)
- Remove `settingsDialogOpen` and `setSettingsDialogOpen` from the useShallow selector
- Remove `SettingsDialogProps` type import

### Step 5: App.tsx — Render settings page at shell level (above mode tabs)

**File:** `apps/agent/src/App.tsx`

**Why shell-level, not ChatContent:** Settings is a GLOBAL feature — accessible from all modes via keyboard shortcut (Cmd+,), sidebar bottom bar (visible in all modes), account toast (`account-banner.tsx`), provider dialog (`OcProviderDialog.tsx`), and demo mode. `ChatContent` lives inside `AgentMode`, which is hidden (`display: none`) whenever `activeTab !== 'agent'`. Rendering settings there would make it invisible when opened from editor or canvas mode.

**Rendering location:** Inside the `div.overflow-clip` wrapper (line 889), at the same level as `WelcomePage`. When settings is open, it replaces ALL mode content — the mode tabs stay mounted but hidden behind the settings surface.

**Lazy-load SettingsPage** to preserve the current code-splitting boundary (the dialog was already lazy-loaded from PrimarySidebar):

```tsx
const LazySettingsPage = lazy(() =>
  import('@/components/modals/settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  }))
);
```

**Add `settingsOpen` selector:**

```tsx
const settingsOpen = useUIStore((s) => s.settingsOpen);
```

**Render settings surface — absolute overlay, NOT conditional replacement:**

**CRITICAL: Do NOT use a ternary (settings ? ... : mode tabs).** A ternary would UNMOUNT the mode tabs when settings opens, destroying React state (chat scroll position, terminal sessions, editor content, agent streaming). Instead, render settings as an absolute-positioned overlay on top of the mode tabs. The parent `div.overflow-clip.relative` already provides the stacking context.

```tsx
<div className="flex-1 min-h-0 overflow-clip relative z-0">
  {/* Gradient fade — skip for editor, vault, AND settings */}
  {!isWelcome && activeTab !== 'editor' && !vaultOpen && !settingsOpen ? (
    <div className="absolute inset-x-0 top-0 h-8 z-10 pointer-events-none" ... />
  ) : null}

  {/* Settings surface — absolute overlay, keeps mode tabs mounted underneath */}
  {settingsOpen && !isWelcome ? (
    <div className="absolute inset-0 z-20 bg-background">
      <Suspense fallback={<SettingsSkeleton />}>
        <LazySettingsPage />
      </Suspense>
    </div>
  ) : null}

  {/* Mode content — stays mounted, hidden behind settings overlay when open */}
  {isWelcome ? (
    <WelcomePage ... />
  ) : (
    <>
      {mounted.agent ? (...AgentMode...) : null}
      {mounted.canvas ? (...CanvasMode...) : null}
      {mounted.editor ? (...EditorMode...) : null}
    </>
  )}
</div>
```

**Key details:**

- `absolute inset-0 z-20` layers settings on top of mode content without unmounting it
- `bg-background` ensures the settings page has an opaque background (mode tabs aren't visible underneath)
- `!isWelcome` guard prevents settings from rendering during the welcome page (no session yet)
- Mode tabs stay mounted throughout — React state fully preserved (chat, terminal, editor, streaming)

**Demo mode (line 136):** `openSettings('account')` now opens the settings page inline instead of a dialog overlay. No code change needed — `openSettings` still works. Update the demo scenario comment to reflect the new behavior.

**ChatContent — NO CHANGE:** `ChatContent.tsx` continues to render vault inline (vault is agent-mode-only, its button is hidden in editor mode at `PrimarySidebar.tsx:538`). Settings does NOT go here.

### Step 6: Create SettingsPage component (main content area)

**File:** `apps/agent/src/components/modals/settings/SettingsPage.tsx` (new)

- Reuse the existing page rendering logic from `SettingsDialog.tsx`:
  - `SETTINGS_PAGE_COMPONENTS` lookup
  - `Suspense` + `SettingsSkeleton` fallback
  - `useSmoothScroll` for each panel
- Full-height, scrollable, with `p-6` padding (same as dialog content area)
- NO dialog chrome (no overlay, no close button, no title bar)
- Read `settingsSection` from UIStore to determine which page to show
- **Async sections (subagents, commands):** Both now use persistent stores (`subagents-store` from Step 3, `commands-store` already exists), so no special "stay-mounted" logic is needed. Mount/unmount freely — the data survives in Zustand.
- **Modal-aware Escape key handler:**
  - Add `useEffect` with `keydown` listener
  - Guard: only close settings when `event.key === 'Escape'` AND `event.defaultPrevented === false` AND no child dialog is open
  - Both `SubagentsSettings` and `SlashCommandsSettings` embed `DialogPrimitive.Root` editors that handle their own Escape dismissal. A naive `window.keydown` would close the entire settings page when the user presses Escape inside those child dialogs.
  - Use an explicit `data-settings-child-dialog` attribute (NOT the broad `[role="dialog"]` selector which would match unrelated global dialogs):

```tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Only defer to settings-owned child dialogs, not unrelated global dialogs
    if (document.querySelector('[data-settings-child-dialog="true"][data-state="open"]') !== null)
      return;
    useUIStore.getState().setSettingsOpen(false);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

- Add `data-settings-child-dialog="true"` to the `DialogPrimitive.Content` nodes in both `SubagentsSettings` (AgentEditor dialog) and `SlashCommandsSettings` (CommandEditor dialog). This scopes the Escape guard explicitly to settings-owned dialogs rather than relying on Radix internals.

### Step 7: Create SettingsNavList component (sidebar content)

**File:** `apps/agent/src/components/layout/primary-sidebar/components/SettingsNavList.tsx` (new)

- Import `NAV_ITEMS` and `FEEDBACK_ITEM` from `SettingsSidebar.tsx`
- **Do NOT use `SidebarItem`** — its `icon` prop expects `FC<{ className?: string }>` (a component function), but `NAV_ITEMS` stores icons as `ReactNode` (pre-rendered JSX like `<Bot className="h-4 w-4" />`). These types are incompatible.
- Instead, render custom button rows directly (like `VaultNoteList` does), using the same visual styles as `SidebarItem`:
  - `cn('flex items-center gap-1.5 h-8 rounded-[9px] mx-1.5 ...')` with active/hover states
  - Fixed-width icon column via `SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding`
  - Render `item.icon` (ReactNode) directly inside the icon column
- Add a visual divider (`h-px bg-border/40`) before the Feedback item to match the current dialog sidebar layout
- Highlight active item based on `settingsSection` from UIStore
- On click: call `useUIStore.getState().openSettings(sectionId)`

### Step 8: Update root-layout.tsx keyboard shortcut handler

**File:** `apps/agent/src/components/layout/root-layout.tsx`

- `handleOpenSettings` currently calls `openSettings()` which sets `settingsDialogOpen = true`
- After renaming in UIStore, this still works — `openSettings()` now sets `settingsOpen = true`
- No functional change needed, just verify the action name didn't change

### Step 9: Update types

**File:** `apps/agent/src/components/modals/settings/types.ts`

- Remove `SettingsDialogProps` interface (no longer a dialog)
- Keep `SettingsSection`, `NavItemConfig`, `SettingItemProps`, `SectionHeaderProps`, `ShortcutItemProps`

### Step 10: Update exports and barrel files

**Files:**

- `apps/agent/src/components/modals/settings/index.ts`
- `apps/agent/src/stores/ui/index.ts`
- `apps/agent/src/stores/agent/index.ts`
- `apps/agent/src/components/layout/primary-sidebar/components/index.ts`

**Settings module barrel** (`components/modals/settings/index.ts`):

- Remove `SettingsDialog` export
- Add `SettingsPage` export
- Keep `SettingsSection` type export

**Store barrels** — export new selectors/hooks/stores:

- `stores/ui/index.ts`: export `useSettingsOpen`, `useSettingsSection` selector hooks
- `stores/agent/index.ts`: export `useSubagentsStore` from new `subagents-store.ts`

**Component barrel** — export new sidebar component:

- `components/layout/primary-sidebar/components/index.ts`: export `SettingsNavList`

### Step 11: Cleanup SettingsDialog.tsx

- Either delete the file entirely or repurpose it as `SettingsPage.tsx`
- Remove all Radix Dialog imports/wrappers
- The `SettingsSidebar.tsx` component can stay as-is for its `NAV_ITEMS` export (consumed by `SettingsNavList`)

### Step 12: Update test file

**File:** `apps/agent/src/__tests__/unit/stores/ui/ui-store.test.ts`

- Update any references to `settingsDialogOpen` → `settingsOpen`
- Update `setSettingsDialogOpen` → `setSettingsOpen`
- Add tests for:
  - `closeSecondarySurface()` clears both `settingsOpen` and `vaultOpen`
  - `openSettings()` sets `vaultOpen = false` (mutual exclusivity)
  - `toggleVault()` (when opening) sets `settingsOpen = false`
  - `openSettings()` auto-expands collapsed sidebar
  - `setSettingsOpen(true)` sets `vaultOpen = false` and auto-expands sidebar

### Step 13: Add rendered tests for new behaviors

**Files:** new test files

- **App.tsx shell-level rendering**: settings surface replaces mode tabs when `settingsOpen === true`
- **Cross-mode entry — open from editor**: `openSettings()` while `activeTab === 'editor'` renders settings page (not hidden behind `display: none` agent tab)
- **Cross-mode entry — open from canvas**: `openSettings()` while `activeTab === 'canvas'` renders settings page
- **Close returns to origin tab**: closing settings does NOT change `activeTab` — user returns to whichever mode they were in
- **PrimarySidebar settings mode**: back button, settings heading, nav list visibility
- **Collapsed sidebar auto-expand**: `openSettings()` from keyboard while sidebar is collapsed
- **Session navigation closing settings**: `handleNewSession` / `handleLoadConversation` call `closeSecondarySurface()`
- **Escape key with nested dialogs**: Escape inside subagent editor dialog does NOT close settings page
- **Gradient overlay hidden**: gradient fade not visible when settings page is open

## Critical Files

| File                                                                              | Action                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/agent/src/stores/ui/ui-store.ts`                                            | Modify (rename state + actions, add `closeSecondarySurface`, auto-expand sidebar) |
| `apps/agent/src/stores/agent/subagents-store.ts`                                  | **Create** (persistent subagent data, mirrors commands-store)                     |
| `apps/agent/src/components/modals/settings/pages/SubagentsSettings.tsx`           | Modify (refactor to use subagents-store instead of local state)                   |
| `apps/agent/src/components/layout/content-top-bar.tsx`                            | Modify (use `closeSecondarySurface`)                                              |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`   | Modify (use `closeSecondarySurface`)                                              |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`             | Modify (conditional rendering, remove dialog)                                     |
| `apps/agent/src/App.tsx`                                                          | Modify (shell-level settings surface, gradient overlay, lazy import)              |
| `apps/agent/src/components/modals/settings/SettingsPage.tsx`                      | **Create** (extract from SettingsDialog, modal-aware Escape)                      |
| `apps/agent/src/components/layout/primary-sidebar/components/SettingsNavList.tsx` | **Create** (settings nav for sidebar)                                             |
| `apps/agent/src/components/modals/settings/SettingsDialog.tsx`                    | Delete                                                                            |
| `apps/agent/src/components/modals/settings/types.ts`                              | Modify (remove SettingsDialogProps)                                               |
| `apps/agent/src/components/modals/settings/index.ts`                              | Modify (update exports)                                                           |
| `apps/agent/src/components/layout/root-layout.tsx`                                | Verify (no change expected)                                                       |
| `apps/agent/src/__tests__/unit/stores/ui/ui-store.test.ts`                        | Modify (rename references, add new tests)                                         |

## OcProviderDialog — No Change Needed

`OcProviderDialog.tsx` already handles the close-before-navigate pattern correctly:

```ts
function showProviders(open, onOpenChange) {
  onOpenChange(false); // close dialog first
  queueMicrotask(() => open('providers')); // then navigate to settings
}
```

This works identically with the page pattern. Verify as a regression check only.

## Reusable Existing Code

- `NAV_ITEMS` + `FEEDBACK_ITEM` from `SettingsSidebar.tsx` (line 29-113) — settings nav item definitions
- `SETTINGS_PAGE_COMPONENTS` from `pages/index.ts` (line 45-61) — lazy page component map
- `SettingsSkeleton` from `settings/components` — loading fallback
- `useSmoothScroll` hook — smooth scrolling in page panels
- `commands-store.ts` pattern — reference for new `subagents-store.ts`
- All 15 settings page components in `pages/` — completely untouched (except SubagentsSettings store refactor)

## Mutual Exclusivity

Settings and vault should be mutually exclusive. Enforce in **all** state setters, not just convenience methods:

- `openSettings()`: set `vaultOpen = false`, auto-expand sidebar
- `setSettingsOpen(true)`: set `vaultOpen = false`, auto-expand sidebar
- `toggleVault()` (when opening): set `settingsOpen = false`
- `setVaultOpen(true)`: set `settingsOpen = false`
- `closeSecondarySurface()`: clear both — used by session navigation flows

## Edge Cases to Handle

- **Cross-mode entry (Cmd+, from editor/canvas)**: Settings renders at the App.tsx shell level, independent of `activeTab`. Opening settings from any mode hides the mode tabs behind the settings surface. `activeTab` is NOT changed — closing settings returns the user to whichever mode they were in. Covered by Step 5.
- **Account toast / demo mode entry**: `openSettings('account')` called from `account-banner.tsx` (toast) or demo mode (`App.tsx:136`) works identically — the shell-level settings surface appears regardless of which mode tab is active. Covered by Step 5.
- **Collapsed sidebar**: `openSettings()` auto-expands the sidebar via the store contract. Covered by Step 1.
- **Agent streaming**: When settings page replaces mode content at the shell level, any running agent stream is hidden. Mode tabs stay mounted (React state preserved, `display: none`), so chat state, scroll position, and streaming are maintained. Closing settings reveals the mode tab exactly as it was.
- **Section persistence**: With a page (vs dialog), reopening settings shows the last-visited section rather than resetting to default. This is a deliberate behavior change — feels more natural for a page.
- **Nested dialogs + Escape**: Both SubagentsSettings and SlashCommandsSettings embed `DialogPrimitive.Root` editors. The Escape handler must detect these open dialogs and defer to them. Covered by Step 6.
- **Simultaneous settings + vault**: Direct `setVaultOpen(true)` and `setSettingsOpen(true)` calls enforce mutual exclusivity. Covered by Step 1.
- **Mode tabs stay mounted**: Settings uses an `absolute inset-0 z-20` overlay on top of the mode tabs, NOT a ternary replacement. This preserves all mounted mode state (chat streaming, terminal sessions, editor content, scroll positions). A ternary (`settingsOpen ? <Settings /> : <>tabs</>`) would unmount the tabs and destroy state. The overlay approach means closing settings reveals the mode exactly as the user left it.
- **Top chrome inconsistency across modes**: `ContentTopBar` renders at `App.tsx:877` only when `activeTab !== 'editor'`. The settings overlay sits BELOW `ContentTopBar` in the layout. This means: settings opened from agent/canvas has `ContentTopBar` visible above it, but settings opened from editor does NOT (editor hides `ContentTopBar`). This is acceptable — `ContentTopBar` shows session title/new-session which is irrelevant to settings, and the sidebar back button is the primary close mechanism. But verify visually during manual testing that both states look correct.
- **Mode-level shortcuts while settings is open**: Since mode tabs stay mounted underneath the overlay, mode-level keyboard shortcuts (e.g., Cmd+Enter to send a message in agent mode) could still fire. The settings Escape handler and any settings-level focus trapping should prevent this, but add a manual verification step for this case.

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint errors
3. `bun run test` — all existing + new tests pass
4. `bunx tauri dev` — manual testing:

   **Core functionality:**
   - Cmd+, opens settings page (sidebar shows settings nav, content shows settings page)
   - Cmd+, while sidebar is collapsed auto-expands sidebar and opens settings
   - Clicking sidebar "Settings" button opens settings page
   - Clicking settings nav items switches between settings pages
   - Back button returns to previous view
   - Escape key closes settings (when no child dialog is open)
   - Escape key inside subagent/command editor closes only the editor dialog, not settings
   - Opening vault closes settings; opening settings closes vault
   - All 15 settings pages render correctly

   **Cross-mode entry (CRITICAL — validates the shell-level rendering fix):**
   - Switch to editor tab → Cmd+, → settings page visible (not hidden behind `display: none` agent tab)
   - Switch to canvas tab → Cmd+, → settings page visible
   - Close settings from editor → returns to editor (not agent)
   - Close settings from canvas → returns to canvas (not agent)
   - Account banner toast → opens settings account page regardless of active tab
   - Demo mode `openSettings('account')` → works regardless of active tab

   **State preservation:**
   - Start agent streaming → open settings → close settings → streaming still running, scroll position preserved
   - Open terminal in agent mode → open settings → close settings → terminal session preserved
   - Subagents section does not re-fetch when closing and reopening settings
   - Commands section does not re-fetch when closing and reopening settings

   **Navigation flows:**
   - Cmd+N (new session) from settings returns to chat
   - Clicking a conversation in sidebar from settings returns to chat
   - Chat-area gradient overlay is not visible on settings page
   - OcProviderDialog "Manage providers" link navigates to settings providers page

   **Shell chrome and edge cases:**
   - Settings from agent/canvas shows ContentTopBar above settings; settings from editor does not — both states visually correct
   - Settings looks correct in both light and dark themes (shell-level bg-background matches)
   - Mode-level shortcuts (e.g., Cmd+Enter in agent mode) do NOT fire while settings overlay is open
   - Escape inside subagent editor dialog (tagged `data-settings-child-dialog`) closes only the editor, not settings
   - Escape with an unrelated global dialog open (NOT tagged) still closes settings normally
