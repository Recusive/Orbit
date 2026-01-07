import { Plus } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';
import { useChatStore } from '@/stores/chat/chat-store';

export interface NewConversationProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

export const NewConversation: FC<NewConversationProps> = ({
  collapsed = false,
  onClick,
  className,
}) => {
  const createConversation = useChatStore((state) => state.createConversation);

  const handleClick = (): void => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior: create a new conversation
      createConversation('New Conversation');
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-base font-medium',
        collapsed && 'justify-center',
        className
      )}
      title={collapsed ? 'New Conversation' : undefined}
    >
      <Plus className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>New</span>}
    </button>
  );
};
