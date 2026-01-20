# CLAUDE.md - Agent Bridge

> **Purpose:** Claude Agent SDK sidecar for Orbit. Compiled to standalone Bun binary, spawned by Tauri.

## Overview

The agent-bridge is a **TypeScript sidecar process** that bridges the Rust/Tauri backend with the Claude Agent SDK. It communicates via **newline-delimited JSON over stdin/stdout**.

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Tauri (Rust Backend)                        │
│                              │                                   │
│                         stdin/stdout                             │
│                         (JSON IPC)                               │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Agent Bridge (Bun)                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │ SessionMgr  │  │ CanvasMgr   │  │ BrowserToolMgr  │    │  │
│  │  └──────┬──────┘  └──────┬──────┘  └───────┬─────────┘    │  │
│  │         │                │                 │               │  │
│  │         └────────────────┼─────────────────┘               │  │
│  │                          ▼                                 │  │
│  │  ┌───────────────────────────────────────────────────────┐│  │
│  │  │              Claude Agent SDK                         ││  │
│  │  │  - Session management                                 ││  │
│  │  │  - Tool execution                                     ││  │
│  │  │  - Permission handling                                ││  │
│  │  │  - File checkpointing                                 ││  │
│  │  └───────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Commands

```bash
# Development
bun run dev              # Watch mode with hot-reload
bun run start            # Run directly without compilation
bun run typecheck        # TypeScript type checking

# Building
bun run build            # Build JS bundle (dist/index.js)
bun run build:bundle     # Build minified JS bundle
bun run build:dev        # Build standalone binary for Tauri (target/debug/agent-bridge)

# Testing
bun test                 # Run integration tests
bun test --watch         # Watch mode for tests
DEBUG_TESTS=1 bun test   # Enable debug output during tests
```

### Build Outputs

| Command             | Output                         | Purpose                          |
| ------------------- | ------------------------------ | -------------------------------- |
| `bun run build`     | `dist/index.js`                | JS bundle (requires Bun runtime) |
| `bun run build:dev` | `../target/debug/agent-bridge` | Standalone binary for Tauri      |

**IMPORTANT:** Changes to agent-bridge require **manual rebuild**. Hot-reload does not work because Tauri spawns the compiled binary.

```bash
# After making changes, rebuild and restart Tauri:
cd agent-bridge
bun run build:dev
# Then Cmd+C and restart: bunx tauri dev
```

## Project Structure

```text
agent-bridge/
├── src/
│   ├── index.ts                 # Entry point - stdin/stdout IPC loop
│   │
│   ├── agent/                   # Main agent chat functionality
│   │   ├── core/
│   │   │   └── agent.ts         # OrbitAgent class wrapping Claude SDK
│   │   ├── session/
│   │   │   ├── session-manager.ts   # Multi-session management
│   │   │   ├── session-storage.ts   # Persistent session state
│   │   │   └── session-mode.ts      # Plan/Accept mode handling
│   │   ├── definitions/
│   │   │   ├── agent-definitions.ts # Custom agent CRUD
│   │   │   ├── command-definitions.ts # Slash command CRUD
│   │   │   └── prompts/             # Review prompt templates
│   │   ├── permissions/
│   │   │   └── permissions.ts       # Permission request handling
│   │   ├── types/
│   │   │   └── messages.ts          # Message type definitions
│   │   └── utils/
│   │       ├── content.ts           # Content block processing
│   │       └── formatter.ts         # Message formatting
│   │
│   ├── canvas/                  # Canvas UI Builder AI agent
│   │   ├── core/
│   │   │   └── canvas-agent.ts      # Canvas session management
│   │   ├── mcp/                     # MCP server for canvas tools
│   │   ├── orchestrator/            # Multi-agent orchestration
│   │   ├── prompts/                 # Canvas system prompts
│   │   ├── session/                 # Canvas session handling
│   │   └── types/                   # Canvas-specific types
│   │
│   ├── browser/                 # Browser automation MCP bridge
│   │   ├── browser-mcp-server.ts    # MCP server for browser tools
│   │   ├── browser-tool-bridge.ts   # Tool execution bridge
│   │   └── types.ts                 # Browser tool types
│   │
│   ├── protocol/                # IPC protocol definitions
│   │   ├── protocol.ts              # Request/Response/Event types
│   │   └── schemas.ts               # Zod schemas for validation
│   │
│   ├── common/                  # Shared utilities
│   │   ├── auth/                    # OAuth credential loading
│   │   ├── batching/                # Text event batching
│   │   ├── events/                  # Event emitter utilities
│   │   ├── i18n/                    # Internationalization
│   │   ├── logging/                 # Logger (writes to stderr!)
│   │   └── retry/                   # Retry utilities
│   │
│   └── __tests__/               # Integration tests
│       ├── file-rewind.test.ts      # SDK checkpoint/restore tests
│       ├── conversation-rewind.test.ts # Context rewind tests
│       ├── combined-rewind.test.ts  # Full rewind flow tests
│       ├── canvas-e2e.test.ts       # Canvas end-to-end tests
│       └── ...
│
├── dist/                        # Build output (JS bundle)
├── scripts/
│   └── build-claude-cli.mjs     # Custom build script
├── package.json
└── tsconfig.json
```

## IPC Protocol

The bridge uses **newline-delimited JSON** over stdin (requests) and stdout (responses/events).

### Message Flow

```text
Rust → stdin  → [BridgeRequest]  → Handle → stdout → [BridgeResponse] → Rust
                                         ↘ stdout → [BridgeEvent]    → Rust (async)
```

### Request Types (Rust → Bridge)

| Request Type            | Purpose                              |
| ----------------------- | ------------------------------------ |
| `create_session`        | Create new agent session             |
| `delete_session`        | Delete session and cleanup           |
| `send_message`          | Send user message to agent           |
| `interrupt`             | Stop current generation              |
| `permission_response`   | Respond to permission request        |
| `set_thinking_mode`     | Enable/disable extended thinking     |
| `set_plan_mode`         | Enable/disable plan mode             |
| `set_accept_mode`       | Enable/disable accept mode           |
| `rewind_files`          | Restore files to checkpoint          |
| `fork_session`          | Create session branch/checkpoint     |
| `list_agents`           | List custom agent definitions        |
| `create_agent`          | Create custom agent                  |
| `canvas:create_session` | Create canvas AI session             |
| `canvas:send_message`   | Send message with canvas state       |
| `browser:tool_response` | Return browser tool execution result |

### Response Types (Bridge → Rust)

| Response Type  | Purpose                     |
| -------------- | --------------------------- |
| `success`      | Operation completed         |
| `error`        | Operation failed            |
| `boolean`      | Boolean result              |
| `string`       | String result               |
| `number`       | Numeric result              |
| `agent_list`   | List of agent definitions   |
| `command_list` | List of command definitions |
| `fork_result`  | Fork session result         |

### Event Types (Bridge → Rust, unsolicited)

| Event Type             | Purpose                             |
| ---------------------- | ----------------------------------- |
| `ready`                | Bridge initialized                  |
| `agent_message`        | Streaming text/thinking/tool events |
| `permission_request`   | Tool needs user approval            |
| `session_init`         | Session ready with SDK ID           |
| `checkpoint`           | File checkpoint created             |
| `plan_mode_changed`    | Plan mode toggled                   |
| `canvas:message`       | Canvas agent response               |
| `canvas:tool_request`  | Canvas tool needs execution         |
| `browser:tool_request` | Browser tool needs execution        |

## Key Concepts

### Session Management

Sessions are lazily created and persisted for resume functionality:

```typescript
// Session lifecycle
create_session → SDK session created → session_init event
send_message   → agent_message events → checkpoint event
interrupt      → generation stopped
rewind_files   → files restored to checkpoint
delete_session → cleanup
```

Sessions are stored in `~/.orbit/sessions/` for cross-restart persistence.

### File Checkpointing

The SDK tracks file modifications for rewind:

1. **Enable:** `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` (set in index.ts)
2. **Track:** Each user message UUID becomes a checkpoint ID
3. **Rewind:** `rewind_files` request restores files to checkpoint state

### Canvas Integration

Canvas sessions use MCP (Model Context Protocol) for tool execution:

```text
Canvas Agent → MCP Tool Request → canvas:tool_request event → Frontend
Frontend     → Executes tool   → canvas:tool_response       → Bridge
Bridge       → Returns result  → Continue generation
```

### Browser Automation

Browser tools bridge to the frontend WebKit view:

```text
Agent        → browser:* tool  → browser:tool_request event → Frontend
Frontend     → WebKit executes → browser:tool_response      → Bridge
```

## Logging

**CRITICAL:** All logging goes to **stderr**, not stdout. Stdout is reserved for JSON IPC.

```typescript
import { createLogger } from './common/logging/logger.js';

const logger = createLogger('MyModule');

logger.info('Message'); // → stderr
logger.debug({ data: 123 }, 'Debug info'); // → stderr (only if DEBUG=1)
logger.error({ err }, 'Failed'); // → stderr
```

## Testing

Tests are **real integration tests** using the Claude API, not mocks.

```bash
# Run all tests (requires credentials)
bun test

# Run specific test file
bun test src/__tests__/file-rewind.test.ts

# Enable debug output
DEBUG_TESTS=1 bun test

# Watch mode
bun test --watch
```

### Credentials

Tests require Claude credentials:

- **API Key:** `ANTHROPIC_API_KEY` env var
- **OAuth:** macOS Keychain (auto-detected on darwin)

Tests auto-skip in CI/GitHub Actions.

### Test Files

| Test File                     | What it tests                        |
| ----------------------------- | ------------------------------------ |
| `file-rewind.test.ts`         | SDK checkpoint/restore functionality |
| `conversation-rewind.test.ts` | Conversation context formatting      |
| `combined-rewind.test.ts`     | Full rewind flow integration         |
| `canvas-e2e.test.ts`          | Canvas agent end-to-end flow         |
| `text-event-batcher.test.ts`  | Text batching utility                |

## Code Style

### TypeScript Strictness

The tsconfig enforces strict settings:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noUnusedLocals/Parameters: true`

### Import Style

```typescript
// External imports first
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

// Then internal imports
import { createLogger } from './common/logging/logger.js';

// Type-only imports separate
import type { OrbitAgentConfig } from '../core/agent.js';
```

### Error Handling

Always use structured errors with context:

```typescript
try {
  // operation
} catch (error) {
  logger.error({ error, sessionId }, 'Operation failed');
  throw new Error(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
}
```

## Dependencies

| Package                          | Purpose                     |
| -------------------------------- | --------------------------- |
| `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK            |
| `@anthropic-ai/claude-code`      | Claude Code CLI integration |
| `@anthropic-ai/sdk`              | Anthropic API client        |
| `@modelcontextprotocol/sdk`      | MCP server implementation   |
| `@orbit/shared-schemas`          | Shared Zod schemas          |
| `zod`                            | Runtime validation          |

## Troubleshooting

### "Session not found" errors

The session may not be created yet. Ensure `create_session` is called before `send_message`.

### stdout pollution breaking IPC

If you see JSON parse errors in Rust, check that no code is writing to stdout. All logging must use the `createLogger` utility which writes to stderr.

### Rewind not restoring files

1. Check `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` is set
2. Verify checkpoint IDs match user message UUIDs
3. Run with `DEBUG_TESTS=1` to see detailed flow

### Build not updating in Tauri

The sidecar is a compiled binary. After changes:

```bash
cd agent-bridge && bun run build:dev
# Then restart Tauri
```
