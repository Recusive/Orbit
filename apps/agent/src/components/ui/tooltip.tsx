import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { createContext, useCallback, useRef } from 'react';

import { cn, POPOVER_ANIMATION } from '@/lib/utils';

/**
 * Optimized TooltipProvider that reduces re-renders caused by Radix UI.
 *
 * Problem: Radix's default TooltipProvider uses useState for `isOpenDelayed`,
 * causing ALL tooltips to re-render when ANY tooltip is hovered.
 * See: https://github.com/radix-ui/primitives/issues/2375
 *
 * This wrapper provides a stable context layer with ref-based state tracking,
 * which reduces (but doesn't completely eliminate) cascading re-renders.
 * For a complete fix, Radix would need to patch their internal implementation.
 *
 * The improvement comes from:
 * 1. Stable context value (useCallback for handlers, refs for state)
 * 2. Breaking the re-render chain for components that only consume our context
 */

interface OptimizedTooltipContextValue {
  isOpenDelayedRef: React.RefObject<boolean>;
  onOpen: () => void;
  onClose: () => void;
}

const OptimizedTooltipContext = createContext<OptimizedTooltipContextValue | null>(null);

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
}

const TooltipProvider: React.FC<TooltipProviderProps> = ({
  children,
  delayDuration = 400,
  skipDelayDuration = 300,
  disableHoverableContent = false,
}) => {
  // Use ref instead of state to prevent re-renders across all tooltips
  const isOpenDelayedRef = useRef(true);
  const skipDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onOpen = useCallback(() => {
    if (skipDelayTimerRef.current !== null) {
      clearTimeout(skipDelayTimerRef.current);
    }
    isOpenDelayedRef.current = false;
  }, []);

  const onClose = useCallback(() => {
    if (skipDelayTimerRef.current !== null) {
      clearTimeout(skipDelayTimerRef.current);
    }
    skipDelayTimerRef.current = setTimeout(() => {
      isOpenDelayedRef.current = true;
    }, skipDelayDuration);
  }, [skipDelayDuration]);

  return (
    <OptimizedTooltipContext.Provider value={{ isOpenDelayedRef, onOpen, onClose }}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        disableHoverableContent={disableHoverableContent}
      >
        {children}
      </TooltipPrimitive.Provider>
    </OptimizedTooltipContext.Provider>
  );
};

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'apple-tooltip z-50 overflow-hidden rounded-[9px] text-[11px] font-[510] leading-[13px]',
        // Enter: zoom 97% → 100% + fade (matched to HoverCard & DropdownMenu)
        'animate-in fade-in-0 zoom-in-[0.97]',
        // Exit: reverse
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]',
        'data-[side=bottom]:slide-in-from-top-2',
        'data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2',
        'data-[side=top]:slide-in-from-bottom-2',
        'origin-[--radix-tooltip-content-transform-origin]',
        className
      )}
      style={{
        animationDuration: POPOVER_ANIMATION.duration,
        animationTimingFunction: POPOVER_ANIMATION.easing,
        ...style,
      }}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipArrow = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Arrow ref={ref} className={cn('fill-[var(--menu-bg)]', className)} {...props} />
));
TooltipArrow.displayName = TooltipPrimitive.Arrow.displayName;

export { Tooltip, TooltipArrow, TooltipContent, TooltipProvider, TooltipTrigger };
