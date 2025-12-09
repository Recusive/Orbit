import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

interface ResizeHandleProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly target: 'right' | 'bottom';
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ direction, target }) => {
  const { setRightPanelWidth, setBottomPanelHeight } = useUIStore();

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (target === 'right') {
        const delta = startX - moveEvent.clientX;
        setRightPanelWidth(400 + delta);
      } else {
        const delta = startY - moveEvent.clientY;
        setBottomPanelHeight(200 + delta);
      }
    };

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={cn(
        'shrink-0 bg-border/50 hover:bg-primary/50 transition-colors',
        direction === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      )}
      onMouseDown={handleMouseDown}
    />
  );
};
