/**
 * useKeyboardNavigation
 *
 * Hook for keyboard navigation in the properties panel.
 * Supports Tab navigation between inputs, Enter to confirm,
 * and Escape to blur.
 */

import { useEffect, useRef } from 'react';

interface KeyboardNavigationOptions {
  /** Container element ref */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Called when Escape is pressed */
  onEscape?: () => void;
  /** Called when Enter is pressed */
  onEnter?: () => void;
  /** Whether navigation is enabled */
  enabled?: boolean;
}

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'input:not([disabled])',
    'select:not([disabled])',
    'button:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

/**
 * Hook for keyboard navigation within the properties panel
 */
export function useKeyboardNavigation({
  containerRef,
  onEscape,
  onEnter,
  enabled = true,
}: KeyboardNavigationOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (container === null) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT';

      switch (e.key) {
        case 'Escape':
          // Blur current element
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          onEscape?.();
          break;

        case 'Enter':
          // Confirm current input and move to next
          if (isInput) {
            e.preventDefault();
            const focusable = getFocusableElements(container);
            const currentIndex = focusable.indexOf(target);
            const nextElement = focusable[currentIndex + 1];
            if (nextElement) {
              nextElement.focus();
              if (nextElement.tagName === 'INPUT') {
                (nextElement as HTMLInputElement).select();
              }
            } else {
              target.blur();
            }
            onEnter?.();
          }
          break;

        case 'Tab':
          // Let browser handle Tab, but select text in inputs
          if (!e.shiftKey && isInput) {
            const focusable = getFocusableElements(container);
            const currentIndex = focusable.indexOf(target);
            const nextElement = focusable[currentIndex + 1];
            if (nextElement?.tagName === 'INPUT') {
              // Will be handled after focus
              setTimeout(() => {
                (nextElement as HTMLInputElement).select();
              }, 0);
            }
          }
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, onEscape, onEnter, enabled]);
}

/**
 * Hook for input-specific keyboard handling
 */
export function useInputKeyboard(
  inputRef: React.RefObject<HTMLInputElement | null>,
  options?: {
    onConfirm?: () => void;
    onCancel?: () => void;
    selectOnFocus?: boolean;
  }
): void {
  const { onConfirm, onCancel, selectOnFocus = true } = options ?? {};
  const originalValueRef = useRef<string>('');

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;

    const handleFocus = (): void => {
      originalValueRef.current = input.value;
      if (selectOnFocus) {
        input.select();
      }
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          input.blur();
          onConfirm?.();
          break;

        case 'Escape':
          e.preventDefault();
          input.value = originalValueRef.current;
          input.blur();
          onCancel?.();
          break;

        case 'ArrowUp':
        case 'ArrowDown':
          // Handled by NumberInput
          break;
      }
    };

    input.addEventListener('focus', handleFocus);
    input.addEventListener('keydown', handleKeyDown);

    return () => {
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputRef, onConfirm, onCancel, selectOnFocus]);
}

export default useKeyboardNavigation;
