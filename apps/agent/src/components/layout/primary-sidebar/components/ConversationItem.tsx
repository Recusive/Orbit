/**
 * ConversationItem - Individual conversation row
 * Features: inline editing, hover actions, context menu, active/selected state
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversationItemProps } from '../types';
import type { FC } from 'react';

import { ConversationContextMenu, ConversationDropdownMenu } from '@/components/sidebar';
import { cn } from '@/lib/utils';
import { useIsTitleLoading } from '@/stores/ui';

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
  pending = false,
  isEditing = false,
  onClick,
  onDoubleClick,
  onPrefetch,
  onCancelPrefetch,
  onRename,
  onCancelEdit,
  onDelete,
  onDuplicate,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const isTitleLoading = useIsTitleLoading(conversation.sessionId);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  // Hide timestamp when hovering OR when menu is open
  const showTimestamp = !isHovered && !isMenuOpen && !pending;

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

  const handleSaveEdit = useCallback((): void => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename?.(trimmed);
    } else {
      // Revert to original if empty or unchanged
      setEditValue(conversation.title);
      onCancelEdit?.();
    }
  }, [editValue, conversation.title, onRename, onCancelEdit]);

  const handleBlurEdit = useCallback((): void => {
    // Guard against double-fire: if Enter already submitted, skip the blur handler
    if (submittedRef.current) {
      submittedRef.current = false;
      return;
    }
    handleSaveEdit();
  }, [handleSaveEdit]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submittedRef.current = true;
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
  if (isEditing) {
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
          onBlur={handleBlurEdit}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-full rounded-[9px] px-2 text-base bg-lg-input border border-lg-separator outline-none focus:ring-1 focus:ring-foreground/20"
        />
      </form>
    );
  }

  const itemContent = (
    <div
      className="relative group mx-1.5 ml-2"
      onPointerEnter={() => {
        onPrefetch?.();
      }}
      onPointerLeave={() => {
        onCancelPrefetch?.();
      }}
      onFocus={() => {
        onPrefetch?.();
      }}
      onBlur={() => {
        onCancelPrefetch?.();
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <button
        className={cn(
          'flex items-center h-7 w-full rounded-[9px] pl-[7px] overflow-hidden',
          isHovered ? 'pr-7' : 'pr-9',
          active
            ? 'bg-foreground/10 text-foreground hover:bg-foreground/15'
            : pending
              ? 'bg-foreground/[0.06] text-foreground ring-1 ring-inset ring-foreground/10 hover:bg-foreground/[0.09]'
              : 'text-lg-text-secondary hover:text-foreground hover:bg-lg-sidebar-hover'
        )}
        title={isTitleLoading ? undefined : conversation.title}
        aria-label={conversation.title}
        aria-busy={pending || undefined}
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
            isTitleLoading && 'flex items-center',
            !isTitleLoading && !isHovered && 'truncate',
            !isTitleLoading && isHovered && 'whitespace-nowrap'
          )}
          style={
            isHovered && !isTitleLoading
              ? {
                  maskImage: TITLE_HOVER_MASK,
                  WebkitMaskImage: TITLE_HOVER_MASK,
                }
              : undefined
          }
        >
          {isTitleLoading ? (
            <span
              className={cn(
                'inline-block h-3.5 w-28 rounded animate-pulse',
                active ? 'bg-foreground/20' : 'bg-foreground/10'
              )}
            />
          ) : (
            <span className="animate-title-in">{conversation.title}</span>
          )}
        </span>
      </button>
      {/* Right area: timestamp when not hovering/menu closed, dropdown menu when hovering or open */}
      <>
        {/* Relative timestamp - visible when NOT hovering AND menu is closed.
            No opacity transition: instant swap feels snappier on fast pointer sweeps. */}
        <span
          className={cn(
            'absolute right-1.5 top-1/2 -translate-y-1/2',
            'text-[11px] tabular-nums',
            active ? 'text-white/70' : 'text-muted-foreground/60',
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
        {pending ? (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-foreground/50 animate-pulse" />
        ) : null}
      </>
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
