/**
 * Message Utilities
 *
 * Helper functions for message rendering and memoization.
 */

import type { ChatMessage, MessageItemProps, Segment } from './types';
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

  // Find the head (latest message by timestamp)
  // This is the end of the active chain
  const head = allMessages.reduce((latest, m) => {
    const latestTime = latest.createdAt ?? 0;
    const currentTime = m.createdAt ?? 0;
    return currentTime > latestTime ? m : latest;
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

/**
 * Build interleaved segments for assistant messages.
 * Segments alternate between content and tool widgets based on contentOffset.
 */
export function buildSegments(displayedContent: string, tools: ToolExecution[]): Segment[] {
  const sortedTools = [...tools].sort((a, b) => (a.contentOffset ?? 0) - (b.contentOffset ?? 0));

  const segments: Segment[] = [];
  let lastOffset = 0;

  for (const tool of sortedTools) {
    const offset = tool.contentOffset ?? 0;
    // Add content before this tool
    if (offset > lastOffset) {
      const text = displayedContent.slice(lastOffset, offset);
      if (text.trim()) {
        segments.push({ type: 'content', text, key: `content-${String(lastOffset)}` });
      }
    }
    // Add the tool
    segments.push({ type: 'tool', tool, key: tool.id });
    lastOffset = offset;
  }

  // Add remaining content after last tool
  if (lastOffset < displayedContent.length) {
    const text = displayedContent.slice(lastOffset);
    if (text.trim()) {
      segments.push({ type: 'content', text, key: `content-${String(lastOffset)}` });
    }
  }

  // If no tools, just render all content
  if (segments.length === 0 && displayedContent.trim()) {
    segments.push({ type: 'content', text: displayedContent, key: 'content-0' });
  }

  return segments;
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
  thinking: true,
  thinkingDurationMs: true,
  thinkingBlocks: true,
  isThinkingActive: true,
  attachedFiles: true,
  attachedImages: true,
  parentUuid: true,
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
  if (pm.thinking !== nm.thinking) return false;
  if (pm.thinkingDurationMs !== nm.thinkingDurationMs) return false;
  if (pm.isThinkingActive !== nm.isThinkingActive) return false;
  // Compare thinkingBlocks by reference (replaced on every batch update)
  if (pm.thinkingBlocks !== nm.thinkingBlocks) return false;
  if (pm.parentUuid !== nm.parentUuid) return false;

  // Compare array fields with shallow equality
  if (!arraysEqual(pm.attachedFiles, nm.attachedFiles)) return false;
  if (!arraysEqual(pm.attachedImages, nm.attachedImages)) return false;

  // Compare other props
  if (prev.isLastAssistantMessage !== next.isLastAssistantMessage) return false;
  if (prev.animate !== next.animate) return false;
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
  if (message.role === 'user') return true;

  const hasThinking =
    (message.thinkingBlocks !== undefined && message.thinkingBlocks.length > 0) ||
    Boolean(message.thinking);
  const hasSegments = segments.length > 0;

  return hasThinking || hasSegments || isComplete || Boolean(message.isInterrupted);
}
