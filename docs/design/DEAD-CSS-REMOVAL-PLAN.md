# Plan: Remove Dead CSS from globals.css

## Context

During the Orbit Design System unification (glass-surface, liquid-glass tokens, destructive close buttons, primary icon treatment), many legacy CSS classes and variables became orphaned. These were from earlier design iterations — macOS 26 UI Kit component stubs (`lg-btn`, `lg-table-*`, `lg-segmented`, etc.), the old `liquid-glass-dialog`/`liquid-glass-close` pattern, the multi-layer `glass-input` pseudo-element system, and variables that only served those dead classes.

**Goal**: Remove all dead CSS (classes + variables + Tailwind mappings) from `apps/agent/src/globals.css`.

**Imported by**: `apps/Canvas-UI-Builder/src/globals.css`, `apps/editor/src/globals.css` — changes propagate to all three apps.

---

## Dead CSS Classes (26)

### Group A: Legacy macOS 26 UI Kit component stubs (never wired up)

| Class                                               | Selector anchor                   | Description                   |
| --------------------------------------------------- | --------------------------------- | ----------------------------- |
| `lg-btn` + `:hover` + `:active`                     | `.lg-btn`                         | Regular button (24px)         |
| `lg-btn-default` + `:hover` + `:active`             | `.lg-btn-default`                 | Default/primary button        |
| `lg-button-bar`                                     | `.lg-button-bar`                  | Bottom button bar             |
| `lg-input` + `::placeholder` + `:focus`             | `.lg-input`                       | Text field (24px, 6px radius) |
| `lg-label`                                          | `.lg-label`                       | Form label                    |
| `lg-pulldown` + `:hover`                            | `.lg-pulldown`                    | Pop-up button                 |
| `lg-pulldown-chevron`                               | `.lg-pulldown-chevron`            | Pulldown chevron icon         |
| `lg-search` + `::placeholder` + `:focus`            | `.lg-search`                      | Search field                  |
| `lg-section-header`                                 | `.lg-section-header`              | Section header                |
| `lg-segmented`                                      | `.lg-segmented`                   | Segmented control container   |
| `lg-segmented-item` + `[aria-selected]` + `.active` | `.lg-segmented-item`              | Segmented control item        |
| `lg-segmented-separator`                            | `.lg-segmented-separator`         | Segmented separator           |
| `lg-separator`                                      | `.lg-separator`                   | Horizontal divider            |
| `lg-separator-vertical`                             | `.lg-separator-vertical`          | Vertical divider              |
| `lg-surface` + `::after`                            | `.lg-surface`                     | Surface with pseudo-element   |
| `lg-table-header`                                   | `.lg-table-header`                | Table header row              |
| `lg-table-header-cell`                              | `.lg-table-header-cell`           | Table header cell             |
| `lg-table-header-cell-secondary`                    | `.lg-table-header-cell-secondary` | Secondary header cell         |
| `lg-table-row`                                      | `.lg-table-row`                   | Table body row                |
| `lg-table-cell`                                     | `.lg-table-cell`                  | Table body cell               |
| `lg-table-cell-secondary`                           | `.lg-table-cell-secondary`        | Secondary body cell           |

> **Note on `lg-input` vs `--lg-input-*`**: The `.lg-input` CSS _class_ is dead. The `--lg-input-bg`, `--lg-input-border`, `--lg-input-focus`, `--lg-input-cursor`, `--lg-input-placeholder` CSS _variables_ are alive (used by CodeMirrorEditor and `liquid-glass-textarea`). Do not confuse them.
>
> **Note on `lg-separator` vs `--lg-separator`**: The `.lg-separator` CSS _class_ is dead. The `--lg-separator` CSS _variable_ is alive (used in 50+ TSX files via Tailwind's `bg-lg-separator` / `border-lg-separator`). Do not remove the variable or its `@theme` mapping.

### Group B: Replaced by glass-surface / inline Tailwind

| Class                                                    | Selector anchor        | Description                                             |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| `liquid-glass-close`                                     | `.liquid-glass-close`  | Old close button (replaced by inline destructive hover) |
| `liquid-glass-dialog` + `html.dark` variants + `::after` | `.liquid-glass-dialog` | Old dialog glass (replaced by `DialogContentGlass`)     |

### Group C: Unused multi-layer system

| Class                                                         | Selector anchor                              | Description                                |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| `glass-input` + `::before` + `::after` + light mode overrides | `.glass-input`                               | Multi-layer blur input (never applied)     |
| `glass-input` liquid glass mode overrides                     | `html.window-mode-liquid-glass .glass-input` | Liquid glass tint variants (never applied) |

> **IMPORTANT**: The `glass-input` liquid glass overrides (`html.window-mode-liquid-glass .glass-input::before/after`) are in a **separate section** from the base class. They must be removed together with the base class to avoid orphaned rules.

---

## Dead CSS Variables (22)

Variables whose only consumers are the dead classes above, or that have no consumers at all. Each variable must be removed from **both** `:root` and `html.dark` blocks.

### Tier 1: Only consumed by dead classes (or unreferenced)

| Variable                         | Only consumer(s)                                                           | Status       |
| -------------------------------- | -------------------------------------------------------------------------- | ------------ |
| `--lg-glass-border` (multi-line) | None                                                                       | Unreferenced |
| `--lg-window-shadow`             | None                                                                       | Unreferenced |
| `--lg-table-header-border`       | `.lg-table-header` (dead)                                                  | Dead         |
| `--lg-table-col-border`          | None (plan originally said `.lg-table-cell` but that class doesn't use it) | Unreferenced |
| `--lg-table-row-h`               | `.lg-table-row` (dead)                                                     | Dead         |
| `--lg-table-header-h`            | `.lg-table-header` (dead)                                                  | Dead         |
| `--lg-segment-bg`                | `.lg-segmented` (dead)                                                     | Dead         |
| `--lg-segment-separator`         | `.lg-segmented-separator` (dead)                                           | Dead         |
| `--lg-segment-active`            | `.lg-segmented-item` (dead)                                                | Dead         |
| `--lg-segment-inactive`          | `.lg-segmented-item` (dead)                                                | Dead         |
| `--lg-search-r`                  | `.lg-search` (dead)                                                        | Dead         |
| `--lg-close-text`                | `.liquid-glass-close` (dead)                                               | Dead         |
| `--lg-text-label`                | `.lg-label` (dead)                                                         | Dead         |

### Tier 2: Become dead after class removal (cascading dead tokens)

| Variable                | Only consumer(s)                                                                                            | Status                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `--lg-blur`             | `.lg-surface` (dead), `.liquid-glass-dialog` (dead)                                                         | Dead after class removal |
| `--lg-saturate`         | `.lg-surface` (dead), `.liquid-glass-dialog` (dead)                                                         | Dead after class removal |
| `--lg-tint`             | `.lg-surface::after` (dead), `.liquid-glass-dialog::after` (dead)                                           | Dead after class removal |
| `--lg-control-h`        | `.lg-btn`, `.lg-btn-default`, `.lg-input`, `.lg-search`, `.lg-segmented`, `.lg-pulldown` (all dead)         | Dead after class removal |
| `--lg-control-r`        | `.lg-btn`, `.lg-btn-default`, `.lg-input`, `.lg-segmented`, `.lg-segmented-item`, `.lg-pulldown` (all dead) | Dead after class removal |
| `--lg-btn-text`         | `.lg-btn` (dead)                                                                                            | Dead after class removal |
| `--lg-btn-bg`           | `.lg-btn` (dead), `@theme` mapping (dead)                                                                   | Dead after class removal |
| `--lg-btn-bg-hover`     | `.lg-btn:hover` (dead), `@theme` mapping (dead)                                                             | Dead after class removal |
| `--lg-letter-spacing`   | `.lg-label` (dead)                                                                                          | Dead after class removal |
| `--lg-accent`           | None                                                                                                        | Unreferenced             |
| `--lg-input-focus-thin` | None                                                                                                        | Unreferenced             |

> **Note on `--lg-control-h`**: `.liquid-glass-btn` uses `--lg-alert-h` (different variable), NOT `--lg-control-h`. Verified safe to remove.

---

## Dead Tailwind @theme Mappings (3)

| Mapping                                        | Reason                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `--color-lg-text-label: var(--lg-text-label)`  | Variable and all consumers are dead        |
| `--color-lg-btn: var(--lg-btn-bg)`             | `bg-lg-btn` not used in any TSX file       |
| `--color-lg-btn-hover: var(--lg-btn-bg-hover)` | `bg-lg-btn-hover` not used in any TSX file |

---

## Verified SAFE to keep

### Variables — alive via TSX inline styles, CodeMirror, or active CSS classes

| Variable                                                                                                    | Alive consumer                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `--lg-text-secondary`                                                                                       | 40+ TSX files via `text-lg-text-secondary`                         |
| `--lg-separator`                                                                                            | 50+ TSX files via `bg-lg-separator` / `border-lg-separator`        |
| `--lg-control-bg` / `--lg-control-bg-hover`                                                                 | ProjectsDialog, CreateWorktreeDialog, update-toast (inline styles) |
| `--lg-input-bg` / `--lg-input-border` / `--lg-input-focus` / `--lg-input-cursor` / `--lg-input-placeholder` | CodeMirrorEditor (inline styles), `liquid-glass-textarea`          |
| `--lg-window-r`                                                                                             | `liquid-glass-textarea` (alive)                                    |
| `--lg-font-size` / `--lg-font-size-sm`                                                                      | `liquid-glass-title/desc/btn/textarea`, update-toast               |
| `--lg-font-weight` / `--lg-font-weight-bold`                                                                | `liquid-glass-title/btn/textarea`                                  |
| `--lg-line-height` / `--lg-line-height-sm`                                                                  | `liquid-glass-title/desc/btn/textarea`                             |
| `--lg-default-bg` / `--lg-default-text`                                                                     | `liquid-glass-btn-primary` (alive)                                 |
| `--lg-alert-*` (h, r, secondary-_, destructive-_)                                                           | `liquid-glass-btn-*` (alive)                                       |
| `--lg-sidebar-selected` / `--lg-sidebar-hover`                                                              | TSX via Tailwind utilities                                         |
| `--lg-destructive` / `--lg-destructive-bg`                                                                  | TSX via Tailwind utilities                                         |
| `--lg-border`                                                                                               | TSX via `border-lg-border`                                         |
| `--lg-text-primary`                                                                                         | TSX via `text-lg-text` + alive CSS classes                         |

### Classes — alive

- `apple-tooltip` — used in `tooltip.tsx`
- All `liquid-glass-btn*`, `liquid-glass-textarea*` — actively used
- `glass-surface`, `glass-popover`, `chat-input-frost` — actively used
- All `@keyframes` — all 6 are actively referenced

### DANGER ZONE: Adjacent live code

These classes are **actively used in 10+ dialog components** and sit physically adjacent to dead `liquid-glass-dialog`. **DO NOT REMOVE:**

| Class                | Selector anchor       | Used in                                                                                                                                                                                                                 |
| -------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `liquid-glass-icon`  | `.liquid-glass-icon`  | main.tsx, VaultCreateDialog, VaultDeleteDialog, ConversationDeleteDialog, WelcomeStep, ProviderStep, clone-repository-dialog, feedback-dialog, ssh-connection-dialog, create/delete-worktree-dialog, CreateBranchDialog |
| `liquid-glass-title` | `.liquid-glass-title` | Same 10+ files                                                                                                                                                                                                          |
| `liquid-glass-desc`  | `.liquid-glass-desc`  | Same 10+ files                                                                                                                                                                                                          |

---

## Implementation

**Single file**: `apps/agent/src/globals.css`

**Anchor on selectors, not line numbers.** Line numbers below are reference hints for the current file state — always locate blocks by their CSS selector before deleting.

### Zone 1: Component classes (bottom-to-top)

Remove each block by selector. **Stop before `.liquid-glass-icon`** — that class is alive.

| Step | Remove (by selector)                                                                                                                             | Line hint  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1    | `.lg-button-bar`                                                                                                                                 | ~2908      |
| 2    | `.lg-pulldown-chevron`                                                                                                                           | ~2892      |
| 3    | `.lg-pulldown` + `:hover`                                                                                                                        | ~2871      |
| 4    | `.lg-table-cell-secondary`                                                                                                                       | ~2862      |
| 5    | `.lg-table-cell`                                                                                                                                 | ~2852      |
| 6    | `.lg-table-row`                                                                                                                                  | ~2846      |
| 7    | `.lg-table-header-cell-secondary`                                                                                                                | ~2841      |
| 8    | `.lg-table-header-cell`                                                                                                                          | ~2831      |
| 9    | `.lg-table-header`                                                                                                                               | ~2824      |
| 10   | `.lg-separator-vertical`                                                                                                                         | ~2813      |
| 11   | `.lg-separator`                                                                                                                                  | ~2807      |
| 12   | `.lg-segmented-separator`                                                                                                                        | ~2796      |
| 13   | `.lg-segmented-item` + variants                                                                                                                  | ~2773      |
| 14   | `.lg-segmented`                                                                                                                                  | ~2763      |
| 15   | `.lg-section-header`                                                                                                                             | ~2749      |
| 16   | `.lg-label`                                                                                                                                      | ~2737      |
| 17   | `.lg-search` + variants                                                                                                                          | ~2687      |
| 18   | `.lg-input` + variants                                                                                                                           | ~2657      |
| 19   | `.lg-btn-default` + variants                                                                                                                     | ~2627      |
| 20   | `.lg-btn` + variants                                                                                                                             | ~2597      |
| 21   | `.liquid-glass-close`                                                                                                                            | ~2588      |
| —    | **KEEP** `.liquid-glass-icon`, `.liquid-glass-title`, `.liquid-glass-desc`, `.liquid-glass-btn*`, `.liquid-glass-textarea*`, reduced-motion rule | ~2479–2586 |
| 22   | `.liquid-glass-dialog` + `html.dark` variants + `::after`                                                                                        | ~2452      |
| 23   | `.lg-surface` + `::after`                                                                                                                        | ~2429      |

### Zone 2: glass-input base

| Step | Remove (by selector)                                           | Line hint |
| ---- | -------------------------------------------------------------- | --------- |
| 24   | `.glass-input` + `::before` + `::after` + light mode overrides | ~1830     |

### Zone 3: glass-input liquid glass overrides

| Step | Remove (by selector)                                            | Line hint |
| ---- | --------------------------------------------------------------- | --------- |
| 25   | `html.window-mode-liquid-glass .glass-input::before`            | ~651      |
| 26   | `html.window-mode-liquid-glass .glass-input::after`             | ~658      |
| 27   | `html.window-mode-liquid-glass:not(.dark) .glass-input::before` | ~668      |
| 28   | `html.window-mode-liquid-glass:not(.dark) .glass-input::after`  | ~674      |

### Zone 4: Dead variables from `:root` and `html.dark`

Remove the following variables from **both** the `:root` block and the `html.dark` block. Locate each by its `--lg-*` name — do not rely on line numbers.

**Tier 1 — originally dead (no live consumers):**

| Step | Remove variable            |
| ---- | -------------------------- |
| 29   | `--lg-glass-border`        |
| 30   | `--lg-window-shadow`       |
| 31   | `--lg-table-header-border` |
| 32   | `--lg-table-col-border`    |
| 33   | `--lg-table-row-h`         |
| 34   | `--lg-table-header-h`      |
| 35   | `--lg-segment-bg`          |
| 36   | `--lg-segment-separator`   |
| 37   | `--lg-segment-active`      |
| 38   | `--lg-segment-inactive`    |
| 39   | `--lg-search-r`            |
| 40   | `--lg-close-text`          |
| 41   | `--lg-text-label`          |

**Tier 2 — cascading dead (become dead after class removal):**

| Step | Remove variable         |
| ---- | ----------------------- |
| 42   | `--lg-blur`             |
| 43   | `--lg-saturate`         |
| 44   | `--lg-tint`             |
| 45   | `--lg-control-h`        |
| 46   | `--lg-control-r`        |
| 47   | `--lg-btn-text`         |
| 48   | `--lg-btn-bg`           |
| 49   | `--lg-btn-bg-hover`     |
| 50   | `--lg-letter-spacing`   |
| 51   | `--lg-accent`           |
| 52   | `--lg-input-focus-thin` |

### Zone 5: Dead Tailwind @theme mappings

| Step | Remove mapping from `@theme inline` block      |
| ---- | ---------------------------------------------- |
| 53   | `--color-lg-text-label: var(--lg-text-label)`  |
| 54   | `--color-lg-btn: var(--lg-btn-bg)`             |
| 55   | `--color-lg-btn-hover: var(--lg-btn-bg-hover)` |

---

## Verification

### 1. Pre-flight: prove targets are unused

```bash
# Boundary-aware selector search — should return 0 hits outside globals.css
rg -n -P '(?<![A-Za-z0-9-])(lg-btn|lg-btn-default|lg-button-bar|lg-input|lg-label|lg-pulldown|lg-pulldown-chevron|lg-search|lg-section-header|lg-segmented|lg-segmented-item|lg-segmented-separator|lg-separator(?!-)|lg-separator-vertical|lg-surface|lg-table-header|lg-table-header-cell|lg-table-header-cell-secondary|lg-table-row|lg-table-cell|lg-table-cell-secondary|liquid-glass-close|liquid-glass-dialog|glass-input)(?![A-Za-z0-9-])' \
  apps packages agent-bridge src-tauri \
  --glob '*.{ts,tsx,css}' \
  --glob '!apps/agent/src/globals.css'
```

```bash
# Verify Tailwind utility consumers before removing mappings
rg -n 'bg-lg-btn[^-]|hover:bg-lg-btn-hover|text-lg-text-label|bg-lg-text-label|border-lg-text-label' apps/
```

### 2. Post-edit: build and lint

```bash
bun run dev       # App starts, no CSS errors
bun run check     # TypeScript + ESLint pass
```

### 3. Post-edit: dead token scan

```bash
# Confirm no newly-orphaned --lg-* tokens remain
# For each --lg-* var defined in :root, check it has at least one consumer
rg -n 'var\(--lg-' apps/agent/src/globals.css | \
  sed 's/.*var(//;s/).*//' | sort -u > /tmp/lg-consumers.txt
rg -n '^\s*--lg-[^:]+:' apps/agent/src/globals.css | \
  sed 's/.*\(--lg-[^:]*\):.*/\1/' | sort -u > /tmp/lg-defined.txt
comm -23 /tmp/lg-defined.txt /tmp/lg-consumers.txt
# Any output = defined but unconsumed token. Investigate before shipping.
```

### 4. Visual smoke test

Check in **both light and dark mode** across all three apps:

- Agent: dialogs (delete conversation, clone repo, create branch, settings), popovers, menus, tooltips, sidebar, chat input, terminal
- Canvas UI Builder: verify app loads without CSS errors
- Editor: verify app loads without CSS errors

---

## Edge Cases

| Risk                                                                                                                                                                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New consumer lands between pre-flight and merge.** Another branch adds a `className="lg-btn ..."` after the pre-flight scan passes but before merge.                                                                                                                                                                   | Re-run the pre-flight `rg` scan on the merge target immediately before merging. If CI is available, add the scan as a merge-gate check.                                                                                                                                                                                                                                                                                                                                     |
| **Token removed in `:root` but missed in `html.dark` (mode drift).** A variable is deleted from one block but overlooked in the other, causing the dark theme to silently fall back to the initial value or inherit from the missing definition.                                                                         | Steps 29–52 explicitly say "remove from **both** blocks." After editing, run: `rg '^\s*--lg-(glass-border\|window-shadow\|table-header-border\|table-col-border\|table-row-h\|table-header-h\|segment-bg\|segment-separator\|segment-active\|segment-inactive\|search-r\|close-text\|text-label\|blur\|saturate\|tint\|control-h\|control-r\|btn-text\|btn-bg\|btn-bg-hover\|letter-spacing\|accent\|input-focus-thin)' apps/agent/src/globals.css` — should return 0 hits. |
| **Partial cleanup leaves `@theme` mappings without source tokens (or the reverse).** Removing `--lg-btn-bg` from `:root`/`html.dark` but forgetting `--color-lg-btn` in `@theme` produces a Tailwind utility that resolves to nothing. Conversely, removing the mapping but keeping the token leaves unused definitions. | Zone 4 (tokens) and Zone 5 (mappings) are paired — execute both. The post-edit dead-token scan (Verification step 3) catches orphaned tokens, and the `@theme` block is small enough to visually audit after edits.                                                                                                                                                                                                                                                         |
| **Smoke checks run only in Agent, missing regressions in Editor/Canvas.** Both `apps/editor/src/globals.css` and `apps/Canvas-UI-Builder/src/globals.css` import Agent's `globals.css`. A removed variable that Canvas or Editor references directly (not via Tailwind) would break silently.                            | Verification step 4 explicitly requires loading all three apps. Additionally, run `rg 'var(--lg-' apps/Canvas-UI-Builder apps/editor --glob '*.{css,tsx,ts}'` post-edit to confirm neither downstream app references any removed token.                                                                                                                                                                                                                                     |
