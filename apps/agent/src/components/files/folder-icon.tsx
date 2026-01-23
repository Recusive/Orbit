import { memo, useMemo } from 'react';

import type { FC } from 'react';

import { hasIconUrl, resolveFolderIconUrl } from '@/lib/icons';
import { cn } from '@/lib/utils';
import {
  selectIconTheme,
  selectUsesDarkInvert,
  useIconThemeStore,
} from '@/stores/ui/icon-theme-store';

// ============================================================================
// Props Interface
// ============================================================================

export interface FolderIconProps {
  readonly folderName: string;
  readonly isOpen?: boolean;
  readonly className?: string;
  readonly monochrome?: boolean;
  readonly isSymlink?: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Renders a folder icon based on the folder name, open state, and current icon theme.
 *
 * Uses the icon theme store for theme selection and dark mode strategy.
 * Falls back to an inline SVG folder icon if no icon URL is found.
 */
const FolderIconComponent: FC<FolderIconProps> = ({
  folderName,
  isOpen = false,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  // Granular store subscriptions - only re-render when specific values change
  const themeId = useIconThemeStore(selectIconTheme);
  const usesDarkInvert = useIconThemeStore(selectUsesDarkInvert);

  // Memoize URL resolution - only recalculate when folderName, isOpen, or theme changes
  const iconUrl = useMemo(
    () => resolveFolderIconUrl(folderName, isOpen, themeId),
    [folderName, isOpen, themeId]
  );

  // Fallback to inline SVG when no icon URL is found
  if (!hasIconUrl(iconUrl)) {
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
        monochrome && usesDarkInvert && 'dark:invert dark:brightness-90 opacity-80',
        isSymlink && 'opacity-60',
        className
      )}
      draggable={false}
    />
  );
};

export const FolderIcon = memo(FolderIconComponent);
FolderIcon.displayName = 'FolderIcon';
