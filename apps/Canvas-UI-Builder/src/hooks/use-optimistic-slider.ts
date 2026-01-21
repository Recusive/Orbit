/**
 * useOptimisticSlider - Fluid slider updates with optimistic UI
 *
 * Provides instant visual feedback while batching store updates.
 * The slider thumb moves immediately (local state), while expensive
 * preview updates are batched via requestAnimationFrame for smooth 60fps dragging.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface UseOptimisticSliderResult {
  /** Current value for the slider (updates instantly) */
  localValue: string;
  /** Handler for slider drag - instant visual + RAF-batched store update */
  handleSliderChange: (value: string) => void;
  /** Handler for number input - immediate store update */
  handleInputChange: (value: string) => void;
}

/**
 * Hook for optimistic slider updates.
 *
 * @param storeValue - Current value from the store
 * @param defaultValue - Default value when store value is empty
 * @param onDebouncedChange - Called on RAF tick when slider is dragged
 * @param onImmediateChange - Called immediately when number input changes
 */
export function useOptimisticSlider(
  storeValue: string,
  defaultValue: string,
  onDebouncedChange?: (value: string) => void,
  onImmediateChange?: (value: string) => void
): UseOptimisticSliderResult {
  const [localValue, setLocalValue] = useState(storeValue || defaultValue);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<string | null>(null);

  // Sync local state when store changes externally (e.g., reset button)
  useLayoutEffect(() => {
    setLocalValue(storeValue || defaultValue);
  }, [storeValue, defaultValue]);

  // Slider drag - instant visual update + RAF-batched store update
  const handleSliderChange = useCallback(
    (value: string): void => {
      setLocalValue(value);
      pendingValueRef.current = value;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const pending = pendingValueRef.current;
        if (pending !== null && onDebouncedChange) {
          onDebouncedChange(pending);
        }
        pendingValueRef.current = null;
        rafRef.current = null;
      });
    },
    [onDebouncedChange]
  );

  // Number input - immediate store update
  const handleInputChange = useCallback(
    (value: string): void => {
      setLocalValue(value);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingValueRef.current = null;
      if (onImmediateChange) {
        onImmediateChange(value);
      }
    },
    [onImmediateChange]
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { localValue, handleSliderChange, handleInputChange };
}
