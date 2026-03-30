# Fix Actions Bar Slide-In Desync on Welcome → Workspace Transition

## Context

When the user selects a folder from the welcome screen, the ActionsBar (35px right-side icon column) appears **instantly** (conditional DOM mount), while the ContentCard's right margin animates from 10px → 0px over 200ms. This desync makes the bar appear to "push" the content card, creating a jarring slide-in effect.

The left sidebar already solves this exact problem using a **margin-slide pattern**: always rendered in the DOM, hidden via `marginLeft: -width`, and revealed by transitioning `marginLeft` to 0. The fix applies the same pattern to the actions bar.

## Approach: Margin-Slide Wrapper in AppShell

Instead of conditionally mounting/unmounting the ActionsBar, always render it inside a fixed-width wrapper that slides via `marginRight`, synchronized with ContentCard's margin transition.

---

### Change 1: AppShell — add animated wrapper for actions bar (`app-shell.tsx`)

Add an `actionsBarOpen` boolean prop. Always render a wrapper div for the actions bar slot with the same transition timing as ContentCard's margin:

```tsx
interface AppShellProps {
  // ... existing props
  readonly actionsBar?: ReactNode;
  readonly actionsBarOpen?: boolean; // NEW
}

// In the component:
const actionsBarStyle: CSSProperties = {
  width: SIDEBAR.iconColumnWidth,
  marginRight: actionsBarOpen ? 0 : -SIDEBAR.iconColumnWidth,
  flexShrink: 0,
  transition:
    transitionOverride !== undefined
      ? `margin-right ${transitionOverride}`
      : PREFERS_REDUCED_MOTION
        ? undefined
        : `margin-right ${CONTENT_CARD.transition}`,
  overflow: 'hidden',
};

// Replace raw `{actionsBar}` with:
{
  actionsBar !== undefined ? <div style={actionsBarStyle}>{actionsBar}</div> : null;
}
```

This mirrors the sidebar pattern exactly:

- Fixed width (35px, never animates — no layout thrash)
- `marginRight` slides it off the right edge when closed
- Same transition timing as ContentCard (`200ms cubic-bezier(0.165, 0.84, 0.44, 1)`)
- Same `transitionOverride` support for launch sequence

### Change 2: App.tsx — always render ActionsBar, control via `actionsBarOpen`

**Line 861** — remove `!isWelcome` from the ActionsBar conditional:

```tsx
// Before:
actionsBar={rightSidebarOpen && !isWelcome ? <ActionsBar /> : undefined}

// After:
actionsBar={rightSidebarOpen ? <ActionsBar /> : undefined}
```

**Add new prop** — pass `actionsBarOpen` to AppShell:

```tsx
<AppShell
  // ... existing props
  actionsBar={rightSidebarOpen ? <ActionsBar /> : undefined}
  actionsBarOpen={rightSidebarOpen && !isWelcome}
>
```

Now the bar is always in the DOM (when `rightSidebarOpen`), but hidden off-screen during welcome via `marginRight: -35px`. When `isWelcome` flips to `false`, the margin transitions to 0 in sync with ContentCard's margin.

### Change 3: ContentCard `actionsBarOpen` — no change needed

Line 881 already passes the correct value:

```tsx
actionsBarOpen={activityOpen || rightSidebarOpen ? !isWelcome : false}
```

Both the AppShell wrapper and ContentCard transition from closed→open at the same moment (`!isWelcome`), using the same timing (`CONTENT_CARD.transition`). They're perfectly in sync.

---

## Files Modified

| File                                             | Change                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/agent/src/components/layout/app-shell.tsx` | Add `actionsBarOpen` prop, wrap actions bar in margin-slide div       |
| `apps/agent/src/App.tsx`                         | Remove `!isWelcome` from actionsBar render, add `actionsBarOpen` prop |

## Why Margin-Slide (Not Opacity/Transform)

The bug is about **flex space allocation**, not visibility. When a DOM element mounts, it claims flex space on the first frame regardless of its visual opacity or transform. The margin-slide pattern is the only pure-CSS approach that controls when an element starts contributing to layout flow — negative margin cancels out the width, making it layout-invisible until the margin animates to 0.

## Audit Notes

- **Naming**: Two `actionsBarOpen` props exist with slightly different semantics — AppShell's (`rightSidebarOpen && !isWelcome`) controls the 35px wrapper visibility, ContentCard's also factors in `activityOpen`. Both are scoped to their own components and descriptive enough in context.
- **Toggle in workspace**: When `rightSidebarOpen` toggles while already in workspace, the ActionsBar still mounts/unmounts (same as current behavior). The margin-slide only applies to the welcome→workspace transition. This is correct — the bug being fixed is specifically about that transition.

## Verification

1. `bun run typecheck` — no errors
2. `bun run lint` — zero warnings
3. `bunx tauri dev` — launch app, select folder from welcome screen, verify:
   - Actions bar slides in smoothly (no instant pop)
   - ContentCard right margin and actions bar margin transition in sync
   - No "wider than expected" appearance during transition
4. Toggle actions bar open/closed in workspace — verify smooth transition still works
5. Check `prefers-reduced-motion` — verify no transition when motion is reduced
