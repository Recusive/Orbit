/**
 * Session Lifecycle Stress Test v2
 *
 * An in-app script that stress-tests session creation, mid-stream switching,
 * and sidebar integrity. Unlike v1, this version switches conversations WHILE
 * the agent is streaming long responses and using tools — not after completion.
 *
 * Test sequence:
 *   1. Create Chat A, send long-response prompt (300-400 word essay)
 *   2. Wait for streaming to START, then IMMEDIATELY create Chat B + send long prompt
 *      (Chat A is still streaming in the background)
 *   3. Wait for B's streaming to start, then switch BACK to Chat A mid-stream
 *   4. Wait for Chat A to finish, verify messages. Then switch to B, wait, verify.
 *   5. In Chat A: send a tool-use prompt (create file on ~/Desktop/orbit-stress-test/)
 *   6. While tools are running, switch to Chat B, send another long prompt
 *   7. While Chat B streams, rapid-switch: B → A → B → A
 *   8. Create Chat C + send long prompt, switch to A while C streams
 *   9. Let all sessions complete. Verify all messages, sidebar integrity.
 *
 * Monitors:
 *   - Sidebar entry visibility during streaming (Bug #2 regression)
 *   - Ghost entries after conversation:list refresh (Bug #3 regression)
 *   - Mid-stream session remap (frontend UUID → SDK UUID)
 *   - Cross-session message integrity after switching
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runSessionStressTest()
 *   window.__orbit_debug.runSessionStressTest({ delayBetweenMessages: 200 })
 *
 * Prerequisites:
 * - A workspace open (needed for conversation:create)
 * - Input mode set to "accept" for auto-approving tool use (no permission blocks)
 */

import { createLogger } from '@orbit/common/lib';

import type { WebviewMessage } from '@/types/protocol';

import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('SessionStressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SessionStressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  postMessage: (msg: WebviewMessage) => void;
}

export interface SessionStressTestConfig {
  /** Delay before sending next message after agent completes (ms). Default: 500 */
  delayBetweenMessages?: number;
  /** Delay after switching conversations to let loading settle (ms). Default: 1500 */
  delayAfterSwitch?: number;
  /** Timeout for waiting for agent completion (ms). Default: 120000 */
  agentTimeout?: number;
  /** Timeout for waiting for conversation creation (ms). Default: 15000 */
  createTimeout?: number;
  /** Timeout for waiting for streaming to start (ms). Default: 30000 */
  streamingStartTimeout?: number;
}

interface StepResult {
  step: string;
  durationMs: number;
  sessionId: string;
  messageCount: number;
  sidebarCount: number;
  success: boolean;
  error?: string;
}

/** A single recorded event from the state recorder */
interface RecordedEvent {
  relativeMs: number;
  source: string;
  change: string;
  sessionId: string;
  sidebarCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompts — designed to produce long responses or trigger tool use
// ────────────────────────────────────────────────────────────────────────────

const LONG_PROMPT_A =
  'Write a detailed 350-word essay about the history of space exploration, ' +
  'from the first satellites to modern Mars missions. Include specific dates, ' +
  'mission names, and key achievements. Do NOT use any tools. Start your ' +
  'response with "ALPHA-START" and end with "ALPHA-END" so I can verify the ' +
  'response boundaries.';

const LONG_PROMPT_B =
  'Write a detailed 350-word essay about the evolution of programming languages, ' +
  'from assembly to modern languages like Rust and TypeScript. Include specific ' +
  'years, language creators, and paradigm shifts. Do NOT use any tools. Start your ' +
  'response with "BRAVO-START" and end with "BRAVO-END" so I can verify the ' +
  'response boundaries.';

const LONG_PROMPT_B2 =
  'Write a detailed 300-word essay about the history of the internet, from ARPANET ' +
  'to modern cloud computing. Include key milestones, protocols, and companies. ' +
  'Do NOT use any tools. Start your response with "BRAVO2-START" and end with ' +
  '"BRAVO2-END".';

const TOOL_USE_PROMPT =
  'Create a file at ~/Desktop/orbit-stress-test/test-alpha.txt with the content ' +
  '"Hello from Chat A stress test! Timestamp: ' +
  String(Date.now()) +
  '". ' +
  'Then read it back and confirm the content. Reply with "TOOL-DONE" when finished.';

const LONG_PROMPT_C =
  'Write a detailed 350-word essay about the history of artificial intelligence, ' +
  'from Alan Turing to modern large language models. Include specific researchers, ' +
  'breakthroughs, and key papers. Do NOT use any tools. Start your response with ' +
  '"CHARLIE-START" and end with "CHARLIE-END".';

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
    const sidebarCount = useUIStore.getState().conversations.length;
    const event: RecordedEvent = {
      relativeMs: Date.now() - startTime,
      source,
      change,
      sessionId: sid,
      sidebarCount,
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
        '..., sidebar: ' +
        String(sidebarCount) +
        ')'
    );
  };

  return {
    start: (): void => {
      startTime = Date.now();
      events.length = 0;

      // ── Subscribe to ChatStore ──────────────────────────────────────────
      let prevChatState = useChatStore.getState();
      unsubscribers.push(
        useChatStore.subscribe((state) => {
          const prev = prevChatState;
          prevChatState = state;

          if (state.activeSessionId !== prev.activeSessionId) {
            record(
              'ChatStore',
              'activeSessionId: ' +
                (prev.activeSessionId?.slice(0, 8) ?? 'null') +
                ' -> ' +
                (state.activeSessionId?.slice(0, 8) ?? 'null')
            );
          }

          const prevKeys = Object.keys(prev.sessions);
          const currKeys = Object.keys(state.sessions);
          const addedKeys = currKeys.filter((k) => !prevKeys.includes(k));
          const removedKeys = prevKeys.filter((k) => !currKeys.includes(k));
          if (addedKeys.length > 0) {
            record('ChatStore', 'session ADDED: ' + addedKeys.map((k) => k.slice(0, 8)).join(', '));
          }
          if (removedKeys.length > 0) {
            record(
              'ChatStore',
              'session REMOVED: ' + removedKeys.map((k) => k.slice(0, 8)).join(', ')
            );
          }

          const prevRemapped = Object.keys(prev.remappedOrbitIds);
          const currRemapped = Object.keys(state.remappedOrbitIds);
          if (currRemapped.length !== prevRemapped.length) {
            const newIds = currRemapped.filter((k) => !prevRemapped.includes(k));
            if (newIds.length > 0) {
              record('ChatStore', 'remapped IDs: +' + newIds.map((k) => k.slice(0, 8)).join(', '));
            }
          }

          const sid = state.activeSessionId;
          if (sid) {
            const prevMsgs = prev.sessions[sid]?.messages ?? [];
            const currMsgs = state.sessions[sid]?.messages ?? [];
            if (currMsgs.length !== prevMsgs.length) {
              record(
                'ChatStore',
                'activeSession msgs: ' + String(prevMsgs.length) + ' -> ' + String(currMsgs.length)
              );
            }
            const prevRunning = prev.sessions[sid]?.isAgentRunning ?? false;
            const currRunning = state.sessions[sid]?.isAgentRunning ?? false;
            if (currRunning !== prevRunning) {
              record(
                'ChatStore',
                'isAgentRunning: ' + String(prevRunning) + ' -> ' + String(currRunning)
              );
            }
          }

          if (state.lastCreatedSessionId !== prev.lastCreatedSessionId) {
            record(
              'ChatStore',
              'lastCreatedSessionId: ' +
                (prev.lastCreatedSessionId?.slice(0, 8) ?? 'null') +
                ' -> ' +
                (state.lastCreatedSessionId?.slice(0, 8) ?? 'null')
            );
          }
        })
      );

      // ── Subscribe to UIStore (sidebar mutations) ──────────────────────────
      let prevUIState = useUIStore.getState();
      unsubscribers.push(
        useUIStore.subscribe((state) => {
          const prev = prevUIState;
          prevUIState = state;

          if (state.conversations !== prev.conversations) {
            const prevIds = prev.conversations.map((c) => c.sessionId.slice(0, 8));
            const currIds = state.conversations.map((c) => c.sessionId.slice(0, 8));
            const addedIds = currIds.filter((id) => !prevIds.includes(id));
            const removedIds = prevIds.filter((id) => !currIds.includes(id));

            if (addedIds.length > 0 || removedIds.length > 0) {
              let detail =
                'sidebar: ' +
                String(prev.conversations.length) +
                ' -> ' +
                String(state.conversations.length);
              if (addedIds.length > 0) detail += ' +[' + addedIds.join(', ') + ']';
              if (removedIds.length > 0) detail += ' -[' + removedIds.join(', ') + ']';
              record('UIStore', detail);
            } else {
              record(
                'UIStore',
                'sidebar entries updated (count: ' + String(state.conversations.length) + ')'
              );
            }
          }

          if (state.activeConversationId !== prev.activeConversationId) {
            record(
              'UIStore',
              'activeConversationId: ' +
                (prev.activeConversationId?.slice(0, 8) ?? 'null') +
                ' -> ' +
                (state.activeConversationId?.slice(0, 8) ?? 'null')
            );
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
}

function getActiveMessages(): MessageSnapshot[] {
  const state = useChatStore.getState();
  const sid = state.activeSessionId;
  if (!sid) return [];
  return (state.sessions[sid]?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));
}

interface SidebarSnapshot {
  sessionId: string;
  title: string;
  messageCount: number;
}

function getSidebarEntries(): SidebarSnapshot[] {
  return useUIStore.getState().conversations.map((c) => ({
    sessionId: c.sessionId,
    title: c.title,
    messageCount: c.messageCount,
  }));
}

/**
 * Wait for the agent to complete on the ACTIVE session.
 */
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
            '. Session: ' +
            (sid ?? 'null') +
            ', isAgentRunning: ' +
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

/**
 * Wait for streaming to START on the active session.
 * Resolves when isAgentRunning becomes true AND at least one assistant message exists.
 * This lets us switch away mid-stream.
 */
function waitForStreamingStarted(timeout: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(
        new Error('Timeout (' + String(timeout) + 'ms) waiting for streaming to start: ' + label)
      );
    }, timeout);

    const check = (): boolean => {
      const state = useChatStore.getState();
      const sid = state.activeSessionId;
      if (!sid) return false;
      const session = state.sessions[sid];
      if (!session) return false;
      // Streaming has started when: agent is running AND there's at least one assistant message
      const hasAssistant = session.messages.some((m) => m.role === 'assistant');
      return session.isAgentRunning && hasAssistant;
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

/**
 * Wait for a new session to be created (lastCreatedSessionId changes).
 */
function waitForSessionCreated(prevCreatedId: string | null, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(
        new Error(
          'Timeout (' +
            String(timeout) +
            'ms) waiting for conversation:created. ' +
            'lastCreatedSessionId still: ' +
            (useChatStore.getState().lastCreatedSessionId?.slice(0, 8) ?? 'null')
        )
      );
    }, timeout);

    const check = (): string | null => {
      const current = useChatStore.getState().lastCreatedSessionId;
      if (current && current !== prevCreatedId) return current;
      return null;
    };

    const immediate = check();
    if (immediate) {
      clearTimeout(timer);
      resolve(immediate);
      return;
    }

    const unsub = useChatStore.subscribe(() => {
      const result = check();
      if (result) {
        clearTimeout(timer);
        unsub();
        resolve(result);
      }
    });
  });
}

/** Simulate sidebar click to load a conversation */
function switchToConversation(sessionId: string, postMessage: (msg: WebviewMessage) => void): void {
  const currentActiveId = useUIStore.getState().activeConversationId;
  if (sessionId === currentActiveId) {
    logger.warn('Already on session ' + sessionId.slice(0, 8) + ', skipping switch');
    return;
  }

  // Mirror handleLoadConversation behavior:
  useUIStore.getState().setLoadingConversation(true);
  useUIStore.getState().setConversationTransitioning(true);
  useMessageBufferStore.getState().markLoadPending(sessionId);
  useChatStore.getState().setActiveSession(sessionId);

  postMessage({
    type: 'conversation:load',
    uuid: crypto.randomUUID(),
    session_id: sessionId,
  });
}

/** Create a new conversation (like clicking "+" in sidebar) */
function startNewConversation(postMessage: (msg: WebviewMessage) => void): void {
  const { workspacePath, activeWorktreePath } = useUIStore.getState();
  postMessage({
    type: 'conversation:create',
    uuid: crypto.randomUUID(),
    title: 'Untitled',
    workspace_path: workspacePath ?? undefined,
    worktree_path: activeWorktreePath ?? undefined,
  });
}

/** Full snapshot of session lifecycle state */
function logSessionState(label: string): void {
  const chatStore = useChatStore.getState();
  const uiStore = useUIStore.getState();
  const sid = chatStore.activeSessionId;
  const msgs = sid ? (chatStore.sessions[sid]?.messages ?? []) : [];
  const sidebar = uiStore.conversations;

  logger.warn('\n==== SESSION STATE: ' + label + ' ====');
  logger.warn('  Active Session (ChatStore): ' + (sid?.slice(0, 8) ?? 'null'));
  logger.warn(
    '  Active Conversation (UIStore): ' + (uiStore.activeConversationId?.slice(0, 8) ?? 'null')
  );
  logger.warn('  Active messages: ' + String(msgs.length));
  logger.warn('  Total sessions in ChatStore: ' + String(Object.keys(chatStore.sessions).length));
  logger.warn('  Remapped IDs: ' + String(Object.keys(chatStore.remappedOrbitIds).length));

  // Which sessions are still streaming?
  for (const [sessId, sessData] of Object.entries(chatStore.sessions)) {
    if (sessData.isAgentRunning) {
      logger.warn(
        '  >>> Session ' +
          sessId.slice(0, 8) +
          ' is STILL STREAMING (' +
          String(sessData.messages.length) +
          ' msgs)'
      );
    }
  }

  // Sidebar entries
  logger.warn('  --- Sidebar (' + String(sidebar.length) + ' entries) ---');
  for (const [i, conv] of sidebar.entries()) {
    const isActive = conv.sessionId === uiStore.activeConversationId;
    const marker = isActive ? ' [ACTIVE]' : '';
    logger.warn(
      '    [' +
        String(i) +
        '] ' +
        conv.title.slice(0, 30) +
        ' | sid=' +
        conv.sessionId.slice(0, 8) +
        ' | msgs=' +
        String(conv.messageCount) +
        marker
    );
  }

  // Active session messages (truncated)
  if (msgs.length > 0) {
    logger.warn('  --- Active Messages ---');
    for (const [i, m] of msgs.entries()) {
      const content = m.content.slice(0, 80).replace(/\n/g, '\\n');
      const prefix = m.role === 'user' ? '  YOU: ' : '  BOT: ';
      logger.warn('    [' + String(i) + '] ' + prefix + '"' + content + '"');
    }
  }

  logger.warn('==== END SESSION STATE ====\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Assertions
// ────────────────────────────────────────────────────────────────────────────

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

function assertEq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new AssertionError(label + ': expected ' + String(expected) + ', got ' + String(actual));
  }
}

function assertGte(actual: number, expected: number, label: string): void {
  if (actual < expected) {
    throw new AssertionError(
      label + ': expected >= ' + String(expected) + ', got ' + String(actual)
    );
  }
}

function assertSidebarContains(sessionId: string, label: string): void {
  const sidebar = getSidebarEntries();
  const found = sidebar.some((e) => e.sessionId === sessionId);
  if (!found) {
    throw new AssertionError(
      label +
        ': sidebar does not contain session ' +
        sessionId.slice(0, 8) +
        '. Sidebar IDs: [' +
        sidebar.map((e) => e.sessionId.slice(0, 8)).join(', ') +
        ']'
    );
  }
}

function assertNoDuplicateSidebarEntries(label: string): void {
  const sidebar = getSidebarEntries();
  const ids = sidebar.map((e) => e.sessionId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    throw new AssertionError(
      label +
        ': duplicate sidebar entries: [' +
        duplicates.map((d) => d.slice(0, 8)).join(', ') +
        ']'
    );
  }
}

/** Track session ID through remaps. Call after any operation that may trigger system:init. */
function trackSessionRemap(label: string, createdSessions: Record<string, string>): void {
  const currentSid = getActiveSessionId();
  const storedSid = createdSessions[label];
  if (currentSid && storedSid && currentSid !== storedSid) {
    logger.warn(
      'Chat ' + label + ' remapped: ' + storedSid.slice(0, 8) + ' -> ' + currentSid.slice(0, 8)
    );
    createdSessions[label] = currentSid;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ────────────────────────────────────────────────────────────────────────────

export async function runSessionStressTest(
  deps: SessionStressTestDeps,
  config: SessionStressTestConfig = {}
): Promise<StepResult[]> {
  const {
    delayBetweenMessages = 500,
    delayAfterSwitch = 1500,
    agentTimeout = 120_000,
    createTimeout = 15_000,
    streamingStartTimeout = 30_000,
  } = config;

  const { handleSend, postMessage } = deps;
  const results: StepResult[] = [];
  const testStart = Date.now();

  // Track session IDs as they're created (may be remapped by system:init)
  const createdSessions: Record<string, string> = {}; // label → current sessionId

  // Start continuous recording
  const recorder = createStateRecorder();
  recorder.start();

  logger.warn('========================================================');
  logger.warn('   SESSION LIFECYCLE STRESS TEST v2 -- STARTING          ');
  logger.warn('   (MID-STREAM SWITCHING + LONG RESPONSES + TOOL USE)    ');
  logger.warn('========================================================');
  logger.warn('  delayBetweenMessages:   ' + String(delayBetweenMessages) + 'ms');
  logger.warn('  delayAfterSwitch:       ' + String(delayAfterSwitch) + 'ms');
  logger.warn('  agentTimeout:           ' + String(agentTimeout) + 'ms');
  logger.warn('  streamingStartTimeout:  ' + String(streamingStartTimeout) + 'ms');
  logger.warn('========================================================');

  logSessionState('INITIAL STATE');

  /**
   * Resolve a session label to its current (possibly remapped) session ID.
   */
  const resolveSessionId = (label: string): string => {
    const sid = createdSessions[label];
    if (!sid) throw new Error('Unknown session label: ' + label);
    const chatStore = useChatStore.getState();
    if (sid in chatStore.remappedOrbitIds && chatStore.sessions[sid] === undefined) {
      // ID was remapped — find the current active session if it was this one
      if (chatStore.activeSessionId && chatStore.sessions[chatStore.activeSessionId]) {
        createdSessions[label] = chatStore.activeSessionId;
        return chatStore.activeSessionId;
      }
    }
    return sid;
  };

  // Step runner helper
  const runStep = async (stepName: string, fn: () => Promise<void> | void): Promise<boolean> => {
    const stepStart = Date.now();
    try {
      await fn();
      const duration = Date.now() - stepStart;
      const sid = getActiveSessionId() ?? 'null';
      results.push({
        step: stepName,
        durationMs: duration,
        sessionId: sid,
        messageCount: getActiveMessages().length,
        sidebarCount: getSidebarEntries().length,
        success: true,
      });
      logger.warn(
        '[PASS] ' +
          stepName +
          ' (' +
          String(duration) +
          'ms) — msgs: ' +
          String(getActiveMessages().length) +
          ', sidebar: ' +
          String(getSidebarEntries().length)
      );
      return true;
    } catch (err) {
      const duration = Date.now() - stepStart;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        step: stepName,
        durationMs: duration,
        sessionId: getActiveSessionId() ?? 'null',
        messageCount: getActiveMessages().length,
        sidebarCount: getSidebarEntries().length,
        success: false,
        error: errorMsg,
      });
      logger.error('[FAIL] ' + stepName + ' (' + String(duration) + 'ms): ' + errorMsg);
      logSessionState('FAILURE: ' + stepName);
      return false;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Step 1: Create Chat A + send long prompt (DON'T wait for completion)
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 1: Create Chat A + send long prompt (350 words) ---');
  const step1Ok = await runStep('Create A + send long prompt', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['A'] = newSessionId;
    logger.warn('Chat A created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    // Send long prompt — will generate a ~350 word response
    handleSend(LONG_PROMPT_A);

    // Wait for streaming to START (not complete!) — we see the first assistant chunk
    await waitForStreamingStarted(streamingStartTimeout, 'Chat A streaming start');
    logger.warn('Chat A is now STREAMING. Proceeding to create Chat B...');

    trackSessionRemap('A', createdSessions);
    assertSidebarContains(resolveSessionId('A'), 'Chat A in sidebar while streaming');
    assertNoDuplicateSidebarEntries('After Chat A starts streaming');
  });
  if (!step1Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2: Create Chat B + send long prompt WHILE Chat A is streaming
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 2: Create Chat B + send (Chat A still streaming!) ---');
  const step2Ok = await runStep('Create B mid-stream + send', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['B'] = newSessionId;
    logger.warn('Chat B created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    handleSend(LONG_PROMPT_B);

    // Wait for B to start streaming too
    await waitForStreamingStarted(streamingStartTimeout, 'Chat B streaming start');
    logger.warn('Chat B is now STREAMING. Both A and B streaming concurrently!');

    trackSessionRemap('B', createdSessions);
    logSessionState('Both A and B streaming');

    // Sidebar should have both entries
    assertSidebarContains(resolveSessionId('A'), 'Chat A in sidebar (streaming in bg)');
    assertSidebarContains(resolveSessionId('B'), 'Chat B in sidebar (streaming)');
    assertNoDuplicateSidebarEntries('Both chats streaming');
  });
  if (!step2Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 3: Switch BACK to Chat A while both are streaming
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 3: Switch to Chat A (both still streaming!) ---');
  const step3Ok = await runStep('Switch to A mid-stream', async () => {
    const sessionA = resolveSessionId('A');
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);

    logSessionState('Switched to A (mid-stream)');

    // We should be on Chat A
    assertEq(getActiveSessionId(), sessionA, 'Should be on Chat A');

    // Chat A should have messages (user + streaming assistant)
    const msgs = getActiveMessages();
    assertGte(msgs.length, 1, 'Chat A should have at least 1 message');

    // Sidebar should still have both
    assertSidebarContains(resolveSessionId('A'), 'Chat A in sidebar after switch');
    assertSidebarContains(resolveSessionId('B'), 'Chat B in sidebar after switch');
    assertNoDuplicateSidebarEntries('After mid-stream switch to A');
  });
  if (!step3Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 4: Wait for Chat A to complete, then switch to B, wait, verify both
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 4: Wait for A to complete, verify, then verify B ---');
  const step4Ok = await runStep('Complete A + verify both', async () => {
    // Wait for Chat A to finish streaming
    await waitForAgentComplete(agentTimeout, 'Chat A complete');
    trackSessionRemap('A', createdSessions);

    const aMsgs = getActiveMessages();
    assertGte(aMsgs.length, 2, 'Chat A should have >= 2 messages (user + assistant)');
    logger.warn(
      'Chat A response length: ' + String(aMsgs[aMsgs.length - 1]?.content.length ?? 0) + ' chars'
    );

    // Now switch to B and wait for it
    const sessionB = resolveSessionId('B');
    switchToConversation(sessionB, postMessage);
    await sleep(delayAfterSwitch);

    // B might still be streaming or might be done — wait for completion
    await waitForAgentComplete(agentTimeout, 'Chat B complete');
    trackSessionRemap('B', createdSessions);

    const bMsgs = getActiveMessages();
    assertGte(bMsgs.length, 2, 'Chat B should have >= 2 messages');
    logger.warn(
      'Chat B response length: ' + String(bMsgs[bMsgs.length - 1]?.content.length ?? 0) + ' chars'
    );

    logSessionState('Both A and B complete');
    assertNoDuplicateSidebarEntries('After both complete');
  });
  if (!step4Ok) {
    recorder.stop();
    return results;
  }

  await sleep(delayBetweenMessages);

  // ══════════════════════════════════════════════════════════════════════════
  // Step 5: Switch to Chat A, send tool-use prompt (create file on Desktop)
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 5: Chat A → send tool-use prompt (file create/read) ---');
  const step5Ok = await runStep('Tool use in A', async () => {
    const sessionA = resolveSessionId('A');
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);

    handleSend(TOOL_USE_PROMPT);

    // Wait for streaming to start (tool execution may take a moment)
    await waitForStreamingStarted(streamingStartTimeout, 'Chat A tool-use streaming');
    logger.warn('Chat A tool-use streaming started. Switching to B...');

    trackSessionRemap('A', createdSessions);
    assertSidebarContains(resolveSessionId('A'), 'Chat A in sidebar during tool use');
  });
  if (!step5Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 6: Switch to Chat B mid-tool-use, send another long prompt
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 6: Switch to B while A runs tools, send long prompt ---');
  const step6Ok = await runStep('B long prompt while A tools', async () => {
    const sessionB = resolveSessionId('B');
    switchToConversation(sessionB, postMessage);
    await sleep(delayAfterSwitch);

    handleSend(LONG_PROMPT_B2);

    await waitForStreamingStarted(streamingStartTimeout, 'Chat B second msg streaming');
    logger.warn('Chat B second message streaming. Both A (tools) and B (text) running...');

    trackSessionRemap('B', createdSessions);
    logSessionState('A doing tools, B streaming text');

    assertSidebarContains(resolveSessionId('A'), 'Chat A sidebar during concurrent ops');
    assertSidebarContains(resolveSessionId('B'), 'Chat B sidebar during concurrent ops');
    assertNoDuplicateSidebarEntries('During concurrent tool-use + streaming');
  });
  if (!step6Ok) {
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 7: Rapid switch B → A → B → A while both are streaming/tools
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 7: Rapid switch B→A→B→A (both busy) ---');
  const step7Ok = await runStep('Rapid switch during streaming', async () => {
    const sessionA = resolveSessionId('A');
    const sessionB = resolveSessionId('B');

    // B → A (200ms gap)
    switchToConversation(sessionA, postMessage);
    await sleep(200);

    // A → B (200ms gap)
    switchToConversation(sessionB, postMessage);
    await sleep(200);

    // B → A (final destination)
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);

    logSessionState('After rapid switch B→A→B→A');

    assertEq(getActiveSessionId(), sessionA, 'Should end on Chat A');
    assertSidebarContains(resolveSessionId('A'), 'A in sidebar after rapid switch');
    assertSidebarContains(resolveSessionId('B'), 'B in sidebar after rapid switch');
    assertNoDuplicateSidebarEntries('After rapid switch during streaming');
  });
  if (!step7Ok) {
    recorder.stop();
    return results;
  }

  // Wait for both A and B to finish before continuing
  logger.warn('\n--- Waiting for A and B to complete... ---');
  await waitForAgentComplete(agentTimeout, 'Chat A tool-use complete');
  trackSessionRemap('A', createdSessions);

  const sessionB = resolveSessionId('B');
  switchToConversation(sessionB, postMessage);
  await sleep(delayAfterSwitch);
  await waitForAgentComplete(agentTimeout, 'Chat B second msg complete');
  trackSessionRemap('B', createdSessions);

  await sleep(delayBetweenMessages);

  // ══════════════════════════════════════════════════════════════════════════
  // Step 8: Create Chat C + send long prompt, switch to A while C streams
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 8: Create Chat C, send long prompt, switch to A mid-stream ---');
  const step8Ok = await runStep('Create C + switch away mid-stream', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['C'] = newSessionId;
    logger.warn('Chat C created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    handleSend(LONG_PROMPT_C);

    // Wait for C to start streaming
    await waitForStreamingStarted(streamingStartTimeout, 'Chat C streaming start');
    logger.warn('Chat C streaming. Switching to A...');

    trackSessionRemap('C', createdSessions);

    // Switch to A while C is still streaming
    const sessionA = resolveSessionId('A');
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);

    logSessionState('On A while C streams in background');

    assertEq(getActiveSessionId(), sessionA, 'Should be on Chat A');
    assertSidebarContains(resolveSessionId('A'), 'A in sidebar');
    assertSidebarContains(resolveSessionId('B'), 'B in sidebar');
    assertSidebarContains(resolveSessionId('C'), 'C in sidebar (streaming in bg)');
    assertNoDuplicateSidebarEntries('After creating C and switching to A');
  });
  if (!step8Ok) {
    recorder.stop();
    return results;
  }

  // Wait for C to complete in background
  logger.warn('\n--- Waiting for Chat C to complete in background... ---');
  const sessionC = resolveSessionId('C');
  switchToConversation(sessionC, postMessage);
  await sleep(delayAfterSwitch);
  await waitForAgentComplete(agentTimeout, 'Chat C complete');
  trackSessionRemap('C', createdSessions);

  await sleep(delayBetweenMessages);

  // ══════════════════════════════════════════════════════════════════════════
  // Step 9: Final verification — all messages intact, sidebar clean
  // ══════════════════════════════════════════════════════════════════════════
  logger.warn('\n--- Step 9: Final verification (all sessions) ---');
  const step9Ok = await runStep('Final verification', async () => {
    // Verify Chat A
    const sessionA = resolveSessionId('A');
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);
    const aMsgs = getActiveMessages();
    // Chat A: long prompt + response + tool prompt + response = >= 4 messages
    assertGte(aMsgs.length, 4, 'Chat A should have >= 4 messages (2 prompts + 2 responses)');
    const hasAlpha = aMsgs.some((m) => m.content.includes('ALPHA'));
    if (!hasAlpha) {
      throw new AssertionError(
        'Chat A should contain "ALPHA" marker. Messages: ' +
          aMsgs.map((m) => '"' + m.content.slice(0, 40) + '"').join(', ')
      );
    }
    logger.warn('Chat A verified: ' + String(aMsgs.length) + ' messages, ALPHA marker found');

    // Verify Chat B
    const resolvedB = resolveSessionId('B');
    switchToConversation(resolvedB, postMessage);
    await sleep(delayAfterSwitch);
    const bMsgs = getActiveMessages();
    // Chat B: bravo prompt + response + bravo2 prompt + response = >= 4 messages
    assertGte(bMsgs.length, 4, 'Chat B should have >= 4 messages (2 prompts + 2 responses)');
    const hasBravo = bMsgs.some((m) => m.content.includes('BRAVO'));
    if (!hasBravo) {
      throw new AssertionError(
        'Chat B should contain "BRAVO" marker. Messages: ' +
          bMsgs.map((m) => '"' + m.content.slice(0, 40) + '"').join(', ')
      );
    }
    logger.warn('Chat B verified: ' + String(bMsgs.length) + ' messages, BRAVO marker found');

    // Verify Chat C
    const resolvedC = resolveSessionId('C');
    switchToConversation(resolvedC, postMessage);
    await sleep(delayAfterSwitch);
    const cMsgs = getActiveMessages();
    assertGte(cMsgs.length, 2, 'Chat C should have >= 2 messages');
    const hasCharlie = cMsgs.some((m) => m.content.includes('CHARLIE'));
    if (!hasCharlie) {
      throw new AssertionError(
        'Chat C should contain "CHARLIE" marker. Messages: ' +
          cMsgs.map((m) => '"' + m.content.slice(0, 40) + '"').join(', ')
      );
    }
    logger.warn('Chat C verified: ' + String(cMsgs.length) + ' messages, CHARLIE marker found');

    // Sidebar integrity
    assertSidebarContains(resolveSessionId('A'), 'Final: A in sidebar');
    assertSidebarContains(resolveSessionId('B'), 'Final: B in sidebar');
    assertSidebarContains(resolveSessionId('C'), 'Final: C in sidebar');
    assertNoDuplicateSidebarEntries('Final sidebar check');

    // activeConversationId ↔ activeSessionId consistency
    const uiStore = useUIStore.getState();
    const chatStore = useChatStore.getState();
    assertEq(
      uiStore.activeConversationId,
      chatStore.activeSessionId,
      'UIStore.activeConversationId should match ChatStore.activeSessionId'
    );

    // Ghost detection
    const sidebar = getSidebarEntries();
    const knownIds = new Set([resolveSessionId('A'), resolveSessionId('B'), resolveSessionId('C')]);
    for (const entry of sidebar) {
      if (
        !knownIds.has(entry.sessionId) &&
        entry.messageCount === 0 &&
        !chatStore.sessions[entry.sessionId]
      ) {
        logger.warn('  GHOST detected: ' + entry.sessionId.slice(0, 8) + ' "' + entry.title + '"');
      }
    }

    logSessionState('FINAL VERIFIED STATE');
  });
  if (!step9Ok) {
    recorder.stop();
    return results;
  }

  // ── Final Report ───────────────────────────────────────────────────────
  const recordedEvents = recorder.stop();
  const totalElapsed = Date.now() - testStart;

  logger.warn('\n========================================================');
  logger.warn(
    '  SESSION STRESS TEST v2 COMPLETE -- ' + (totalElapsed / 1000).toFixed(1) + 's total'
  );
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
        'ms)' +
        ' -- msgs: ' +
        String(r.messageCount) +
        ', sidebar: ' +
        String(r.sidebarCount)
    );
    if (r.error) {
      logger.warn('    Error: ' + r.error);
    }
  }

  logger.warn('');
  logger.warn('  Total recorded events: ' + String(recordedEvents.length));
  logger.warn('  Session labels:');
  for (const [label, sid] of Object.entries(createdSessions)) {
    logger.warn('    Chat ' + label + ': ' + sid.slice(0, 8) + '...');
  }

  const remapped = useChatStore.getState().remappedOrbitIds;
  const remappedKeys = Object.keys(remapped);
  if (remappedKeys.length > 0) {
    logger.warn(
      '  Total remapped IDs: ' +
        String(remappedKeys.length) +
        ' [' +
        remappedKeys.map((k) => k.slice(0, 8)).join(', ') +
        ']'
    );
  }

  logger.warn('========================================================');
  logSessionState('FINAL STATE');

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    logger.warn('All ' + String(results.length) + ' steps passed!');
  } else {
    const failed = results.filter((r) => !r.success);
    logger.warn(String(failed.length) + ' step(s) failed');
  }

  return results;
}
