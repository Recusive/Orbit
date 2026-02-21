import type { NavItemProps } from '../types';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

export const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-2.5 py-2 text-base rounded-lg transition-[background-color,transform] duration-100',
      isActive
        ? 'bg-lg-sidebar-selected backdrop-blur-[20px] text-foreground'
        : 'text-lg-text-secondary hover:bg-lg-sidebar-hover hover:backdrop-blur-[20px] hover:text-foreground active:scale-[0.98]'
    )}
  >
    <span className={cn('shrink-0', isActive ? 'opacity-100' : 'opacity-70')}>{icon}</span>
    <span>{label}</span>
  </button>
);
