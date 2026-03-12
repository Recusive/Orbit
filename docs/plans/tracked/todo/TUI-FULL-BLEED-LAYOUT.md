# Plan: Full-Bleed TUI Layout — Edge-to-Edge Terminal Fill

## Context

The OpenCode TUI doesn't fill the full terminal window — it leaves visible gaps around the edges. The root cause is **explicit padding on the outermost view containers** in Home and Session views, not a framework issue. The root `<box>` in `app.tsx` correctly uses `width={dimensions().width}` and `height={dimensions().height}`, but the child views add `paddingLeft={2} paddingRight={2}` (4 chars total horizontally) and `paddingTop={1} paddingBottom={1}` (2 chars vertically), creating the visible gaps.

The user's constraint: **don't touch internal component spacing** — only remove the outermost container padding so the TUI fills edge-to-edge.

## Changes

### 1. Session View — Remove outer padding on center panel

**File:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

**Line 1141** — Center panel container (omit padding props entirely — 0 is the default):

```
BEFORE: <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
AFTER:  <box flexGrow={1} gap={1}>
```

> **Audit note:** When Header is hidden (`!showHeader()` or sidebar visible on wide layout, line 1143), the first scrollbox content renders at row 0. Verify visually — if too abrupt, add `paddingTop={1}` to the scrollbox viewport (line 1148), not the outer container.

**Lines 199–211** — `contentWidth` calculation. The existing formula is already wrong: it subtracts sidebar width unconditionally even when the sidebar is an absolute overlay (narrow terminals), and it ignores file tree and file viewer panels that consume real center-pane width. Simply removing `- 4` would keep it wrong. Fix the full width model:

```
BEFORE:
const contentWidth = createMemo(() => dimensions().width - (sidebarVisible() ? 42 : 0) - 4)

AFTER:
const inlineSidebarWidth = createMemo(() =>
  sidebarVisible() && wide() && !activeTab() ? 42 : 0,
)

const leftPanelWidth = createMemo(() =>
  showFileTree() ? fileTreeWidth() + 1 : 0,
)

const rightPanelWidth = createMemo(() =>
  activeTab() ? viewerWidth() + 1 : 0,
)

const contentWidth = createMemo(() =>
  Math.max(0, dimensions().width - inlineSidebarWidth() - leftPanelWidth() - rightPanelWidth()),
)
```

**Why this matters:** `contentWidth` feeds `ctx.width`, used at lines 2205 and 2259 for diff split/unified threshold (`> 120`). With the old formula:

- Sidebar as overlay on narrow terminals: still subtracts 42 → falsely forces unified diffs when center pane is full width
- File tree open (`fileTreeWidth() + 1` columns): not subtracted → split diffs trigger on inflated width
- File viewer open (`viewerWidth() + 1` columns, hides sidebar): not subtracted → same problem

The new formula derives width from the actual visible sibling panels. The `+ 1` accounts for the 1-char drag handle divider between panels (see lines 1122, 1300).

> **Audit note:** The sidebar only consumes inline width when `wide() && sidebarVisible() && !activeTab()`. On narrow terminals it renders as an absolute overlay (lines 1317-1334) and does NOT reduce the center pane. When `activeTab()` is set, the sidebar is hidden entirely (line 1317: `sidebarVisible() && !activeTab()`).

### 2. Home View — Remove outer padding on content area and status bar

**File:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/home.tsx`

**Line 114** — Main content area (omit padding props entirely):

```
BEFORE: <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
AFTER:  <box flexGrow={1} alignItems="center">
```

**Line 139** — Bottom status bar (keep `paddingTop={1}` for breathing room above, remove everything else):

```
BEFORE: <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={2}>
AFTER:  <box paddingTop={1} flexDirection="row" flexShrink={0} gap={2}>
```

> **Audit note:** Removing `paddingTop` entirely would push the status bar flush against the Toast above it, looking visually crushed. Keeping `paddingTop={1}` preserves breathing room while still achieving full-bleed horizontally and at the bottom edge.

The prompt at line 121 has `maxWidth={75}` and is centered via `alignItems="center"` on the parent — it stays centered. The status bar text (directory, MCP status, version) will now render flush to terminal edges.

## What NOT to Touch (Internal Spacing)

| Component            | Padding                                              | File:Line                |
| -------------------- | ---------------------------------------------------- | ------------------------ |
| Header               | `paddingLeft={2}, paddingTop={1}, paddingBottom={1}` | header.tsx:104-107       |
| UserMessage          | `paddingLeft={2}, paddingTop={1}`                    | index.tsx:~1392          |
| TextPart (assistant) | `paddingLeft={3}`                                    | index.tsx:~1592          |
| InlineTool           | `paddingLeft={3}`                                    | index.tsx:~1813          |
| BlockTool            | `paddingLeft={2}`                                    | index.tsx:~1881          |
| Prompt input         | `paddingLeft={2}, paddingRight={2}, paddingTop={1}`  | prompt/index.tsx:844-846 |
| Sidebar              | `paddingLeft={2}, paddingRight={2}`                  | sidebar.tsx:84-85        |
| Scrollbox viewport   | `paddingRight: showScrollbar() ? 1 : 0`              | index.tsx:1149           |

### 3. Delete Dead Code

**File:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx`

`footer.tsx` exports `Footer` but it's never imported or rendered anywhere — confirmed zero imports across the entire TUI directory. Delete the file as part of this change.

### 4. Update Documentation After Footer Deletion

**File:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/CLAUDE.md`

Remove the `footer.tsx` entry from the Key Files table:

```
DELETE: - `footer.tsx` — Session footer with status bar and context information
```

Also update the Purpose line to remove the "footer with session status" mention.

## Reference

All file paths relevant to this plan for auditing and implementation:

### Files to Modify

- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` — Session view center panel padding (line 1141) and contentWidth calculation (lines 199-211)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/home.tsx` — Home view content area padding (line 114) and status bar padding (line 139)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/CLAUDE.md` — Remove footer.tsx documentation after deletion

### Files to Verify (DO NOT modify — internal spacing)

- `Agent-backend/packages/opencode/src/cli/cmd/tui/app.tsx` — Root TUI container, `useTerminalDimensions()`, render config (lines 142-211, 777-800)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` — Prompt input internal padding (lines 833-846, 1054-1079)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/header.tsx` — Session header internal padding (lines 102-113)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx` — Sidebar internal padding (lines 75-89)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/file-tree.tsx` — File tree internal padding (lines 117-160)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/file-viewer.tsx` — File viewer internal padding (lines 24-100)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx` — Dead code (exported but never imported)
- `Agent-backend/packages/opencode/src/cli/cmd/tui/component/border.tsx` — Border character definitions (SplitBorder, EmptyBorder)

### Framework Reference

- `node_modules/@opentui/core/renderer.d.ts` — CliRendererConfig options (useAlternateScreen, targetFps, etc.)
- `node_modules/@opentui/solid/` — `useTerminalDimensions()` hook source

### CLAUDE.md Files (Context)

- `Agent-backend/CLAUDE.md` — OpenCode repo overview
- `Agent-backend/packages/opencode/CLAUDE.md` — Engine package docs
- `Agent-backend/packages/opencode/src/cli/cmd/tui/CLAUDE.md` — TUI app docs
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/CLAUDE.md` — Route views docs
- `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/CLAUDE.md` — Session view docs
- `Agent-backend/packages/opencode/src/cli/cmd/tui/component/CLAUDE.md` — Component docs
- `Agent-backend/packages/opencode/src/cli/cmd/tui/component/prompt/CLAUDE.md` — Prompt component docs

## Edge Cases to Verify

These were identified during audit and warrant visual inspection during verification:

- **File tree separator alignment** — the file tree panel is a sibling of the center panel in a `flexDirection="row"` container. With center panel left padding removed, the visual gap between the file tree border and the first content character shrinks by 2 chars. Verify the drag handle / separator still looks correct.
- **Scrollbar at terminal right edge** — the scrollbox has `paddingRight: showScrollbar() ? 1 : 0` (line 1149). With outer `paddingRight` removed, the scrollbar character renders at the terminal's rightmost column. Confirm no visual artifacts in terminal emulators that handle the last column differently.
- **Sidebar overlay on narrow terminals** — when the sidebar uses `position="absolute"` on narrow terminals (lines 1322-1334), the overlay covers center content that now extends further right. Verify overlay positioning and dismissal.
- **Home prompt at exactly 75 columns** — the prompt has `maxWidth={75}` and `width="100%"`. At terminal width 75, the prompt fills the entire width with no outer padding buffer.
- **Session with Header hidden** — when `showHeader()` is false, the first scrollbox content renders at row 0. Verify it doesn't feel too abrupt.
- **File viewer open with diff tool output** — the file viewer is the largest right-side width consumer (`viewerWidth() + 1` columns). Open a file tab, then trigger a Write/Edit tool that produces a diff. Verify the diff correctly switches between split/unified mode based on the actual center-pane width (not the inflated full width).
- **First visible content is assistant/tool output** — message parts at lines ~1392, ~1495, ~1505 already contribute their own top spacing. With outer `paddingTop` removed, verify no double-spacing when assistant text or tool renders first.
- **Home status bar with long directory path on narrow terminal** — removing horizontal padding helps, but there is no explicit truncation or wrap strategy for the left status text. Verify long paths don't cause visual overflow.

## Verification

1. `cd Agent-backend/packages/opencode && bun dev` — launch the TUI
2. **Home view**: Verify logo is centered, prompt stays within bounds, status bar text (directory path, MCP, version) reaches terminal edges, status bar has breathing room above it
3. **Session view**: Verify messages, tool outputs, and prompt fill to edges. Header and sidebar still have their own internal spacing
4. **Session with Header hidden**: Toggle sidebar on wide layout so Header hides — verify first message doesn't feel cramped at row 0
5. **Terminal resize**: Drag terminal to various sizes — content should fill fully at all sizes with no edge gaps
6. **Test multiple terminals**: Native macOS Terminal.app, Ghostty, and iTerm2 — verify full-bleed layout and no rightmost-column artifacts
7. **Sidebar toggle**: `Ctrl+X B` — verify sidebar opens/closes correctly with no layout shift in the center panel
8. **Sidebar overlay**: On narrow terminal (< 120 cols), verify overlay sidebar doesn't overlap content awkwardly and that `contentWidth` does NOT subtract 42 for the overlay
9. **File tree**: Enable file tree — verify separator and content alignment with reduced gap, and that diff mode correctly accounts for file tree width
10. **File viewer + diff**: Open a file tab, then trigger a Write/Edit tool. Verify split/unified diff mode switches correctly based on actual remaining center-pane width, not the full terminal width
11. **Small terminal**: Resize to very small (~40 cols) — content should still render without clipping (improved from before since 4 extra chars are now available)
12. **75-column terminal**: Set terminal to exactly 75 columns — verify Home prompt renders correctly at full width
13. **Documentation**: Confirm `routes/session/CLAUDE.md` no longer references `footer.tsx`
