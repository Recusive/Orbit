# Orbitweb Context Prompt

> **Purpose:** Copy-paste this entire file as context when starting a Claude Code session that involves editing the orbitweb marketing website. It provides all the knowledge needed to work effectively across both repos.

---

## What is Orbitweb?

Orbitweb is the **marketing website** for Orbit, built with Next.js 15 (App Router) and hosted separately from the main product. It lives at:

```
/Users/no9labs/Developer/Recursive/orbitweb
```

The main product (Orbit desktop app) lives at:

```
/Users/no9labs/Developer/Recursive/Snowflake-v0
```

These are **two separate repos** but are tightly coupled:

- Orbitweb embeds a **demo build** of the Snowflake-v0 agent app via iframes
- They share the same warm color palette (Radix-based gray + accent scales)
- Design changes in one should stay consistent with the other

---

## Orbitweb Tech Stack

| Tech            | Version         | Notes                         |
| --------------- | --------------- | ----------------------------- |
| Next.js         | 15 (App Router) | `app/` directory routing      |
| React           | 19              | Server + Client components    |
| TypeScript      | Strict          |                               |
| Tailwind CSS    | v4              | `@theme` inline blocks        |
| Framer Motion   |                 | Page animations               |
| shadcn/ui       |                 | Button, Dialog, etc.          |
| Package manager | **pnpm**        | NOT bun (unlike Snowflake-v0) |

### Commands

```bash
cd /Users/no9labs/Developer/Recursive/orbitweb

pnpm dev          # Dev server (localhost:3000)
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with auto-fix
```

---

## Project Structure

```
orbitweb/
├── app/
│   ├── globals.css              # SOURCE OF TRUTH for all colors
│   ├── layout.tsx               # Root layout
│   ├── blog/[slug]/page.tsx     # Blog post pages
│   ├── pricing/page.tsx         # Pricing page
│   ├── features/                # Features page
│   ├── orbit-vs-copilot/        # Comparison pages
│   ├── orbit-vs-cursor/
│   ├── orbit-vs-windsurf/
│   ├── orbit-vs-bolt/
│   ├── orbit-vs-replit/
│   ├── orbit-for-developers/
│   ├── orbit-for-founders/
│   ├── orbit-for-vibe-coders/
│   ├── orbit-for-product-managers/
│   ├── waitlist/                # Waitlist signup
│   ├── security/
│   ├── roadmap/
│   └── ...
│
├── components/
│   ├── ui/                      # shadcn/ui primitives (Button, Dialog, etc.)
│   ├── landing/                 # Landing page sections
│   │   ├── hero-section.tsx
│   │   ├── demo-section.tsx     # Embeds OrbitDemoWindow
│   │   ├── feature-section.tsx
│   │   ├── pricing-section.tsx  # "Built for builders" cards
│   │   ├── cta-section.tsx
│   │   ├── showcase-section.tsx
│   │   └── orbit-demo-window/   # Demo iframe wrapper
│   │       ├── OrbitDemoWindow.tsx
│   │       ├── hooks/
│   │       ├── components/
│   │       ├── types/
│   │       └── data/
│   ├── pricing/
│   │   └── pricing-cards.tsx    # Pricing page cards + FAQ
│   ├── blog/                    # Blog components
│   ├── site-header.tsx
│   ├── site-footer.tsx
│   └── theme-provider.tsx
│
├── public/
│   ├── demo/                    # Built Snowflake-v0 agent app (static)
│   │   ├── index.html
│   │   └── assets/              # JS/CSS bundles
│   └── thumbnails/              # Blog post images
│
└── lib/
    └── utils.ts                 # cn() utility
```

---

## Color System (Critical)

### Architecture

`app/globals.css` is the **single source of truth** for all colors. It uses a **Radix 12-step scale** with two hue families:

- **Gray scale** (`--gray-1` through `--gray-12`): Warm brown-tinted grays
- **Accent scale** (`--accent-1` through `--accent-12`): Warm coral/terracotta

### Key Color Values

#### Light Mode

| Token         | Hex       | Usage                                      |
| ------------- | --------- | ------------------------------------------ |
| `--gray-1`    | `#eee9e8` | Page background                            |
| `--gray-2`    | `#e5dfdd` | Cards                                      |
| `--gray-6`    | `#c8afa5` | Borders                                    |
| `--gray-10`   | `#826053` | Primary buttons                            |
| `--gray-11`   | `#60463b` | Secondary text, table data                 |
| `--gray-12`   | `#301910` | Headings, strong text                      |
| `--accent-11` | `#945036` | Branded text (Orbit column in comparisons) |

#### Dark Mode

| Token         | Hex       | Usage                      |
| ------------- | --------- | -------------------------- |
| `--gray-1`    | `#16110f` | Page background            |
| `--gray-2`    | `#1d1816` | Cards                      |
| `--gray-6`    | `#463630` | Borders                    |
| `--gray-10`   | `#937265` | Primary buttons            |
| `--gray-11`   | `#caaca0` | Secondary text, table data |
| `--gray-12`   | `#f5ece8` | Headings, strong text      |
| `--accent-11` | `#e9ad97` | Branded text               |

### Semantic Token Mapping

```css
--background: var(--gray-1);
--foreground: var(--gray-12);
--card: var(--gray-2);
--muted: var(--gray-4);
--muted-foreground: var(--gray-10);  /* light */ var(--gray-11); /* dark */
--border: var(--gray-6);
--input: color-mix(in oklch, var(--gray-6) 50%, transparent);
--primary: var(--gray-10);
--primary-foreground: #fff;
```

### Border Convention

All borders use **`border-border/50`** (gray-6 at 50% opacity) for a subtle, soft look. This applies across:

- Card borders
- Table row dividers
- Section dividers (`<hr>`)
- FAQ card borders

The `/50` Tailwind modifier produces `color-mix(in oklch, var(--border) 50%, transparent)`.

### Prose Link Styles

Links inside `.prose` containers get blue styling with underlines. **Button-styled anchors are excluded** via:

```css
.prose a:not([class*='inline-flex']) {
  color: oklch(50% 0.15 250);
  text-decoration: underline;
}
```

This prevents shadcn `<Button asChild>` links from getting prose link styles.

---

## Demo System (Snowflake-v0 Integration)

### How It Works

1. **Snowflake-v0** has a demo mode triggered by URL params: `?demo=true&view=hero|showcase|feature|demo`
2. The agent app is **built with Vite** and the output is copied to `orbitweb/public/demo/`
3. **OrbitDemoWindow** (`components/landing/orbit-demo-window/OrbitDemoWindow.tsx`) wraps the iframe

### Demo Views

| View       | Tab    | Editor File  | Conversation |
| ---------- | ------ | ------------ | ------------ |
| `hero`     | Agent  | `app.tsx`    | Yes          |
| `showcase` | Agent  | None         | Yes          |
| `feature`  | Editor | `utils.ts`   | Yes          |
| `demo`     | Agent  | `styles.css` | Yes          |

### Key Files in Snowflake-v0

| File                                              | Purpose                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `apps/agent/src/App.tsx`                          | `applyDemoView()` — configures demo state per view param |
| `apps/agent/src/hooks/agent/demo-conversation.ts` | Scripted conversation playback engine                    |
| `apps/agent/src/hooks/agent/use-tauri-mock.ts`    | Mock file content and message handling                   |

### Demo Conversation Script

The demo plays a scripted conversation about building "ClawdBot" — an AI assistant with Linear, Slack, and Playwright integrations. The sequence:

1. `conversation:created` → initializes session
2. `conversation:loaded` → shows user prompt
3. Streaming `agent:chunk` messages → AI response text
4. `tool:start` / `tool:end` → WebSearch, Write, Bash tools
5. `agent:complete` → finishes

### Rebuilding the Demo

When Snowflake-v0 UI changes affect the demo:

```bash
cd /Users/no9labs/Developer/Recursive/Snowflake-v0

# Build the frontend (Vite production build)
bun run build

# Copy the built output to orbitweb
rm -rf ../orbitweb/public/demo/assets
cp -r dist/* ../orbitweb/public/demo/
```

### OrbitDemoWindow Features

- **Theme sync**: Listens to `next-themes` and posts theme changes to iframe
- **Reset button**: Reloads iframe behind an opaque overlay with ThinkingDots animation
- **Window chrome**: macOS-style traffic lights, resize handle
- **Responsive**: Different sizes for mobile vs desktop

### Reset Overlay

When the reset button is clicked:

1. An opaque overlay (`bg-[#eee9e8] dark:bg-[#16110f]`) appears instantly
2. ThinkingDots animation plays (ORBIT letter-tracing SVG)
3. iframe.src is cleared and restored
4. After iframe loads, overlay fades out with `opacity 0.3s ease-out`

---

## Comparison Pages Pattern

All `orbit-vs-*` pages follow the same structure:

1. **Header** with back link
2. **Hero** with title + subtitle
3. **At a Glance** — two cards comparing philosophies
4. **Feature Comparison Table** — data-driven from `comparisonData` array
   - Desktop: `<table>` with columns
   - Mobile: stacked cards
   - Copilot/competitor column: `text-gray-11`
   - Orbit column: `text-accent-11` (branded warm tone)
   - Headers: `text-foreground` (gray-12)
5. **The Fundamental Difference** — prose comparison
6. **Where [Competitor] Shines** — fair competitor strengths
7. **Where Orbit is Different** — Orbit differentiators
8. **Which Should You Choose?** — recommendation lists
9. **Can You Use Both?** — non-competitive framing
10. **The Verdict** — closing statement
11. **Related Comparisons** — 3-card grid
12. **CTA** — waitlist buttons

### Table Color Convention (comparison pages)

| Element                  | Class                         | Notes               |
| ------------------------ | ----------------------------- | ------------------- |
| Header row (all columns) | `text-foreground`             | Gray-12, uniform    |
| Feature name column      | `text-foreground font-medium` | Gray-12             |
| Competitor value column  | `text-gray-11`                | Neutral secondary   |
| Orbit value column       | `text-accent-11`              | Warm branded accent |
| Row borders              | `border-b border-border/50`   | Soft dividers       |

---

## Blog Pages

Blog posts are rendered in `app/blog/[slug]/page.tsx` with MDX content. Key sections:

- **Related Articles** at the bottom — 3-column grid of blog cards with thumbnails
- Blog cards use `border-border/40` with `hover:border-border/60`
- Card titles use `text-card-foreground group-hover:text-primary`

---

## Pricing Page

`app/pricing/page.tsx` + `components/pricing/pricing-cards.tsx`

- Three plan cards (Free, Pro, Team) with Pro highlighted (inverted colors)
- Feature comparison table below
- Enterprise CTA section
- FAQ accordion
- All borders use `border-border/50`
- BetaBanner component with pulsing dot indicator

---

## Common Patterns & Conventions

### Animation Delays

Sections use staggered `animationDelay` for fade-in on scroll:

```tsx
<div className="animate-fade-in opacity-0" style={{ animationDelay: '500ms' }}>
```

### Button Variants

- **Primary**: `bg-primary text-primary-foreground` (gray-10 + white)
- **Outline**: `border border-input bg-background` (gray-6/50 border)
- **Ghost**: no border, subtle hover

### Responsive Patterns

- Desktop table → Mobile stacked cards: `hidden md:block` / `md:hidden`
- Grid columns: `grid md:grid-cols-2` or `grid md:grid-cols-3`
- Fluid spacing: `px-6`, `py-16`, `max-w-4xl mx-auto`

### Links Inside Prose

Always add `inline-flex` to button-styled links inside `.prose` to avoid blue underline styling:

```tsx
<Button asChild>
  {' '}
  {/* Button already adds inline-flex */}
  <Link href="/waitlist">Join</Link>
</Button>
```

For regular text links inside prose, the blue styling applies automatically.

---

## Checklist When Editing Orbitweb

1. **Colors**: Use Radix tokens (`text-gray-11`, `text-accent-11`, `bg-muted/50`) — never hardcode hex values
2. **Borders**: Always `border-border/50` — never full opacity `border-border`
3. **Prose links**: If adding a Button inside `.prose`, use `<Button asChild>` which has `inline-flex`
4. **Demo changes**: If Snowflake-v0 UI changed, rebuild and copy to `orbitweb/public/demo/`
5. **Theme consistency**: Test both light and dark mode — warm palette looks different in each
6. **Mobile**: Check `md:hidden` / `hidden md:block` patterns for responsive layouts

---

## Quick Reference: File Locations

| What              | File                                                                |
| ----------------- | ------------------------------------------------------------------- |
| Global colors     | `orbitweb/app/globals.css`                                          |
| Demo wrapper      | `orbitweb/components/landing/orbit-demo-window/OrbitDemoWindow.tsx` |
| Demo section      | `orbitweb/components/landing/demo-section.tsx`                      |
| Pricing cards     | `orbitweb/components/pricing/pricing-cards.tsx`                     |
| Blog post page    | `orbitweb/app/blog/[slug]/page.tsx`                                 |
| Hero section      | `orbitweb/components/landing/hero-section.tsx`                      |
| Site header       | `orbitweb/components/site-header.tsx`                               |
| Site footer       | `orbitweb/components/site-footer.tsx`                               |
| UI components     | `orbitweb/components/ui/`                                           |
| Comparison pages  | `orbitweb/app/orbit-vs-*/page.tsx`                                  |
| Audience pages    | `orbitweb/app/orbit-for-*/page.tsx`                                 |
| Demo build output | `orbitweb/public/demo/`                                             |
| Demo conversation | `Snowflake-v0/apps/agent/src/hooks/agent/demo-conversation.ts`      |
| Demo view setup   | `Snowflake-v0/apps/agent/src/App.tsx` (applyDemoView function)      |
| Mock file content | `Snowflake-v0/apps/agent/src/hooks/agent/use-tauri-mock.ts`         |
