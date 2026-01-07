import type { FileStatus } from '@/lib/api/backend';
import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

interface GitStatusBadgeProps {
  /** The file status to display */
  status: FileStatus;
  /** Additional CSS classes */
  className?: string;
}

const STATUS_CONFIG: Record<
  FileStatus,
  { label: string; color: string; bg: string; title: string }
> = {
  added: {
    label: 'A',
    color: 'text-green-400',
    bg: 'bg-green-400/20',
    title: 'Added',
  },
  modified: {
    label: 'M',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/20',
    title: 'Modified',
  },
  deleted: {
    label: 'D',
    color: 'text-red-400',
    bg: 'bg-red-400/20',
    title: 'Deleted',
  },
  renamed: {
    label: 'R',
    color: 'text-blue-400',
    bg: 'bg-blue-400/20',
    title: 'Renamed',
  },
  copied: {
    label: 'C',
    color: 'text-purple-400',
    bg: 'bg-purple-400/20',
    title: 'Copied',
  },
  untracked: {
    label: '?',
    color: 'text-gray-400',
    bg: 'bg-gray-400/20',
    title: 'Untracked',
  },
  conflicted: {
    label: 'U',
    color: 'text-orange-400',
    bg: 'bg-orange-400/20',
    title: 'Conflicted',
  },
  typechange: {
    label: 'T',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/20',
    title: 'Type Changed',
  },
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
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 text-xs font-mono font-bold rounded',
        config.color,
        config.bg,
        className
      )}
      title={config.title}
    >
      {config.label}
    </span>
  );
};
