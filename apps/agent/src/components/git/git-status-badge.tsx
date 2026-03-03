import type { FileStatus } from '@/lib/api';
import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { GIT_STATUS_STYLES } from '@/lib/utils/constants';

interface GitStatusBadgeProps {
  /** The file status to display */
  status: FileStatus;
  /** Additional CSS classes */
  className?: string;
}

const STATUS_BACKGROUNDS: Record<FileStatus, string> = {
  added: 'bg-git-added-subtle',
  modified: 'bg-git-modified-subtle',
  deleted: 'bg-git-deleted-subtle',
  renamed: 'bg-git-renamed-subtle',
  copied: 'bg-git-copied-subtle',
  untracked: 'bg-git-untracked-subtle',
  conflicted: 'bg-git-conflicted-subtle',
  typechange: 'bg-git-typechange-subtle',
};

/**
 * A badge component that displays a git file status.
 *
 * @example
 * ```tsx
 * <GitStatusBadge status="modified" />
 * <GitStatusBadge status="added" className="ml-2" />
 * ```
 */
export const GitStatusBadge: FC<GitStatusBadgeProps> = ({ status, className }) => {
  const config = GIT_STATUS_STYLES[status];

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 text-xs font-mono font-bold rounded',
        config.color,
        STATUS_BACKGROUNDS[status],
        className
      )}
      title={config.title}
    >
      {config.label}
    </span>
  );
};
