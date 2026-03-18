# Orbit v0.0.6

March 2026

## New Features

**Multi-engine support.** Orbit now ships a second AI engine with support for 200+ models across 20+ providers — Anthropic, OpenAI, Google, AWS Bedrock, Azure, Groq, Mistral, xAI, Cohere, Perplexity, DeepSeek, and more. Switch engines in Settings → Engine. Web search, semantic code search, custom skills, session sharing, subagent spawning, and a built-in permission system are available on the new engine. Both engines run as managed sidecar processes with automatic port selection and health checks.

**Skills Marketplace.** Browse and install community-built skills directly inside Orbit. Search, filter, scope skills to a project or globally, and see what's already installed.

**Subagents.** The agent can spawn parallel sub-tasks that run independently and report back. Each task appears inline with its status and collapsible output.

**Settings redesign.** Settings moved from a modal to a full inline page with grouped navigation — Engine, General, Appearance, Agent, Providers, Subagents, Commands, Shortcuts, Browser, Editor, Git, Notifications, and Tabs.

**Slash commands.** Commands are syntax-highlighted inline as you type. The command menu filters as you type, replacing the previous popover.

**Image attachments.** Attach images to messages for vision-capable models. Automatically disabled with a tooltip when the active model doesn't support vision.

**Git diff stats.** The top bar shows a live count of lines added and removed on the current branch. Click to jump to source control.

**Branch picker.** Always shows the full view with search, branch list, and inline creation — no more context-dependent switching between compact and full modes.

**Word-by-word streaming.** Responses stream incrementally instead of arriving in blocks. Remaining tokens drain quickly on completion.

**`/compact` status.** Compacting context now shows a live indicator with progress and an updated token count on completion.

**Thinking persistence.** Thinking blocks persist across loads with accurate durations, correctly interleaved with tool calls.

**Session restore.** Switching conversations is faster. Sessions pre-warm in the background with a skeleton loading state.

**Instant titles.** Conversation titles generate immediately on first message. Automatic cleanup of stray quotes, prefixes, and truncation artifacts.

**App icon picker.** Choose your Dock icon from Settings → Appearance. Four styles with light/dark variants. Follows system theme, no restart required.

**File previews.** Image files preview inline. SVGs render by default with a toggle to view source.

**Tool card redesign.** Plain-language headers ("Reading", "Edited", "Ran", "Searching"), collapsible code search results, and paginated question prompts with keyboard navigation.

**Visual refresh.** Unified color system across light and dark themes. Frosted glass notifications. Blur-reveal transitions in the sidebar and top bar.

## Bug Fixes

- Fixed ignored files (build artifacts, IDE metadata) appearing in source control as untracked or modified
- Saving a provider API key now immediately updates connected status
- Fixed browser panel dialog coordination with other overlays
- Fixed content security policy blocking the new engine in production builds

## Internal

- Migrated chat input to Lexical editor framework
- Upstream engine sync to v1.2.26
- Published `@orbit.build/sdk` and `@orbit.build/plugin` to npm
- Strict typing cleanup — removed lint suppressions, replaced `#[allow]` with `#[expect]`, eliminated unsafe casts

## Upcoming

**Orbit CLI.** Terminal-native AI coding agent. 200+ models across 20+ providers, 30+ built-in tools, MCP support, custom skills, and a plugin system. Ships as a single binary. Sessions persist in SQLite with branching, export, and file revert. Granular permission system for tool approval. Run `orbit serve` to start a headless API server that any frontend can connect to.

**Orbit Terminal.** A native macOS terminal application purpose-built for AI coding. Written in Zig, rendering directly to Metal. Ships as a dedicated app wrapping the same agent as the CLI, with native sidebars for sessions, file trees, and syntax-highlighted diffs. Connects to the Orbit agent over the same HTTP + SSE protocol as the Editor.
