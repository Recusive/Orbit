# Canvas UI Builder — Rebuild Session Context

## What This Is

The Canvas UI Builder is a visual component customization tool inside Orbit (a Tauri 2 desktop app). It lets users browse shadcn/ui components, customize them live, and export the result. The architecture is:

```
Tauri Webview (Canvas App)
  └── iframe src="http://localhost:{port}"
        └── Vite Preview Server (~/.orbit/canvas/preview/)
              └── Dynamic imports from ~/.orbit/canvas/components/ui/
```

## What's Broken

The Canvas UI Builder has multiple issues that need a fresh, careful approach:

### 1. Components in ~/.orbit/canvas/components/ui/ are corrupted

During testing, the Canvas AI agent wrote CSS customizations **directly into the source component files** instead of keeping them as runtime-only overrides. Examples of corruption:

- `button.tsx`: `rounded-[32px]`, `tracking-[3px]`, `opacity-40` baked into source
- `avatar.tsx`: `tracking-[2px]` on all sub-components
- `breadcrumb.tsx`: `bg-[#0433ff]` on every element
- `card.tsx`: `text-[32px]` on every element
- `dialog.tsx`: `text-[32px]` on every element

**The correct behavior**: Components in `~/.orbit/canvas/components/ui/` should ALWAYS be the default shadcn originals. User customizations should only exist as runtime CSS overrides in the preview (via the `preview:update-styles` postMessage), never written back to the source files.

**IMPORTANT**: A previous attempt to fix this by downloading the latest shadcn versions broke things further because the shadcn registry has been updated since Jan 19 2025 (when the components were originally downloaded). The latest versions have different APIs (avatar now has AvatarBadge/AvatarGroup/size prop, dialog now imports Button, button has new xs/icon-xs sizes). The Preview.tsx (908 lines, at `~/.orbit/canvas/preview/src/Preview.tsx`) was written for the OLD component APIs and breaks with the new ones.

**Fix approach**: Either (a) re-download ALL components fresh from shadcn AND update the Preview.tsx to match the new APIs, or (b) carefully restore just the 5 corrupted files to their pre-corruption state by removing only the test artifacts.

### 2. Production build CSP blocks iframe scripts

**Already fixed on `fix/bugs` branch** (verify in `src-tauri/tauri.conf.json`):

- `script-src` and `style-src` need `http://localhost:*` for the Vite iframe to work in production builds where the parent origin is `tauri://localhost`
- `frame-src`, `connect-src`, `worker-src` already have localhost patterns

### 3. `bun` not found in PATH for production builds

**Already fixed on `fix/bugs` branch** (verify in `src-tauri/src/commands/canvas/preview.rs`):

- `augmented_path()` helper adds `~/.bun/bin`, `/usr/local/bin`, `/opt/homebrew/bin` etc.
- Applied to both `canvas_install_preview_deps` and `canvas_start_preview_server`

## Key Files

### In the repo (src-tauri/)

- `src-tauri/tauri.conf.json` — CSP configuration
- `src-tauri/src/commands/canvas/preview.rs` — Vite server lifecycle + scaffold
- `src-tauri/src/commands/canvas/download.rs` — Component download from shadcn registry
- `src-tauri/src/commands/canvas/setup.rs` — Directory initialization

### In the repo (frontend)

- `apps/Canvas-UI-Builder/src/components/preview/PreviewPanel.tsx` — iframe + postMessage
- `apps/Canvas-UI-Builder/src/components/layout/CanvasRootLayout.tsx` — Main layout
- `apps/Canvas-UI-Builder/src/hooks/use-preview-server.ts` — Server lifecycle hook
- `apps/Canvas-UI-Builder/src/hooks/use-canvas-setup.ts` — Setup state

### On disk (user data, NOT in repo)

- `~/.orbit/canvas/components/ui/*.tsx` — Downloaded shadcn components (CORRUPTED)
- `~/.orbit/canvas/preview/src/Preview.tsx` — 908-line file with component demos (written by canvas agent, may need updating)
- `~/.orbit/canvas/preview/src/globals.css` — Tailwind v4 config with theme variables
- `~/.orbit/canvas/lib/utils.ts` — cn() utility

## Architecture Rules

1. **Components in ~/.orbit/canvas/components/ui/ must ALWAYS be pristine defaults** from shadcn. The download command fetches from `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json` and applies import transforms (`@/lib/utils` → `../../lib/utils`, registry paths → alias paths).

2. **User customizations are runtime-only CSS overrides** sent via `preview:update-styles` postMessage. They target `[data-slot]` elements. They are NEVER written back to component source files.

3. **The save/export flow** should copy a component + its CSS overrides to a separate location (the user's project), not modify the originals.

4. **The Preview.tsx** is responsible for rendering component demos. It uses dynamic `import()` to load components and must match whatever API the downloaded components expose.

## The shadcn Download Transform (from download.rs)

```rust
fn transform_imports(content: &str) -> String {
    content
        .replace("from \"@/lib/utils\"", "from \"../../lib/utils\"")
        .replace("from '@/lib/utils'", "from '../../lib/utils'")
        .replace("@/registry/new-york-v4/ui/", "@/components/ui/")
        .replace("@/registry/new-york-v4/lib/", "@/lib/")
        .replace("@/registry/new-york-v4/hooks/", "@/hooks/")
}
```

## Current Branch

`fix/bugs` — has CSP and PATH fixes already applied. The corrupted component files are in `~/.orbit/canvas/` (not tracked by git).

## What To Do

1. Read the CLAUDE.md files for full project context
2. Fix the corrupted components — either re-download all fresh and update Preview.tsx, or surgically clean the 5 files
3. Verify the CSP and PATH fixes are in place
4. Test that the preview works in both dev mode (`bunx tauri dev`) and production build
