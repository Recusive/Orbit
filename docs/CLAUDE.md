# docs/ — Documentation Index

Use this to find the right file. Read the file directly — no links needed.

## Folder Guide

| Folder               | What's in it                        | When to look                     |
| -------------------- | ----------------------------------- | -------------------------------- |
| `decisions/`         | ADRs, why we chose X over Y         | Understanding past trade-offs    |
| `architecture/`      | System design, technical decisions  | How something works internally   |
| `design/`            | UI/UX guidelines, visual systems    | Typography, icons, themes        |
| `development/`       | Build workflow, CI/CD, debugging    | Setup, builds, fixing issues     |
| `plans/`             | Feature proposals, refactor plans   | What's been planned or proposed  |
| `plans/due/`         | Upcoming plans queued for work      | What needs to be built next      |
| `plans/implemented/` | Completed plans                     | What's already been shipped      |
| `quality/`           | Linting, audits, health metrics     | Code standards, audit results    |
| `reference/`         | SDK docs, prompts, external guides  | API references, prompt templates |
| `specs/`             | Behavior specs, acceptance criteria | What "done" looks like           |
| `orbitweb/`          | Marketing site context              | Orbitweb-specific (read-only)    |

## decisions/ (4 files)

- `BROWSER-WINDOW-CORNER-RADIUS.md` — Why native CALayer rounding is needed for the embedded browser (CSS can't clip NSWindows)
- `CHAT-PANEL-MINIMUM-WIDTH.md` — Constant 400px chat floor via dynamic activity cap, sidebar auto-collapse, header overflow fade
- `SIDEBAR-ANIMATION-SINGLE-PROPERTY.md` — Why sidebar uses single margin-left slide instead of two-property transition (eliminates desync jank)
- `INSTANT-HOVER-SIDEBAR-LISTS.md` — Instant hover for all list items: removed backdrop-blur, bg transitions, and transition-all (Frequency Principle)

## architecture/ (12 files)

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

## design/ (5 files)

- `TYPOGRAPHY.md` — Typography system (VS Code-like)
- `ICON-THEME-SYSTEM.md` — File and folder icon theme system
- `flash-prevention-guide.md` — Preventing UI flash on load
- `GEIST-SYSTEM.md` — Orbit color token architecture (Geist model: 10-step scales, semantic bands, Radix mapping)
- `COLOR-SYSTEM-REFACTOR.md` — File-by-file color refactor plan (patterns A-J, semantic tokens, verification)

## development/ (6 files)

- `DEVELOPMENT.md` — Development workflow and setup
- `RELEASE-GUIDE.md` — How to tag, build, and ship a new version (step-by-step)
- `TROUBLESHOOTING.md` — Common issues and solutions
- `CI-CD-GUIDE.md` — GitHub Actions CI/CD pipeline
- `DMG-BUILD-GUIDE.md` — Building macOS distributable
- `BUNDLING-TECHNICAL-NOTES.md` — Claude CLI bundling internals

## plans/due/ (8 files)

- `FIX-OAUTH-TOKEN-EXPIRY-RECOVERY.md` — OAuth token expiry recovery fix
- `OPTIMIZE-AGENT-FIRST-RESPONSE-LATENCY.md` — Agent first response latency optimization
- `PRODUCTION-PR-REVIEW-WORKFLOW.md` — Production PR review workflow (4-pass read-only review, host-side synthesis, apply via fork)
- `USER-PROFILE-SYSTEM-PLAN.md` — User profile system
- `agent-skills-validator-port.md` — Agent skills validator port
- `browser-enhancement-12-features.md` — Browser enhancement features
- `browser-navigate-verification-fix.md` — Browser navigate verification fix
- `browser-reload-url-bar-fix.md` — Browser reload URL bar fix
- `codebase-cleanup-stubs-lsp-breadcrumbs.md` — Codebase cleanup (stubs, LSP, breadcrumbs)
- `ios-runtime-backend-completion.md` — iOS runtime backend completion
- `worktree-default-orbit-location.md` — Worktree default Orbit location

## plans/implemented/ (6 files)

- `THINKING-DURATION-PERSISTENCE-PLAN.md` — Thinking duration persistence
- `fix-user-bubble-shift-after-send.md` — Fix user bubble sub-pixel shift after send animation
- `instant-title-generation.md` — Instant title generation
- `thinking-block-interleave-and-session-switch-fix.md` — Thinking block interleave and session switch fix
- `title-divergence-fix.md` — Title divergence fix
- `title-skeleton-loading.md` — Title skeleton loading state

## plans/ (19 files)

- `AUTO-UPDATE-PLAN.md` — Auto-update mechanism
- `CANVAS-RUST-TRANSFORM-PLAN.md` — Canvas Rust backend transformation
- `CANVAS-STYLE-EDITING-PLAN.md` — Canvas style editing system
- `DESIGN-TOKEN-EXPLORER-PLAN.md` — Design token explorer feature
- `FILE-STORE-REFACTOR-PLAN.md` — File store refactor
- `FUZZY-FILE-SEARCH-PLAN.md` — Fuzzy file search
- `JSONL-MIGRATION-PLAN.md` — JSONL conversation migration
- `LINEAR-FEEDBACK-PLAN.md` — Linear feedback integration
- `MARKDOWN-PREVIEW-PLAN.md` — Markdown preview panel
- `MULTI-WINDOW-PLAN.md` — Multi-window support
- `NAVIGATION-HISTORY-PLAN.md` — File navigation history
- `PARALLEL_AGENTS_PLAN.md` — Parallel agent execution
- `PIERRE-DIFFS-MIGRATION-PLAN.md` — Replace custom diff rendering with @pierre/diffs library
- `PRODUCTION-READINESS-PLAN.md` — Production readiness checklist
- `RUST-BACKEND-MIGRATION-PLAN.md` — Rust backend migration
- `SDK-SESSION-STORAGE-PLAN.md` — SDK session storage
- `TURN-BASED-CONVERSATION-PLAN.md` — Turn-based conversation model
- `VAULT-IMPLEMENTATION-PLAN.md` — Vault secure storage
- `background-chat-sessions.md` — Background chat sessions

## specs/ (1 file)

- `agent-browser-integration-spec.md` — Behavior spec for browser accessibility snapshot + ref system and iOS Simulator support (companion to `plans/agent-browser-integration.md`)

## quality/ (3 files)

- `LINTING-AND-QUALITY.md` — ESLint, Prettier, Clippy setup
- `AUDIT-REPORT-2026-01-07.md` — Pre-production code audit
- `codebase-health.json` — Automated health metrics

## reference/ (6 files)

- `Agent SDK reference - TypeScript.md` — Claude Agent SDK reference
- `CLAUDE-CODE-REWIND-SYSTEM.md` — Claude Code CLI rewind system (binary analysis, JSONL format, tree model, checkpointing)
- `codex-cli-guide.md` — OpenAI Codex CLI usage guide
- `PENCIL-CANVAS-ARCHITECTURE.md` — Pencil design editor architecture (dual-canvas rendering, scene graph, AI streaming generation via MCP)
- `System-Prompt.xml` — System prompt template
- `canvas-rebuild-prompt.md` — Canvas rebuild prompt context

## orbitweb/ (1 file)

- `ORBITWEB-CONTEXT.md` — Orbitweb project context (read-only)

## Conventions

- Guides: `UPPER-CASE.md` (e.g. `DEVELOPMENT.md`, `CSP-SECURITY.md`)
- Plans: `*-PLAN.md` in `plans/`
- Specs: `*-spec.md` in `specs/` (companion to plan with same base name)
- References: descriptive names matching upstream sources
- No loose files at docs root — everything goes in a category folder
