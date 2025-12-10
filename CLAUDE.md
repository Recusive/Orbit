# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orbit Agent UI is a React 19 + TypeScript frontend for an AI coding assistant, built with Vite and Tailwind CSS v4. The UI provides a multi-panel IDE-like interface with chat, terminal, file browser, and code review capabilities.

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

- `use-chat`, `use-agent`, `use-terminal` - Domain-specific state/effects
- `use-keyboard-shortcuts` - Global hotkeys
- `use-vscode` - VS Code extension messaging (postMessage API)

## Code Style

### ESLint Rules (enforced)

- **No `any`** - All unsafe operations are errors
- **Explicit return types** on functions
- **Consistent type imports** - Use `import type { }` separately
- **Import order** - External → Internal → Types, alphabetized
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

## CI/CD

See `docs/CI-CD-GUIDE.md` for full details.

- **CI**: Parallel jobs for typecheck, lint, test, build on push/PR to main/develop
- **Dependabot**: Weekly updates, auto-merge for minor/patch
- **Release**: Tag `v*` triggers GitHub Release with build artifacts

```bash
# Run CI locally before pushing
npm run ci

# Create a release
git tag v1.0.0 && git push --tags
```
