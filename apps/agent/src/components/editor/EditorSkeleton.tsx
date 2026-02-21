import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface EditorSkeletonProps {
  readonly className?: string;
}

/**
 * Skeleton placeholder for CodeMirrorEditor while it loads.
 * Matches the approximate visual structure of the editor.
 */
export const EditorSkeleton: FC<EditorSkeletonProps> = ({ className }) => {
  return (
    <div className={cn('h-full w-full flex flex-col bg-background', className)}>
      {/* Gutter area */}
      <div className="flex-1 flex">
        <div className="w-12 bg-lg-control border-r border-lg-separator">
          {/* Line numbers skeleton */}
          <div className="py-2 px-2 space-y-1">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-lg-control rounded animate-pulse"
                style={{ width: `${String(20 + Math.random() * 10)}px` }}
              />
            ))}
          </div>
        </div>
        {/* Code area skeleton */}
        <div className="flex-1 p-4 space-y-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="h-4 bg-lg-control rounded animate-pulse"
              style={{ width: `${String(30 + Math.random() * 60)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
