/**
 * useSectionState
 *
 * Hook for persisting section collapse states to localStorage.
 * Provides a consistent UX where sections remember their state.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'orbit-canvas-section-states';

type SectionStates = Record<string, boolean>;

// Default section states
const defaultStates: SectionStates = {
  position: true, // Open by default
  layout: false,
  appearance: false,
  text: false,
  fill: false,
  stroke: false,
  effects: false,
  constraints: false,
  export: false,
};

/**
 * Load section states from localStorage
 */
function loadStates(): SectionStates {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SectionStates;
      return { ...defaultStates, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return defaultStates;
}

/**
 * Save section states to localStorage
 */
function saveStates(states: SectionStates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Hook for managing section collapse states with persistence
 */
export function useSectionState(sectionId: string, defaultOpen?: boolean): [boolean, () => void] {
  const [states, setStates] = useState<SectionStates>(loadStates);

  // Get current state for this section
  const isOpen = states[sectionId] ?? defaultOpen ?? defaultStates[sectionId] ?? false;

  // Toggle section state
  const toggle = useCallback(() => {
    setStates((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveStates(next);
      return next;
    });
  }, [sectionId]);

  return [isOpen, toggle];
}

/**
 * Hook for managing all section states at once
 */
export function useAllSectionStates(): {
  states: SectionStates;
  toggle: (sectionId: string) => void;
  setOpen: (sectionId: string, open: boolean) => void;
  expandAll: () => void;
  collapseAll: () => void;
  reset: () => void;
} {
  const [states, setStates] = useState<SectionStates>(loadStates);

  const toggle = useCallback((sectionId: string) => {
    setStates((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveStates(next);
      return next;
    });
  }, []);

  const setOpen = useCallback((sectionId: string, open: boolean) => {
    setStates((prev) => {
      if (prev[sectionId] === open) return prev;
      const next = { ...prev, [sectionId]: open };
      saveStates(next);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const next = Object.keys(states).reduce<SectionStates>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    saveStates(next);
    setStates(next);
  }, [states]);

  const collapseAll = useCallback(() => {
    const next = Object.keys(states).reduce<SectionStates>((acc, key) => {
      acc[key] = false;
      return acc;
    }, {});
    saveStates(next);
    setStates(next);
  }, [states]);

  const reset = useCallback(() => {
    saveStates(defaultStates);
    setStates(defaultStates);
  }, []);

  return { states, toggle, setOpen, expandAll, collapseAll, reset };
}

export default useSectionState;
