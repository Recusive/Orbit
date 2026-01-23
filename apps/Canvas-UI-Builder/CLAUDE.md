# CLAUDE.md - Canvas UI Builder

> **Purpose:** Visual component customization tool for browsing, customizing, and exporting shadcn/ui components.

## Overview

Canvas UI Builder is a React app that provides a visual interface for working with shadcn/ui components. It runs within Orbit's Tauri shell and communicates with Rust backend commands for setup, downloads, and preview server management.

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Canvas UI Builder                                                   │
│  ┌─────────────┬───────────────────────────┬───────────────────────┐│
│  │ Left Sidebar│     Center Preview        │   Right Sidebar       ││
│  │             │                           │                       ││
│  │ Component   │  ┌─────────────────────┐  │   Inspector Panel     ││
│  │ Library     │  │                     │  │                       ││
│  │             │  │   Vite Preview      │  │   [Props Tab]         ││
│  │ [button]    │  │   (iframe)          │  │   variant: [default]  ││
│  │ [card]      │  │                     │  │   size: [md]          ││
│  │ [dialog]    │  │   Live component    │  │                       ││
│  │ [input]     │  │   rendering         │  │   [Styles Tab]        ││
│  │ ...         │  │                     │  │   fontSize: [14px]    ││
│  │             │  └─────────────────────┘  │   borderRadius: [6px] ││
│  │             │                           │                       ││
│  │             │   [Chat Input Area]       │                       ││
│  └─────────────┴───────────────────────────┴───────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## First-Run Setup Flow

On first launch, `CanvasSetupWizard` initializes the environment:

1. **Initialize directories** - Creates `~/.orbit/canvas/` structure
2. **Download components** - Fetches ~50 shadcn/ui components from registry
3. **Scaffold preview server** - Sets up Vite config for live preview
4. **Install dependencies** - Runs `bun install` in preview directory

## Project Structure

```text
apps/Canvas-UI-Builder/
├── src/
│   ├── CanvasApp.tsx           # Root component
│   ├── main.tsx                # Entry point (mounts CanvasApp)
│   ├── globals.css             # Imports agent's globals.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── CanvasRootLayout.tsx    # Main 3-column layout
│   │   │   ├── left-sidebar/           # Component browser sidebar
│   │   │   ├── right-sidebar/          # Inspector sidebar
│   │   │   ├── canvas-input/           # Chat input area
│   │   │   └── resize-handles/         # Panel resizers
│   │   │
│   │   ├── setup/
│   │   │   └── CanvasSetupWizard.tsx   # First-run setup wizard
│   │   │
│   │   ├── preview/
│   │   │   └── PreviewPanel.tsx        # Vite iframe preview
│   │   │
│   │   ├── inspector/
│   │   │   ├── InspectorPanel.tsx      # Tabbed inspector (Props/Styles)
│   │   │   ├── PropsEditor.tsx         # React props editor
│   │   │   └── PropertiesPanel.tsx     # CSS properties editor
│   │   │
│   │   ├── sidebar/
│   │   │   └── ComponentList.tsx       # Component browser list
│   │   │
│   │   ├── dialogs/
│   │   │   └── SaveComponentDialog.tsx # Save customized component
│   │   │
│   │   └── CanvasErrorBoundary.tsx     # Error handling
│   │
│   ├── hooks/
│   │   ├── use-canvas-setup.ts         # Setup state management
│   │   ├── use-preview-server.ts       # Vite server lifecycle
│   │   └── use-component-registry.ts   # Component list fetching
│   │
│   ├── stores/
│   │   ├── css-customization-store.ts  # CSS property overrides
│   │   └── design-tokens-store.ts      # Design token management
│   │
│   └── __tests__/
│       └── placeholder.test.ts
│
└── index.html                  # Vite entry HTML
```

## Key Components

### CanvasRootLayout

Main layout component that orchestrates:

- Setup state checking via `useCanvasSetup()`
- Preview server lifecycle via `usePreviewServer()`
- Component selection state
- Panel resizing

```typescript
// State flow
setupState: 'checking' → 'needs-setup' | 'ready' | 'error'
serverState: 'stopped' → 'starting' → 'running' | 'error'
```

### PreviewPanel

Embeds Vite preview server in an iframe with postMessage communication:

**Messages TO iframe:**

| Message Type            | Purpose                  |
| ----------------------- | ------------------------ |
| `preview:load`          | Load a component by name |
| `preview:update-styles` | Apply CSS overrides      |
| `preview:update-props`  | Update component props   |
| `preview:set-theme`     | Sync light/dark theme    |
| `preview:clear`         | Clear preview            |

**Messages FROM iframe:**

| Message Type     | Purpose                       |
| ---------------- | ----------------------------- |
| `preview:ready`  | Iframe initialized            |
| `preview:loaded` | Component loaded successfully |
| `preview:error`  | Error occurred                |

### InspectorPanel

Tabbed interface for editing selected component:

- **Props Tab** - Edit React component props (variant, size, disabled, etc.)
- **Styles Tab** - Edit CSS properties (colors, spacing, typography, etc.)

## Hooks

### useCanvasSetup

Checks if `~/.orbit/canvas` is properly initialized:

```typescript
const { state, orbitPath, componentCount, recheckSetup, error } = useCanvasSetup();

// States: 'checking' | 'needs-setup' | 'ready' | 'error'
```

Invokes Tauri command: `canvas_check_setup`

### usePreviewServer

Manages Vite preview server lifecycle:

```typescript
const { state, url, error, startServer, stopServer, restartServer } = usePreviewServer();

// States: 'stopped' | 'starting' | 'running' | 'error'
// URL: http://localhost:5199-5209 when running
```

Invokes Tauri commands:

- `canvas_preview_server_status`
- `canvas_start_preview_server`
- `canvas_stop_preview_server`
- `canvas_install_preview_deps`

### useComponentRegistry

Fetches available components from `~/.orbit/canvas`:

```typescript
const { uiComponents, customComponents, loading, error } = useComponentRegistry();
```

## Stores

### css-customization-store

Manages CSS property overrides for live preview:

```typescript
const { overrides, setProperty, resetProperty, resetAll } = useCSSCustomizationStore();

// CSS properties by category:
// - typography: fontSize, fontWeight, fontFamily, letterSpacing
// - colors: color, backgroundColor
// - spacing: padding, margin, gap
// - border: borderRadius, borderWidth, borderColor, borderStyle
// - effects: opacity, boxShadow
```

### design-tokens-store

Manages design tokens (planned for theming support).

## Rust Backend Commands

| Command                          | Purpose                                  |
| -------------------------------- | ---------------------------------------- |
| `canvas_check_setup`             | Check if ~/.orbit/canvas is initialized  |
| `canvas_initialize_directories`  | Create directory structure               |
| `canvas_download_all_components` | Download shadcn components from registry |
| `canvas_setup_preview_server`    | Scaffold Vite preview config             |
| `canvas_install_preview_deps`    | Run bun install in preview directory     |
| `canvas_start_preview_server`    | Start Vite dev server                    |
| `canvas_stop_preview_server`     | Stop the preview server                  |
| `canvas_preview_server_status`   | Check if preview server is running       |

## ~/.orbit/canvas Structure

```text
~/.orbit/canvas/
├── components/
│   └── ui/                     # Downloaded shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       └── ...
├── lib/
│   └── utils.ts                # cn() utility function
├── registry/
│   └── local.json              # Saved customized components
├── package.json                # Dependencies for preview
├── vite.config.ts              # Preview server config
└── preview/
    └── index.html              # Preview entry point
```

## CSS Architecture

**IMPORTANT:** Canvas imports ALL styles from the agent app:

```css
/* globals.css */
@import '../../agent/src/globals.css';
```

This ensures consistent theming across apps. **Never define color variables in Canvas globals.css** - they're inherited from agent.

## Development Notes

### This is a Workspace App

Canvas-UI-Builder is part of the Bun workspace defined in the root `package.json`. It shares dependencies with other apps and uses path aliases:

- `@canvas/*` → `apps/Canvas-UI-Builder/src/*`
- `@/components/*` → `apps/agent/src/components/*` (shared UI components)

### Preview Server Ports

The Vite preview server runs on ports 5199-5209. The port is dynamically assigned and returned in the `canvas_start_preview_server` response.

### Theme Sync

PreviewPanel watches for theme changes on the parent document using a MutationObserver and syncs to the iframe via postMessage.

### Error Boundaries

`CanvasErrorBoundary` wraps the main content to catch rendering errors and provide recovery options.

## Common Tasks

### Adding a new CSS property to the inspector

1. Add property definition to `CSS_PROPERTIES` array in `css-customization-store.ts`
2. Specify category, type, and constraints (min/max/options)
3. The property will automatically appear in the Styles tab

### Adding a new panel to the layout

1. Create component in `components/layout/`
2. Add to `CanvasRootLayout.tsx`
3. Add resize handle if needed
4. Store width in `ui-store` (shared with agent)

### Debugging preview communication

1. Open DevTools in both parent and preview iframe
2. Watch for `postMessage` calls with `preview:*` types
3. Check origin validation (must match localhost:51xx)

---

## Testing

Canvas UI Builder uses **Vitest** for frontend testing (shared config with agent app).

### Commands

```bash
# From monorepo root
bun test                    # Run all frontend tests
bun test --watch            # Watch mode

# Run canvas-specific tests
bun test apps/Canvas-UI-Builder/src/__tests__/
```

### Test File Location

```text
apps/Canvas-UI-Builder/src/__tests__/
├── placeholder.test.ts     # Initial test file
└── ...
```

### Writing Tests

```typescript
// Note: describe, it, expect, vi are globals via vitest/globals
// DO NOT import from 'vitest' - use globals

import { render, screen } from '@testing-library/react';

import { MyComponent } from '@canvas/components/my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Integration Tests

For testing Rust backend commands (setup, download, preview server), use Cargo tests:

```bash
# From project root
cargo test canvas
```
