# CLAUDE.md

This file provides guidance to Claude Code when working with the Orbit Canvas codebase.

## Project Overview

Orbit Canvas is a React + TypeScript design canvas built with Vite, ReactFlow (@xyflow/react), and Tailwind CSS. It provides a node-based design interface for the Orbit IDE.

## Commands

```bash
# Development
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # TypeScript check + production build
npm run build:skip-lint  # Production build without checks (faster)
npm run preview          # Preview production build

# Quality checks
npm run typecheck        # TypeScript only (tsc --noEmit)
npm run lint             # ESLint with zero warnings tolerance
npm run lint:fix         # ESLint with auto-fix
npm run check            # typecheck + lint
npm run ci               # Full CI: typecheck + lint + build

# Deploy to Orbit
npm run copy             # Copy built files to Orbit media folder
npm run deploy           # Build + copy (full deployment)
```

## Architecture

### State Management

- **Zustand** for global state (`src/stores/`)
- React hooks for component-level state

### Core Libraries

- **@xyflow/react** (ReactFlow) - Node-based canvas
- **@radix-ui** - Accessible UI primitives
- **@codesandbox/sandpack-react** - Code playground integration
- **Tailwind CSS** - Styling

### Component Organization

- `src/components/` - React components (nodes, panels, toolbars)
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utilities and design tokens
- `src/types/` - TypeScript type definitions
- `src/config/` - Configuration files
- `src/sandpack/` - Sandpack integration

### VS Code Integration

The canvas communicates with the Orbit IDE via `postMessage`:

```typescript
// Send message to Orbit
window.vscodeApi?.postMessage({ type: 'canvas:event', data: {...} });

// Receive message from Orbit
window.addEventListener('message', (event) => {
  const message = event.data;
  // Handle message
});
```

In standalone dev mode, a mock VS Code API is provided.

## Code Style

### ESLint Rules (enforced)

- **No `any`** - All unsafe operations are errors
- **Explicit return types** on functions
- **Consistent type imports** - Use `import type { }` separately
- **Import order** - External → Internal → Types, alphabetized
- **No console.log** - Only `warn`/`error` allowed
- **Strict boolean expressions** - No implicit truthy checks
- **Exhaustive switches** - All cases must be handled

### React Patterns

- Functional components with explicit return types
- Memoization for performance (React.memo, useMemo, useCallback)
- Ternary for conditional rendering

## Deployment Workflow

1. **Development**: `npm run dev` - Test in browser at localhost:5173
2. **Build**: `npm run build` - Creates `dist/canvas/canvas.{js,css}`
3. **Copy**: `npm run copy` - Copies to `../Orbit/src/orbit/media/canvas/`
4. **Test in Orbit**: Run Orbit IDE to test integration

### One-liner

```bash
npm run deploy
```

Or manually:

```bash
cd /Users/no9labs/Developer/Recursive/orbit-canvas
npm run build
cp dist/canvas/canvas.js ../Orbit/src/orbit/media/canvas/canvas.js
cp dist/canvas/canvas.css ../Orbit/src/orbit/media/canvas/canvas.css
```

## Directory Structure

```
orbit-canvas/
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities, design tokens
│   ├── types/           # TypeScript definitions
│   ├── config/          # Configuration
│   ├── sandpack/        # Sandpack integration
│   ├── main.tsx         # Entry point
│   └── CanvasApp.tsx    # Root app component
├── index.html           # HTML entry
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript config
├── eslint.config.ts     # ESLint config
└── package.json         # Dependencies & scripts
```

## Important Notes

1. **Standalone Mode**: The dev server provides mock VS Code API for testing
2. **Build Output**: Single bundle (`canvas.js`, `canvas.css`) for webview
3. **No Tailwind Dynamic Classes**: Use inline styles for dynamic values
4. **Strict TypeScript**: Maximum strictness enabled
