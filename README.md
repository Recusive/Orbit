# Orbit Agent

A multi-panel IDE-like chat interface for the Orbit AI coding assistant. Built with React 19, TypeScript, Vite, and Tailwind CSS v4.

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

Orbit Agent is the chat panel webview for the Orbit IDE (a VS Code fork). It provides:

- **AI Chat Interface** with streaming responses and markdown rendering
- **Integrated Terminal** with xterm.js for shell interactions
- **File Explorer** with tree navigation and file preview
- **Browser Panel** for web browsing within the IDE
- **Tool Visualization** showing AI agent tool usage in real-time
- **Code Review** with diff viewing and accept/reject controls

The UI runs as a webview inside Orbit and communicates via `postMessage`.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (standalone mode)
npm run dev

# Build for production
npm run build
```

**Development URL**: http://localhost:5173

---

## Development

### Prerequisites

- **Node.js** v22+ (see `.nvmrc`)
- **npm** v10+
- **Orbit repository** cloned at `../Orbit` (sibling directory)

### Available Scripts

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start Vite dev server at localhost:5173    |
| `npm run build`     | TypeScript check + production build        |
| `npm run preview`   | Preview production build locally           |
| `npm run typecheck` | Run TypeScript compiler (no emit)          |
| `npm run lint`      | ESLint with zero warnings tolerance        |
| `npm run lint:fix`  | ESLint with auto-fix                       |
| `npm run check`     | Run typecheck + lint                       |
| `npm run ci`        | Full CI pipeline: typecheck + lint + build |

### Standalone Development Mode

When running `npm run dev`, the agent runs in standalone mode with:

- **Mock VS Code API** - Simulates postMessage communication
- **Mock streaming responses** - Simulates agent chunk/complete events
- **Dark mode by default** - Matches Orbit's theme
- **Hot module replacement** - Instant updates during development

This allows developing and testing the UI without running the full Orbit IDE.

---

## Project Structure

```
orbit-agent/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       ├── ci.yml          # Main CI pipeline
│       ├── release.yml     # Release automation
│       └── auto-merge.yml  # Dependabot auto-merge
├── .husky/                 # Git hooks (pre-commit)
├── src/
│   ├── components/         # React components
│   │   ├── activity/       # Activity panel tabs
│   │   ├── browser/        # Embedded browser controls
│   │   ├── chat/           # Message feed, bubbles, tools
│   │   ├── chat-input/     # Input box with model selector
│   │   ├── code/           # Code blocks with syntax highlighting
│   │   ├── files/          # File icons and tree items
│   │   ├── layout/         # Main layout components
│   │   ├── quick-open/     # Command palette (Cmd+K)
│   │   ├── settings/       # Settings panels
│   │   ├── shared/         # Reusable utilities
│   │   ├── sidebar/        # Sidebar components
│   │   ├── terminal/       # xterm.js terminal
│   │   └── ui/             # Radix UI primitives
│   ├── hooks/              # Custom React hooks
│   │   ├── use-agent.ts            # Agent state management
│   │   ├── use-browser.ts          # Browser panel messaging
│   │   ├── use-chat.ts             # Chat operations
│   │   ├── use-chat-messages.ts    # Message handling
│   │   ├── use-file-operations.ts  # File read/write
│   │   ├── use-keyboard-shortcuts.ts # Global hotkeys
│   │   ├── use-terminal.ts         # Terminal management
│   │   └── use-vscode.ts           # VS Code messaging
│   ├── stores/             # Zustand state stores
│   │   ├── agent-store.ts          # Agent execution state
│   │   ├── browser-store.ts        # Browser panel state
│   │   ├── chat-store.ts           # Conversations & messages
│   │   ├── file-store.ts           # File tree state
│   │   ├── file-viewer-store.ts    # File preview state
│   │   ├── queued-message-store.ts # Message queue
│   │   ├── terminal-store.ts       # Terminal sessions
│   │   ├── tool-store.ts           # Tool execution state
│   │   └── ui-store.ts             # Panel layout state
│   ├── types/              # TypeScript type definitions
│   ├── lib/                # Utilities and helpers
│   ├── services/           # Service modules
│   ├── providers/          # React context providers
│   ├── assets/             # Static assets (icons, logos)
│   ├── globals.css         # Global styles (Tailwind v4)
│   ├── main.tsx            # App entry point
│   └── App.tsx             # Root component
├── dist/                   # Build output (gitignored)
│   └── webview/
│       ├── index.js        # Bundled JavaScript
│       └── index.css       # Bundled CSS
├── docs/                   # Documentation
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

| Technology          | Purpose                    |
| ------------------- | -------------------------- |
| **React 19**        | UI framework               |
| **TypeScript 5.7**  | Type safety                |
| **Vite 7**          | Build tool and dev server  |
| **Tailwind CSS v4** | Styling (CSS-first config) |
| **Zustand + Immer** | Global state management    |
| **@radix-ui**       | Accessible UI primitives   |
| **@xterm/xterm**    | Terminal emulator          |
| **Monaco Editor**   | Code editing               |
| **Shiki**           | Syntax highlighting        |
| **react-markdown**  | Markdown rendering         |
| **Zod**             | Runtime type validation    |
| **framer-motion**   | Animations                 |

### Component Hierarchy

```
App
├── ThemeProvider               # Theme context
└── RootLayout                  # Main grid layout
    ├── Sidebar                 # Left sidebar (conversations, settings)
    ├── CenterPanel             # Main content area
    │   ├── ChatHeader          # Model selector, controls
    │   ├── MessageList         # Chat messages
    │   │   ├── UserMessage
    │   │   ├── AssistantMessage
    │   │   └── ToolMessage
    │   └── ChatInput           # Message input box
    ├── ActivityPanel           # Right panel (files, browser, terminal)
    │   ├── FileExplorer
    │   ├── BrowserPanel
    │   └── FileViewer
    └── BottomPanel             # Terminal panel
        └── Terminal
```

### State Management

| Store                  | Purpose                           |
| ---------------------- | --------------------------------- |
| `ui-store`             | Panel visibility, layout, tabs    |
| `chat-store`           | Conversations, messages           |
| `agent-store`          | Agent execution state             |
| `terminal-store`       | Terminal sessions, output         |
| `file-store`           | File tree, expanded folders       |
| `file-viewer-store`    | Open files, content cache         |
| `browser-store`        | Browser navigation state          |
| `tool-store`           | Active tool executions            |
| `queued-message-store` | Pending messages during execution |

### Key Hooks

| Hook                   | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `useVSCode`            | Communication with Orbit via postMessage |
| `useChat`              | Send messages, manage conversations      |
| `useChatMessages`      | Handle incoming agent messages           |
| `useAgent`             | Agent state (streaming, complete)        |
| `useTerminal`          | Terminal creation and management         |
| `useBrowser`           | Browser panel control                    |
| `useKeyboardShortcuts` | Global keyboard shortcuts                |

---

## Building & Deployment

### Build Output

The build creates two files in `dist/webview/`:

- `index.js` - Single bundled JavaScript (IIFE format)
- `index.css` - Bundled CSS with Tailwind

**Build Configuration** (vite.config.ts):

- Single bundle (no code splitting) for webview compatibility
- IIFE format for global scope execution
- All assets inlined as base64
- CSS not split into chunks

### Deploy to Orbit

**Manual steps:**

```bash
# 1. Build the webview
npm run build

# 2. Copy to Orbit (assumes Orbit is at ../Orbit)
cp dist/webview/index.js ../Orbit/src/orbit/media/webview/orbit.js
cp dist/webview/index.css ../Orbit/src/orbit/media/webview/orbit.css
```

**One-liner:**

```bash
npm run build && cp dist/webview/index.js ../Orbit/src/orbit/media/webview/orbit.js && cp dist/webview/index.css ../Orbit/src/orbit/media/webview/orbit.css
```

**Expected directory structure:**

```
Developer/Recursive/
├── orbit-agent/      # This repository
└── Orbit/            # Orbit IDE repository
    └── src/orbit/media/webview/
        ├── orbit.js    # ← Built files go here
        └── orbit.css
```

---

## Testing in Orbit

### Full Test Cycle

```bash
# 1. Build and deploy webview
cd /path/to/orbit-agent
npm run build
cp dist/webview/index.js ../Orbit/src/orbit/media/webview/orbit.js
cp dist/webview/index.css ../Orbit/src/orbit/media/webview/orbit.css

# 2. Run Orbit IDE
cd ../Orbit
./scripts/code.sh

# Or skip Orbit's prelaunch compilation (faster):
VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh
```

### Quick Iteration

For rapid development:

1. **Make changes** in orbit-agent
2. **Build and copy**: Run the one-liner above
3. **Reload the webview** in Orbit (Cmd+R in the webview, or reload window)

The webview will reload with the new code without restarting Orbit.

### Debugging

1. Open Orbit IDE
2. **Help → Toggle Developer Tools**
3. Look for console logs prefixed with `[Orbit]`
4. Network tab shows postMessage communication

---

## CI/CD

### GitHub Actions Workflows

#### CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR to `main`, `develop`, and `feat/pranit`:

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
import type { Message, Conversation } from '@/types';
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

**Important**: Never use dynamic Tailwind classes like `` `w-[${value}px]` ``. Use inline styles for dynamic values:

```typescript
// Correct
<div style={{ width: panelWidth }} />

// Wrong - Tailwind can't process at build time
<div className={`w-[${panelWidth}px]`} />
```

---

## VS Code Integration

### Communication Protocol

The webview communicates with Orbit via `postMessage`:

```typescript
// Webview → Orbit
postMessage({
  type: 'message:send',
  uuid: crypto.randomUUID(),
  session_id: sessionId,
  content: 'Hello, Claude!',
});

// Orbit → Webview
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'system:init':
      // Initialize session
      break;
    case 'agent:chunk':
      // Handle streaming response
      break;
    case 'agent:complete':
      // Handle completion
      break;
  }
});
```

### Message Types

**Webview → Orbit:**

- `message:send` - Send chat message
- `agent:stop` - Stop agent execution
- `file:open` - Open file in editor
- `file:read` - Request file content
- `terminal:create` - Create terminal
- `browser:navigate` - Navigate browser
- `conversation:create` - Create new conversation

**Orbit → Webview:**

- `system:init` - Initialize with session data
- `agent:chunk` - Streaming response chunk
- `agent:complete` - Agent finished
- `agent:error` - Agent error
- `tool:start` / `tool:end` - Tool execution events
- `terminal:data` - Terminal output
- `file:content` - File contents

### Mock VS Code API

In standalone mode (`npm run dev`), a mock API is provided in `use-vscode.ts`:

```typescript
// Simulates VS Code webview API
function handleMockMessage(message: WebviewMessage): void {
  switch (message.type) {
    case 'message:send':
      // Simulate streaming response
      setTimeout(() => postChunk('Received: ' + message.content), 1000);
      break;
    // ... other mocks
  }
}
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

1. Ensure you ran `npm run build`
2. Ensure you copied files to `../Orbit/src/orbit/media/webview/`
3. Reload the Orbit window (Cmd+Shift+P → "Developer: Reload Window")

#### Webview blank in Orbit

1. Open Developer Tools in Orbit (Help → Toggle Developer Tools)
2. Check Console for JavaScript errors
3. Verify `orbit.js` and `orbit.css` exist in the media folder

#### Pre-commit hook failing

```bash
# Run the checks manually to see detailed errors
npm run check

# Skip hooks temporarily (not recommended)
git commit --no-verify -m "message"
```

#### Switch exhaustiveness errors

When adding new message types to the protocol, ensure all switch statements handling `ExtensionMessage` or `WebviewMessage` include the new cases. Check these files:

- `src/hooks/use-vscode.ts`
- `src/hooks/use-browser.ts`
- `src/hooks/use-chat-messages.ts`
- `src/components/layout/file-explorer.tsx`

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
