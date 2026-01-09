/**
 * Message Utilities
 *
 * Helper functions for message rendering and memoization.
 */
import type { ChatMessage, MessageItemProps, Segment } from './types';
import type { ToolExecution } from '@/stores/agent/tool-store';

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
 * Custom comparison for memo - compares tools by content, not reference.
 * This is the main optimization to prevent unnecessary re-renders.
 */
export function arePropsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  // Fast path: same references
  if (prev === next) return true;

  // Compare simple props
  if (prev.message !== next.message) return false;
  if (prev.isLastAssistantMessage !== next.isLastAssistantMessage) return false;
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
    // Compare by ID and status - if these match, tool is the same
    if (prevTool.id !== nextTool.id) return false;
    if (prevTool.status !== nextTool.status) return false;
    if (prevTool.toolOutput !== nextTool.toolOutput) return false;
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

  const hasThinking = Boolean(message.thinking);
  const hasSegments = segments.length > 0;

  return hasThinking || hasSegments || isComplete || Boolean(message.isInterrupted);
}
