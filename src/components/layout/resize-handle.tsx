import { useRef } from 'react';

import type { FC } from 'react';

import { RESIZE_HANDLE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

interface ResizeHandleProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly target: 'review' | 'bottom';
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ direction, target }) => {
  const { setReviewPanelWidth, setBottomPanelHeight, reviewPanelWidth, bottomPanelHeight } = useUIStore();
  const startValueRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startPos = direction === 'vertical' ? e.clientX : e.clientY;
    startValueRef.current = target === 'review' ? reviewPanelWidth : bottomPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (target === 'review') {
        const delta = startPos - moveEvent.clientX;
        setReviewPanelWidth(startValueRef.current + delta);
      } else {
        const delta = startPos - moveEvent.clientY;
        setBottomPanelHeight(startValueRef.current + delta);
      }
    };

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const isVertical = direction === 'vertical';

  return (
    <div
      className={cn(
        'group relative shrink-0 flex items-center justify-center',
        isVertical ? 'w-1 h-full cursor-col-resize' : 'h-1 w-full cursor-row-resize'
      )}
      onMouseDown={handleMouseDown}
    >
      {/* Persistent separator line */}
      <div
        className={cn(
          'bg-border transition-all duration-100',
          isVertical ? `w-[${String(RESIZE_HANDLE.width)}px] h-full` : `h-[${String(RESIZE_HANDLE.width)}px] w-full`
        )}
      />
      {/* Hover indicator line */}
      <div
        className={cn(
          'absolute opacity-0 group-hover:opacity-100 bg-primary transition-all duration-100',
          isVertical
            ? `w-[${String(RESIZE_HANDLE.width)}px] group-hover:w-[${String(RESIZE_HANDLE.hoverWidth)}px] h-full`
            : `h-[${String(RESIZE_HANDLE.width)}px] group-hover:h-[${String(RESIZE_HANDLE.hoverWidth)}px] w-full`
        )}
      />
    </div>
  );
};
