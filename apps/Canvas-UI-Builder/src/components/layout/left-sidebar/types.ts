/**
 * Shared types for Canvas sidebar components
 */
import type { FC } from 'react';

export type CanvasSidebarTab = 'components' | 'files';

export interface CanvasLeftSidebarProps {
  readonly width: number;
}

export interface CanvasRightSidebarProps {
  readonly width: number;
}

export interface SidebarItemProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly collapsed: boolean;
  readonly active?: boolean;
  readonly small?: boolean;
  readonly equalSpacing?: boolean;
  readonly shortcut?: string[];
  readonly onClick?: () => void;
}

export interface TabButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}

export interface SidebarToggleIconProps {
  readonly expanded: boolean;
  /** Direction for the toggle icon - left sidebar opens to right, right sidebar opens to left */
  readonly direction?: 'left' | 'right';
}
