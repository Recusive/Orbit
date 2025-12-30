import { MessageSquare } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat-store';

export interface ConversationItemProps {
  id: string;
  title: string;
  timestamp?: number;
  className?: string;
}

export const ConversationItem: FC<ConversationItemProps> = ({
  id,
  title,
  timestamp,
  className,
}) => {
  const { activeConversationId, setActiveConversation } = useChatStore();
  const isActive = activeConversationId === id;

  const handleClick = (): void => {
    setActiveConversation(id);
  };

  const formatTime = (time: number): string => {
    const date = new Date(time);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${String(diffMins)}m ago`;
    if (diffHours < 24) return `${String(diffHours)}h ago`;
    if (diffDays < 7) return `${String(diffDays)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm w-full group',
        isActive && 'bg-accent',
        className
      )}
      title={title}
    >
      <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <span className="truncate w-full text-left">{title}</span>
        {timestamp !== undefined && timestamp > 0 ? (
          <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>
        ) : null}
      </div>
    </button>
  );
};
