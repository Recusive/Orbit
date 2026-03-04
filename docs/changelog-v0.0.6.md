# Orbit v0.0.6

_March 2026_

---

## Git Integration

### Accurate source control status

Fixed a class of issues where ignored files (`.DS_Store`, build artifacts, IDE metadata) could appear in the source control panel as untracked or modified. Filtering now happens at both the Rust backend and the frontend, with 12+ regression tests covering edge cases like negated patterns, nested `.gitignore` files, and `core.excludesFile`.

### Branch picker

The branch picker now always shows the full popover with search, branch list, and inline branch creation — no more switching between a basic dropdown and the full picker depending on which panel is open.

---

## Visual Consistency

Overhauled how colors are applied across the entire UI. Every surface, border, control, and status indicator now pulls from a unified set of color definitions. Light and dark themes stay in sync automatically.

This touched 60+ components — dialogs, tool cards, the editor, git status badges, sidebar items, onboarding screens — and removed ~925 lines of dead CSS in the process.

---

## Bug Fixes

- **Cursor click pulse** — Fixed the click animation snapping to `(0, 0)` instead of pulsing at the cursor position.
- **Sidebar text selection** — Clicking and dragging in the sidebar no longer accidentally selects text.

---

## Skills Marketplace _(in progress)_

Early infrastructure for browsing and installing community-built skills directly from within Orbit. Includes a marketplace pane with skill cards, an installed skills manager with per-project scope control, and backend API integration. Shipping fully in a later release.

---

## Internal

- Demo script runner for automated product recordings
- Design system documentation
