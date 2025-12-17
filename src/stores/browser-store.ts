import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ReactElementContext } from '@/types/protocol';

// Navigation state from browser
export interface NavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

// Browser session state
interface BrowserState {
  // Session
  viewId: string | null;
  isCreating: boolean;
  isActive: boolean;

  // Navigation
  navigation: NavigationState;

  // Element selection
  isSelectingElement: boolean;
  selectedElement: ReactElementContext | null;

  // Element context for chat input (can have multiple)
  elementContexts: ReactElementContext[];

  // Error state
  error: string | null;
}

interface BrowserActions {
  // Session lifecycle
  setCreating: (isCreating: boolean) => void;
  setViewId: (viewId: string | null) => void;
  setActive: (isActive: boolean) => void;
  reset: () => void;

  // Navigation
  setNavigation: (navigation: Partial<NavigationState>) => void;
  setLoading: (isLoading: boolean) => void;

  // Element selection
  setSelectingElement: (isSelecting: boolean) => void;
  setSelectedElement: (element: ReactElementContext | null) => void;

  // Element context management (for chat input)
  addElementContext: (element: ReactElementContext) => void;
  removeElementContext: (index: number) => void;
  clearElementContexts: () => void;

  // Error handling
  setError: (error: string | null) => void;
}

type BrowserStore = BrowserState & BrowserActions;

const initialState: BrowserState = {
  viewId: null,
  isCreating: false,
  isActive: false,
  navigation: {
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  },
  isSelectingElement: false,
  selectedElement: null,
  elementContexts: [],
  error: null,
};

export const useBrowserStore = create<BrowserStore>()(
  immer((set) => ({
    ...initialState,

    setCreating: (isCreating: boolean): void => {
      set((state) => {
        state.isCreating = isCreating;
        if (isCreating) {
          state.error = null;
        }
      });
    },

    setViewId: (viewId: string | null): void => {
      set((state) => {
        state.viewId = viewId;
        state.isCreating = false;
        state.isActive = viewId !== null;
      });
    },

    setActive: (isActive: boolean): void => {
      set((state) => {
        state.isActive = isActive;
      });
    },

    reset: (): void => {
      set(() => initialState);
    },

    setNavigation: (navigation: Partial<NavigationState>): void => {
      set((state) => {
        state.navigation = { ...state.navigation, ...navigation };
      });
    },

    setLoading: (isLoading: boolean): void => {
      set((state) => {
        state.navigation.isLoading = isLoading;
      });
    },

    setSelectingElement: (isSelecting: boolean): void => {
      set((state) => {
        state.isSelectingElement = isSelecting;
        if (!isSelecting) {
          // Clear selected element when exiting selection mode
          state.selectedElement = null;
        }
      });
    },

    setSelectedElement: (element: ReactElementContext | null): void => {
      set((state) => {
        state.selectedElement = element;
        state.isSelectingElement = false;
        // Auto-add to contexts when selected
        if (element !== null) {
          // Avoid duplicates by checking selector (unique CSS path to element)
          const exists = state.elementContexts.some(
            (ctx) => ctx.selector === element.selector
          );
          if (!exists) {
            state.elementContexts.push(element);
          }
        }
      });
    },

    addElementContext: (element: ReactElementContext): void => {
      set((state) => {
        // Avoid duplicates by checking selector (unique CSS path to element)
        const exists = state.elementContexts.some(
          (ctx) => ctx.selector === element.selector
        );
        if (!exists) {
          state.elementContexts.push(element);
        }
      });
    },

    removeElementContext: (index: number): void => {
      set((state) => {
        state.elementContexts.splice(index, 1);
      });
    },

    clearElementContexts: (): void => {
      set((state) => {
        state.elementContexts = [];
      });
    },

    setError: (error: string | null): void => {
      set((state) => {
        state.error = error;
      });
    },
  }))
);

// Selector hooks for common use cases
export const useBrowserViewId = (): string | null => {
  return useBrowserStore((state) => state.viewId);
};

export const useBrowserIsActive = (): boolean => {
  return useBrowserStore((state) => state.isActive);
};

export const useBrowserNavigation = (): NavigationState => {
  return useBrowserStore((state) => state.navigation);
};

export const useBrowserIsLoading = (): boolean => {
  return useBrowserStore((state) => state.navigation.isLoading);
};

export const useBrowserUrl = (): string => {
  return useBrowserStore((state) => state.navigation.url);
};

export const useIsSelectingElement = (): boolean => {
  return useBrowserStore((state) => state.isSelectingElement);
};

export const useSelectedElement = (): ReactElementContext | null => {
  return useBrowserStore((state) => state.selectedElement);
};

export const useElementContexts = (): ReactElementContext[] => {
  return useBrowserStore((state) => state.elementContexts);
};

export const useBrowserError = (): string | null => {
  return useBrowserStore((state) => state.error);
};
