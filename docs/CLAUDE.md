# docs/ — Documentation Index

Use this to find the right file. Read the file directly — no links needed.

## Folder Guide

| Folder                  | What's in it                        | When to look                     |
| ----------------------- | ----------------------------------- | -------------------------------- |
| `decisions/`            | ADRs, why we chose X over Y         | Understanding past trade-offs    |
| `architecture/`         | System design, technical decisions  | How something works internally   |
| `design/`               | UI/UX guidelines, visual systems    | Typography, icons, themes        |
| `development/`          | Build workflow, CI/CD, debugging    | Setup, builds, fixing issues     |
| `plans/`                | Feature proposals, refactor plans   | What's been planned or proposed  |
| `plans/tracked/todo/`   | Plans queued for implementation     | What needs to be built next      |
| `plans/tracked/done/`   | Completed plans                     | What's already been shipped      |
| `plans/others/<topic>/` | Uncategorized plans by topic        | Plans with unknown status        |
| `quality/`              | Linting, audits, health metrics     | Code standards, audit results    |
| `reference/`            | SDK docs, prompts, external guides  | API references, prompt templates |
| `specs/`                | Behavior specs, acceptance criteria | What "done" looks like           |
| `orbitweb/`             | Marketing site context              | Orbitweb-specific (read-only)    |

## decisions/ (5 files)

- `BROWSER-WINDOW-CORNER-RADIUS.md` — Why native CALayer rounding is needed for the embedded browser (CSS can't clip NSWindows)
- `CHAT-PANEL-MINIMUM-WIDTH.md` — Constant 400px chat floor via dynamic activity cap, sidebar auto-collapse, header overflow fade
- `SIDEBAR-ANIMATION-SINGLE-PROPERTY.md` — Why sidebar uses single margin-left slide instead of two-property transition (eliminates desync jank)
- `INSTANT-HOVER-SIDEBAR-LISTS.md` — Instant hover for all list items: removed backdrop-blur, bg transitions, and transition-all (Frequency Principle)
- `BLUR-REVEAL-SIDEBAR-TRANSITIONS.md` — Container-level blur reveal for sidebar view switches: skeleton hold timer, key-based remount, GPU compositing lesson

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

## plans/tracked/todo/ (10 entries)

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
- `kanban-ticket-board.md` — Kanban ticket board
- `worktree-default-orbit-location.md` — Worktree default Orbit location
- `terminal-app/` — Orbit Terminal: native macOS app (forked Ghostty + SwiftUI sidebars, auto-launches orbit CLI). Design spec + implementation plan.

## plans/tracked/done/ (20 entries)

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

## plans/others/ (58 files in 14 topic subfolders)

- `agent/` — Parallel agents, demo orchestrator, interrupted tool reload fix
- `architecture/` — Auto-update, multi-window, production readiness, Rust migration, xterm performance
- `auth/` — OAuth token recovery, stale token fix
- `browser/` — Screenshot file, agent integration, CSP transport, tools fix
- `canvas/` — Rust transform, style editing, design token explorer
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
