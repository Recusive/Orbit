# Vault Feature — Frontend Rebuild Plan

## Context

The Vault is a notes/documents system inside Orbit. It stores markdown notes in `.orbit/Vault/`, displays project markdown docs, provides a Milkdown Crepe rich-text editor, and can send docs as context to the AI agent.

The Rust backend and API/type layers are solid. All problems are on the frontend: dead code from an abandoned search feature, a Cmd+S scope bug, duplicate mapping logic, CSS that risks WKWebView blur, and a missing file-watcher refresh path.

This plan audits and rebuilds the frontend in 6 phases, each independently verifiable via `bun run typecheck && bun run lint`.

---

## Phase 1 — Dead Code Removal

Remove dead state, hooks, components, and API re-exports. Zero behavioral change.

### 1a. `vault-editor-store.ts` — remove `isEditing`

Set on open/close but never read by any selector or component.

- Remove from interface (line 24), initial state (line 52), `openDocument` success branch (line 80), `closeDocument` reset (line 202)

### 1b. `vault-store.ts` — remove dead search + view-mode state

The entire search pipeline (`searchQuery`, `searchResults`, `isSearching`, `executeSearch`, `setSearchQuery`) is wired but has no UI input — `setSearchQuery` is never called, so `searchQuery` is always `''`. `viewMode`/`setViewMode` has no UI control. `useUnifiedDocList` is superseded by VaultNoteList's inline mappers (which Phase 2 replaces with proper hooks).

Remove from interface + implementation:

- `viewMode`, `setViewMode`
- `searchQuery`, `searchResults`, `isSearching`, `executeSearch`, `setSearchQuery`
- Resets in `initializeVault` and `clearWorkspaceState` for removed fields
- `useUnifiedDocList` exported function (lines ~405-459)
- Imports: `VaultSearchResult`, `VaultViewMode` (types), `vaultSearchAllDocs` (API)

### 1c. Barrel exports cleanup

- `stores/index.ts` — remove `useUnifiedDocList` from export list
- `types/index.ts` — remove `VaultViewMode` and `VaultSearchResult` type re-exports
- `api/index.ts` — remove `vaultExists`, `vaultGetMetadata`, `vaultStats`, `vaultGetContextFiles` re-exports (functions stay in vault-api.ts per "don't touch" rule, but are unreachable via barrels)

### 1d. Delete dead hook + component files

- **DELETE** `hooks/use-vault-search.ts` — depends on removed store state
- **DELETE** `components/VaultSearchBar.tsx` — never imported or mounted
- `hooks/index.ts` — remove `useVaultSearch` export
- `VaultPage.tsx` — remove `useVaultSearch` import and `useVaultSearch()` call (line 14, 24)

### 1e. `VaultCreateDialog.tsx` — remove unused `inputRef`

`inputRef` is created (line 49) and attached to `<Input>` (line 133) but `.current` is never read. `autoFocus` already handles focus. Remove the `useRef` import (if no other refs), the `inputRef` declaration, and the `ref={inputRef}` prop.

### 1f. `flushPendingContent` — document, don't fix

The `flushPendingContent` counter in the autosave `useEffect` dependency array (line 38) is never read in the effect body. It acts as a "trigger signal" — vault-store bumps it before rename/move/delete to force the autosave effect to re-evaluate. But the effect has a 2-second debounce, so the save fires AFTER the rename/move/delete completes. This is a race condition. However, fixing it requires a synchronous save-before-rename behavior change — out of scope. Leave `flushPendingContent` as-is but add a `// TODO:` comment explaining the race.

**Files modified:** `vault-editor-store.ts`, `vault-store.ts`, `stores/index.ts`, `types/index.ts`, `api/index.ts`, `hooks/index.ts`, `VaultPage.tsx`, `VaultCreateDialog.tsx`
**Files deleted:** `use-vault-search.ts`, `VaultSearchBar.tsx`
**Verify:** `bun run typecheck && bun run lint`

---

## Phase 2 — VaultNoteList: Replace Inline Mappers with Store Hooks

`VaultNoteList.tsx` (lines 253-286) has two inline `useMemo` blocks that duplicate the `toVaultDoc()` and `toProjectDoc()` mappers already exported from `vault-store.ts`. The store also exports `useVaultDocs()` and `useProjectDocs()` hooks that wrap these mappers.

### Changes to `VaultNoteList.tsx`

```diff
+ import { useVaultDocs, useProjectDocs } from '@/features/vault/stores';

- const vaultDocs = useMemo((): UnifiedDoc[] => { ... }, [workspacePath, vaultEntries]);
+ const vaultDocs = useVaultDocs();

- const projectUnifiedDocs = useMemo((): UnifiedDoc[] => { ... }, [projectDocs]);
+ const projectUnifiedDocs = useProjectDocs();
```

Remove now-unused selectors: `vaultEntries`, `projectDocs` from `useVaultStore`. Remove `useMemo` from React import if no other usage. Keep `workspacePath` from `useUIStore` — still used in callbacks.

**Note:** `useVaultDocs()` reads `workspacePath` from `useVaultStore` (not `useUIStore`). These are kept in sync by `useVaultInitialization` which writes UIStore's `workspacePath` into VaultStore on init. `useVaultDocs()` guards `if (!workspacePath) return []`, matching the current behavior.

**Files modified:** `VaultNoteList.tsx`
**Verify:** `bun run typecheck && bun run lint` + open vault sidebar, verify both sections render correctly

---

## Phase 3 — Fix Cmd+S Scope Bug

In `use-vault-autosave.ts`, the Cmd+S handler (line 50) uses:

```typescript
if (!vaultOpen && !inVaultEditor) return;
```

This passes Cmd+S to vault save from **anywhere in the app** when the vault panel is open (chat input, terminal, file editor). The `inVaultEditor` check (`.closest('.vault-editor-shell')`) is the correct guard.

### Fix

```diff
- if (!vaultOpen && !inVaultEditor) return;
+ if (!inVaultEditor) return;
```

Also remove the now-unused `vaultOpen` subscription:

- Remove `const vaultOpen = useVaultOpen();` (line 10)
- Remove `useVaultOpen` from import
- Remove `vaultOpen` from the `useEffect` dependency array (line 60)

This also eliminates an unnecessary UIStore re-subscription.

**Files modified:** `use-vault-autosave.ts`
**Verify:** `bun run typecheck` + manual test: open vault, click into chat input, press Cmd+S — should NOT trigger vault save. Click into vault editor, press Cmd+S — should save.

---

## Phase 4 — VaultCrepeEditor Fixes

### 4a. Document "Like" interfaces (keep, don't replace)

`@milkdown/kit` is a transitive dependency of `@milkdown/crepe` but is NOT hoisted to `node_modules/@milkdown/kit/`. Only `crepe` and `utils` are at the top level. Importing from `@milkdown/kit/prose/view` fails at build time.

**Action:** Keep the 7 structural interfaces. Add a block comment above them explaining why real types can't be imported and what Milkdown API surfaces they describe.

### 4b. Cmd+A — SKIP (already implemented)

Lines 135-149 already handle `Mod-a` with `window.getSelection().selectAllChildren(view.dom)`. No action needed.

### 4c. Fix content card shift on code block add/remove

ProseMirror's two scroll mechanisms are patched by `configureScrollBehavior()`. The third mechanism — browser native focus scroll when ProseMirror calls `view.dom.focus()` — is unpatched. When CodeMirror NodeViews are created/destroyed, the browser walks scrollable ancestors and sets `scrollTop`, reaching ChatArea.

**Fix:** Add `overflow-hidden` to VaultPage root container (line 84):

```diff
- <div className="flex-1 min-h-0 flex flex-col">
+ <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
```

This creates a scroll boundary at VaultPage level where `scrollHeight === clientHeight` (flex fills exactly), so browser focus scroll stops harmlessly instead of reaching ChatArea.

**Safe because:** The Crepe slash menu, link tooltip, and toolbar are all positioned inside the `.overflow-auto` inner scroll container within `VaultCrepeEditor`, not relative to VaultPage. They will not be clipped.

**Files modified:** `VaultCrepeEditor.tsx` (comment only), `VaultPage.tsx` (overflow-hidden)
**Verify:** Open vault, add/remove a code block — content should not shift. Slash menu (`/`) should still appear correctly.

---

## Phase 5 — File Watcher: Add Vault Directory Refresh

In `use-vault-file-watcher.ts`, file create/delete/rename events only call `loadProjectDocs()`. If a user adds a file to `.orbit/Vault/` externally, the sidebar doesn't update.

### Changes

Add subscriptions:

```typescript
const loadVaultDirectory = useVaultStore((state) => state.loadVaultDirectory);
const currentPath = useVaultStore((state) => state.currentPath);
```

Add vault path detection and refresh scheduling:

```typescript
const normalizedVaultDir = `${normalizedWorkspace}.orbit/Vault/`;

// Inside the event handler, before existing project doc refresh:
if (changedPath.startsWith(normalizedVaultDir)) {
  if (event.type === 'created' || event.type === 'deleted' || event.type === 'renamed') {
    scheduleVaultRefresh(); // parallel debounced function, same 400ms pattern
  }
}
```

Add separate `vaultRefreshTimeoutId` tracking and cleanup. Add `loadVaultDirectory` and `currentPath` to the `useEffect` dependency array.

**Files modified:** `use-vault-file-watcher.ts`
**Verify:** Open vault, create/delete a `.md` file in `.orbit/Vault/` via terminal — sidebar should refresh within ~400ms.

---

## Phase 6 — CSS Cleanup

### 6a. Replace `color-mix()` with pre-computed oklch values

`color-mix(in oklch, ...)` at lines 1235 and 1239 risks WKWebView blur (per CLAUDE.md). Replace with direct `oklch()` values derived from `--gray-4`:

- Light mode `--gray-4`: `oklch(86.5% 0 0)`
- Dark mode `--gray-4`: `oklch(28.3% 0 0)`

```css
/* Table header — was: color-mix(in oklch, var(--muted) 75%, transparent) */
.vault-editor-shell .milkdown th {
  font-weight: 600;
  background: oklch(86.5% 0 0 / 0.75);
}
html.dark .vault-editor-shell .milkdown th {
  background: oklch(28.3% 0 0 / 0.75);
}

/* Even rows — was: color-mix(in oklch, var(--muted) 45%, transparent) */
.vault-editor-shell .milkdown tr:nth-child(even) td {
  background: oklch(86.5% 0 0 / 0.45);
}
html.dark .vault-editor-shell .milkdown tr:nth-child(even) td {
  background: oklch(28.3% 0 0 / 0.45);
}
```

### 6b. Scope slash menu CSS under `.vault-editor-shell`

Lines 1246-1311: all slash-menu selectors use `.milkdown .milkdown-slash-menu` without parent scope. Prepend `.vault-editor-shell` to every rule:

```diff
- .milkdown .milkdown-slash-menu[data-show='true'] { ... }
+ .vault-editor-shell .milkdown .milkdown-slash-menu[data-show='true'] { ... }
```

Apply to all 7 slash-menu rule blocks. Leave the `@keyframes slash-menu-in` global (keyframes can't be scoped, and the name is specific enough).

**Files modified:** `globals.css`
**Verify:** Open vault, view a markdown table — headers and even rows should have correct backgrounds in both light/dark mode. Type `/` — slash menu should render with correct styling.

---

## Phase 7 — Cross-Store Coupling: Accept As-Is

vault-store.ts calls `useVaultEditorStore.getState()` in `renameVaultEntry`, `moveVaultEntry`, and `deleteVaultEntry`. This is the standard Zustand imperative coordination pattern — `getState()` for actions called from outside React render is documented and valid. The editor store doesn't use `immer`, so `getState()` returns live state.

**No changes.** The `flushPendingContent` race condition is noted in Phase 1f.

---

## Files Summary

| Phase | File                        | Action                                              |
| ----- | --------------------------- | --------------------------------------------------- |
| 1     | `vault-editor-store.ts`     | Remove `isEditing`                                  |
| 1     | `vault-store.ts`            | Remove search/viewMode state + `useUnifiedDocList`  |
| 1     | `stores/index.ts`           | Remove `useUnifiedDocList` export                   |
| 1     | `types/index.ts`            | Remove `VaultViewMode`, `VaultSearchResult` exports |
| 1     | `api/index.ts`              | Remove 4 dead re-exports                            |
| 1     | `use-vault-search.ts`       | **DELETE**                                          |
| 1     | `VaultSearchBar.tsx`        | **DELETE**                                          |
| 1     | `hooks/index.ts`            | Remove `useVaultSearch` export                      |
| 1     | `VaultPage.tsx`             | Remove `useVaultSearch` call                        |
| 1     | `VaultCreateDialog.tsx`     | Remove unused `inputRef`                            |
| 2     | `VaultNoteList.tsx`         | Use `useVaultDocs()` / `useProjectDocs()` hooks     |
| 3     | `use-vault-autosave.ts`     | Fix Cmd+S guard to `!inVaultEditor` only            |
| 4     | `VaultCrepeEditor.tsx`      | Add documentation comment to "Like" interfaces      |
| 4     | `VaultPage.tsx`             | Add `overflow-hidden` to root div                   |
| 5     | `use-vault-file-watcher.ts` | Add vault directory refresh on file events          |
| 6     | `globals.css`               | Replace `color-mix()`, scope slash menu CSS         |

## Verification

After each phase: `bun run typecheck && bun run lint`

After all phases:

```bash
bunx tauri dev   # verify in running app:
```

- Sidebar shows Vault Notes + Project Docs sections
- Clicking a note opens it in the editor
- Autosave triggers after 2s of typing
- Cmd+S saves only from within vault editor (not chat input)
- Adding/removing code blocks does NOT shift content
- Slash menu opens with animation, styled correctly
- External file changes in `.orbit/Vault/` refresh sidebar
- Tables render without WKWebView blur artifacts
