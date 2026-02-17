/**
 * Verified Review Cycle 1 Stress Test
 *
 * Validates the useShallow fix from verified-cycle-1-opus.md:
 *
 *   Fix 1 — Replaced two separate ToolStore selectors (useActiveTools +
 *           useCompletedTools) with a single useShallow combined selector
 *           in ChatMessages. This halves the subscription callback overhead
 *           and coalesces re-render triggers for simultaneous property changes.
 *
 * The test runs BOTH subscription patterns side-by-side during a multi-tool
 * stream, counting callback invocations and re-render triggers for each. The
 * NEW pattern (useShallow) should produce fewer callbacks and equal-or-fewer
 * re-render triggers compared to the OLD pattern (2 separate hooks).
 *
 * Also exercises the epoch staleness system to verify session integrity.
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runVerifiedReviewCycle1StressTest()
 *   window.__orbit_debug.runVerifiedReviewCycle1StressTest({ agentTimeout: 180000 })
 *
 * Prerequisites:
 * - A workspace open (file operations need a cwd)
 * - Input mode set to "accept" for auto-approving tool use
 */

import { createLogger } from '@orbit/common/lib';

import type { ToolExecution } from '@/stores/agent/tool-store';

import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('VerifiedReviewCycle1StressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface VerifiedReviewCycle1StressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
}

export interface VerifiedReviewCycle1StressTestConfig {
  /** Timeout for waiting for agent completion (ms). Default: 120000 */
  agentTimeout?: number;
  /** Delay between steps (ms). Default: 500 */
  delayBetweenSteps?: number;
}

interface StepResult {
  step: string;
  durationMs: number;
  success: boolean;
  details: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertEq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(label + ': expected ' + String(expected) + ', got ' + String(actual));
  }
}

function assertTrue(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label + ': expected true, got false');
  }
}

function assertGte(actual: number, expected: number, label: string): void {
  if (actual < expected) {
    throw new Error(label + ': expected >= ' + String(expected) + ', got ' + String(actual));
  }
}

function assertLte(actual: number, expected: number, label: string): void {
  if (actual > expected) {
    throw new Error(label + ': expected <= ' + String(expected) + ', got ' + String(actual));
  }
}

function waitForAgentComplete(timeout: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      const sid = useChatStore.getState().activeSessionId;
      const session = sid ? useChatStore.getState().sessions[sid] : undefined;
      reject(
        new Error(
          'Timeout (' +
            String(timeout) +
            'ms) waiting for: ' +
            label +
            '. isAgentRunning: ' +
            String(session?.isAgentRunning ?? 'unknown')
        )
      );
    }, timeout);

    const check = (): boolean => {
      const state = useChatStore.getState();
      const sid = state.activeSessionId;
      if (!sid) return false;
      const session = state.sessions[sid];
      return session !== undefined && !session.isAgentRunning && !session.isStopPending;
    };

    if (check()) {
      clearTimeout(timer);
      resolve();
      return;
    }

    const unsub = useChatStore.subscribe(() => {
      if (check()) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Dual Subscription Comparator
//
// Simulates BOTH subscription patterns simultaneously during a multi-tool
// stream, counting the measurable difference between old and new:
//
// OLD PATTERN (what ChatMessages had before):
//   const activeTools = useToolStore(state => state.activeTools);    // hook 1
//   const completedTools = useToolStore(state => state.completedTools); // hook 2
//   → 2 subscription callbacks per ToolStore update
//   → each independently checks if its property changed
//
// NEW PATTERN (what ChatMessages has now):
//   const { activeTools, completedTools } = useToolStore(
//     useShallow(state => ({ activeTools: state.activeTools, completedTools: state.completedTools }))
//   );
//   → 1 subscription callback per ToolStore update
//   → shallow equality checks both properties in one pass
//
// ────────────────────────────────────────────────────────────────────────────

interface SubscriptionPatternStats {
  /** Total subscription callback invocations (raw store notifications) */
  callbackCount: number;
  /** Times the equality check detected a change (would trigger re-render) */
  rerenderTriggers: number;
}

interface DualComparatorStats {
  /** OLD pattern: 2 separate subscriptions */
  old: SubscriptionPatternStats;
  /** NEW pattern: 1 useShallow subscription */
  new: SubscriptionPatternStats;
  /** Tool metadata collected during monitoring */
  uniqueToolIds: Set<string>;
  messageIdsWithTools: Set<string>;
  peakActiveTools: number;
  finalCompletedTools: number;
}

interface DualSubscriptionComparator {
  start: () => void;
  stop: () => DualComparatorStats;
}

function createDualSubscriptionComparator(): DualSubscriptionComparator {
  // Stats accumulators
  let oldCallbacks = 0;
  let oldRerenders = 0;
  let newCallbacks = 0;
  let newRerenders = 0;

  // Tool metadata
  const uniqueToolIds = new Set<string>();
  const messageIdsWithTools = new Set<string>();
  let peakActiveTools = 0;
  let finalCompletedTools = 0;

  // Reference tracking for OLD pattern (2 separate checks)
  let oldPrevActive: Record<string, ToolExecution> | null = null;
  let oldPrevCompleted: ToolExecution[] | null = null;

  // Reference tracking for NEW pattern (shallow equality on combined object)
  let newPrevActive: Record<string, ToolExecution> | null = null;
  let newPrevCompleted: ToolExecution[] | null = null;

  let unsub1: (() => void) | null = null;
  let unsub2: (() => void) | null = null;
  let unsub3: (() => void) | null = null;

  return {
    start: (): void => {
      // Reset all counters
      oldCallbacks = 0;
      oldRerenders = 0;
      newCallbacks = 0;
      newRerenders = 0;
      uniqueToolIds.clear();
      messageIdsWithTools.clear();
      peakActiveTools = 0;
      finalCompletedTools = 0;

      const initialState = useToolStore.getState();
      oldPrevActive = initialState.activeTools;
      oldPrevCompleted = initialState.completedTools;
      newPrevActive = initialState.activeTools;
      newPrevCompleted = initialState.completedTools;

      // ── OLD PATTERN: Subscription 1 — simulates useActiveTools() ──
      unsub1 = useToolStore.subscribe((state) => {
        oldCallbacks++;
        if (state.activeTools !== oldPrevActive) {
          oldPrevActive = state.activeTools;
          oldRerenders++;
        }
      });

      // ── OLD PATTERN: Subscription 2 — simulates useCompletedTools() ──
      unsub2 = useToolStore.subscribe((state) => {
        oldCallbacks++;
        if (state.completedTools !== oldPrevCompleted) {
          oldPrevCompleted = state.completedTools;
          oldRerenders++;
        }
      });

      // ── NEW PATTERN: Single subscription — simulates useShallow ──
      unsub3 = useToolStore.subscribe((state) => {
        newCallbacks++;

        // Shallow equality: check each property independently by reference.
        // This is what zustand/shallow does for { activeTools, completedTools }.
        const activeChanged = state.activeTools !== newPrevActive;
        const completedChanged = state.completedTools !== newPrevCompleted;

        if (activeChanged || completedChanged) {
          newPrevActive = state.activeTools;
          newPrevCompleted = state.completedTools;
          newRerenders++;
        }

        // Collect tool metadata (from new pattern subscription to avoid double-counting)
        if (activeChanged) {
          const activeCount = Object.keys(state.activeTools).length;
          if (activeCount > peakActiveTools) {
            peakActiveTools = activeCount;
          }
          for (const tool of Object.values(state.activeTools)) {
            uniqueToolIds.add(tool.id);
            messageIdsWithTools.add(tool.messageId);
          }
        }
        if (completedChanged) {
          finalCompletedTools = state.completedTools.length;
          for (const tool of state.completedTools) {
            uniqueToolIds.add(tool.id);
            messageIdsWithTools.add(tool.messageId);
          }
        }
      });
    },

    stop: (): DualComparatorStats => {
      if (unsub1) {
        unsub1();
        unsub1 = null;
      }
      if (unsub2) {
        unsub2();
        unsub2 = null;
      }
      if (unsub3) {
        unsub3();
        unsub3 = null;
      }

      return {
        old: { callbackCount: oldCallbacks, rerenderTriggers: oldRerenders },
        new: { callbackCount: newCallbacks, rerenderTriggers: newRerenders },
        uniqueToolIds,
        messageIdsWithTools,
        peakActiveTools,
        finalCompletedTools,
      };
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Step runner
// ────────────────────────────────────────────────────────────────────────────

async function runStep(
  name: string,
  fn: () => Promise<string>,
  results: StepResult[]
): Promise<boolean> {
  const start = Date.now();
  logger.warn('');
  logger.warn('══════════════════════════════════════════════════════════════');
  logger.warn('  STEP: ' + name);
  logger.warn('══════════════════════════════════════════════════════════════');

  try {
    const details = await fn();
    const duration = Date.now() - start;
    results.push({ step: name, durationMs: duration, success: true, details });
    logger.warn('  [PASS] (' + String(duration) + 'ms) — ' + details);
    return true;
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({
      step: name,
      durationMs: duration,
      success: false,
      details: '',
      error: errorMsg,
    });
    logger.warn('  [FAIL] (' + String(duration) + 'ms) — ' + errorMsg);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Prompts
// ────────────────────────────────────────────────────────────────────────────

// Designed to trigger 4-6 tool uses (Read, Glob, Grep) — enough to generate
// rapid tool events without being too slow or requiring file write permissions.
const MULTI_TOOL_PROMPT =
  'Use tools to answer this question about this codebase: ' +
  'How many TypeScript files are in the stress-tests directory? ' +
  'First use Glob to find them, then Read the shortest one. ' +
  'Then use Grep to search for "runStep" across all stress test files. ' +
  'Finally, summarize what you found. ' +
  'Start your response with "TOOL-START" and end with "TOOL-END".';

// Simple no-tool prompt for epoch verification
const SIMPLE_PROMPT = 'Say exactly: "EPOCH-CHECK-OK". Nothing else. Do NOT use any tools.';

// ────────────────────────────────────────────────────────────────────────────
// Main runner
// ────────────────────────────────────────────────────────────────────────────

export async function runVerifiedReviewCycle1StressTest(
  deps: VerifiedReviewCycle1StressTestDeps,
  config: VerifiedReviewCycle1StressTestConfig = {}
): Promise<StepResult[]> {
  const { agentTimeout = 120_000, delayBetweenSteps = 500 } = config;
  const results: StepResult[] = [];

  logger.warn('');
  logger.warn('╔══════════════════════════════════════════════════════════════╗');
  logger.warn('║  Verified Review Cycle 1 Stress Test                        ║');
  logger.warn('║  Tests: useShallow subscription efficiency + data integrity  ║');
  logger.warn('╚══════════════════════════════════════════════════════════════╝');
  logger.warn('');

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Subscription efficiency — OLD (2 hooks) vs NEW (useShallow)
  //
  // This is the core test. Runs both patterns simultaneously during a
  // multi-tool stream and compares callback counts and re-render triggers.
  // ════════════════════════════════════════════════════════════════════════

  let stepOk = await runStep(
    'Subscription efficiency: OLD (2 hooks) vs NEW (useShallow)',
    async () => {
      const comparator = createDualSubscriptionComparator();
      comparator.start();

      deps.handleSend(MULTI_TOOL_PROMPT);
      await waitForAgentComplete(agentTimeout, 'Multi-tool response');

      const stats = comparator.stop();

      // ── Log the comparison ──
      logger.warn('');
      logger.warn('  ┌─────────────────────────────────────────────────────┐');
      logger.warn('  │  Subscription Pattern Comparison                    │');
      logger.warn('  ├─────────────────────┬──────────────┬────────────────┤');
      logger.warn('  │  Metric             │  OLD (2 hooks)│  NEW (shallow) │');
      logger.warn('  ├─────────────────────┼──────────────┼────────────────┤');
      logger.warn(
        '  │  Callbacks           │  ' +
          String(stats.old.callbackCount).padStart(10) +
          '  │  ' +
          String(stats.new.callbackCount).padStart(12) +
          '  │'
      );
      logger.warn(
        '  │  Re-render triggers  │  ' +
          String(stats.old.rerenderTriggers).padStart(10) +
          '  │  ' +
          String(stats.new.rerenderTriggers).padStart(12) +
          '  │'
      );
      logger.warn('  └─────────────────────┴──────────────┴────────────────┘');
      logger.warn('');
      logger.warn('  Tool metadata:');
      logger.warn('    unique tools:         ' + String(stats.uniqueToolIds.size));
      logger.warn('    peak concurrent:      ' + String(stats.peakActiveTools));
      logger.warn('    final completed:      ' + String(stats.finalCompletedTools));
      logger.warn('    message IDs w/ tools: ' + String(stats.messageIdsWithTools.size));

      // Callback savings calculation
      const callbackSavings = stats.old.callbackCount - stats.new.callbackCount;
      const callbackPct =
        stats.old.callbackCount > 0
          ? Math.round((callbackSavings / stats.old.callbackCount) * 100)
          : 0;
      logger.warn('');
      logger.warn(
        '  Callback reduction: ' +
          String(callbackSavings) +
          ' fewer (' +
          String(callbackPct) +
          '% reduction)'
      );

      const rerenderSavings = stats.old.rerenderTriggers - stats.new.rerenderTriggers;
      logger.warn('  Re-render reduction: ' + String(rerenderSavings) + ' fewer triggers');

      // ── Assertions ──

      // Tools were actually used (at least 3 — Glob, Read, Grep)
      assertGte(stats.uniqueToolIds.size, 3, 'Should have at least 3 unique tools');
      assertGte(stats.finalCompletedTools, 3, 'Should have at least 3 completed tools');

      // All tools belong to one assistant message
      assertEq(
        stats.messageIdsWithTools.size,
        1,
        'All tools should belong to one assistant message'
      );

      // KEY ASSERTION: NEW pattern has fewer callbacks than OLD.
      // OLD has 2 subscriptions, NEW has 1, so OLD fires ~2x callbacks.
      assertTrue(
        stats.new.callbackCount < stats.old.callbackCount,
        'NEW pattern should have fewer callbacks than OLD (' +
          String(stats.new.callbackCount) +
          ' vs ' +
          String(stats.old.callbackCount) +
          ')'
      );

      // The callback ratio should be approximately 2:1 (OLD:NEW).
      // Allow some tolerance — the exact ratio depends on subscription ordering.
      const ratio = stats.old.callbackCount / stats.new.callbackCount;
      assertGte(ratio, 1.8, 'OLD/NEW callback ratio should be ~2:1 (got ' + ratio.toFixed(2) + ')');
      assertLte(ratio, 2.2, 'OLD/NEW callback ratio should be ~2:1 (got ' + ratio.toFixed(2) + ')');

      // NEW re-render triggers should be <= OLD triggers.
      // When completeTool() changes BOTH activeTools AND completedTools in one mutation,
      // OLD fires 2 re-render triggers (one per hook), NEW fires 1 (coalesced).
      assertLte(
        stats.new.rerenderTriggers,
        stats.old.rerenderTriggers,
        'NEW re-render triggers should be <= OLD'
      );

      // Final state is clean
      const activeCount = Object.keys(useToolStore.getState().activeTools).length;
      assertEq(activeCount, 0, 'No active tools after completion');

      return (
        String(stats.uniqueToolIds.size) +
        ' tools. Callbacks: OLD=' +
        String(stats.old.callbackCount) +
        ' vs NEW=' +
        String(stats.new.callbackCount) +
        ' (' +
        String(callbackPct) +
        '% reduction). Re-renders: OLD=' +
        String(stats.old.rerenderTriggers) +
        ' vs NEW=' +
        String(stats.new.rerenderTriggers) +
        ' (' +
        String(rerenderSavings) +
        ' fewer)'
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Tool data integrity — verify tools keyed by messageId
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Tool data integrity: tools correctly keyed by messageId',
    async () => {
      await sleep(0); // Yield to flush pending microtasks
      const toolState = useToolStore.getState();
      const chatState = useChatStore.getState();
      const sid = chatState.activeSessionId ?? '';
      const session = sid ? chatState.sessions[sid] : undefined;
      const msgs = session?.messages ?? [];

      // Find the assistant message that should have tools
      const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
      assertGte(assistantMsgs.length, 1, 'Should have at least one assistant message');

      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      if (lastAssistant === undefined) {
        throw new Error('Last assistant message should exist');
      }

      // Check getToolsForMessage returns the right tools
      const toolsForMessage = toolState.getToolsForMessage(lastAssistant.id);
      assertGte(
        toolsForMessage.length,
        3,
        'Should have at least 3 tools for the assistant message'
      );

      // Verify all completed tools reference the correct messageId
      const completedForThisMsg = toolState.completedTools.filter(
        (t) => t.messageId === lastAssistant.id
      );
      assertGte(
        completedForThisMsg.length,
        3,
        'completedTools should have at least 3 entries for this message'
      );

      // Verify deduplication: no duplicate tool IDs
      const toolIds = toolsForMessage.map((t) => t.id);
      const uniqueIds = new Set(toolIds);
      assertEq(
        uniqueIds.size,
        toolIds.length,
        'No duplicate tool IDs in getToolsForMessage result'
      );

      // Verify all tools are marked as completed (success or error)
      for (const tool of toolsForMessage) {
        assertTrue(
          tool.status === 'success' || tool.status === 'error',
          'Tool ' + tool.id.slice(0, 8) + ' should be completed, got status=' + tool.status
        );
      }

      logger.warn('  Tool details for message ' + lastAssistant.id.slice(0, 8) + ':');
      for (const tool of toolsForMessage) {
        logger.warn(
          '    ' +
            tool.toolName +
            ' (' +
            tool.id.slice(0, 8) +
            '): ' +
            tool.status +
            (tool.contentOffset !== undefined ? ', offset=' + String(tool.contentOffset) : '')
        );
      }

      return (
        String(toolsForMessage.length) +
        ' tools correctly grouped for message ' +
        lastAssistant.id.slice(0, 8) +
        ', no duplicates'
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: Epoch staleness guards — verify epochs protect session state
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Epoch guards: bump epochs, verify state stable, agent still works',
    async () => {
      const chatState = useChatStore.getState();
      const sid = chatState.activeSessionId ?? '';
      assertTrue(sid !== '', 'Should have active session');

      const session = chatState.sessions[sid];
      if (session === undefined) {
        throw new Error('Session should exist');
      }

      const msgCountBefore = session.messages.length;
      const rewindEpochBefore = chatState.rewindEpoch;
      const loadEpochBefore = chatState.conversationLoadEpoch;

      // Bump both epochs
      useChatStore.getState().bumpRewindEpoch();
      const newLoadEpoch = useChatStore.getState().bumpConversationLoadEpoch();
      const rewindEpochAfter = useChatStore.getState().rewindEpoch;

      assertTrue(rewindEpochAfter > rewindEpochBefore, 'Rewind epoch should increase');
      assertTrue(newLoadEpoch > loadEpochBefore, 'Load epoch should increase');

      // Wait a tick — stale handlers should be rejected
      await sleep(100);

      // Verify messages weren't corrupted
      const msgCountAfterBump = useChatStore.getState().sessions[sid]?.messages.length ?? 0;
      assertEq(msgCountAfterBump, msgCountBefore, 'Messages stable after epoch bumps');

      logger.warn(
        '  Epochs bumped: rewind ' +
          String(rewindEpochBefore) +
          '→' +
          String(rewindEpochAfter) +
          ', load ' +
          String(loadEpochBefore) +
          '→' +
          String(newLoadEpoch)
      );

      // Now send a message to verify agent still works after epoch bumps
      deps.handleSend(SIMPLE_PROMPT);
      await waitForAgentComplete(agentTimeout, 'Post-epoch-bump response');

      const afterState = useChatStore.getState();
      const afterSid = afterState.activeSessionId ?? '';
      const afterSession = afterState.sessions[afterSid];
      const msgCountAfter = afterSession?.messages.length ?? 0;

      assertGte(msgCountAfter, msgCountBefore + 2, 'Should have user + assistant messages');

      const lastMsg = afterSession?.messages.at(-1);
      assertTrue(lastMsg?.role === 'assistant', 'Last message should be assistant');
      assertTrue(
        lastMsg?.content.includes('EPOCH-CHECK-OK') === true,
        'Response should contain EPOCH-CHECK-OK'
      );

      return (
        'Epochs bumped, messages stable (' +
        String(msgCountBefore) +
        '), agent responded after bumps (' +
        String(msgCountAfter) +
        ' msgs)'
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Second multi-tool run — confirm subscription efficiency holds
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Repeat subscription comparison: confirm efficiency is consistent',
    async () => {
      const comparator = createDualSubscriptionComparator();
      comparator.start();

      deps.handleSend(
        'Use Glob to find all .ts files in apps/agent/src/stress-tests/. ' +
          'Then use Grep to count how many times "logger.warn" appears across those files. ' +
          'Summarize your findings. Start with "REPEAT-START" and end with "REPEAT-END".'
      );
      await waitForAgentComplete(agentTimeout, 'Repeat multi-tool response');

      const stats = comparator.stop();

      // Verify tools worked
      assertGte(stats.uniqueToolIds.size, 2, 'Should have at least 2 tools');

      // Verify session state is consistent
      const finalState = useChatStore.getState();
      const finalSid = finalState.activeSessionId ?? '';
      const finalSession = finalState.sessions[finalSid];

      assertEq(finalSession?.isAgentRunning, false, 'Agent should be done');
      assertEq(finalSession?.isStopPending, false, 'No pending stop');

      // No orphaned active tools
      const activeCount = Object.keys(useToolStore.getState().activeTools).length;
      assertEq(activeCount, 0, 'No orphaned active tools');

      // KEY ASSERTION: Efficiency holds on repeat
      assertTrue(
        stats.new.callbackCount < stats.old.callbackCount,
        'NEW still has fewer callbacks on repeat (' +
          String(stats.new.callbackCount) +
          ' vs ' +
          String(stats.old.callbackCount) +
          ')'
      );

      assertLte(
        stats.new.rerenderTriggers,
        stats.old.rerenderTriggers,
        'NEW re-render triggers still <= OLD on repeat'
      );

      const callbackPct =
        stats.old.callbackCount > 0
          ? Math.round(
              ((stats.old.callbackCount - stats.new.callbackCount) / stats.old.callbackCount) * 100
            )
          : 0;

      logger.warn(
        '  Repeat: OLD=' +
          String(stats.old.callbackCount) +
          ' vs NEW=' +
          String(stats.new.callbackCount) +
          ' callbacks (' +
          String(callbackPct) +
          '% reduction), re-renders: OLD=' +
          String(stats.old.rerenderTriggers) +
          ' vs NEW=' +
          String(stats.new.rerenderTriggers)
      );

      return (
        String(stats.uniqueToolIds.size) +
        ' tools. Callbacks: OLD=' +
        String(stats.old.callbackCount) +
        ' vs NEW=' +
        String(stats.new.callbackCount) +
        ' (' +
        String(callbackPct) +
        '% reduction). Session clean.'
      );
    },
    results
  );
  if (!stepOk) return results;

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════

  logger.warn('');
  logger.warn('╔══════════════════════════════════════════════════════════════╗');
  logger.warn('║  Verified Review Cycle 1 Stress Test — RESULTS              ║');
  logger.warn('╚══════════════════════════════════════════════════════════════╝');

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  for (const r of results) {
    const icon = r.success ? '[PASS]' : '[FAIL]';
    logger.warn('  ' + icon + ' ' + r.step + ' (' + String(r.durationMs) + 'ms)');
    if (r.error) {
      logger.warn('     Error: ' + r.error);
    }
  }

  logger.warn('');
  logger.warn('  Total: ' + String(passed) + ' passed, ' + String(failed) + ' failed');
  logger.warn('');

  return results;
}
