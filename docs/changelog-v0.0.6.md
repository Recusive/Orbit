# Orbit v0.0.6

_March 2026_

---

## Orbit CLI

Terminal-native AI coding agent. 200+ models across 20+ providers, 30+ built-in tools, MCP support, custom skills, and a plugin system. Ships as a single binary.

Sessions persist in SQLite with branching, export, and file revert. Granular permission system for tool approval. The same engine powers the Orbit Editor — run `orbit serve` to start a headless API server that any frontend can connect to.

---

## Orbit Terminal _(in progress)_

A native macOS terminal application purpose-built for AI coding. Same agent as the CLI, wrapped in a dedicated app with GPU-accelerated rendering and native sidebars.

The terminal core is written in Zig — a memory-safe systems language that catches leaks at compile time and eliminates undefined behavior. On macOS, it renders directly to Metal, making it one of the few terminals that use the GPU for all text drawing including ligatures. Most terminals fall back to CPU rendering for ligatures; Orbit Terminal keeps everything on the GPU.

Performance is measurable. Plain text throughput is roughly 4x faster than iTerm and 2x faster than Terminal.app, competitive with the fastest terminals available. A dedicated IO thread handles terminal data with minimal jitter, and frame timing is optimized for rapid output — large file reads and verbose build logs render without dropping frames.

The terminal emulator is one of the most standards-compliant available. Full ECMA-48 implementation, validated against a comprehensive xterm conformance suite. Full Unicode support with grapheme cluster handling, CJK input method support, and the Kitty keyboard protocol for rich key reporting. SGR mouse protocol enables full mouse interaction in the TUI.

The core ships as a C-compatible library that the macOS app wraps with native SwiftUI. Left sidebar shows sessions and a file tree. Right sidebar shows file previews with syntax highlighting and diffs. The center panel is the terminal running the Orbit agent. Everything communicates over a local HTTP + SSE connection — the same protocol the Orbit Editor uses.

Ships in a later release.

---

## New Engine

Orbit ships a second AI engine — a full coding agent backend with support for 200+ models across 20+ providers. Anthropic, OpenAI, Google, AWS Bedrock, Azure, Groq, Mistral, xAI, Cohere, Perplexity, TogetherAI, DeepSeek, and more. Switch engines in Settings → Engine. Everything works the same — chat, sidebar, tools, history — regardless of which engine is active.

The new engine also brings capabilities the Claude backend doesn't have: web search, semantic code search, custom skills, session sharing, subagent task spawning, and a built-in permission system. When tools need approval, a prompt appears inline in chat with options to allow or deny. Models are searchable and filterable in the provider dialog, with connected providers sorted to the top.

Both engines run as managed sidecar processes — Orbit picks an available port, spawns the server, health-checks it, and keeps it alive for the session. No manual configuration.

---

## Settings

Settings moved from a modal dialog to a full inline page with grouped navigation — Engine, General, Appearance, Agent, Providers, Subagents, Commands, Shortcuts, Browser, Editor, Git, Notifications, and Tabs. Breadcrumb in the top bar, back arrow to return to chat.

Provider settings show loading states, inline errors, and success confirmations. API key changes take effect immediately without refreshing.

---

## App Icon Picker

Choose your Dock icon from Settings → Appearance. Four icon styles with light and dark variants. Updates instantly without restart and follows system theme.

---

## Chat

### Subagents

The agent can spawn parallel sub-tasks that run independently and report back. Each task appears inline in chat with its description, type, status, and collapsible output.

### Slash commands

Slash commands are syntax-highlighted as you type — they appear in blue, distinct from regular text. The command menu is an inline panel that filters as you type, replacing the previous popover.

### Image attachments

Attach images to messages for models that support vision. The attachment button disables automatically with a tooltip when the active model can't process images. Switching to a non-vision model clears any pending attachments.

### `/compact`

Compacting conversation context shows a live status indicator — animated dots while running, a confirmation when done, and an updated token count.

### Word-by-word streaming

Responses stream in word by word instead of arriving in full blocks. Remaining words drain quickly when the response completes. Frame-batched rendering keeps streaming smooth even on long responses.

### Thinking

Thinking blocks persist across reloads with accurate durations, interleaved with tool calls in the correct order. In multi-phase responses, thinking content always streams before the response text — later thinking blocks stay hidden until the content catches up.

### Instant conversation titles

Titles generate immediately on the first message with a shimmer placeholder in the sidebar. Titles are cleaned up automatically — no stray quotes, prefixes, or mid-word truncation.

### Session restore

Switching between conversations is faster. Sessions pre-warm in the background and show a skeleton while loading, eliminating the input flash during restore.

---

## Tool Widgets

Tool cards use plain language headers — "Reading", "Edited", "Ran", "Searching" — with larger text. Thinking indicator replaced with a quiet shimmer.

Code search results render in their own collapsible panel showing the query, a progress spinner, and formatted results.

The agent's question prompts show as a paginated overlay — one question at a time with numbered choices, multi-select support, and keyboard navigation. Both engines use the same visual treatment.

Message actions simplified to copy, report, and rewind. Failed tool calls show a small error icon next to the name instead of a red border around the card.

---

## Git

### Diff stats

The top bar shows a live count of lines added and removed on the current branch — green for additions, red for deletions. Click to jump to the source control panel.

### Source control accuracy

Fixed ignored files (build artifacts, IDE metadata) appearing in the source control panel as untracked or modified.

### Branch picker

Always shows the full view with search, branch list, and inline branch creation — no more switching between a compact dropdown and the full picker depending on context.

---

## Visual Polish

Unified color system across light and dark themes. Every surface, border, control, and status indicator draws from the same color definitions.

Notifications use a frosted glass treatment — semi-transparent with a backdrop blur that shows through to the content behind them.

Sidebar sections and the top bar use blur-reveal transitions when switching views — text fades in from blurred to sharp with a staggered character animation. The Workspaces header is pinned above the conversation scroll area so it's always reachable.

---

## Skills Marketplace

Browse and install community-built skills directly inside Orbit. Search with instant results, scope skills to a single project or globally, and check what's already installed. Trending and top-skills views for discovery.

---

## File Viewer

Image files now preview inline with support for common formats. SVGs show the rendered image by default with a toggle to view source.

---

## Welcome Page

Redesigned landing screen with an animated ASCII dither background and a sequenced logo entrance — spin, slide, and staggered text reveal. Animation style is configurable in Appearance settings.

---

## Embedded Browser

Better element selection, screenshot saving to workspace files, and improved reliability under slow network conditions. Large DOM snapshots are truncated to prevent memory issues.

---

## Bug Fixes

- **Cursor click pulse** — Click animation no longer jumps to the top-left corner.
- **Sidebar text selection** — Dragging in the sidebar no longer selects text.
- **Welcome page flash** — Removed duplicate loading flash.
- **Message send animation** — Send animation no longer replays unexpectedly.
- **Toast exit stutter** — Fixed notification exit animation stutter.
- **Provider API keys** — Saving an API key now immediately updates the connected status.
- **TodoBar updates** — Task list updates in real-time during agent runs.
- **Browser overlay** — Fixed dialog coordination between the browser panel and other overlays.
- **CSP in production** — Fixed content security policy blocking the new engine in production builds.

---

## Internal

- Migrated chat input to Lexical editor framework
- Upstream engine sync to v1.2.26
- Published `@orbit.build/sdk` and `@orbit.build/plugin` to npm
