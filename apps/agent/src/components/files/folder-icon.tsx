import { useMemo } from 'react';

import type { FC } from 'react';

import { getFolderIconName } from '@/lib/utils/iconMap';
import { cn } from '@/lib/utils/utils';

export interface FolderIconProps {
  readonly folderName: string;
  readonly isOpen?: boolean;
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

export const FolderIcon: FC<FolderIconProps> = ({
  folderName,
  isOpen = false,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  const iconName = useMemo(() => getFolderIconName(folderName, isOpen), [folderName, isOpen]);

  // Try to get the specific folder icon, fall back to default folder
  const iconUrl = iconMap[iconName] ?? iconMap[isOpen ? 'folder-open' : 'folder'];

  if (!iconUrl) {
    // Fallback to a simple folder representation
    return (
      <svg
        className={cn('shrink-0', isSymlink && 'opacity-60', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        {isOpen ? (
          <>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M2 10h20" />
          </>
        ) : (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        )}
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
