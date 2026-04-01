# docs/ — Documentation Index

Use this to find the right file. Read the file directly — no links needed.

## Folder Guide

| Folder                  | What's in it                         | When to look                     |
| ----------------------- | ------------------------------------ | -------------------------------- |
| `decisions/`            | ADRs, why we chose X over Y          | Understanding past trade-offs    |
| `architecture/`         | System design, technical decisions   | How something works internally   |
| `design/`               | UI/UX guidelines, visual systems     | Typography, icons, themes        |
| `development/`          | Build workflow, CI/CD, debugging     | Setup, builds, fixing issues     |
| `plans/`                | Feature proposals, refactor plans    | What's been planned or proposed  |
| `plans/tracked/todo/`   | Plans queued for implementation      | What needs to be built next      |
| `plans/tracked/done/`   | Completed plans                      | What's already been shipped      |
| `plans/others/<topic>/` | Uncategorized plans by topic         | Plans with unknown status        |
| `strategy/`             | Product roadmap, vision, positioning | Where the product is headed      |
| `quality/`              | Linting, audits, health metrics      | Code standards, audit results    |
| `reference/`            | SDK docs, prompts, external guides   | API references, prompt templates |
| `specs/`                | Behavior specs, acceptance criteria  | What "done" looks like           |
| `skills/`               | Agent skill creation and publishing  | Creating/publishing skills       |
| `changelog/`            | Release notes per version            | What shipped in each version     |
| `orbitweb/`             | Marketing site context               | Orbitweb-specific (read-only)    |

## decisions/ (6 files)

- `BROWSER-WINDOW-CORNER-RADIUS.md` — Why native CALayer rounding is needed for the embedded browser (CSS can't clip NSWindows)
- `CHAT-PANEL-MINIMUM-WIDTH.md` — Constant 400px chat floor via dynamic activity cap, sidebar auto-collapse, header overflow fade
- `SIDEBAR-ANIMATION-SINGLE-PROPERTY.md` — Why sidebar uses single margin-left slide instead of two-property transition (eliminates desync jank)
- `INSTANT-HOVER-SIDEBAR-LISTS.md` — Instant hover for all list items: removed backdrop-blur, bg transitions, and transition-all (Frequency Principle)
- `BLUR-REVEAL-SIDEBAR-TRANSITIONS.md` — Container-level blur reveal for sidebar view switches: skeleton hold timer, key-based remount, GPU compositing lesson
- `OVERFLOW-CLIP-VS-HIDDEN.md` — overflow-clip over overflow-hidden for layout containers: prevents scrollIntoView from shifting ContentCard
- `ACTIVITY-PANEL-CSS-MAXWIDTH-CLAMP.md` — CSS max-width with calc(100%) over JS clamping for activity panel overflow (4 failed JS attempts, WKWebView reflow/transition quirks)

## architecture/ (11 files)

- `AUTO-UPDATE.md` — Auto-update pipeline (Tauri updater, signing, CI, Orbit-Release public repo)
- `TECH-STACK.md` — Complete technology overview
- `EMBEDDED_BROWSER.md` — WebKit browser panel via Tauri multiwebview
- `CSP-SECURITY.md` — Content Security Policy and unsafe-eval
- `PROMOTION-120FPS.md` — 120Hz rendering in WKWebView via CADisplayLink
- `CHATSTORE-SESSION-LIFECYCLE.md` — ChatStore/UIStore session lifecycle, remap flow, sidebar sync bugs & fixes
- `PROCESS-PER-CHAT.md` — Process-per-chat session architecture
- `REWIND_SYSTEM_CONTRACT.md` — Conversation rewind system contract
- `REACT-19-ACTIVITY-OPTIMIZATION.md` — React 19 Activity API optimization
- `INSTANT-THEME-SWITCH.md` — Flash-free instant theme switching
- `LIQUID-GLASS.md` — Liquid glass visual effect system
- `tauri-plugins.md` — Tauri 2 plugins reference

## design/ (7 files)

- `APP-ICON-SYSTEM.md` — macOS app icon picker (runtime Dock icon swap via NSImage, theme-aware light/dark renditions, pure PNG approach)
- `TYPOGRAPHY.md` — Typography system (VS Code-like)
- `ICON-THEME-SYSTEM.md` — File and folder icon theme system
- `flash-prevention-guide.md` — Preventing UI flash on load
- `GEIST-SYSTEM.md` — Orbit color token architecture (Geist model: 10-step scales, semantic bands, Radix mapping)
- `COLOR-SYSTEM-REFACTOR.md` — File-by-file color refactor plan (patterns A-J, semantic tokens, verification)
- `DEAD-CSS-REMOVAL-PLAN.md` — Dead CSS removal plan

## development/ (6 files)

- `DEVELOPMENT.md` — Development workflow and setup
- `RELEASE-GUIDE.md` — How to tag, build, and ship a new version (step-by-step)
- `TROUBLESHOOTING.md` — Common issues and solutions
- `CI-CD-GUIDE.md` — GitHub Actions CI/CD pipeline
- `DMG-BUILD-GUIDE.md` — Building macOS distributable
- `BUNDLING-TECHNICAL-NOTES.md` — Claude CLI bundling internals

## Plan Tracking Policy

**After finishing a plan implementation:** Ask the user "Is this plan good to mark as done?" If confirmed (or if the user says it's done/shipped/complete), move the plan file to `plans/tracked/done/` and update this index. If no response, default to marking done after successful implementation.

## plans/tracked/todo/ (21 entries)

- `BULLETPROOF-REWIND-FORK-ERROR-HANDLING.md` — Bulletproof rewind fork error handling
- `FIX-OAUTH-TOKEN-EXPIRY-RECOVERY.md` — OAuth token expiry recovery fix
- `GHOSTTY-WEB-TERMINAL-MIGRATION.md` — Ghostty web terminal migration
- `IMAGE-ATTACHMENT-TILES.md` — Image attachment tiles
- `OOM-34K-UNTRACKED-FILES.md` — OOM fix for 34k untracked files
- `OPTIMIZE-AGENT-FIRST-RESPONSE-LATENCY.md` — Agent first response latency optimization
- `PIERRE-BG-COLOR-AND-LARGE-DIFF-PERF-FIX.md` — Pierre background color and large diff perf fix
- `PRODUCTION-PR-REVIEW-WORKFLOW.md` — Production PR review workflow (4-pass read-only review, host-side synthesis, apply via fork)
- `USER-PROFILE-SYSTEM-PLAN.md` — User profile system
- `agent-skills-validator-port.md` — Agent skills validator port
- `browser-atomic-setframe-fix.md` — Browser atomic setFrame fix
- `browser-enhancement-12-features.md` — Browser enhancement features
- `browser-native-nswindow-animation.md` — Browser native NSWindow animation
- `browser-navigate-verification-fix.md` — Browser navigate verification fix
- `browser-reload-url-bar-fix.md` — Browser reload URL bar fix
- `codebase-cleanup-stubs-lsp-breadcrumbs.md` — Codebase cleanup (stubs, LSP, breadcrumbs)
- `indexed-fluttering-lollipop.md` — Indexed fluttering lollipop
- `ios-runtime-backend-completion.md` — iOS runtime backend completion
- `kanban-ticket-board.md` — Kanban ticket board
- `worktree-default-orbit-location.md` — Worktree default Orbit location
- `TUI-CLI/ORBIT-TUI-RATATUI.md` — Orbit TUI (Ratatui): extract agent-bridge crate, port Codex TUI widgets, build CLI chat interface
- `AGENT-BRIDGE-HTTP-SSE-MIGRATION.md` — Replace stdin/stdout Rust proxy with HTTP+SSE direct frontend↔sidecar communication (5→2 serialization boundaries)
- `fix-activity-panel-overflow-on-sidebar-open.md` — Fix activity panel pushed off-screen when sidebar opens (reactive width clamp via useEffect)

## plans/tracked/done/ (49 entries)

- `virtualize-chat-react-virtuoso.md` — Virtualize chat with react-virtuoso (original plan, superseded by VirtuosoMessageList migration)
- `virtuoso-message-list-migration.md` — Migrate to VirtuosoMessageList: purpose-built chat virtualization with built-in auto-scroll, velocity wheel damping, WKWebView scroll fixes
- `DYNAMIC-CONTEXT-WINDOW.md` — Fix context window meter: hardcoded 200k defaults (Opus=1M), session-scoped context window from SDK modelUsage + system:init beta flag resolution
- `FIX-CONTEXT-METER-AND-DETAIL-DIALOG.md` — Fix context meter usage source: per-turn from assistant messages (not cumulative result), correct formula (input+cache, no output), context detail dialog with session metadata
- `remove-opencode-canvas-cleanup.md` — Remove Agent-backend, OpenCode engine, Canvas UI Builder. Orbit is now Claude-only. Preserved 5 OpenCode UI components in reference/.
- `SF-SYMBOL-ICON-FLASH-FIX.md` — Fix SF Symbol icon flash on welcome→workspace transition (two-tier cache for sync reads, module-level preload, stable layout wrapper, sync enforcement test)
- `ACTIONS-BAR-SLIDE-IN-DESYNC-FIX.md` — Fix actions bar slide-in desync (margin-slide wrapper in AppShell, mirrors sidebar pattern, synced with ContentCard transition)
- `INSTANT-DIFF-EXPANSION.md` — Instant diff card expansion with background preparation pipeline (batch Tauri IPC, yielded parseDiffFromFile, Pierre worker highlighting, content-size gating, PierreCapabilitiesContext)
- `PIERRE-WORKER-FIX-AND-LAZY-VIRTUALIZER.md` — Fix Pierre workers via Blob URL (?worker&inline for WKWebView) + lazy virtualizer demand ref-counting (IntersectionObserver only on large diff expand)
- `LARGE-DIFF-PERFORMANCE-VIRTUALIZATION.md` — Large diff performance virtualization (Pierre tiered rendering, diff scheduler, hover prefetch, pathological diff tab routing)
- `GLOBAL-NAVIGATION-HISTORY.md` — Global back/forward navigation history (browser-like history across all modes, Zustand subscriptions, dual-backend support, rich tab snapshots)
- `fix-works-then-stops-credential-deletion.md` — Fix shell env API key deletion by OAuth (protect `ANTHROPIC_API_KEY` from `startSession()` wipe when OAuth temporarily wins)
- `production-ready-credentials.md` — Production-ready credential system + startup health checks (connect Settings UI keys to agent-bridge, AES-256-GCM → sidecar flow)
- `file-based-changelog-system.md` — File-based changelog system (auto-discovery via import.meta.glob, hybrid bundled + remote notes, JSX renderer)
- `changelog-settings-page.md` — Changelog dialog → settings page (timeline layout, toast UX fix, sidebar "What's new" link)
- `lexical-chat-input-migration.md` — Migrate chat input from raw contentEditable + overlay to Lexical editor (fixes WebKit cursor bug, unifies text/decoration/cursor)
- `DUAL-BACKEND-AGENT-BRIDGE-OPENCODE.md` — Dual backend architecture (agent-bridge + OpenCode)
- `OC-TITLE-SKELETON-WIRING.md` — Wire OpenCode title generation into existing skeleton UI
- `SETTINGS-DIALOG-TO-PAGE.md` — Convert settings from dialog to inline page (vault pattern)
- `UNIFIED-OPENCODE-CHAT-UI.md` — Unify OpenCode chat UI into shared chat infrastructure
- `OPENCODE-MIGRATION-PLAN.md` — Replace agent-bridge with Agent-backend (opencode fork, HTTP + SSE, multi-provider)
- `TUI-FULL-BLEED-LAYOUT.md` — TUI full bleed layout
- `THINKING-DURATION-PERSISTENCE-PLAN.md` — Thinking duration persistence
- `fix-user-bubble-shift-after-send.md` — Fix user bubble sub-pixel shift after send animation
- `instant-title-generation.md` — Instant title generation
- `multi-icon-system/` — Multi-icon picker (design doc + implementation plan, shipped v0.0.6)
- `smooth-streaming-flowtoken-diff.md` — Smooth streaming flowtoken diff
- `thinking-block-interleave-and-session-switch-fix.md` — Thinking block interleave and session switch fix
- `title-divergence-fix.md` — Title divergence fix
- `title-skeleton-loading.md` — Title skeleton loading state
- `browser-overlay-dialog-fix.md` — Browser overlay dialog fix (overlay coordination + alpha transparency hide)
- `fix-opencode-todobar-realtime.md` — Fix OpenCode TodoBar not showing in real-time (updateToolInput action)
- `fix-todobar-flicker-consecutive-calls.md` — Fix TodoBar flicker on consecutive TodoWrite calls (payload-aware selection)
- `opencode-session-restore-speed.md` — OpenCode session restore speed (pre-warm, skip validate, skeleton on mount)
- `fix-provider-api-key-flow.md` — Fix provider API key → model selection end-to-end flow
- `fix-provider-cache-invalidation.md` — Fix provider not showing connected after API key save (backend cache invalidation)
- `rename-opencode-ai-to-orbit.md` — Rename @opencode-ai/_ packages to @orbit.build/_ (npm scope, imports, config migration)
- `slash-command-code-badges.md` — Slash command inline code badges (iterated through 5 audit rounds, superseded by overlay approach)
- `slash-command-chips.md` — Slash command context chips (abandoned — user wanted inline, not chips above input)
- `slash-command-syntax-highlighting.md` — Slash command syntax highlighting via text overlay (shipped)
- `wire-compact-opencode-backend.md` — Wire OpenCode /compact command into frontend (store infra, interception, SSE settlement)
- `fix-compact-rendering-and-tokens.md` — Fix /compact rendering (CompactIndicator instead of raw markdown) and token count (last-assistant snapshot)
- `fix-opencode-streaming-performance.md` — Fix OpenCode streaming performance (RAF delta batching, time-gated reveal, ThinkingBlock reuse)
- `fix-csp-opencode-backend.md` — Fix CSP blocking OpenCode backend in production builds (add `http://127.0.0.1:`\* to `connect-src`, contract test, CSP doc update)
- `unify-opencode-question-widget.md` — Unify OpenCode question tool to use shared QuestionPrompt presenter (shared visuals, backend-specific wrappers, multi-select + custom support)
- `fix-thinking-content-streaming-order.md` — Fix sequential thinking-before-content streaming (ordered frontier reveal, phase-aware content ceiling, multi-phase interleaving)
- `FIX-OPENCODE-IMAGE-ATTACHMENTS.md` — Fix image attachments not sent to OpenCode backend (wire ImageAttachment → FilePartInput through adapter layer, widen SDK overlay)
- `DISABLE-IMAGE-BUTTON-UNSUPPORTED-MODELS.md` — Disable image button when model doesn't support images (derive supportsImageInput from modalities/attachment, backend-gated UI, chip cleanup, send-time guard)
- `fix-base64-leak-image-dialog.md` — Fix base64 data leaking into DOM via image src attributes (SafeImage component converts data: URLs to opaque blob: URLs across all four rendering surfaces)
- `FIX-IMAGE-BUTTON-TYPE-MISMATCH.md` — Fix image button enabled for all models (schema-data divergence: migrate to capabilities-based model schema, make supportsImageInput required)
- `STRICT-TYPING-LINT-CLEANUP.md` — Strict typing and lint suppression cleanup (6-phase: config consolidation, Rust allow→expect, LSP audit, TS fixes, Agent-backend targeted, test standardization)
- `auth-method-picker.md` — Auth method picker for Claude backend (radio-card selector in Account Settings, Rust preference persistence, bootstrap respect)
- `react-grab-fix.md` — Fix React-grab element selection (sync handler returns true, deferred enrichment via separate URL scheme, textContent capture, epoch-based staleness)
- `element-chip-detail-dialog.md` — Element context chip click-to-inspect dialog (syntax-highlighted HTML, copy buttons, click-to-open file, keyboard accessible)

## plans/others/ (58 files in 14 topic subfolders)

- `agent/` — Parallel agents, demo orchestrator, interrupted tool reload fix
- `architecture/` — Auto-update, multi-window, production readiness, Rust migration, xterm performance
- `auth/` — OAuth token recovery, stale token fix
- `browser/` — Screenshot file, agent integration, CSP transport, tools fix
- `terminal-app/` — Archived Orbit Terminal plans (engine removed, product on hold)
- `diffs-and-code/` — Diff performance, diffcard expansion, image preview, line annotations, markdown preview, Pierre diffs
- `feedback/` — Linear feedback integration
- `file-system/` — File store refactor, fuzzy search, drag-drop, DS_Store, explorer fixes, git status dots
- `navigation/` — Navigation history, branch selector refactor
- `sessions/` — JSONL migration, SDK session storage, turn-based conversation, background sessions, parent overwrite fix, threading
- `skills-marketplace/` — Marketplace, skills dialog, slash command refresh, trending/top
- `ui-and-animations/` — Launch animation, sidebar scroll, spring spacer, turn anchor scroll, loader flickering, empty tool widget fix
- `vault/` — Implementation, bugfix, Milkdown Crepe, rebuild
- `worktree/` — Workspace switching, session sync, stale worktrees, deletion fix

## specs/ (1 file)

- `agent-browser-integration-spec.md` — Behavior spec for browser accessibility snapshot + ref system and iOS Simulator support (companion to `plans/agent-browser-integration.md`)

## quality/ (3 files)

- `LINTING-AND-QUALITY.md` — ESLint, Prettier, Clippy setup
- `AUDIT-REPORT-2026-01-07.md` — Pre-production code audit
- `codebase-health.json` — Automated health metrics

## reference/ (4 files)

- `Agent SDK reference - TypeScript.md` — Claude Agent SDK reference
- `CLAUDE-CODE-REWIND-SYSTEM.md` — Claude Code CLI rewind system (binary analysis, JSONL format, tree model, checkpointing)
- `codex-cli-guide.md` — OpenAI Codex CLI usage guide
- `PENCIL-CANVAS-ARCHITECTURE.md` — Pencil design editor architecture (dual-canvas rendering, scene graph, AI streaming generation via MCP)

## skills/ (3 files)

- `skill-guide.md` — Definitive guide to building agent skills (compiled from Anthropic's official guide, AgentSkills spec, and skills-ref library)
- `SKILLS-PUBLISHING-GUIDE.md` — How to create skills, publish to Recusive/Skills repo, CLI commands, skills.sh leaderboard mechanics, well-known endpoint hosting
- `PLUGIN-PUBLISHING-GUIDE.md` — How to create Claude Code plugins, package skills into plugins, plugin.json manifest, marketplace distribution, Orbit-plugin reference

## orbitweb/ (1 file)

- `ORBITWEB-CONTEXT.md` — Orbitweb project context (read-only)

## strategy/ (1 file)

- `ROADMAP.md` — Product roadmap, feature roadmap, competitive positioning

## Conventions

- Guides: `UPPER-CASE.md` (e.g. `DEVELOPMENT.md`, `CSP-SECURITY.md`)
- Plans: `*-PLAN.md` in `plans/`
- Specs: `*-spec.md` in `specs/` (companion to plan with same base name)
- References: descriptive names matching upstream sources
- No loose files at docs root — everything goes in a category folder
