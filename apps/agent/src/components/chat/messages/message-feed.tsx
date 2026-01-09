/**
 * MessageFeed - Virtualized message list component
 *
 * NOTE: This component uses constants from @/lib/utils/constants.
 * If you need to adjust scroll behavior or virtualization settings,
 * update VIRTUALIZATION and SCROLL_THRESHOLD in constants.ts - DO NOT hardcode values here.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';

import { MessageSection } from './message-section';

import type { Message } from './message-section';
import type { FC } from 'react';

import { SCROLL_THRESHOLD, VIRTUALIZATION } from '@/lib/utils/constants';

export interface MessageGroup {
  id: string;
  messages: Message[];
}

export interface MessageFeedProps {
  messageGroups: MessageGroup[];
  autoScroll?: boolean;
  className?: string;
}

export const MessageFeed: FC<MessageFeedProps> = ({
  messageGroups,
  autoScroll = true,
  className = '',
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(autoScroll);

  const virtualizer = useVirtualizer({
    count: messageGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUALIZATION.estimatedItemHeight,
    overscan: VIRTUALIZATION.overscan,
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (shouldAutoScroll.current && parentRef.current) {
      const { scrollHeight, clientHeight } = parentRef.current;
      const isNearBottom =
        scrollHeight - clientHeight - parentRef.current.scrollTop < SCROLL_THRESHOLD.nearBottom;

      if (isNearBottom || messageGroups.length === 1) {
        virtualizer.scrollToIndex(messageGroups.length - 1, {
          align: 'end',
          behavior: 'smooth',
        });
      }
    }
  }, [messageGroups.length, virtualizer]);

  // Track if user is manually scrolling
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    const handleScroll = (): void => {
      const { scrollHeight, clientHeight, scrollTop } = element;
      const isAtBottom = scrollHeight - clientHeight - scrollTop < SCROLL_THRESHOLD.atBottom;
      shouldAutoScroll.current = isAtBottom;
    };

    element.addEventListener('scroll', handleScroll);
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      ref={parentRef}
      className={`flex-1 overflow-y-auto overflow-x-hidden ${className}`}
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${String(virtualizer.getTotalSize())}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const messageGroup = messageGroups[virtualItem.index];
          if (!messageGroup) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${String(virtualItem.start)}px)`,
              }}
            >
              <MessageSection sectionIndex={virtualItem.index} messages={messageGroup.messages} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
