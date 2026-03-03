# Plan: Remove Dead CSS from globals.css

## Context

During the Orbit Design System unification (glass-surface, liquid-glass tokens, destructive close buttons, primary icon treatment), many legacy CSS classes and variables became orphaned. These were from earlier design iterations — macOS 26 UI Kit component stubs (`lg-btn`, `lg-table-*`, `lg-segmented`, etc.), the old `liquid-glass-dialog`/`liquid-glass-close` pattern, the multi-layer `glass-input` pseudo-element system, and variables that only served those dead classes.

**Goal**: Remove all dead CSS (classes + variables + Tailwind mappings) from `apps/agent/src/globals.css`.

## Dead CSS Classes (23)

### Group A: Legacy macOS 26 UI Kit component stubs (never wired up)

| Class                                               | Description                 |
| --------------------------------------------------- | --------------------------- |
| `lg-btn` + `:hover` + `:active`                     | Regular button (24px)       |
| `lg-btn-default` + `:hover` + `:active`             | Default/primary button      |
| `lg-button-bar`                                     | Bottom button bar           |
| `lg-label`                                          | Form label                  |
| `lg-pulldown` + `:hover`                            | Pop-up button               |
| `lg-pulldown-chevron`                               | Pulldown chevron icon       |
| `lg-search` + `::placeholder` + `:focus`            | Search field                |
| `lg-section-header`                                 | Section header              |
| `lg-segmented`                                      | Segmented control container |
| `lg-segmented-item` + `[aria-selected]` + `.active` | Segmented control item      |
| `lg-segmented-separator`                            | Segmented separator         |
| `lg-separator-vertical`                             | Vertical divider            |
| `lg-surface` + `::after`                            | Surface with pseudo-element |
| `lg-table-header`                                   | Table header row            |
| `lg-table-header-cell`                              | Table header cell           |
| `lg-table-header-cell-secondary`                    | Secondary header cell       |
| `lg-table-row`                                      | Table body row              |
| `lg-table-cell`                                     | Table body cell             |
| `lg-table-cell-secondary`                           | Secondary body cell         |

### Group B: Replaced by glass-surface / inline Tailwind

| Class                                                    | Description                                             |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `liquid-glass-close`                                     | Old close button (replaced by inline destructive hover) |
| `liquid-glass-dialog` + `html.dark` variants + `::after` | Old dialog glass (replaced by `DialogContentGlass`)     |

### Group C: Unused multi-layer system

| Class                                                         | Description                            |
| ------------------------------------------------------------- | -------------------------------------- |
| `glass-input` + `::before` + `::after` + light mode overrides | Multi-layer blur input (never applied) |

## Dead CSS Variables (9)

Variables only consumed by the dead classes above — zero references in any TSX/TS file.

### In `:root` block

| Variable                         | Only consumer                    |
| -------------------------------- | -------------------------------- |
| `--lg-glass-border` (multi-line) | None                             |
| `--lg-window-shadow`             | None                             |
| `--lg-table-header-border`       | `.lg-table-header` (dead)        |
| `--lg-table-col-border`          | `.lg-table-cell` (dead)          |
| `--lg-table-row-h`               | `.lg-table-row` (dead)           |
| `--lg-table-header-h`            | `.lg-table-header` (dead)        |
| `--lg-segment-bg`                | `.lg-segmented` (dead)           |
| `--lg-segment-separator`         | `.lg-segmented-separator` (dead) |
| `--lg-segment-active`            | `.lg-segmented-item` (dead)      |
| `--lg-segment-inactive`          | `.lg-segmented-item` (dead)      |
| `--lg-search-r`                  | `.lg-search` (dead)              |
| `--lg-close-text`                | `.liquid-glass-close` (dead)     |
| `--lg-text-label`                | `.lg-label` (dead)               |

Same variables must also be removed from `html.dark` block.

## Dead Tailwind @theme Mapping (1)

| Mapping                                       | Reason                              |
| --------------------------------------------- | ----------------------------------- |
| `--color-lg-text-label: var(--lg-text-label)` | Variable and all consumers are dead |

## Verified SAFE to keep

- `apple-tooltip` — used in `tooltip.tsx:90`
- `--lg-text-secondary` — used in 40+ TSX files
- All `liquid-glass-btn*`, `liquid-glass-textarea*` — actively used
- `glass-surface`, `glass-popover`, `chat-input-frost` — actively used
- All `@keyframes` — all 6 are actively referenced

## Implementation

**Single file**: `apps/agent/src/globals.css`

**Order** — bottom-to-top to preserve line numbers:

1. Remove dead class blocks (bottom to top, ~lines 2903→1815)
2. Remove dead variables from `:root` block
3. Remove same variables from `html.dark` block
4. Remove `--color-lg-text-label` from `@theme` block

## Verification

1. `bun run dev` — app starts, no CSS errors
2. Visual check: dialogs, popovers, menus, tooltips, settings, sidebar all render correctly
3. `bun run check` — TypeScript + ESLint pass
