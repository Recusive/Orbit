# Orbit v0.0.6

_March 2026_

---

## Multi-Provider Support

Orbit now supports multiple AI providers. Switch between them in settings — conversations, sidebar, and history work the same regardless of which provider is active.

---

## Settings

Settings moved from a modal dialog to a full inline page with grouped navigation (General, Agent, Features). Breadcrumb in the top bar, back arrow to return to chat.

---

## App Icon Picker

Choose your Dock icon from Settings → Appearance. Four icon styles with light and dark variants. Updates instantly without restart and follows system theme.

---

## Chat

### Word-by-word streaming

Responses stream in word by word instead of arriving in full blocks. Remaining words drain quickly when the response completes.

### Instant conversation titles

Titles generate immediately on the first message with a shimmer placeholder in the sidebar while loading.

### Persistent thinking

Thinking blocks persist across reloads with accurate durations, interleaved with tool calls in the correct order.

---

## Tool Widgets

Tool cards use plain language headers — "Reading", "Edited", "Ran", "Searching" — with larger text. Thinking indicator replaced with a quiet shimmer.

Message actions simplified to copy, report, and rewind. Failed tool calls show a small error icon next to the name instead of a red border around the card.

---

## Git

### Source control accuracy

Fixed ignored files (build artifacts, IDE metadata) appearing in the source control panel as untracked or modified.

### Branch picker

Always shows the full view with search, branch list, and inline branch creation — no more switching between a compact dropdown and the full picker depending on context.

---

## Visual Consistency

Unified color system across light and dark themes. Every surface, border, control, and status indicator draws from the same color definitions.

---

## Skills Marketplace

Browse and install community-built skills directly inside Orbit. Search with instant results, scope skills to a single project or globally, and check what's already installed. Trending and top-skills views for discovery.

---

## File Viewer

Image files now preview inline with support for common formats. SVGs show the rendered image by default with a toggle to view source.

---

## Welcome Page

Redesigned landing screen with a new visual treatment.

---

## Embedded Browser

Better handling of large pages, screenshot saving to files, and improved reliability under slow network conditions.

---

## Bug Fixes

- **Cursor click pulse** — Click animation no longer jumps to the top-left corner.
- **Sidebar text selection** — Dragging in the sidebar no longer selects text.
- **Welcome page flash** — Removed duplicate loading flash.
- **Message send animation** — Send animation no longer replays unexpectedly.
- **Toast exit stutter** — Fixed notification exit animation stutter.
