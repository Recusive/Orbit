/**
 * Shared types for PrimarySidebar components
 */
import type { ConversationSummary } from '@/stores/ui/ui-store';
import type { FC } from 'react';

export type SidebarTab = 'conversations' | 'explorer';

export type PrimarySidebarProps = Record<string, never>;

export interface SidebarItemProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly active?: boolean;
  readonly small?: boolean;
  readonly large?: boolean;
  readonly shortcut?: string[];
  readonly badge?: string;
  readonly badgeVariant?: 'default' | 'primary';
  readonly className?: string;
  readonly onClick?: () => void;
}

export interface ConversationItemProps {
  readonly conversation: ConversationSummary;
  readonly active?: boolean;
  readonly isEditing?: boolean;
  readonly onClick?: () => void;
  readonly onDoubleClick?: () => void;
  readonly onRename?: (newTitle: string) => void;
  readonly onCancelEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onDuplicate?: () => void;
}

export interface WorkspaceItemProps {
  readonly name: string;
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly onToggle?: () => void;
}

export interface TabButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}

export interface SidebarToggleIconProps {
  readonly expanded: boolean;
}
