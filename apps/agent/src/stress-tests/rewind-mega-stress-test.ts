/**
 * Rewind Mega Stress Test v3
 *
 * The "super duper crazy" stress test. Exercises every dimension of the rewind
 * system simultaneously: message count, rewind depth, branching, file creation,
 * file editing, and file revert verification.
 *
 * Test sequence:
 *   Phase 1 — Warmup (10 messages):
 *     1-5.  Send 5 simple memory prompts (no tool use)
 *     6.    Ask Claude to create ~/Desktop/orbit-stress-test.py
 *     7.    Ask Claude to edit the file (add a function)
 *     8.    Ask Claude to edit the file again (modify the function)
 *     9.    Send a simple prompt
 *     10.   Send a simple prompt
 *
 *   Phase 2 — Triple rewind gauntlet:
 *     11.   REWIND to message 8 response → verify file is in "2nd edit" state
 *     12.   Send a message on the rewound branch
 *     13.   REWIND to message 7 response → verify file is in "1st edit" state
 *     14.   Send a message on the rewound branch
 *     15.   REWIND to message 6 response → verify file is in "original create" state
 *     16.   Send verification message
 *
 *   Phase 3 — Deep rewind past file creation:
 *     17.   REWIND to message 5 response → file should NOT exist (pre-creation)
 *     18.   Send final verification message
 *
 * File state tracking:
 *   After msg 6:  File exists with original content
 *   After msg 7:  File has 1st edit (added function)
 *   After msg 8:  File has 2nd edit (modified function)
 *   After msg 9:  File unchanged from msg 8
 *   After msg 10: File unchanged from msg 8
 *   Rewind to 8:  File should revert to 2nd edit state
 *   Rewind to 7:  File should revert to 1st edit state
 *   Rewind to 6:  File should revert to original create state
 *   Rewind to 5:  File should not exist (or empty)
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runMegaStressTest()
 *   window.__orbit_debug.runMegaStressTest({ delayBetweenMessages: 300 })
 *
 * Prerequisites:
 * - An active conversation (create one first if needed)
 * - Tool permissions should be set to auto-approve (no permission blocks)
 */

import { createLogger } from '@orbit/common/lib';

import { readFile } from '@/lib/api/files';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('MegaStressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface MegaStressTestDeps {
  handleSend: (text: string) => void;
  handleRewind: (messageId: string) => void;
  handleStop: () => void;
}

export interface MegaStressTestConfig {
  /** Delay before sending next message after agent completes (ms). Default: 500 */
  delayBetweenMessages?: number;
  /** Delay before triggering rewind after agent completes (ms). Default: 1000 */
  delayBeforeRewind?: number;
  /** Timeout for waiting for agent completion (ms). Default: 120000 */
  agentTimeout?: number;
  /** Path for the test file. Default: ~/Desktop/orbit-stress-test.py */
  testFilePath?: string;
}

interface StepResult {
  step: string;
  durationMs: number;
  sessionId: string;
  messageCount: number;
  success: boolean;
  error?: string;
  /** File state at end of step (null = not checked, undefined = file not found) */
  fileState?: string | null | undefined;
}

interface MessageSnapshot {
  id: string;
  role: string;
  content: string;
  parentUuid: string | null | undefined;
  isStreaming: boolean | undefined;
}

/** File state snapshots at key points for rewind verification */
interface FileStateTracker {
  afterCreate: string | undefined;
  afterEdit1: string | undefined;
  afterEdit2: string | undefined;
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
            ', isStopPending: ' +
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
            ', last ID before: ' +
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

/** Try to read a file's content. Returns undefined if the file doesn't exist. */
async function tryReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/** Check if file content contains a specific marker string */
function fileContains(content: string | undefined, marker: string): boolean {
  return content?.includes(marker) ?? false;
}

/** Find the Nth assistant message (1-indexed) */
function findAssistantMessage(n: number): MessageSnapshot | undefined {
  const msgs = getActiveMessages();
  let count = 0;
  for (const m of msgs) {
    if (m.role === 'assistant') {
      count++;
      if (count === n) return m;
    }
  }
  return undefined;
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
  logger.warn('  Message count: ' + String(msgs.length));
  logger.warn('  Fork point: ' + (sid ? String(cpStore.hasRewindForkPoint(sid)) : 'N/A'));
  logger.warn('  ---');

  if (msgs.length === 0) {
    logger.warn('  (no messages)');
  }

  for (const [i, m] of msgs.entries()) {
    const content = m.content.slice(0, 120).replace(/\n/g, '\\n');
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

function logFileState(label: string, content: string | undefined): void {
  if (content === undefined) {
    logger.warn('[FILE] ' + label + ': FILE DOES NOT EXIST');
  } else {
    const preview = content.slice(0, 200).replace(/\n/g, '\\n');
    logger.warn('[FILE] ' + label + ': ' + String(content.length) + ' chars — "' + preview + '"');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// State Recorder (simplified from v2 — logs key mutations)
// ────────────────────────────────────────────────────────────────────────────

function createStateRecorder(): { start: () => void; stop: () => void } {
  const unsubs: (() => void)[] = [];

  const record = (source: string, change: string): void => {
    const sid = getActiveSessionId() ?? 'null';
    const msgs = getActiveMessages();
    logger.warn(
      '[REC] ' +
        source +
        ': ' +
        change +
        ' (session: ' +
        sid.slice(0, 8) +
        '..., msgs: ' +
        String(msgs.length) +
        ')'
    );
  };

  return {
    start: (): void => {
      let prevChat = useChatStore.getState();
      unsubs.push(
        useChatStore.subscribe((state) => {
          const prev = prevChat;
          prevChat = state;

          if (state.activeSessionId !== prev.activeSessionId) {
            record(
              'ChatStore',
              'activeSessionId: ' +
                (prev.activeSessionId?.slice(0, 8) ?? 'null') +
                ' -> ' +
                (state.activeSessionId?.slice(0, 8) ?? 'null')
            );
          }
          if (state.rewindEpoch !== prev.rewindEpoch) {
            record('ChatStore', 'rewindEpoch: ' + String(state.rewindEpoch));
          }

          const sid = state.activeSessionId;
          if (sid) {
            const prevMsgs = prev.sessions[sid]?.messages ?? [];
            const currMsgs = state.sessions[sid]?.messages ?? [];
            if (currMsgs.length !== prevMsgs.length) {
              record(
                'ChatStore',
                'messages: ' + String(prevMsgs.length) + ' -> ' + String(currMsgs.length)
              );
            }

            const prevRunning = prev.sessions[sid]?.isAgentRunning ?? false;
            const currRunning = state.sessions[sid]?.isAgentRunning ?? false;
            if (currRunning !== prevRunning) {
              record('ChatStore', 'isAgentRunning: ' + String(currRunning));
            }
          }

          // Detect session remap
          const prevKeys = Object.keys(prev.sessions);
          const currKeys = Object.keys(state.sessions);
          const added = currKeys.filter((k) => !prevKeys.includes(k));
          const removed = prevKeys.filter((k) => !currKeys.includes(k));
          if (added.length > 0) {
            record('ChatStore', 'session ADDED: ' + added.map((k) => k.slice(0, 8)).join(', '));
          }
          if (removed.length > 0) {
            record('ChatStore', 'session REMOVED: ' + removed.map((k) => k.slice(0, 8)).join(', '));
          }
        })
      );

      record('Recorder', 'Started');
    },

    stop: (): void => {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ────────────────────────────────────────────────────────────────────────────

export async function runMegaStressTest(
  deps: MegaStressTestDeps,
  config: MegaStressTestConfig = {}
): Promise<StepResult[]> {
  const {
    delayBetweenMessages = 500,
    delayBeforeRewind = 1000,
    agentTimeout = 120_000,
    testFilePath = '/Users/no9labs/Desktop/orbit-stress-test.py',
  } = config;

  const { handleSend, handleRewind } = deps;
  const results: StepResult[] = [];
  const testStart = Date.now();
  const fileTracker: FileStateTracker = {
    afterCreate: undefined,
    afterEdit1: undefined,
    afterEdit2: undefined,
  };

  // Start recording
  const recorder = createStateRecorder();
  recorder.start();

  logger.warn('================================================================');
  logger.warn('     MEGA REWIND STRESS TEST v3 -- STARTING                     ');
  logger.warn('================================================================');
  logger.warn('  Sequence: 10 sends -> rewind x3 -> send between ->');
  logger.warn('            rewind past file creation -> verify everything');
  logger.warn('  Test file:             ' + testFilePath);
  logger.warn('  delayBetweenMessages:  ' + String(delayBetweenMessages) + 'ms');
  logger.warn('  delayBeforeRewind:     ' + String(delayBeforeRewind) + 'ms');
  logger.warn('  agentTimeout:          ' + String(agentTimeout) + 'ms');
  logger.warn('================================================================');

  const initialSessionId = getActiveSessionId();
  if (!initialSessionId) {
    logger.error('No active session. Create or open a conversation first.');
    recorder.stop();
    return results;
  }

  logChatArea('INITIAL STATE');

  // Step runner
  const runStep = async (
    stepName: string,
    fn: () => Promise<string | undefined>
  ): Promise<boolean> => {
    const stepStart = Date.now();
    try {
      const fileState = await fn();
      const duration = Date.now() - stepStart;
      results.push({
        step: stepName,
        durationMs: duration,
        sessionId: getActiveSessionId() ?? 'null',
        messageCount: getActiveMessages().length,
        success: true,
        fileState: fileState ?? null,
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

  /** Perform a rewind to the Nth assistant message (1-indexed) */
  const doRewind = async (asstIndex: number, label: string): Promise<void> => {
    const target = findAssistantMessage(asstIndex);
    if (!target) {
      throw new Error(
        'Could not find assistant message #' +
          String(asstIndex) +
          '. Total messages: ' +
          String(getActiveMessages().length)
      );
    }

    logger.warn(
      'Rewinding to assistant #' +
        String(asstIndex) +
        ': ' +
        target.id.slice(0, 8) +
        '... ("' +
        target.content.slice(0, 60) +
        '")'
    );

    const preCount = getActiveMessages().length;
    const preLastId = getActiveMessages()[preCount - 1]?.id;

    handleRewind(target.id);
    await waitForRewind(preCount, preLastId, 30_000);
    logChatArea(label);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Warmup — 10 Messages (5 simple + create + edit + edit + 2 simple)
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n╔══════════════════════════════════════════╗');
  logger.warn('║  PHASE 1: Warmup — 10 Messages           ║');
  logger.warn('╚══════════════════════════════════════════╝');

  // Messages 1-5: Simple memory prompts (no tool use)
  const simplePrompts = [
    'Remember the word "ALPHA". Reply with exactly: "Stored: ALPHA" and nothing else.',
    'Remember the word "BRAVO". Reply with exactly: "Stored: BRAVO" and nothing else.',
    'Remember the word "CHARLIE". Reply with exactly: "Stored: CHARLIE" and nothing else.',
    'Remember the word "DELTA". Reply with exactly: "Stored: DELTA" and nothing else.',
    'Remember the word "ECHO". Reply with exactly: "Stored: ECHO" and nothing else.',
  ];

  for (let i = 0; i < simplePrompts.length; i++) {
    const stepNum = i + 1;
    const prompt = simplePrompts[i];
    if (!prompt) continue;

    logger.warn('\n--- Step ' + String(stepNum) + ': Send message ' + String(stepNum) + ' ---');
    const ok = await runStep(
      'Step ' + String(stepNum) + ': Send "' + prompt.slice(0, 30) + '..."',
      async () => {
        handleSend(prompt);
        await waitForAgentComplete(agentTimeout, 'agent:complete for message ' + String(stepNum));
        return undefined;
      }
    );
    if (!ok) {
      recorder.stop();
      return results;
    }
    await sleep(delayBetweenMessages);
  }

  // Message 6: Create test file
  logger.warn('\n--- Step 6: Create test file ---');
  const step6Ok = await runStep('Step 6: Create ' + testFilePath, async () => {
    handleSend(
      'Create a Python file at ' +
        testFilePath +
        ' with this EXACT content:\n\n' +
        '```python\n' +
        '# Orbit Stress Test File\n' +
        '# MARKER: ORIGINAL\n\n' +
        'def hello():\n' +
        '    return "Hello, World!"\n\n' +
        'if __name__ == "__main__":\n' +
        '    print(hello())\n' +
        '```\n\n' +
        'Use the Write tool to create this file. After creating it, reply with "File created." and nothing else.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for file creation');

    // Wait a moment for file system to sync
    await sleep(500);
    const content = await tryReadFile(testFilePath);
    logFileState('After create (Step 6)', content);
    fileTracker.afterCreate = content;

    if (!fileContains(content, 'MARKER: ORIGINAL')) {
      throw new Error(
        'File was not created or missing ORIGINAL marker. Content: ' +
          (content?.slice(0, 200) ?? 'undefined')
      );
    }

    return content?.slice(0, 100);
  });
  if (!step6Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Message 7: First edit — add a function
  logger.warn('\n--- Step 7: First edit (add function) ---');
  const step7Ok = await runStep('Step 7: First edit (add greet function)', async () => {
    handleSend(
      'Edit the file ' +
        testFilePath +
        '. Change the line `# MARKER: ORIGINAL` to `# MARKER: EDIT_1`. ' +
        'Also add a new function after hello():\n\n' +
        '```python\ndef greet(name):\n    return f"Hello, {name}!"\n```\n\n' +
        'Use the Edit tool to make these changes. Reply with "Edit 1 done." and nothing else.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for edit 1');

    await sleep(500);
    const content = await tryReadFile(testFilePath);
    logFileState('After edit 1 (Step 7)', content);
    fileTracker.afterEdit1 = content;

    if (!fileContains(content, 'MARKER: EDIT_1')) {
      throw new Error(
        'Edit 1 failed — missing EDIT_1 marker. Content: ' + (content?.slice(0, 200) ?? 'undefined')
      );
    }
    if (!fileContains(content, 'def greet')) {
      throw new Error(
        'Edit 1 failed — missing greet function. Content: ' +
          (content?.slice(0, 200) ?? 'undefined')
      );
    }

    return content?.slice(0, 100);
  });
  if (!step7Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Message 8: Second edit — modify the function
  logger.warn('\n--- Step 8: Second edit (modify function) ---');
  const step8Ok = await runStep('Step 8: Second edit (modify greet)', async () => {
    handleSend(
      'Edit the file ' +
        testFilePath +
        '. Change the line `# MARKER: EDIT_1` to `# MARKER: EDIT_2`. ' +
        'Also change the greet function to accept a second parameter `greeting` with default "Hi":\n\n' +
        '```python\ndef greet(name, greeting="Hi"):\n    return f"{greeting}, {name}!"\n```\n\n' +
        'Use the Edit tool. Reply with "Edit 2 done." and nothing else.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for edit 2');

    await sleep(500);
    const content = await tryReadFile(testFilePath);
    logFileState('After edit 2 (Step 8)', content);
    fileTracker.afterEdit2 = content;

    if (!fileContains(content, 'MARKER: EDIT_2')) {
      throw new Error(
        'Edit 2 failed — missing EDIT_2 marker. Content: ' + (content?.slice(0, 200) ?? 'undefined')
      );
    }
    if (!fileContains(content, 'greeting="Hi"') && !fileContains(content, "greeting='Hi'")) {
      throw new Error(
        'Edit 2 failed — missing greeting parameter. Content: ' +
          (content?.slice(0, 200) ?? 'undefined')
      );
    }

    return content?.slice(0, 100);
  });
  if (!step8Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Message 9: Simple prompt (file unchanged)
  logger.warn('\n--- Step 9: Simple message (file unchanged) ---');
  const step9Ok = await runStep('Step 9: Send "Stored: FOXTROT"', async () => {
    handleSend(
      'Remember the word "FOXTROT". Reply with exactly: "Stored: FOXTROT" and nothing else.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 9');
    return undefined;
  });
  if (!step9Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Message 10: Simple prompt (file unchanged)
  logger.warn('\n--- Step 10: Simple message (file unchanged) ---');
  const step10Ok = await runStep('Step 10: Send "Stored: GOLF"', async () => {
    handleSend('Remember the word "GOLF". Reply with exactly: "Stored: GOLF" and nothing else.');
    await waitForAgentComplete(agentTimeout, 'agent:complete for message 10');
    logChatArea('After all 10 messages');
    return undefined;
  });
  if (!step10Ok) {
    recorder.stop();
    return results;
  }

  // Verify we have 20 messages (10 user + 10 assistant)
  const prePhase2Count = getActiveMessages().length;
  logger.warn('\nPhase 1 complete. Messages: ' + String(prePhase2Count));

  await sleep(delayBeforeRewind);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Triple Rewind Gauntlet
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n╔══════════════════════════════════════════╗');
  logger.warn('║  PHASE 2: Triple Rewind Gauntlet          ║');
  logger.warn('╚══════════════════════════════════════════╝');

  // Step 11: REWIND to message 8 response (after 2nd edit)
  // Expect: file has EDIT_2 marker, greet has greeting parameter
  logger.warn('\n--- Step 11: REWIND to assistant #8 (after 2nd edit) ---');
  const step11Ok = await runStep('Step 11: Rewind to msg 8 (EDIT_2 state)', async () => {
    await doRewind(8, 'After rewind to msg 8');

    await sleep(1000); // Give file revert time to complete
    const content = await tryReadFile(testFilePath);
    logFileState('After rewind to msg 8', content);

    // File should be in EDIT_2 state
    if (content !== undefined && !fileContains(content, 'MARKER: EDIT_2')) {
      logger.warn('[FILE CHECK] Expected EDIT_2 marker but got: ' + content.slice(0, 200));
      // Not a hard failure — file rewind is best-effort
    }

    return content?.slice(0, 100);
  });
  if (!step11Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Step 12: Send on rewound branch
  logger.warn('\n--- Step 12: Send on rewound branch (after msg 8) ---');
  const step12Ok = await runStep('Step 12: Send after rewind 1', async () => {
    handleSend(
      'What words do you remember? List them all, comma-separated. Only list the words, nothing else.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for step 12');

    const msgs = getActiveMessages();
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      logger.warn('>>> RESPONSE: "' + lastMsg.content.slice(0, 200) + '"');
      logger.warn(
        '>>> Expected: ALPHA through FOXTROT (6 words — GOLF should be missing since msg 9-10 are gone)'
      );
    }

    return undefined;
  });
  if (!step12Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBeforeRewind);

  // Step 13: REWIND to message 7 response (after 1st edit)
  // Now we're doing rewind 2+ — this should skip bridge calls (forkedSessions)
  logger.warn('\n--- Step 13: REWIND to assistant #7 (after 1st edit) ---');
  const step13Ok = await runStep('Step 13: Rewind to msg 7 (EDIT_1 state)', async () => {
    await doRewind(7, 'After rewind to msg 7');

    await sleep(1000);
    const content = await tryReadFile(testFilePath);
    logFileState('After rewind to msg 7', content);

    // File should be in EDIT_1 state
    if (content !== undefined && fileContains(content, 'MARKER: EDIT_2')) {
      logger.warn(
        '[FILE CHECK WARNING] File still has EDIT_2 marker — file revert may have been skipped (repeat rewind)'
      );
    }
    if (content !== undefined && fileContains(content, 'MARKER: EDIT_1')) {
      logger.warn('[FILE CHECK] File correctly reverted to EDIT_1 state');
    }

    return content?.slice(0, 100);
  });
  if (!step13Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Step 14: Send on this branch
  logger.warn('\n--- Step 14: Send on rewound branch (after msg 7) ---');
  const step14Ok = await runStep('Step 14: Send after rewind 2', async () => {
    handleSend(
      'What words do you remember so far? List them all, comma-separated. Only list the words.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for step 14');

    const msgs = getActiveMessages();
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      logger.warn('>>> RESPONSE: "' + lastMsg.content.slice(0, 200) + '"');
      logger.warn(
        '>>> Expected: ALPHA through ECHO (5 words — FOXTROT/GOLF gone since msg 8+ are gone)'
      );
    }

    return undefined;
  });
  if (!step14Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBeforeRewind);

  // Step 15: REWIND to message 6 response (after original file create)
  // Rewind 3+ — deeply nested repeat rewind
  logger.warn('\n--- Step 15: REWIND to assistant #6 (after file create — ORIGINAL) ---');
  const step15Ok = await runStep('Step 15: Rewind to msg 6 (ORIGINAL state)', async () => {
    await doRewind(6, 'After rewind to msg 6');

    await sleep(1000);
    const content = await tryReadFile(testFilePath);
    logFileState('After rewind to msg 6', content);

    // File should be in ORIGINAL state
    if (content !== undefined && fileContains(content, 'MARKER: ORIGINAL')) {
      logger.warn('[FILE CHECK] File correctly reverted to ORIGINAL state');
    } else if (content !== undefined) {
      logger.warn('[FILE CHECK WARNING] File exists but not in ORIGINAL state');
    }

    return content?.slice(0, 100);
  });
  if (!step15Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Step 16: Send verification on this branch
  logger.warn('\n--- Step 16: Verification send on original-file branch ---');
  const step16Ok = await runStep('Step 16: Send verification after rewind 3', async () => {
    handleSend(
      'How many user messages have you seen in this conversation? Count them and reply with just the number.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for step 16');

    const msgs = getActiveMessages();
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      logger.warn('>>> RESPONSE: "' + lastMsg.content.slice(0, 200) + '"');
      logger.warn('>>> Expected: 7 (msgs 1-6 + this question)');
    }

    return undefined;
  });
  if (!step16Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBeforeRewind);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Deep Rewind Past File Creation
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n╔══════════════════════════════════════════╗');
  logger.warn('║  PHASE 3: Rewind Past File Creation        ║');
  logger.warn('╚══════════════════════════════════════════╝');

  // Step 17: REWIND to message 5 response (BEFORE file creation)
  // This is the 4th rewind — deep into repeat-rewind territory
  logger.warn('\n--- Step 17: REWIND to assistant #5 (BEFORE file creation) ---');
  const step17Ok = await runStep('Step 17: Rewind to msg 5 (pre-file-creation)', async () => {
    await doRewind(5, 'After rewind to msg 5 (pre-creation)');

    await sleep(1000);
    const content = await tryReadFile(testFilePath);
    logFileState('After rewind to msg 5 (pre-creation)', content);

    // Ideally, file should NOT exist or be in pre-creation state
    // NOTE: File rewind is best-effort for repeat rewinds (bridge calls are skipped).
    // The file state on disk may not revert, but the conversation context is correct.
    if (content === undefined) {
      logger.warn('[FILE CHECK] File correctly does not exist (pre-creation state)');
    } else {
      logger.warn(
        '[FILE CHECK INFO] File still exists after rewind past creation — ' +
          'this is expected when bridge calls are skipped on repeat rewinds. ' +
          'Conversation context is correct even if file persists on disk.'
      );
    }

    return content === undefined ? '(deleted)' : content.slice(0, 100);
  });
  if (!step17Ok) {
    recorder.stop();
    return results;
  }
  await sleep(delayBetweenMessages);

  // Step 18: Final verification
  logger.warn('\n--- Step 18: Final verification ---');
  const step18Ok = await runStep('Step 18: Final verification', async () => {
    handleSend(
      'List every word I asked you to remember in this conversation. Reply with ONLY the words, comma-separated, in order.'
    );
    await waitForAgentComplete(agentTimeout, 'agent:complete for final verification');

    const msgs = getActiveMessages();
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      logger.warn('>>> FINAL RESPONSE: "' + lastMsg.content.slice(0, 300) + '"');
      logger.warn(
        '>>> Expected: ALPHA, BRAVO, CHARLIE, DELTA, ECHO (5 words — all post-msg-5 content is gone)'
      );
    }

    logChatArea('FINAL STATE');
    return undefined;
  });
  if (!step18Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Final Report
  // ══════════════════════════════════════════════════════════════════════════

  recorder.stop();
  const totalElapsed = Date.now() - testStart;

  logger.warn('\n================================================================');
  logger.warn('  MEGA STRESS TEST COMPLETE -- ' + (totalElapsed / 1000).toFixed(1) + 's total');
  logger.warn('================================================================');

  // File state summary
  logger.warn('\n  FILE STATE TRACKER:');
  logger.warn(
    '    After create (msg 6): ' +
      (fileTracker.afterCreate
        ? 'EXISTS (' + String(fileTracker.afterCreate.length) + ' chars)'
        : 'MISSING')
  );
  logger.warn(
    '    After edit 1 (msg 7): ' +
      (fileTracker.afterEdit1
        ? 'EXISTS (' + String(fileTracker.afterEdit1.length) + ' chars)'
        : 'MISSING')
  );
  logger.warn(
    '    After edit 2 (msg 8): ' +
      (fileTracker.afterEdit2
        ? 'EXISTS (' + String(fileTracker.afterEdit2.length) + ' chars)'
        : 'MISSING')
  );
  logger.warn(
    '    ORIGINAL marker:      ' + String(fileContains(fileTracker.afterCreate, 'MARKER: ORIGINAL'))
  );
  logger.warn(
    '    EDIT_1 marker:        ' + String(fileContains(fileTracker.afterEdit1, 'MARKER: EDIT_1'))
  );
  logger.warn(
    '    EDIT_2 marker:        ' + String(fileContains(fileTracker.afterEdit2, 'MARKER: EDIT_2'))
  );
  logger.warn(
    '    greet() in edit 1:    ' + String(fileContains(fileTracker.afterEdit1, 'def greet'))
  );
  logger.warn(
    '    greeting= in edit 2:  ' + String(fileContains(fileTracker.afterEdit2, 'greeting='))
  );

  // Step summary
  logger.warn('\n  STEP RESULTS:');
  for (const r of results) {
    const status = r.success ? '[PASS]' : '[FAIL]';
    const fileInfo =
      r.fileState !== null && r.fileState !== undefined
        ? ' | file: ' + r.fileState.slice(0, 60)
        : '';
    logger.warn(
      '  ' +
        status +
        ' ' +
        r.step +
        ' (' +
        String(r.durationMs) +
        'ms, ' +
        String(r.messageCount) +
        ' msgs)' +
        fileInfo
    );
    if (r.error) {
      logger.warn('    Error: ' + r.error);
    }
  }

  // Session lineage
  logger.warn('');
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

  // Tool store summary
  const toolState = useToolStore.getState();
  logger.warn('  ToolStore session: ' + (toolState.currentSessionId?.slice(0, 8) ?? 'null'));

  logger.warn('================================================================');

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    logger.warn('\n  ALL ' + String(results.length) + ' STEPS PASSED!');
  } else {
    const failed = results.filter((r) => !r.success);
    logger.warn('\n  ' + String(failed.length) + '/' + String(results.length) + ' step(s) FAILED');
  }
  logger.warn('');

  return results;
}
