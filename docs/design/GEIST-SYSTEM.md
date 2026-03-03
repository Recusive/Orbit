# Orbit Design System — Geist Color Model

> Reference: [Vercel Geist Design System / Colors](https://vercel.com/geist/colors)

Orbit's color token architecture follows the Vercel Geist Design System conventions. Monochromatic gray chrome with blue interactive colors (buttons, links). Blue values from Cursor Dark/Light (Anysphere). This document defines the structural rules, semantic step bands, and the actual color values for every token in both light and dark modes.

---

## Scales

Monochromatic gray chrome + blue interactive. P3 colors on supported browsers and displays.

| Scale          | Steps         | Purpose                                             |
| -------------- | ------------- | --------------------------------------------------- |
| **Background** | 100, 200      | Page and layout backgrounds                         |
| **Gray**       | 100–1000      | Neutral UI: fills, borders, text                    |
| **Gray Alpha** | 100–1000      | Translucent neutral overlays                        |
| **Blue**       | semantic only | Interactive: buttons, links (from Cursor Anysphere) |

### Status Scales (oklch)

| Scale           | Purpose               | Light                   | Dark                    |
| --------------- | --------------------- | ----------------------- | ----------------------- |
| **Success**     | Confirmations, checks | `oklch(0.65 0.18 155)`  | `oklch(0.7 0.18 155)`   |
| **Warning**     | Caution indicators    | `oklch(0.75 0.18 85)`   | `oklch(0.8 0.18 85)`    |
| **Info**        | Informational         | `oklch(0.65 0.15 240)`  | `oklch(0.7 0.15 240)`   |
| **Destructive** | Errors, deletions     | `var(--lg-destructive)` | `var(--lg-destructive)` |

---

## Backgrounds

There are two background colors for pages and UI components. In most instances, use Background 1 — especially when color is being placed on top of the background. Background 2 should be used sparingly when a subtle background differentiation is needed.

| Token                    | Light     | Dark      | P3 Light           | P3 Dark            |
| ------------------------ | --------- | --------- | ------------------ | ------------------ |
| `--orbit-background-100` | `#ebebeb` | `#181818` | `oklch(93.9% 0 0)` | `oklch(20.7% 0 0)` |
| `--orbit-background-200` | `#e5e5e5` | `#191919` | `oklch(92.3% 0 0)` | `oklch(21.5% 0 0)` |

### Background Alpha

| Token                          | Light       | Dark        | P3 Light                   | P3 Dark                    |
| ------------------------------ | ----------- | ----------- | -------------------------- | -------------------------- |
| `--orbit-background-alpha-100` | `#00000014` | `#ffffff12` | `display-p3 0 0 0 / 0.078` | `display-p3 1 1 1 / 0.071` |
| `--orbit-background-alpha-200` | `#0000001a` | `#ffffff19` | `display-p3 0 0 0 / 0.102` | `display-p3 1 1 1 / 0.098` |

---

## Colors 1–3: Component Backgrounds

These three colors are designed for UI component backgrounds.

| Step | Token         | Light     | Dark      | Purpose            |
| ---- | ------------- | --------- | --------- | ------------------ |
| 100  | `--orbit-100` | `#dbdbdb` | `#232323` | Default background |
| 200  | `--orbit-200` | `#d2d2d2` | `#2a2a2a` | Hover background   |
| 300  | `--orbit-300` | `#cacaca` | `#313131` | Active background  |

**P3 values:**

| Step | P3 Light           | P3 Dark            |
| ---- | ------------------ | ------------------ |
| 100  | `oklch(89.2% 0 0)` | `oklch(25.4% 0 0)` |
| 200  | `oklch(86.5% 0 0)` | `oklch(28.3% 0 0)` |
| 300  | `oklch(83.8% 0 0)` | `oklch(31.3% 0 0)` |

**Alpha variants:**

| Step | Token               | Light       | Dark        |
| ---- | ------------------- | ----------- | ----------- |
| 100  | `--orbit-alpha-100` | `#00000024` | `#ffffff23` |
| 200  | `--orbit-alpha-200` | `#0000002d` | `#ffffff2a` |
| 300  | `--orbit-alpha-300` | `#00000035` | `#ffffff31` |

If your component's default background is Background 1, you can use Color 100 as your hover background and Color 200 as your active background. On smaller UI elements like badges, you can use Color 200 or Color 300 as the background.

---

## Colors 4–6: Borders

These three colors are designed for UI component borders.

| Step | Token         | Light     | Dark      | Purpose        |
| ---- | ------------- | --------- | --------- | -------------- |
| 400  | `--orbit-400` | `#c1c1c1` | `#3a3a3a` | Default border |
| 500  | `--orbit-500` | `#b5b5b5` | `#484848` | Hover border   |
| 600  | `--orbit-600` | `#a1a1a1` | `#606060` | Active border  |

**P3 values:**

| Step | P3 Light           | P3 Dark            |
| ---- | ------------------ | ------------------ |
| 400  | `oklch(81% 0 0)`   | `oklch(34.9% 0 0)` |
| 500  | `oklch(77.4% 0 0)` | `oklch(40.1% 0 0)` |
| 600  | `oklch(71% 0 0)`   | `oklch(49% 0 0)`   |

**Alpha variants:**

| Step | Token               | Light       | Dark        |
| ---- | ------------------- | ----------- | ----------- |
| 400  | `--orbit-alpha-400` | `#0000003e` | `#ffffff3a` |
| 500  | `--orbit-alpha-500` | `#0000004a` | `#ffffff48` |
| 600  | `--orbit-alpha-600` | `#0000005e` | `#ffffff60` |

---

## Colors 7–8: High Contrast Backgrounds

These two colors are designed for high contrast UI component backgrounds.

| Step | Token         | Light     | Dark      | Purpose                        |
| ---- | ------------- | --------- | --------- | ------------------------------ |
| 700  | `--orbit-700` | `#737373` | `#6d6d6d` | High contrast background       |
| 800  | `--orbit-800` | `#696969` | `#7b7b7b` | Hover high contrast background |

**P3 values:**

| Step | P3 Light           | P3 Dark            |
| ---- | ------------------ | ------------------ |
| 700  | `oklch(55.7% 0 0)` | `oklch(53.5% 0 0)` |
| 800  | `oklch(52.2% 0 0)` | `oklch(58.1% 0 0)` |

**Alpha variants:**

| Step | Token               | Light       | Dark        |
| ---- | ------------------- | ----------- | ----------- |
| 700  | `--orbit-alpha-700` | `#0000008c` | `#ffffff6d` |
| 800  | `--orbit-alpha-800` | `#00000096` | `#ffffff7b` |

---

## Colors 9–10: Text and Icons

These two colors are designed for accessible text and icons.

| Step | Token          | Light     | Dark      | Purpose                  |
| ---- | -------------- | --------- | --------- | ------------------------ |
| 900  | `--orbit-900`  | `#4c4c4c` | `#b3b3b3` | Secondary text and icons |
| 1000 | `--orbit-1000` | `#202020` | `#eeeeee` | Primary text and icons   |

**P3 values:**

| Step | P3 Light           | P3 Dark            |
| ---- | ------------------ | ------------------ |
| 900  | `oklch(41.8% 0 0)` | `oklch(76.7% 0 0)` |
| 1000 | `oklch(24.3% 0 0)` | `oklch(94.8% 0 0)` |

**Alpha variants:**

| Step | Token                | Light       | Dark        |
| ---- | -------------------- | ----------- | ----------- |
| 900  | `--orbit-alpha-900`  | `#000000b3` | `#ffffffb3` |
| 1000 | `--orbit-alpha-1000` | `#000000df` | `#ffffffee` |

---

## Semantic Tokens (Built on Top)

The step scale is the primitive layer. Semantic tokens alias primitives for specific UI patterns:

### shadcn Semantic Mappings

These tokens reference the Orbit scale internally. **DO NOT rename these** — they're consumed by `bg-accent`, `text-muted-foreground`, etc. across 30+ files.

| Semantic Token           | Light                               | Dark                                |
| ------------------------ | ----------------------------------- | ----------------------------------- |
| `--surface`              | `var(--orbit-background-alpha-200)` | `var(--orbit-background-alpha-200)` |
| `--background`           | `var(--orbit-background-200)`       | `var(--orbit-100)`                  |
| `--foreground`           | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |
| `--card`                 | `var(--surface)`                    | `var(--surface)`                    |
| `--card-foreground`      | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |
| `--popover`              | `var(--orbit-background-alpha-200)` | `var(--orbit-background-alpha-200)` |
| `--popover-foreground`   | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |
| `--primary`              | `#3C7CAB`                           | `#81A1C1`                           |
| `--primary-foreground`   | `#FCFCFC`                           | `#191c22`                           |
| `--secondary`            | `var(--orbit-200)`                  | `var(--orbit-200)`                  |
| `--secondary-foreground` | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |
| `--muted`                | `var(--orbit-200)`                  | `var(--orbit-200)`                  |
| `--muted-foreground`     | `var(--orbit-800)`                  | `var(--orbit-900)`                  |
| `--accent`               | `var(--orbit-400)`                  | `var(--orbit-400)`                  |
| `--accent-foreground`    | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |
| `--border`               | `var(--orbit-500)`                  | `var(--orbit-500)`                  |
| `--input`                | `var(--orbit-500)`                  | `var(--orbit-500)`                  |
| `--ring`                 | `var(--orbit-600)`                  | `var(--orbit-600)`                  |
| `--chat-area`            | `var(--orbit-background-alpha-200)` | `var(--orbit-background-100)`       |
| `--sidebar`              | `var(--surface)`                    | `var(--orbit-100)`                  |
| `--sidebar-foreground`   | `var(--orbit-900)`                  | `var(--orbit-900)`                  |
| `--terminal-cursor`      | `var(--orbit-1000)`                 | `var(--orbit-1000)`                 |

### UI-Specific Semantic Tokens (new — defined in COLOR-SYSTEM-REFACTOR.md)

| Semantic Token         | Light                                | Dark                     | Purpose                      |
| ---------------------- | ------------------------------------ | ------------------------ | ---------------------------- |
| `--menu-bg`            | `#f3f3f3`                            | `oklch(23% 0 0)`         | Menu/popover backgrounds     |
| `--tool-output-bg`     | `var(--chat-area)`                   | `oklch(23% 0 0)`         | Tool widget output boxes     |
| `--control-fill`       | `var(--lg-alert-secondary-bg)`       | same                     | Form control backgrounds     |
| `--control-fill-hover` | `var(--lg-alert-secondary-bg-hover)` | same                     | Form control hover           |
| `--control-text`       | `var(--lg-alert-secondary-text)`     | same                     | Form control text            |
| `--border-tool`        | `rgba(0,0,0,0.1)`                    | `rgba(255,255,255,0.05)` | Tool widget borders          |
| `--border-menu`        | `rgba(255,255,255,1)`                | `rgba(255,255,255,0.05)` | Menu borders                 |
| `--git-added`          | `#4ade80`                            | `#4ade80`                | Git: added                   |
| `--git-modified`       | `#c18533`                            | `#f0b367`                | Git: modified                |
| `--git-deleted`        | `#f87171`                            | `#f87171`                | Git: deleted                 |
| `--git-untracked`      | `#0d87ff`                            | `#99ceff`                | Git: untracked               |
| `--link`               | `#3C7CAB`                            | `#81A1C1`                | Hyperlink text (Cursor blue) |
| `--avatar-project`     | `var(--orbit-700)`                   | `var(--orbit-800)`       | Project avatar               |
| `--avatar-system`      | `#2B5EA7`                            | `#7EB4F0`                | System avatar                |
| `--tag-text`           | `#4C4C4C`                            | `#B0B0B0`                | Tag/sidebar text             |

---

## Mapping: Radix 12-Step → Orbit Geist 10-Step

```
RADIX                        ORBIT                              BAND
───────────────────────────────────────────────────────────────────────────
--gray-1   (app bg)      →   --orbit-background-100              Background 1
--gray-2   (subtle bg)   →   --orbit-background-200              Background 2

--gray-3   (component)   →   --orbit-100                         Component BG: default
--gray-4   (hover)       →   --orbit-200                         Component BG: hover
--gray-5   (active)      →   --orbit-300                         Component BG: active

--gray-6   (border)      →   --orbit-400                         Border: default
--gray-7   (hover)       →   --orbit-500                         Border: hover
--gray-8   (strong)      →   --orbit-600                         Border: active

--gray-9   (solid)       →   --orbit-700                         High contrast BG
--gray-10  (solid hover) →   --orbit-800                         High contrast BG hover

--gray-11  (lo-contrast) →   --orbit-900                         Secondary text & icons
--gray-12  (hi-contrast) →   --orbit-1000                        Primary text & icons
```

---

## CSS Declarations

The actual CSS to use in `globals.css`. Drop-in replacement for the current Radix `--gray-*` blocks. Accent scale deleted entirely.

### Light Mode (`:root`)

```css
:root {
  /* ── Backgrounds ──────────────────────────────────────────────── */
  --orbit-background-100: #ebebeb;
  --orbit-background-200: #e5e5e5;

  /* ── Gray 10-step scale ───────────────────────────────────────── */
  /* 100-300: Component Backgrounds */
  --orbit-100: #dbdbdb;
  --orbit-200: #d2d2d2;
  --orbit-300: #cacaca;
  /* 400-600: Borders */
  --orbit-400: #c1c1c1;
  --orbit-500: #b5b5b5;
  --orbit-600: #a1a1a1;
  /* 700-800: High Contrast Backgrounds */
  --orbit-700: #737373;
  --orbit-800: #696969;
  /* 900-1000: Text & Icons */
  --orbit-900: #4c4c4c;
  --orbit-1000: #202020;

  /* ── Background alpha ─────────────────────────────────────────── */
  --orbit-background-alpha-100: #00000014;
  --orbit-background-alpha-200: #0000001a;

  /* ── Gray alpha (translucent neutral) ─────────────────────────── */
  --orbit-alpha-100: #00000024;
  --orbit-alpha-200: #0000002d;
  --orbit-alpha-300: #00000035;
  --orbit-alpha-400: #0000003e;
  --orbit-alpha-500: #0000004a;
  --orbit-alpha-600: #0000005e;
  --orbit-alpha-700: #0000008c;
  --orbit-alpha-800: #00000096;
  --orbit-alpha-900: #000000b3;
  --orbit-alpha-1000: #000000df;

  /* ── Status (oklch) ───────────────────────────────────────────── */
  --success: oklch(0.65 0.18 155);
  --success-foreground: oklch(0.25 0.08 155);
  --success-muted: oklch(0.95 0.04 155);
  --warning: oklch(0.75 0.18 85);
  --warning-foreground: oklch(0.3 0.08 85);
  --warning-muted: oklch(0.95 0.04 85);
  --info: oklch(0.65 0.15 240);
  --info-foreground: oklch(0.25 0.08 240);
  --info-muted: oklch(0.95 0.04 240);

  /* ── Semantic aliases (reference orbit scale) ─────────────────── */
  --surface: var(--orbit-background-alpha-200);
  --background: var(--orbit-background-200);
  --foreground: var(--orbit-1000);
  --card: var(--surface);
  --card-foreground: var(--orbit-1000);
  --popover: var(--orbit-background-alpha-200);
  --popover-foreground: var(--orbit-1000);
  --primary: #3c7cab;
  --primary-foreground: #fcfcfc;
  --primary-hover: #055180;
  --secondary: var(--orbit-200);
  --secondary-foreground: var(--orbit-1000);
  --muted: var(--orbit-200);
  --muted-foreground: var(--orbit-800);
  --accent: var(--orbit-400);
  --accent-foreground: var(--orbit-1000);
  --border: var(--orbit-500);
  --input: var(--orbit-500);
  --ring: var(--orbit-600);
  --chat-area: var(--orbit-background-alpha-200);
  --sidebar: var(--surface);
  --sidebar-foreground: var(--orbit-900);
  --terminal-cursor: var(--orbit-1000);
  --link: #3c7cab;
}
```

### Dark Mode (`html.dark`)

```css
html.dark {
  /* ── Backgrounds ──────────────────────────────────────────────── */
  --orbit-background-100: #181818;
  --orbit-background-200: #191919;

  /* ── Gray 10-step scale ───────────────────────────────────────── */
  /* 100-300: Component Backgrounds */
  --orbit-100: #232323;
  --orbit-200: #2a2a2a;
  --orbit-300: #313131;
  /* 400-600: Borders */
  --orbit-400: #3a3a3a;
  --orbit-500: #484848;
  --orbit-600: #606060;
  /* 700-800: High Contrast Backgrounds */
  --orbit-700: #6d6d6d;
  --orbit-800: #7b7b7b;
  /* 900-1000: Text & Icons */
  --orbit-900: #b3b3b3;
  --orbit-1000: #eeeeee;

  /* ── Background alpha ─────────────────────────────────────────── */
  --orbit-background-alpha-100: #ffffff12;
  --orbit-background-alpha-200: #ffffff19;

  /* ── Gray alpha (translucent neutral) ─────────────────────────── */
  --orbit-alpha-100: #ffffff23;
  --orbit-alpha-200: #ffffff2a;
  --orbit-alpha-300: #ffffff31;
  --orbit-alpha-400: #ffffff3a;
  --orbit-alpha-500: #ffffff48;
  --orbit-alpha-600: #ffffff60;
  --orbit-alpha-700: #ffffff6d;
  --orbit-alpha-800: #ffffff7b;
  --orbit-alpha-900: #ffffffb3;
  --orbit-alpha-1000: #ffffffee;

  /* ── Status (oklch) ───────────────────────────────────────────── */
  --success: oklch(0.7 0.18 155);
  --success-foreground: oklch(0.9 0.04 155);
  --success-muted: oklch(0.25 0.06 155);
  --warning: oklch(0.8 0.18 85);
  --warning-foreground: oklch(0.95 0.04 85);
  --warning-muted: oklch(0.28 0.06 85);
  --info: oklch(0.7 0.15 240);
  --info-foreground: oklch(0.95 0.04 240);
  --info-muted: oklch(0.25 0.06 240);

  /* NOTE: Dark mode semantic aliases bump some steps vs light ──── */
  --surface: var(--orbit-background-alpha-200);
  --background: var(--orbit-100);
  --foreground: var(--orbit-1000);
  --card: var(--surface);
  --card-foreground: var(--orbit-1000);
  --popover: var(--orbit-background-alpha-200);
  --popover-foreground: var(--orbit-1000);
  --primary: #81a1c1;
  --primary-foreground: #191c22;
  --primary-hover: #87a6c4;
  --secondary: var(--orbit-200);
  --secondary-foreground: var(--orbit-1000);
  --muted: var(--orbit-200);
  --muted-foreground: var(--orbit-900);
  --accent: var(--orbit-400);
  --accent-foreground: var(--orbit-1000);
  --border: var(--orbit-500);
  --input: var(--orbit-500);
  --ring: var(--orbit-600);
  --chat-area: var(--orbit-background-100);
  --sidebar: var(--orbit-100);
  --sidebar-foreground: var(--orbit-900);
  --terminal-cursor: var(--orbit-1000);
  --link: #81a1c1;
}
```

### P3 Gamut Override

```css
@supports (color: color(display-p3 0 0 0)) {
  :root {
    --orbit-background-100: oklch(93.9% 0 0);
    --orbit-background-200: oklch(92.3% 0 0);
    --orbit-100: oklch(89.2% 0 0);
    --orbit-200: oklch(86.5% 0 0);
    --orbit-300: oklch(83.8% 0 0);
    --orbit-400: oklch(81% 0 0);
    --orbit-500: oklch(77.4% 0 0);
    --orbit-600: oklch(71% 0 0);
    --orbit-700: oklch(55.7% 0 0);
    --orbit-800: oklch(52.2% 0 0);
    --orbit-900: oklch(41.8% 0 0);
    --orbit-1000: oklch(24.3% 0 0);

    --orbit-background-alpha-100: color(display-p3 0 0 0 / 0.078);
    --orbit-background-alpha-200: color(display-p3 0 0 0 / 0.102);
    --orbit-alpha-100: color(display-p3 0 0 0 / 0.141);
    --orbit-alpha-200: color(display-p3 0 0 0 / 0.176);
    --orbit-alpha-300: color(display-p3 0 0 0 / 0.208);
    --orbit-alpha-400: color(display-p3 0 0 0 / 0.243);
    --orbit-alpha-500: color(display-p3 0 0 0 / 0.29);
    --orbit-alpha-600: color(display-p3 0 0 0 / 0.369);
    --orbit-alpha-700: color(display-p3 0 0 0 / 0.549);
    --orbit-alpha-800: color(display-p3 0 0 0 / 0.588);
    --orbit-alpha-900: color(display-p3 0 0 0 / 0.702);
    --orbit-alpha-1000: color(display-p3 0 0 0 / 0.875);
  }

  html.dark {
    --orbit-background-100: oklch(20.7% 0 0);
    --orbit-background-200: oklch(21.5% 0 0);
    --orbit-100: oklch(25.4% 0 0);
    --orbit-200: oklch(28.3% 0 0);
    --orbit-300: oklch(31.3% 0 0);
    --orbit-400: oklch(34.9% 0 0);
    --orbit-500: oklch(40.1% 0 0);
    --orbit-600: oklch(49% 0 0);
    --orbit-700: oklch(53.5% 0 0);
    --orbit-800: oklch(58.1% 0 0);
    --orbit-900: oklch(76.7% 0 0);
    --orbit-1000: oklch(94.8% 0 0);

    --orbit-background-alpha-100: color(display-p3 1 1 1 / 0.071);
    --orbit-background-alpha-200: color(display-p3 1 1 1 / 0.098);
    --orbit-alpha-100: color(display-p3 1 1 1 / 0.137);
    --orbit-alpha-200: color(display-p3 1 1 1 / 0.165);
    --orbit-alpha-300: color(display-p3 1 1 1 / 0.192);
    --orbit-alpha-400: color(display-p3 1 1 1 / 0.227);
    --orbit-alpha-500: color(display-p3 1 1 1 / 0.282);
    --orbit-alpha-600: color(display-p3 1 1 1 / 0.376);
    --orbit-alpha-700: color(display-p3 1 1 1 / 0.427);
    --orbit-alpha-800: color(display-p3 1 1 1 / 0.482);
    --orbit-alpha-900: color(display-p3 1 1 1 / 0.702);
    --orbit-alpha-1000: color(display-p3 1 1 1 / 0.933);
  }
}
```

### Tailwind `@theme inline` Mappings

```css
@theme inline {
  /* Backgrounds */
  --color-orbit-background-100: var(--orbit-background-100);
  --color-orbit-background-200: var(--orbit-background-200);
  --color-orbit-background-alpha-100: var(--orbit-background-alpha-100);
  --color-orbit-background-alpha-200: var(--orbit-background-alpha-200);

  /* Gray 10-step */
  --color-orbit-100: var(--orbit-100);
  --color-orbit-200: var(--orbit-200);
  --color-orbit-300: var(--orbit-300);
  --color-orbit-400: var(--orbit-400);
  --color-orbit-500: var(--orbit-500);
  --color-orbit-600: var(--orbit-600);
  --color-orbit-700: var(--orbit-700);
  --color-orbit-800: var(--orbit-800);
  --color-orbit-900: var(--orbit-900);
  --color-orbit-1000: var(--orbit-1000);

  /* Gray alpha */
  --color-orbit-alpha-100: var(--orbit-alpha-100);
  --color-orbit-alpha-200: var(--orbit-alpha-200);
  --color-orbit-alpha-300: var(--orbit-alpha-300);
  --color-orbit-alpha-400: var(--orbit-alpha-400);
  --color-orbit-alpha-500: var(--orbit-alpha-500);
  --color-orbit-alpha-600: var(--orbit-alpha-600);
  --color-orbit-alpha-700: var(--orbit-alpha-700);
  --color-orbit-alpha-800: var(--orbit-alpha-800);
  --color-orbit-alpha-900: var(--orbit-alpha-900);
  --color-orbit-alpha-1000: var(--orbit-alpha-1000);
}
```

---

## Rules

1. **Step number = semantic purpose.** See `--orbit-400`? It's a border. See `--orbit-900`? Secondary text. No lookup needed.
2. **Background scale is separate.** App-level backgrounds live in `--orbit-background-{100,200}`, not the main scale.
3. **Alpha variants mirror the main scale.** `--orbit-alpha-400` is the translucent version of `--orbit-400`.
4. **Colors 900-1000 must meet WCAG contrast** against their corresponding background.
5. **P3 colors** via `@supports (color: color(display-p3 ...))` for wider gamut on supported displays.
6. **Gray chrome, blue interactive.** All UI chrome (backgrounds, borders, text) uses the gray scale. Blue (`#3C7CAB` / `#81A1C1`) is reserved for buttons and links. Status colors (success/warning/info/destructive) use oklch. Syntax highlighting is separate.
7. **Background 2 is sparingly used.** Only when subtle differentiation is needed (e.g., sidebar vs. main content).

---

## What NOT to Change

- **Liquid Glass tokens** (`--lg-*`) — separate glass effect system, stays as-is
- **shadcn semantic `--accent`** — aliases gray `var(--orbit-400)`, used by `bg-accent` in 30+ files
- **CodeMirror syntax theme colors** — 75+ hex values for editor highlighting, not UI tokens
- **Demo/stress test colors** — non-production code
