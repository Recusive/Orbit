import { useState } from 'react';

import type { FC, ReactNode } from 'react';

export interface TooltipWrapperProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const TooltipWrapper: FC<TooltipWrapperProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => {
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        setIsVisible(false);
      }}
    >
      {children}
      {isVisible ? (
        <div
          className={`
            absolute z-50 px-2 py-1 text-xs
            bg-popover text-popover-foreground
            border border-border rounded shadow-md
            whitespace-nowrap pointer-events-none
            ${positionClasses[position]}
          `}
        >
          {content}
        </div>
      ) : null}
    </div>
  );
};
