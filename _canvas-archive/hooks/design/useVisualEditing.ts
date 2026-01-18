/**
 * useVisualEditing Hook
 *
 * Manages visual editing operations: selection, drag-to-move, resize, and snapping.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import type {
  ResizeHandle,
  SelectionRect,
  SnapGuide,
} from '../../components/overlays/SelectionOverlay';

export interface Point {
  x: number;
  y: number;
}

export interface SelectedElement {
  layerId: string;
  componentId: string;
  rect: SelectionRect;
  isAbsolute: boolean;
}

export interface VisualEditingState {
  selectedElement: SelectedElement | null;
  isDragging: boolean;
  isResizing: boolean;
  resizeHandle: ResizeHandle | null;
  snapGuides: SnapGuide[];
  dragOffset: Point | null;
}

export interface UseVisualEditingOptions {
  snapThreshold?: number;
  enableSnapping?: boolean;
  onPositionChange?: (layerId: string, position: { x: number; y: number }) => void;
  onSizeChange?: (layerId: string, size: { width: number; height: number }) => void;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export interface UseVisualEditingReturn {
  // State
  state: VisualEditingState;
  selectedElement: SelectedElement | null;
  isDragging: boolean;
  isResizing: boolean;
  snapGuides: SnapGuide[];

  // Selection
  selectElement: (element: SelectedElement) => void;
  clearSelection: () => void;

  // Drag operations
  startDrag: (e: React.MouseEvent) => void;
  updateDrag: (e: MouseEvent) => void;
  endDrag: () => void;

  // Resize operations
  startResize: (handle: ResizeHandle, e: React.MouseEvent) => void;
  updateResize: (e: MouseEvent) => void;
  endResize: () => void;

  // Snapping
  enableSnapping: boolean;
  setEnableSnapping: (enabled: boolean) => void;
  snapThreshold: number;
  setSnapThreshold: (px: number) => void;

  // Computed values
  currentRect: SelectionRect | null;
}

const initialState: VisualEditingState = {
  selectedElement: null,
  isDragging: false,
  isResizing: false,
  resizeHandle: null,
  snapGuides: [],
  dragOffset: null,
};

export function useVisualEditing(options: UseVisualEditingOptions = {}): UseVisualEditingReturn {
  const {
    snapThreshold: initialSnapThreshold = 8,
    enableSnapping: initialEnableSnapping = true,
    onPositionChange,
    onSizeChange,
    containerRef,
  } = options;

  const [state, setState] = useState<VisualEditingState>(initialState);
  const [snapThreshold, setSnapThreshold] = useState(initialSnapThreshold);
  const [enableSnapping, setEnableSnapping] = useState(initialEnableSnapping);

  // Store current position during drag/resize
  const currentPositionRef = useRef<{ x: number; y: number } | null>(null);
  const currentSizeRef = useRef<{ width: number; height: number } | null>(null);
  const startPositionRef = useRef<Point | null>(null);
  const startRectRef = useRef<SelectionRect | null>(null);

  // RAF throttling to prevent excessive repaints during drag/resize
  const rafIdRef = useRef<number | null>(null);

  // Cached container bounds to prevent layout thrashing from repeated getBoundingClientRect calls
  const cachedBoundsRef = useRef<DOMRect | null>(null);

  // Selection
  const selectElement = useCallback((element: SelectedElement) => {
    setState((prev) => ({
      ...prev,
      selectedElement: element,
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedElement: null,
      snapGuides: [],
    }));
  }, []);

  // Calculate snap guides based on container bounds and other elements
  const calculateSnapGuides = useCallback(
    (rect: SelectionRect, containerBounds?: DOMRect): SnapGuide[] => {
      if (!enableSnapping) return [];

      const guides: SnapGuide[] = [];
      const containerWidth = containerBounds?.width ?? 1000;
      const containerHeight = containerBounds?.height ?? 800;

      // Snap points for current element
      const elemCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const elemRight = rect.x + rect.width;
      const elemBottom = rect.y + rect.height;

      // Container center guides
      const containerCenterX = containerWidth / 2;
      const containerCenterY = containerHeight / 2;

      // Check vertical center alignment
      if (Math.abs(elemCenter.x - containerCenterX) < snapThreshold) {
        guides.push({
          type: 'vertical',
          position: containerCenterX,
          start: 0,
          end: containerHeight,
        });
      }

      // Check horizontal center alignment
      if (Math.abs(elemCenter.y - containerCenterY) < snapThreshold) {
        guides.push({
          type: 'horizontal',
          position: containerCenterY,
          start: 0,
          end: containerWidth,
        });
      }

      // Edge alignments (left, right, top, bottom to container)
      if (rect.x < snapThreshold) {
        guides.push({
          type: 'vertical',
          position: 0,
          start: rect.y,
          end: rect.y + rect.height,
        });
      }

      if (Math.abs(elemRight - containerWidth) < snapThreshold) {
        guides.push({
          type: 'vertical',
          position: containerWidth,
          start: rect.y,
          end: rect.y + rect.height,
        });
      }

      if (rect.y < snapThreshold) {
        guides.push({
          type: 'horizontal',
          position: 0,
          start: rect.x,
          end: rect.x + rect.width,
        });
      }

      if (Math.abs(elemBottom - containerHeight) < snapThreshold) {
        guides.push({
          type: 'horizontal',
          position: containerHeight,
          start: rect.x,
          end: rect.x + rect.width,
        });
      }

      return guides;
    },
    [enableSnapping, snapThreshold]
  );

  // Apply snapping to position
  const applySnapping = useCallback(
    (rect: SelectionRect, containerBounds?: DOMRect): SelectionRect => {
      if (!enableSnapping) return rect;

      const containerWidth = containerBounds?.width ?? 1000;
      const containerHeight = containerBounds?.height ?? 800;

      let { x, y } = rect;
      const { width, height } = rect;

      // Snap to container center
      const centerX = containerWidth / 2;
      const centerY = containerHeight / 2;
      const elemCenterX = x + width / 2;
      const elemCenterY = y + height / 2;

      if (Math.abs(elemCenterX - centerX) < snapThreshold) {
        x = centerX - width / 2;
      }

      if (Math.abs(elemCenterY - centerY) < snapThreshold) {
        y = centerY - height / 2;
      }

      // Snap to edges
      if (x < snapThreshold) x = 0;
      if (y < snapThreshold) y = 0;
      if (Math.abs(x + width - containerWidth) < snapThreshold) {
        x = containerWidth - width;
      }
      if (Math.abs(y + height - containerHeight) < snapThreshold) {
        y = containerHeight - height;
      }

      return { x, y, width, height };
    },
    [enableSnapping, snapThreshold]
  );

  // Drag operations
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!state.selectedElement?.isAbsolute) return;

      const rect = state.selectedElement.rect;
      startPositionRef.current = { x: e.clientX, y: e.clientY };
      startRectRef.current = { ...rect };
      currentPositionRef.current = { x: rect.x, y: rect.y };

      // Cache container bounds at drag start to avoid repeated layout calculations
      cachedBoundsRef.current = containerRef?.current?.getBoundingClientRect() ?? null;

      setState((prev) => ({
        ...prev,
        isDragging: true,
        dragOffset: {
          x: e.clientX - rect.x,
          y: e.clientY - rect.y,
        },
      }));
    },
    [state.selectedElement, containerRef]
  );

  const updateDrag = useCallback(
    (e: MouseEvent) => {
      if (!state.isDragging || !startPositionRef.current || !startRectRef.current) return;

      // Skip if a RAF is already pending (throttle to ~60fps max)
      if (rafIdRef.current !== null) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;

        // Guard against stale closure - re-check refs
        if (!startPositionRef.current || !startRectRef.current) return;

        const deltaX = e.clientX - startPositionRef.current.x;
        const deltaY = e.clientY - startPositionRef.current.y;

        const newX = startRectRef.current.x + deltaX;
        const newY = startRectRef.current.y + deltaY;

        // Use cached bounds instead of calling getBoundingClientRect on every frame
        const containerBounds = cachedBoundsRef.current ?? undefined;

        // Create new rect and apply snapping
        let newRect: SelectionRect = {
          x: newX,
          y: newY,
          width: startRectRef.current.width,
          height: startRectRef.current.height,
        };

        newRect = applySnapping(newRect, containerBounds);
        const guides = calculateSnapGuides(newRect, containerBounds);

        currentPositionRef.current = { x: newRect.x, y: newRect.y };

        setState((prev) => ({
          ...prev,
          snapGuides: guides,
          selectedElement: prev.selectedElement
            ? {
                ...prev.selectedElement,
                rect: newRect,
              }
            : null,
        }));
      });
    },
    [state.isDragging, applySnapping, calculateSnapGuides]
  );

  const endDrag = useCallback(() => {
    // Cancel any pending RAF to prevent state updates after drag ends
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (state.isDragging && state.selectedElement && currentPositionRef.current) {
      onPositionChange?.(state.selectedElement.layerId, currentPositionRef.current);
    }

    startPositionRef.current = null;
    startRectRef.current = null;
    currentPositionRef.current = null;
    cachedBoundsRef.current = null;

    setState((prev) => ({
      ...prev,
      isDragging: false,
      dragOffset: null,
      snapGuides: [],
    }));
  }, [state.isDragging, state.selectedElement, onPositionChange]);

  // Resize operations
  const startResize = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent) => {
      if (!state.selectedElement?.isAbsolute) return;

      const rect = state.selectedElement.rect;
      startPositionRef.current = { x: e.clientX, y: e.clientY };
      startRectRef.current = { ...rect };
      currentSizeRef.current = { width: rect.width, height: rect.height };
      currentPositionRef.current = { x: rect.x, y: rect.y };

      // Cache container bounds at resize start to avoid repeated layout calculations
      cachedBoundsRef.current = containerRef?.current?.getBoundingClientRect() ?? null;

      setState((prev) => ({
        ...prev,
        isResizing: true,
        resizeHandle: handle,
      }));
    },
    [state.selectedElement, containerRef]
  );

  const updateResize = useCallback(
    (e: MouseEvent) => {
      if (
        !state.isResizing ||
        !state.resizeHandle ||
        !startPositionRef.current ||
        !startRectRef.current
      ) {
        return;
      }

      // Skip if a RAF is already pending (throttle to ~60fps max)
      if (rafIdRef.current !== null) return;

      // Capture values for RAF callback
      const handle = state.resizeHandle;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;

        // Guard against stale closure - re-check refs
        if (!startPositionRef.current || !startRectRef.current) return;

        const deltaX = e.clientX - startPositionRef.current.x;
        const deltaY = e.clientY - startPositionRef.current.y;
        const startRect = startRectRef.current;

        let newX = startRect.x;
        let newY = startRect.y;
        let newWidth = startRect.width;
        let newHeight = startRect.height;

        // Calculate new dimensions based on which handle is being dragged
        switch (handle) {
          case 'n':
            newY = startRect.y + deltaY;
            newHeight = startRect.height - deltaY;
            break;
          case 's':
            newHeight = startRect.height + deltaY;
            break;
          case 'e':
            newWidth = startRect.width + deltaX;
            break;
          case 'w':
            newX = startRect.x + deltaX;
            newWidth = startRect.width - deltaX;
            break;
          case 'nw':
            newX = startRect.x + deltaX;
            newY = startRect.y + deltaY;
            newWidth = startRect.width - deltaX;
            newHeight = startRect.height - deltaY;
            break;
          case 'ne':
            newY = startRect.y + deltaY;
            newWidth = startRect.width + deltaX;
            newHeight = startRect.height - deltaY;
            break;
          case 'se':
            newWidth = startRect.width + deltaX;
            newHeight = startRect.height + deltaY;
            break;
          case 'sw':
            newX = startRect.x + deltaX;
            newWidth = startRect.width - deltaX;
            newHeight = startRect.height + deltaY;
            break;
        }

        // Enforce minimum size
        const minSize = 20;
        if (newWidth < minSize) {
          if (handle.includes('w')) {
            newX = startRect.x + startRect.width - minSize;
          }
          newWidth = minSize;
        }
        if (newHeight < minSize) {
          if (handle.includes('n')) {
            newY = startRect.y + startRect.height - minSize;
          }
          newHeight = minSize;
        }

        // Use cached bounds instead of calling getBoundingClientRect on every frame
        const containerBounds = cachedBoundsRef.current ?? undefined;
        let newRect: SelectionRect = { x: newX, y: newY, width: newWidth, height: newHeight };
        newRect = applySnapping(newRect, containerBounds);
        const guides = calculateSnapGuides(newRect, containerBounds);

        currentPositionRef.current = { x: newRect.x, y: newRect.y };
        currentSizeRef.current = { width: newRect.width, height: newRect.height };

        setState((prev) => ({
          ...prev,
          snapGuides: guides,
          selectedElement: prev.selectedElement
            ? {
                ...prev.selectedElement,
                rect: newRect,
              }
            : null,
        }));
      });
    },
    [state.isResizing, state.resizeHandle, applySnapping, calculateSnapGuides]
  );

  const endResize = useCallback(() => {
    // Cancel any pending RAF to prevent state updates after resize ends
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (state.isResizing && state.selectedElement) {
      if (currentPositionRef.current) {
        onPositionChange?.(state.selectedElement.layerId, currentPositionRef.current);
      }
      if (currentSizeRef.current) {
        onSizeChange?.(state.selectedElement.layerId, currentSizeRef.current);
      }
    }

    startPositionRef.current = null;
    startRectRef.current = null;
    currentPositionRef.current = null;
    currentSizeRef.current = null;
    cachedBoundsRef.current = null;

    setState((prev) => ({
      ...prev,
      isResizing: false,
      resizeHandle: null,
      snapGuides: [],
    }));
  }, [state.isResizing, state.selectedElement, onPositionChange, onSizeChange]);

  // Global mouse event listeners for drag/resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (state.isDragging) {
        updateDrag(e);
      } else if (state.isResizing) {
        updateResize(e);
      }
    };

    const handleMouseUp = (): void => {
      if (state.isDragging) {
        endDrag();
      } else if (state.isResizing) {
        endResize();
      }
    };

    if (state.isDragging || state.isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [state.isDragging, state.isResizing, updateDrag, updateResize, endDrag, endResize]);

  // Cleanup RAF on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Compute current rect (accounts for drag/resize in progress)
  const currentRect = state.selectedElement?.rect ?? null;

  return {
    state,
    selectedElement: state.selectedElement,
    isDragging: state.isDragging,
    isResizing: state.isResizing,
    snapGuides: state.snapGuides,

    selectElement,
    clearSelection,

    startDrag,
    updateDrag,
    endDrag,

    startResize,
    updateResize,
    endResize,

    enableSnapping,
    setEnableSnapping,
    snapThreshold,
    setSnapThreshold,

    currentRect,
  };
}
