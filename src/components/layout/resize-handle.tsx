import React, { useCallback, useRef, useState, useEffect } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onResize,
  className = '',
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      setIsResizing(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    },
    [direction]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      onResize(delta);
      startPosRef.current = currentPos;
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Change cursor while resizing
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, direction, onResize]);

  const baseClasses =
    direction === 'horizontal'
      ? 'w-1 cursor-col-resize hover:bg-blue-500/50'
      : 'h-1 cursor-row-resize hover:bg-blue-500/50';

  const activeClasses = isResizing ? 'bg-blue-500' : 'bg-border';

  return (
    <div
      className={`${baseClasses} ${activeClasses} transition-colors ${className}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={direction}
    />
  );
};
