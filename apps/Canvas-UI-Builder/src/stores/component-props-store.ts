/**
 * Component Props Store
 *
 * Manages React component props for live preview.
 * Props are component-specific (variant, size, disabled, etc.)
 * and separate from CSS styling overrides.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';

// ============================================
// Types
// ============================================

/**
 * Store state
 */
interface ComponentPropsState {
  /** Props keyed by component name, then by prop name */
  propsByComponent: Record<string, Record<string, unknown>>;
  /** Currently selected component name */
  selectedComponent: string | null;
}

/**
 * Store actions
 */
interface ComponentPropsActions {
  /** Set the selected component */
  setSelectedComponent: (componentName: string | null) => void;
  /** Set a single prop for the selected component */
  setProp: (propName: string, value: unknown) => void;
  /** Set multiple props for the selected component */
  setProps: (props: Record<string, unknown>) => void;
  /** Reset a single prop to undefined (will use default) */
  resetProp: (propName: string) => void;
  /** Reset all props for the selected component */
  resetComponentProps: () => void;
  /** Reset all props for all components */
  resetAll: () => void;
  /** Get props for a specific component */
  getPropsForComponent: (componentName: string) => Record<string, unknown>;
}

export type ComponentPropsStore = ComponentPropsState & ComponentPropsActions;

// ============================================
// Store
// ============================================

export const useComponentPropsStore = create<ComponentPropsStore>()(
  immer((set, get) => ({
    propsByComponent: {},
    selectedComponent: null,

    setSelectedComponent: (componentName: string | null): void => {
      set((state) => {
        state.selectedComponent = componentName;
        // Initialize props object for component if it doesn't exist
        if (componentName && !state.propsByComponent[componentName]) {
          state.propsByComponent[componentName] = {};
        }
      });
    },

    setProp: (propName: string, value: unknown): void => {
      set((state) => {
        const component = state.selectedComponent;
        if (!component) return;

        state.propsByComponent[component] ??= {};
        state.propsByComponent[component][propName] = value;
      });
    },

    setProps: (props: Record<string, unknown>): void => {
      set((state) => {
        const component = state.selectedComponent;
        if (!component) return;

        state.propsByComponent[component] = {
          ...state.propsByComponent[component],
          ...props,
        };
      });
    },

    resetProp: (propName: string): void => {
      set((state) => {
        const component = state.selectedComponent;
        if (!component || !state.propsByComponent[component]) return;

        state.propsByComponent[component] = Object.fromEntries(
          Object.entries(state.propsByComponent[component]).filter(([key]) => key !== propName)
        );
      });
    },

    resetComponentProps: (): void => {
      set((state) => {
        const component = state.selectedComponent;
        if (!component) return;
        state.propsByComponent[component] = {};
      });
    },

    resetAll: (): void => {
      set((state) => {
        state.propsByComponent = {};
      });
    },

    getPropsForComponent: (componentName: string): Record<string, unknown> => {
      return get().propsByComponent[componentName] ?? {};
    },
  }))
);

// ============================================
// Selector Hooks
// ============================================

/**
 * Get props for the currently selected component
 * Uses useShallow to prevent unnecessary re-renders
 */
export function useSelectedComponentProps(): Record<string, unknown> {
  const { selectedComponent, propsByComponent } = useComponentPropsStore(
    useShallow((state) => ({
      selectedComponent: state.selectedComponent,
      propsByComponent: state.propsByComponent,
    }))
  );

  return useMemo(() => {
    if (!selectedComponent) return {};
    return propsByComponent[selectedComponent] ?? {};
  }, [selectedComponent, propsByComponent]);
}

/**
 * Get the currently selected component name
 */
export function useSelectedComponent(): string | null {
  return useComponentPropsStore((state) => state.selectedComponent);
}

/**
 * Check if the selected component has any props set
 */
export function useHasComponentProps(): boolean {
  const props = useSelectedComponentProps();
  return Object.keys(props).length > 0;
}
