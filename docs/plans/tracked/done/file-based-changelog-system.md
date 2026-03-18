# Plan: File-Based Changelog System

## Context

The update toast (`update-toast.tsx`) currently shows "Later" and "Update now" buttons when a new version is available. We need a 3rd "Changelog" button that opens a dialog listing all changelogs — with the latest expanded — powered by a file-based auto-discovery system. Drop a new `.md` file in the folder → it appears automatically. No hardcoding.

## Architecture

```
apps/agent/src/changelogs/          ← Drop .md files here (bundled historical entries)
  v0.0.1.md
  v0.0.2.md
  ...

apps/agent/src/lib/changelog-loader.ts    ← Vite import.meta.glob auto-discovery + hybrid merger
apps/agent/src/components/modals/changelog/
  changelog-dialog.tsx                     ← Glass dialog with accordion entries
  changelog-entry.tsx                      ← Single accordion entry (extracted for testability)
  changelog-renderer.tsx                   ← JSX-based markdown renderer
  index.ts                                 ← Barrel export

apps/agent/src/__tests__/unit/lib/changelog-loader.test.ts       ← Loader unit tests
apps/agent/src/__tests__/unit/stores/ui/update-store-changelog.test.ts  ← Store wiring tests
```

### Hybrid Data Model

The dialog shows changelogs from **two sources**, merged into a single sorted list:

1. **Bundled changelogs** — `.md` files in `changelogs/`, auto-discovered at build time via `import.meta.glob`. These cover all versions up to and including the currently installed version.
2. **Remote release notes** — `availableVersion` + `releaseNotes` from `update-store.ts` (already captured from GitHub Release body at `update-store.ts:88`). This covers the version the user is about to install — which is newer than anything bundled.

The loader exports `getChangelogs()` for bundled entries. The dialog component prepends a virtual entry from the update store's `availableVersion`/`releaseNotes` when present, so the user always sees release notes for the incoming version at the top.

**Bundle cap:** Keep changelogs to ~20 versions max since `eager: true` inlines all content into the JS bundle. If this grows beyond that, switch to `eager: false` for lazy-loading on dialog open.

## File Format

Each changelog is a markdown file named `v{semver}.md` with YAML frontmatter:

```markdown
---
title: Orbit v0.0.2
date: 2026-03-10
---

## What's New

- Feature X
- Bug fix Y
```

## Steps

### 1. Create `apps/agent/src/changelogs/` with initial entries

- Create `v0.0.1.md` and `v0.0.2.md` as seed content

### 2. Create `apps/agent/src/lib/changelog-loader.ts`

- `import.meta.glob` with `eager: true, query: '?raw', import: 'default'` (mirrors `icon-loader.ts`)
- Parse frontmatter: split on first two `---` delimiters only (indexOf + indexOf from offset) to avoid misparse on `---` horizontal rules inside the markdown body
- Extract `title` and `date` from frontmatter key-value pairs via regex
- Error recovery: if frontmatter is malformed or `title`/`date` is missing, skip the entry (don't crash) — log a warning via `createLogger('ChangelogLoader')`
- Dedup: if two files resolve to the same semver, keep the first one found and warn
- Invalid filenames: skip files that don't match `v{semver}.md` pattern
- Handle CRLF line endings and BOM: strip BOM if present, normalize `\r\n` to `\n` before parsing
- Extract version from filename: `/src/changelogs/v0.0.5.md` → `"0.0.5"`
- Export `ChangelogEntry` interface: `{ version, title, date, body }`
- Export `getChangelogs(): readonly ChangelogEntry[]` — sorted by semver descending (newest first)
- Export `createVirtualEntry(version: string, releaseNotes: string | null): ChangelogEntry` — creates an entry from remote release notes for the hybrid merge. When `releaseNotes` is null/blank, uses fallback body `"Update to Orbit v{version}."`
- Semver sort: split on `.`, compare numeric parts; for pre-release segments (e.g., `beta.1`), treat non-numeric parts as lower precedence than release versions

### 3. Add `changelogDialogOpen` state to update store

**Modify:** `apps/agent/src/stores/ui/update-store.ts`

- Add `changelogDialogOpen: boolean` to `UpdateState`
- Add `openChangelog()` / `closeChangelog()` actions to `UpdateActions`
- Initial state: `false`

**Modify:** `apps/agent/src/stores/ui/index.ts`

- Export `useChangelogOpen` selector

### 4. Create `apps/agent/src/components/modals/changelog/changelog-dialog.tsx`

- Controlled dialog using `DialogContentGlass` + `glass-surface` (matches Liquid Glass design)
- **Accessibility:** Include `<DialogTitle>` (visible) + `<DialogDescription className="sr-only">` for screen readers
- Reads `changelogDialogOpen` from update store
- Reads `availableVersion` + `releaseNotes` from update store for the virtual entry
- **Hybrid merge:** If `availableVersion` is non-null, always prepend a virtual entry via `createVirtualEntry()` — even if `releaseNotes` is null/blank (use fallback body: `"Update to Orbit v{version}."` so the incoming version is always visible). Dedup by version — if bundled already has this version, remote wins. If `availableVersion`/`releaseNotes` change while dialog is open (new update check), the dialog re-reads from the store reactively
- `ScrollArea` for content overflow
- **Empty state:** If merged list is empty (all files malformed + no remote notes), show a centered "No changelogs available" message
- Each entry: clickable header (version badge + title + date + chevron) → expand/collapse body
  - Accordion headers: `role="button"`, `aria-expanded={isExpanded}`, `tabIndex={0}`, `onKeyDown` handler for Enter/Space
- CSS Grid accordion: `grid-rows-[1fr]` / `grid-rows-[0fr]` with `transition-[grid-template-rows,opacity]` (pattern from `DiffFileCard.tsx:487-488`)
- Latest entry (index 0) starts expanded, others collapsed
- **Dialog lifecycle:** Close dialog if update state transitions to `downloading` or `ready` while open (user clicked "Update now" elsewhere)
- Close button (X icon) in header, matching `DialogContent` pattern

#### Animation Spec (Dialog Enter/Exit)

The existing `DialogContentGlass` uses generic `duration-200 animate-in/animate-out fade-in-0 zoom-in-95`. We override this with a custom, more refined animation for the changelog dialog specifically.

**Design principles applied:**

- Emil: ease-out for enter/exit, start from scale(0.95) not scale(0), paired elements rule, exit ~20% faster
- Web Animation Design: ease-out-quint `cubic-bezier(0.23, 1, 0.32, 1)` for strong responsive feel on modals
- Vercel: only animate `transform` + `opacity` (GPU-only, no layout triggers)
- All three: `prefers-reduced-motion: reduce` → disable all animations

**Dialog content enter (250ms):**

```css
/* Override on the dialog content wrapper, not DialogContentGlass itself */
.changelog-dialog-content {
  /* Enter: scale(0.96) + opacity(0) → scale(1) + opacity(1) */
  /* Slightly higher scale start than default 0.95 — feels less dramatic, more polished */
  animation: changelog-enter 250ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

@keyframes changelog-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

**Dialog content exit (200ms — 20% faster than enter):**

```css
.changelog-dialog-content[data-state='closed'] {
  animation: changelog-exit 200ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

@keyframes changelog-exit {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.96) translateY(4px);
  }
}
```

**Overlay (paired — same easing, same duration):**

- Enter: `opacity: 0 → 0.15` over 250ms with same `cubic-bezier(0.23, 1, 0.32, 1)`
- Exit: 200ms matching dialog exit

**Accordion expand/collapse (200ms ease-out):**

```css
/* Grid row transition — GPU-friendly, no layout shift */
.changelog-accordion {
  display: grid;
  transition:
    grid-template-rows 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
/* Expanded */
.changelog-accordion[data-expanded='true'] {
  grid-template-rows: 1fr;
  opacity: 1;
}
/* Collapsed */
.changelog-accordion[data-expanded='false'] {
  grid-template-rows: 0fr;
  opacity: 0;
}
```

**Chevron rotation (150ms — micro-interaction, faster):**

```css
.changelog-chevron {
  transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.changelog-chevron[data-expanded='true'] {
  transform: rotate(180deg);
}
```

**Staggered entry for changelog items (optional polish):**

- Each accordion item fades in with a 30ms stagger delay on initial dialog mount
- `animation-delay: calc(var(--index) * 30ms)` via inline style `style={{ animationDelay: '${index * 30}ms' }}`
- Keep total stagger under 150ms (5 items × 30ms) so it feels quick, not slow
- Only on mount — not on subsequent expand/collapse

**Reduced motion — disable everything:**

```css
@media (prefers-reduced-motion: reduce) {
  .changelog-dialog-content,
  .changelog-dialog-content[data-state='closed'] {
    animation: none;
  }
  .changelog-accordion {
    transition: none;
  }
  .changelog-chevron {
    transition: none;
  }
}
```

**Implementation note:** These CSS classes go in `globals.css` near the existing `.glass-surface` / `.liquid-glass-*` section (~line 1900). The dialog component applies them via `className`. This keeps animation logic in CSS (off main thread, smoother under load per Vercel guidance) rather than JS/Framer Motion. The `will-change: transform` hint is not needed here since the animations are short-lived (< 300ms) and the browser handles GPU promotion automatically for `transform`/`opacity`.

### 4b. Create `apps/agent/src/components/modals/changelog/changelog-renderer.tsx`

- JSX-based line-by-line renderer — parse lines into headings (`##`), list items (`- `, `* `, ordered `1. `), code fences (```blocks rendered as`<pre>`), bold/inline code spans, links, and paragraphs
- No `dangerouslySetInnerHTML` — pure JSX, no XSS vector
- **Link URL safety:** Reuse `ALLOWED_PROTOCOLS` pattern from `markdown-preview.tsx:14` — only render `<a>` for `http:`, `https:`, `mailto:` URLs. All other protocols (`javascript:`, `data:`, `vbscript:`, malformed) render as plain text. Parse URL with `new URL()` in try/catch, check `url.protocol` against allowlist. Links open via `postMessage({ type: 'url:open', uuid: generateUUID(), url })` — the same Tauri bridge flow used in `markdown-preview.tsx:92-96` and `chat-actions.ts`. Render `<a>` with `onClick` handler (not `href`) to intercept and route through the bridge. In browser-only/dev mode, `useTauri`'s mock handler logs the URL
- Unsupported syntax (tables, images) renders as plain text — graceful degradation

### 5. Add "Changelog" button to update toast

**Modify:** `apps/agent/src/components/ui/update-toast.tsx`

- Add third `ToastButton` in `showUpdateAvailable` footer between "Later" and "Update now"
- Label: `"Changelog"`, variant: `"secondary"`
- onClick: `toast.dismiss(UPDATE_TOAST_ID)` then `useUpdateStore.getState().openChangelog()`
- No signature change needed — store access is imperative (consistent with existing pattern)

### 6. Mount ChangelogDialog in `root-layout.tsx`

**Modify:** `apps/agent/src/components/layout/root-layout.tsx`

- This is where other non-crash modals live (QuickOpen, GoToLineDialog)
- Lazy import with named-export mapping (matching existing codebase pattern):
  ```typescript
  const LazyChangelogDialog = lazy(() =>
    import('@/components/modals/changelog/changelog-dialog').then((m) => ({
      default: m.ChangelogDialog,
    }))
  );
  ```
- Render in `<Suspense fallback={null}>` alongside existing modals

### 7. Update barrel exports

**Modify:** `apps/agent/src/components/modals/index.ts` — add `export * from './changelog'`

### 8. Automated tests

**Create:** `apps/agent/src/__tests__/unit/lib/changelog-loader.test.ts`

- Frontmatter parsing: valid, missing title, missing date, missing both, extra fields
- `---` horizontal rules in body don't break parser
- CRLF and BOM handling
- Version extraction from filename
- Semver sort order (including pre-release)
- Duplicate version dedup (warn + keep first)
- Invalid filename skip
- Empty input (no files) returns empty array
- `createVirtualEntry` produces correct shape with notes
- `createVirtualEntry` uses fallback body when `releaseNotes` is null
- `createVirtualEntry` uses fallback body when `releaseNotes` is empty string

**Create:** `apps/agent/src/__tests__/unit/stores/ui/update-store-changelog.test.ts`

- `openChangelog()` sets `changelogDialogOpen: true`
- `closeChangelog()` sets `changelogDialogOpen: false`
- `reset()` closes changelog dialog

**Create:** `apps/agent/src/__tests__/unit/components/modals/changelog/changelog-dialog.test.tsx`

- Renders entries from loader
- Latest entry expanded by default, others collapsed
- Click header toggles expand/collapse
- Keyboard: Enter/Space on header toggles
- Empty state renders fallback message
- Virtual entry from update store appears at top when available
- Virtual entry with null releaseNotes shows fallback body
- Link renderer: `https://` URL renders as clickable `<a>`
- Link renderer: `javascript:` URL renders as plain text (not clickable)
- Link renderer: malformed URL renders as plain text

## Key Reference Files

| File                                                                               | Pattern to Reuse                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/agent/src/lib/icons/icon-loader.ts`                                          | `import.meta.glob` auto-discovery                      |
| `apps/agent/src/components/ui/dialog.tsx:99-122`                                   | `DialogContentGlass` component                         |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx:483-488` | CSS Grid accordion `grid-rows-[0fr/1fr]`               |
| `apps/agent/src/stores/ui/update-store.ts:85-88`                                   | Remote `availableVersion` + `releaseNotes`             |
| `apps/agent/src/components/layout/root-layout.tsx`                                 | Modal mounting pattern                                 |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx:86-100`       | Lazy import `.then((m) => ({ default: m.X }))` pattern |
| `apps/agent/src/components/files/markdown-preview.tsx:14`                          | `ALLOWED_PROTOCOLS` URL safety allowlist               |

## Verification

### Automated

1. `bun run test` — all new tests pass (loader, store, dialog)

### Manual

2. `bun run typecheck` — no TS errors
3. `bun run lint` — no ESLint warnings
4. `bun run dev` — trigger update simulation via DevTools: `window.__orbit_debug.simulateUpdate()` → verify 3 buttons appear → click "Changelog" → dialog opens with remote entry at top (expanded) + bundled entries below
5. Add a new `v0.0.3.md` file to changelogs/ → restart dev → verify it appears automatically without code changes
6. Keyboard navigation: Tab through accordion headers, Enter/Space to expand/collapse
7. Empty state: temporarily empty the changelogs folder + no update available → verify dialog shows fallback message
