/**
 * ConversationItem - Individual conversation row
 * Features: inline editing, hover actions, context menu, active/selected state
 */
import { useEffect, useRef, useState } from 'react';

import type { ConversationItemProps } from '../types';
import type { FC } from 'react';

import { ConversationContextMenu, ConversationDropdownMenu } from '@/components/sidebar';
import { cn, getCollapseTransition } from '@/lib/utils';

/**
 * Format a timestamp into a compact relative time string.
 * Examples: "2h", "3d", "1w", "2mo", "1y"
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears >= 1) return `${String(diffYears)}y`;
  if (diffMonths >= 1) return `${String(diffMonths)}mo`;
  if (diffWeeks >= 1) return `${String(diffWeeks)}w`;
  if (diffDays >= 1) return `${String(diffDays)}d`;
  if (diffHours >= 1) return `${String(diffHours)}h`;
  if (diffMinutes >= 1) return `${String(diffMinutes)}m`;
  return 'now';
}

/** Gradient mask for text fade on hover (left-to-right fade at end) */
const TITLE_HOVER_MASK = 'linear-gradient(to right, black 85%, transparent 98%)';

export const ConversationItem: FC<ConversationItemProps> = ({
  conversation,
  active = false,
  collapsed = false,
  isEditing = false,
  onClick,
  onDoubleClick,
  onRename,
  onCancelEdit,
  onDelete,
  onDuplicate,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hide timestamp when hovering OR when menu is open
  const showTimestamp = !isHovered && !isMenuOpen;

  // Focus and select text when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Reset edit value when conversation changes or edit mode changes
  useEffect(() => {
    setEditValue(conversation.title);
  }, [conversation.title, isEditing]);

  const handleSaveEdit = (): void => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename?.(trimmed);
    } else {
      // Revert to original if empty or unchanged
      setEditValue(conversation.title);
      onCancelEdit?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(conversation.title);
      onCancelEdit?.();
    }
  };

  const handleMenuRename = (): void => {
    onDoubleClick?.(); // Enter edit mode
  };

  const handleMenuDelete = (): void => {
    onDelete?.();
  };

  const handleMenuDuplicate = (): void => {
    onDuplicate?.();
  };

  // Render inline edit input
  if (isEditing && !collapsed) {
    return (
      <form
        className="relative mx-1.5 ml-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveEdit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
          }}
          onBlur={handleSaveEdit}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-full rounded-lg px-2 text-base bg-muted/50 border border-primary/50 outline-none focus:ring-1 focus:ring-primary/30"
        />
      </form>
    );
  }

  const itemContent = (
    <div
      className="relative group mx-1.5 ml-2"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <button
        className={cn(
          'flex items-center h-7 w-full rounded-lg pl-[7px] pr-7 overflow-hidden hover:bg-muted/40 transition-[background-color,color] duration-200',
          active ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title={conversation.title}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          onDoubleClick?.();
        }}
      >
        {/* Text - truncate with ellipsis by default, gradient fade on hover */}
        <span
          className={cn(
            'text-base overflow-hidden flex-1 text-left',
            collapsed ? 'w-0 opacity-0 whitespace-nowrap' : '',
            // When not hovered: truncate with ellipsis
            // When hovered: allow full text with gradient mask
            !collapsed && !isHovered && 'truncate',
            !collapsed && isHovered && 'whitespace-nowrap'
          )}
          style={{
            transition: getCollapseTransition(collapsed),
            // Only apply gradient mask when hovered
            ...(isHovered && !collapsed
              ? {
                  maskImage: TITLE_HOVER_MASK,
                  WebkitMaskImage: TITLE_HOVER_MASK,
                }
              : {}),
          }}
        >
          {conversation.title}
        </span>
      </button>
      {/* Right area: timestamp when not hovering/menu closed, dropdown menu when hovering or open */}
      {!collapsed ? (
        <>
          {/* Relative timestamp - visible when NOT hovering AND menu is closed */}
          <span
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2',
              'text-[11px] text-muted-foreground/60 tabular-nums transition-opacity duration-150',
              showTimestamp ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            {formatRelativeTime(conversation.updatedAt)}
          </span>
          {/* More options dropdown - appears on hover or when menu is open */}
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2">
            <ConversationDropdownMenu
              visible={isHovered || isMenuOpen}
              onRename={handleMenuRename}
              onDelete={handleMenuDelete}
              onDuplicate={handleMenuDuplicate}
              onOpenChange={setIsMenuOpen}
            />
          </div>
        </>
      ) : null}
    </div>
  );

  // Wrap with context menu for right-click support
  return (
    <ConversationContextMenu
      onRename={handleMenuRename}
      onDelete={handleMenuDelete}
      onDuplicate={handleMenuDuplicate}
    >
      {itemContent}
    </ConversationContextMenu>
  );
};
