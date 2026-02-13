# Stress Tests

In-app stress tests that run from the browser DevTools console via `window.__orbit_debug`. They drive the **real** message pipeline (Tauri events, Zustand stores, Rust backend) — no mocks.

## Existing Tests

| Test              | File                         | Command                  | What it exercises                                             |
| ----------------- | ---------------------------- | ------------------------ | ------------------------------------------------------------- |
| Rewind            | `rewind-stress-test.ts`      | `runRewindStressTest()`  | Send/rewind/re-send message flow, checkpoint integrity        |
| Mega Rewind       | `rewind-mega-stress-test.ts` | `runMegaStressTest()`    | File create/edit/revert through multiple rewind depths        |
| Session Lifecycle | `session-stress-test.ts`     | `runSessionStressTest()` | Multi-session create, mid-stream switching, sidebar integrity |

---

## How to Create a New Stress Test

### 1. Create the test file

Create `apps/agent/src/stress-tests/<feature>-stress-test.ts`.

Every stress test follows the same skeleton:

```typescript
import { createLogger } from '@orbit/common/lib';

import { useChatStore } from '@/stores/chat/chat-store';
// Import other stores you need to observe or manipulate

const logger = createLogger('MyFeatureStressTest');

// ── Types ──────────────────────────────────────────────────────────

export interface MyFeatureStressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  // Add handleRewind, postMessage, etc. as needed
}

export interface MyFeatureStressTestConfig {
  delayBetweenMessages?: number;
  agentTimeout?: number;
  // Feature-specific config options
}

interface StepResult {
  step: string;
  durationMs: number;
  sessionId: string;
  messageCount: number;
  success: boolean;
  error?: string;
}

// ── Main runner ────────────────────────────────────────────────────

export async function runMyFeatureStressTest(
  deps: MyFeatureStressTestDeps,
  config: MyFeatureStressTestConfig = {}
): Promise<StepResult[]> {
  const { delayBetweenMessages = 500, agentTimeout = 120_000 } = config;
  const results: StepResult[] = [];

  // Steps go here (see "Writing Steps" below)

  return results;
}
```

### 2. Key building blocks

Every stress test uses these primitives. Copy them from an existing test or write your own:

#### `sleep(ms)` — Delay between actions

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
```

#### `waitForAgentComplete(timeout, label)` — Wait for streaming to finish

Subscribes to `useChatStore` and resolves when `isAgentRunning` becomes `false` on the active session. Always include a timeout with a descriptive label for debugging.

#### `waitForStreamingStarted(timeout, label)` — Wait for first chunk

Resolves when `isAgentRunning` is `true` AND at least one assistant message exists. Use this when you need to switch away mid-stream.

#### `waitForSessionCreated(prevId, timeout)` — Wait for new session

Watches `lastCreatedSessionId` in ChatStore. Returns the new session ID.

#### State recorder — Log every store mutation

```typescript
function createStateRecorder() {
  let events: RecordedEvent[] = [];
  let unsubs: Array<() => void> = [];
  const start = Date.now();

  return {
    start: () => {
      unsubs.push(
        useChatStore.subscribe((state, prev) => {
          // Compare state vs prev, log differences
        })
      );
      // Subscribe to other stores too
    },
    stop: () => {
      unsubs.forEach((u) => u());
      return events;
    },
  };
}
```

#### `runStep(name, fn)` — Step runner with timing and error capture

Wraps each step in try/catch, records duration, logs PASS/FAIL. All existing tests use this pattern for consistent output.

### 3. Writing steps

Each step is an async function that:

1. **Acts** — sends a message, switches sessions, triggers rewind, etc.
2. **Waits** — for the agent to complete, streaming to start, or a session to be created
3. **Asserts** — checks store state matches expectations

```typescript
const stepOk = await runStep('Send message and verify', async () => {
  handleSend('Write a 350-word essay about space exploration.');
  await waitForAgentComplete(agentTimeout, 'Essay response');

  const msgs = getActiveMessages();
  assertGte(msgs.length, 2, 'Should have user + assistant');
  assertSidebarContains(sessionId, 'Session in sidebar');
  assertNoDuplicateSidebarEntries('After send');
});
if (!stepOk) {
  recorder.stop();
  return results;
}
```

Steps bail early on failure — no point continuing if foundational state is wrong.

### 4. Wire it up to `window.__orbit_debug`

Three files need changes:

#### a) Type declaration (`use-chat-messages.ts`, line ~50)

Add your config type import and method signature:

```typescript
import type { MyFeatureStressTestConfig } from '@/stress-tests/my-feature-stress-test';

declare global {
  interface Window {
    __orbit_debug?:
      | {
          // ... existing methods ...
          runMyFeatureStressTest: (config?: MyFeatureStressTestConfig) => Promise<unknown>;
        }
      | undefined;
  }
}
```

#### b) Dynamic import in the dev-mode useEffect (~line 400)

Add a lazy import entry. Dynamic imports keep the stress test code out of the production bundle:

```typescript
runMyFeatureStressTest: async (config?: MyFeatureStressTestConfig) => {
  const { runMyFeatureStressTest } = await import(
    '@/stress-tests/my-feature-stress-test'
  );
  return runMyFeatureStressTest(
    {
      handleSend: actions.handleSend,
      handleStop: actions.handleStop,
      // pass whatever deps your test needs
    },
    config
  );
},
```

#### c) Return type interface (`use-chat-messages.ts`, line ~50)

Add the new method to the `Window.__orbit_debug` interface so TypeScript knows about it.

### 5. Verify

```bash
bun run typecheck   # No errors
bun run lint        # Zero warnings
bun run test        # 1,008+ tests pass
```

Then in the running app (DevTools console):

```javascript
window.__orbit_debug.runMyFeatureStressTest();
// or with custom config:
window.__orbit_debug.runMyFeatureStressTest({ delayBetweenMessages: 200 });
```

---

## Available Dependencies

Your test's `Deps` interface picks from these actions (provided by `createChatActions`):

| Dep            | Type                            | Use for                                                                |
| -------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `handleSend`   | `(text: string) => void`        | Send a user message in the active session                              |
| `handleStop`   | `() => void`                    | Stop the agent mid-stream                                              |
| `handleRewind` | `(messageId: string) => void`   | Rewind to a specific message                                           |
| `postMessage`  | `(msg: WebviewMessage) => void` | Send raw Tauri messages (conversation:create, conversation:load, etc.) |

## Available Stores

Access any Zustand store imperatively via `useXxxStore.getState()`:

| Store                   | Common reads                                                              | Common writes                                                |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `useChatStore`          | `activeSessionId`, `sessions[id].messages`, `sessions[id].isAgentRunning` | `setActiveSession()`, `addMessage()`                         |
| `useUIStore`            | `conversations` (sidebar), `activeConversationId`                         | `setLoadingConversation()`, `setConversationTransitioning()` |
| `useCheckpointStore`    | `turnStartCheckpoints`, `turnEndCheckpoints`                              | — (read-only in tests)                                       |
| `useToolStore`          | `currentSessionId`, `sessionUsage`                                        | `switchSession()`                                            |
| `useMessageBufferStore` | `hasLoadPending()`                                                        | `markLoadPending()`                                          |

## Assertion Helpers

Write simple assertion functions that throw on failure. The `runStep` wrapper catches these and records them as FAIL:

```typescript
function assertEq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(label + ': expected ' + String(expected) + ', got ' + String(actual));
  }
}

function assertGte(actual: number, expected: number, label: string): void {
  if (actual < expected) {
    throw new Error(label + ': expected >= ' + String(expected) + ', got ' + String(actual));
  }
}
```

## Design Guidelines

1. **Use real Claude API calls** — no mocking. These tests verify the full pipeline.
2. **Design prompts to control response length and tool use** — ask for specific word counts, boundary markers (ALPHA-START/END), or explicit file operations.
3. **Always include timeouts** — streaming can be slow. Default to 120s for agent completion, 30s for streaming start.
4. **Log state snapshots** — use `logSessionState('label')` at key moments so failures are debuggable from the console output alone.
5. **Bail early on failure** — if step 3 fails, steps 4-9 will cascade. Return immediately.
6. **Track session remaps** — frontend UUIDs get remapped to SDK UUIDs via `system:init`. Use a `createdSessions` map and `resolveSessionId()` to follow the remap chain.
7. **Dev-only** — all stress tests are gated behind `import.meta.env.DEV` and use dynamic imports, so they are tree-shaken from production builds.
