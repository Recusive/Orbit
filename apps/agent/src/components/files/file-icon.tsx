import { useMemo } from 'react';

import type { FC } from 'react';

import { getFileIconName } from '@/lib/utils/iconMap';
import { cn } from '@/lib/utils/utils';

export interface FileIconProps {
  readonly fileName: string;
  readonly className?: string;
  readonly monochrome?: boolean;
  readonly isSymlink?: boolean;
}

// Import all icons from the assets directory
const iconModules = import.meta.glob<{ default: string }>('/src/assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Build a map of icon name to URL
const iconMap: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const match = /\/([^/]+)\.svg$/.exec(path);
  if (match?.[1]) {
    iconMap[match[1]] = url as unknown as string;
  }
}

export const FileIcon: FC<FileIconProps> = ({
  fileName,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  const iconName = useMemo(() => getFileIconName(fileName), [fileName]);
  const iconUrl = iconMap[iconName] ?? iconMap['document'];

  if (!iconUrl) {
    // Fallback to a simple file representation
    return (
      <svg
        className={cn('shrink-0', isSymlink && 'opacity-60', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className={cn(
        'shrink-0',
        monochrome && 'dark:invert dark:brightness-90 opacity-80',
        isSymlink && 'opacity-60',
        className
      )}
      draggable={false}
    />
  );
};
