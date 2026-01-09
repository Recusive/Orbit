/**
 * Conversation Menu Components
 *
 * Provides shared menu items for conversation actions (rename, delete, duplicate).
 * Used by both:
 * - ContextMenu (right-click on conversation)
 * - DropdownMenu (three-dot button click)
 */
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/utils';

export interface ConversationMenuActions {
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

// ============================================
// Shared Menu Items (used by both menus)
// ============================================

interface MenuItemsProps extends ConversationMenuActions {
  /** Called when any menu item is clicked (to close the menu) */
  onClose?: () => void;
}

/**
 * Renders menu items for context menu.
 * Note: ContextMenuItem and DropdownMenuItem have same API but different components.
 */
const ContextMenuItems: FC<MenuItemsProps> = ({ onRename, onDelete, onDuplicate, onClose }) => {
  const handleRename = (): void => {
    onClose?.();
    onRename();
  };

  const handleDuplicate = (): void => {
    onClose?.();
    onDuplicate();
  };

  const handleDelete = (): void => {
    onClose?.();
    onDelete();
  };

  return (
    <>
      <ContextMenuItem onClick={handleRename}>
        <Pencil className="h-4 w-4" />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDuplicate}>
        <Copy className="h-4 w-4" />
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
        <Trash2 className="h-4 w-4" />
        Delete
        <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
};

/**
 * Renders menu items for dropdown menu.
 */
const DropdownMenuItems: FC<MenuItemsProps> = ({ onRename, onDelete, onDuplicate, onClose }) => {
  const handleRename = (): void => {
    onClose?.();
    onRename();
  };

  const handleDuplicate = (): void => {
    onClose?.();
    onDuplicate();
  };

  const handleDelete = (): void => {
    onClose?.();
    onDelete();
  };

  return (
    <>
      <DropdownMenuItem onClick={handleRename}>
        <Pencil className="h-4 w-4" />
        Rename
        <DropdownMenuShortcut>F2</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleDuplicate}>
        <Copy className="h-4 w-4" />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
        <Trash2 className="h-4 w-4" />
        Delete
        <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
};

// ============================================
// Context Menu (Right-Click)
// ============================================

export interface ConversationContextMenuProps extends ConversationMenuActions {
  children: ReactNode;
}

/**
 * Context menu wrapper for conversation items.
 * Triggered by right-clicking on the conversation.
 */
export const ConversationContextMenu: FC<ConversationContextMenuProps> = ({
  children,
  onRename,
  onDelete,
  onDuplicate,
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItems onRename={onRename} onDelete={onDelete} onDuplicate={onDuplicate} />
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ============================================
// Dropdown Menu (Three-Dot Button)
// ============================================

export interface ConversationDropdownMenuProps extends ConversationMenuActions {
  /** Whether the button is visible (e.g., on hover) */
  visible?: boolean;
  /** Additional className for the trigger button */
  className?: string;
}

/**
 * Dropdown menu triggered by the three-dot button.
 * Used as an alternative to right-click context menu.
 */
export const ConversationDropdownMenu: FC<ConversationDropdownMenuProps> = ({
  visible = true,
  className,
  onRename,
  onDelete,
  onDuplicate,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded-md transition-all duration-150 hover:bg-muted/60 active:scale-90 focus:outline-none focus-visible:outline-none',
            visible || open ? 'opacity-100' : 'opacity-0',
            className
          )}
          onClick={(e) => {
            e.stopPropagation();
          }}
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItems
          onRename={onRename}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onClose={() => {
            setOpen(false);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
