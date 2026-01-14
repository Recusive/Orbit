# Orbit Tech Stack

> **Last Updated:** January 2026
> **Purpose:** Comprehensive documentation of all technologies used in the Orbit codebase

---

## Overview

Orbit is a modern AI-powered code editor built with a hybrid architecture:

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Rust + Tauri 2
- **AI Sidecar:** Bun + Claude Agent SDK
- **Package Manager:** Bun (monorepo workspaces)

```
┌─────────────────────────────────────────────────────────────┐
│                     Orbit Desktop App                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Frontend (React 19 + TypeScript + Vite)            │    │
│  │  - Agent App (chat UI)                              │    │
│  │  - Canvas App (design tool)                         │    │
│  │  - Editor App (code editing)                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │ IPC                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Backend (Rust + Tauri 2)                           │    │
│  │  - File system, terminal, git, LSP, search          │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │ Sidecar                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  AI Bridge (Bun + Claude Agent SDK)                 │    │
│  │  - Claude API, MCP protocol                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Architecture

| Layer                 | Technology | Version             |
| --------------------- | ---------- | ------------------- |
| **Desktop Framework** | Tauri 2    | 2.9.x               |
| **Frontend Runtime**  | React      | 19.2.3              |
| **Backend Runtime**   | Rust       | 1.85 (Edition 2021) |
| **Package Manager**   | Bun        | 1.3.5+              |
| **Build Tool**        | Vite       | 7.3.1               |

---

## Frontend Stack

### Core Framework

| Technology     | Version | Purpose                        |
| -------------- | ------- | ------------------------------ |
| **React**      | 19.2.3  | UI framework with new compiler |
| **TypeScript** | 5.9.3   | Static type checking           |
| **Vite**       | 7.3.1   | Build tool & dev server        |

### Styling

| Technology              | Version | Purpose                     |
| ----------------------- | ------- | --------------------------- |
| **Tailwind CSS**        | 4.1.18  | Utility-first CSS framework |
| **@tailwindcss/vite**   | 4.1.18  | Vite integration            |
| **tailwind-merge**      | 3.4.0   | Intelligent class merging   |
| **tailwindcss-animate** | 1.0.7   | Animation utilities         |
| **tw-animate-css**      | 1.4.0   | CSS animations              |

### UI Components (Radix UI Primitives)

| Package                           | Version | Component            |
| --------------------------------- | ------- | -------------------- |
| **@radix-ui/react-dialog**        | 1.1.15  | Modal dialogs        |
| **@radix-ui/react-dropdown-menu** | 2.1.16  | Dropdown menus       |
| **@radix-ui/react-popover**       | 1.1.15  | Popovers             |
| **@radix-ui/react-tooltip**       | 1.2.8   | Tooltips             |
| **@radix-ui/react-tabs**          | 1.1.13  | Tab navigation       |
| **@radix-ui/react-select**        | 2.2.6   | Select dropdowns     |
| **@radix-ui/react-switch**        | 1.2.6   | Toggle switches      |
| **@radix-ui/react-scroll-area**   | 1.2.10  | Custom scrollbars    |
| **@radix-ui/react-collapsible**   | 1.1.12  | Collapsible sections |
| **@radix-ui/react-context-menu**  | 2.2.16  | Right-click menus    |
| **@radix-ui/react-hover-card**    | 1.1.15  | Hover cards          |
| **@radix-ui/react-separator**     | 1.1.8   | Visual separators    |
| **@radix-ui/react-slot**          | 1.2.4   | Slot composition     |
| **@radix-ui/react-icons**         | 1.3.2   | Icon set             |

### Additional UI Libraries

| Technology                   | Version | Purpose                 |
| ---------------------------- | ------- | ----------------------- |
| **Lucide React**             | 0.562.0 | Primary icon library    |
| **@lucide/lab**              | 0.1.2   | Experimental icons      |
| **Central Icons React**      | 1.1.83  | Additional icons        |
| **cmdk**                     | 1.1.1   | Command palette (Cmd+K) |
| **class-variance-authority** | 0.7.1   | Component variants      |
| **clsx**                     | 2.1.1   | Classname utility       |
| **Framer Motion**            | 12.24.7 | Animations & gestures   |
| **sonner**                   | 2.0.7   | Toast notifications     |
| **allotment**                | 1.20.5  | Resizable split panes   |
| **next-themes**              | 0.4.6   | Dark/light mode         |

### State Management

| Technology  | Version | Purpose                  |
| ----------- | ------- | ------------------------ |
| **Zustand** | 5.0.9   | Lightweight global state |
| **Immer**   | 11.1.3  | Immutable state updates  |

### Code Editor (CodeMirror 6)

| Package                        | Version | Purpose               |
| ------------------------------ | ------- | --------------------- |
| **codemirror**                 | 6.0.2   | Core editor framework |
| **@codemirror/autocomplete**   | 6.20.0  | Autocompletion        |
| **@codemirror/commands**       | 6.10.1  | Editor commands       |
| **@codemirror/language**       | 6.12.1  | Language support      |
| **@codemirror/lint**           | 6.9.2   | Linting integration   |
| **@codemirror/search**         | 6.5.11  | Search & replace      |
| **@codemirror/state**          | 6.5.3   | Editor state          |
| **@codemirror/view**           | 6.39.9  | Editor view           |
| **@codemirror/theme-one-dark** | 6.1.3   | Dark theme            |
| **@lezer/highlight**           | 1.2.3   | Syntax highlighting   |

### Language Support (CodeMirror)

| Package                         | Version | Languages                        |
| ------------------------------- | ------- | -------------------------------- |
| **@codemirror/lang-javascript** | 6.2.4   | JavaScript, TypeScript, JSX, TSX |
| **@codemirror/lang-python**     | 6.2.1   | Python                           |
| **@codemirror/lang-rust**       | 6.0.2   | Rust                             |
| **@codemirror/lang-go**         | 6.0.1   | Go                               |
| **@codemirror/lang-html**       | 6.4.11  | HTML                             |
| **@codemirror/lang-css**        | 6.3.1   | CSS                              |
| **@codemirror/lang-json**       | 6.0.2   | JSON                             |
| **@codemirror/lang-markdown**   | 6.5.0   | Markdown                         |

### Syntax Highlighting (Chat)

| Technology | Version | Purpose                         |
| ---------- | ------- | ------------------------------- |
| **Shiki**  | 3.21.0  | Code block highlighting in chat |

### Markdown Rendering

| Technology           | Version | Purpose                                                |
| -------------------- | ------- | ------------------------------------------------------ |
| **react-markdown**   | 10.1.0  | Markdown to React                                      |
| **remark-gfm**       | 4.0.1   | GitHub Flavored Markdown                               |
| **rehype-highlight** | 7.0.2   | Code highlighting                                      |
| **streamdown**       | 2.0.1   | Streaming markdown parser (requires `unsafe-eval` CSP) |

### Terminal Emulation

| Technology                 | Version | Purpose                |
| -------------------------- | ------- | ---------------------- |
| **@xterm/xterm**           | 6.0.0   | Terminal emulator core |
| **@xterm/addon-fit**       | 0.11.0  | Auto-resize terminal   |
| **@xterm/addon-search**    | 0.16.0  | Search in terminal     |
| **@xterm/addon-web-links** | 0.12.0  | Clickable URLs         |

### Canvas / Design Tool

| Technology                       | Version | Purpose              |
| -------------------------------- | ------- | -------------------- |
| **@xyflow/react** (ReactFlow)    | 12.10.0 | Node-based canvas    |
| **@codesandbox/sandpack-react**  | 2.20.0  | Live code playground |
| **@codesandbox/sandpack-client** | 2.19.8  | Sandpack client API  |
| **Mermaid**                      | 11.12.2 | Diagram rendering    |

### Virtualization

| Technology                  | Version | Purpose                           |
| --------------------------- | ------- | --------------------------------- |
| **@tanstack/react-virtual** | 3.13.17 | Virtual scrolling for large lists |

### Validation

| Technology | Version | Purpose                   |
| ---------- | ------- | ------------------------- |
| **Zod**    | 4.3.5   | Runtime schema validation |

### Utilities

| Technology      | Version | Purpose                            |
| --------------- | ------- | ---------------------------------- |
| **DOMPurify**   | 3.3.1   | HTML sanitization (XSS prevention) |
| **react-icons** | 5.5.0   | Additional icon library            |

### AST Parsing

| Technology           | Version | Purpose                       |
| -------------------- | ------- | ----------------------------- |
| **@babel/parser**    | 7.28.5  | JavaScript/TypeScript parsing |
| **@babel/traverse**  | 7.28.5  | AST traversal                 |
| **@babel/generator** | 7.28.5  | Code generation from AST      |
| **@babel/types**     | 7.28.5  | AST type definitions          |

### Tauri Plugins (Frontend)

| Plugin                                   | Version | Purpose            |
| ---------------------------------------- | ------- | ------------------ |
| **@tauri-apps/api**                      | 2.9.1   | Core Tauri API     |
| **@tauri-apps/plugin-clipboard-manager** | 2.3.2   | Clipboard access   |
| **@tauri-apps/plugin-dialog**            | 2.4.2   | Native dialogs     |
| **@tauri-apps/plugin-fs**                | 2.4.4   | File system access |
| **@tauri-apps/plugin-shell**             | 2.3.3   | Shell commands     |

---

## Backend Stack (Rust)

### Framework

| Technology                         | Version | Purpose                                   |
| ---------------------------------- | ------- | ----------------------------------------- |
| **Tauri**                          | 2.9     | Desktop app framework                     |
| **tauri-build**                    | 2.5     | Build tooling                             |
| **tauri-plugin-log**               | 2.x     | Structured logging                        |
| **tauri-plugin-fs**                | 2.x     | File system permissions                   |
| **tauri-plugin-shell**             | 2.x     | Shell command execution                   |
| **tauri-plugin-dialog**            | 2.x     | Native file dialogs                       |
| **tauri-plugin-clipboard-manager** | 2.x     | System clipboard                          |
| **tauri-plugin-decorum**           | 1.1.1   | Window decorations (macOS traffic lights) |

### Async Runtime

| Technology      | Version    | Purpose                       |
| --------------- | ---------- | ----------------------------- |
| **Tokio**       | 1.x (full) | Async runtime                 |
| **futures**     | 0.3        | Async utilities & combinators |
| **async-trait** | 0.1        | Async trait support           |

### Serialization

| Technology     | Version | Purpose                 |
| -------------- | ------- | ----------------------- |
| **serde**      | 1.0     | Serialization framework |
| **serde_json** | 1.0     | JSON serialization      |

### Error Handling

| Technology    | Version | Purpose                    |
| ------------- | ------- | -------------------------- |
| **anyhow**    | 1.0     | Flexible error propagation |
| **thiserror** | 1.0     | Custom error types         |

### Logging & Tracing

| Technology             | Version | Purpose                    |
| ---------------------- | ------- | -------------------------- |
| **log**                | 0.4     | Logging facade             |
| **tracing**            | 0.1     | Structured diagnostics     |
| **tracing-subscriber** | 0.3     | Log formatting & filtering |

### Concurrency

| Technology            | Version | Purpose                 |
| --------------------- | ------- | ----------------------- |
| **parking_lot**       | 0.12    | Fast mutex/rwlock       |
| **crossbeam-channel** | 0.5     | Multi-producer channels |

### Collections

| Technology    | Version | Purpose                     |
| ------------- | ------- | --------------------------- |
| **hashbrown** | 0.15    | Fast hash maps (SwissTable) |
| **indexmap**  | 2.x     | Insertion-ordered hash maps |

### File System

| Technology  | Version | Purpose                       |
| ----------- | ------- | ----------------------------- |
| **notify**  | 8.x     | File system watching          |
| **walkdir** | 2.x     | Recursive directory traversal |
| **globset** | 0.4     | Glob pattern matching         |
| **dirs**    | 6.x     | Standard directory paths      |

### Terminal / PTY

| Technology       | Version | Purpose            |
| ---------------- | ------- | ------------------ |
| **portable-pty** | 0.9     | Cross-platform PTY |
| **sysinfo**      | 0.35    | System information |

### Git Integration

| Technology | Version | Purpose                           |
| ---------- | ------- | --------------------------------- |
| **git2**   | 0.20    | Git operations (libgit2 bindings) |
| **gix**    | 0.69    | Pure Rust git implementation      |

### Language Server Protocol

| Technology     | Version | Purpose               |
| -------------- | ------- | --------------------- |
| **tower-lsp**  | 0.20    | LSP server framework  |
| **lsp-types**  | 0.97    | LSP type definitions  |
| **tokio-util** | 0.7     | Codec utilities       |
| **bytes**      | 1.9     | Byte buffer utilities |

### Search

| Technology | Version | Purpose                   |
| ---------- | ------- | ------------------------- |
| **grep**   | 0.3     | ripgrep library           |
| **ignore** | 0.4     | Gitignore pattern parsing |

### HTTP Client

| Technology  | Version | Purpose                |
| ----------- | ------- | ---------------------- |
| **reqwest** | 0.12    | HTTP client with async |

### Cryptography

| Technology  | Version | Purpose             |
| ----------- | ------- | ------------------- |
| **aes-gcm** | 0.10    | AES-GCM encryption  |
| **sha2**    | 0.10    | SHA-256/512 hashing |
| **rand**    | 0.8     | Cryptographic RNG   |
| **base64**  | 0.22    | Base64 encoding     |

### Date/Time

| Technology | Version | Purpose                |
| ---------- | ------- | ---------------------- |
| **chrono** | 0.4     | Date and time handling |

### System Utilities

| Technology   | Version | Purpose                  |
| ------------ | ------- | ------------------------ |
| **whoami**   | 2.0.0   | Current user information |
| **hostname** | 0.4     | Machine hostname         |

---

## AI / Agent Bridge Stack

The agent-bridge is a **compiled Bun binary** that runs as a Tauri sidecar process.

| Technology                         | Version | Purpose                     |
| ---------------------------------- | ------- | --------------------------- |
| **Bun**                            | 1.3.5+  | Runtime & bundler           |
| **@anthropic-ai/claude-agent-sdk** | 0.1.76  | Claude Agent SDK            |
| **@anthropic-ai/claude-code**      | 2.0.76  | Claude Code CLI integration |
| **@anthropic-ai/sdk**              | 0.71.2  | Anthropic API client        |
| **@modelcontextprotocol/sdk**      | 1.25.2  | MCP protocol support        |
| **Zod**                            | 4.3.5   | Schema validation           |

---

## Dev Tools & Build

### Build Tools

| Technology                      | Version | Purpose            |
| ------------------------------- | ------- | ------------------ |
| **Vite**                        | 7.3.1   | Frontend bundler   |
| **@vitejs/plugin-react**        | 5.1.2   | React Fast Refresh |
| **babel-plugin-react-compiler** | 1.0.0   | React 19 Compiler  |
| **rollup-plugin-visualizer**    | 6.0.5   | Bundle analysis    |
| **@tauri-apps/cli**             | 2.9.6   | Tauri build CLI    |

### Type Definitions

| Package                       | Version | Purpose               |
| ----------------------------- | ------- | --------------------- |
| **@types/react**              | 19.2.7  | React types           |
| **@types/react-dom**          | 19.2.3  | React DOM types       |
| **@types/node**               | 22.19.3 | Node.js types         |
| **@types/bun**                | 1.3.5   | Bun runtime types     |
| **@types/babel\_\_generator** | 7.27.0  | Babel generator types |
| **@types/babel\_\_traverse**  | 7.28.0  | Babel traverse types  |

### Testing

| Technology     | Version    | Purpose                |
| -------------- | ---------- | ---------------------- |
| **Vitest**     | 4.0.16     | Unit testing framework |
| **@vitest/ui** | 4.0.16     | Test UI                |
| **Bun test**   | (built-in) | Agent-bridge testing   |
| **Cargo test** | (built-in) | Rust testing           |

---

## Monorepo Structure

```
orbit/
├── apps/
│   ├── agent/          # Main chat/AI app
│   ├── canvas/         # Design canvas app
│   ├── editor/         # Code editor app
│   └── common/         # Shared components
├── agent-bridge/       # AI sidecar (Bun)
├── packages/
│   └── shared-schemas/ # Zod schemas
├── crates/common/      # Rust libraries
│   ├── core/           # Core types
│   ├── fs/             # File system
│   ├── terminal/       # PTY management
│   ├── git/            # Git operations
│   ├── lsp/            # Language server
│   ├── search/         # ripgrep search
│   ├── settings/       # App settings
│   ├── conversations/  # Chat storage
│   ├── ai/             # AI integration
│   └── syntax/         # Syntax highlighting
└── src-tauri/          # Tauri app entry
```

---

## Version Requirements

| Component   | Minimum Version |
| ----------- | --------------- |
| **Node.js** | 22.x            |
| **Bun**     | 1.3.5           |
| **Rust**    | 1.85            |
| **macOS**   | 10.15+          |

---

## Package Manager Policy

> **IMPORTANT:** This project uses **Bun** exclusively.

```bash
# Correct
bun install
bun run dev
bun run build
bun test

# WRONG - Never use these
npm install    # NO
pnpm install   # NO
yarn install   # NO
```

---

## Summary

| Category                  | Count |
| ------------------------- | ----- |
| **Frontend Libraries**    | 45+   |
| **Rust Crates**           | 35+   |
| **AI/Agent Dependencies** | 4     |
| **Dev Tools**             | 15+   |
| **Total Dependencies**    | 100+  |
