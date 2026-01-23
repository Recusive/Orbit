import { memo, useMemo } from 'react';

import type { FC } from 'react';

import { hasIconUrl, resolveFileIconUrl } from '@/lib/icons';
import { cn } from '@/lib/utils';
import {
  selectIconTheme,
  selectUsesDarkInvert,
  useIconThemeStore,
} from '@/stores/ui/icon-theme-store';

// ============================================================================
// Props Interface
// ============================================================================

export interface FileIconProps {
  readonly fileName: string;
  readonly className?: string;
  readonly monochrome?: boolean;
  readonly isSymlink?: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Renders a file icon based on the file name and current icon theme.
 *
 * Uses the icon theme store for theme selection and dark mode strategy.
 * Falls back to an inline SVG document icon if no icon URL is found.
 */
const FileIconComponent: FC<FileIconProps> = ({
  fileName,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  // Granular store subscriptions - only re-render when specific values change
  const themeId = useIconThemeStore(selectIconTheme);
  const usesDarkInvert = useIconThemeStore(selectUsesDarkInvert);

  // Memoize URL resolution - only recalculate when fileName or theme changes
  const iconUrl = useMemo(() => resolveFileIconUrl(fileName, themeId), [fileName, themeId]);

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
        monochrome && usesDarkInvert && 'dark:invert dark:brightness-90 opacity-80',
        isSymlink && 'opacity-60',
        className
      )}
      draggable={false}
    />
  );
};

export const FileIcon = memo(FileIconComponent);
FileIcon.displayName = 'FileIcon';
