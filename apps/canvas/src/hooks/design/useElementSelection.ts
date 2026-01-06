/**
 * useElementSelection - Hook to listen for element selection events from preview nodes
 *
 * Listens for 'orbit:element-selected' custom events and provides state for:
 * - The currently selected element data
 * - The nodeId of the preview node containing the element
 */
import { useCallback, useEffect, useState } from 'react';

export interface SelectedElementData {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  rect: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  path: string;
  /** JSX path for structural editing (e.g., "0.1.2" = index path from root) */
  jsxPath: string;
}

export interface ElementSelection {
  nodeId: string;
  element: SelectedElementData;
}

interface UseElementSelectionResult {
  /** Currently selected element, or null if none */
  selection: ElementSelection | null;
  /** Clear the current selection */
  clearSelection: () => void;
}

/**
 * Hook to track element selection from preview nodes
 */
export function useElementSelection(): UseElementSelectionResult {
  const [selection, setSelection] = useState<ElementSelection | null>(null);

  useEffect(() => {
    const handleElementSelected = (event: Event): void => {
      const customEvent = event as CustomEvent<{
        nodeId: string;
        element: {
          tagName: string;
          className: string;
          id: string;
          textContent: string;
          rect: DOMRect;
          computedStyles: Record<string, string>;
          path: string;
          jsxPath: string;
        };
      }>;

      const { nodeId, element } = customEvent.detail;

      // Convert DOMRect to plain object
      const elementData: SelectedElementData = {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        textContent: element.textContent,
        rect: {
          x: element.rect.x,
          y: element.rect.y,
          width: element.rect.width,
          height: element.rect.height,
        },
        computedStyles: element.computedStyles,
        path: element.path,
        jsxPath: element.jsxPath,
      };

      setSelection({ nodeId, element: elementData });
    };

    window.addEventListener('orbit:element-selected', handleElementSelected);

    return (): void => {
      window.removeEventListener('orbit:element-selected', handleElementSelected);
    };
  }, []);

  const clearSelection = useCallback((): void => {
    setSelection(null);
  }, []);

  return { selection, clearSelection };
}
