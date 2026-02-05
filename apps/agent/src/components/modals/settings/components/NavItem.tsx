import type { NavItemProps } from '../types';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

export const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-2.5 py-2 text-base transition-colors duration-150',
      isActive
        ? 'bg-primary/10 text-foreground border-l-2 border-primary/60 pl-[8px] rounded-r-lg rounded-l-none'
        : 'text-muted-foreground/90 hover:bg-primary/8 hover:text-foreground rounded-lg'
    )}
  >
    <span className={cn('shrink-0', isActive ? 'opacity-100' : 'opacity-70')}>{icon}</span>
    <span>{label}</span>
  </button>
);
