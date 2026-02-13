/**
 * Rewind Stress Test v2
 *
 * An in-app script that programmatically drives the real message pipeline
 * to stress-test the rewind system. Exercises the full async flow:
 * Tauri events -> ChatMessageService -> ChatStore -> CheckpointStore -> JSONL I/O.
 *
 * Test sequence:
 *   1. Send message 1
 *   2. Send message 2
 *   3. Send message 3
 *   4. Rewind to message 2's response
 *   5. Send message 4 (on rewound branch)
 *   6. Rewind again to message 2's response, then send "How many messages
 *      have I sent in this chat?" — verifies Claude's context is correct
 *
 * Includes a continuous state recorder that logs every ChatStore and
 * CheckpointStore mutation in real-time during the test.
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runRewindStressTest()
 *   window.__orbit_debug.runRewindStressTest({ delayBetweenMessages: 100 })
 *
 * Prerequisites:
 * - An active conversation (create one first if needed)
 * - Prompts are designed to avoid tool use (no permission blocks)
 */

import { createLogger } from '@orbit/common/lib';

import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('RewindStressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface StressTestDeps {
  handleSend: (text: string) => void;
  handleRewind: (messageId: string) => void;
  handleStop: () => void;
}

export interface StressTestConfig {
  /** Delay before sending next message after agent completes (ms). Default: 500 */
  delayBetweenMessages?: number;
  /** Delay before triggering rewind after agent completes (ms). Default: 1000 */
  delayBeforeRewind?: number;
  /** Timeout for waiting for agent completion (ms). Default: 120000 */
  agentTimeout?: number;
}

interface StepResult {
  step: string;
  durationMs: number;
  sessionId: string;
  messageCount: number;
  success: boolean;
  error?: string;
}

/** A single recorded event from the state recorder */
interface RecordedEvent {
  relativeMs: number;
  source: string;
  change: string;
  sessionId: string;
  messageCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// State Recorder — captures every store mutation during the test
// ────────────────────────────────────────────────────────────────────────────

interface StateRecorder {
  start: () => void;
  stop: () => RecordedEvent[];
}

function createStateRecorder(): StateRecorder {
  const events: RecordedEvent[] = [];
  const unsubscribers: (() => void)[] = [];
  let startTime = 0;

  const record = (source: string, change: string): void => {
    const sid = useChatStore.getState().activeSessionId ?? 'null';
    const msgs = sid !== 'null' ? (useChatStore.getState().sessions[sid]?.messages ?? []) : [];
    const event: RecordedEvent = {
      relativeMs: Date.now() - startTime,
      source,
      change,
      sessionId: sid,
      messageCount: msgs.length,
    };
    events.push(event);
    logger.warn(
      '[RECORD +' +
        String(event.relativeMs) +
        'ms] ' +
        source +
        ': ' +
        change +
        ' (session: ' +
        sid.slice(0, 8) +
        '..., msgs: ' +
        String(event.messageCount) +
        ')'
    );
  };

  return {
    start: (): void => {
      startTime = Date.now();
      events.length = 0;

      // Subscribe to ChatStore
      let prevChatState = useChatStore.getState();
      unsubscribers.push(
        useChatStore.subscribe((state) => {
          const prev = prevChatState;
          prevChatState = state;

          // Detect activeSessionId change
          if (state.activeSessionId !== prev.activeSessionId) {
            record(
              'ChatStore',
              'activeSessionId: ' +
                (prev.activeSessionId?.slice(0, 8) ?? 'null') +
                ' -> ' +
                (state.activeSessionId?.slice(0, 8) ?? 'null')
            );
          }

          // Detect rewindEpoch change
          if (state.rewindEpoch !== prev.rewindEpoch) {
            record(
              'ChatStore',
              'rewindEpoch: ' + String(prev.rewindEpoch) + ' -> ' + String(state.rewindEpoch)
            );
          }

          // Detect message count changes for active session
          const sid = state.activeSessionId;
          if (sid) {
            const prevMsgs = prev.sessions[sid]?.messages ?? [];
            const currMsgs = state.sessions[sid]?.messages ?? [];
            if (currMsgs.length !== prevMsgs.length) {
              record(
                'ChatStore',
                'messages: ' + String(prevMsgs.length) + ' -> ' + String(currMsgs.length)
              );

              // Log the new/removed messages
              if (currMsgs.length > prevMsgs.length) {
                const newMsg = currMsgs[currMsgs.length - 1];
                if (newMsg) {
                  const preview = newMsg.content.slice(0, 60).replace(/\n/g, '\\n');
                  record(
                    'ChatStore',
                    '  + ' + newMsg.role + ' ' + newMsg.id.slice(0, 8) + '...: "' + preview + '"'
                  );
                }
              } else {
                record(
                  'ChatStore',
                  '  messages TRUNCATED from ' +
                    String(prevMsgs.length) +
                    ' to ' +
                    String(currMsgs.length)
                );
              }
            }

            // Detect isAgentRunning change
            const prevRunning = prev.sessions[sid]?.isAgentRunning ?? false;
            const currRunning = state.sessions[sid]?.isAgentRunning ?? false;
            if (currRunning !== prevRunning) {
              record(
                'ChatStore',
                'isAgentRunning: ' + String(prevRunning) + ' -> ' + String(currRunning)
              );
            }

            // Detect isStopPending change
            const prevStop = prev.sessions[sid]?.isStopPending ?? false;
            const currStop = state.sessions[sid]?.isStopPending ?? false;
            if (currStop !== prevStop) {
              record('ChatStore', 'isStopPending: ' + String(prevStop) + ' -> ' + String(currStop));
            }

            // Detect streaming state on last message
            const prevLast = prevMsgs[prevMsgs.length - 1];
            const currLast = currMsgs[currMsgs.length - 1];
            if (prevLast?.id === currLast?.id && prevLast && currLast) {
              if (prevLast.isStreaming !== currLast.isStreaming) {
                record(
                  'ChatStore',
                  'lastMsg.isStreaming: ' +
                    String(prevLast.isStreaming ?? false) +
                    ' -> ' +
                    String(currLast.isStreaming ?? false)
                );
              }
            }
          }

          // Detect session remap (new key appearing, old key disappearing)
          const prevKeys = Object.keys(prev.sessions);
          const currKeys = Object.keys(state.sessions);
          const addedKeys = currKeys.filter((k) => !prevKeys.includes(k));
          const removedKeys = prevKeys.filter((k) => !currKeys.includes(k));
          if (addedKeys.length > 0 || removedKeys.length > 0) {
            if (addedKeys.length > 0) {
              record(
                'ChatStore',
                'session ADDED: ' + addedKeys.map((k) => k.slice(0, 8)).join(', ')
              );
            }
            if (removedKeys.length > 0) {
              record(
                'ChatStore',
                'session REMOVED: ' + removedKeys.map((k) => k.slice(0, 8)).join(', ')
              );
            }
          }

          // Detect remappedOrbitIds change
          const prevRemapped = Object.keys(prev.remappedOrbitIds);
          const currRemapped = Object.keys(state.remappedOrbitIds);
          if (currRemapped.length !== prevRemapped.length) {
            const newIds = currRemapped.filter((k) => !prevRemapped.includes(k));
            if (newIds.length > 0) {
              record('ChatStore', 'remapped IDs: +' + newIds.map((k) => k.slice(0, 8)).join(', '));
            }
          }
        })
      );

      // Subscribe to CheckpointStore
      let prevCpState = useCheckpointStore.getState();
      unsubscribers.push(
        useCheckpointStore.subscribe((state) => {
          const prev = prevCpState;
          prevCpState = state;

          // Detect fork point changes
          const prevForkKeys = Object.keys(prev.rewindForkPoints);
          const currForkKeys = Object.keys(state.rewindForkPoints);
          if (
            currForkKeys.length !== prevForkKeys.length ||
            currForkKeys.some((k) => prev.rewindForkPoints[k] !== state.rewindForkPoints[k])
          ) {
            const added = currForkKeys.filter((k) => !prevForkKeys.includes(k));
            const removed = prevForkKeys.filter((k) => !currForkKeys.includes(k));
            if (added.length > 0) {
              for (const k of added) {
                record(
                  'CheckpointStore',
                  'forkPoint SET: session=' +
                    k.slice(0, 8) +
                    ' msg=' +
                    (state.rewindForkPoints[k]?.slice(0, 8) ?? '?')
                );
              }
            }
            if (removed.length > 0) {
              for (const k of removed) {
                record('CheckpointStore', 'forkPoint CONSUMED: session=' + k.slice(0, 8));
              }
            }
          }

          // Detect currentUserMessageId changes
          if (state.currentUserMessageId !== prev.currentUserMessageId) {
            const prevId = prev.currentUserMessageId?.messageId.slice(0, 8) ?? 'null';
            const currId = state.currentUserMessageId?.messageId.slice(0, 8) ?? 'null';
            const reconciled = state.currentUserMessageId?.reconciled ?? false;
            record(
              'CheckpointStore',
              'currentUserMessageId: ' +
                prevId +
                ' -> ' +
                currId +
                ' (reconciled: ' +
                String(reconciled) +
                ')'
            );
          }

          // Detect currentTurnStartCheckpoint changes
          if (state.currentTurnStartCheckpoint !== prev.currentTurnStartCheckpoint) {
            const prevCp = prev.currentTurnStartCheckpoint?.checkpointId.slice(0, 8) ?? 'null';
            const currCp = state.currentTurnStartCheckpoint?.checkpointId.slice(0, 8) ?? 'null';
            record('CheckpointStore', 'turnStartCheckpoint: ' + prevCp + ' -> ' + currCp);
          }
        })
      );

      record('Recorder', 'Started recording');
    },

    stop: (): RecordedEvent[] => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;
      record('Recorder', 'Stopped recording');
      return [...events];
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getActiveSessionId(): string | null {
  return useChatStore.getState().activeSessionId;
}

interface MessageSnapshot {
  id: string;
  role: string;
  content: string;
  parentUuid: string | null | undefined;
  isStreaming: boolean | undefined;
}

function getActiveMessages(): MessageSnapshot[] {
  const state = useChatStore.getState();
  const sid = state.activeSessionId;
  if (!sid) return [];
  return (state.sessions[sid]?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parentUuid: m.parentUuid,
    isStreaming: m.isStreaming,
  }));
}

function waitForAgentComplete(timeout: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      const sid = getActiveSessionId();
      const session = sid ? useChatStore.getState().sessions[sid] : undefined;
      reject(
        new Error(
          'Timeout (' +
            String(timeout) +
            'ms) waiting for: ' +
            label +
            '. ' +
            'Session: ' +
            (sid ?? 'null') +
            ', isAgentRunning: ' +
            String(session?.isAgentRunning ?? 'unknown') +
            ', ' +
            'isStopPending: ' +
            String(session?.isStopPending ?? 'unknown')
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

function waitForRewind(
  preRewindCount: number,
  preRewindLastId: string | undefined,
  timeout: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      const msgs = getActiveMessages();
      reject(
        new Error(
          'Timeout (' +
            String(timeout) +
            'ms) waiting for rewind. ' +
            'Messages before: ' +
            String(preRewindCount) +
            ', now: ' +
            String(msgs.length) +
            ', ' +
            'last ID before: ' +
            (preRewindLastId ?? 'none') +
            ', now: ' +
            (msgs[msgs.length - 1]?.id ?? 'none')
        )
      );
    }, timeout);

    const check = (): boolean => {
      const msgs = getActiveMessages();
      return (
        msgs.length < preRewindCount ||
        (msgs.length > 0 && msgs[msgs.length - 1]?.id !== preRewindLastId)
      );
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

/** Full snapshot of the chat area state */
function logChatArea(label: string): void {
  const sid = getActiveSessionId();
  const msgs = getActiveMessages();
  const session = sid ? useChatStore.getState().sessions[sid] : undefined;
  const cpStore = useCheckpointStore.getState();

  logger.warn('\n==== CHAT AREA: ' + label + ' ====');
  logger.warn('  Session ID: ' + (sid ?? 'null'));
  logger.warn('  Agent running: ' + String(session?.isAgentRunning ?? false));
  logger.warn('  Stop pending: ' + String(session?.isStopPending ?? false));
  logger.warn('  Fork point: ' + (sid ? String(cpStore.hasRewindForkPoint(sid)) : 'N/A'));
  logger.warn('  Rewind epoch: ' + String(useChatStore.getState().rewindEpoch));
  logger.warn('  ---');

  if (msgs.length === 0) {
    logger.warn('  (no messages)');
  }

  for (const [i, m] of msgs.entries()) {
    const content = m.content.slice(0, 100).replace(/\n/g, '\\n');
    const parent = m.parentUuid ? m.parentUuid.slice(0, 8) : 'null';
    const streaming = m.isStreaming === true ? ' [STREAMING]' : '';
    const prefix = m.role === 'user' ? '  YOU: ' : '  BOT: ';
    logger.warn(prefix + '"' + content + '"' + streaming);
    logger.warn(
      '       id=' + m.id.slice(0, 8) + '... parent=' + parent + ' [msg ' + String(i) + ']'
    );
  }
  logger.warn('==== END CHAT AREA ====\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ────────────────────────────────────────────────────────────────────────────

export async function runRewindStressTest(
  deps: StressTestDeps,
  config: StressTestConfig = {}
): Promise<StepResult[]> {
  const { delayBetweenMessages = 500, delayBeforeRewind = 1000, agentTimeout = 120_000 } = config;

  const { handleSend, handleRewind } = deps;
  const results: StepResult[] = [];
  const testStart = Date.now();

  // Start continuous recording
  const recorder = createStateRecorder();
  recorder.start();

  logger.warn('========================================================');
  logger.warn('     REWIND STRESS TEST v2 -- STARTING                  ');
  logger.warn('========================================================');
  logger.warn('  Sequence: 3 sends -> rewind to msg2 -> send ->');
  logger.warn('            rewind to msg2 -> send "how many messages?"');
  logger.warn('  delayBetweenMessages: ' + String(delayBetweenMessages) + 'ms');
  logger.warn('  delayBeforeRewind:    ' + String(delayBeforeRewind) + 'ms');
  logger.warn('  agentTimeout:         ' + String(agentTimeout) + 'ms');
  logger.warn('========================================================');

  const initialSessionId = getActiveSessionId();
  if (!initialSessionId) {
    logger.error('No active session. Create or open a conversation first.');
    recorder.stop();
    return results;
  }

  logChatArea('INITIAL STATE');

  // Step runner helper
  const runStep = async (stepName: string, fn: () => Promise<void>): Promise<boolean> => {
    const stepStart = Date.now();
    try {
      await fn();
      const duration = Date.now() - stepStart;
      results.push({
        step: stepName,
        durationMs: duration,
        sessionId: getActiveSessionId() ?? 'null',
        messageCount: getActiveMessages().length,
        success: true,
      });
      logger.warn('[PASS] ' + stepName + ' (' + String(duration) + 'ms)');
      return true;
    } catch (err) {
      const duration = Date.now() - stepStart;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        step: stepName,
        durationMs: duration,
        sessionId: getActiveSessionId() ?? 'null',
        messageCount: getActiveMessages().length,
        success: false,
        error: errorMsg,
      });
      logger.error('[FAIL] ' + stepName + ' (' + String(duration) + 'ms): ' + errorMsg);
      logChatArea('FAILURE: ' + stepName);
      return false;
    }
  };

  // Helper to find the Nth assistant message (1-indexed)
  const findAssistantMessage = (n: number): MessageSnapshot | undefined => {
    const msgs = getActiveMessages();
    let count = 0;
    for (const m of msgs) {
      if (m.role === 'assistant') {
        count++;
        if (count === n) return m;
      }
    }
    return undefined;
  };

  // ── Step 1: Send message 1 ─────────────────────────────────────────────
  logger.warn('\n--- Step 1: Send message 1 ---');
  const step1Ok = await runStep('Send message 1', async () => {
    handleSend('Remember the number 42. Reply with "Got it, 42." and nothing else.');
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 1');
    logChatArea('After message 1');
  });
  if (!step1Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBetweenMessages);

  // ── Step 2: Send message 2 ─────────────────────────────────────────────
  logger.warn('\n--- Step 2: Send message 2 ---');
  const step2Ok = await runStep('Send message 2', async () => {
    handleSend('Remember the number 73. Reply with "Got it, 73." and nothing else.');
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 2');
    logChatArea('After message 2');
  });
  if (!step2Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBetweenMessages);

  // ── Step 3: Send message 3 ─────────────────────────────────────────────
  logger.warn('\n--- Step 3: Send message 3 ---');
  const step3Ok = await runStep('Send message 3', async () => {
    handleSend('Remember the number 99. Reply with "Got it, 99." and nothing else.');
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 3');
    logChatArea('After message 3');
  });
  if (!step3Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBeforeRewind);

  // ── Step 4: Rewind to message 2's response ─────────────────────────────
  logger.warn('\n--- Step 4: REWIND to message 2 response ---');
  const step4Ok = await runStep('Rewind to msg 2 response', async () => {
    const target = findAssistantMessage(2);
    if (!target) {
      throw new Error(
        'Could not find 2nd assistant message. Total messages: ' +
          String(getActiveMessages().length)
      );
    }

    logger.warn(
      'Rewinding to assistant msg: ' +
        target.id.slice(0, 8) +
        '... ("' +
        target.content.slice(0, 40) +
        '")'
    );

    const preCount = getActiveMessages().length;
    const preLastId = getActiveMessages()[preCount - 1]?.id;

    handleRewind(target.id);
    await waitForRewind(preCount, preLastId, 30_000);
    logChatArea('After rewind 1 (to msg 2 response)');
  });
  if (!step4Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBetweenMessages);

  // ── Step 5: Send message 4 on rewound branch ───────────────────────────
  logger.warn('\n--- Step 5: Send message 4 (post-rewind) ---');
  const sidBeforeStep5 = getActiveSessionId();
  if (sidBeforeStep5) {
    const hasFork = useCheckpointStore.getState().hasRewindForkPoint(sidBeforeStep5);
    logger.warn('Fork point present before send: ' + String(hasFork));
  }

  const step5Ok = await runStep('Send message 4 (post-rewind)', async () => {
    handleSend('What numbers do you remember? Reply with just the numbers, comma-separated.');
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 4');

    const currentSid = getActiveSessionId();
    if (currentSid !== sidBeforeStep5) {
      logger.warn(
        'Session REMAPPED: ' + (sidBeforeStep5 ?? 'null') + ' -> ' + (currentSid ?? 'null')
      );
    }

    logChatArea('After message 4 (post-rewind)');
  });
  if (!step5Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBeforeRewind);

  // ── Step 6: SECOND REWIND to message 2's response ──────────────────────
  logger.warn('\n--- Step 6: SECOND REWIND to message 2 response ---');
  const step6Ok = await runStep('Rewind 2 to msg 2 response', async () => {
    const target = findAssistantMessage(2);
    if (!target) {
      throw new Error(
        'Could not find 2nd assistant message for rewind 2. Total messages: ' +
          String(getActiveMessages().length)
      );
    }

    logger.warn(
      'Rewinding to assistant msg: ' +
        target.id.slice(0, 8) +
        '... ("' +
        target.content.slice(0, 40) +
        '")'
    );

    const preCount = getActiveMessages().length;
    const preLastId = getActiveMessages()[preCount - 1]?.id;

    handleRewind(target.id);
    await waitForRewind(preCount, preLastId, 30_000);
    logChatArea('After rewind 2 (to msg 2 response)');
  });
  if (!step6Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBetweenMessages);

  // ── Step 7: Send verification message ──────────────────────────────────
  logger.warn('\n--- Step 7: Send "How many messages?" (context verification) ---');
  const sidBeforeStep7 = getActiveSessionId();
  if (sidBeforeStep7) {
    const hasFork = useCheckpointStore.getState().hasRewindForkPoint(sidBeforeStep7);
    logger.warn('Fork point present before send: ' + String(hasFork));
  }

  const step7Ok = await runStep('Send verification message', async () => {
    handleSend(
      'How many messages have I sent in this chat? Count every user message you can see and reply with the count.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for verification message');

    const currentSid = getActiveSessionId();
    if (currentSid !== sidBeforeStep7) {
      logger.warn(
        'Session REMAPPED: ' + (sidBeforeStep7 ?? 'null') + ' -> ' + (currentSid ?? 'null')
      );
    }

    logChatArea('After verification message');

    // Log the response for easy reading
    const msgs = getActiveMessages();
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      logger.warn('');
      logger.warn('>>> CLAUDE RESPONSE: "' + lastMsg.content + '"');
      logger.warn(
        '>>> (Expected: 3 user messages visible — msg1 "42", msg2 "73", and the "how many" question)'
      );
      logger.warn('');
    }
  });
  if (!step7Ok) {
    recorder.stop();
    return results;
  }

  // ── Final Report ───────────────────────────────────────────────────────
  const recordedEvents = recorder.stop();
  const totalElapsed = Date.now() - testStart;

  logger.warn('\n========================================================');
  logger.warn('  STRESS TEST COMPLETE -- ' + (totalElapsed / 1000).toFixed(1) + 's total');
  logger.warn('========================================================');

  for (const r of results) {
    const status = r.success ? '[PASS]' : '[FAIL]';
    logger.warn(
      '  ' +
        status +
        ' ' +
        r.step +
        ' (' +
        String(r.durationMs) +
        'ms) -- ' +
        String(r.messageCount) +
        ' msgs'
    );
    if (r.error) {
      logger.warn('    Error: ' + r.error);
    }
  }

  logger.warn('');
  logger.warn('  Total recorded events: ' + String(recordedEvents.length));

  // Session lineage
  const remapped = useChatStore.getState().remappedOrbitIds;
  const remappedKeys = Object.keys(remapped);
  if (remappedKeys.length > 0) {
    logger.warn(
      '  Session lineage: ' +
        remappedKeys.map((k) => k.slice(0, 8)).join(' -> ') +
        ' -> ' +
        (getActiveSessionId()?.slice(0, 8) ?? 'null')
    );
  }

  logger.warn('========================================================');

  logChatArea('FINAL STATE');

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    logger.warn('All steps passed!');
  } else {
    const failed = results.filter((r) => !r.success);
    logger.warn(String(failed.length) + ' step(s) failed');
  }

  return results;
}
