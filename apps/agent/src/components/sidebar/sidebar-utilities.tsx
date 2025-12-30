import { BookOpen, Globe, Settings, MessageSquare } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

export interface SidebarUtilitiesProps {
  collapsed?: boolean;
  onKnowledge?: () => void;
  onBrowser?: () => void;
  onSettings?: () => void;
  onFeedback?: () => void;
  className?: string;
}

export const SidebarUtilities: FC<SidebarUtilitiesProps> = ({
  collapsed = false,
  onKnowledge,
  onBrowser,
  onSettings,
  onFeedback,
  className,
}) => {
  const utilityButtons = [
    {
      icon: BookOpen,
      label: 'Knowledge',
      onClick: onKnowledge,
    },
    {
      icon: Globe,
      label: 'Browser',
      onClick: onBrowser,
    },
    {
      icon: Settings,
      label: 'Settings',
      onClick: onSettings,
    },
    {
      icon: MessageSquare,
      label: 'Feedback',
      onClick: onFeedback,
    },
  ];

  return (
    <div className={cn('flex flex-col gap-1 pt-2 border-t border-border', className)}>
      {utilityButtons.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm',
            collapsed && 'justify-center'
          )}
          title={collapsed ? label : undefined}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
};
