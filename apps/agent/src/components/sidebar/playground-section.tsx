import { Wand2 } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

export interface PlaygroundSectionProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PlaygroundSection: FC<PlaygroundSectionProps> = ({
  collapsed = false,
  onClick,
  className,
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm border border-dashed border-muted-foreground/30',
        collapsed && 'justify-center',
        className
      )}
      title={collapsed ? 'Playground' : undefined}
    >
      <Wand2 className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>Playground</span>}
    </button>
  );
};
