'use client';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Wrapper with instant open/close (no delay)
const HoverCard: React.FC<React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Root>> = ({
  openDelay = 0,
  closeDelay = 100,
  ...props
}) => <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

// Animation duration - keep under 200ms for responsiveness
const ANIMATION_DURATION = '150ms';
// Smooth ease-out curve: fast start, gentle end
const ANIMATION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, style, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      'z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
      // Transform origin from Radix - scales from where it connects to trigger
      'origin-[--radix-hover-card-content-transform-origin]',
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
      // Custom timing for smoother, more responsive feel
      animationDuration: ANIMATION_DURATION,
      animationTimingFunction: ANIMATION_EASING,
      ...style,
    }}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
