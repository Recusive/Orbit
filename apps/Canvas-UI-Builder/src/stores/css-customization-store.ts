/**
 * CSS Customization Store
 *
 * Manages CSS property overrides for live component preview.
 * Changes are reflected immediately in the Sandpack preview.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';

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
 * Store state
 */
interface CSSCustomizationState {
  /** Current CSS overrides */
  overrides: Record<string, string>;
  /** Whether user has made any changes */
  hasChanges: boolean;
}

/**
 * Store actions
 */
interface CSSCustomizationActions {
  /** Set a CSS property value */
  setProperty: (property: string, value: string) => void;
  /** Reset a single property to default */
  resetProperty: (property: string) => void;
  /** Reset all properties */
  resetAll: () => void;
  /** Get all overrides as CSS object */
  getOverrides: () => Record<string, string>;
}

export type CSSCustomizationStore = CSSCustomizationState & CSSCustomizationActions;

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

// ============================================
// Store
// ============================================

export const useCSSCustomizationStore = create<CSSCustomizationStore>()(
  immer((set, get) => ({
    overrides: {},
    hasChanges: false,

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
