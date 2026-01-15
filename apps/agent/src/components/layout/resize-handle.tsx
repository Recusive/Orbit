/**
 * ResizeHandle - Draggable resize handle for panels
 *
 * NOTE: Handle dimensions come from @/lib/utils/constants.
 * To change handle width or hover width, update RESIZE_HANDLE in constants.ts.
 */
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { RESIZE_HANDLE } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import { useUIStore } from '@/stores/ui/ui-store';

interface ResizeHandleProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly target: 'review' | 'bottom';
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ direction, target }) => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const { setReviewPanelWidth, setBottomPanelHeight, reviewPanelWidth, bottomPanelHeight } =
    useUIStore(
      useShallow((s) => ({
        setReviewPanelWidth: s.setReviewPanelWidth,
        setBottomPanelHeight: s.setBottomPanelHeight,
        reviewPanelWidth: s.reviewPanelWidth,
        bottomPanelHeight: s.bottomPanelHeight,
      }))
    );
  const startValueRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);

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
  const handleSize = isHovered ? RESIZE_HANDLE.hoverWidth : RESIZE_HANDLE.width;

  return (
    <div
      className={cn(
        'group relative shrink-0 flex items-center justify-center',
        isVertical ? 'h-full cursor-col-resize' : 'w-full cursor-row-resize'
      )}
      style={isVertical ? { width: RESIZE_HANDLE.width } : { height: 4 }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Persistent separator line */}
      <div
        className="bg-border transition-all duration-100"
        style={
          isVertical
            ? { width: RESIZE_HANDLE.width, height: '100%' }
            : { height: RESIZE_HANDLE.width, width: '100%' }
        }
      />
      {/* Hover indicator line */}
      <div
        className="absolute bg-primary transition-all duration-100"
        style={{
          opacity: isHovered ? 1 : 0,
          ...(isVertical
            ? { width: handleSize, height: '100%' }
            : { height: handleSize, width: '100%' }),
        }}
      />
    </div>
  );
};
