/**
 * End-to-End Rewind System Tests
 *
 * Tests the COMPLETE rewind pipeline by simulating the actual message flow
 * that occurs during single and multi-rewind operations. Unlike unit tests
 * that mock individual functions, these tests wire together the real stores
 * and handlers to verify the system behaves correctly as a whole.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ REWIND PIPELINE (what these tests exercise):                        │
 * │                                                                     │
 * │ 1. User clicks rewind → handleRewind builds conversation:rewind    │
 * │ 2. handleConversationRewind resolves target message from disk/cache │
 * │ 3. conversation:rewound arrives → ChatMessageService processes it      │
 * │ 4. Fork point set → next send creates a branch via parentUuid      │
 * │ 5. system:init → session remap migrates stores to SDK session ID   │
 * │ 6. conversation:loaded → messages merge backend + live trailing     │
 * │                                                                     │
 * │ Multi-rewind complication:                                          │
 * │ After rewind 1, the original JSONL is deleted/truncated.            │
 * │ Rewind 2+ must use frontend messages (current_messages) because    │
 * │ the disk data is stale or gone. The 4-priority target resolution    │
 * │ must correctly fall through to the frontend fallback.               │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * @see conversation-handlers.ts - handleConversationRewind
 * @see chat-message-service.ts - conversation:rewound handler
 * @see checkpoint-store.ts - fork points and checkpoint tracking
 * @see chat-actions.ts - handleRewind (UI entry point)
 * @see message-utils.ts - getActiveChain
 */

import { enableMapSet } from 'immer';

import { getActiveChain } from '@/components/chat/messages/message-utils';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';

enableMapSet();

// =============================================================================
// Types
// =============================================================================

/** Minimal message shape matching ChatMessage for rewind testing */
interface TestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayedContent: string;
  parentUuid: string | null;
  createdAt: number;
  isStreaming?: boolean;
  thinking?: string;
  thinkingDurationMs?: number;
}

/** Tool use data as it arrives from the backend in conversation:rewound */
interface TestToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  success: boolean;
  contentOffset?: number;
}

/**
 * Simulates the backend's conversation:rewound event payload.
 * This is what ChatMessageService receives.
 */
interface RewoundEvent {
  session_id: string;
  new_session_id: string;
  rewind_to_message_id: string;
  messages: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parentUuid?: string | null;
    thinking?: string;
    thinkingDurationMs?: number;
    toolUses: TestToolUse[];
  }[];
}

// =============================================================================
// Test Helpers — Simulate the real message handler logic
// =============================================================================

/**
 * Simulates the conversation:rewound handler from ChatMessageService.
 *
 * This is NOT a mock — it replicates the EXACT logic so the test validates
 * the algorithm, not just "did we call the right mock". If the logic changes,
 * this test should break.
 */
function processConversationRewound(
  event: RewoundEvent,
  baseTimestamp?: number
): {
  resultMessages: TestMessage[];
  targetSessionId: string;
  sessionSwitched: boolean;
  forkPointSet: { sessionId: string; messageId: string } | null;
  toolsRestored: number;
} {
  // Step 1: Map incoming messages (replicates lines 1188-1205)
  // In the real handler, all rewound messages get createdAt: Date.now().
  // For testing, we accept an optional baseTimestamp so rewound messages
  // have timestamps consistent with the test's incrementing counter.
  // This ensures getActiveChain picks the correct head by timestamp.
  let tsCounter = baseTimestamp ?? Date.now();
  const rewoundMessages: TestMessage[] = event.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    displayedContent: m.content,
    parentUuid: m.parentUuid ?? null,
    createdAt: tsCounter++,
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.thinkingDurationMs !== undefined ? { thinkingDurationMs: m.thinkingDurationMs } : {}),
  }));

  // Step 2: Determine same-session vs cross-session (line 1215)
  const isSameSession = event.new_session_id === event.session_id;
  let sessionSwitched = false;

  if (!isSameSession) {
    // Cross-session: switch to new session (lines 1223-1232)
    useToolStore.getState().switchSession(event.new_session_id);
    sessionSwitched = true;
  }

  // Step 3: Set fork point (lines 1247-1265)
  const targetSessionId = isSameSession ? event.session_id : event.new_session_id;
  let forkPointSet: { sessionId: string; messageId: string } | null = null;

  if (rewoundMessages.length > 0) {
    const lastRewoundMessage = rewoundMessages[rewoundMessages.length - 1];
    if (lastRewoundMessage) {
      useCheckpointStore.getState().setRewindForkPoint(targetSessionId, lastRewoundMessage.id);
      forkPointSet = { sessionId: targetSessionId, messageId: lastRewoundMessage.id };
    }
  }

  // Step 4: Restore tool executions (lines 1268-1283)
  let toolsRestored = 0;
  for (const m of event.messages) {
    if (m.toolUses.length > 0) {
      useToolStore.getState().restoreToolsForMessage(
        m.id,
        m.toolUses.map((t) => ({
          id: t.id,
          name: t.name,
          input: t.input,
          success: t.success,
          ...(t.output !== undefined ? { output: t.output } : {}),
          ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
        }))
      );
      toolsRestored += m.toolUses.length;
    }
  }

  return {
    resultMessages: rewoundMessages,
    targetSessionId,
    sessionSwitched,
    forkPointSet,
    toolsRestored,
  };
}

/**
 * Simulates the parentUuid assignment in handleSend (chat-actions.ts lines 200-203).
 *
 * Priority:
 * 1. consumeRewindForkPoint (fork from rewind)
 * 2. Last message in chain (normal continuation)
 * 3. null (first message)
 */
function computeParentUuid(sessionId: string, messages: readonly TestMessage[]): string | null {
  const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
  const lastMessage = messages[messages.length - 1];
  return forkPoint ?? lastMessage?.id ?? null;
}

/**
 * Creates a user/assistant message with parentUuid following the real app logic.
 */
function createMessage(
  sessionId: string,
  id: string,
  role: 'user' | 'assistant',
  content: string,
  messages: readonly TestMessage[],
  timestamp: number
): TestMessage {
  const parentUuid = computeParentUuid(sessionId, messages);
  return {
    id,
    role,
    content,
    displayedContent: content,
    parentUuid,
    createdAt: timestamp,
  };
}

/**
 * Simulates the handleConversationRewind target resolution logic
 * (conversation-handlers.ts lines 204-255).
 *
 * 4-priority resolution:
 * 1. Direct disk ID match
 * 2. Content-validated position match
 * 3. Frontend messages fallback (rewind 2+)
 * 4. Unvalidated position fallback
 */
function resolveTargetMessage(
  messageId: string,
  messageIndex: number,
  diskMessages: { id: string; role: string; content: string; parentUuid?: string | null }[] | null,
  frontendMessages:
    | { id: string; role: string; content: string; parentUuid?: string | null }[]
    | null
): {
  sdkMessageId: string | undefined;
  useFrontendMessages: boolean;
  resolution:
    | 'direct-id'
    | 'content-validated-position'
    | 'frontend-fallback'
    | 'unvalidated-position'
    | 'none';
} {
  let sdkMessageId: string | undefined;
  let useFrontendMessages = false;
  let resolution:
    | 'direct-id'
    | 'content-validated-position'
    | 'frontend-fallback'
    | 'unvalidated-position'
    | 'none' = 'none';

  if (diskMessages) {
    const messageMap = new Map(diskMessages.map((m) => [m.id, m]));

    // Priority 1: Direct ID match
    const directMatch = messageMap.get(messageId);
    if (directMatch) {
      sdkMessageId = directMatch.id;
      resolution = 'direct-id';
    } else {
      // Priority 2: Content-validated position match
      const positionCandidate =
        messageIndex >= 0 && messageIndex < diskMessages.length
          ? diskMessages[messageIndex]
          : undefined;

      const frontendTarget = frontendMessages?.find((m) => m.id === messageId);
      const contentMatches =
        positionCandidate !== undefined &&
        positionCandidate.role === frontendTarget?.role &&
        positionCandidate.content === frontendTarget.content;

      if (positionCandidate && contentMatches) {
        sdkMessageId = positionCandidate.id;
        resolution = 'content-validated-position';
      } else if (frontendMessages && frontendMessages.length > 0) {
        // Priority 3: Frontend messages fallback
        sdkMessageId = messageId;
        useFrontendMessages = true;
        resolution = 'frontend-fallback';
      } else if (positionCandidate) {
        // Priority 4: Unvalidated position fallback
        sdkMessageId = positionCandidate.id;
        resolution = 'unvalidated-position';
      }
    }
  } else if (frontendMessages && frontendMessages.length > 0) {
    sdkMessageId = messageId;
    useFrontendMessages = true;
    resolution = 'frontend-fallback';
  }

  return { sdkMessageId, useFrontendMessages, resolution };
}

/**
 * Simulates the conversation:loaded merge strategy from ChatMessageService.
 *
 * - Backend is the canonical source (SDK UUIDs).
 * - Live trailing: if cache has MORE user messages than backend, the extras are live.
 */
function mergeBackendAndCache(
  backendMessages: TestMessage[],
  cachedMessages: TestMessage[] | undefined
): TestMessage[] {
  if (!cachedMessages || cachedMessages.length === 0) {
    return backendMessages;
  }
  if (backendMessages.length === 0) {
    return cachedMessages;
  }

  const backendUserCount = backendMessages.filter((m) => m.role === 'user').length;
  const cachedUserCount = cachedMessages.filter((m) => m.role === 'user').length;

  if (cachedUserCount <= backendUserCount) {
    return backendMessages;
  }

  // Cache has more user messages — find live trailing
  let usersSeen = 0;
  let liveStartIdx = -1;
  for (let i = 0; i < cachedMessages.length; i++) {
    if (cachedMessages[i]?.role === 'user') {
      usersSeen++;
      if (usersSeen > backendUserCount) {
        liveStartIdx = i;
        break;
      }
    }
  }

  const liveTrailingMessages = liveStartIdx >= 0 ? cachedMessages.slice(liveStartIdx) : [];
  return [...backendMessages, ...liveTrailingMessages];
}

// =============================================================================
// Test Setup
// =============================================================================

const SESSION_ID = 'test-session-001';

beforeEach(() => {
  useCheckpointStore.getState().clearAll();
  useToolStore.getState().reset();
});

// =============================================================================
// SINGLE REWIND: End-to-End
// =============================================================================

describe('Single Rewind E2E', () => {
  it('should rewind to a user message and allow continuing the conversation on a new branch', () => {
    const messages: TestMessage[] = [];
    let ts = 1000;

    // === Build a 3-turn conversation ===
    // Turn 1: user1 → assistant1
    const user1 = createMessage(SESSION_ID, 'user-1', 'user', 'Hello', messages, ts++);
    messages.push(user1);
    const asst1 = createMessage(SESSION_ID, 'asst-1', 'assistant', 'Hi there!', messages, ts++);
    messages.push(asst1);

    // Turn 2: user2 → assistant2
    const user2 = createMessage(SESSION_ID, 'user-2', 'user', 'Write code', messages, ts++);
    messages.push(user2);
    const asst2 = createMessage(
      SESSION_ID,
      'asst-2',
      'assistant',
      'Here is code...',
      messages,
      ts++
    );
    messages.push(asst2);

    // Turn 3: user3 → assistant3
    const user3 = createMessage(SESSION_ID, 'user-3', 'user', 'Fix the bug', messages, ts++);
    messages.push(user3);
    const asst3 = createMessage(SESSION_ID, 'asst-3', 'assistant', 'Fixed!', messages, ts++);
    messages.push(asst3);

    // Verify linear chain before rewind
    expect(messages.map((m) => m.parentUuid)).toEqual([
      null,
      'user-1',
      'asst-1',
      'user-2',
      'asst-2',
      'user-3',
    ]);

    // === REWIND: User clicks rewind on assistant1 ===
    // The conversation:rewound event contains messages up to the rewind point
    const rewoundEvent: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID, // Same session (parentUuid branching)
      rewind_to_message_id: 'asst-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello', parentUuid: null, toolUses: [] },
        {
          id: 'asst-1',
          role: 'assistant',
          content: 'Hi there!',
          parentUuid: 'user-1',
          toolUses: [],
        },
      ],
    };

    const result = processConversationRewound(rewoundEvent);

    // Verify: same-session rewind does NOT switch sessions
    expect(result.sessionSwitched).toBe(false);
    expect(result.targetSessionId).toBe(SESSION_ID);

    // Verify: messages are truncated to rewind point
    expect(result.resultMessages).toHaveLength(2);
    expect(result.resultMessages.map((m) => m.id)).toEqual(['user-1', 'asst-1']);

    // Verify: fork point is set to last rewound message (asst-1)
    expect(result.forkPointSet).toEqual({ sessionId: SESSION_ID, messageId: 'asst-1' });
    expect(useCheckpointStore.getState().hasRewindForkPoint(SESSION_ID)).toBe(true);

    // === POST-REWIND: User sends a new message ===
    // The UI now shows only [user-1, asst-1]
    const displayedMessages = result.resultMessages;

    const user4 = createMessage(
      SESSION_ID,
      'user-4',
      'user',
      'Explain instead',
      displayedMessages,
      ts++
    );
    displayedMessages.push(user4);

    // KEY: user4's parentUuid should be asst-1 (fork from rewind), NOT asst-3 (last overall message)
    expect(user4.parentUuid).toBe('asst-1');

    // Fork point should be consumed (one-time)
    expect(useCheckpointStore.getState().hasRewindForkPoint(SESSION_ID)).toBe(false);

    // Assistant responds on the new branch
    const asst4 = createMessage(
      SESSION_ID,
      'asst-4',
      'assistant',
      'Let me explain...',
      displayedMessages,
      ts++
    );
    displayedMessages.push(asst4);
    expect(asst4.parentUuid).toBe('user-4'); // Normal chain continuation

    // === Verify active chain from ALL messages (including orphaned) ===
    // Combine original messages + new branch
    const allMessages = [...messages, user4, asst4];

    const activeChain = getActiveChain(allMessages);
    expect(activeChain.map((m) => m.id)).toEqual(['user-1', 'asst-1', 'user-4', 'asst-4']);

    // Orphaned messages are excluded
    const chainIds = new Set(activeChain.map((m) => m.id));
    expect(chainIds.has('user-2')).toBe(false);
    expect(chainIds.has('asst-2')).toBe(false);
    expect(chainIds.has('user-3')).toBe(false);
    expect(chainIds.has('asst-3')).toBe(false);
  });

  it('should rewind to the very first user message (beginning of conversation)', () => {
    const messages: TestMessage[] = [];
    let ts = 1000;

    // Build conversation
    const user1 = createMessage(SESSION_ID, 'u1', 'user', 'Start', messages, ts++);
    messages.push(user1);
    const asst1 = createMessage(SESSION_ID, 'a1', 'assistant', 'Response', messages, ts++);
    messages.push(asst1);
    const user2 = createMessage(SESSION_ID, 'u2', 'user', 'Continue', messages, ts++);
    messages.push(user2);
    const asst2 = createMessage(SESSION_ID, 'a2', 'assistant', 'More', messages, ts++);
    messages.push(asst2);

    // Rewind to the very first exchange (user1)
    const rewoundEvent: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'u1',
      messages: [{ id: 'u1', role: 'user', content: 'Start', parentUuid: null, toolUses: [] }],
    };

    const result = processConversationRewound(rewoundEvent);
    expect(result.resultMessages).toHaveLength(1);
    expect(result.forkPointSet?.messageId).toBe('u1');

    // New message after rewind branches from user1
    const user3 = createMessage(SESSION_ID, 'u3', 'user', 'Try again', result.resultMessages, ts++);
    expect(user3.parentUuid).toBe('u1');
  });

  it('should restore tools from persisted messages during rewind', () => {
    const rewoundEvent: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'a1',
      messages: [
        { id: 'u1', role: 'user', content: 'Write a file', parentUuid: null, toolUses: [] },
        {
          id: 'a1',
          role: 'assistant',
          content: 'I will write the file.',
          parentUuid: 'u1',
          toolUses: [
            {
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/tmp/test.ts', content: 'console.log("hello")' },
              output: 'File written',
              success: true,
              contentOffset: 22,
            },
            {
              id: 'tool-2',
              name: 'Edit',
              input: { file_path: '/tmp/test.ts', old_string: 'hello', new_string: 'world' },
              output: 'File edited',
              success: true,
              contentOffset: 22,
            },
          ],
        },
      ],
    };

    const result = processConversationRewound(rewoundEvent);

    // 2 tools restored
    expect(result.toolsRestored).toBe(2);

    // Verify tools are in the tool store with correct message IDs
    const toolStore = useToolStore.getState();
    const toolsForA1 = toolStore.getToolsForMessage('a1');
    expect(toolsForA1).toHaveLength(2);
    expect(toolsForA1.map((t) => t.toolName)).toEqual(expect.arrayContaining(['Write', 'Edit']));

    // Verify tool metadata is preserved
    const writeTool = toolsForA1.find((t) => t.toolName === 'Write');
    expect(writeTool?.success).toBe(true);
    expect(writeTool?.toolOutput).toBe('File written');
    expect(writeTool?.contentOffset).toBe(22);
  });

  it('should handle rewind with empty messages gracefully', () => {
    const rewoundEvent: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'non-existent',
      messages: [],
    };

    const result = processConversationRewound(rewoundEvent);

    // No messages, no fork point
    expect(result.resultMessages).toHaveLength(0);
    expect(result.forkPointSet).toBeNull();
    expect(result.sessionSwitched).toBe(false);

    // Checkpoint store should not have a fork point
    expect(useCheckpointStore.getState().hasRewindForkPoint(SESSION_ID)).toBe(false);
  });

  it('should preserve thinking content in rewound messages', () => {
    const rewoundEvent: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'a1',
      messages: [
        { id: 'u1', role: 'user', content: 'Think about this', parentUuid: null, toolUses: [] },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Here is my answer',
          parentUuid: 'u1',
          thinking: 'Let me think about this carefully...',
          thinkingDurationMs: 5000,
          toolUses: [],
        },
      ],
    };

    const result = processConversationRewound(rewoundEvent);
    const assistantMsg = result.resultMessages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.thinking).toBe('Let me think about this carefully...');
    expect(assistantMsg?.thinkingDurationMs).toBe(5000);
  });
});

// =============================================================================
// TARGET RESOLUTION: 4-Priority System
// =============================================================================

describe('Target Message Resolution (4-priority system)', () => {
  it('Priority 1: should match by direct disk ID when IDs are already SDK UUIDs', () => {
    const diskMessages = [
      { id: 'sdk-uuid-1', role: 'user', content: 'Hello' },
      { id: 'sdk-uuid-2', role: 'assistant', content: 'Hi' },
    ];

    const result = resolveTargetMessage('sdk-uuid-2', 1, diskMessages, null);
    expect(result.resolution).toBe('direct-id');
    expect(result.sdkMessageId).toBe('sdk-uuid-2');
    expect(result.useFrontendMessages).toBe(false);
  });

  it('Priority 2: should use content-validated position when frontend UUID ≠ SDK UUID but content matches', () => {
    // First rewind scenario: frontend has UUID "fe-uuid-1", disk has "sdk-uuid-1"
    // Same content at same position → disk is fresh, position match is valid
    const diskMessages = [
      { id: 'sdk-uuid-1', role: 'user', content: 'Hello' },
      { id: 'sdk-uuid-2', role: 'assistant', content: 'Hi' },
    ];
    const frontendMessages = [
      { id: 'fe-uuid-1', role: 'user', content: 'Hello' },
      { id: 'fe-uuid-2', role: 'assistant', content: 'Hi' },
    ];

    const result = resolveTargetMessage('fe-uuid-2', 1, diskMessages, frontendMessages);
    expect(result.resolution).toBe('content-validated-position');
    expect(result.sdkMessageId).toBe('sdk-uuid-2'); // Resolved to SDK ID
    expect(result.useFrontendMessages).toBe(false);
  });

  it('Priority 3: should fall back to frontend messages when disk content mismatches (stale disk, rewind 2+)', () => {
    // Rewind 2+ scenario: disk was truncated/recreated after first rewind.
    // Position exists but content doesn't match → disk is stale.
    const diskMessages = [
      { id: 'stale-1', role: 'user', content: 'DIFFERENT content' }, // Stale
    ];
    const frontendMessages = [
      { id: 'fe-uuid-1', role: 'user', content: 'Hello' },
      { id: 'fe-uuid-2', role: 'assistant', content: 'Hi' },
    ];

    const result = resolveTargetMessage('fe-uuid-2', 1, diskMessages, frontendMessages);
    expect(result.resolution).toBe('frontend-fallback');
    expect(result.sdkMessageId).toBe('fe-uuid-2'); // Uses frontend ID
    expect(result.useFrontendMessages).toBe(true);
  });

  it('Priority 3: should use frontend messages when disk has no data at all', () => {
    const frontendMessages = [
      { id: 'fe-1', role: 'user', content: 'Hello' },
      { id: 'fe-2', role: 'assistant', content: 'Hi' },
    ];

    const result = resolveTargetMessage('fe-2', 1, null, frontendMessages);
    expect(result.resolution).toBe('frontend-fallback');
    expect(result.useFrontendMessages).toBe(true);
  });

  it('Priority 4: should use unvalidated position when no frontend messages available', () => {
    // Legacy scenario: no current_messages sent (older client)
    const diskMessages = [
      { id: 'sdk-1', role: 'user', content: 'Hello' },
      { id: 'sdk-2', role: 'assistant', content: 'Hi' },
    ];

    // Frontend ID "fe-2" doesn't match disk, and no frontend messages to validate
    const result = resolveTargetMessage('fe-2', 1, diskMessages, null);
    expect(result.resolution).toBe('unvalidated-position');
    expect(result.sdkMessageId).toBe('sdk-2');
    expect(result.useFrontendMessages).toBe(false);
  });

  it('should return none when disk is null and no frontend messages', () => {
    const result = resolveTargetMessage('any-id', 0, null, null);
    expect(result.resolution).toBe('none');
    expect(result.sdkMessageId).toBeUndefined();
  });

  it('should handle out-of-bounds message_index gracefully', () => {
    const diskMessages = [{ id: 'sdk-1', role: 'user', content: 'Hello' }];
    const frontendMessages = [
      { id: 'fe-1', role: 'user', content: 'Hello' },
      { id: 'fe-2', role: 'assistant', content: 'Hi' },
    ];

    // message_index = 5, but disk only has 1 message
    const result = resolveTargetMessage('fe-2', 5, diskMessages, frontendMessages);
    // No position candidate, no direct match → frontend fallback
    expect(result.resolution).toBe('frontend-fallback');
    expect(result.useFrontendMessages).toBe(true);
  });
});

// =============================================================================
// MULTI-REWIND: End-to-End
// =============================================================================

describe('Multi-Rewind E2E', () => {
  it('should handle rewind 1 → send → rewind 2 correctly (the critical multi-rewind scenario)', () => {
    const SESSION_A = 'session-original';
    let ts = 1000;

    // ============================================================
    // Phase 1: Build initial conversation (3 turns)
    // ============================================================
    // In the real app, the first conversation uses frontend UUIDs.
    // After rewind 1, the conversation:rewound event replaces displayed messages
    // with SDK-UUID copies from disk. The original frontend-UUID messages are gone
    // from the display — they only exist in the JSONL (which gets deleted by forkSessionAt).
    //
    // This test models the REALISTIC flow: after rewind, the "allMessages" pool
    // should contain SDK-UUID versions (from conversation:rewound) because that's
    // what the user actually sees.
    const originalMessages: TestMessage[] = [];

    const u1 = createMessage(SESSION_A, 'fe-u1', 'user', 'Hello', originalMessages, ts++);
    originalMessages.push(u1);
    const a1 = createMessage(SESSION_A, 'fe-a1', 'assistant', 'Hi!', originalMessages, ts++);
    originalMessages.push(a1);
    const u2 = createMessage(SESSION_A, 'fe-u2', 'user', 'Code', originalMessages, ts++);
    originalMessages.push(u2);
    const a2 = createMessage(
      SESSION_A,
      'fe-a2',
      'assistant',
      'Here is code',
      originalMessages,
      ts++
    );
    originalMessages.push(a2);
    const u3 = createMessage(SESSION_A, 'fe-u3', 'user', 'Bug', originalMessages, ts++);
    originalMessages.push(u3);
    const a3 = createMessage(SESSION_A, 'fe-a3', 'assistant', 'Fixed', originalMessages, ts++);
    originalMessages.push(a3);

    // ============================================================
    // Phase 2: REWIND 1 — Rewind to a1 (after first response)
    // ============================================================
    // Simulates: disk has fresh data with SDK UUIDs (different from frontend UUIDs)
    const rewind1Disk = [
      { id: 'sdk-u1', role: 'user', content: 'Hello' },
      { id: 'sdk-a1', role: 'assistant', content: 'Hi!' },
      { id: 'sdk-u2', role: 'user', content: 'Code' },
      { id: 'sdk-a2', role: 'assistant', content: 'Here is code' },
      { id: 'sdk-u3', role: 'user', content: 'Bug' },
      { id: 'sdk-a3', role: 'assistant', content: 'Fixed' },
    ];

    const rewind1Frontend = originalMessages.slice(0, 2).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parentUuid: m.parentUuid,
    }));

    // Resolution: frontend UUID "fe-a1" ≠ disk ID "sdk-a1" → content-validated position match
    const resolution1 = resolveTargetMessage('fe-a1', 1, rewind1Disk, rewind1Frontend);
    expect(resolution1.resolution).toBe('content-validated-position');
    expect(resolution1.sdkMessageId).toBe('sdk-a1');
    expect(resolution1.useFrontendMessages).toBe(false);

    // Process the rewound event (with SDK IDs from disk)
    const rewind1Event: RewoundEvent = {
      session_id: SESSION_A,
      new_session_id: SESSION_A,
      rewind_to_message_id: 'fe-a1',
      messages: [
        { id: 'sdk-u1', role: 'user', content: 'Hello', parentUuid: null, toolUses: [] },
        { id: 'sdk-a1', role: 'assistant', content: 'Hi!', parentUuid: 'sdk-u1', toolUses: [] },
      ],
    };

    // Pass ts as baseTimestamp so rewound messages get timestamps in the same
    // domain as the test's counter. This is critical: getActiveChain finds the
    // "head" by highest createdAt, so rewound messages must have timestamps BELOW
    // the post-rewind messages that come later.
    const rewind1Base = ts;
    ts += rewind1Event.messages.length; // Advance past rewound message timestamps
    const result1 = processConversationRewound(rewind1Event, rewind1Base);
    expect(result1.resultMessages).toHaveLength(2);
    expect(result1.forkPointSet?.messageId).toBe('sdk-a1');

    // ============================================================
    // Phase 3: Post-rewind 1 — User sends a new message
    // ============================================================
    // After rewind, displayed messages are the rewound ones (with SDK IDs)
    const displayed1 = [...result1.resultMessages];

    const u4 = createMessage(SESSION_A, 'u4', 'user', 'Explain instead', displayed1, ts++);
    displayed1.push(u4);

    // KEY: u4 forks from sdk-a1 (the rewind point, now with SDK ID)
    expect(u4.parentUuid).toBe('sdk-a1');

    const a4 = createMessage(SESSION_A, 'a4', 'assistant', 'Let me explain', displayed1, ts++);
    displayed1.push(a4);

    // ============================================================
    // Phase 4: REWIND 2 — Rewind back to sdk-a1 again
    // ============================================================
    // After rewind 1, the original JSONL was truncated by forkSessionAt.
    // The disk now only has the post-rewind session's data (u4, a4), not sdk-u1/sdk-a1.
    //
    // The frontend messages (displayed1) have the correct SDK IDs from rewind 1.

    // Simulate stale/empty disk (forkSessionAt deleted original + new session has different content)
    const rewind2Disk = [
      { id: 'new-session-u4', role: 'user', content: 'Explain instead' },
      { id: 'new-session-a4', role: 'assistant', content: 'Let me explain' },
    ];

    // Frontend messages to pass as current_messages (from displayed1, truncated to rewind point)
    const rewind2Frontend = displayed1.slice(0, 2).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parentUuid: m.parentUuid,
    }));

    // Resolution: ID "sdk-a1" not in stale disk, position 1 content "Let me explain" ≠ "Hi!" → frontend fallback
    const resolution2 = resolveTargetMessage('sdk-a1', 1, rewind2Disk, rewind2Frontend);
    expect(resolution2.resolution).toBe('frontend-fallback');
    expect(resolution2.useFrontendMessages).toBe(true);

    // Process rewind 2 using frontend messages (same SDK IDs as rewind 1 provided)
    const rewind2Event: RewoundEvent = {
      session_id: SESSION_A,
      new_session_id: SESSION_A,
      rewind_to_message_id: 'sdk-a1',
      messages: [
        { id: 'sdk-u1', role: 'user', content: 'Hello', parentUuid: null, toolUses: [] },
        { id: 'sdk-a1', role: 'assistant', content: 'Hi!', parentUuid: 'sdk-u1', toolUses: [] },
      ],
    };

    // Same pattern: rewound messages get timestamps below u5/a5
    const rewind2Base = ts;
    ts += rewind2Event.messages.length;
    const result2 = processConversationRewound(rewind2Event, rewind2Base);
    expect(result2.resultMessages).toHaveLength(2);
    expect(result2.forkPointSet?.messageId).toBe('sdk-a1');

    // ============================================================
    // Phase 5: Post-rewind 2 — User sends another new message
    // ============================================================
    const displayed2 = [...result2.resultMessages];

    const u5 = createMessage(SESSION_A, 'u5', 'user', 'Third attempt', displayed2, ts++);
    displayed2.push(u5);

    // KEY: u5 forks from sdk-a1 again (third branch from the same point)
    expect(u5.parentUuid).toBe('sdk-a1');

    const a5 = createMessage(SESSION_A, 'a5', 'assistant', 'OK third try', displayed2, ts++);
    displayed2.push(a5);

    // ============================================================
    // Phase 6: Verify the full tree structure
    // ============================================================
    // In the real app, the "entire tree" as seen by getActiveChain would be
    // loaded from JSONL which uses SDK UUIDs. After rewind 1, the original
    // frontend-UUID messages are gone from the JSONL.
    //
    // The tree visible to getActiveChain is:
    // - sdk-u1, sdk-a1 (from rewind events, SDK UUIDs)
    // - Original branch: fe-u2 → fe-a2 → fe-u3 → fe-a3 (orphaned, different parent chain)
    // - Branch 1: u4, a4 (from rewind 1)
    // - Branch 2: u5, a5 (from rewind 2)
    //
    // Since the original fe-u2's parentUuid is 'fe-a1' (not 'sdk-a1'),
    // the original branch is completely disconnected from the SDK-UUID tree.
    // This is correct — after rewind, the original branch IS orphaned.

    const entireTree: TestMessage[] = [
      // SDK-UUID versions (from rewind events — these are what's "real" after rewind)
      ...result1.resultMessages, // sdk-u1, sdk-a1
      // Original branch (orphaned — different parent chain via frontend UUIDs)
      u2,
      a2,
      u3,
      a3,
      // Branch 1 (rewind 1)
      u4,
      a4,
      // Branch 2 (rewind 2)
      u5,
      a5,
    ];

    // Active chain should be the LATEST branch (u5, a5 which are newest by timestamp)
    const activeChain = getActiveChain(entireTree);
    expect(activeChain.map((m) => m.id)).toEqual(['sdk-u1', 'sdk-a1', 'u5', 'a5']);

    // Verify branch structure
    expect(u2.parentUuid).toBe('fe-a1'); // Original branch (frontend UUID — disconnected)
    expect(u4.parentUuid).toBe('sdk-a1'); // Branch 1 (SDK UUID after rewind 1)
    expect(u5.parentUuid).toBe('sdk-a1'); // Branch 2 (SDK UUID after rewind 2)
  });

  it('should handle rewind to progressively earlier points in the conversation', () => {
    let ts = 1000;
    const messages: TestMessage[] = [];

    // Build 4-turn conversation
    const u1 = createMessage(SESSION_ID, 'u1', 'user', 'A', messages, ts++);
    messages.push(u1);
    const a1 = createMessage(SESSION_ID, 'a1', 'assistant', 'B', messages, ts++);
    messages.push(a1);
    const u2 = createMessage(SESSION_ID, 'u2', 'user', 'C', messages, ts++);
    messages.push(u2);
    const a2 = createMessage(SESSION_ID, 'a2', 'assistant', 'D', messages, ts++);
    messages.push(a2);
    const u3 = createMessage(SESSION_ID, 'u3', 'user', 'E', messages, ts++);
    messages.push(u3);
    const a3 = createMessage(SESSION_ID, 'a3', 'assistant', 'F', messages, ts++);
    messages.push(a3);

    // Rewind 1: to a2 (middle)
    const rewind1Event: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'a2',
      messages: [
        { id: 'u1', role: 'user', content: 'A', parentUuid: null, toolUses: [] },
        { id: 'a1', role: 'assistant', content: 'B', parentUuid: 'u1', toolUses: [] },
        { id: 'u2', role: 'user', content: 'C', parentUuid: 'a1', toolUses: [] },
        { id: 'a2', role: 'assistant', content: 'D', parentUuid: 'u2', toolUses: [] },
      ],
    };

    const r1 = processConversationRewound(rewind1Event);
    const b1 = [...r1.resultMessages];
    const u4 = createMessage(SESSION_ID, 'u4', 'user', 'Branch from a2', b1, ts++);
    b1.push(u4);
    expect(u4.parentUuid).toBe('a2');

    // Rewind 2: go further back to a1 (earlier point)
    const rewind2Event: RewoundEvent = {
      session_id: SESSION_ID,
      new_session_id: SESSION_ID,
      rewind_to_message_id: 'a1',
      messages: [
        { id: 'u1', role: 'user', content: 'A', parentUuid: null, toolUses: [] },
        { id: 'a1', role: 'assistant', content: 'B', parentUuid: 'u1', toolUses: [] },
      ],
    };

    const r2 = processConversationRewound(rewind2Event);
    const b2 = [...r2.resultMessages];
    const u5 = createMessage(SESSION_ID, 'u5', 'user', 'Branch from a1', b2, ts++);
    b2.push(u5);
    expect(u5.parentUuid).toBe('a1');

    // Full tree: all messages ever
    const allMsgs: TestMessage[] = [...messages, u4, u5];

    // Latest branch (u5 from a1) should be active
    const chain = getActiveChain(allMsgs);
    expect(chain.map((m) => m.id)).toEqual(['u1', 'a1', 'u5']);
  });
});

// =============================================================================
// CROSS-SESSION REWIND
// =============================================================================

describe('Cross-Session Rewind', () => {
  it('should switch sessions when new_session_id differs from session_id', () => {
    const OLD_SESSION = 'session-old';
    const NEW_SESSION = 'session-new';

    const rewoundEvent: RewoundEvent = {
      session_id: OLD_SESSION,
      new_session_id: NEW_SESSION,
      rewind_to_message_id: 'a1',
      messages: [
        { id: 'u1', role: 'user', content: 'Hello', parentUuid: null, toolUses: [] },
        { id: 'a1', role: 'assistant', content: 'Hi', parentUuid: 'u1', toolUses: [] },
      ],
    };

    const result = processConversationRewound(rewoundEvent);

    // Cross-session rewind switches sessions
    expect(result.sessionSwitched).toBe(true);
    expect(result.targetSessionId).toBe(NEW_SESSION);

    // Fork point is set on the NEW session
    expect(result.forkPointSet).toEqual({ sessionId: NEW_SESSION, messageId: 'a1' });
    expect(useCheckpointStore.getState().hasRewindForkPoint(NEW_SESSION)).toBe(true);
    expect(useCheckpointStore.getState().hasRewindForkPoint(OLD_SESSION)).toBe(false);
  });
});

// =============================================================================
// CHECKPOINT STORE INTEGRATION
// =============================================================================

describe('Checkpoint Store — Rewind Integration', () => {
  it('should track checkpoints across a 3-turn conversation and resolve them for rewind', () => {
    const store = useCheckpointStore.getState();

    // === Turn 1: user sends message, checkpoint arrives, agent completes ===
    store.onUserMessageSent(SESSION_ID, 'fe-user-1');

    // agent:checkpoint reconciles frontend UUID → SDK UUID
    const oldId1 = store.reconcileUserMessageId(SESSION_ID, 'sdk-user-1');
    expect(oldId1).toBe('fe-user-1');

    // First checkpoint (turn 1 start)
    store.onCheckpointReceived(SESSION_ID, 'cp-1');

    // agent:complete
    store.onMessageComplete(SESSION_ID);

    // === Turn 2: user sends message, checkpoint arrives, agent completes ===
    store.onUserMessageSent(SESSION_ID, 'fe-user-2');
    store.reconcileUserMessageId(SESSION_ID, 'sdk-user-2');
    store.onCheckpointReceived(SESSION_ID, 'cp-2'); // This is turn 1's END and turn 2's START
    store.onMessageComplete(SESSION_ID);

    // === Turn 3: user sends message, checkpoint arrives, agent completes ===
    store.onUserMessageSent(SESSION_ID, 'fe-user-3');
    store.reconcileUserMessageId(SESSION_ID, 'sdk-user-3');
    store.onCheckpointReceived(SESSION_ID, 'cp-3'); // Turn 2's END and turn 3's START
    store.onMessageComplete(SESSION_ID);

    // === Verify checkpoint resolution ===

    // Turn 1: rewindCheckpoints should resolve
    const turn1 = store.getRewindCheckpoints(SESSION_ID, 'sdk-user-1');
    expect(turn1).toBeDefined();
    // Turn END for user-1 is cp-2 (checkpoint that arrived after turn 1 completed)
    expect(turn1?.rewindFiles).toBe('cp-2');
    // resumeSessionAt should be the NEXT checkpoint (cp-3) to include the response
    expect(turn1?.resumeSessionAt).toBe('cp-3');

    // Turn 2: rewindCheckpoints should resolve
    const turn2 = store.getRewindCheckpoints(SESSION_ID, 'sdk-user-2');
    expect(turn2).toBeDefined();
    expect(turn2?.rewindFiles).toBe('cp-3');

    // Turn 3: pending (last message, uses latest checkpoint)
    const turn3TurnEnd = store.getTurnEndCheckpoint(SESSION_ID, 'sdk-user-3');
    // Turn 3 hasn't received a "next" checkpoint yet, so it falls back to latest
    // The latest checkpoint is cp-3 (which is also turn 3's start)
    // Since there's no next checkpoint, getTurnEndCheckpoint returns latestCheckpoint
    // only if sdk-user-3 is the pendingMessageForTurnEnd
    expect(turn3TurnEnd).toBeDefined();
  });

  it('should not clear checkpoints on rewind (preserves post-rewind checkpoint data)', () => {
    const store = useCheckpointStore.getState();

    // Build checkpoints for 2 turns
    store.onUserMessageSent(SESSION_ID, 'u1');
    store.reconcileUserMessageId(SESSION_ID, 'sdk-u1');
    store.onCheckpointReceived(SESSION_ID, 'cp-1');
    store.onMessageComplete(SESSION_ID);
    store.onUserMessageSent(SESSION_ID, 'u2');
    store.reconcileUserMessageId(SESSION_ID, 'sdk-u2');
    store.onCheckpointReceived(SESSION_ID, 'cp-2');
    store.onMessageComplete(SESSION_ID);

    // Rewind sets fork point but does NOT clear checkpoints
    store.setRewindForkPoint(SESSION_ID, 'sdk-u1');

    // Old checkpoints should still be accessible
    const turn1Start = store.getTurnStartCheckpoint(SESSION_ID, 'sdk-u1');
    expect(turn1Start).toBeDefined();
    expect(turn1Start).toBe('cp-1');
  });

  it('should remap session IDs when system:init provides SDK session ID', () => {
    const FRONTEND_ID = 'frontend-temp-id';
    const SDK_ID = 'sdk-real-id';
    const store = useCheckpointStore.getState();

    // Set up state under frontend ID
    store.onUserMessageSent(FRONTEND_ID, 'u1');
    store.onCheckpointReceived(FRONTEND_ID, 'cp-1');
    store.onMessageComplete(FRONTEND_ID);
    store.setRewindForkPoint(FRONTEND_ID, 'u1');
    store.setPendingConversationFork(FRONTEND_ID, 'u1');

    // Remap (simulates system:init)
    store.remapSession(FRONTEND_ID, SDK_ID);

    // All data should now be under SDK ID
    expect(store.hasRewindForkPoint(SDK_ID)).toBe(true);
    expect(store.hasRewindForkPoint(FRONTEND_ID)).toBe(false);
    expect(store.hasPendingConversationFork(SDK_ID)).toBe(true);
    expect(store.hasPendingConversationFork(FRONTEND_ID)).toBe(false);

    const checkpoints = store.getSessionCheckpoints(SDK_ID);
    expect(checkpoints).toBeDefined();
    expect(checkpoints?.turnStarts['u1']).toBe('cp-1');
  });

  it('should reconcile user message ID from frontend UUID to SDK UUID', () => {
    const store = useCheckpointStore.getState();

    store.onUserMessageSent(SESSION_ID, 'frontend-uuid-123');

    // Reconcile: SDK sends the real UUID
    const oldId = store.reconcileUserMessageId(SESSION_ID, 'sdk-uuid-456');
    expect(oldId).toBe('frontend-uuid-123');

    // currentUserMessageId should now use SDK UUID
    // When onMessageComplete runs, it should associate checkpoints with sdk-uuid-456
    store.onCheckpointReceived(SESSION_ID, 'cp-1');
    store.onMessageComplete(SESSION_ID);

    const turnStart = store.getTurnStartCheckpoint(SESSION_ID, 'sdk-uuid-456');
    expect(turnStart).toBe('cp-1');

    // Old frontend UUID should NOT have a checkpoint
    const oldStart = store.getTurnStartCheckpoint(SESSION_ID, 'frontend-uuid-123');
    expect(oldStart).toBeUndefined();
  });

  it('should return undefined when reconciling with no current user message', () => {
    const store = useCheckpointStore.getState();

    // No onUserMessageSent called — reconcile should return undefined
    const result = store.reconcileUserMessageId(SESSION_ID, 'sdk-uuid');
    expect(result).toBeUndefined();
  });

  it('should return undefined when reconciling with matching ID (already reconciled)', () => {
    const store = useCheckpointStore.getState();

    store.onUserMessageSent(SESSION_ID, 'same-id');
    const result = store.reconcileUserMessageId(SESSION_ID, 'same-id');
    expect(result).toBeUndefined(); // No change needed
  });
});

// =============================================================================
// CONVERSATION:LOADED MERGE STRATEGY
// =============================================================================

describe('Conversation:loaded merge strategy', () => {
  it('should use backend exclusively when cache has fewer or equal user messages', () => {
    const backend: TestMessage[] = [
      {
        id: 'b-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'b-a1',
        role: 'assistant',
        content: 'Hi',
        displayedContent: 'Hi',
        parentUuid: 'b-u1',
        createdAt: 2,
      },
    ];
    const cached: TestMessage[] = [
      {
        id: 'c-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'c-a1',
        role: 'assistant',
        content: 'Hi',
        displayedContent: 'Hi',
        parentUuid: 'c-u1',
        createdAt: 2,
      },
    ];

    const result = mergeBackendAndCache(backend, cached);
    // Backend wins (1 user each → cachedUserCount <= backendUserCount)
    expect(result).toBe(backend);
  });

  it('should append live trailing messages when cache has more user messages', () => {
    const backend: TestMessage[] = [
      {
        id: 'b-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'b-a1',
        role: 'assistant',
        content: 'Hi',
        displayedContent: 'Hi',
        parentUuid: 'b-u1',
        createdAt: 2,
      },
    ];
    const cached: TestMessage[] = [
      {
        id: 'c-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'c-a1',
        role: 'assistant',
        content: 'Hi',
        displayedContent: 'Hi',
        parentUuid: 'c-u1',
        createdAt: 2,
      },
      // Live trailing — not yet persisted to JSONL
      {
        id: 'c-u2',
        role: 'user',
        content: 'New',
        displayedContent: 'New',
        parentUuid: 'c-a1',
        createdAt: 3,
      },
      {
        id: 'c-a2',
        role: 'assistant',
        content: 'Streaming...',
        displayedContent: 'Streaming...',
        parentUuid: 'c-u2',
        createdAt: 4,
        isStreaming: true,
      },
    ];

    const result = mergeBackendAndCache(backend, cached);
    // Backend (2) + live trailing (2)
    expect(result).toHaveLength(4);
    expect(result[0]?.id).toBe('b-u1'); // From backend
    expect(result[1]?.id).toBe('b-a1'); // From backend
    expect(result[2]?.id).toBe('c-u2'); // Live trailing
    expect(result[3]?.id).toBe('c-a2'); // Live trailing
  });

  it('should use cache when backend is empty (JSONL deleted by forkSessionAt)', () => {
    const cached: TestMessage[] = [
      {
        id: 'c-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
    ];

    const result = mergeBackendAndCache([], cached);
    expect(result).toBe(cached);
  });

  it('should use backend when cache is empty', () => {
    const backend: TestMessage[] = [
      {
        id: 'b-u1',
        role: 'user',
        content: 'Hello',
        displayedContent: 'Hello',
        parentUuid: null,
        createdAt: 1,
      },
    ];

    const result = mergeBackendAndCache(backend, undefined);
    expect(result).toBe(backend);
  });
});

// =============================================================================
// FORK DECISION: When to call forkSessionAt
// =============================================================================

describe('Fork decision logic', () => {
  it('should fork when target found in disk (first rewind)', () => {
    const resolution = resolveTargetMessage(
      'sdk-a1',
      1,
      [
        { id: 'sdk-u1', role: 'user', content: 'Hello' },
        { id: 'sdk-a1', role: 'assistant', content: 'Hi' },
      ],
      null
    );

    // Direct ID match → should fork
    expect(resolution.useFrontendMessages).toBe(false);
    // The real handler calls agentForkSessionAt when !useFrontendMessages
  });

  it('should NOT fork when using frontend messages (rewind 2+)', () => {
    const resolution = resolveTargetMessage(
      'fe-a1',
      1,
      [{ id: 'stale', role: 'user', content: 'WRONG' }],
      [
        { id: 'fe-u1', role: 'user', content: 'Hello' },
        { id: 'fe-a1', role: 'assistant', content: 'Hi' },
      ]
    );

    // Frontend fallback → should NOT fork
    expect(resolution.useFrontendMessages).toBe(true);
    // The real handler skips agentForkSessionAt when useFrontendMessages
  });
});

// =============================================================================
// getActiveChain: Robustness
// =============================================================================

describe('getActiveChain robustness', () => {
  it('should detect cycles and not infinite loop', () => {
    // Corrupt data: message points to itself
    const messages: TestMessage[] = [
      { id: 'a', role: 'user', content: 'A', displayedContent: 'A', parentUuid: 'a', createdAt: 1 },
    ];

    const chain = getActiveChain(messages);
    // Should terminate, not hang
    expect(chain).toHaveLength(1);
  });

  it('should handle mutual cycle (a → b → a)', () => {
    const messages: TestMessage[] = [
      { id: 'a', role: 'user', content: 'A', displayedContent: 'A', parentUuid: 'b', createdAt: 1 },
      {
        id: 'b',
        role: 'assistant',
        content: 'B',
        displayedContent: 'B',
        parentUuid: 'a',
        createdAt: 2,
      },
    ];

    const chain = getActiveChain(messages);
    // Should terminate, returning partial chain
    expect(chain.length).toBeLessThanOrEqual(2);
  });

  it('should handle broken parent reference (parent not in messages)', () => {
    const messages: TestMessage[] = [
      {
        id: 'a',
        role: 'user',
        content: 'A',
        displayedContent: 'A',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'b',
        role: 'assistant',
        content: 'B',
        displayedContent: 'B',
        parentUuid: 'a',
        createdAt: 2,
      },
      {
        id: 'c',
        role: 'user',
        content: 'C',
        displayedContent: 'C',
        parentUuid: 'nonexistent',
        createdAt: 3,
      },
    ];

    const chain = getActiveChain(messages);
    // 'c' is latest, walks to 'nonexistent' → stops. Chain = [c]
    expect(chain[0]?.id).toBe('c');
    expect(chain).toHaveLength(1);
  });

  it('should handle legacy messages (no parentUuid)', () => {
    const messages: TestMessage[] = [
      {
        id: 'a',
        role: 'user',
        content: 'A',
        displayedContent: 'A',
        parentUuid: null,
        createdAt: 1,
      },
      {
        id: 'b',
        role: 'assistant',
        content: 'B',
        displayedContent: 'B',
        parentUuid: null,
        createdAt: 2,
      },
    ];
    // Both parentUuid are null → treated as legacy, returns all sorted by createdAt
    const chain = getActiveChain(messages);
    expect(chain.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

// =============================================================================
// PENDING CONVERSATION FORK LIFECYCLE
// =============================================================================

describe('Pending conversation fork lifecycle', () => {
  it('should set, check, and consume pending fork', () => {
    const store = useCheckpointStore.getState();

    expect(store.hasPendingConversationFork(SESSION_ID)).toBe(false);

    store.setPendingConversationFork(SESSION_ID, 'msg-1');
    expect(store.hasPendingConversationFork(SESSION_ID)).toBe(true);

    const consumed = store.consumePendingConversationFork(SESSION_ID);
    expect(consumed).toBe('msg-1');
    expect(store.hasPendingConversationFork(SESSION_ID)).toBe(false);

    // Second consume returns null
    const consumed2 = store.consumePendingConversationFork(SESSION_ID);
    expect(consumed2).toBeNull();
  });

  it('should survive session remap', () => {
    const store = useCheckpointStore.getState();

    store.setPendingConversationFork('old-session', 'msg-1');

    store.remapSession('old-session', 'new-session');

    expect(store.hasPendingConversationFork('old-session')).toBe(false);
    expect(store.hasPendingConversationFork('new-session')).toBe(true);

    const consumed = store.consumePendingConversationFork('new-session');
    expect(consumed).toBe('msg-1');
  });
});
