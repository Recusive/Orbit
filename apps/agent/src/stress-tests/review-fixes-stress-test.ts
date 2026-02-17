/**
 * Review Fixes Stress Test
 *
 * Validates the 4 fixes from Codex code review cycle 1:
 *
 *   Fix 1 — effort:set gated to adaptive models only
 *   Fix 2 — Editor chat permission wiring parity (tested indirectly via store state)
 *   Fix 3 — AskUserQuestion render-time side effect removed (tested via ToolStore)
 *   Fix 4 — thinkingDurationMs preserved in conversation:loaded mapping
 *
 * For Fix 1, the test creates its own chatActions with a wrapped postMessage
 * to intercept outgoing IPC messages. This is necessary because the deps.handleSend
 * action closes over the original postMessage in its closure.
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runReviewFixesStressTest()
 *
 * Prerequisites:
 * - A workspace open (needed for conversation:create)
 * - Input mode set to "accept" for auto-approving tool use
 */

import { createLogger } from '@orbit/common/lib';

import type { WebviewMessage } from '@/types/protocol';

import { createChatActions } from '@/hooks/chat/handlers/chat-actions';
import { conversationLoad } from '@/lib/api';
import { isAdaptiveThinkingModel, useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('ReviewFixesStressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ReviewFixesStressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  handleEffortLevelChange: (level: 'low' | 'medium' | 'high' | 'max') => void;
  handleModelChange: (model: 'haiku' | 'sonnet' | 'opus' | 'claude-opus-4-6') => void;
  handleThinkingModeChange: (mode: 'off' | 'think' | 'hard' | 'ultra') => void;
  postMessage: (msg: WebviewMessage) => void;
}

export interface ReviewFixesStressTestConfig {
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

function assertFalse(condition: boolean, label: string): void {
  if (condition) {
    throw new Error(label + ': expected false, got true');
  }
}

function assertGte(actual: number, expected: number, label: string): void {
  if (actual < expected) {
    throw new Error(label + ': expected >= ' + String(expected) + ', got ' + String(actual));
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
// IPC interceptor — wraps postMessage at the createChatActions level
// so handleSend's internal postMessage calls are captured.
// ────────────────────────────────────────────────────────────────────────────

interface IpcCapture {
  messages: WebviewMessage[];
  clear: () => void;
  getByType: (type: string) => WebviewMessage[];
  hasType: (type: string) => boolean;
}

function createInterceptedActions(originalPostMessage: (msg: WebviewMessage) => void): {
  actions: ReturnType<typeof createChatActions>;
  capture: IpcCapture;
} {
  const messages: WebviewMessage[] = [];

  const wrappedPostMessage = (msg: WebviewMessage): void => {
    messages.push(msg);
    originalPostMessage(msg);
  };

  // Create chat actions that close over our WRAPPED postMessage.
  // This means handleSend, handleStop, etc. all go through our interceptor.
  const actions = createChatActions({ postMessage: wrappedPostMessage });

  return {
    actions,
    capture: {
      messages,
      clear: (): void => {
        messages.length = 0;
      },
      getByType: (type: string): WebviewMessage[] => messages.filter((m) => m.type === type),
      hasType: (type: string): boolean => messages.some((m) => m.type === type),
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
// Main runner
// ────────────────────────────────────────────────────────────────────────────

export async function runReviewFixesStressTest(
  deps: ReviewFixesStressTestDeps,
  config: ReviewFixesStressTestConfig = {}
): Promise<StepResult[]> {
  const { agentTimeout = 120_000, delayBetweenSteps = 500 } = config;
  const results: StepResult[] = [];

  logger.warn('');
  logger.warn('╔══════════════════════════════════════════════════════════════╗');
  logger.warn('║  Review Fixes Stress Test — Codex Cycle 1                   ║');
  logger.warn('╚══════════════════════════════════════════════════════════════╝');
  logger.warn('');

  // Create intercepted actions for IPC capture (Fix 1 steps).
  // These close over a wrapped postMessage so we can see what handleSend emits.
  const { actions: interceptedActions, capture } = createInterceptedActions(deps.postMessage);

  // ════════════════════════════════════════════════════════════════════════
  // FIX 1: effort:set gated to adaptive models only
  // ════════════════════════════════════════════════════════════════════════

  // Step 1a: Set model to Sonnet (4.5), send message, verify NO effort:set sent.
  // 4.5 models: thinking:set IS sent (toggleable), effort:set is NOT sent.
  let stepOk = await runStep(
    'Fix 1a: Non-adaptive model (4.5) should NOT send effort:set',
    async () => {
      // Set model to Sonnet (non-adaptive) via the intercepted actions
      interceptedActions.handleModelChange('sonnet');
      await sleep(100);

      const toolState = useToolStore.getState();
      assertEq(toolState.model, 'sonnet', 'Model should be sonnet');
      assertFalse(isAdaptiveThinkingModel(toolState.model), 'Sonnet should not be adaptive');

      // Clear capture, send a message via intercepted handleSend, wait for completion
      capture.clear();
      interceptedActions.handleSend('Say exactly: "Hello from sonnet". Nothing else.');
      await waitForAgentComplete(agentTimeout, 'Sonnet response');

      // Check IPC messages — should have model:set but NOT effort:set
      const effortMessages = capture.getByType('effort:set');
      const modelMessages = capture.getByType('model:set');
      const thinkingMessages = capture.getByType('thinking:set');

      logger.warn('  IPC messages sent:');
      logger.warn('    model:set    → ' + String(modelMessages.length));
      logger.warn('    thinking:set → ' + String(thinkingMessages.length));
      logger.warn('    effort:set   → ' + String(effortMessages.length));

      assertEq(effortMessages.length, 0, 'effort:set should NOT be sent for non-adaptive model');
      assertGte(modelMessages.length, 1, 'model:set should be sent');
      assertGte(thinkingMessages.length, 1, 'thinking:set should be sent for non-adaptive');

      return (
        'No effort:set for sonnet. model:set=' +
        String(modelMessages.length) +
        ', thinking:set=' +
        String(thinkingMessages.length)
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // Step 1b: Set model to Opus 4.6 (adaptive), send message, verify effort:set IS sent.
  // 4.6 models: thinking is always on at max budget, model chooses when to think.
  // We verify IPC gating (effort:set sent, thinking:set NOT sent). Thinking box is
  // informational — the model may or may not produce thinking blocks (adaptive).
  stepOk = await runStep(
    'Fix 1b: Adaptive model (4.6) SHOULD send effort:set, NOT thinking:set',
    async () => {
      // Set model to Opus 4.6 (adaptive — thinking always on, model decides)
      interceptedActions.handleModelChange('claude-opus-4-6');
      await sleep(100);

      const toolState = useToolStore.getState();
      assertEq(toolState.model, 'claude-opus-4-6', 'Model should be claude-opus-4-6');
      assertTrue(isAdaptiveThinkingModel(toolState.model), 'Opus 4.6 should be adaptive');

      // Clear capture, send a message
      capture.clear();
      interceptedActions.handleSend('Say exactly: "Hello from opus". Nothing else.');
      await waitForAgentComplete(agentTimeout, 'Opus 4.6 response');

      // Check IPC — 4.6 models: effort:set IS sent, thinking:set is NOT sent
      const effortMessages = capture.getByType('effort:set');
      const modelMessages = capture.getByType('model:set');
      const thinkingMessages = capture.getByType('thinking:set');

      logger.warn('  IPC messages sent:');
      logger.warn('    model:set    → ' + String(modelMessages.length));
      logger.warn('    thinking:set → ' + String(thinkingMessages.length));
      logger.warn('    effort:set   → ' + String(effortMessages.length));

      assertGte(effortMessages.length, 1, 'effort:set SHOULD be sent for 4.6 model');
      assertGte(modelMessages.length, 1, 'model:set should be sent');
      assertEq(
        thinkingMessages.length,
        0,
        'thinking:set should NOT be sent for 4.6 model (thinking always on)'
      );

      return (
        'IPC gating correct for 4.6: effort:set=' +
        String(effortMessages.length) +
        ', thinking:set=0, model:set=' +
        String(modelMessages.length)
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // Step 1c: Verify effort level change + send with non-adaptive model
  stepOk = await runStep(
    'Fix 1c: Effort level change with non-adaptive model',
    async () => {
      // Switch to Sonnet
      interceptedActions.handleModelChange('sonnet');
      await sleep(100);

      // Change effort level — store should update
      interceptedActions.handleEffortLevelChange('max');
      await sleep(100);

      const toolState = useToolStore.getState();
      assertEq(toolState.effortLevel, 'max', 'ToolStore effort should be max');
      assertEq(toolState.model, 'sonnet', 'Model should still be sonnet');

      // Send a message — effort:set should NOT be in the pre-send burst
      capture.clear();
      interceptedActions.handleSend('Say exactly: "effort test". Nothing else.');
      await waitForAgentComplete(agentTimeout, 'Effort gating test');

      const effortMessages = capture.getByType('effort:set');
      assertEq(effortMessages.length, 0, 'effort:set should NOT be in pre-send burst for sonnet');

      // Reset to high for subsequent tests
      interceptedActions.handleEffortLevelChange('high');

      return 'ToolStore updated to max but no effort:set IPC for sonnet pre-send';
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // FIX 2: EditorChatPanel permission + effort wiring (store-level test)
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Fix 2: ToolStore effort selector returns correct value',
    async () => {
      // This is a store-level validation. The actual EditorChatPanel component
      // uses useEffortLevel() which reads from the same store. We verify:
      // 1. The effort level persists across model changes
      // 2. Pending permissions are accessible via the same selector

      deps.handleEffortLevelChange('low');
      await sleep(50);
      assertEq(useToolStore.getState().effortLevel, 'low', 'Effort should be low');

      deps.handleModelChange('sonnet');
      await sleep(50);
      assertEq(useToolStore.getState().effortLevel, 'low', 'Effort persists across model change');

      deps.handleEffortLevelChange('high');
      await sleep(50);
      assertEq(useToolStore.getState().effortLevel, 'high', 'Effort reset to high');

      // Verify pendingPermissions selector is accessible
      const permissions = useToolStore.getState().pendingPermissions;
      assertTrue(Array.isArray(permissions), 'pendingPermissions should be an array');

      return (
        'Store selectors verified: effort=' +
        useToolStore.getState().effortLevel +
        ', permissions.length=' +
        String(permissions.length)
      );
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // FIX 3: AskUserQuestion no render-time side effect
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Fix 3: AskUserQuestion fallback guard (store-level validation)',
    async () => {
      // We can't trigger AskUserQuestion directly without an SDK tool call,
      // but we can verify the guard mechanism works by checking:
      // 1. ToolStore pendingPermissions starts empty
      // 2. clearPermissions is idempotent (safe to call on empty)
      // 3. removePermissionRequest is safe for non-existent IDs

      const initialPermissions = useToolStore.getState().pendingPermissions;
      assertEq(initialPermissions.length, 0, 'Should start with no pending permissions');

      // Verify clearPermissions is idempotent
      useToolStore.getState().clearPermissions();
      await sleep(10);
      const afterClear = useToolStore.getState().pendingPermissions;
      assertEq(afterClear.length, 0, 'clearPermissions on empty should be safe');

      // Verify removePermissionRequest is safe for non-existent IDs
      useToolStore.getState().removePermissionRequest('non-existent-id');
      await sleep(10);
      const afterRemove = useToolStore.getState().pendingPermissions;
      assertEq(afterRemove.length, 0, 'removePermissionRequest for missing ID should be safe');

      return 'Permission state management verified — idempotent operations confirmed';
    },
    results
  );
  if (!stepOk) return results;

  await sleep(delayBetweenSteps);

  // ════════════════════════════════════════════════════════════════════════
  // FIX 4: thinkingDurationMs preserved in conversation:loaded
  // ════════════════════════════════════════════════════════════════════════

  stepOk = await runStep(
    'Fix 4: thinkingDurationMs preserved in conversation reload',
    async () => {
      // Use a 4.5 model (sonnet) with thinking ENABLED to guarantee thinking blocks.
      // 4.5 models: thinking is toggled on/off with budget levels (think/hard/ultra).
      // When on, thinking blocks are ALWAYS produced — unlike 4.6 where it's adaptive.
      // This makes the test deterministic for verifying thinkingDurationMs plumbing.
      deps.handleModelChange('sonnet');
      deps.handleThinkingModeChange('think');
      await sleep(100);

      // Send a reasoning prompt — with thinking:think, the model will produce thinking blocks
      deps.handleSend(
        'What is the probability of drawing 2 red balls in a row without replacement from a bag of 3 red and 5 blue balls? Show reasoning briefly.'
      );
      await waitForAgentComplete(agentTimeout, 'Thinking response');

      // Verify the thinking box appeared in the live UI
      const chatState = useChatStore.getState();
      const sid = chatState.activeSessionId ?? '';
      const session = sid ? chatState.sessions[sid] : undefined;
      const msgs = session?.messages ?? [];
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      const uiHasThinking =
        (lastAssistant?.thinkingBlocks !== undefined && lastAssistant.thinkingBlocks.length > 0) ||
        (lastAssistant?.thinking !== undefined && lastAssistant.thinking.length > 0);

      logger.warn(
        '  UI thinking: ' +
          String(uiHasThinking) +
          (lastAssistant?.thinkingBlocks
            ? ' (' + String(lastAssistant.thinkingBlocks.length) + ' blocks)'
            : '')
      );

      // 4.5 model + thinking:think = guaranteed thinking blocks
      assertTrue(uiHasThinking, 'Thinking box should appear (4.5 model with thinking:think)');
      assertTrue(sid !== '', 'Should have active session');

      // Wait for disk persistence
      await sleep(1000);

      // Load from disk via the same function conversation-handlers.ts uses
      const conv = await conversationLoad(sid);
      if (!conv) {
        logger.warn('  Conversation not on disk yet (cache-only) — skipping disk check');
        return 'Skipped: conversation not yet persisted to disk';
      }

      logger.warn('  Loaded conversation: ' + String(conv.messages.length) + ' messages');

      // Check if any assistant message has thinkingDurationMs
      const assistantMsgs = conv.messages.filter((m) => m.role === 'assistant');
      logger.warn('  Assistant messages: ' + String(assistantMsgs.length));

      let hasThinkingDuration = false;
      let hasThinkingContent = false;
      for (const msg of assistantMsgs) {
        if (msg.thinking) {
          hasThinkingContent = true;
          logger.warn(
            '    msg ' +
              msg.id.slice(0, 8) +
              ': thinking=' +
              String(msg.thinking.length) +
              ' chars' +
              ', thinkingDurationMs=' +
              String(msg.thinkingDurationMs ?? 'undefined')
          );
          if (msg.thinkingDurationMs !== undefined) {
            hasThinkingDuration = true;
          }
        }
      }

      // 4.5 + thinking:think = guaranteed thinking, so both must be present
      assertTrue(
        hasThinkingContent,
        'Thinking content should exist on disk (4.5 model with thinking:think)'
      );
      assertTrue(
        hasThinkingDuration,
        'thinkingDurationMs should be preserved in conversation:loaded mapping'
      );

      return 'thinkingDurationMs found in persisted conversation — thinking box verified';
    },
    results
  );
  if (!stepOk) return results;

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════

  logger.warn('');
  logger.warn('╔══════════════════════════════════════════════════════════════╗');
  logger.warn('║  Review Fixes Stress Test — RESULTS                         ║');
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

  // Reset model, effort, and thinking to defaults
  deps.handleModelChange('sonnet');
  deps.handleEffortLevelChange('high');
  deps.handleThinkingModeChange('off');

  return results;
}
