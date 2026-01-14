import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ReactElementContext } from '@/types/protocol';

const logger = createLogger('BrowserStore');

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
  /** URL to navigate to after browser is created (for AI-initiated browser:open) */
  pendingNavigationUrl: string | null;

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
  /** Set pending navigation URL (for AI-initiated browser:open before browser is created) */
  setPendingNavigationUrl: (url: string | null) => void;

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

// Restore browser state from localStorage (survives webview reloads)
const getPersistedState = (): Partial<BrowserState> => {
  try {
    const viewId = localStorage.getItem('orbit-browser-viewId');
    const isActive = localStorage.getItem('orbit-browser-isActive') === 'true';
    return {
      viewId: viewId ?? null,
      isActive: viewId !== null && isActive,
    };
  } catch {
    return {};
  }
};

// Clean initial state (used by reset)
const cleanInitialState: BrowserState = {
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
  pendingNavigationUrl: null,
  isSelectingElement: false,
  selectedElement: null,
  elementContexts: [],
  error: null,
};

// Hydrated initial state (used on first load, includes persisted values)
const persistedState = getPersistedState();
const initialState: BrowserState = {
  ...cleanInitialState,
  viewId: persistedState.viewId ?? null,
  isActive: persistedState.isActive ?? false,
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
      logger.info(`Browser view ${viewId ? 'created' : 'destroyed'}`, { viewId });
      set((state) => {
        state.viewId = viewId;
        state.isCreating = false;
        state.isActive = viewId !== null;
      });
      // Persist to localStorage to survive webview reloads
      try {
        if (viewId !== null) {
          localStorage.setItem('orbit-browser-viewId', viewId);
          localStorage.setItem('orbit-browser-isActive', 'true');
        } else {
          localStorage.removeItem('orbit-browser-viewId');
          localStorage.removeItem('orbit-browser-isActive');
        }
      } catch {
        // Ignore storage errors
      }
    },

    setActive: (isActive: boolean): void => {
      set((state) => {
        state.isActive = isActive;
      });
      // Persist to localStorage
      try {
        localStorage.setItem('orbit-browser-isActive', String(isActive));
      } catch {
        // Ignore storage errors
      }
    },

    reset: (): void => {
      // Use clean state, not the hydrated initialState (which has persisted values)
      set(() => cleanInitialState);
      // Clear persisted state
      try {
        localStorage.removeItem('orbit-browser-viewId');
        localStorage.removeItem('orbit-browser-isActive');
      } catch {
        // Ignore storage errors
      }
    },

    setNavigation: (navigation: Partial<NavigationState>): void => {
      if (navigation.url) {
        logger.debug(`Browser navigated to: ${navigation.url}`);
      }
      set((state) => {
        state.navigation = { ...state.navigation, ...navigation };
      });
    },

    setLoading: (isLoading: boolean): void => {
      set((state) => {
        state.navigation.isLoading = isLoading;
      });
    },

    setPendingNavigationUrl: (url: string | null): void => {
      set((state) => {
        state.pendingNavigationUrl = url;
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
          const exists = state.elementContexts.some((ctx) => ctx.selector === element.selector);
          if (!exists) {
            state.elementContexts.push(element);
          }
        }
      });
    },

    addElementContext: (element: ReactElementContext): void => {
      set((state) => {
        // Avoid duplicates by checking selector (unique CSS path to element)
        const exists = state.elementContexts.some((ctx) => ctx.selector === element.selector);
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

export const usePendingNavigationUrl = (): string | null => {
  return useBrowserStore((state) => state.pendingNavigationUrl);
};
