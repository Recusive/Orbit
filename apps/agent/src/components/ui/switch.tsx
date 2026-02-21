'use client';

import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Apple Liquid Glass switch with accessibility indicators:
 * - ON:  white dash  `─`  (left of knob)
 * - OFF: grey circle `○`  (right of knob)
 *
 * Indicators are rendered as children of the Root (behind the Thumb
 * via z-index) and fade in/out based on data-state.
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'lg-switch peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 isolation-auto transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[#0D6FFF] data-[state=unchecked]:bg-black/5 dark:data-[state=unchecked]:bg-white/10',
      className
    )}
    {...props}
    ref={ref}
  >
    {/* ON indicator: white dash (visible when checked) */}
    <i
      aria-hidden="true"
      className="not-italic absolute left-[5px] top-1/2 -translate-y-1/2 h-0.5 w-1.5 rounded-full bg-white transition-opacity duration-200 [[data-state=checked]>&]:opacity-100 [[data-state=unchecked]>&]:opacity-0"
    />
    {/* OFF indicator: grey circle outline (visible when unchecked) */}
    <i
      aria-hidden="true"
      className="not-italic absolute right-[5px] top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full border-[1.5px] border-[#C6C6C6] transition-opacity duration-200 [[data-state=unchecked]>&]:opacity-100 [[data-state=checked]>&]:opacity-0"
    />
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none relative z-10 block h-4 w-4 rounded-full bg-white ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        'shadow-[0_0_1px_rgba(0,0,0,0.05),0_0_4px_rgba(0,0,0,0.05),0_0_44px_rgba(0,0,0,0.1)]'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
