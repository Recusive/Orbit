/**
 * Message Utilities
 *
 * Helper functions for message rendering and memoization.
 */

import type { ChatMessage, MessageItemProps, Segment, ThinkingBlock } from './types';
import type { ToolExecution } from '@/stores/agent/tool-store';

// ============================================
// Active Chain Extraction (Claude Code-style)
// ============================================

/**
 * Message interface for chain extraction (minimal fields needed).
 * Works with both ChatMessage and persisted message DTOs.
 */
interface ChainableMessage {
  id: string;
  parentUuid?: string | null | undefined;
  createdAt?: number | undefined;
}

/**
 * Extract the active message chain from a list of all messages.
 *
 * Claude Code handles conversation forks (rewinds) by storing a parentUuid on each
 * message, forming a linked list. When there are forks, multiple messages can have
 * the same parent. To display only the ACTIVE branch:
 *
 * 1. Find the "head" (latest message by timestamp)
 * 2. Walk backwards via parentUuid until reaching null
 * 3. Reverse to get chronological order
 *
 * Messages not in this chain are orphaned (from abandoned branches) and excluded.
 *
 * @param allMessages - All messages from persistence (may contain multiple branches)
 * @returns Messages in the active chain, chronological order (oldest first)
 *
 * @example
 * // Conversation with a fork:
 * // msg1 (user) -> msg2 (assistant) -> msg3 (user) -> msg4 (assistant)
 * //                                 -> msg5 (user, after rewind) -> msg6 (assistant)
 * //
 * // If msg6 is the latest, active chain is: [msg1, msg2, msg5, msg6]
 * // msg3 and msg4 are orphaned (not in the active branch)
 */
export function getActiveChain<T extends ChainableMessage>(allMessages: T[]): T[] {
  if (allMessages.length === 0) return [];

  // Check if any message has parentUuid set (non-legacy conversation)
  // Legacy conversations have no parentUuid - just return all messages in order
  const hasParentUuids = allMessages.some(
    (m) => m.parentUuid !== undefined && m.parentUuid !== null
  );

  if (!hasParentUuids) {
    // Legacy conversation - no chain tracking, return all messages as-is
    // Sort by createdAt to ensure chronological order
    return [...allMessages].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }

  // Build lookup map for O(1) parent access
  const byId = new Map<string, T>(allMessages.map((m) => [m.id, m]));

  // Build set of IDs that are referenced as parentUuid (i.e., have children)
  // The true head is a leaf node — no other message points to it as parent
  const referencedAsParent = new Set<string>();
  for (const m of allMessages) {
    if (m.parentUuid !== undefined && m.parentUuid !== null) {
      referencedAsParent.add(m.parentUuid);
    }
  }

  // Find the head (latest message by timestamp)
  // Tiebreaker: when timestamps are equal, prefer the message that is NOT
  // referenced as a parent (true head is a leaf node with no children)
  const head = allMessages.reduce((latest, m) => {
    const latestTime = latest.createdAt ?? 0;
    const currentTime = m.createdAt ?? 0;
    if (currentTime > latestTime) return m;
    if (currentTime === latestTime) {
      const latestIsParent = referencedAsParent.has(latest.id);
      const currentIsParent = referencedAsParent.has(m.id);
      // Prefer the one that is NOT a parent (leaf node)
      if (latestIsParent && !currentIsParent) return m;
    }
    return latest;
  });

  // Walk backwards via parentUuid to build the chain
  const chain: T[] = [];
  let current: T | undefined = head;
  const visited = new Set<string>(); // Prevent infinite loops from corrupt data

  while (current !== undefined) {
    // Detect cycles
    if (visited.has(current.id)) {
      break;
    }
    visited.add(current.id);

    chain.unshift(current); // Add to front (building in reverse)

    // Move to parent
    if (current.parentUuid !== undefined && current.parentUuid !== null) {
      current = byId.get(current.parentUuid);
    } else {
      current = undefined; // Reached the root
    }
  }

  return chain;
}

type Marker =
  | { kind: 'thinking'; offset: number; block: ThinkingBlock; index: number; ordinal: number }
  | { kind: 'tool'; offset: number; tool: ToolExecution; ordinal: number };

/**
 * Build interleaved segments for assistant messages using a unified marker sweep.
 * Content is sliced at both tool offsets and thinking offsets so text-only multi-phase
 * messages still interleave correctly.
 */
export function buildUnifiedSegments(
  content: string,
  tools: ToolExecution[],
  thinkingBlocks: ThinkingBlock[] | undefined,
  isThinkingActive: boolean | undefined,
  isStreaming: boolean | undefined
): Segment[] {
  const markers: Marker[] = [];
  const thinkingArr = thinkingBlocks ?? [];
  const activeThinkingIndex =
    isStreaming === true && isThinkingActive === true ? thinkingArr.length - 1 : -1;
  const legacyBlocks: { block: ThinkingBlock; index: number }[] = [];
  let activeTrailingBlock: { block: ThinkingBlock; index: number } | undefined;

  const existingOrdinals = [
    ...tools.map((t) => t.ordinal).filter((n): n is number => n !== undefined),
    ...thinkingArr.map((b) => b.ordinal).filter((n): n is number => n !== undefined),
  ];
  let ordinalCounter = existingOrdinals.length > 0 ? Math.max(...existingOrdinals) + 1 : 0;

  for (const tool of tools) {
    markers.push({
      kind: 'tool',
      offset: tool.contentOffset ?? 0,
      tool,
      ordinal: tool.ordinal ?? ordinalCounter++,
    });
  }

  for (const [index, block] of thinkingArr.entries()) {
    if (block.contentOffset !== undefined) {
      markers.push({
        kind: 'thinking',
        offset: block.contentOffset,
        block,
        index,
        ordinal: block.ordinal ?? ordinalCounter++,
      });
    } else if (index === activeThinkingIndex) {
      activeTrailingBlock = { block, index };
    } else {
      legacyBlocks.push({ block, index });
    }
  }

  markers.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    return a.ordinal - b.ordinal;
  });

  const segments: Segment[] = [];
  let cursor = 0;

  for (const { block, index } of legacyBlocks) {
    segments.push({
      type: 'thinking',
      block,
      index,
      isStreaming: false,
      key: `thinking-${String(index)}`,
    });
  }

  for (const marker of markers) {
    if (marker.offset > cursor) {
      const text = content.slice(cursor, marker.offset);
      if (text.trim()) {
        segments.push({ type: 'content', text, key: `content-${String(cursor)}` });
      }
      cursor = marker.offset;
    }

    if (marker.kind === 'thinking') {
      segments.push({
        type: 'thinking',
        block: marker.block,
        index: marker.index,
        isStreaming: false,
        key: `thinking-${String(marker.index)}`,
      });
    } else {
      segments.push({ type: 'tool', tool: marker.tool, key: marker.tool.id });
    }
  }

  if (cursor < content.length) {
    const text = content.slice(cursor);
    if (text.trim()) {
      segments.push({ type: 'content', text, key: `content-${String(cursor)}` });
    }
  }

  if (activeTrailingBlock !== undefined) {
    segments.push({
      type: 'thinking',
      block: activeTrailingBlock.block,
      index: activeTrailingBlock.index,
      isStreaming: true,
      key: `thinking-${String(activeTrailingBlock.index)}`,
    });
  }

  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'content', text: content, key: 'content-0' });
  }

  return segments;
}

/**
 * Legacy wrapper kept so existing tool-only callers reuse the unified implementation.
 * Prefer `buildUnifiedSegments` for new code.
 */
export function buildSegments(displayedContent: string, tools: ToolExecution[]): Segment[] {
  return buildUnifiedSegments(displayedContent, tools, undefined, undefined, undefined);
}

/**
 * Compare two arrays for shallow equality (same length, same references at each index).
 */
function arraysEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compile-time check that we handle ALL ChatMessage fields in arePropsEqual.
 * If ChatMessage gains new fields, TypeScript will error here, reminding you
 * to add the new field comparison in arePropsEqual below.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MAINTAINABILITY CHECKLIST - When adding new ChatMessage fields:        │
 * │                                                                         │
 * │ 1. Add to _CHAT_MESSAGE_KEYS_CHECK below (TS will error if you forget) │
 * │ 2. Add comparison in arePropsEqual():                                  │
 * │    - Primitives: if (pm.newField !== nm.newField) return false;        │
 * │    - Arrays: if (!arraysEqual(pm.newField, nm.newField)) return false; │
 * │    - Objects: shallow compare or use JSON.stringify for deep compare   │
 * │                                                                         │
 * │ FAILING TO ADD BOTH will cause stale renders during streaming!         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
const _CHAT_MESSAGE_KEYS_CHECK: Record<keyof ChatMessage, true> = {
  id: true,
  role: true,
  content: true,
  displayedContent: true,
  isStreaming: true,
  isInterrupted: true,
  turnDurationMs: true,
  thinking: true,
  thinkingDurationMs: true,
  thinkingBlocks: true,
  isThinkingActive: true,
  attachedFiles: true,
  attachedImages: true,
  parentUuid: true,
  interruptReason: true,
};
// Prevent unused variable warning while keeping type check
void _CHAT_MESSAGE_KEYS_CHECK;

/**
 * Custom comparison for memo - compares tools and message by content, not reference.
 * This is the main optimization to prevent unnecessary re-renders.
 *
 * IMPORTANT: During streaming, message object is recreated on every chunk batch.
 * We must compare message properties (not reference) to enable memo during streaming.
 *
 * TYPE SAFETY: _CHAT_MESSAGE_KEYS_CHECK above ensures we don't forget fields.
 * If ChatMessage gains new fields, TypeScript will error on that object,
 * reminding you to add the new field comparison below.
 */
export function arePropsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  // Fast path: same references
  if (prev === next) return true;

  // Compare message by content (not reference) - critical for streaming performance
  // During streaming, message object is recreated every RAF batch
  const pm = prev.message;
  const nm = next.message;

  // Compare primitive fields explicitly (clearer and faster than loop)
  if (pm.id !== nm.id) return false;
  if (pm.role !== nm.role) return false;
  if (pm.content !== nm.content) return false;
  if (pm.displayedContent !== nm.displayedContent) return false;
  if (pm.isStreaming !== nm.isStreaming) return false;
  if (pm.isInterrupted !== nm.isInterrupted) return false;
  if (pm.turnDurationMs !== nm.turnDurationMs) return false;
  if (pm.thinking !== nm.thinking) return false;
  if (pm.thinkingDurationMs !== nm.thinkingDurationMs) return false;
  if (pm.isThinkingActive !== nm.isThinkingActive) return false;
  // Compare thinkingBlocks by reference (replaced on every batch update)
  if (pm.thinkingBlocks !== nm.thinkingBlocks) return false;
  if (pm.parentUuid !== nm.parentUuid) return false;
  if (pm.interruptReason !== nm.interruptReason) return false;

  // Compare array fields with shallow equality
  if (!arraysEqual(pm.attachedFiles, nm.attachedFiles)) return false;
  if (!arraysEqual(pm.attachedImages, nm.attachedImages)) return false;

  // Compare other props
  if (prev.isLastAssistantMessage !== next.isLastAssistantMessage) return false;
  if (prev.isLastInAssistantGroup !== next.isLastInAssistantGroup) return false;
  if (prev.isLastMessage !== next.isLastMessage) return false;
  if (prev.isAgentRunning !== next.isAgentRunning) return false;
  if (prev.animate !== next.animate) return false;
  if (prev.onAnimationComplete !== next.onAnimationComplete) return false;
  if (prev.onRewind !== next.onRewind) return false;
  if (prev.onOpenFile !== next.onOpenFile) return false;
  if (prev.onOpenUrl !== next.onOpenUrl) return false;
  if (prev.onFeedback !== next.onFeedback) return false;

  // Compare tools array by content (the main optimization)
  if (prev.tools.length !== next.tools.length) return false;
  for (let i = 0; i < prev.tools.length; i++) {
    const prevTool = prev.tools[i];
    const nextTool = next.tools[i];
    if (prevTool === undefined || nextTool === undefined) return false;
    // Compare by ID, status, output, and success (code review issue #12)
    if (prevTool.id !== nextTool.id) return false;
    if (prevTool.status !== nextTool.status) return false;
    if (prevTool.toolOutput !== nextTool.toolOutput) return false;
    if (prevTool.success !== nextTool.success) return false;
    if (prevTool.contentOffset !== nextTool.contentOffset) return false;
    if (prevTool.ordinal !== nextTool.ordinal) return false;
  }

  return true;
}

/**
 * Check if a message has visible content to render.
 * Used to avoid rendering empty assistant message bubbles.
 */
export function hasVisibleContent(
  message: ChatMessage,
  segments: Segment[],
  isComplete: boolean
): boolean {
  // User messages must have non-empty content to render. Empty user messages can appear
  // from SDK protocol artifacts (e.g., interrupt markers stripped by backend, or edge
  // cases where content blocks yield no text). Without this check, an empty <p> tag
  // renders inside a bg-lg-control bubble, creating a visible empty rectangle.
  // Also filter out SDK internal messages (e.g., <local-command-stdout> from /compact).
  if (message.role === 'user') {
    const trimmed = message.content.trim();
    const hasImages = (message.attachedImages?.length ?? 0) > 0;
    if (trimmed.length === 0 && !hasImages) return false;
    if (trimmed.startsWith('<local-command-stdout>')) return false;
    return true;
  }

  const hasThinking =
    (message.thinkingBlocks !== undefined && message.thinkingBlocks.length > 0) ||
    Boolean(message.thinking);
  const hasSegments = segments.length > 0;

  // Messages with thinking, tools, or interrupted status should always stay visible.
  if (hasThinking || hasSegments || Boolean(message.isInterrupted)) return true;

  // Filter out SDK placeholder responses to slash commands (e.g., /compact).
  // Only hide it when no other renderable content exists.
  if (message.content.trim() === 'No response requested.') return false;

  return isComplete;
}
