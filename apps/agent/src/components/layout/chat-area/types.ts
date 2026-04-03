import type { ImageAttachment } from '@/components/chat/input/types';
import type { ChatMessage } from '@/components/chat/messages';
import type { PermissionRequest, UsageData } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type {
  EffortLevel,
  InputMode,
  Model,
  ReactElementContext,
  ThinkingMode,
} from '@/types/protocol';

/** Props for ChatContent component */
export interface ChatContentProps {
  /** Ref for stabilization measurement */
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
  /** Whether conversation is loading */
  readonly isLoadingConversation: boolean;
  /** Chat messages - mutable for child component compatibility */
  readonly messages: ChatMessage[];
  /** Whether agent is currently running */
  readonly isAgentRunning: boolean;
  /** Current session ID */
  readonly sessionId: string;
  /** Queued message awaiting send */
  readonly queuedMessage: QueuedMessage | null;
  /** Pending permission requests */
  readonly pendingPermissions: readonly PermissionRequest[];
  /** Current input mode */
  readonly inputMode: InputMode;
  /** Current thinking mode */
  readonly thinkingMode: ThinkingMode;
  /** Current effort level (Opus 4.6 adaptive thinking) */
  readonly effortLevel: EffortLevel;
  /** Session token usage */
  readonly sessionUsage: UsageData;
  /** Max tokens limit */
  readonly maxTokens: number;
  /** Handlers */
  readonly onSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[],
    skills?: string[]
  ) => void;
  readonly onStop: () => void;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
  readonly onEffortLevelChange: (level: EffortLevel) => void;
  readonly onModelChange: (model: Model) => void;
  readonly onPermissionApprove: (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ) => void;
  readonly onPermissionDeny: (requestId: string) => void;
  /** Optional controls rendered above ChatInput */
  readonly extraControls?: React.ReactNode;
}

/** Props for layout stabilization hook */
export interface UseLayoutStabilizationProps {
  readonly isTransitioning: boolean;
  readonly isHydrated: boolean;
  readonly messageCount: number;
  readonly setLoadingConversation: (loading: boolean) => void;
  readonly setConversationTransitioning: (transitioning: boolean) => void;
}

/** Return type for layout stabilization hook */
export interface UseLayoutStabilizationReturn {
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
}
