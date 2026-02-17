---
name: stress-test
description: Create an in-app stress test that runs from browser DevTools console via window.__orbit_debug. Drives the real message pipeline (Tauri events, Zustand stores, Rust backend) with no mocks.
---

# Stress Test Generator

Create in-app stress tests that exercise the **real** Orbit message pipeline from the browser DevTools console. No mocks — real Tauri events, real Zustand stores, real Rust backend.

**Usage:** `/stress-test` then describe the feature or flow you want to stress test.

## Process

### Phase 1: Understand the Target

1. **Ask the user** what feature/flow they want to stress test (if not already specified).
2. **Read the stress test docs** at `apps/agent/src/stress-tests/CLAUDE.md` for the canonical patterns and building blocks.
3. **Read an existing test** that most closely matches the target feature to understand the full pattern:
   - Rewind flow: `apps/agent/src/stress-tests/rewind-stress-test.ts`
   - File create/edit/revert: `apps/agent/src/stress-tests/rewind-mega-stress-test.ts`
   - Session lifecycle: `apps/agent/src/stress-tests/session-stress-test.ts`
   - Store validation: `apps/agent/src/stress-tests/review-fixes-stress-test.ts`
4. **Read the source code** of the feature being tested to understand its stores, events, and state transitions.

### Phase 2: Design the Test

Before writing code, output:

```
## Stress Test Plan: [feature-name]

**Target:** [What feature/flow is being tested]
**Stores involved:** [Which Zustand stores to observe]
**Events involved:** [Which Tauri/postMessage events are relevant]

**Deps needed:**
- handleSend: [yes/no]
- handleStop: [yes/no]
- handleRewind: [yes/no]
- postMessage: [yes/no]
- handleModelChange: [yes/no]
- handleEffortLevelChange: [yes/no]
- handleThinkingModeChange: [yes/no]

**Test Steps:**
1. [Step name] — [what it does, what it waits for, what it asserts]
2. [Step name] — ...

**Config options:**
- [option]: [default] — [description]
```

### Phase 3: Write the Test File

Create `apps/agent/src/stress-tests/<feature>-stress-test.ts` following this exact skeleton:

```typescript
/**
 * <Feature> Stress Test
 *
 * <Description of what this test exercises>
 *
 * Test sequence:
 *   1. <Step 1 description>
 *   2. <Step 2 description>
 *   ...
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.run<Feature>StressTest()
 *   window.__orbit_debug.run<Feature>StressTest({ <config> })
 *
 * Prerequisites:
 * - A workspace open (needed for conversation:create)
 * - Input mode set to "accept" for auto-approving tool use (if tool use is involved)
 */

import { createLogger } from '@orbit/common/lib';
// Import stores needed for observation
import { useChatStore } from '@/stores/chat/chat-store';
// Import other stores as needed

const logger = createLogger('<Feature>StressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface <Feature>StressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  // Add handleRewind, postMessage, handleModelChange, etc. as needed
}

export interface <Feature>StressTestConfig {
  /** Delay between actions (ms). Default: 500 */
  delayBetweenMessages?: number;
  /** Timeout for agent completion (ms). Default: 120000 */
  agentTimeout?: number;
  // Add feature-specific config
}

interface StepResult {
  step: string;
  durationMs: number;
  success: boolean;
  // Add sessionId, messageCount, sidebarCount, details, error as appropriate
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (copy from existing tests or write new ones)
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Add: waitForAgentComplete, waitForStreamingStarted, waitForSessionCreated
// Add: assertion helpers (assertEq, assertGte, assertTrue, assertFalse)
// Add: state snapshot helpers (getActiveMessages, getSidebarEntries, logSessionState)
// Add: state recorder if monitoring store mutations

// ────────────────────────────────────────────────────────────────────────────
// Main runner
// ────────────────────────────────────────────────────────────────────────────

export async function run<Feature>StressTest(
  deps: <Feature>StressTestDeps,
  config: <Feature>StressTestConfig = {}
): Promise<StepResult[]> {
  const { delayBetweenMessages = 500, agentTimeout = 120_000 } = config;
  const results: StepResult[] = [];

  // Banner
  logger.warn('========================================================');
  logger.warn('   <FEATURE> STRESS TEST -- STARTING                     ');
  logger.warn('========================================================');

  // Steps go here (see patterns below)

  // Summary
  logger.warn('========================================================');
  const allPassed = results.every((r) => r.success);
  logger.warn(allPassed ? 'All steps passed!' : 'Some steps failed');
  logger.warn('========================================================');

  return results;
}
```

#### Step Pattern

Every step follows Act → Wait → Assert with early bail:

```typescript
const runStep = async (name: string, fn: () => Promise<void>): Promise<boolean> => {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ step: name, durationMs: duration, success: true });
    logger.warn('[PASS] ' + name + ' (' + String(duration) + 'ms)');
    return true;
  } catch (err) {
    const duration = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ step: name, durationMs: duration, success: false, error: errorMsg });
    logger.error('[FAIL] ' + name + ': ' + errorMsg);
    return false;
  }
};

// Usage:
const stepOk = await runStep('Send message and verify', async () => {
  handleSend('Write a 350-word essay about space exploration.');
  await waitForAgentComplete(agentTimeout, 'Essay response');

  const msgs = getActiveMessages();
  assertGte(msgs.length, 2, 'Should have user + assistant');
});
if (!stepOk) return results; // Bail early
```

#### Prompts for Controlling Responses

Design prompts to produce predictable, verifiable output:

- **Boundary markers**: `'Start with "ALPHA-START" and end with "ALPHA-END"'`
- **Word count control**: `'Write a detailed 350-word essay about...'`
- **Tool use triggers**: `'Create a file at ~/Desktop/orbit-stress-test/test.txt with content "..."'`
- **No-tool guard**: `'Do NOT use any tools.'`
- **Short response**: `'Say exactly: "Hello". Nothing else.'`

### Phase 4: Wire Up to `window.__orbit_debug`

Three changes in `apps/agent/src/hooks/chat/use-chat-messages.ts`:

#### 4a. Add type import (top of file, with other stress test imports)

```typescript
import type { <Feature>StressTestConfig } from '@/stress-tests/<feature>-stress-test';
```

#### 4b. Add method to Window interface (in the `declare global` block)

```typescript
declare global {
  interface Window {
    __orbit_debug?:
      | {
          // ... existing methods ...
          run<Feature>StressTest: (config?: <Feature>StressTestConfig) => Promise<unknown>;
        }
      | undefined;
  }
}
```

#### 4c. Add dynamic import in the dev-mode useEffect (in the `window.__orbit_debug = { ... }` object)

```typescript
run<Feature>StressTest: async (config?: <Feature>StressTestConfig) => {
  const { run<Feature>StressTest } = await import(
    '@/stress-tests/<feature>-stress-test'
  );
  return run<Feature>StressTest(
    {
      handleSend: actions.handleSend,
      handleStop: actions.handleStop,
      // Pass whatever deps your test needs from actions + postMessage
    },
    config
  );
},
```

### Phase 5: Verify

Run these checks to confirm everything compiles:

```bash
bun run typecheck   # No errors
bun run lint        # Zero warnings
```

Report the results to the user. Include how to run the test:

```
window.__orbit_debug.run<Feature>StressTest()
// or with config:
window.__orbit_debug.run<Feature>StressTest({ delayBetweenMessages: 200 })
```

## Available Dependencies

Your test's Deps interface can include any of these (provided by `createChatActions` in `hooks/chat/handlers/chat-actions.ts`):

| Dep                        | Type                            | Use for                                   |
| -------------------------- | ------------------------------- | ----------------------------------------- |
| `handleSend`               | `(text: string) => void`        | Send a user message in the active session |
| `handleStop`               | `() => void`                    | Stop the agent mid-stream                 |
| `handleRewind`             | `(messageId: string) => void`   | Rewind to a specific message              |
| `handleModelChange`        | `(model: Model) => void`        | Switch AI model                           |
| `handleEffortLevelChange`  | `(level: EffortLevel) => void`  | Change effort level                       |
| `handleThinkingModeChange` | `(mode: ThinkingMode) => void`  | Change thinking mode                      |
| `postMessage`              | `(msg: WebviewMessage) => void` | Send raw Tauri messages                   |

## Available Stores

Access imperatively via `useXxxStore.getState()`:

| Store                   | Key state                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| `useChatStore`          | `activeSessionId`, `sessions[id].messages`, `sessions[id].isAgentRunning` |
| `useUIStore`            | `conversations` (sidebar), `activeConversationId`                         |
| `useCheckpointStore`    | `turnStartCheckpoints`, `turnEndCheckpoints`                              |
| `useToolStore`          | `currentSessionId`, `sessionUsage`, `model`, `effortLevel`                |
| `useMessageBufferStore` | `hasLoadPending()`                                                        |

## Key Rules

1. **Real Claude API calls** — no mocking. These tests verify the full pipeline.
2. **Prompts control response shape** — word counts, boundary markers, explicit file operations.
3. **Always include timeouts** — 120s for agent completion, 30s for streaming start.
4. **Log state snapshots** — use `logSessionState('label')` at key moments.
5. **Bail early on failure** — if step 3 fails, steps 4+ will cascade.
6. **Track session remaps** — frontend UUIDs get remapped to SDK UUIDs via `system:init`.
7. **Dev-only** — gated behind `import.meta.env.DEV` + dynamic imports = tree-shaken from production.
8. **String concatenation for logging** — use `'text ' + String(val)` not template literals (ESLint rule).
9. **No `any` types** — follow the project's strict TypeScript rules.
10. **Use `logger.warn` for all test output** — not `console.log` (ESLint rule).
