# Canvas UI Builder → Design System Token Explorer

## Goal

Transform Canvas from a per-component customizer into a **Design System Token Explorer**: show ALL shadcn components in a scrollable 2-column grid, edit global design tokens from a sidebar, see everything update live, export modified tokens as CSS. Sessions are ephemeral — base components are NEVER modified.

## Decisions

- **All variants** shown per component (comprehensive grid)
- **Core 11 color tokens** (primary, secondary, accent, destructive, background, foreground, muted, card, popover, border, ring)
- **Export only modified tokens** (clean `:root {}` block)
- **Keep chat input area** (for future AI integration)

---

## Phase 1: Rust Backend — Rewrite Preview.tsx Template

**File:** `src-tauri/src/commands/canvas/preview.rs` (lines 536-760)

Replace the scaffolded `Preview.tsx` template with:

### New Preview.tsx Architecture

1. **Static imports** of ALL 46 components at the top (no dynamic `import()`)
2. **Component showcase grid** — 2-column layout, grouped by 8 categories:
   - Inputs & Forms (button, input, textarea, checkbox, radio-group, switch, slider, select, label, toggle, toggle-group)
   - Data Display (card, badge, avatar, table, separator, aspect-ratio)
   - Feedback (alert, progress, skeleton)
   - Navigation (breadcrumb, tabs, pagination, menubar, navigation-menu)
   - Overlays (dialog, sheet, popover, tooltip, dropdown-menu, context-menu, hover-card, alert-dialog)
   - Layout (accordion, collapsible, scroll-area, resizable)
   - Interactive (command, carousel, drawer)
   - Advanced (input-otp, calendar, chart, form, sonner, sidebar)
3. **All variants** per component (e.g., Button: default, secondary, destructive, outline, ghost × sm/default/lg sizes)
4. **Token injection** via `:root` CSS variable overrides + `!important` CSS injection for non-tokenized properties
5. **New message protocol**: `tokens:update`, `tokens:reset`, `preview:set-theme`

### Token Injection Strategy

```
CSS Variable tokens (--radius, --primary, etc.)
  → document.documentElement.style.setProperty(key, value)
  → Cascades to ALL components via Tailwind's var() references

CSS Override tokens (font-size, letter-spacing, etc.)
  → Inject <style> with targeted rules using !important
  → Targets [data-slot] elements (shadcn component roots)
```

---

## Phase 2: New Design Token Store

**Create:** `apps/Canvas-UI-Builder/src/stores/design-tokens-store.ts`

Replace the per-component `css-customization-store.ts` with a global token store:

```
State:
  cssVars: Record<string, string>       // --radius, --primary, etc.
  cssOverrides: Record<string, string>  // font-size, letter-spacing, etc.
  hasChanges: boolean

Actions:
  setCSSVar(key, value)     // e.g., ('--radius', '1rem')
  setCSSOverride(prop, val) // e.g., ('font-size', '16px')
  resetAll()                // Clear all overrides
  exportAsCSS()             // Returns ":root { --radius: 1rem; }" (modified only)
  exportForAI()             // Returns formatted AI prompt
```

### Token Definitions

**Geometry:**

- `--radius` — Base border-radius (slider: 0rem → 2rem, step: 0.125rem, default: 0.5rem)

**Colors (11 core tokens):**

- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--background`, `--foreground`
- `--muted`, `--muted-foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--border`, `--input`, `--ring`

**Typography (CSS overrides):**

- Font size base — slider/presets (12/13/14/15/16px)
- Font weight — select (300/400/500/600/700)
- Letter spacing — slider (-0.05em → 0.1em)

**Effects (CSS overrides):**

- Shadow preset — select (none / sm / md / lg)

---

## Phase 3: New Inspector Component

**Create:** `apps/Canvas-UI-Builder/src/components/inspector/DesignTokenInspector.tsx`

Replace InspectorPanel + PropsEditor + PropertiesPanel with a single global token inspector:

- **Header:** "Design Tokens" title + Reset All button
- **Tabs:** Geometry | Colors | Typography | Effects
- **Controls:**
  - Sliders for numeric values (--radius, font-size, letter-spacing)
  - Color pickers for color tokens (using existing color input pattern)
  - Select dropdowns for presets (font-weight, shadow)
- **Export section** at bottom:
  - "Copy CSS Variables" — copies modified `:root {}` block
  - "Copy for AI" — copies formatted design system description
  - "Reset to Defaults" button

---

## Phase 4: Update Layout & PreviewPanel

**Modify:** `apps/Canvas-UI-Builder/src/components/layout/CanvasRootLayout.tsx`

Changes:

- Remove left sidebar (`CanvasLeftSidebar`) and its resize handle
- Remove component selection state (`selectedComponentName`, `handleComponentSelect`)
- Remove per-component CSS/props passing
- Center area becomes full-width with scrollable preview
- Right sidebar renders `DesignTokenInspector` instead of old inspector
- Read tokens from `useDesignTokensStore` and pass to PreviewPanel
- Keep `CanvasInputArea` at bottom

**Modify:** `apps/Canvas-UI-Builder/src/components/preview/PreviewPanel.tsx`

Changes:

- Remove `componentName`, `componentType`, `styles`, `props` props
- Add `tokens: { cssVars: Record<string, string>; cssOverrides: Record<string, string> }` prop
- Replace `preview:load` / `preview:update-styles` / `preview:update-props` messages with `tokens:update`
- Remove single-component loading effects
- Add token sync effect: when tokens change → postMessage `tokens:update`
- Keep theme sync (MutationObserver for dark mode)
- Remove the 800x600 max-size constraint — iframe should fill the center area
- Keep `preview:ready` listener for initialization

**Modify:** `apps/Canvas-UI-Builder/src/components/layout/right-sidebar/`

Update to render `DesignTokenInspector` instead of passing `selectedComponentName` to old inspector.

---

## Phase 5: Cleanup — Delete Obsolete Files

**Delete stores:**

- `apps/Canvas-UI-Builder/src/stores/css-customization-store.ts`
- `apps/Canvas-UI-Builder/src/stores/component-props-store.ts`

**Delete components:**

- `apps/Canvas-UI-Builder/src/components/inspector/InspectorPanel.tsx`
- `apps/Canvas-UI-Builder/src/components/inspector/PropsEditor.tsx`
- `apps/Canvas-UI-Builder/src/components/inspector/PropertiesPanel.tsx`
- `apps/Canvas-UI-Builder/src/components/sidebar/ComponentList.tsx`
- `apps/Canvas-UI-Builder/src/components/layout/left-sidebar/` (entire directory)

**Delete hooks:**

- `apps/Canvas-UI-Builder/src/hooks/use-component-registry.ts`
- `apps/Canvas-UI-Builder/src/hooks/use-style-persistence.ts`
- `apps/Canvas-UI-Builder/src/hooks/use-optimistic-slider.ts` (if only used by deleted components)

**Update barrel exports** in index.ts files to remove deleted modules.

**Note:** Keep `save.rs`, `transform.rs`, `persist.rs` in Rust — they'll be useful for Step 2 (Figma-like canvas).

---

## Phase 6: Re-scaffold & Test

### Reset Preview Server

After updating `preview.rs`, users need to re-scaffold:

- Add a `canvas_reset_preview` command (or reuse `canvas_setup_preview_server`) that re-writes Preview.tsx
- On next launch, detect version mismatch and re-scaffold automatically

### Testing

1. **Rust:** `cargo test canvas` — verify template scaffold compiles
2. **TypeScript:** `bun run typecheck` — verify no type errors
3. **ESLint:** `bun run lint` — verify no lint errors
4. **Manual QA:**
   - Setup wizard completes → all components download
   - Preview shows ALL 46 components in 2-col grid
   - Move --radius slider → all rounded corners update
   - Change --primary color → all primary elements update
   - Change font-size → all text updates
   - Reset All → everything returns to defaults
   - Copy CSS → clipboard has valid `:root { --radius: 1rem; }` (modified only)
   - Close app → reopen → tokens are reset (ephemeral)
   - Light/dark theme toggle works in preview

---

## File Summary

| Action     | File                                                                       | Lines                  |
| ---------- | -------------------------------------------------------------------------- | ---------------------- |
| **MODIFY** | `src-tauri/src/commands/canvas/preview.rs`                                 | ~800 lines in template |
| **CREATE** | `apps/Canvas-UI-Builder/src/stores/design-tokens-store.ts`                 | ~150                   |
| **CREATE** | `apps/Canvas-UI-Builder/src/components/inspector/DesignTokenInspector.tsx` | ~250                   |
| **MODIFY** | `apps/Canvas-UI-Builder/src/components/layout/CanvasRootLayout.tsx`        | ~80 changed            |
| **MODIFY** | `apps/Canvas-UI-Builder/src/components/preview/PreviewPanel.tsx`           | ~100 changed           |
| **MODIFY** | `apps/Canvas-UI-Builder/src/components/layout/right-sidebar/`              | ~20 changed            |
| **DELETE** | 9 files + 1 directory                                                      | ~1200 removed          |
| **UPDATE** | Barrel index.ts files                                                      | ~30 changed            |

## Implementation Order

1. Phase 2 first (token store — no dependencies, foundation for everything)
2. Phase 1 (Rust template — can work in parallel since it's backend)
3. Phase 3 (inspector component — depends on store)
4. Phase 4 (layout + preview updates — depends on store + inspector)
5. Phase 5 (cleanup — after everything works)
6. Phase 6 (test)
