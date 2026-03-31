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
│  │  ┌─────────────┐  ┌─────────────────┐                      │  │
│  │  │ SessionMgr  │  │ BrowserToolMgr  │                      │  │
│  │  └──────┬──────┘  └───────┬─────────┘                      │  │
│  │         │                 │                                │  │
│  │         └─────────────────┘                                │  │
│  │                   ▼                                        │  │
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
| `text-event-batcher.test.ts`  | Text batching utility                |

## SDK Type Workaround (ESLint vs TypeScript)

ESLint's `projectService` cannot resolve `SDKMessage` from `@anthropic-ai/claude-agent-sdk` across the tsconfig `moduleResolution: "bundler"` boundary. TypeScript's own `tsc --noEmit` resolves it fine, but ESLint sees every property access on SDK messages as `no-unsafe-*` errors.

### Workaround: Local Mirror Types

Local mirror types in `src/common/types/claude-sdk.ts` define a `LocalSDKMessage` discriminated union that mirrors the SDK's `SDKMessage`. Files cast once at the `for await` iteration boundary:

```typescript
for await (const rawMessage of this.currentQuery) {
  const message = rawMessage as LocalSDKMessage;
  // ESLint-safe property access via discriminated union narrowing
}
```

### Maintenance Risks

| Risk                  | Severity | Detail                                                                                                                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type drift            | **High** | If SDK updates message shapes, local types must be updated manually — `as` cast hides mismatches                                                                                      |
| User message content  | **High** | Content is `string \| unknown[]` (string for text, array for tool results). Always guard with `Array.isArray()` before calling array methods. Missing this caused a production crash. |
| Switch exhaustiveness | Medium   | When adding new SDK message type handling, add the type to `LocalSDKOtherMessage.type` union                                                                                          |

### Affected Files

| File                                   | Role                                 |
| -------------------------------------- | ------------------------------------ |
| `src/common/types/claude-sdk.ts`       | Source of truth for mirror types     |
| `src/agent/core/agent.ts`              | Main agent — heaviest usage          |
| `src/agent/session/session-manager.ts` | Session management — typed narrowing |

### Proper Fix

Resolve ESLint's type resolution for the SDK package. Either configure `projectService` to find the SDK's `.d.ts` files, or wait for tooling improvements. Until then, keep local mirror types in sync with the SDK manually.

---

## Testing Philosophy

We follow **real integration testing**, not unit testing with mocks.

**DO NOT:**

- Mock the Claude SDK
- Test single files in isolation
- Use fake data that always passes

**DO:**

- Use REAL Claude API calls
- Test full module integration
- Use real data through real pipelines

Tests require Claude Code CLI OAuth credentials (macOS Keychain). They auto-skip in GitHub Actions.

### Good vs Bad Test Example

```typescript
// ❌ BAD - Mock test that proves nothing
it('should analyze intent', () => {
  const mockAnalyzer = { analyze: () => ({ useFastPath: true }) };
  expect(mockAnalyzer.analyze('test').useFastPath).toBe(true);
});

// ✅ GOOD - Real integration test
it('should create and use a real agent session', async () => {
  const manager = new SessionManager();
  await manager.createSession('test-session', { model: 'claude-sonnet-4-20250514' });
  const session = manager.getSession('test-session');
  expect(session).toBeDefined();
  await manager.deleteSession('test-session');
});
```

### Zod Schema Patterns

```typescript
// For API responses with unknown extra fields
const ApiResponseSchema = z.object({ data: z.unknown(), status: z.number() }).passthrough();

// For internal data with strict shape
const InternalStateSchema = z.object({ count: z.number(), items: z.array(z.string()) }).strict();

// KeychainCredentials — external data needs flexibility
.object({ expiresAt: z.union([z.number(), z.string()]) }).loose() // ✅
.object({ expiresAt: z.string() }).strict() // ❌ breaks on number timestamps
```

---

## Known Security Vulnerabilities

| Package                              | CVE                                 | Severity | Status           |
| ------------------------------------ | ----------------------------------- | -------- | ---------------- |
| `@modelcontextprotocol/sdk` <=1.25.1 | CVE-2026-0621 (GHSA-8r9q-7v3j-jr4g) | High     | Waiting upstream |

**ReDoS** in UriTemplate class. Low practical risk — agent-bridge is a local sidecar, URIs come from our SDK calls, not untrusted input. Override for `qs>=6.14.1` added for related transitive DoS.

```bash
bun pm audit                                    # Check current vulnerabilities
bun pm view @modelcontextprotocol/sdk version   # Check latest version
```

---

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
