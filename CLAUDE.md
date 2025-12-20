# CLAUDE.md

This file provides guidance to Claude Code when working with the Snowflake codebase.

## Project Overview

Snowflake is a modern AI-powered code editor built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). It features a multi-panel IDE-like interface with chat, terminal, file browser, and code review capabilities.

**Key Technologies:**

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend:** Tauri 2 (Rust) - _to be implemented_
- **Editor:** CodeMirror 6 - _to be implemented_ (currently using Shiki for syntax highlighting)
- **Terminal:** xterm.js
- **State:** Zustand + Immer

## Commands

```bash
# Development
npm run dev              # Start dev server (Vite)
npm run build            # TypeScript check + production build
npm run preview          # Preview production build

# Quality checks
npm run typecheck        # TypeScript only (tsc --noEmit)
npm run lint             # ESLint with zero warnings tolerance
npm run lint:fix         # ESLint with auto-fix
npm run check            # typecheck + lint
npm run ci               # Full CI: typecheck + lint + build
```

## Architecture

### Frontend-Backend Communication

The frontend uses a `useTauri` hook (`src/hooks/use-tauri.ts`) for communication with the Tauri backend. Messages are validated with Zod schemas.

```typescript
// Send message to backend
const { postMessage } = useTauri();
postMessage({ type: 'message:send', session_id, content });

// Listen for backend messages
useTauri({
  onMessage: (message) => {
    if (message.type === 'agent:chunk') {
      // Handle streaming response
    }
  },
});
```

### State Management

- **Zustand with Immer** for all global state (`src/stores/`)
- Stores: `ui-store` (panels/layout), `chat-store` (conversations), `agent-store` (task execution), `terminal-store` (xterm sessions), `file-store` (file tree)
- UI dimensions and defaults centralized in `src/lib/constants.ts`

### Layout System

- `RootLayout` orchestrates all panels with CSS Grid
- Panels: `LeftSidebar` (collapsible), `CenterPanel` (chat + review split), `RightSidebar` (sessions), `BottomPanel` (terminal)
- Custom `ResizeHandle` component for panel resizing
- All layout dimensions use constants, applied via inline `style={{ }}` (not dynamic Tailwind classes)

### Component Organization

- `src/components/layout/` - Shell layout components
- `src/components/chat/` - Message feed, input, model selector
- `src/components/ui/` - Radix UI primitives (shadcn/ui pattern)
- `src/components/shared/` - Reusable utilities (timestamp, copy button)

### Type System

- Rich types in `src/types/` for domain models (agent, conversation, message, terminal, file, diff)
- Zod schemas colocated with types for runtime validation
- Strict TypeScript config with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

### Custom Hooks

- `use-tauri` - Tauri backend communication
- `use-chat`, `use-agent`, `use-terminal` - Domain-specific state/effects
- `use-keyboard-shortcuts` - Global hotkeys
- `use-chat-messages` - Chat message handling with streaming

## Code Style

### ESLint Rules (enforced)

- **No `any`** - All unsafe operations are errors
- **Explicit return types** on functions
- **Consistent type imports** - Use `import type { }` separately
- **Import order** - External -> Internal -> Types, alphabetized
- **No console.log** - Only `warn`/`error` allowed
- **Strict boolean expressions** - No implicit truthy checks
- **Exhaustive switches** - All cases must be handled

### Tailwind + Dynamic Styles

- **Never use dynamic Tailwind classes** like `` `w-[${value}px]` `` - Tailwind can't process them at build
- Use inline styles for dynamic dimensions: `style={{ width: CONTENT_WIDTH.inputBox }}`
- Static Tailwind classes work normally: `w-px`, `h-[32px]`, `max-w-3xl`

### React Patterns

- Functional components with explicit `FC` type
- Ternary for conditional rendering (ESLint enforced)
- Props interfaces marked `readonly`

## Protocol Types

All message types defined in `src/types/protocol.ts` with Zod schemas:

### Frontend -> Backend (WebviewMessage)

- `message:send` - Send chat message
- `file:read`, `file:write` - File operations
- `terminal:create`, `terminal:write` - Terminal operations

### Backend -> Frontend (ExtensionMessage)

- `agent:chunk`, `agent:complete` - AI responses
- `tool:start`, `tool:end` - Tool execution
- `file:content`, `file:tree:response` - File data
- `terminal:output`, `terminal:created` - Terminal data

## TODO: Tauri Backend Integration

The Tauri Rust backend needs to be implemented to handle:

- Claude AI integration
- File system operations
- Terminal PTY management
- Session persistence

## TODO: CodeMirror 6 Integration

Replace current Shiki-based syntax highlighting with CodeMirror 6 for:

- Full code editing capabilities
- Language server protocol support
- Better performance for large files
