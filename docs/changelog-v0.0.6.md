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

This touched 60+ components — dialogs, tool cards, the editor, git status badges, sidebar items, onboarding screens — and removed ~925 lines of dead CSS in the process. The CodeMirror search panel was also restyled to match, using the same glass-surface tokens as the rest of the editor chrome.

---

## Improvements

### Tool widget error states

Failed tool calls across all 14 widgets now show a small error icon next to the tool name instead of wrapping the entire widget in a dotted red border. Less visual noise, same information.

---

## Bug Fixes

- **Cursor click pulse** — Fixed the click animation snapping to `(0, 0)` instead of pulsing at the cursor position.
- **Sidebar text selection** — Clicking and dragging in the sidebar no longer accidentally selects text.

---

## Skills Marketplace

Browse and install community-built skills directly from within Orbit. The marketplace pane supports search with debounced queries and shows skill cards with generative avatars (Facehash). Already-installed skills are flagged inline so you don't install duplicates.

The installed skills pane lists per-project and personal skills with scope control — you can choose whether a skill applies to just the current project or all projects. A Rust backend handles API search, install via `bunx`, and response caching.

---

## Internal

- Demo script runner for automated product recordings
- Centralized commands store with sequenced refresh to prevent stale skill data
- Design system documentation
