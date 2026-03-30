# Fix SF Symbol Icon Flash on Welcome → Workspace Transition

## Context

When the app transitions from the welcome screen to the workspace after selecting a folder, all SF Symbol icons briefly flash from their Lucide React fallback icons to the real SF Symbols. This causes a visible layout shift in the action bar and header bar because:

1. **Cold cache** — The module-level `symbolCache` Map in `sf-symbol.tsx` is empty when workspace UI first mounts, so every `<SFSymbol>` triggers an async Tauri IPC call
2. **DOM structure mismatch** — Loading state renders raw `<>{fallback}</>` (bare SVG), while loaded state renders a `<div>` with explicit width/height via mask-image. Different structure + different dimensions = layout jiggle

## Approach: Pre-warm Cache + Stable Layout Wrapper

Two independent, low-risk changes that serve as safety nets for each other.

---

### Change 1: Stable layout wrapper during loading (sf-symbol.tsx:117-119)

Wrap the fallback in a `<div>` that reserves the same space as the loaded icon.

**Current code:**

```tsx
if (state.status !== 'loaded') {
  return fallback !== undefined ? <>{fallback}</> : null;
}
```

**New code:**

```tsx
// NOTE: The wrapper reserves size × size. The loaded icon's width is
// data.width * scale (proportional to the SF Symbol's natural aspect
// ratio), which is typically slightly wider or narrower than square.
// This eliminates vertical shift entirely. A small horizontal shift
// (~1-3px) remains because the real width is unknowable before IPC
// resolves — this is acceptable and imperceptible with pre-warming.
if (state.status !== 'loaded') {
  if (fallback === undefined) return null;
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {fallback}
    </div>
  );
}
```

**Why `size × size`:** Loaded icons have `height: size` with proportional width (typically close to `size`). Reserving a square placeholder prevents vertical shift entirely and minimizes horizontal shift. The wrapper also matches the loaded state's `flexShrink: 0`, `className`, `style`, and `aria-*` pattern. This also improves non-macOS rendering where fallback is permanent.

### Change 2: Export `WORKSPACE_SF_SYMBOLS` constant + `preloadSFSymbols` function (sf-symbol.tsx)

Co-locate the preload list with the symbol system so it's discoverable when adding new `<SFSymbol>` usages:

```tsx
/** All SF Symbols used in the workspace UI — add new entries here when
 *  introducing <SFSymbol> in any workspace component. */
export const WORKSPACE_SF_SYMBOLS = [
  // ContentTopBar + HeaderBar
  { name: 'sidebar.squares.right', size: 18, weight: 'medium' },
  { name: 'apple.terminal', size: 18, weight: 'medium' },
  { name: 'switch.2', size: 18, weight: 'medium' },
  // ActionsBar mode buttons
  { name: 'paintpalette', size: 18, weight: 'medium' },
  { name: 'chevron.left.forwardslash.chevron.right', size: 18, weight: 'medium' },
  { name: 'command', size: 18, weight: 'medium' },
  // ContentTopBar + PrimarySidebar navigation
  { name: 'sidebar.left', size: 18, weight: 'medium' },
  { name: 'arrow.left', size: 13, weight: 'semibold' },
  { name: 'arrow.right', size: 13, weight: 'semibold' },
  // PrimarySidebar actions
  { name: 'square.and.pencil', size: 18, weight: 'medium' },
  { name: 'exclamationmark.bubble', size: 18, weight: 'medium' },
  { name: 'gear', size: 18, weight: 'medium' },
  // SettingsSidebar
  { name: 'rectangle.connected.to.line.below', size: 18, weight: 'medium' },
] as const satisfies ReadonlyArray<{ name: string; size?: number; weight?: SFSymbolWeight }>;

export function preloadSFSymbols(
  symbols: ReadonlyArray<{ name: string; size?: number; weight?: SFSymbolWeight }>
): void {
  for (const { name, size = 16, weight = 'regular' } of symbols) {
    fetchSymbol(name, size, weight);
  }
}
```

Fire-and-forget — `fetchSymbol` caches the Promise immediately, so when components mount later they `.then()` on an already-resolved Promise. Idempotent via the existing `symbolCache.has()` check.

### Change 3: Self-contained preload hook (hooks/core/use-preload-sf-symbols.ts)

Keep App.tsx clean with a single-line hook:

```tsx
import { useEffect } from 'react';

import { preloadSFSymbols, WORKSPACE_SF_SYMBOLS } from '@/components/shared/sf-symbol';

/** Pre-warm SF Symbol cache on mount so icons are ready before workspace UI renders. */
export function usePreloadSFSymbols(): void {
  useEffect(() => {
    preloadSFSymbols(WORKSPACE_SF_SYMBOLS);
  }, []);
}
```

### Change 4: Call the hook in App.tsx (after line 377)

```tsx
usePreloadSFSymbols(); // Pre-warm SF Symbol cache before workspace UI mounts
```

One line, self-documenting, alongside the other initialization hooks.

### Change 5: Update barrel exports

**shared/index.ts** — add `preloadSFSymbols` and `WORKSPACE_SF_SYMBOLS` alongside existing exports:

```tsx
export { SFSymbol, preloadSFSymbols, WORKSPACE_SF_SYMBOLS } from './sf-symbol';
export type { SFSymbolWeight } from './sf-symbol';
```

**hooks/core/index.ts** (if barrel exists) — add `usePreloadSFSymbols`.

## Addressed Limitations

Both limitations from the audit were resolved during implementation:

- **Cache poisoning** — `fetchSymbol` now evicts failed entries via `symbolCache.delete(key)` in the `.catch()` handler. Failed preload calls don't poison the cache; subsequent component renders retry the IPC call.
- **Sync enforcement** — `__tests__/integration/sf-symbol-preload.test.ts` greps all `<SFSymbol>` usages (direct + indirect via props like `sfSymbol="..."`) and validates bidirectional sync with `WORKSPACE_SF_SYMBOLS`. Adding a new icon without updating the preload list fails the test.

---

## Files Modified

| File                                                             | Change                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/agent/src/components/shared/sf-symbol.tsx`                 | Stable wrapper div + cache eviction on failure + `WORKSPACE_SF_SYMBOLS` constant + `preloadSFSymbols` export |
| `apps/agent/src/hooks/core/use-preload-sf-symbols.ts`            | New self-contained preload hook                                                                              |
| `apps/agent/src/App.tsx`                                         | One-line `usePreloadSFSymbols()` call                                                                        |
| `apps/agent/src/components/shared/index.ts`                      | Add `preloadSFSymbols`, `WORKSPACE_SF_SYMBOLS` to barrel                                                     |
| `apps/agent/src/hooks/core/index.ts`                             | Add `usePreloadSFSymbols` to barrel                                                                          |
| `apps/agent/src/__tests__/integration/sf-symbol-preload.test.ts` | Sync enforcement test (3 assertions)                                                                         |

## Verification

1. `bun run typecheck` — no errors
2. `bun run lint` — zero warnings
3. `bunx tauri dev` — launch app, select folder from welcome screen, verify:
   - No fallback → SF Symbol icon flash in action bar or header bar
   - No layout shift/jiggle in icon buttons
   - Icons appear as SF Symbols from the first frame
4. Test non-macOS fallback path still works (fallback icons render in stable wrapper)
