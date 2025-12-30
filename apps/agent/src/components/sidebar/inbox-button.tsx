import { Inbox } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

export interface InboxButtonProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

export const InboxButton: FC<InboxButtonProps> = ({ collapsed = false, onClick, className }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm',
        collapsed && 'justify-center',
        className
      )}
      title={collapsed ? 'Inbox' : undefined}
    >
      <Inbox className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>Inbox</span>}
    </button>
  );
};
