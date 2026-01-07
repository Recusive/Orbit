# Orbit Canvas

A node-based design canvas for the Orbit IDE. Built with React, TypeScript, Vite, ReactFlow, and Tailwind CSS v4.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Development](#development)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Building & Deployment](#building--deployment)
- [Testing in Orbit](#testing-in-orbit)
- [CI/CD](#cicd)
- [Code Style & Linting](#code-style--linting)
- [VS Code Integration](#vs-code-integration)
- [Troubleshooting](#troubleshooting)

---

## Overview

Orbit Canvas is the design canvas webview for the Orbit IDE (a VS Code fork). It provides:

- **Node-based canvas** using ReactFlow (@xyflow/react)
- **Live code preview** with Sandpack integration
- **AI-powered design assistance** via Claude integration
- **Component library** with drag-and-drop
- **Code generation** from visual designs

The canvas runs as a webview inside Orbit and communicates via `postMessage`.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (standalone mode)
npm run dev

# Build and deploy to Orbit
npm run deploy
```

**Development URL**: http://localhost:5173

---

## Development

### Prerequisites

- **Node.js** v22+ (see `.nvmrc`)
- **npm** v10+
- **Orbit repository** cloned at `../Orbit` (sibling directory)

### Available Scripts

| Command                   | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `npm run dev`             | Start Vite dev server at localhost:5173         |
| `npm run build`           | TypeScript check + production build             |
| `npm run build:skip-lint` | Production build without type checking (faster) |
| `npm run preview`         | Preview production build locally                |
| `npm run typecheck`       | Run TypeScript compiler (no emit)               |
| `npm run lint`            | ESLint with zero warnings tolerance             |
| `npm run lint:fix`        | ESLint with auto-fix                            |
| `npm run check`           | Run typecheck + lint                            |
| `npm run ci`              | Full CI pipeline: typecheck + lint + build      |
| `npm run copy`            | Copy built files to Orbit media folder          |
| `npm run deploy`          | Build + copy (full deployment)                  |

### Standalone Development Mode

When running `npm run dev`, the canvas runs in standalone mode with:

- **Mock VS Code API** - Simulates postMessage communication
- **Dark mode by default** - Matches Orbit's theme
- **Hot module replacement** - Instant updates during development

This allows developing and testing the UI without running the full Orbit IDE.

---

## Project Structure

```
orbit-canvas/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       ├── ci.yml          # Main CI pipeline
│       ├── release.yml     # Release automation
│       └── dependabot-automerge.yml
├── .husky/                 # Git hooks (pre-commit)
├── src/
│   ├── components/         # React components
│   │   ├── chat/           # AI chat panel components
│   │   ├── ui/             # Reusable UI primitives
│   │   ├── *Panel.tsx      # Sidebar panels
│   │   ├── *Sidebar.tsx    # Left/Right sidebars
│   │   └── *.tsx           # Other components
│   ├── hooks/              # Custom React hooks
│   │   ├── useAgentChat.ts         # AI chat integration
│   │   ├── useCanvasActions.ts     # Canvas manipulation
│   │   ├── useCanvasPersistence.ts # Save/load state
│   │   ├── useCanvasShortcuts.ts   # Keyboard shortcuts
│   │   ├── useDesignTree.ts        # Design hierarchy
│   │   ├── useLayerManagement.ts   # Layer operations
│   │   ├── useOrbitMessaging.ts    # VS Code communication
│   │   └── ...
│   ├── lib/                # Utilities and helpers
│   │   ├── designTokens.ts         # Design system tokens
│   │   ├── codeGenerator.ts        # Generate code from designs
│   │   ├── componentLibrary.ts     # Component definitions
│   │   ├── htmlRenderer.ts         # Render designs to HTML
│   │   └── ...
│   ├── sandpack/           # Sandpack code preview
│   │   ├── SandpackNode.tsx        # Code preview node
│   │   ├── SandpackPreview.tsx     # Live preview component
│   │   └── sandpackConfig.ts       # Sandpack configuration
│   ├── types/              # TypeScript type definitions
│   ├── config/             # App configuration
│   ├── globals.css         # Global styles (Tailwind v4)
│   ├── main.tsx            # App entry point
│   └── CanvasApp.tsx       # Root component
├── dist/                   # Build output (gitignored)
│   └── canvas/
│       ├── canvas.js       # Bundled JavaScript
│       └── canvas.css      # Bundled CSS
├── index.html              # HTML entry point
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript configuration
├── eslint.config.ts        # ESLint configuration
├── package.json            # Dependencies and scripts
└── CLAUDE.md               # AI assistant instructions
```

---

## Architecture

### Technology Stack

| Technology                      | Purpose                       |
| ------------------------------- | ----------------------------- |
| **React 18**                    | UI framework                  |
| **TypeScript 5.7**              | Type safety                   |
| **Vite 6**                      | Build tool and dev server     |
| **@xyflow/react**               | Node-based canvas (ReactFlow) |
| **Tailwind CSS v4**             | Styling (CSS-first config)    |
| **Zustand**                     | Global state management       |
| **@radix-ui**                   | Accessible UI primitives      |
| **@codesandbox/sandpack-react** | Live code preview             |

### Component Hierarchy

```
CanvasApp
├── CanvasToolbar           # Top toolbar
├── DesignLeftSidebar       # Left panel (layers, components)
│   ├── LayerPanel
│   └── ComponentLibraryPanel
├── DesignCanvas            # Main ReactFlow canvas
│   ├── SandpackNode        # Code preview nodes
│   └── PageNode            # Page container nodes
├── RightSidebar            # Right panel (properties, code, preview)
│   ├── NodePropertiesPanel
│   ├── CodeOutputPanel
│   └── PreviewPanel
└── AgentChatPanel          # AI assistant panel
```

### State Management

- **Zustand** stores for global state (canvas, selection, etc.)
- **React hooks** for component-local state
- **ReactFlow** manages node/edge state internally

### Key Hooks

| Hook                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `useOrbitMessaging`    | Communication with Orbit IDE via postMessage |
| `useCanvasActions`     | Node manipulation (add, delete, move)        |
| `useDesignTree`        | Hierarchical design structure                |
| `useLayerManagement`   | Layer ordering and visibility                |
| `useAgentChat`         | AI chat integration                          |
| `useCanvasPersistence` | Save/load canvas state                       |

---

## Building & Deployment

### Build Output

The build creates two files in `dist/canvas/`:

- `canvas.js` - Single bundled JavaScript (IIFE format)
- `canvas.css` - Bundled CSS with Tailwind

**Build Configuration** (vite.config.ts):

- Single bundle (no code splitting) for webview compatibility
- IIFE format for global scope execution
- All assets inlined as base64
- CSS not split into chunks

### Deploy to Orbit

**One-liner:**

```bash
npm run deploy
```

**Manual steps:**

```bash
# 1. Build the canvas
npm run build

# 2. Copy to Orbit (assumes Orbit is at ../Orbit)
cp dist/canvas/canvas.js ../Orbit/src/orbit/media/canvas/canvas.js
cp dist/canvas/canvas.css ../Orbit/src/orbit/media/canvas/canvas.css
```

**Expected directory structure:**

```
Developer/Recursive/
├── orbit-canvas/     # This repository
└── Orbit/            # Orbit IDE repository
    └── src/orbit/media/canvas/
        ├── canvas.js   # ← Built files go here
        └── canvas.css
```

---

## Testing in Orbit

### Full Test Cycle

```bash
# 1. Build and deploy canvas
cd /path/to/orbit-canvas
npm run deploy

# 2. Run Orbit IDE
cd ../Orbit
./scripts/code.sh

# Or skip Orbit's prelaunch compilation (faster):
VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh
```

### Quick Iteration

For rapid development, you can:

1. **Make changes** in orbit-canvas
2. **Build and copy**: `npm run deploy`
3. **Reload the webview** in Orbit (Cmd+R in the webview, or reload window)

The canvas webview will reload with the new code without restarting Orbit.

### Debugging

1. Open Orbit IDE
2. **Help → Toggle Developer Tools**
3. Look for console logs prefixed with `[Canvas]`
4. Network tab shows postMessage communication

---

## CI/CD

### GitHub Actions Workflows

#### CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR to `main` and `develop`:

```yaml
Jobs (parallel):
├── typecheck    # TypeScript compilation check
├── lint         # ESLint with zero warnings
├── test         # Tests (if present)
└── build        # Production build

Final:
└── ci-passed    # Quality gate (all must pass)
```

#### Release Pipeline (`.github/workflows/release.yml`)

Triggered by version tags (`v*`) or manual dispatch:

1. Runs all CI checks
2. Creates production build
3. Packages as zip and tar.gz
4. Creates GitHub Release with assets

**To create a release:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

#### Dependabot Auto-merge

Automatically merges minor and patch dependency updates.

### Pre-commit Hooks

Husky runs on every commit:

1. **ESLint** with auto-fix
2. **TypeScript** type checking
3. **Prettier** formatting for JSON/YAML/MD

---

## Code Style & Linting

### TypeScript Configuration

**Maximum strictness** enabled in `tsconfig.json`:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitReturns": true,
  "exactOptionalPropertyTypes": true,
  "noPropertyAccessFromIndexSignature": true,
  "verbatimModuleSyntax": true
}
```

### ESLint Rules

Key rules enforced (see `eslint.config.ts`):

| Rule                            | Description                       |
| ------------------------------- | --------------------------------- |
| `no-explicit-any`               | No `any` type allowed             |
| `no-unsafe-*`                   | No unsafe type operations         |
| `explicit-function-return-type` | All functions need return types   |
| `consistent-type-imports`       | Use `import type` for types       |
| `strict-boolean-expressions`    | No implicit boolean coercion      |
| `switch-exhaustiveness-check`   | Handle all switch cases           |
| `no-non-null-assertion`         | No `!` assertions                 |
| `no-console`                    | Only `console.warn/error` allowed |
| `import-x/order`                | Sorted imports with newlines      |

### React Patterns

```typescript
// Always explicit return types
function MyComponent({ prop }: Props): React.JSX.Element {
  return <div>{prop}</div>;
}

// Use ternary for conditional rendering (not &&)
{condition ? <Component /> : null}

// Type imports separate
import type { Node, Edge } from '@xyflow/react';
```

### Tailwind CSS v4

Uses CSS-first configuration in `globals.css`:

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *, .vscode-dark *));

@theme inline {
  --color-background: var(--background);
  /* ... */
}
```

**Note**: VS Code may show warnings for `@custom-variant` and `@theme` - these are valid Tailwind v4 syntax. Install the Tailwind CSS IntelliSense extension.

---

## VS Code Integration

### Communication Protocol

The canvas communicates with Orbit via `postMessage`:

```typescript
// Canvas → Orbit
window.vscodeApi?.postMessage({
  type: 'canvas:nodeSelected',
  nodeId: '123',
  data: {
    /* node data */
  },
});

// Orbit → Canvas
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'orbit:init':
      // Initialize with session data
      break;
    case 'orbit:updateNode':
      // Update node from Orbit
      break;
  }
});
```

### Mock VS Code API

In standalone mode (`npm run dev`), a mock API is provided in `main.tsx`:

```typescript
// Simulates VS Code webview API
window.vscodeApi = {
  postMessage: (msg) => console.log('[Mock postMessage]', msg),
  getState: () => ({}),
  setState: (state) => state,
};
```

---

## Troubleshooting

### Common Issues

#### Build fails with type errors

```bash
# Check types separately
npm run typecheck

# Fix auto-fixable issues
npm run lint:fix
```

#### ESLint warnings on CSS at-rules

Install the **Tailwind CSS IntelliSense** VS Code extension, or add to `.vscode/settings.json`:

```json
{
  "css.lint.unknownAtRules": "ignore"
}
```

#### Changes not appearing in Orbit

1. Ensure you ran `npm run deploy`
2. Reload the Orbit window (Cmd+Shift+P → "Developer: Reload Window")
3. Check the correct files were copied to `../Orbit/src/orbit/media/canvas/`

#### Canvas blank in Orbit

1. Open Developer Tools in Orbit (Help → Toggle Developer Tools)
2. Check Console for JavaScript errors
3. Verify `canvas.js` and `canvas.css` exist in the media folder

#### Pre-commit hook failing

```bash
# Run the checks manually to see detailed errors
npm run check

# Skip hooks temporarily (not recommended)
git commit --no-verify -m "message"
```

### Getting Help

1. Check existing issues on GitHub
2. Review the `CLAUDE.md` file for AI assistant guidance
3. Run `npm run check` to validate your code before committing

---

## Contributing

1. Create a feature branch from `main`
2. Make changes following the code style guidelines
3. Run `npm run check` before committing
4. Push and create a PR
5. CI must pass before merging

---

## License

Private repository - Recursive Labs
