import type { NavItemProps } from '../types';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

export const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-2.5 py-2 text-base transition-[background-color] duration-100',
      isActive
        ? 'bg-gray-4 text-foreground border-l-2 border-gray-9 pl-[8px] rounded-r-lg rounded-l-none'
        : 'text-gray-11 hover:bg-gray-4 hover:text-gray-12 rounded-lg'
    )}
  >
    <span className={cn('shrink-0', isActive ? 'opacity-100' : 'opacity-70')}>{icon}</span>
    <span>{label}</span>
  </button>
);
