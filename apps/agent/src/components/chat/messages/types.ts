/**
 * Message Types
 */
import type { ImageAttachment } from '../input';
import type { ToolExecution } from '@/stores/agent/tool-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
