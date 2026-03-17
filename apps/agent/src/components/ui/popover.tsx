'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn, POPOVER_ANIMATION } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 glass-surface p-4 text-popover-foreground outline-none',
        // Transform origin from Radix - scales from where it connects to trigger
        'origin-[--radix-popover-content-transform-origin]',
        // Enter animation: subtle scale + fade + directional slide
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]',
        // Exit animation: reverse of enter
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]',
        // Directional slides based on which side the popover appears
        'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
        className
      )}
      style={{
        animationDuration: POPOVER_ANIMATION.duration,
        animationTimingFunction: POPOVER_ANIMATION.easing,
        ...style,
      }}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
