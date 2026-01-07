'use client';

import { Allotment } from 'allotment';
import { forwardRef } from 'react';
import 'allotment/dist/style.css';

import type { AllotmentHandle, AllotmentProps } from 'allotment';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/utils';

interface ResizablePanelGroupProps extends Omit<AllotmentProps, 'vertical'> {
  direction?: 'horizontal' | 'vertical';
  children: ReactNode;
}

export const ResizablePanelGroup = forwardRef<AllotmentHandle, ResizablePanelGroupProps>(
  ({ direction = 'horizontal', className, children, ...props }, ref) => (
    <Allotment ref={ref} vertical={direction === 'vertical'} className={cn(className)} {...props}>
      {children}
    </Allotment>
  )
);
ResizablePanelGroup.displayName = 'ResizablePanelGroup';

export const ResizablePanel = Allotment.Pane;

// Allotment has built-in handles, but we export this for API compatibility
// It's essentially a no-op since Allotment handles the resize bars internally
export const ResizableHandle = (): null => null;
