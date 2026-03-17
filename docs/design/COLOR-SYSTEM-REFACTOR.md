# Orbit Design System — Color Token Refactor

## Context

The app looks exactly right — no visual changes. But the color system is organizational chaos: 3 overlapping systems (Radix gray-\*, shadcn semantic, Liquid Glass lg-\*), ~30 dead tokens, and hardcoded hex/oklch/rgba values scattered across 25+ component files. The same color (e.g., menu backgrounds) is expressed differently in 8+ places.

**Goal:** Build one canonical design system following the Geist 10-step model (see `GEIST-SYSTEM.md`). Monochromatic gray chrome + Cursor Anysphere blue for interactive elements. Every color gets a named token. Components reference tokens, never raw values. Then refactor file-by-file.

---

## Step 1: Remap Primitive Scale in globals.css

Remap Radix `--gray-{1-12}` → Geist `--orbit-*` naming. **Delete** the Radix accent scale entirely (monochromatic — no accent hue).

### Gray → Orbit Mapping (Radix 12-step → Geist 10-step + Background)

```
RADIX VARIABLE           →  NEW ORBIT VARIABLE              SEMANTIC BAND
──────────────────────────────────────────────────────────────────────────
--gray-1   (app bg)      →  --orbit-background-100           Background 1
--gray-2   (subtle bg)   →  --orbit-background-200           Background 2
--gray-a1                →  --orbit-background-alpha-100     Background alpha
--gray-a2                →  --orbit-background-alpha-200     Background alpha

--gray-3   (component)   →  --orbit-100                      Component BG: default
--gray-4   (hover)       →  --orbit-200                      Component BG: hover
--gray-5   (active)      →  --orbit-300                      Component BG: active
--gray-6   (border)      →  --orbit-400                      Border: default
--gray-7   (hover)       →  --orbit-500                      Border: hover
--gray-8   (strong)      →  --orbit-600                      Border: active
--gray-9   (solid)       →  --orbit-700                      High contrast BG
--gray-10  (solid hover) →  --orbit-800                      High contrast BG hover
--gray-11  (lo-contrast) →  --orbit-900                      Secondary text & icons
--gray-12  (hi-contrast) →  --orbit-1000                     Primary text & icons

--gray-a3                →  --orbit-alpha-100                Alpha: component BG
...
--gray-a12               →  --orbit-alpha-1000               Alpha: primary text
```

Apply across ALL blocks in globals.css:

- `:root` (light mode) — 24 gray vars → 12 orbit + 2 background + 10 alpha + 2 bg-alpha
- `html.dark` — same
- `html.window-mode-solid` — both light/dark (12 `var(--gray-*)` refs in mode overrides)
- `html.window-mode-liquid-glass` — both light/dark
- `@supports (color: color(display-p3 ...))` — P3 gamut block
- `@theme inline { }` — Tailwind mappings become `--color-orbit-*`
- Streamdown code block styles — `var(--gray-11)` → `var(--orbit-900)`, `var(--gray-9)` → `var(--orbit-700)`, `var(--gray-a3)` → `var(--orbit-alpha-100)`
- `.chat-markdown a` styles — `var(--gray-12)` → `var(--orbit-1000)`, `var(--gray-11)` → `var(--orbit-900)` (lines ~914, ~922 — highly visible chat links)
- `.insight-block` styles — uses `var(--accent-7)`, `var(--accent-a2)`, `var(--accent-9)`, `var(--accent-11)` — migrate to `--primary` (blue) BEFORE accent deletion (see Pattern K)

Update ALL internal `var(--gray-*)` references within globals.css (~96 occurrences) using the mapping above.

### Accent Scale: Remove Entirely (Monochromatic)

The Radix accent scale (`--accent-{1-12}`, `--accent-a{1-12}`) is **deleted, not renamed**. Monochromatic system — all UI chrome uses gray only.

**Delete from all blocks** (`:root`, `html.dark`, `html.window-mode-*`, `@supports P3`, `@theme inline`):

```
--accent-1 through --accent-12       ← DELETE
--accent-a1 through --accent-a12     ← DELETE
--accent-contrast                    ← DELETE
--accent-surface                     ← DELETE
--accent-indicator, --accent-track   ← DELETE (dead tokens)
```

**`@theme inline` — delete Tailwind accent mappings (lines 65-76):**

```
--color-accent-1 through --color-accent-12   ← DELETE (12 lines)
```

Without deletion, Tailwind utilities like `bg-accent-9` resolve to empty strings. KEEP `--color-accent` and `--color-accent-foreground` (shadcn semantic).

**`@supports P3` — delete accent oklch/display-p3 overrides (~90 lines):**

- Light accent P3 values (lines ~2099-2126) ← DELETE
- Dark accent P3 values (lines ~2161-2188) ← DELETE
- Light accent alpha P3 values ← DELETE
- Dark accent alpha P3 values ← DELETE

**DO NOT delete (shadcn semantic tokens):**

```
--accent: var(--orbit-400);           ← Aliases gray border step. Used by bg-accent (30+ files)
--accent-foreground: var(--orbit-1000); ← Used by text-accent-foreground
--color-accent: var(--accent);        ← Tailwind semantic mapping
--color-accent-foreground             ← Tailwind semantic mapping
```

These shadcn tokens stay but now point to gray orbit steps instead of the Radix accent scale.

**Also remove dead gray tokens:**

- `--gray-indicator`, `--gray-track` (4 tokens × 4+ blocks)
- `--gray-surface` (4 tokens × 4+ blocks — no consumers)

**⚠ `--gray-contrast` is NOT dead** — consumed by `CodeMirrorEditor.tsx:531` (`.cm-search` input focus background). Must be remapped in Pattern I before deletion. Temporary alias: `--gray-contrast: var(--orbit-background-100)` until Pattern I completes.

**Scope of Tailwind class renames** (very small):

- 3 files use `bg-gray-*`/`text-gray-*` classes (5 occurrences including editor app) → remap to `--orbit-*` using step mapping above
- 3 files use `bg-accent-{1-12}`/`text-accent-{1-12}` classes (5 occurrences) → replace with gray `orbit-*` equivalents (see Pattern J)

**`var(--gray-*)` in non-CSS files** (must update using mapping above):

- `CodeMirrorEditor.tsx` — 35 references → `var(--orbit-{100-1000})`
- `AccountSettings.tsx` — 1 reference
- `styles/allotment-overrides.css` — 1 reference (`--focus-border: var(--gray-9)` → `var(--orbit-700)`)

---

## Step 2: Add Missing Semantic Tokens to globals.css

Add these NEW tokens in both `:root` and `html.dark`, then map in `@theme inline {}`:

### Surfaces & Backgrounds

| Token                | Light                      | Dark                                                        | Replaces                                                                                                                         |
| -------------------- | -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--menu-bg`          | `#f3f3f3`                  | `oklch(23% 0 0)`                                            | Opaque menus/dropdowns: `bg-[#f3f3f3] dark:bg-[oklch(23%_0_0)]`                                                                  |
| `--glass-popover-bg` | `rgba(255, 255, 255, 0.7)` | `color-mix(in srgb, var(--lg-control-bg) 80%, transparent)` | Glass popovers: `bg-white/70 dark:bg-lg-control/80` — semi-transparent + backdrop-blur for frosted glass effect                  |
| `--tool-output-bg`   | `var(--chat-area)`         | `oklch(23% 0 0)`                                            | 7+ tool widgets. Dark value intentionally differs from `--chat-area` (#181818) to create subtle elevation for tool output boxes. |
| `--user-bubble-bg`   | `var(--lg-control-bg)`     | `#272727`                                                   | MessageItem user bubble                                                                                                          |

### Component Fills (absorbs lg-alert-secondary-\* pattern)

Renamed from `--element` to `--control-fill` for clarity — these tokens are used exclusively by form controls (inputs, buttons, selects, command palettes).

| Token                  | Light                                | Dark | Replaces                                         |
| ---------------------- | ------------------------------------ | ---- | ------------------------------------------------ |
| `--control-fill`       | `var(--lg-alert-secondary-bg)`       | same | `bg-[var(--lg-alert-secondary-bg)]` in 10+ files |
| `--control-fill-hover` | `var(--lg-alert-secondary-bg-hover)` | same | hover variant                                    |
| `--control-text`       | `var(--lg-alert-secondary-text)`     | same | text variant                                     |

### Borders

| Token             | Light                 | Dark                     | Replaces                                                                                                                                                                                                       |
| ----------------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--border-subtle` | `var(--lg-border)`    | same                     | Alias for `--lg-border`. **⚠ Potentially dead** — `--lg-border` is defined in globals.css but has zero component consumers. Only add this token if you identify components that should use it; otherwise omit. |
| `--border-tool`   | `rgba(0,0,0,0.1)`     | `rgba(255,255,255,0.05)` | `border-black/10 dark:border-white/5`                                                                                                                                                                          |
| `--border-menu`   | `rgba(255,255,255,1)` | `rgba(255,255,255,0.05)` | `border-white dark:border-white/5`                                                                                                                                                                             |

### Git Status (8 colors + 8 subtle backgrounds)

| Token                                          | Light                               | Dark                                |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------- |
| `--git-added` / `--git-added-subtle`           | `#4ade80` / `rgba(74,222,128,0.2)`  | same                                |
| `--git-modified` / `--git-modified-subtle`     | `#c18533` / `rgba(193,133,51,0.2)`  | `#f0b367` / `rgba(240,179,103,0.2)` |
| `--git-deleted` / `--git-deleted-subtle`       | `#f87171` / `rgba(248,113,113,0.2)` | same                                |
| `--git-untracked` / `--git-untracked-subtle`   | `#0d87ff` / `rgba(13,135,255,0.2)`  | `#99ceff` / `rgba(153,206,255,0.2)` |
| `--git-renamed` / `--git-renamed-subtle`       | `#60a5fa` / `rgba(96,165,250,0.2)`  | same                                |
| `--git-copied` / `--git-copied-subtle`         | `#c084fc` / `rgba(192,132,252,0.2)` | same                                |
| `--git-conflicted` / `--git-conflicted-subtle` | `#fb923c` / `rgba(251,146,60,0.2)`  | same                                |
| `--git-typechange` / `--git-typechange-subtle` | `#22d3ee` / `rgba(34,211,238,0.2)`  | same                                |

### Avatars (monochromatic — no accent hue)

| Token              | Light              | Dark               | Replaces                                                    |
| ------------------ | ------------------ | ------------------ | ----------------------------------------------------------- |
| `--avatar-project` | `var(--orbit-700)` | `var(--orbit-800)` | `bg-[#945036] dark:bg-[#e9ad97]` (was warm brown, now gray) |
| `--avatar-user`    | `var(--orbit-700)` | `var(--orbit-800)` | accent avatar (was warm brown, now gray)                    |
| `--avatar-system`  | `var(--orbit-700)` | `var(--orbit-800)` | `bg-[#2B5EA7] dark:bg-[#7EB4F0]` (was blue, now gray)       |

### Tags / Sidebar Text

| Token        | Light     | Dark      | Replaces                             |
| ------------ | --------- | --------- | ------------------------------------ |
| `--tag-text` | `#4C4C4C` | `#B0B0B0` | `text-[#4C4C4C] dark:text-[#B0B0B0]` |

### Links (Cursor Anysphere blue — same as primary)

| Token    | Light     | Dark      | Replaces                                           |
| -------- | --------- | --------- | -------------------------------------------------- |
| `--link` | `#3C7CAB` | `#81A1C1` | `text-[#0d87ff] dark:text-[#99ceff]` → Cursor blue |

### Primary Button (Cursor Anysphere blue)

| Token                  | Light     | Dark      | Replaces                                                 |
| ---------------------- | --------- | --------- | -------------------------------------------------------- |
| `--primary`            | `#3C7CAB` | `#81A1C1` | `#007AFF` (System Blue → Cursor blue)                    |
| `--primary-foreground` | `#FCFCFC` | `#191c22` | `#fff` both modes → dark text on light blue in dark mode |
| `--primary-hover`      | `#055180` | `#87A6C4` | (new — button hover state)                               |

### Shadow tokens (menu/dropdown pattern)

| Token                 | Light                                                                                                | Dark                                                               | Replaces                   |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| `--orbit-shadow-menu` | `0 0 0 1px rgba(255,255,255,0.9), 0 4px 12px -2px rgba(0,0,0,0.1), 0 8px 24px -4px rgba(0,0,0,0.08)` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Duplicated across 6+ menus |

**⚠ Naming:** The CSS variable in `:root`/`html.dark` MUST be `--orbit-shadow-menu` (not `--shadow-menu`). The `@theme inline` mapping then exports it as `--shadow-menu: var(--orbit-shadow-menu)`. Using the same name (`--shadow-menu: var(--shadow-menu)`) in `@theme inline` creates a self-referential cycle that resolves to the CSS guaranteed-invalid value.

Note: Dark mode value is the raw CSS equivalent of Tailwind's `shadow-md`. Must be a real CSS shadow string, not a Tailwind utility name.

### `@theme inline` — Tailwind mappings for ALL new semantic tokens

Every new token above must also be mapped in `@theme inline {}` or Tailwind utilities (`bg-menu-bg`, `text-link`, `shadow-menu`, etc.) won't resolve.

```css
@theme inline {
  /* ... existing orbit-* mappings ... */

  /* Surfaces */
  --color-menu-bg: var(--menu-bg);
  --color-glass-popover-bg: var(--glass-popover-bg);
  --color-tool-output-bg: var(--tool-output-bg);
  --color-user-bubble-bg: var(--user-bubble-bg);

  /* Controls */
  --color-control-fill: var(--control-fill);
  --color-control-fill-hover: var(--control-fill-hover);
  --color-control-text: var(--control-text);

  /* Borders */
  --color-border-tool: var(--border-tool);
  --color-border-menu: var(--border-menu);

  /* Interactive (Cursor blue) */
  --color-link: var(--link);
  --color-primary-hover: var(--primary-hover);

  /* Tags / Text */
  --color-tag-text: var(--tag-text);

  /* Avatars */
  --color-avatar-project: var(--avatar-project);
  --color-avatar-user: var(--avatar-user);
  --color-avatar-system: var(--avatar-system);

  /* Git status (8 colors + 8 subtle) */
  --color-git-added: var(--git-added);
  --color-git-added-subtle: var(--git-added-subtle);
  --color-git-modified: var(--git-modified);
  --color-git-modified-subtle: var(--git-modified-subtle);
  --color-git-deleted: var(--git-deleted);
  --color-git-deleted-subtle: var(--git-deleted-subtle);
  --color-git-untracked: var(--git-untracked);
  --color-git-untracked-subtle: var(--git-untracked-subtle);
  --color-git-renamed: var(--git-renamed);
  --color-git-renamed-subtle: var(--git-renamed-subtle);
  --color-git-copied: var(--git-copied);
  --color-git-copied-subtle: var(--git-copied-subtle);
  --color-git-conflicted: var(--git-conflicted);
  --color-git-conflicted-subtle: var(--git-conflicted-subtle);
  --color-git-typechange: var(--git-typechange);
  --color-git-typechange-subtle: var(--git-typechange-subtle);

  /* Shadow */
  --shadow-menu: var(--orbit-shadow-menu);
}
```

---

## Step 3: Refactor Components (by pattern, not file)

### Pattern A: Opaque menu surfaces (6 files, ~8 changes)

Replace `bg-[#f3f3f3] dark:bg-[oklch(23%_0_0)]` → `bg-menu-bg`
Replace `border-white dark:border-white/5` → `border-border-menu`
Replace `shadow-[0_0_0_1px_rgba(...)]` or `shadow-[0_4px_12px_-2px_rgba(...)]` → `shadow-menu`

**Files:**

- `components/ui/context-menu.tsx` (2 places)
- `components/ui/dropdown-menu.tsx` (2 places)
- `components/chat/input/use-chat-input.ts`
- `components/git/source-control/components/CommitForm.tsx`
- `components/ui/tooltip.tsx` — uses `fill-[var(--chat-area)] dark:fill-[oklch(23%_0_0)]` (SVG arrow, use `fill-[var(--menu-bg)]` or `fill-tool-output-bg`)
- `components/layout/actions-bar.tsx` — uses `bg-[var(--chat-area)] dark:bg-[oklch(23%_0_0)]` + `border-[rgba(0,0,0,0.15)] dark:border-white/5`

### Pattern A2: Glass popover surfaces (4 files, 5 changes)

Replace `bg-white/70 dark:bg-lg-control/80` → `bg-glass-popover-bg`
Replace `border-white dark:border-white/5` → `border-border-menu`
Replace `shadow-[0_4px_12px_-2px_rgba(...)]` → `shadow-menu`

**⚠ KEEP `backdrop-blur-sm dark:backdrop-blur-xl`** — the blur is NOT tokenized. It stays as Tailwind utilities because it's a rendering property, not a color.

**Files:**

- `components/git/source-control/components/BranchSelector.tsx:82` — glass popover
- `components/chat/input/context.tsx:155` — glass popover
- `components/chat/input/model-selector.tsx:281` — glass popover
- `components/sidebar/WorktreeItem.tsx:341` — SelectContent glass popover (uses `!` important modifiers)
- `components/sidebar/WorktreeItem.tsx:387` — PopoverContent glass popover

### Pattern B: Tool widget output (7 files, identical change)

Replace `border border-black/10 dark:border-white/5 bg-chat-area dark:bg-[oklch(23%_0_0)]` → `border border-border-tool bg-tool-output-bg`

**Files:**

- `components/chat/tools/bash-tool-widget.tsx`
- `components/chat/tools/grep-tool-widget.tsx`
- `components/chat/tools/glob-tool-widget.tsx`
- `components/chat/tools/task-tool-widget.tsx`
- `components/chat/tools/todo-tool-widget.tsx`
- `components/chat/tools/web-fetch-tool-widget.tsx`
- `components/chat/tools/web-search-tool-widget.tsx`

### Pattern C: Control fills — lg-alert-secondary pattern (10+ files, ~19 changes)

Replace `bg-[var(--lg-alert-secondary-bg)]` → `bg-control-fill`
Replace `hover:bg-[var(--lg-alert-secondary-bg-hover)]` → `hover:bg-control-fill-hover`
Replace `text-[var(--lg-alert-secondary-text)]` → `text-control-text`

**Files:** input.tsx, textarea.tsx, select.tsx, button.tsx, command.tsx, ProjectsDialog, SkillsDialog, SlashCommandsSettings, SubagentsSettings, BranchPickerContent

### Pattern D: Git status colors (2 sources → single source of truth)

**IMPORTANT:** Git status colors exist in TWO places. Both must be migrated:

1. **`lib/utils/constants.ts`** — `GIT_STATUS_STYLES` object (used by file-explorer, ChangeItem, DiffFileCard — 5 consumer sites). Migrate all hardcoded Tailwind classes to token classes:

```ts
export const GIT_STATUS_STYLES = {
  added: { label: 'A', color: 'text-git-added', fileColor: 'text-git-added', title: 'Added' },
  modified: {
    label: 'M',
    color: 'text-git-modified',
    fileColor: 'text-git-modified',
    title: 'Modified',
  },
  deleted: {
    label: 'D',
    color: 'text-git-deleted',
    fileColor: 'text-git-deleted',
    title: 'Deleted',
  },
  renamed: {
    label: 'R',
    color: 'text-git-renamed',
    fileColor: 'text-git-renamed',
    title: 'Renamed',
  },
  untracked: {
    label: 'U',
    color: 'text-git-untracked',
    fileColor: 'text-git-untracked',
    title: 'Untracked',
  },
  // ... etc
} as const;
```

2. **`components/git/git-status-badge.tsx`** — Has DUPLICATE inline hex/classes. Rewrite to consume from `GIT_STATUS_STYLES` + use `bg-git-*-subtle` for backgrounds.

### Pattern D.5: User bubble background (1 file)

Replace `dark:bg-[#272727]` → `dark:bg-user-bubble-bg` (or `bg-user-bubble-bg` if the token absorbs both modes).

**File:** `MessageItem.tsx:190` — user message bubble uses hardcoded `#272727` in dark mode. Plan defines `--user-bubble-bg` token (Step 2) but this file was only listed under Pattern H for link colors. The bubble bg must also be migrated.

### Pattern E: Avatar colors — monochromatic (3 files)

Replace `bg-[#945036] dark:bg-[#e9ad97]` → `bg-avatar-project` (now gray, was warm brown)
Replace `bg-[#2B5EA7] dark:bg-[#7EB4F0]` → `bg-avatar-system` (now gray, was blue)

**Files:** PrimarySidebar.tsx, ProjectsDialog.tsx, SkillsDialog.tsx

### Pattern F: Tag/sidebar text (2 files)

Replace `text-[#4C4C4C] dark:text-[#B0B0B0]` → `text-tag-text`

**Files:** SidebarItem.tsx, WorktreeItem.tsx

### Pattern G: Tailwind default palette → status tokens (per-file semantic mapping)

**Important:** Not all `text-red-*` means `text-destructive`. Each replacement needs semantic analysis. The existing `--success`, `--warning`, `--info`, `--destructive` tokens use oklch values which may visually differ from Tailwind's hex-based `green-500`/`red-500`. Verify each replacement renders the same perceived color.

**Direct replacements (semantic match confirmed):**
| File | Current | Token |
|---|---|---|
| `status-bar.tsx:155` | `text-red-500` (error count icon) | `text-destructive` |
| `status-bar.tsx:162` | `text-yellow-500` (warning count icon) | `text-warning` |
| `status-bar.tsx:173` | `text-green-500` (no issues icon) | `text-success` |
| `diagnostics-panel.tsx:35` | `text-blue-400` (info severity) | `text-info` |
| `diagnostics-panel.tsx:36` | `text-gray-400` (hint severity) | `text-muted-foreground` |
| `ProviderStep.tsx:255` | `text-green-500` (check mark) | `text-success` |
| `skill-tool-widget.tsx:57` | `text-green-500/80` (completed) | `text-success/80` |
| `crash-notification.tsx:194` | `text-green-500` (copied) | `text-success` |

**Replacements needing visual verification (oklch ≠ hex green):**
| File | Current | Token | Note |
|---|---|---|---|
| `AccountSettings.tsx:95` | `text-yellow-500` | `text-warning` | Token freshness indicator |
| `AccountSettings.tsx:96` | `text-green-600` | `text-success` | green-600 is darker than green-500, verify |
| `AccountSettings.tsx:340` | `bg-green-600/10 text-green-600` | `bg-success-muted text-success` | Active session badge |
| `AccountSettings.tsx:427` | `text-green-600` | `text-success` | Shield icon |

**Judgment calls (required field asterisks):**
| File | Current | Recommendation |
|---|---|---|
| `SubagentsSettings.tsx:263,300` | `text-red-500/70` | `text-destructive/70` — acceptable for required field markers |
| `SlashCommandsSettings.tsx:318,373` | `text-red-500/70` | `text-destructive/70` |
| `SlashCommandsSettings.tsx:52` | `bg-green-500/10 text-green-500` (project scope tag) | `bg-success-muted text-success` |

**Canvas (separate scope):**
| File | Current | Token |
|---|---|---|
| `Canvas-UI-Builder/.../PropertiesPanel.tsx:540` | `text-green-500` | `text-success` |

### Pattern H: Link colors (2 files)

Replace `text-[#0d87ff] dark:text-[#99ceff]` → `text-link`

**Files:**

- `MessageItem.tsx:158`
- `git-status-badge.tsx:49` — untracked status already covered by Pattern D's `--git-untracked` token, same hex values

### Pattern I: CodeMirror var(--gray-\*) → var(--orbit-\*) (1 file, 35+ changes)

Remap using the Radix → Geist mapping from Step 1. NOT a mechanical 1:1 rename — numbers shift:
`var(--gray-3)` → `var(--orbit-100)`, `var(--gray-6)` → `var(--orbit-400)`, `var(--gray-11)` → `var(--orbit-900)`, etc.

**Also remap `var(--gray-contrast)`** at line 531 (`.cm-search` input focus background):

```ts
// CodeMirrorEditor.tsx:531 — search panel focus
backgroundColor: 'var(--orbit-background-100)',  // was 'var(--gray-contrast)'
```

`--gray-contrast` is NOT dead — this is its only consumer. Remap here, then delete the variable from globals.css.

**File:** CodeMirrorEditor.tsx

### Pattern K: Accent consumer migration (MUST complete before accent deletion)

These files consume the Radix accent primitive scale (`--accent-{1-12}`, `--accent-a{1-12}`) at RUNTIME. Deleting the accent scale without migrating these first will cause silent visual breakage (invisible text, transparent borders/backgrounds).

These are **emphasis elements** (callouts, brand logo, animation), not chrome — they use `--primary` (Cursor blue) instead of gray to retain visual distinction.

**1. `.insight-block` in globals.css** (4 accent var references → primary blue):

```css
/* globals.css — replace accent primitives with primary blue */
.insight-block {
  border-left: 2px solid var(--primary); /* was var(--accent-7) */
  background: color-mix(in oklch, var(--primary) 8%, transparent); /* was var(--accent-a2) */
}

.insight-block .insight-star {
  color: var(--primary); /* was var(--accent-9) */
}

.insight-block .insight-label {
  color: var(--primary); /* was var(--accent-11) */
}
```

**2. `BeamAsciiPre.tsx`** (2 JS-level accent var references → primary blue):

```ts
// BeamAsciiPre.tsx — lines 57-58
const ACCENT_COLOR = 'var(--primary)'; // was 'var(--accent-11)'
const ACCENT_MID = 'var(--primary-hover)'; // was 'var(--accent-9)'
```

**3. `orbit-ascii-logo.tsx`** (1 Tailwind accent class → primary blue):

```tsx
// orbit-ascii-logo.tsx — line 238 (ScrambleOrbitLogo)
<pre className="... text-primary ..." />;
{
  /* was: text-accent-9 dark:text-accent-11 */
}
```

**Note:** These elements shift from warm brown/coral to Cursor blue (`#3C7CAB` light / `#81A1C1` dark). Blue is the only non-gray color in the system — using it for emphasis elements reinforces the design language.

### Pattern J: Remaining scattered references

- `styles/allotment-overrides.css` — 1 `var(--gray-9)` → `var(--orbit-700)`
- `AccountSettings.tsx` — 1 `var(--gray-*)` reference → remap per Step 1 mapping
- `App.tsx` — gradient classes (NOT `bg-gray-*`): `from-gray-3/80 via-gray-3/55 to-gray-3/35` → `from-orbit-100/80 via-orbit-100/55 to-orbit-100/35`
- `diagnostics-panel.tsx` — 1 `text-gray-400` → handled in Pattern G as `text-muted-foreground`
- `feedback-dialog.tsx` — `bg-accent-9/10` → `bg-primary/10`, `text-accent-11` → `text-primary` (accent → Cursor blue)
- `orbit-ascii-logo.tsx` — handled by Pattern K (`text-primary`)
- `create-worktree-dialog.tsx` — `bg-accent-9/10` → `bg-primary/10`, `text-accent-11` → `text-primary` (accent → Cursor blue)
- `SkillsDialog.tsx:307` — `bg-gray-400` (dot indicator) → `bg-orbit-600` (gray-8 = orbit-600)
- `switch.tsx:36` — `border-[#C6C6C6]` (unchecked indicator border) → `border-orbit-300` or `border-muted-foreground/40`
- `account-banner.tsx:114` — `style={{ color: '#d97757' }}` (connected icon) → `style={{ color: 'var(--primary)' }}` (was warm orange, now Cursor blue)
- `model-selector.tsx:28` — `style={{ color: '#d97757' }}` (model icon) → `style={{ color: 'var(--primary)' }}` (same warm orange → Cursor blue)

---

## Step 4: Update Canvas UI Builder & Editor

### Canvas UI Builder

- Already imports agent's globals.css — will inherit `--orbit-*` automatically
- `PropertiesPanel.tsx:540` uses `text-green-500` → `text-success` (Pattern G)
- `CanvasLeftSidebar.tsx:194` — `border-gray-5 hover:border-gray-6` → `border-orbit-300 hover:border-orbit-400` (search input border)

### Editor App

- Editor's globals.css should import agent's globals for consistency (currently doesn't)
- `EditorCenter.tsx` uses Tailwind gray scale classes that must be remapped:
  - Line 74: `border-gray-5` → `border-orbit-300`
  - Line 77: `bg-gray-4 dark:bg-gray-1` → `bg-orbit-200 dark:bg-orbit-background-100`
  - Line 247: `bg-gray-4 dark:bg-gray-1` → `bg-orbit-200 dark:bg-orbit-background-100`
  - Line 315: `bg-gray-4 dark:bg-gray-1` → `bg-orbit-200 dark:bg-orbit-background-100`

---

## What NOT to change

- **CodeMirror syntax highlighting colors** — 75+ hex values for GitHub dark/light themes. These are intentional editor theme colors, not UI tokens.
- **Demo cursor colors** (`demo/cursor.ts`) — non-production code
- **Stress test console colors** — dev-only console.log styling
- **Liquid Glass raw tokens** (`--lg-*`) — keep as-is in their section. We add semantic aliases on top, but lg-\* stays for glass-specific properties (blur, saturate, tint, sizing, typography)
- **Semantic `--accent` / `--accent-foreground`** — these shadcn tokens alias gray (`--orbit-400` / `--orbit-1000`). Used by `bg-accent`, `hover:bg-accent/50`, `text-accent-foreground` across 30+ files. DO NOT rename or delete.

**Note:** BeamAsciiPre.tsx and orbit-ascii-logo.tsx consume the Radix accent scale at runtime — these are migrated in Pattern K. AsciiVideoEffect.tsx has a comment-only accent reference (inline hex, not CSS var) — no migration needed.

---

## Verification

### Build checks

1. `bun run typecheck` — no TS errors
2. `bun run lint` — no ESLint warnings
3. `bun run test` — all tests pass

### Visual verification

4. `bunx tauri dev` — visual comparison: light mode, dark mode, solid mode, liquid-glass mode
5. Verify Canvas UI Builder still renders correctly
6. Verify primary buttons render as Cursor blue: `#3C7CAB` (light) / `#81A1C1` (dark) — intentionally more muted than previous `#007AFF`
7. Verify `--primary-foreground` dark mode: dark text (`#191c22`) on light blue button (inverted from previous white text)
8. Verify avatars render as gray — no warm brown or blue
9. Verify `.insight-block` renders with blue border/bg via `--primary` (Pattern K migration, not transparent or gray)
10. Verify beam animation and orbit ASCII logo use Cursor blue via `--primary` (Pattern K migration, not warm brown or gray)
11. Spot-check Pattern G replacements: compare oklch-based `--success` against previous hex `green-500`/`green-600` in light + dark mode

### Grep checks (zero remaining references)

12. Grep for `var(--gray-` — should be zero outside globals.css comments
13. Grep for `var(--accent-{1-12}` or `--accent-a{1-12}` — should be zero (accent scale deleted)
14. Grep for `--color-accent-{1-12}` in `@theme inline` — should be deleted (only `--color-accent` and `--color-accent-foreground` remain)

### Broad raw color sweep

Run this comprehensive grep across all app source to catch ALL raw color patterns:

```bash
rg -n "bg-\[#|text-\[#|border-\[#|fill-\[#|stroke-\[#|color:\s*'#|color:\s*\"#|var\(--accent-[0-9]+|var\(--accent-a[0-9]+|var\(--gray-" \
  apps/agent/src apps/editor/src apps/Canvas-UI-Builder/src \
  --glob '!**/CodeMirrorEditor*' --glob '!**/demo/**' --glob '!**/stress-tests/**'
```

15. Zero matches for arbitrary hex classes (`bg-[#`, `text-[#`, `border-[#`, `fill-[#`)
16. Zero matches for inline style hex (`color: '#...`)
17. Zero matches for deleted token refs (`var(--accent-{N}`, `var(--gray-`)

**Intentional exceptions** (allowlisted — do NOT migrate):

- `CodeMirrorEditor.tsx` syntax highlighting palette (75+ hex values)
- `demo/cursor.ts` non-production code
- `stress-tests/` dev-only files

### Semantic token integrity

16. Verify `bg-accent` and `text-accent-foreground` still work (shadcn semantic tokens must NOT be deleted)
17. Verify all new Tailwind utilities resolve: `bg-menu-bg`, `text-link`, `shadow-menu`, `bg-control-fill`, `text-git-added`, `bg-avatar-project`, etc.

---

## Execution Order

**⚠ Two-phase strategy recommended** to prevent partial-commit breakage:

**Phase 1 — Additive (zero breakage):**

1. **globals.css Step 2** — Add ALL new semantic tokens (`--menu-bg`, `--control-fill`, `--git-*`, `--avatar-*`, `--primary-hover`, `--link`, etc.) alongside existing tokens. Add `@theme inline` mappings.
2. **globals.css Step 1 (gray only)** — Add new `--orbit-*` aliases that point to existing `--gray-*` values. Both old and new names work simultaneously.

**Phase 2 — Migration + cleanup (atomic commit):** 3. **Pattern K** — Migrate accent consumers (`.insight-block`, `BeamAsciiPre.tsx`, `orbit-ascii-logo.tsx`) BEFORE accent deletion 4. **globals.css Step 1 (accent deletion)** — Delete Radix accent scale from all blocks (`:root`, `html.dark`, `window-mode-*`, `@supports P3`, `@theme inline`) 5. **`--primary` / `--primary-foreground`** — System Blue → Cursor Anysphere blue (Step 2) 6. **Pattern A-C** — highest-impact, most duplicated patterns 7. **Pattern D-D.5** — git status unification + user bubble bg 8. **Pattern E-H** — avatars, tags, links 9. **Pattern I-J** — CodeMirror remap + scattered gray/accent→orbit fixes 10. **Step 4** — Canvas + Editor app updates 11. **globals.css cleanup** — Remove old `--gray-*` aliases added in step 2 12. **Verify** — run all checks + broad raw color sweep

Commit Phase 2 atomically. A mismatched commit where globals.css is updated but component files aren't yet migrated will break styling for every affected component.

---

## Audit Trail

**Audited:** 2026-03-03 — see `reviews/audit-plan.md`

### Round 1 fixes (pre-audit, initial plan build):

- Scoped accent rename to Radix scale only, added DO NOT rename list
- Fixed `--shadow-menu` dark mode value (was "Tailwind shadow-md", now actual CSS)
- Added tooltip.tsx and actions-bar.tsx to Pattern A
- Renamed `--element` → `--control-fill` for clarity
- Corrected allotment-overrides.css path to `styles/allotment-overrides.css`
- Added per-file semantic analysis to Pattern G (replaced blanket replacement)
- Added Editor app `EditorCenter.tsx` class renames to Step 4
- Added Canvas `PropertiesPanel.tsx` to Pattern G scope
- Added `SkillsDialog.tsx` `bg-gray-400` dot to Pattern J
- Expanded verification checklist with semantic token and visual checks

### Round 2 fixes (post-audit incorporation):

- **Critical #1/#2**: Added Pattern K for `.insight-block` (4 accent CSS vars), `BeamAsciiPre.tsx` (2 JS vars), `orbit-ascii-logo.tsx` (1 class) — must migrate BEFORE accent deletion
- **Critical #3**: Added explicit `@theme inline` accent mapping deletion (lines 65-76, 12 `--color-accent-{1-12}` entries)
- **Critical #4**: Added explicit P3 gamut accent override deletion (~90 lines across light/dark blocks)
- **Critical #5**: Expanded Pattern D to dual-source git color migration (constants.ts + git-status-badge.tsx → single source of truth)
- **Recommended #1**: Added full `@theme inline` mappings block for ALL new semantic tokens (surfaces, controls, borders, interactive, tags, avatars, 16 git colors, shadow)
- **Recommended #2**: Added visual verification for primary button color change (`#3C7CAB` vs previous `#007AFF`)
- **Recommended #4**: Corrected App.tsx Pattern J entry — gradient classes (`from-gray-3/80 via-gray-3/55 to-gray-3/35`) not `bg-gray-*`
- **Recommended #5**: Added CanvasLeftSidebar.tsx `border-gray-5 hover:border-gray-6` → `border-orbit-300 hover:border-orbit-400` to Step 4
- **Recommended #6**: Added EditorCenter.tsx `border-gray-5` → `border-orbit-300` to Step 4
- **Recommended #7**: Flagged `--border-subtle` as potentially dead token (aliases unused `--lg-border`)
- **Recommended #8**: Restructured execution order into two-phase strategy (additive → atomic migration) to prevent partial-commit breakage
- Added Pattern D.5 for MessageItem.tsx user bubble bg (`dark:bg-[#272727]` → `dark:bg-user-bubble-bg`)
- Added `.chat-markdown a` to Step 1 scope (highly visible chat links)
- Expanded verification from 12 → 17 items (grouped by category: build, visual, grep, semantic)

### Round 3 fixes (post-audit Round 2 re-evaluation):

- Resolved Pattern K / Pattern J conflict for `orbit-ascii-logo.tsx` — Pattern J now defers to Pattern K
- Expanded `feedback-dialog.tsx` and `create-worktree-dialog.tsx` Pattern J entries with explicit `bg-accent-9/10` → `bg-primary/10` replacements
- Added `--gray-surface` to dead gray token deletion list

### Round 4 fixes (post-audit Round 3 — NEEDS REWORK response):

- **Critical #1 (scope)**: Added 3 missing glass popover files to Pattern A: `BranchSelector.tsx:82`, `chat/input/context.tsx:155`, `chat/input/model-selector.tsx:281` (same `bg-white/70 dark:bg-lg-control/80` surface family). Added 3 raw color literals to Pattern J: `switch.tsx:36` (`border-[#C6C6C6]`), `account-banner.tsx:114` and `model-selector.tsx:28` (`style={{ color: '#d97757' }}`)
- **Critical #2 (shadow self-ref)**: Renamed source variable to `--orbit-shadow-menu` in `:root`/`html.dark`. `@theme inline` mapping is now `--shadow-menu: var(--orbit-shadow-menu)` — no more circular reference.
- **Critical #3 (Pattern K verification)**: Fixed items 9-10 to expect blue (`--primary`) not gray — aligned with Pattern K code.
- **Critical #4 (grep coverage)**: Replaced narrow grep checks with comprehensive raw color sweep (`bg-[#`, `text-[#`, `border-[#`, `fill-[#`, inline hex, deleted token refs). Added explicit allowlist for CodeMirror/demo/stress-tests.
- **Critical #5 (`--gray-contrast`)**: Removed from dead token list — consumed by `CodeMirrorEditor.tsx:531`. Added explicit remap in Pattern I (`var(--gray-contrast)` → `var(--orbit-background-100)`). Added temporary alias note in Step 1.

### Round 5 fix (final scope gap):

- Added `WorktreeItem.tsx:341` and `WorktreeItem.tsx:387` to Pattern A — two glass popover surfaces (`bg-white/70 dark:bg-lg-control/80` + border + shadow). Pattern A now covers 13 files.
