/**
 * AddContextMenu - Plus button that opens a popover for attaching context
 *
 * Uses the same portal-based popover pattern as ModelSelector to escape
 * overflow:hidden / CSS containment on ancestor containers.
 */
import { Image, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, POPOVER_ANIMATION, TRANSITION_CLASSES } from '@/lib/utils';

/** Gap between trigger and popover */
const POPOVER_GAP = 8;

/** Popover width */
const POPOVER_WIDTH = 150;

interface PopoverPosition {
  top?: number;
  bottom?: number;
  left: number;
  side: 'top' | 'bottom';
}

interface AddContextMenuProps {
  readonly onImageClick: () => void;
}

export const AddContextMenu: FC<AddContextMenuProps> = ({ onImageClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ bottom: 0, left: 0, side: 'top' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback((): void => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? 100;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove >= popoverHeight || spaceAbove >= spaceBelow) {
      setPosition({
        bottom: window.innerHeight - rect.top + POPOVER_GAP,
        left: rect.left,
        side: 'top',
      });
    } else {
      setPosition({
        top: rect.bottom + POPOVER_GAP,
        left: rect.left,
        side: 'bottom',
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || isAnimatingOut) return;
    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, isAnimatingOut, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || isAnimatingOut) return;
    const rafId = requestAnimationFrame(() => {
      popoverRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, isAnimatingOut]);

  const handleClose = useCallback((): void => {
    if (!isOpen || isAnimatingOut) return;
    setIsAnimatingOut(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setIsOpen(false);
      setIsAnimatingOut(false);
    }, POPOVER_ANIMATION.exitDurationMs);
  }, [isOpen, isAnimatingOut]);

  useEffect(() => {
    return (): void => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const handleToggle = (): void => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  };

  const handleImageSelect = (): void => {
    onImageClick();
    handleClose();
  };

  const handlePopoverKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const popover = popoverRef.current;
    if (!popover) return;

    const focusable = popover.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }, []);

  const popoverContent = isOpen ? (
    <div
      ref={popoverRef}
      role="menu"
      aria-label="Add context"
      tabIndex={-1}
      onKeyDown={handlePopoverKeyDown}
      data-side={position.side}
      className={cn(
        'fixed glass-surface rounded-[10px] overflow-hidden z-50 outline-none',
        position.side === 'top' ? 'origin-bottom-left' : 'origin-top-left',
        !isAnimatingOut &&
          cn(
            'animate-in zoom-in-[0.97]',
            position.side === 'top' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'
          ),
        isAnimatingOut && 'opacity-0'
      )}
      style={{
        width: POPOVER_WIDTH,
        ...(position.bottom !== undefined ? { bottom: position.bottom } : {}),
        ...(position.top !== undefined ? { top: position.top } : {}),
        left: position.left,
        animationTimingFunction: isAnimatingOut
          ? POPOVER_ANIMATION.exitEasing
          : POPOVER_ANIMATION.enterEasing,
        animationDuration: isAnimatingOut
          ? POPOVER_ANIMATION.exitDuration
          : POPOVER_ANIMATION.enterDuration,
      }}
    >
      <div className="p-1.5">
        <button
          role="menuitem"
          onClick={handleImageSelect}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-[9px]',
            TRANSITION_CLASSES.item,
            'hover:bg-lg-sidebar-hover active:scale-[0.98]'
          )}
        >
          <Image className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Image</span>
        </button>
        <button
          role="menuitem"
          disabled
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-[9px]',
            'text-muted-foreground/50 cursor-default'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Skills</span>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            onClick={handleToggle}
            aria-label="Add agents, context, tools"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded-full',
              'bg-lg-control text-muted-foreground/70',
              'hover:bg-lg-control-hover hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
              isOpen && 'bg-lg-control-hover text-foreground'
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        {!isOpen ? <TooltipContent>Add context</TooltipContent> : null}
      </Tooltip>

      {popoverContent !== null ? createPortal(popoverContent, document.body) : null}
    </div>
  );
};
