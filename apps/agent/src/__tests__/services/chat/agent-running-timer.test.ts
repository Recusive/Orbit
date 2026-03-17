import type { ExtensionMessage } from '@/types/protocol';

import { AGENT_RUNNING_CLEAR_DELAY_MS } from '@/lib/utils/constants';
import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface ChatMessageServiceInternals {
  turnHadTools: Map<string, boolean>;
  agentRunningTimers: Map<string, ReturnType<typeof setTimeout>>;
  scheduleAgentRunningClear: (sessionId: string, delayMs: number) => void;
  remapRunningState: (oldSid: string, newSid: string) => void;
}

const TEST_UUID = '00000000-0000-4000-8000-000000000001';

function getInternals(): ChatMessageServiceInternals {
  return chatMessageService as unknown as ChatMessageServiceInternals;
}

function makeAgentComplete(
  sessionId: string
): Extract<ExtensionMessage, { type: 'agent:complete' }> {
  return {
    type: 'agent:complete',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-message',
  };
}

function makeAgentChunk(sessionId: string): Extract<ExtensionMessage, { type: 'agent:chunk' }> {
  return {
    type: 'agent:chunk',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-message',
    content: 'chunk',
  };
}

function makeAgentThinking(
  sessionId: string
): Extract<ExtensionMessage, { type: 'agent:thinking' }> {
  return {
    type: 'agent:thinking',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-message',
    thinking: 'thinking...',
  };
}

function makeToolStart(sessionId: string): Extract<ExtensionMessage, { type: 'tool:start' }> {
  return {
    type: 'tool:start',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-message',
    tool_id: 'tool-1',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/file.ts' },
    content_offset: 0,
  };
}

function makePermissionRequest(
  sessionId: string
): Extract<ExtensionMessage, { type: 'permission:request' }> {
  return {
    type: 'permission:request',
    uuid: TEST_UUID,
    session_id: sessionId,
    request_id: 'perm-1',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/file.ts' },
  };
}

function resetStores(): void {
  useToolStore.getState().reset();
  useCheckpointStore.getState().clearAll();
  useChatStore.setState({
    sessions: {},
    activeSessionId: null,
    lastCreatedSessionId: null,
    pendingMessage: null,
    remappedOrbitIds: {},
    rewindEpoch: 0,
    conversationLoadEpoch: 0,
    loadedSessions: {},
    activeCompactions: {},
    lruOrder: [],
  });
  useUIStore.setState({
    workspacePath: null,
    activeWorktreePath: null,
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
    isLoadingConversation: false,
    isConversationTransitioning: false,
  });
}

function initRunningSession(sessionId: string): void {
  const chatStore = useChatStore.getState();
  chatStore.getOrCreateSession(sessionId);
  chatStore.setAgentRunning(sessionId, true);
}

function expectSessionRunning(sessionId: string, expected: boolean): void {
  expect(useChatStore.getState().sessions[sessionId]?.isAgentRunning).toBe(expected);
}

function expectStopPending(sessionId: string, expected: boolean): void {
  expect(useChatStore.getState().sessions[sessionId]?.isStopPending).toBe(expected);
}

function scheduleDelayedClearViaComplete(sessionId: string): void {
  const internals = getInternals();
  internals.turnHadTools.set(sessionId, true);
  chatMessageService.handleMessage(makeAgentComplete(sessionId));
}

describe('ChatMessageService agent running timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    chatMessageService.destroyAll();
    resetStores();
  });

  afterEach(() => {
    chatMessageService.destroyAll();
    resetStores();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('delays clearing isAgentRunning/stopPending for tool-using turns', () => {
    const sid = 'session-tools-delayed';
    initRunningSession(sid);
    useChatStore.getState().setStopPending(sid, true);

    scheduleDelayedClearViaComplete(sid);

    expectSessionRunning(sid, true);
    expectStopPending(sid, true);

    vi.advanceTimersByTime(AGENT_RUNNING_CLEAR_DELAY_MS - 1);
    expectSessionRunning(sid, true);
    expectStopPending(sid, true);

    vi.advanceTimersByTime(1);
    expectSessionRunning(sid, false);
    expectStopPending(sid, false);
  });

  it('clears immediately for non-tool turns', () => {
    const sid = 'session-no-tools';
    initRunningSession(sid);
    useChatStore.getState().setStopPending(sid, true);

    getInternals().turnHadTools.set(sid, false);
    chatMessageService.handleMessage(makeAgentComplete(sid));

    expectSessionRunning(sid, false);
    expectStopPending(sid, false);
  });

  it('cancels delayed clear when an agent chunk arrives', () => {
    const sid = 'session-cancel-chunk';
    initRunningSession(sid);
    scheduleDelayedClearViaComplete(sid);

    chatMessageService.handleMessage(makeAgentChunk(sid));

    expect(getInternals().agentRunningTimers.has(sid)).toBe(false);
    vi.advanceTimersByTime(AGENT_RUNNING_CLEAR_DELAY_MS + 1);
    expectSessionRunning(sid, true);
  });

  it('cancels delayed clear when an agent thinking event arrives', () => {
    const sid = 'session-cancel-thinking';
    initRunningSession(sid);
    scheduleDelayedClearViaComplete(sid);

    chatMessageService.handleMessage(makeAgentThinking(sid));

    expect(getInternals().agentRunningTimers.has(sid)).toBe(false);
    vi.advanceTimersByTime(AGENT_RUNNING_CLEAR_DELAY_MS + 1);
    expectSessionRunning(sid, true);
  });

  it('cancels delayed clear when tool:start arrives', () => {
    const sid = 'session-cancel-tool-start';
    initRunningSession(sid);
    scheduleDelayedClearViaComplete(sid);

    chatMessageService.handleMessage(makeToolStart(sid));

    expect(getInternals().agentRunningTimers.has(sid)).toBe(false);
    vi.advanceTimersByTime(AGENT_RUNNING_CLEAR_DELAY_MS + 1);
    expectSessionRunning(sid, true);
  });

  it('cancels delayed clear when permission:request arrives before tool:start', () => {
    const sid = 'session-cancel-permission';
    initRunningSession(sid);
    scheduleDelayedClearViaComplete(sid);

    chatMessageService.handleMessage(makePermissionRequest(sid));

    expect(getInternals().agentRunningTimers.has(sid)).toBe(false);
    vi.advanceTimersByTime(AGENT_RUNNING_CLEAR_DELAY_MS + 1);
    expectSessionRunning(sid, true);
  });

  it('remaps delayed clear timers with remaining time across session remap', () => {
    const oldSid = 'session-old';
    const newSid = 'session-new';
    const internals = getInternals();

    initRunningSession(oldSid);
    useChatStore.getState().setStopPending(oldSid, true);
    internals.turnHadTools.set(oldSid, true);
    internals.scheduleAgentRunningClear(oldSid, 1000);

    vi.advanceTimersByTime(400);

    useChatStore.getState().remapSession(oldSid, newSid);
    internals.remapRunningState(oldSid, newSid);

    expect(internals.turnHadTools.has(oldSid)).toBe(false);
    expect(internals.turnHadTools.get(newSid)).toBe(true);
    expect(internals.agentRunningTimers.has(oldSid)).toBe(false);
    expect(internals.agentRunningTimers.has(newSid)).toBe(true);

    vi.advanceTimersByTime(599);
    expectSessionRunning(newSid, true);
    expectStopPending(newSid, true);

    vi.advanceTimersByTime(1);
    expectSessionRunning(newSid, false);
    expectStopPending(newSid, false);
    expect(useChatStore.getState().sessions[oldSid]).toBeUndefined();
  });
});
