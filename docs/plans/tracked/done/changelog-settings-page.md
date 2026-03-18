# Plan: Changelog Dialog → Settings Page + Toast UX Fix

## Context

The changelog is currently a standalone glass dialog with broken accordion animations. Instead of continuing to fight the animation, we're converting it to a **settings page** — matching where users already go to configure Orbit. This also fixes a UX problem: clicking "Changelog" on the update toast currently **dismisses the toast**, which means the user loses the "Update now" button after reading the notes.

The visual style should match the [orbit.build/changelog](https://orbit.build/changelog) timeline layout, adapted for the settings panel width.

## Already Landed (on `feat/migration`)

The following are already implemented and should NOT be re-done:

- `changelogDialogOpen` / `openChangelog()` / `closeChangelog()` in `update-store.ts`
- `selectChangelogOpen` / `useChangelogOpen` exports in `stores/ui/index.ts`
- `ChangelogDialog` component + lazy mount in `root-layout.tsx`
- `changelog-renderer.tsx`, `changelog-entry.tsx`, `changelog-dialog.tsx`
- `export * from './changelog'` in `modals/index.ts`
- `overlayClassName` prop on `DialogContentGlass`
- Changelog CSS in `globals.css` (~lines 1921-2062)
- "Changelog" button in `update-toast.tsx` (currently dismisses toast + calls `openChangelog()`)
- 6 markdown files in `apps/agent/src/changelogs/`
- `changelog-loader.ts` with `getChangelogs()` and `createVirtualEntry()`

This plan covers only the **delta work**: converting dialog → settings page and fixing the toast UX.

## What Changes

### 1. Add `'changelog'` to `SettingsSection` type

**Modify:** `apps/agent/src/components/modals/settings/types.ts`

- Add `| 'changelog'` to the `SettingsSection` union

### 2. Add nav item to BOTH navigation surfaces

The settings nav exists in **two places** — both must be updated:

**2a. Modify:** `apps/agent/src/components/modals/settings/SettingsSidebar.tsx`

- Add a `changelog` entry to `NAV_ITEMS` array (place it after `account`, before `FEEDBACK_ITEM`)
- Icon: `Newspaper` from lucide-react (matches "release notes" semantic)
- Label: `"Changelog"`
- `NAV_ITEMS` is imported by `SettingsNavList.tsx` to build the icon/label map

**2b. Modify:** `apps/agent/src/components/layout/primary-sidebar/components/SettingsNavList.tsx`

- Add `'changelog'` to one of the `NAV_GROUPS` arrays — place it in the `General` group: `['general', 'appearance', 'account', 'changelog']`
- Without this, the sidebar nav won't show the Changelog item and `openSettings('changelog')` navigates to a blank page

### 3. Create `ChangelogSettings.tsx` page

**Create:** `apps/agent/src/components/modals/settings/pages/ChangelogSettings.tsx`

This is the main new file. It replaces the dialog with a scrollable settings page that mirrors the [orbit.build/changelog](https://orbit.build/changelog) timeline layout.

**Dual export pattern (required):** All settings pages must have both a named export AND a default export. `React.lazy()` via `lazyWithMinDelay` requires `export default`. The barrel `index.ts` uses the named export. Missing either one causes a runtime crash or broken barrel.

```typescript
export const ChangelogSettings: FC = () => { ... };
export default ChangelogSettings;
```

**Layout (adapted from orbitweb `page.tsx`):**

- `SectionHeader` with title "Changelog" and subtitle "Everything we've shipped. Newest first."
- Quick-jump version links row (horizontal scroll, `·` separated)
- Timeline: left column (date, version badge, "Latest" tag on first) + right column (title, tags, rendered markdown content)
- Settings panel supports full-width mode (`SettingsPage.tsx` lines 18-19, 53-69) with a plain `overflow-y-auto` container (NOT `ScrollArea`). The changelog page must work at both narrow (~500px) and full-width (~900px+). Use a `max-w-3xl` wrapper on the timeline content to keep line lengths readable in full-width mode. No nested scroll — the settings container handles overflow.

**Data source:** Same hybrid model from the loader:

- Bundled changelogs via `getChangelogs()` from `@/lib/changelog-loader`
- Virtual entry from `availableVersion` + `releaseNotes` when an update is available (same `createVirtualEntry` logic)
- **Virtual entry merge via loader:** Export a new `getMergedChangelogs(availableVersion, releaseNotes)` function from `changelog-loader.ts` that handles the merge logic using the existing private `compareSemver`. Rules: (1) if `availableVersion` is strictly newer than newest bundled, prepend virtual entry; (2) if equal, keep the BUNDLED entry (it has richer title/date/body from the `.md` file — the virtual fallback body is worse); (3) if older (rollback/stale), skip virtual entry. This keeps all semver logic in one file and prevents drift between page and loader.
- All entries rendered expanded — no accordion, just a scrollable timeline
- **Bundle cap:** Keep changelogs to ~20 versions max since `eager: true` inlines all content into the JS bundle

**Timezone-safe date parsing:** `new Date('2026-03-10')` parses as UTC midnight, which renders as March 9 in US timezones. Fix: split `YYYY-MM-DD` manually and construct with `new Date(year, month - 1, day)` to get local midnight. Extract as `parseChangelogDate(dateStr: string): Date` helper.

```typescript
function parseChangelogDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // local midnight, no TZ shift
}

function formatChangelogDate(dateStr: string): string {
  const date = parseChangelogDate(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
```

**Markdown rendering:** Reuse `ChangelogRenderer` from `@/components/modals/changelog/changelog-renderer.tsx` — move it to `apps/agent/src/components/modals/settings/pages/changelog/changelog-renderer.tsx`. The renderer is already well-built (JSX-based, safe URL handling via `url:open` bridge).

**Key differences from the dialog:**

- No accordion expand/collapse — all entries are visible (scrollable page has room)
- No dialog open/close animations to fight
- No fixed height constraint — the `SettingsPage` outer `overflow-y-auto` container handles scroll
- Timeline dots + vertical line between entries (matching orbitweb)

### 4. Register in settings page components

**Modify:** `apps/agent/src/components/modals/settings/pages/index.ts`

- Add `export { ChangelogSettings } from './ChangelogSettings'`
- Add `changelog: lazyWithMinDelay(() => import('./ChangelogSettings'))` to `SETTINGS_PAGE_COMPONENTS`

### 5. Fix toast "Changelog" button — don't dismiss toast

**Modify:** `apps/agent/src/components/ui/update-toast.tsx`

Current behavior (broken):

```typescript
onClick={() => {
  toast.dismiss(UPDATE_TOAST_ID);  // ← kills the toast
  useUpdateStore.getState().openChangelog();
}}
```

New behavior:

```typescript
onClick={() => {
  // Open settings to changelog page — DON'T dismiss the toast
  useUIStore.getState().openSettings('changelog');
}}
```

The toast stays visible behind the settings overlay. When the user closes settings, the toast is still there with "Update now" ready. This preserves the update call-to-action.

Also remove the `useUpdateStore` import if this was its only consumer in the file (check — `showUpdateAvailable` also uses it for `downloadAndInstall`).

### 6. Remove dialog infrastructure

**Delete files:**

- `apps/agent/src/components/modals/changelog/changelog-dialog.tsx`
- `apps/agent/src/components/modals/changelog/changelog-entry.tsx`
- `apps/agent/src/components/modals/changelog/index.ts`

**Keep file (move):**

- `apps/agent/src/components/modals/changelog/changelog-renderer.tsx` → move to `apps/agent/src/components/modals/settings/pages/changelog/changelog-renderer.tsx`

**Modify:** `apps/agent/src/components/modals/index.ts`

- Remove `export * from './changelog'`

**Modify:** `apps/agent/src/components/layout/root-layout.tsx`

- Remove `LazyChangelogDialog` lazy import (lines 15-18)
- Remove `<Suspense fallback={null}><LazyChangelogDialog /></Suspense>` (lines 174-176)
- This fixes the startup cost issue: the dialog was unconditionally lazy-mounted, meaning the chunk loaded on first render. The settings page is lazy-loaded via `SETTINGS_PAGE_COMPONENTS` only when the user navigates to it.

**Modify:** `apps/agent/src/stores/ui/update-store.ts`

- Remove `changelogDialogOpen` from `UpdateState`
- Remove `openChangelog()` / `closeChangelog()` from `UpdateActions`
- Remove from `INITIAL_STATE`
- Remove the action implementations
- Remove `selectChangelogOpen` / `useChangelogOpen` exports

**Modify:** `apps/agent/src/stores/ui/index.ts`

- Remove `selectChangelogOpen, useChangelogOpen` from exports

### 7. Clean up CSS

**Modify:** `apps/agent/src/globals.css`

Remove all `changelog-*` CSS classes and keyframes (~lines 1921-2062):

- `@keyframes changelog-enter/exit/overlay-enter/overlay-exit/item-enter`
- `.changelog-dialog-overlay`, `.changelog-dialog-content`
- `.changelog-accordion`, `.changelog-accordion-content`, `.changelog-accordion-inner`
- `.changelog-chevron`, `.changelog-item-enter`
- The associated `@media (prefers-reduced-motion: reduce)` block

### 8. Update tests

**Delete:** `apps/agent/src/__tests__/unit/stores/ui/update-store-changelog.test.ts`

- Tests `openChangelog` / `closeChangelog` which no longer exist

**Delete:** `apps/agent/src/__tests__/unit/components/modals/changelog/changelog-dialog.test.tsx`

- Tests the dialog which no longer exists

**Create:** `apps/agent/src/__tests__/unit/components/modals/settings/pages/changelog-settings.test.tsx`

- Renders all bundled entries
- Virtual entry appears when `availableVersion` is set and is newer than bundled
- Virtual entry does NOT appear when `availableVersion` matches a bundled version
- Virtual entry does NOT appear when `availableVersion` is older (rollback)
- Version badges and dates render correctly
- Quick-jump links are present
- `formatChangelogDate('2026-03-10')` returns `"Mar 10, 2026"` (not Mar 9)
- Empty state renders fallback message

**Create:** `apps/agent/src/__tests__/unit/components/modals/settings/pages/changelog/changelog-renderer.test.tsx`

- Safe `https:` link renders as clickable `<a>`
- Safe `mailto:` link renders as clickable `<a>`
- `javascript:` URL renders as plain text (not clickable)
- Malformed URL renders as plain text
- Clicking a safe link calls `postMessage` with `type: 'url:open'`
- (Carries over coverage from deleted `changelog-dialog.test.tsx` lines 154-189)

**Create:** `apps/agent/src/__tests__/unit/lib/changelog-loader-merge.test.ts`

- `getMergedChangelogs` with newer version prepends virtual entry
- `getMergedChangelogs` with equal version keeps bundled entry (richer content)
- `getMergedChangelogs` with older version skips virtual entry
- `getMergedChangelogs` with null version returns bundled only

**Create:** `apps/agent/src/__tests__/unit/components/ui/update-toast-changelog.test.tsx`

- Clicking "Changelog" calls `openSettings('changelog')` (not `openChangelog`)
- Clicking "Changelog" does NOT dismiss the toast

**Create:** `apps/agent/src/__tests__/unit/components/layout/primary-sidebar/sidebar-whats-new.test.tsx`

- "What's new" sidebar item visible when update available + toast dismissed
- Clicking it calls `openSettings('changelog')`
- Not visible when no update available

**Create:** `apps/agent/src/__tests__/unit/components/layout/primary-sidebar/settings-nav-changelog.test.tsx`

- `NAV_GROUPS` contains `'changelog'` in one of its groups
- `NAV_ITEMS` has an entry with `id: 'changelog'`
- Clicking the changelog nav button calls `openSettings('changelog')`

### 9. Sidebar update indicator — add "Changelog" action

**Modify:** `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`

Currently the sidebar update button (lines 808-823) only offers "Download" or "Restart". After the user clicks "Later" and sees the sidebar indicator, they have no way to read the changelog.

**Concrete change:** Add a second `SidebarItem` below the existing update button:

```tsx
{
  (updateStatus === 'available' || updateStatus === 'ready') && updateDismissed ? (
    <>
      <SidebarItem
        icon={Gift}
        label={updateStatus === 'ready' ? 'Restart to update' : 'Update available'}
        badge={updateStatus === 'ready' ? 'Restart' : 'Update'}
        badgeVariant="primary"
        onClick={() => {
          /* existing download/relaunch logic */
        }}
      />
      <SidebarItem
        icon={Newspaper}
        label="What's new"
        onClick={() => {
          useUIStore.getState().openSettings('changelog');
        }}
      />
    </>
  ) : null;
}
```

## Files Summary

| Action | File                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Modify | `apps/agent/src/components/modals/settings/types.ts` — add `'changelog'`                                |
| Modify | `apps/agent/src/components/modals/settings/SettingsSidebar.tsx` — add to `NAV_ITEMS`                    |
| Modify | `apps/agent/src/components/layout/primary-sidebar/components/SettingsNavList.tsx` — add to `NAV_GROUPS` |
| Create | `apps/agent/src/components/modals/settings/pages/ChangelogSettings.tsx` — timeline page                 |
| Move   | `changelog-renderer.tsx` → `settings/pages/changelog/` subfolder                                        |
| Modify | `apps/agent/src/components/modals/settings/pages/index.ts` — register page                              |
| Modify | `apps/agent/src/components/ui/update-toast.tsx` — don't dismiss, open settings                          |
| Delete | `apps/agent/src/components/modals/changelog/changelog-dialog.tsx`                                       |
| Delete | `apps/agent/src/components/modals/changelog/changelog-entry.tsx`                                        |
| Delete | `apps/agent/src/components/modals/changelog/index.ts`                                                   |
| Modify | `apps/agent/src/components/modals/index.ts` — remove changelog export                                   |
| Modify | `apps/agent/src/components/layout/root-layout.tsx` — remove dialog mount                                |
| Modify | `apps/agent/src/stores/ui/update-store.ts` — remove dialog state                                        |
| Modify | `apps/agent/src/stores/ui/index.ts` — remove dialog exports                                             |
| Modify | `apps/agent/src/globals.css` — remove ~70 lines of changelog CSS                                        |
| Modify | `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx` — changelog link                  |
| Delete | `apps/agent/src/__tests__/unit/components/modals/changelog/changelog-dialog.test.tsx`                   |
| Delete | `apps/agent/src/__tests__/unit/stores/ui/update-store-changelog.test.ts`                                |
| Modify | `apps/agent/src/lib/changelog-loader.ts` — export `getMergedChangelogs()`                               |
| Create | `apps/agent/src/__tests__/unit/components/modals/settings/pages/changelog-settings.test.tsx`            |
| Create | `apps/agent/src/__tests__/unit/components/modals/settings/pages/changelog/changelog-renderer.test.tsx`  |
| Create | `apps/agent/src/__tests__/unit/lib/changelog-loader-merge.test.ts`                                      |
| Create | `apps/agent/src/__tests__/unit/components/ui/update-toast-changelog.test.tsx`                           |
| Create | `apps/agent/src/__tests__/unit/components/layout/primary-sidebar/sidebar-whats-new.test.tsx`            |
| Create | `apps/agent/src/__tests__/unit/components/layout/primary-sidebar/settings-nav-changelog.test.tsx`       |

## Verification

1. `bun run typecheck` — no TS errors
2. `bun run lint` — no ESLint warnings
3. `bun run test` — all tests pass (including timezone-safe date formatting test)
4. `bun run dev` — simulate update via DevTools:
   - Toast shows 3 buttons: Later, Changelog, Update now
   - Click "Changelog" → Settings opens to Changelog page, **toast stays visible**
   - Close settings → toast still there → can click "Update now"
   - Click "Later" → toast dismissed → sidebar shows update indicator + "What's new" link
5. Open Settings manually → Changelog nav item → full timeline renders with all 6 versions
6. Grep for `changelogDialogOpen`, `openChangelog`, `closeChangelog`, `changelog-accordion` — zero results
7. Grep for `LazyChangelogDialog` — zero results (no startup cost)
