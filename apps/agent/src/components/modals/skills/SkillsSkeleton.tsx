import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface SkillsSkeletonProps {
  readonly rows?: number;
  readonly variant?: 'list' | 'grid';
}

export const SkillsSkeleton: FC<SkillsSkeletonProps> = ({ rows = 6, variant = 'list' }) => {
  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border/40 bg-lg-control/40 p-3">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-[10px] bg-lg-control animate-pulse shrink-0" />
              <div className="h-3.5 w-32 rounded-md bg-lg-control animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-28 rounded-md bg-lg-control animate-pulse" />
              <div className="h-2.5 w-20 rounded-md bg-lg-control animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5 px-3.5 py-2.5">
          <div className={cn('h-10 w-10 rounded-[12px] bg-lg-control animate-pulse shrink-0')} />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-3.5 w-36 rounded-md bg-lg-control animate-pulse" />
            <div className="h-2.5 w-16 rounded-md bg-lg-control animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
};
