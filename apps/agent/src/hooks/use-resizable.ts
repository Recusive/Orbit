import { useCallback, useEffect, useRef, useState } from 'react';

export type ResizeDirection = 'horizontal' | 'vertical';

export interface ResizeConstraints {
  min?: number;
  max?: number;
}

export interface UseResizableOptions {
  direction: ResizeDirection;
  initialSize?: number;
  constraints?: ResizeConstraints;
  onResize?: (size: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (size: number) => void;
}

export interface UseResizableReturn {
  size: number;
  isResizing: boolean;
  handleMouseDown: (event: React.MouseEvent) => void;
  handleTouchStart: (event: React.TouchEvent) => void;
  setSize: (size: number) => void;
  resetSize: () => void;
}

/**
 * Hook for resizable panel/element
 * Handles drag start/move/end with min/max constraints
 */
export function useResizable(options: UseResizableOptions): UseResizableReturn {
  const {
    direction,
    initialSize = 300,
    constraints = {},
    onResize,
    onResizeStart,
    onResizeEnd,
  } = options;

  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);

  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const applyConstraints = useCallback(
    (value: number): number => {
      let constrainedValue = value;

      if (constraints.min !== undefined) {
        constrainedValue = Math.max(constrainedValue, constraints.min);
      }

      if (constraints.max !== undefined) {
        constrainedValue = Math.min(constrainedValue, constraints.max);
      }

      return constrainedValue;
    },
    [constraints.min, constraints.max]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) return;

      const currentPos = direction === 'horizontal' ? event.clientX : event.clientY;
      const delta = currentPos - startPosRef.current;
      const newSize = applyConstraints(startSizeRef.current + delta);

      setSize(newSize);
      onResize?.(newSize);
    },
    [isResizing, direction, applyConstraints, onResize]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!isResizing || event.touches.length === 0) return;

      const touch = event.touches[0];
      if (!touch) return;
      const currentPos = direction === 'horizontal' ? touch.clientX : touch.clientY;
      const delta = currentPos - startPosRef.current;
      const newSize = applyConstraints(startSizeRef.current + delta);

      setSize(newSize);
      onResize?.(newSize);
    },
    [isResizing, direction, applyConstraints, onResize]
  );

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      onResizeEnd?.(size);
    }
  }, [isResizing, size, onResizeEnd]);

  const handleTouchEnd = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      onResizeEnd?.(size);
    }
  }, [isResizing, size, onResizeEnd]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      startPosRef.current = direction === 'horizontal' ? event.clientX : event.clientY;
      startSizeRef.current = size;
      setIsResizing(true);
      onResizeStart?.();
    },
    [direction, size, onResizeStart]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const touch = event.touches[0];
      if (!touch) return;
      startPosRef.current = direction === 'horizontal' ? touch.clientX : touch.clientY;
      startSizeRef.current = size;
      setIsResizing(true);
      onResizeStart?.();
    },
    [direction, size, onResizeStart]
  );

  const setSizeWithConstraints = useCallback(
    (newSize: number) => {
      const constrainedSize = applyConstraints(newSize);
      setSize(constrainedSize);
      onResize?.(constrainedSize);
    },
    [applyConstraints, onResize]
  );

  const resetSize = useCallback(() => {
    setSize(initialSize);
    onResize?.(initialSize);
  }, [initialSize, onResize]);

  // Set up event listeners for mouse/touch move and up
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);

      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);

        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
    return undefined;
  }, [isResizing, direction, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return {
    size,
    isResizing,
    handleMouseDown,
    handleTouchStart,
    setSize: setSizeWithConstraints,
    resetSize,
  };
}
