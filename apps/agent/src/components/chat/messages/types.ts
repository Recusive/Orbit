/**
 * Message Types
 */
import type { ImageAttachment } from '../input';
import type { ToolExecution } from '@/stores/agent/tool-store';

/**
 * Chat message structure for user and assistant messages.
 *
 * IMPORTANT: If you add/remove/rename fields here, you MUST also update
 * the `_CHAT_MESSAGE_KEYS_CHECK` type guard in `message-utils.ts`.
 * This ensures the memo comparison function stays in sync with the interface.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Full message content as received from the agent */
  content: string;
  /**
   * Content to display in the UI.
   *
   * LEGACY NOTE (Jan 2026): This field now always equals `content`. Previously,
   * frontend animation revealed content progressively by setting `displayedContent`
   * to a growing substring of `content`. Backend text batching (50ms intervals)
   * now provides smooth streaming without client-side animation.
   *
   * New code should prefer `content` directly. This field is kept for backward
   * compatibility with existing code that references it.
   */
  displayedContent: string;
  isStreaming?: boolean | undefined;
  isInterrupted?: boolean | undefined;
  thinking?: string | undefined;
  thinkingDurationMs?: number | undefined;
  /** Attached file paths for user messages */
  attachedFiles?: string[] | undefined;
  /** Attached images for user messages */
  attachedImages?: ImageAttachment[] | undefined;
}

export interface MessageItemProps {
  readonly message: ChatMessage;
  readonly tools: ToolExecution[];
  readonly isLastAssistantMessage: boolean;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onFeedback: () => void;
}

/** Segment type for interleaving content and tools */
export type Segment =
  | { type: 'content'; text: string; key: string }
  | { type: 'tool'; tool: ToolExecution; key: string };
