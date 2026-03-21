# Orbit Roadmap

> **Last Updated:** March 20, 2026
> **Status:** Active — Phase 1 in progress

---

## Vision

Three products, one Rust-native agent engine. Same agent, three shells.

```
                        ┌─── Orbit CLI        (ratatui)
Rust Agent Engine ──────┼─── Orbit Desktop     (Tauri + React)
(Codex fork)            └─── Orbit Terminal    (Ghostty + Swift)
```

**Core philosophy:** The agent IS the product, not the UI. The engine does the work — the UI is a window into it.

---

## Product Line

| Tier     | Product            | Stack                           | Status                              |
| -------- | ------------------ | ------------------------------- | ----------------------------------- |
| CLI      | **Orbit CLI**      | Rust + ratatui                  | Phase 1 (in progress)               |
| Desktop  | **Orbit Desktop**  | Tauri + React 19                | Frontend built, awaiting new engine |
| Terminal | **Orbit Terminal** | Ghostty (Swift/Zig) + Orbit CLI | Phase 4 (planned)                   |

---

## Engine Migration

**From:** OpenCode (TypeScript sidecar, unreliable, underfunded)
**To:** Codex fork (Rust native, well-funded upstream, reliable)

### Why Codex

- OpenAI ships reliable, well-tested CLI updates — inheriting that baseline
- Rust eliminates the sidecar IPC boundary — agent runs in-process
- Same language as Tauri backend — one language, one process, zero serialization overhead
- Codex ships with ratatui CLI — engine development = CLI testing for free
- Memory safe, type safe, native system access for building agent tools

### Provider Support (adding to Codex)

| Provider                 | Status           |
| ------------------------ | ---------------- |
| GPT (OpenAI)             | Already in Codex |
| Ollama                   | Already in Codex |
| Claude (Anthropic)       | Adding           |
| OpenRouter               | Adding           |
| GitHub Copilot (OAuth)   | Adding           |
| Claude Auth (OAuth)      | Adding           |
| Alibaba / Chinese models | Adding           |
| vLLM                     | Adding           |

---

## Phases

### Phase 1: Rust Engine — _current_

Clean up Codex fork. Add multi-provider support. Define the engine API boundary (trait interface) that all three products will call.

**Deliverables:**

- Codex repo cleaned up, compiling, tests passing
- Multi-provider abstraction (Claude, OpenRouter, Alibaba, GitHub Copilot OAuth, Claude auth, Ollama, vLLM)
- Engine API trait defined — `use orbit_engine` for CLI, Tauri commands for Desktop, unix socket for Terminal
- Tested through the CLI (ratatui comes free with Codex)

**Exit criteria:** CLI works reliably with 3+ providers. Engine API is stable.

### Phase 2: CLI Hardening

Stabilize the CLI as a standalone product. This is the test harness for the engine AND a shippable product.

**Deliverables:**

- Orbit CLI binary (`orbit`) published and usable
- All providers working end-to-end
- Hooks system (pre-hook, post-hook) — not in Codex or OpenCode, critical for workflow control
- Tool quality baseline (grep, file ops, git integration)

**Exit criteria:** CLI is reliable enough for daily driver use. Hooks work.

### Phase 3: Desktop Frontend Wiring

Connect the existing React/Tauri frontend to the new Rust engine. The frontend is built — this is plumbing.

**Deliverables:**

- Third backend adapter (alongside Claude and OpenCode adapters) in `apps/agent/src/types/backend/`
- Rust engine callable via Tauri commands (in-process, no sidecar)
- Message/tool event format mapped to existing `ExtensionMessage` protocol
- All existing UI features working against new engine (chat, sidebar, tools, rewind)
- OpenCode adapter kept as fallback during transition

**Exit criteria:** Desktop app works fully against Rust engine. OpenCode adapter can be deprecated.

### Phase 4: Terminal App

Native macOS terminal app. Ghostty fork + SwiftUI sidebars running Orbit CLI.

**Deliverables:**

- Ghostty fork cleaned up as app shell
- libghostty (untouched) for GPU-accelerated Metal terminal rendering
- SwiftUI left sidebar: sessions list + file tree (tabbed, collapsible)
- SwiftUI right sidebar: file preview + diff view (collapsible)
- Center panel: libghostty running Orbit CLI natively
- IPC: unix domain socket between SwiftUI panels and Orbit CLI process
- macOS only for v1

**Exit criteria:** Terminal app feels indistinguishable from a web app. Full cursor/mouse support.

---

## Feature Roadmap (Post-Engine)

Features built once in the Rust engine, available across all three products.

### Agent Enhancement Layer

Tools and capabilities that make the agent perform better.

| Feature                       | Description                                                                                     | Priority |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| **Hooks system**              | Pre-hook / post-hook on every tool execution. Users define custom workflows as reliable as n8n. | P0       |
| **Better grep**               | Rust-native grep tool — faster, more accurate than current implementations                      | P0       |
| **Library docs on demand**    | Agent can pull library documentation contextually                                               | P1       |
| **Guided development**        | Steps and stages for structured feature development                                             | P1       |
| **Repo tree builder**         | Better repo structure understanding and visualization                                           | P1       |
| **Research tool**             | Deep research capability built into the agent                                                   | P1       |
| **Agentic loop**              | Agent iterates until spec sheet is met AND all tests pass — end-to-end task completion          | P1       |
| **Better browser connection** | Faster, more reliable browser automation actions                                                | P2       |
| **Agent logging system**      | Agent can add/read logs in apps for better debugging — not traditional logging, deeper          | P2       |

### Multi-Agent System

| Feature                       | Description                                                        | Priority |
| ----------------------------- | ------------------------------------------------------------------ | -------- |
| **Multi-agent orchestration** | Define and run multi-agent systems                                 | P1       |
| **Sub-agent access**          | Main agent dispatches to specialized sub-agents                    | P1       |
| **Linear-like ticket system** | Main agent creates tickets, sub-agents execute, main agent reviews | P2       |
| **Always-on gateways**        | Persistent reviewers that monitor agent logs and catch issues      | P2       |

### Shared Memory Layer

| Feature                       | Description                                                                   | Priority |
| ----------------------------- | ----------------------------------------------------------------------------- | -------- |
| **Indexed memory**            | Structured memory format with categories: learnings, lessons, ideas, patterns | P1       |
| **Sub-indexes**               | Nested categorization under each memory type                                  | P1       |
| **Cross-session persistence** | Memory shared across all three products                                       | P1       |

### App-Level Features

Features that differentiate Orbit as a platform, not just an agent wrapper.

| Feature                       | Description                                                                           | Priority |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------- |
| **NotebookLM-style RAG**      | Add sources (docs, Slack threads, design specs), create RAG stores, chat with context | P1       |
| **Visual design tool**        | Create visual designs within Orbit                                                    | P2       |
| **CI/CD pipeline management** | Manage pipelines from within Orbit                                                    | P2       |
| **Custom DevOps dashboard**   | Monitoring and management dashboard                                                   | P2       |
| **Mosaic testing**            | In-app stress tests — real actions, real state, no mocks (see `/mosaic`)              | P1       |

---

## Competitive Positioning

**Incumbents:** Claude Code (Anthropic), Codex CLI (OpenAI), Cursor, Windsurf

**Their advantage:** They make money from models AND tooling.
**Our play:** App-level monetization. The basic chat loop is commodity — the moat is in the workflow layer.

**Differentiation axis:**

1. **Multi-provider** — Use Claude for planning, GPT for code gen, local Ollama for privacy. One session, multiple models.
2. **Workflow control** — Hooks + multi-agent + ticket system. No other tool lets you build reliable automated workflows around the agent.
3. **Three shells** — CLI for terminal purists, Desktop for visual workers, Terminal app for the sweet spot. Same engine everywhere.
4. **Agent quality** — Better tools (Rust-native grep, research, library docs), better loops (spec verification, test-driven completion), better memory (indexed, structured, cross-session).

---

## Non-Goals

- Building our own LLM
- Mobile app (not for v1)
- Windows/Linux for Terminal app (macOS only for v1, Desktop covers cross-platform)
- Competing on model quality — we compete on agent quality and workflow

---

## Backend Migration Timeline

```
Current state:
  React (Tauri) ←→ [sidecar IPC] ←→ TypeScript (OpenCode) ←→ AI Providers

Target state:
  React (Tauri) ←→ [in-process]  ←→ Rust Engine (Codex fork) ←→ AI Providers
  ratatui CLI   ←→ [direct]      ←↗
  Ghostty+Swift ←→ [unix socket] ←↗
```

**Migration strategy:** Keep OpenCode backend adapter working as fallback. Add Codex as third adapter. Ship incrementally. Cut over when feature parity is confirmed.

---

## Success Metrics

| Metric                  | Target              | Why it matters                         |
| ----------------------- | ------------------- | -------------------------------------- |
| CLI daily active users  | 1,000               | Proves the engine works                |
| Task completion rate    | >85%                | Agent actually finishes what it starts |
| Multi-provider sessions | >30% of sessions    | Validates the multi-provider thesis    |
| Hook-based workflows    | >20% of power users | Validates the workflow thesis          |
| Desktop → CLI crossover | >40%                | Proves the three-shell strategy        |
