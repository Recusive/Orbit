/**
 * CompactIndicator — Shown in place of the user message bubble when `/compact` is sent.
 *
 * Two states derived from ChatStore's compactingMessageId:
 * - **Compacting**: ThinkingDots + "Context compacting" (this message ID matches compactingMessageId)
 * - **Done**: Minimize2 icon + "Context compacted" (default / after compact_complete clears the ID)
 */
import { Minimize2 } from 'lucide-react';

import type { FC } from 'react';

import { ThinkingDots } from '@/components/ui/thinking-dots';
import { useChatStore } from '@/stores/chat/chat-store';

interface CompactIndicatorProps {
  /** The user message ID for this /compact command */
  readonly messageId: string;
}

export const CompactIndicator: FC<CompactIndicatorProps> = ({ messageId }) => {
  const isCompacting = useChatStore((s) => s.compactingMessageId === messageId);

  return (
    <div className="flex w-full items-center gap-3 py-1.5 select-none cursor-default">
      {/* Left line */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/15" />

      {/* Centered icon + label */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isCompacting ? (
          <>
            <ThinkingDots size={10} speed={1.2} />
            <span className="text-[11px] font-medium text-lg-text-secondary">
              Context compacting
            </span>
          </>
        ) : (
          <>
            <Minimize2 className="h-3 w-3 text-lg-text-secondary" />
            <span className="text-[11px] font-medium text-lg-text-secondary">
              Context compacted
            </span>
          </>
        )}
      </div>

      {/* Right line */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/15" />
    </div>
  );
};
