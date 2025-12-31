import type { FC } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface MessageSkeletonProps {
  readonly isUser?: boolean;
}

const MessageSkeleton: FC<MessageSkeletonProps> = ({ isUser = false }) => (
  <div className={cn('flex gap-3 py-3', isUser && 'flex-row-reverse')}>
    {/* Avatar skeleton */}
    <Skeleton className="h-8 w-8 rounded-full shrink-0" />

    {/* Message content skeleton */}
    <div className={cn('flex flex-col gap-2 flex-1', isUser && 'items-end')}>
      <Skeleton className={cn('h-4 rounded-full', isUser ? 'w-[60%]' : 'w-[75%]')} />
      <Skeleton className={cn('h-4 rounded-full', isUser ? 'w-[40%]' : 'w-[55%]')} />
      {!isUser && <Skeleton className="h-4 w-[35%] rounded-full" />}
    </div>
  </div>
);

export const ChatSkeleton: FC = () => (
  <div className="flex-1 overflow-hidden p-4">
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Simulate a conversation with alternating messages */}
      <MessageSkeleton isUser />
      <MessageSkeleton />
      <MessageSkeleton isUser />
      <MessageSkeleton />
    </div>
  </div>
);
