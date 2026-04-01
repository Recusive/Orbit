/**
 * Message Types
 */
import type { ImageAttachment } from '../input';
import type { ToolExecution } from '@/stores/agent/tool-store';

/** A single phase of extended thinking within an assistant message. */
export interface ThinkingBlock {
  content: string;
  durationMs: number;
  contentOffset?: number | undefined;
  ordinal?: number | undefined;
}

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
  /** Wall-clock duration of the entire assistant turn in milliseconds (from SDK). */
  turnDurationMs?: number | undefined;
  /**
   * Flat thinking string for persistence compatibility.
   * During live streaming, prefer `thinkingBlocks` for per-phase rendering.
   * When loading persisted messages, this is the only field populated.
   */
  thinking?: string | undefined;
  thinkingDurationMs?: number | undefined;
  /**
   * Per-phase thinking blocks for multi-turn rendering.
   * Each block represents one thinking phase (separated by tool/text content).
   * Populated during live streaming; for loaded messages, derived from `thinking`.
   */
  thinkingBlocks?: ThinkingBlock[] | undefined;
  /**
   * Whether the agent is currently in a thinking phase.
   * True when `agent:thinking` chunks are arriving, false when text/tools arrive.
   * Used to determine if the last thinking block is still streaming.
   */
  isThinkingActive?: boolean | undefined;
  /** Attached file paths for user messages */
  attachedFiles?: string[] | undefined;
  /** Attached images for user messages */
  attachedImages?: ImageAttachment[] | undefined;
  /**
   * UUID of the previous message in the conversation chain.
   * Used for Claude Code-style rewind/branching.
   * - null for first message in conversation
   * - undefined for legacy messages without this field
   */
  parentUuid?: string | null | undefined;
  /**
   * Reason the message was interrupted. When set, the interrupt indicator
   * shows this text instead of the default feedback prompt.
   * e.g. "User rejected to answer" for dismissed AskUserQuestion.
   */
  interruptReason?: string | undefined;
}

export interface MessageItemProps {
  readonly message: ChatMessage;
  readonly tools: ToolExecution[];
  readonly isLastAssistantMessage: boolean;
  /** Whether this is the last assistant message in a consecutive group.
   *  Multi-turn responses produce multiple assistant messages — only the
   *  last one in the group should render the action bar. */
  readonly isLastInAssistantGroup: boolean;
  /** Whether this is the very last message in the array (any role). */
  readonly isLastMessage: boolean;
  /** Whether the agent is still running (entire turn not yet complete) */
  readonly isAgentRunning: boolean;
  /** Whether to animate this message sliding in (for newly sent messages) */
  readonly animate?: boolean | undefined;
  readonly onAnimationComplete?: ((messageId: string) => void) | undefined;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onFeedback: () => void;
}

/** Segment type for interleaving content and tools */
export type Segment =
  | { type: 'content'; text: string; key: string }
  | { type: 'tool'; tool: ToolExecution; key: string }
  | {
      type: 'thinking';
      block: ThinkingBlock;
      index: number;
      isStreaming: boolean;
      key: string;
    };
