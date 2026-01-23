/**
 * CSS Customization Store
 *
 * Manages CSS property overrides for live component preview.
 * Changes are reflected immediately in the preview via CSS injection.
 *
 * Features:
 * - Live CSS overrides for instant preview
 * - Persistence tracking (which properties have been saved to source)
 * - Undo stack (max 10 entries) for reverting changes
 * - Debounced updates for expensive operations
 */

import { useMemo, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';

import type { StyleChange } from '@canvas/lib/ast';

// ============================================
// Types
// ============================================

/**
 * CSS property categories for organization
 */
export type CSSCategory = 'typography' | 'colors' | 'spacing' | 'border' | 'effects';

/**
 * Individual CSS property definition
 */
export interface CSSProperty {
  name: string;
  label: string;
  category: CSSCategory;
  type: 'color' | 'size' | 'select' | 'number' | 'text';
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue: string;
}

/**
 * Entry in the undo stack for reverting changes
 */
export interface UndoEntry {
  /** Component name that was modified */
  componentName: string;
  /** Type of component (ui or custom) */
  componentType: 'ui' | 'custom';
  /** Original file content before transformation */
  previousContent: string;
  /** Style changes that were applied */
  changes: StyleChange[];
  /** Timestamp when the change was made */
  timestamp: number;
  /** Path to the backup file */
  backupPath: string;
}

/**
 * Store state
 */
interface CSSCustomizationState {
  /** Current CSS overrides (not yet persisted) */
  overrides: Record<string, string>;
  /** Whether user has made any changes */
  hasChanges: boolean;
  /** Properties that have been persisted to source code */
  persistedProperties: Set<string>;
  /** Undo stack for reverting changes (max 10 entries) */
  undoStack: UndoEntry[];
}

/**
 * Store actions
 */
interface CSSCustomizationActions {
  /** Set a CSS property value (immediate) */
  setProperty: (property: string, value: string) => void;
  /** Reset a single property to default */
  resetProperty: (property: string) => void;
  /** Reset all properties */
  resetAll: () => void;
  /** Get all overrides as CSS object */
  getOverrides: () => Record<string, string>;
  /** Mark a property as persisted (removes from overrides) */
  markPropertyPersisted: (property: string) => void;
  /** Mark multiple properties as persisted */
  markPropertiesPersisted: (properties: string[]) => void;
  /** Clear all persisted property tracking */
  clearPersistedOverrides: () => void;
  /** Check if there are unsaved changes */
  hasUnsavedChanges: () => boolean;
  /** Push an undo entry onto the stack */
  pushUndo: (entry: UndoEntry) => void;
  /** Pop and return the most recent undo entry */
  popUndo: () => UndoEntry | undefined;
  /** Check if undo is available */
  canUndo: () => boolean;
  /** Get the current undo stack (read-only) */
  getUndoStack: () => readonly UndoEntry[];
}

export type CSSCustomizationStore = CSSCustomizationState & CSSCustomizationActions;

// ============================================
// Constants
// ============================================

/** Maximum number of undo entries to keep */
const MAX_UNDO_STACK_SIZE = 10;

// ============================================
// CSS Property Definitions
// ============================================

export const CSS_PROPERTIES: CSSProperty[] = [
  // Typography
  {
    name: 'fontSize',
    label: 'Font Size',
    category: 'typography',
    type: 'size',
    unit: 'px',
    min: 8,
    max: 72,
    step: 1,
    defaultValue: '14',
  },
  {
    name: 'fontWeight',
    label: 'Font Weight',
    category: 'typography',
    type: 'select',
    options: ['300', '400', '500', '600', '700', '800'],
    defaultValue: '500',
  },
  {
    name: 'fontFamily',
    label: 'Font Family',
    category: 'typography',
    type: 'select',
    options: ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'system-ui'],
    defaultValue: 'system-ui',
  },
  {
    name: 'letterSpacing',
    label: 'Letter Spacing',
    category: 'typography',
    type: 'size',
    unit: 'px',
    min: -2,
    max: 10,
    step: 0.5,
    defaultValue: '0',
  },

  // Colors
  {
    name: 'color',
    label: 'Text Color',
    category: 'colors',
    type: 'color',
    defaultValue: '#000000',
  },
  {
    name: 'backgroundColor',
    label: 'Background',
    category: 'colors',
    type: 'color',
    defaultValue: '#ffffff',
  },

  // Spacing
  {
    name: 'padding',
    label: 'Padding',
    category: 'spacing',
    type: 'size',
    unit: 'px',
    min: 0,
    max: 64,
    step: 1,
    defaultValue: '16',
  },
  {
    name: 'margin',
    label: 'Margin',
    category: 'spacing',
    type: 'size',
    unit: 'px',
    min: 0,
    max: 64,
    step: 1,
    defaultValue: '0',
  },
  {
    name: 'gap',
    label: 'Gap',
    category: 'spacing',
    type: 'size',
    unit: 'px',
    min: 0,
    max: 32,
    step: 1,
    defaultValue: '8',
  },

  // Border
  {
    name: 'borderRadius',
    label: 'Border Radius',
    category: 'border',
    type: 'size',
    unit: 'px',
    min: 0,
    max: 32,
    step: 1,
    defaultValue: '6',
  },
  {
    name: 'borderWidth',
    label: 'Border Width',
    category: 'border',
    type: 'size',
    unit: 'px',
    min: 0,
    max: 8,
    step: 1,
    defaultValue: '1',
  },
  {
    name: 'borderColor',
    label: 'Border Color',
    category: 'border',
    type: 'color',
    defaultValue: '#e5e7eb',
  },
  {
    name: 'borderStyle',
    label: 'Border Style',
    category: 'border',
    type: 'select',
    options: ['none', 'solid', 'dashed', 'dotted'],
    defaultValue: 'solid',
  },

  // Effects
  {
    name: 'opacity',
    label: 'Opacity',
    category: 'effects',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: '1',
  },
  {
    name: 'boxShadow',
    label: 'Shadow',
    category: 'effects',
    type: 'select',
    options: [
      'none',
      '0 1px 2px rgba(0,0,0,0.05)',
      '0 4px 6px rgba(0,0,0,0.1)',
      '0 10px 15px rgba(0,0,0,0.1)',
    ],
    defaultValue: 'none',
  },
];

/**
 * Index Map for O(1) property lookups by name.
 * Built once at module load time for performance (rule: js-index-maps).
 */
const CSS_PROPERTIES_BY_NAME = new Map(CSS_PROPERTIES.map((p) => [p.name, p]));

/**
 * Get CSS properties by category
 */
export function getPropertiesByCategory(category: CSSCategory): CSSProperty[] {
  return CSS_PROPERTIES.filter((p) => p.category === category);
}

/**
 * Get a CSS property definition by name
 */
export function getPropertyByName(name: string): CSSProperty | undefined {
  return CSS_PROPERTIES_BY_NAME.get(name);
}

// ============================================
// Store
// ============================================

export const useCSSCustomizationStore = create<CSSCustomizationStore>()(
  immer((set, get) => ({
    overrides: {},
    hasChanges: false,
    persistedProperties: new Set<string>(),
    undoStack: [],

    setProperty: (property: string, value: string): void => {
      set((state) => {
        state.overrides[property] = value;
        state.hasChanges = Object.keys(state.overrides).length > 0;
      });
    },

    resetProperty: (property: string): void => {
      set((state) => {
        state.overrides = Object.fromEntries(
          Object.entries(state.overrides).filter(([key]) => key !== property)
        );
        state.hasChanges = Object.keys(state.overrides).length > 0;
      });
    },

    resetAll: (): void => {
      set((state) => {
        state.overrides = {};
        state.hasChanges = false;
      });
    },

    getOverrides: (): Record<string, string> => {
      const { overrides } = get();
      const cssOverrides: Record<string, string> = {};

      for (const [property, value] of Object.entries(overrides)) {
        // O(1) lookup via index Map (rule: js-index-maps)
        const propDef = CSS_PROPERTIES_BY_NAME.get(property);
        if (propDef?.unit && !value.includes(propDef.unit)) {
          cssOverrides[property] = `${value}${propDef.unit}`;
        } else {
          cssOverrides[property] = value;
        }
      }

      return cssOverrides;
    },

    markPropertyPersisted: (property: string): void => {
      set((state) => {
        // Add to persisted set
        state.persistedProperties.add(property);
        // Remove from current overrides (it's now in the source)
        state.overrides = Object.fromEntries(
          Object.entries(state.overrides).filter(([key]) => key !== property)
        );
        state.hasChanges = Object.keys(state.overrides).length > 0;
      });
    },

    markPropertiesPersisted: (properties: string[]): void => {
      set((state) => {
        // Add all to persisted set
        for (const property of properties) {
          state.persistedProperties.add(property);
        }
        // Remove from current overrides
        const propertySet = new Set(properties);
        state.overrides = Object.fromEntries(
          Object.entries(state.overrides).filter(([key]) => !propertySet.has(key))
        );
        state.hasChanges = Object.keys(state.overrides).length > 0;
      });
    },

    clearPersistedOverrides: (): void => {
      set((state) => {
        state.persistedProperties = new Set();
      });
    },

    hasUnsavedChanges: (): boolean => {
      return Object.keys(get().overrides).length > 0;
    },

    pushUndo: (entry: UndoEntry): void => {
      set((state) => {
        state.undoStack.push(entry);
        // Keep stack at max size
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) {
          state.undoStack.shift();
        }
      });
    },

    popUndo: (): UndoEntry | undefined => {
      const { undoStack } = get();
      if (undoStack.length === 0) return undefined;

      let popped: UndoEntry | undefined;
      set((state) => {
        popped = state.undoStack.pop();
      });
      return popped;
    },

    canUndo: (): boolean => {
      return get().undoStack.length > 0;
    },

    getUndoStack: (): readonly UndoEntry[] => {
      return get().undoStack;
    },
  }))
);

// ============================================
// Selector Hooks
// ============================================

/**
 * Get current CSS overrides for preview
 * Uses useShallow + useMemo to prevent infinite re-renders
 */
export function useCSSOverrides(): Record<string, string> {
  const overrides = useCSSCustomizationStore(useShallow((state) => state.overrides));

  // Memoize the computed result with units added
  // Uses O(1) Map lookup instead of O(n) find (rule: js-index-maps)
  return useMemo(() => {
    const result: Record<string, string> = {};
    for (const [property, value] of Object.entries(overrides)) {
      const propDef = CSS_PROPERTIES_BY_NAME.get(property);
      if (propDef?.unit && !value.includes(propDef.unit)) {
        result[property] = `${value}${propDef.unit}`;
      } else {
        result[property] = value;
      }
    }
    return result;
  }, [overrides]);
}

/**
 * Check if user has made changes
 */
export function useHasChanges(): boolean {
  return useCSSCustomizationStore((state) => state.hasChanges);
}

/**
 * Get persisted property count
 */
export function usePersistedPropertyCount(): number {
  return useCSSCustomizationStore((state) => state.persistedProperties.size);
}

/**
 * Check if undo is available
 */
export function useCanUndo(): boolean {
  return useCSSCustomizationStore((state) => state.undoStack.length > 0);
}

/**
 * Hook for debounced CSS property updates
 *
 * Use this for sliders and other inputs that fire rapidly.
 * Uses 16ms debounce (one animation frame) to batch updates.
 *
 * @example
 * const { setDebounced, setImmediate } = useDebouncedCSSUpdate();
 *
 * // For sliders (debounced)
 * <Slider onChange={(value) => setDebounced('borderRadius', value)} />
 *
 * // For buttons/selects (immediate)
 * <Select onChange={(value) => setImmediate('borderStyle', value)} />
 */
export function useDebouncedCSSUpdate(): {
  setDebounced: (property: string, value: string) => void;
  setImmediate: (property: string, value: string) => void;
} {
  const setProperty = useCSSCustomizationStore((state) => state.setProperty);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, string>>({});

  const setDebounced = useCallback(
    (property: string, value: string) => {
      // Accumulate pending changes
      pendingRef.current[property] = value;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Schedule flush after 16ms (one animation frame)
      timeoutRef.current = setTimeout(() => {
        const pending = pendingRef.current;
        pendingRef.current = {};

        // Apply all pending changes
        for (const [prop, val] of Object.entries(pending)) {
          setProperty(prop, val);
        }
      }, 16);
    },
    [setProperty]
  );

  const setImmediate = useCallback(
    (property: string, value: string) => {
      // Clear any pending debounced update for this property
      Reflect.deleteProperty(pendingRef.current, property);
      setProperty(property, value);
    },
    [setProperty]
  );

  return { setDebounced, setImmediate };
}
