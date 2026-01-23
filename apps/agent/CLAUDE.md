# CLAUDE.md - Orbit Agent App

This file provides guidance to Claude Code when working specifically in the `apps/agent` directory.

> **Parent Documentation:** See [`../../CLAUDE.md`](../../CLAUDE.md) for monorepo-wide guidance.

---

## Overview

The Agent app is the main AI chat interface for Orbit. It provides:

- Chat interface with Claude AI
- Tool visualization (Bash, Read, Write, Edit, etc.)
- File explorer and editor (CodeMirror 6)
- Terminal emulation (xterm.js)
- Git integration
- Embedded browser panel

---

## Quick Commands

```bash
# From monorepo root
bun run dev              # Vite dev server only (port 5176)
bunx tauri dev           # Full app with Rust backend

# Quality checks
bun run typecheck        # TypeScript only
bun run lint             # ESLint with zero warnings
bun run lint:fix         # ESLint with auto-fix
```

---

## Directory Structure

```text
apps/agent/src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root component (3-mode lazy mount)
├── globals.css                 # SOURCE OF TRUTH for all colors
│
├── components/
│   ├── ui/                     # Radix UI primitives (shadcn style)
│   ├── layout/                 # RootLayout, HeaderBar, StatusBar
│   │   ├── primary-sidebar/    # Conversation list, file tree
│   │   └── chat-area/          # Main chat panel container
│   ├── chat/
│   │   ├── messages/           # Message rendering
│   │   ├── tools/              # Tool widgets (10+ tools)
│   │   ├── input/              # Chat input with @mentions
│   │   ├── status/             # Agent status indicators
│   │   └── queued-message/     # Pending message display
│   ├── files/                  # File explorer, icons
│   ├── editor/                 # CodeMirror wrapper
│   ├── terminal/               # xterm.js terminal
│   ├── git/                    # Source control panel
│   ├── browser/                # In-app WebKit browser
│   ├── modals/                 # Settings, dialogs, quick-open
│   ├── onboarding/             # First-launch setup
│   ├── welcome/                # Welcome page (no workspace)
│   └── shared/                 # ErrorBoundary, common components
│
├── hooks/
│   ├── agent/                  # Tauri communication (core)
│   │   ├── use-tauri.ts        # Main hook for backend comms
│   │   ├── use-tauri-handlers.ts
│   │   ├── handlers/           # Message handlers by domain
│   │   └── types/              # Hook-specific types
│   ├── chat/                   # Message management, persistence
│   ├── file/                   # File operations, tree navigation
│   ├── terminal/               # Terminal create/write
│   ├── browser/                # Browser panel events
│   ├── git/                    # Git status, auto-fetch
│   ├── lsp/                    # Language server integration
│   ├── ui/                     # Keyboard shortcuts, resizing
│   └── core/                   # Crash detection, core utilities
│
├── stores/                     # Zustand state management
│   ├── ui/                     # Panels, layout, tabs
│   ├── agent/                  # Tools, checkpoints, commands
│   ├── chat/                   # Queued messages
│   ├── file/                   # File tree, viewer tabs
│   ├── terminal/               # Terminal sessions
│   ├── browser/                # Browser state, lifecycle
│   ├── git/                    # Branch, status, diffs
│   └── onboarding/             # Setup flow, provider config
│
├── services/
│   └── terminal/               # xterm instance management
│
├── providers/
│   ├── tauri-provider.tsx      # Global event listeners
│   └── theme-provider.tsx      # Theme context
│
├── types/
│   ├── protocol/               # Message types with Zod schemas
│   │   ├── protocol.ts         # Branded types (UUID, SessionId)
│   │   └── message.ts          # WebviewMessage, ExtensionMessage
│   ├── agent/                  # Agent, conversation, context types
│   ├── file/                   # File, diff types
│   ├── ui/                     # UI state types
│   └── canvas/                 # Canvas integration types
│
└── lib/
    ├── api/                    # Tauri invoke wrappers by domain
    │   ├── files.ts            # readFile, writeFile, listDirectory
    │   ├── terminal.ts         # createTerminal, writeTerminal
    │   ├── git.ts              # gitStatus, gitCommit, etc.
    │   ├── lsp.ts              # getCompletions, getHover
    │   ├── browser.ts          # Browser control
    │   └── ...
    ├── utils/
    │   ├── constants.ts        # SINGLE SOURCE for all magic numbers
    │   ├── utils.ts            # cn() and common utilities
    │   ├── diff-utils.ts       # Diff parsing/rendering
    │   └── iconMap.ts          # File extension → icon mapping
    ├── mappers/                # Data transformation functions
    └── terminal/               # xterm addons and theme sync
```

---

## State Management (Zustand Stores)

| Store                     | File                                        | Purpose                                     |
| ------------------------- | ------------------------------------------- | ------------------------------------------- |
| **UIStore**               | `stores/ui/ui-store.ts`                     | Panels, sidebar, active tab, conversations  |
| **ToolStore**             | `stores/agent/tool-store.ts`                | Tool execution, permissions, usage tracking |
| **CheckpointStore**       | `stores/agent/checkpoint-store.ts`          | Rewind feature (turn checkpoints)           |
| **CommandsStore**         | `stores/agent/commands-store.ts`            | Detected bash commands                      |
| **MessageBufferStore**    | `stores/agent/message-buffer-store.ts`      | Streaming message assembly                  |
| **QueuedMessageStore**    | `stores/chat/queued-message-store.ts`       | Pending message queue                       |
| **FileStore**             | `stores/file/file-store.ts`                 | File tree, changed files (O(1) Map)         |
| **FileViewerStore**       | `stores/file/file-viewer-store.ts`          | Open tabs, content cache                    |
| **TerminalStore**         | `stores/terminal/terminal-store.ts`         | PTY sessions, output buffers                |
| **BrowserStore**          | `stores/browser/browser-store.ts`           | Navigation, element selection               |
| **BrowserLifecycleStore** | `stores/browser/browser-lifecycle-store.ts` | Browser panel visibility                    |
| **GitStore**              | `stores/git/git-store.ts`                   | Branch, status, ahead/behind                |
| **OnboardingStore**       | `stores/onboarding/onboarding-store.ts`     | First-launch setup (persisted)              |
| **ProviderStore**         | `stores/onboarding/provider-store.ts`       | OAuth provider configuration                |

### Store Patterns

```typescript
// Use granular selectors to prevent unnecessary re-renders
const isOpen = useUIStore((state) => state.leftSidebarOpen);

// DON'T subscribe to entire state
const state = useUIStore(); // ❌ Re-renders on ANY state change
```

---

## Communication with Backend

### useTauri Hook (`hooks/agent/use-tauri.ts`)

The primary hook for Tauri backend communication:

```typescript
import { useTauri } from '@/hooks/agent/use-tauri';

const { postMessage, isConnected, isMockMode } = useTauri({
  onMessage: (message) => {
    // Handle messages from backend
    if (message.type === 'agent:chunk') {
      // Streaming AI response
    }
  },
  debug: true,
});

// Send message to backend
postMessage({
  type: 'message:send',
  uuid: generateUUID(),
  session_id: sessionId,
  content: 'Hello Claude',
});
```

### Backend API (`lib/api/`)

Direct Tauri invoke calls for operations:

```typescript
import { readFile, writeFile, listDirectory } from '@/lib/api/files';
import { createTerminal, writeTerminal } from '@/lib/api/terminal';
import { gitStatus, gitCommit } from '@/lib/api/git';

// File operations
const content = await readFile('/path/to/file');
await writeFile('/path/to/file', content);

// Terminal
await writeTerminal(terminalId, 'ls -la\n');
```

---

## Protocol Types (`types/protocol/`)

### Branded Types (Compile-Time Safety)

Prevents mixing different ID types:

```typescript
import {
  UUID,
  SessionId,
  MessageId,
  TerminalId,
  generateUUID,
  createSessionId,
  createMessageId,
} from '@/types/protocol';

// These are different types - can't mix them
const uuid: UUID = generateUUID();
const sessionId: SessionId = createSessionId('session-123');

// TypeScript error: Type 'UUID' is not assignable to type 'SessionId'
const bad: SessionId = uuid; // ❌
```

### Message Types

```typescript
// Frontend → Backend
type WebviewMessage =
  | { type: 'message:send'; uuid: UUID; session_id: string; content: string }
  | { type: 'agent:stop'; uuid: UUID; session_id: string }
  | { type: 'file:read'; uuid: UUID; path: string };
// ... more

// Backend → Frontend
type ExtensionMessage =
  | { type: 'agent:chunk'; session_id: string; message_id: string; content: string }
  | { type: 'agent:complete'; session_id: string; message_id: string }
  | { type: 'tool:start'; tool_name: string; tool_input: unknown };
// ... more
```

---

## Constants (`lib/utils/constants.ts`)

**SINGLE SOURCE OF TRUTH** for all magic numbers:

```typescript
import {
  SIDEBAR,
  PANEL_SIZES,
  CHAT_WIDTH,
  KEYBOARD_SHORTCUTS,
  TERMINAL,
  GIT_STATUS_STYLES,
} from '@/lib/utils/constants';

// Layout dimensions
SIDEBAR.expanded; // 256
SIDEBAR.collapsed; // 35
PANEL_SIZES.terminal.min; // 100

// Chat widths
CHAT_WIDTH.primary; // 650

// Terminal settings
TERMINAL.fontSize; // 13
TERMINAL.maxOutputLines; // 1000

// Keyboard shortcuts (single source of truth)
KEYBOARD_SHORTCUTS.toggleTerminal.key; // 'j'
KEYBOARD_SHORTCUTS.toggleTerminal.cmd; // true
```

### When to Add to Constants

| Add Here                               | Don't Add Here            |
| -------------------------------------- | ------------------------- |
| Layout dimensions                      | Component-specific styles |
| Timing values (delays, animations)     | One-off values            |
| Threshold values (scroll, snap points) | Tailwind classes          |
| Config objects (shortcuts, git styles) | Development-time values   |

---

## Tool Widgets (`components/chat/tools/`)

Each tool has a dedicated visualization widget:

| Widget                       | Tool      | Description                           |
| ---------------------------- | --------- | ------------------------------------- |
| `bash-tool-widget.tsx`       | Bash      | Terminal commands with output         |
| `read-tool-widget.tsx`       | Read      | File reading with syntax highlighting |
| `write-tool-widget.tsx`      | Write     | File creation/overwrite               |
| `edit-tool-widget.tsx`       | Edit      | Line-level file edits with diff       |
| `glob-tool-widget.tsx`       | Glob      | File pattern matching results         |
| `grep-tool-widget.tsx`       | Grep      | Code search results                   |
| `task-tool-widget.tsx`       | Task      | Subagent task delegation              |
| `todo-tool-widget.tsx`       | TodoWrite | Task list management                  |
| `web-fetch-tool-widget.tsx`  | WebFetch  | URL content fetching                  |
| `web-search-tool-widget.tsx` | WebSearch | Web search results                    |

---

## CSS & Styling

### Color System

**`globals.css` is the SINGLE SOURCE OF TRUTH** for all colors:

```css
/* Light mode */
:root {
  --background: oklch(0.95 0.008 75);
  --chat-area: oklch(0.93 0.006 75);
  --card: oklch(0.9 0.006 75);
  --primary: oklch(0.56 0.18 25);
}

/* Dark mode */
html.dark {
  --background: oklch(0.16 0.012 60);
  --chat-area: oklch(0.18 0.012 60);
  --card: oklch(0.2 0.012 60);
  --primary: oklch(0.68 0.18 25);
}
```

### Tailwind Rules

```typescript
// ❌ NEVER use dynamic Tailwind classes
const width = 200;
<div className={`w-[${width}px]`} />  // Won't work!

// ✅ Use inline styles for dynamic values
<div style={{ width: `${width}px` }} />

// ✅ Static Tailwind classes work fine
<div className="w-px h-[32px]" />
```

---

## Key Patterns

### 1. Lazy Mount Pattern (App.tsx)

Modes are mounted once and kept alive via CSS:

```typescript
// Prevents remounting when switching tabs
const mounted = useMountedTabs(activeTab);

{mounted.agent ? (
  <div style={activeTab === 'agent' ? { display: 'block' } : { display: 'none' }}>
    <AgentMode />
  </div>
) : null}
```

### 2. Error Boundaries per Mode

Each mode has isolated error handling:

```typescript
<ErrorBoundary fallback={(error, reset) => (
  <ModeErrorFallback mode="agent" error={error} onReset={reset} />
)}>
  <AgentMode />
</ErrorBoundary>
```

### 3. Checkpoint System (Rewind)

Two checkpoints per message for rewind:

- **Turn Start**: For SDK fork point
- **Turn End**: For file state restoration

```typescript
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

const { turnStartCheckpoint, turnEndCheckpoint } = useCheckpointStore();
```

### 4. Handler Pattern (hooks/agent/handlers/)

Message handling is split by domain:

```text
handlers/
├── agent-sdk-handlers.ts     # SDK lifecycle events
├── browser-handlers.ts       # Browser panel events
├── command-handlers.ts       # Bash command detection
├── conversation-handlers.ts  # Chat persistence
├── file-handlers.ts          # File operations
├── subagent-handlers.ts      # Task delegation
└── terminal-handlers.ts      # Terminal I/O
```

---

## Adding New Features

### Adding a New Tool Widget

1. Create widget in `components/chat/tools/`:

   ```typescript
   // my-tool-widget.tsx
   export const MyToolWidget: FC<ToolWidgetProps> = ({ tool }) => {
     // Render tool-specific UI
   };
   ```

2. Register in `components/chat/tools/index.ts`

3. Add to tool rendering logic in message component

### Adding a New Store

1. Create store in appropriate domain folder:

   ```typescript
   // stores/domain/my-store.ts
   import { create } from 'zustand';
   import { immer } from 'zustand/middleware/immer';

   export const useMyStore = create<MyState>()(
     immer((set) => ({
       // State and actions
     }))
   );
   ```

2. Export from domain barrel: `stores/domain/index.ts`
3. Export from root barrel: `stores/index.ts`

### Adding a New Keyboard Shortcut

Add to `KEYBOARD_SHORTCUTS` in `lib/utils/constants.ts`:

```typescript
export const KEYBOARD_SHORTCUTS = {
  // ...existing shortcuts
  myNewShortcut: {
    key: 'n',
    cmd: true,
    shift: true,
    description: 'My new shortcut',
    event: 'myNewShortcut',
  },
} as const;
```

---

## Common Import Aliases

```typescript
// Components
import { Button } from '@/components/ui/button';
import { RootLayout } from '@/components/layout';

// Hooks
import { useTauri } from '@/hooks/agent/use-tauri';
import { useUIStore } from '@/stores/ui/ui-store';

// Types
import type { UUID, SessionId } from '@/types/protocol';

// Utils
import { cn } from '@/lib/utils';
import { SIDEBAR, CHAT_WIDTH } from '@/lib/utils/constants';

// API
import { readFile, writeFile } from '@/lib/api/files';
```

---

## Testing

The agent app uses **Vitest** for frontend testing with React Testing Library.

### Commands

```bash
# From monorepo root
bun test                    # Run all frontend tests
bun test --watch            # Watch mode
bun test --coverage         # With coverage report

# Run specific test file
bun test apps/agent/src/__tests__/components/chat/input/input-mode.test.ts
```

### Test File Location

Tests are located in `apps/agent/src/__tests__/` mirroring the source structure:

```text
apps/agent/src/__tests__/
├── components/
│   └── chat/
│       └── input/
│           ├── input-mode.test.tsx      # Mode picker button
│           └── model-selector.test.tsx  # Model dropdown
└── ...
```

### Configuration Files

| File               | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `vitest.config.ts` | Vitest config (root)                                 |
| `vitest.setup.ts`  | Global test setup (jsdom, matchers)                  |
| `tsconfig.json`    | Types: `vitest/globals`, `@testing-library/jest-dom` |
| `eslint.config.ts` | Test file overrides (relaxed type checking)          |

### Writing Tests

```typescript
// Note: describe, it, expect, vi are globals via vitest/globals
// DO NOT import from 'vitest' - use globals

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MyComponent } from '@/components/my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### ESLint Override for Test Files

Test files have relaxed `@typescript-eslint/no-unsafe-*` rules due to a known ecosystem incompatibility between Vitest 4 globals and ESLint's projectService. This is documented in `eslint.config.ts`.

### Integration Tests (Agent Bridge)

For testing backend integration (Claude SDK), use the agent-bridge tests:

```bash
cd agent-bridge && bun test
```

These require Claude Code CLI OAuth credentials (macOS Keychain) and auto-skip in CI.

---

## Troubleshooting

### State Not Updating

Check for granular selector usage - subscribing to entire store causes issues:

```typescript
// ❌ Bad - re-renders on any change
const store = useUIStore();

// ✅ Good - only re-renders when specific value changes
const isOpen = useUIStore((state) => state.leftSidebarOpen);
```

### Mock Mode Not Working

Ensure `use-tauri-mock.ts` handles the message type you're testing.

### Tool Widget Not Rendering

1. Check tool is exported from `components/chat/tools/index.ts`
2. Verify tool_name matches in message handler
3. Check for Zod validation errors in console

---

## Changelog

### January 2026

- Initial CLAUDE.md for agent app
- Documented all stores, hooks, and patterns
- Added constants and protocol type documentation
