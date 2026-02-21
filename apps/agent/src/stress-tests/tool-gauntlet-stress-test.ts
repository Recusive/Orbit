/**
 * Tool Gauntlet Stress Test — Multi-Session Concurrent Tool Execution
 *
 * Sends ONE mega-prompt per session that exercises ALL tools (Write, Read,
 * Edit, Bash, Glob, Grep) in a single long-running turn. Fires up 3
 * sessions concurrently, then switches between them while tools are actively
 * running — the harshest scenario for tool lifecycle management.
 *
 * Detection targets:
 *   - Orphaned tools: tool:start without matching tool:end (activeTools leak)
 *   - Cross-session contamination: tool events arriving for wrong session
 *   - Session remap mid-tool-execution dropping tool state
 *   - Rapid switching causing duplicate sidebar entries or ghost sessions
 *   - Messages landing in wrong session after switch
 *
 * Flow:
 *   Step 1: Create Chat A → send mega-prompt (all tools) → DON'T WAIT
 *   Step 2: Create Chat B → send mega-prompt → DON'T WAIT
 *   Step 3: Create Chat C → send mega-prompt → DON'T WAIT
 *   Step 4: Rapid switching between A/B/C while all 3 are running tools
 *   Step 5: Wait for all 3 to complete, verify each
 *   Step 6: Full tool audit — zero orphaned tools, complete manifest
 *   Step 7: Final integrity — cross-session contamination check
 *
 * Usage (from browser DevTools console):
 *   window.__orbit_debug.runToolGauntletStressTest()
 *   window.__orbit_debug.runToolGauntletStressTest({ agentTimeout: 180000 })
 *
 * Prerequisites:
 * - A workspace open (needed for conversation:create)
 * - Input mode set to "accept" for auto-approving tool use
 */

import { createLogger } from '@orbit/common/lib';

import type { ToolExecution } from '@/stores/agent/tool-store';
import type { WebviewMessage } from '@/types/protocol';

import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('ToolGauntletStressTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ToolGauntletStressTestDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  postMessage: (msg: WebviewMessage) => void;
}

export interface ToolGauntletStressTestConfig {
  /** Delay after creating a session before sending the prompt (ms). Default: 500 */
  delayBetweenMessages?: number;
  /** Delay after switching conversations to let loading settle (ms). Default: 1500 */
  delayAfterSwitch?: number;
  /** Timeout for waiting for agent completion per session (ms). Default: 180000 */
  agentTimeout?: number;
  /** Timeout for waiting for conversation creation (ms). Default: 15000 */
  createTimeout?: number;
  /** Timeout for waiting for streaming to start (ms). Default: 30000 */
  streamingStartTimeout?: number;
  /** Delay between rapid switches (ms). Default: 300 */
  rapidSwitchDelay?: number;
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
// Tool Audit Types
// ────────────────────────────────────────────────────────────────────────────

interface ToolAuditEntry {
  toolId: string;
  toolName: string;
  sessionLabel: string;
  messageId: string;
  startedAt: number;
  completedAt?: number | undefined;
  status: string;
  success?: boolean | undefined;
  durationMs?: number | undefined;
}

interface ToolAuditor {
  start: () => void;
  stop: () => void;
  getEntries: () => ToolAuditEntry[];
  getActiveCount: () => number;
  snapshotActiveTools: (label: string) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Mega-Prompt — exercises ALL tools in a single long turn
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the mega-prompt for a session. Each session gets its own marker
 * (ALPHA, BRAVO, CHARLIE) so we can detect cross-session contamination.
 */
function buildMegaPrompt(marker: string, dir: string): string {
  return (
    'You are a testing assistant. Execute these tool calls ONE BY ONE in order. ' +
    'Do NOT skip any step. Do NOT combine steps into a single tool call.\n\n' +
    '1. Use the Bash tool to run: mkdir -p ' +
    dir +
    '\n' +
    '2. Use the Write tool (tool_name: "Write") to create ' +
    dir +
    '/' +
    marker.toLowerCase() +
    '.txt with content "' +
    marker +
    '-MARKER-1"\n' +
    '3. Use the Read tool (tool_name: "Read") to read ' +
    dir +
    '/' +
    marker.toLowerCase() +
    '.txt\n' +
    '4. Use the Edit tool (tool_name: "Edit") to change "' +
    marker +
    '-MARKER-1" to "' +
    marker +
    '-MARKER-2" in ' +
    dir +
    '/' +
    marker.toLowerCase() +
    '.txt\n' +
    '5. Use the Bash tool to run: echo "' +
    marker +
    '-BASH-OK" && ls ' +
    dir +
    '\n' +
    '6. Use the Glob tool (tool_name: "Glob") to find all .txt files in ' +
    dir +
    '/\n' +
    '7. Use the Grep tool (tool_name: "Grep") to search for "' +
    marker +
    '" in ' +
    dir +
    '/\n\n' +
    'After ALL 7 steps are done, reply with exactly "' +
    marker +
    '-ALL-DONE" on its own line.'
  );
}

const TEST_DIR = '~/Desktop/orbit-tool-gauntlet';

// ────────────────────────────────────────────────────────────────────────────
// Tool Auditor — subscribes to ToolStore and tracks every lifecycle event
// ────────────────────────────────────────────────────────────────────────────

function createToolAuditor(resolveLabel: (sessionId: string) => string): ToolAuditor {
  const entries: ToolAuditEntry[] = [];
  let unsubscribe: (() => void) | null = null;

  /** Turn a ToolExecution into an audit entry */
  const toEntry = (tool: ToolExecution, label: string): ToolAuditEntry => {
    const entry: ToolAuditEntry = {
      toolId: tool.id,
      toolName: tool.toolName,
      sessionLabel: label,
      messageId: tool.messageId,
      startedAt: tool.startedAt,
      status: tool.status,
    };
    if (tool.completedAt !== undefined) {
      entry.completedAt = tool.completedAt;
      entry.durationMs = tool.completedAt - tool.startedAt;
    }
    if (tool.success !== undefined) {
      entry.success = tool.success;
    }
    return entry;
  };

  return {
    start: (): void => {
      entries.length = 0;
      let prevActive = { ...useToolStore.getState().activeTools };
      let prevCompletedIds = new Set(useToolStore.getState().completedTools.map((t) => t.id));

      unsubscribe = useToolStore.subscribe((state) => {
        // Detect new active tools (tool:start)
        for (const [id, tool] of Object.entries(state.activeTools)) {
          if (!(id in prevActive)) {
            const label = tool.sessionId
              ? resolveLabel(tool.sessionId)
              : resolveLabel(useChatStore.getState().activeSessionId ?? '');
            const entry = toEntry(tool, label);
            entries.push(entry);
            logger.warn(
              '[TOOL:START] ' +
                tool.toolName +
                ' (id=' +
                id.slice(0, 8) +
                ', session=' +
                label +
                ')'
            );
          }
        }

        // Detect newly completed tools (tool:end)
        for (const tool of state.completedTools) {
          if (!prevCompletedIds.has(tool.id)) {
            const existing = entries.find((e) => e.toolId === tool.id);
            if (existing) {
              existing.completedAt = tool.completedAt;
              existing.status = tool.status;
              existing.success = tool.success;
              if (tool.completedAt !== undefined) {
                existing.durationMs = tool.completedAt - existing.startedAt;
              }
            } else {
              const label = tool.sessionId ? resolveLabel(tool.sessionId) : '?';
              entries.push(toEntry(tool, label));
            }
            logger.warn(
              '[TOOL:END] ' +
                tool.toolName +
                ' (id=' +
                tool.id.slice(0, 8) +
                ', success=' +
                String(tool.success ?? 'unknown') +
                ', duration=' +
                String(tool.completedAt !== undefined ? tool.completedAt - tool.startedAt : '?') +
                'ms)'
            );
          }
        }

        // Detect tools that disappeared without completing
        for (const [id] of Object.entries(prevActive)) {
          if (!(id in state.activeTools) && !state.completedTools.some((t) => t.id === id)) {
            logger.warn(
              '[TOOL:LOST] Tool ' +
                id.slice(0, 8) +
                ' vanished from activeTools without completing!'
            );
            const existing = entries.find((e) => e.toolId === id);
            if (existing) {
              existing.status = 'lost';
            }
          }
        }

        prevActive = { ...state.activeTools };
        prevCompletedIds = new Set(state.completedTools.map((t) => t.id));
      });
    },

    stop: (): void => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },

    getEntries: (): ToolAuditEntry[] => [...entries],

    getActiveCount: (): number => Object.keys(useToolStore.getState().activeTools).length,

    snapshotActiveTools: (label: string): void => {
      const active = useToolStore.getState().activeTools;
      const count = Object.keys(active).length;
      if (count === 0) {
        logger.warn('[TOOL:SNAPSHOT ' + label + '] No active tools');
      } else {
        logger.warn(
          '[TOOL:SNAPSHOT ' +
            label +
            '] ' +
            String(count) +
            ' active: ' +
            Object.values(active)
              .map((t) => t.toolName + '(' + t.id.slice(0, 6) + ')')
              .join(', ')
        );
      }
    },
  };
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

function getSessionMessages(sessionId: string): MessageSnapshot[] {
  const state = useChatStore.getState();
  return (state.sessions[sessionId]?.messages ?? []).map((m) => ({
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
 * Wait for a specific content marker in an assistant message for a SPECIFIC
 * session (not just the active one). This allows waiting for background
 * sessions to complete without switching to them.
 */
function waitForSessionMarker(
  sessionId: string,
  marker: string,
  timeout: number,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      const session = useChatStore.getState().sessions[sessionId];
      const msgs = session?.messages ?? [];
      const lastMsg = msgs[msgs.length - 1];
      reject(
        new Error(
          'Timeout (' +
            String(timeout) +
            'ms) waiting for marker "' +
            marker +
            '": ' +
            label +
            '. Session: ' +
            sessionId.slice(0, 8) +
            ', isAgentRunning: ' +
            String(session?.isAgentRunning ?? 'unknown') +
            ', msgs: ' +
            String(msgs.length) +
            ', lastMsg: "' +
            (lastMsg?.content.slice(0, 80) ?? 'none') +
            '"'
        )
      );
    }, timeout);

    const check = (): boolean => {
      const state = useChatStore.getState();
      // Check both original and remapped session IDs
      let session = state.sessions[sessionId];
      if (!session) {
        // Session may have been remapped — check remapped IDs
        const remappedTo = state.remappedOrbitIds[sessionId];
        if (typeof remappedTo === 'string') {
          session = state.sessions[remappedTo];
        }
      }
      if (!session) return false;
      const hasMarker = session.messages.some(
        (m) => m.role === 'assistant' && m.content.includes(marker)
      );
      return hasMarker && !session.isAgentRunning && !session.isStopPending;
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

  for (const [sessId, sessData] of Object.entries(chatStore.sessions)) {
    const runningState = sessData.isAgentRunning ? 'STREAMING' : 'idle';
    logger.warn(
      '  Session ' +
        sessId.slice(0, 8) +
        ': ' +
        runningState +
        ' (' +
        String(sessData.messages.length) +
        ' msgs)'
    );
  }

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

/**
 * Assert that ALL active tools have been closed (no orphans).
 */
function assertAllToolsClosed(label: string): void {
  const active = useToolStore.getState().activeTools;
  const activeCount = Object.keys(active).length;
  if (activeCount > 0) {
    const orphans = Object.values(active)
      .map((t) => t.toolName + '(id=' + t.id.slice(0, 8) + ', msg=' + t.messageId.slice(0, 8) + ')')
      .join(', ');
    throw new AssertionError(
      label + ': ' + String(activeCount) + ' orphaned tool(s) in activeTools: [' + orphans + ']'
    );
  }
}

/** Track session ID through remaps.
 *  `remappedOrbitIds` is `Record<string, true>` — it records that the old ID
 *  was remapped but doesn't store the new ID. We detect the remap by seeing
 *  that the stored session ID is gone from `sessions` but a new activeSessionId
 *  exists. */
function trackSessionRemap(label: string, createdSessions: Record<string, string>): void {
  const chatStore = useChatStore.getState();
  const storedSid = createdSessions[label];
  if (!storedSid) return;

  // If the stored ID is now in remappedOrbitIds and no longer has a session,
  // the active session is the remapped-to session.
  if (storedSid in chatStore.remappedOrbitIds && !chatStore.sessions[storedSid]) {
    // Find the new session ID — it should be in the sessions map
    const currentActive = chatStore.activeSessionId;
    if (currentActive && currentActive !== storedSid && chatStore.sessions[currentActive]) {
      logger.warn(
        'Chat ' + label + ' remapped: ' + storedSid.slice(0, 8) + ' -> ' + currentActive.slice(0, 8)
      );
      createdSessions[label] = currentActive;
    }
  }
}

/** Log the complete tool manifest at the end of the test */
function logToolManifest(entries: ToolAuditEntry[]): void {
  logger.warn('\n==== TOOL MANIFEST (' + String(entries.length) + ' tools) ====');
  for (const e of entries) {
    const duration = e.durationMs !== undefined ? String(e.durationMs) + 'ms' : 'incomplete';
    const success = e.success !== undefined ? (e.success ? 'ok' : 'FAIL') : '?';
    logger.warn(
      '  [' +
        e.sessionLabel +
        '] ' +
        e.toolName.padEnd(12) +
        ' | id=' +
        e.toolId.slice(0, 8) +
        ' | status=' +
        e.status.padEnd(7) +
        ' | ' +
        duration.padStart(8) +
        ' | success=' +
        success
    );
  }
  logger.warn('==== END TOOL MANIFEST ====\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ────────────────────────────────────────────────────────────────────────────

export async function runToolGauntletStressTest(
  deps: ToolGauntletStressTestDeps,
  config: ToolGauntletStressTestConfig = {}
): Promise<StepResult[]> {
  const {
    delayBetweenMessages = 500,
    delayAfterSwitch = 1500,
    agentTimeout = 180_000,
    createTimeout = 15_000,
    streamingStartTimeout = 30_000,
    rapidSwitchDelay = 300,
  } = config;

  const { handleSend, postMessage } = deps;
  const results: StepResult[] = [];
  const testStart = Date.now();

  // Track session IDs as they're created (may be remapped by system:init)
  const createdSessions: Record<string, string> = {};

  /**
   * Resolve a session label to its current (possibly remapped) session ID.
   * When system:init remaps a frontend UUID → SDK UUID, the old ID is added
   * to `remappedOrbitIds` (Record<string, true>) and the session data moves
   * to the new ID. We detect this by checking if the stored ID is gone.
   */
  const resolveSessionId = (label: string): string => {
    const sid = createdSessions[label];
    if (!sid) throw new Error('Unknown session label: ' + label);
    const chatStore = useChatStore.getState();
    // If session still exists under original ID, use it
    if (chatStore.sessions[sid]) return sid;
    // It was remapped — the active session is likely the replacement
    if (sid in chatStore.remappedOrbitIds) {
      const activeId = chatStore.activeSessionId;
      if (activeId && activeId !== sid && chatStore.sessions[activeId]) {
        createdSessions[label] = activeId;
        return activeId;
      }
    }
    return sid;
  };

  /** Reverse lookup: session ID → label (for tool auditor) */
  const resolveLabel = (sessionId: string): string => {
    for (const [label, sid] of Object.entries(createdSessions)) {
      if (sid === sessionId) return label;
    }
    return sessionId.slice(0, 8);
  };

  // Start continuous recording
  const recorder = createStateRecorder();
  recorder.start();

  // Start tool auditor
  const auditor = createToolAuditor(resolveLabel);
  auditor.start();

  logger.warn('════════════════════════════════════════════════════════');
  logger.warn('   TOOL GAUNTLET STRESS TEST — CONCURRENT EDITION     ');
  logger.warn('   3 sessions × 7 tools each × rapid switching        ');
  logger.warn('════════════════════════════════════════════════════════');
  logger.warn('  agentTimeout:           ' + String(agentTimeout) + 'ms');
  logger.warn('  streamingStartTimeout:  ' + String(streamingStartTimeout) + 'ms');
  logger.warn('  rapidSwitchDelay:       ' + String(rapidSwitchDelay) + 'ms');
  logger.warn('════════════════════════════════════════════════════════');

  logSessionState('INITIAL STATE');

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
  // Step 1: Create Chat A → send mega-prompt → DON'T WAIT
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 1: Fire up Chat A (all tools) ──');
  const step1Ok = await runStep('Step 1: Fire Chat A', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['A'] = newSessionId;
    logger.warn('Chat A created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    handleSend(buildMegaPrompt('ALPHA', TEST_DIR));

    // Wait for streaming to START — then immediately move on
    await waitForStreamingStarted(streamingStartTimeout, 'Chat A streaming start');
    logger.warn('Chat A is STREAMING (tools running). Moving to B...');

    trackSessionRemap('A', createdSessions);
    assertSidebarContains(resolveSessionId('A'), 'Chat A in sidebar');
    auditor.snapshotActiveTools('Step 1 (A started)');
  });
  if (!step1Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2: Create Chat B → send mega-prompt → DON'T WAIT
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 2: Fire up Chat B (all tools) ──');
  const step2Ok = await runStep('Step 2: Fire Chat B', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['B'] = newSessionId;
    logger.warn('Chat B created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    handleSend(buildMegaPrompt('BRAVO', TEST_DIR));

    await waitForStreamingStarted(streamingStartTimeout, 'Chat B streaming start');
    logger.warn('Chat B is STREAMING. Moving to C...');

    trackSessionRemap('B', createdSessions);
    assertSidebarContains(resolveSessionId('B'), 'Chat B in sidebar');
    assertNoDuplicateSidebarEntries('After B created');
    auditor.snapshotActiveTools('Step 2 (B started, A still running)');
  });
  if (!step2Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 3: Create Chat C → send mega-prompt → DON'T WAIT
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 3: Fire up Chat C (all tools) ──');
  const step3Ok = await runStep('Step 3: Fire Chat C', async () => {
    const prevCreatedId = useChatStore.getState().lastCreatedSessionId;
    startNewConversation(postMessage);

    const newSessionId = await waitForSessionCreated(prevCreatedId, createTimeout);
    createdSessions['C'] = newSessionId;
    logger.warn('Chat C created: ' + newSessionId.slice(0, 8));
    await sleep(delayBetweenMessages);

    handleSend(buildMegaPrompt('CHARLIE', TEST_DIR));

    await waitForStreamingStarted(streamingStartTimeout, 'Chat C streaming start');
    logger.warn('Chat C is STREAMING. All 3 sessions now running!');

    trackSessionRemap('C', createdSessions);
    assertSidebarContains(resolveSessionId('C'), 'Chat C in sidebar');
    assertNoDuplicateSidebarEntries('After C created');
    auditor.snapshotActiveTools('Step 3 (ALL 3 streaming)');

    logSessionState('All 3 sessions launched');
  });
  if (!step3Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 4: Rapid switching between A/B/C while all 3 are running
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 4: Rapid switch A→B→C→A→B→C while tools run ──');
  const step4Ok = await runStep('Step 4: Rapid switching', async () => {
    const sessionA = resolveSessionId('A');
    const sessionB = resolveSessionId('B');
    const sessionC = resolveSessionId('C');

    // Currently on C. Switch: C → A → B → C → A → B → C
    const sequence = [sessionA, sessionB, sessionC, sessionA, sessionB, sessionC];
    const labels = ['A', 'B', 'C', 'A', 'B', 'C'];

    for (let i = 0; i < sequence.length; i++) {
      const target = sequence[i];
      const targetLabel = labels[i] ?? '?';
      if (!target) continue;
      logger.warn('Rapid switch → Chat ' + targetLabel);
      switchToConversation(target, postMessage);
      await sleep(rapidSwitchDelay);
      auditor.snapshotActiveTools('Rapid switch #' + String(i + 1) + ' → ' + targetLabel);
    }

    // Give a bit more time after the last switch to let things settle
    await sleep(delayAfterSwitch);

    logSessionState('After rapid switching (should be on C)');

    assertEq(getActiveSessionId(), sessionC, 'Should end on Chat C');
    assertSidebarContains(sessionA, 'A in sidebar after rapid');
    assertSidebarContains(sessionB, 'B in sidebar after rapid');
    assertSidebarContains(sessionC, 'C in sidebar after rapid');
    assertNoDuplicateSidebarEntries('After rapid switching');
  });
  if (!step4Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 5: Wait for all 3 sessions to complete
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 5: Wait for all 3 to complete ──');
  const step5Ok = await runStep('Step 5: All sessions complete', async () => {
    // Resolve current IDs (may have been remapped)
    const sessionA = resolveSessionId('A');
    const sessionB = resolveSessionId('B');
    const sessionC = resolveSessionId('C');

    logger.warn('Waiting for Chat A (ALPHA-ALL-DONE)...');
    await waitForSessionMarker(sessionA, 'ALPHA-ALL-DONE', agentTimeout, 'Chat A complete');
    trackSessionRemap('A', createdSessions);
    logger.warn('Chat A DONE!');

    logger.warn('Waiting for Chat B (BRAVO-ALL-DONE)...');
    await waitForSessionMarker(sessionB, 'BRAVO-ALL-DONE', agentTimeout, 'Chat B complete');
    trackSessionRemap('B', createdSessions);
    logger.warn('Chat B DONE!');

    logger.warn('Waiting for Chat C (CHARLIE-ALL-DONE)...');
    await waitForSessionMarker(sessionC, 'CHARLIE-ALL-DONE', agentTimeout, 'Chat C complete');
    trackSessionRemap('C', createdSessions);
    logger.warn('Chat C DONE! All 3 sessions complete.');

    // Settle delay for trailing tool:end events
    await sleep(2000);

    // Verify each session has messages
    const aMsgs = getSessionMessages(resolveSessionId('A'));
    const bMsgs = getSessionMessages(resolveSessionId('B'));
    const cMsgs = getSessionMessages(resolveSessionId('C'));

    assertGte(aMsgs.length, 2, 'Chat A should have >= 2 messages');
    assertGte(bMsgs.length, 2, 'Chat B should have >= 2 messages');
    assertGte(cMsgs.length, 2, 'Chat C should have >= 2 messages');

    // Verify markers
    const hasAlpha = aMsgs.some((m) => m.content.includes('ALPHA-ALL-DONE'));
    const hasBravo = bMsgs.some((m) => m.content.includes('BRAVO-ALL-DONE'));
    const hasCharlie = cMsgs.some((m) => m.content.includes('CHARLIE-ALL-DONE'));

    if (!hasAlpha) throw new AssertionError('Chat A missing ALPHA-ALL-DONE marker');
    if (!hasBravo) throw new AssertionError('Chat B missing BRAVO-ALL-DONE marker');
    if (!hasCharlie) throw new AssertionError('Chat C missing CHARLIE-ALL-DONE marker');

    logger.warn(
      'All sessions verified: A=' +
        String(aMsgs.length) +
        ' msgs, B=' +
        String(bMsgs.length) +
        ' msgs, C=' +
        String(cMsgs.length) +
        ' msgs'
    );
  });
  if (!step5Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 6: Full tool audit — zero orphaned tools
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 6: Tool audit — zero orphaned tools ──');
  const step6Ok = await runStep('Step 6: Tool audit', async () => {
    // Extra settle for any late tool:end events
    await sleep(1000);

    // PRIMARY ASSERTION: no orphaned tools
    assertAllToolsClosed('Tool gauntlet audit');

    // Verify every audited tool has a completed status
    const entries = auditor.getEntries();
    const incomplete = entries.filter(
      (e) => e.completedAt === undefined && e.status !== 'success' && e.status !== 'error'
    );
    if (incomplete.length > 0) {
      throw new AssertionError(
        'Tool audit: ' +
          String(incomplete.length) +
          ' tool(s) without completion: [' +
          incomplete
            .map((e) => e.toolName + '(' + e.sessionLabel + ', status=' + e.status + ')')
            .join(', ') +
          ']'
      );
    }

    // Log the complete manifest
    logToolManifest(entries);

    // Per-session tool count summary
    const sessLabels = ['A', 'B', 'C'];
    for (const label of sessLabels) {
      const sessTools = entries.filter((e) => e.sessionLabel === label);
      const toolNames = sessTools.map((e) => e.toolName);
      logger.warn(
        'Chat ' +
          label +
          ': ' +
          String(sessTools.length) +
          ' tools — [' +
          toolNames.join(', ') +
          ']'
      );
    }

    logger.warn('Tool audit PASSED: ALL ' + String(entries.length) + ' tools completed');
  });
  if (!step6Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 7: Final integrity — cross-session contamination, sidebar, ghosts
  // ══════════════════════════════════════════════════════════════════════════

  logger.warn('\n── Step 7: Final integrity verification ──');
  const step7Ok = await runStep('Step 7: Final integrity', async () => {
    const sessionA = resolveSessionId('A');
    const sessionB = resolveSessionId('B');
    const sessionC = resolveSessionId('C');

    // Cross-session contamination: A should NOT contain BRAVO/CHARLIE markers
    const aMsgs = getSessionMessages(sessionA);
    const contaminatedA = aMsgs.some(
      (m) =>
        m.role === 'assistant' &&
        (m.content.includes('BRAVO-MARKER') || m.content.includes('CHARLIE-MARKER'))
    );
    if (contaminatedA) {
      throw new AssertionError(
        'Cross-session contamination: Chat A contains BRAVO/CHARLIE markers!'
      );
    }

    // B should NOT contain ALPHA/CHARLIE
    const bMsgs = getSessionMessages(sessionB);
    const contaminatedB = bMsgs.some(
      (m) =>
        m.role === 'assistant' &&
        (m.content.includes('ALPHA-MARKER') || m.content.includes('CHARLIE-MARKER'))
    );
    if (contaminatedB) {
      throw new AssertionError(
        'Cross-session contamination: Chat B contains ALPHA/CHARLIE markers!'
      );
    }

    // C should NOT contain ALPHA/BRAVO
    const cMsgs = getSessionMessages(sessionC);
    const contaminatedC = cMsgs.some(
      (m) =>
        m.role === 'assistant' &&
        (m.content.includes('ALPHA-MARKER') || m.content.includes('BRAVO-MARKER'))
    );
    if (contaminatedC) {
      throw new AssertionError('Cross-session contamination: Chat C contains ALPHA/BRAVO markers!');
    }

    // Sidebar: all 3 present, no duplicates
    assertSidebarContains(sessionA, 'Final: A in sidebar');
    assertSidebarContains(sessionB, 'Final: B in sidebar');
    assertSidebarContains(sessionC, 'Final: C in sidebar');
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
    const knownIds = new Set([sessionA, sessionB, sessionC]);
    for (const entry of sidebar) {
      if (
        !knownIds.has(entry.sessionId) &&
        entry.messageCount === 0 &&
        !chatStore.sessions[entry.sessionId]
      ) {
        logger.warn('  GHOST detected: ' + entry.sessionId.slice(0, 8) + ' "' + entry.title + '"');
      }
    }

    // Visit each session to verify it loads correctly
    switchToConversation(sessionA, postMessage);
    await sleep(delayAfterSwitch);
    assertGte(getActiveMessages().length, 2, 'Chat A loads with messages');

    switchToConversation(sessionB, postMessage);
    await sleep(delayAfterSwitch);
    assertGte(getActiveMessages().length, 2, 'Chat B loads with messages');

    switchToConversation(sessionC, postMessage);
    await sleep(delayAfterSwitch);
    assertGte(getActiveMessages().length, 2, 'Chat C loads with messages');

    logSessionState('FINAL VERIFIED STATE');
  });
  if (!step7Ok) {
    auditor.stop();
    recorder.stop();
    return results;
  }

  // ── Final Report ───────────────────────────────────────────────────────
  auditor.stop();
  const recordedEvents = recorder.stop();
  const totalElapsed = Date.now() - testStart;

  logger.warn('\n════════════════════════════════════════════════════════');
  logger.warn('  TOOL GAUNTLET COMPLETE — ' + (totalElapsed / 1000).toFixed(1) + 's total');
  logger.warn('════════════════════════════════════════════════════════');

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
        (r.error ? ' — ' + r.error : '')
    );
  }

  logger.warn('');
  logger.warn('  Total recorded events: ' + String(recordedEvents.length));
  logger.warn('  Total tools audited:   ' + String(auditor.getEntries().length));
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

  logger.warn('════════════════════════════════════════════════════════');

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    logger.warn('ALL ' + String(results.length) + ' STEPS PASSED!');
  } else {
    const failed = results.filter((r) => !r.success);
    logger.warn(String(failed.length) + ' step(s) failed');
  }

  return results;
}
