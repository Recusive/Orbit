import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { NavigationSnapshot } from '@/lib/navigation/apply-snapshot';

import { applySnapshot } from '@/lib/navigation/apply-snapshot';

const MAX_HISTORY_LENGTH = 100;

interface NavigationState {
  history: NavigationSnapshot[];
  currentIndex: number;
}

interface NavigationActions {
  pushSnapshot: (snapshot: NavigationSnapshot) => void;
  goBack: () => void;
  goForward: () => void;
  clearHistory: () => void;
}

type NavigationStore = NavigationState & NavigationActions;

const initialState: NavigationState = {
  history: [],
  currentIndex: -1,
};

export const useNavigationStore = create<NavigationStore>()(
  immer((set, get) => ({
    ...initialState,

    pushSnapshot: (snapshot): void => {
      set((state) => {
        state.history = state.history.slice(0, state.currentIndex + 1);
        state.history.push(snapshot);

        if (state.history.length > MAX_HISTORY_LENGTH) {
          state.history = state.history.slice(-MAX_HISTORY_LENGTH);
        }

        state.currentIndex = state.history.length - 1;
      });
    },

    goBack: (): void => {
      const { currentIndex, history } = get();
      if (currentIndex <= 0) {
        return;
      }

      const nextIndex = currentIndex - 1;
      const snapshot = history[nextIndex];
      if (!snapshot) {
        return;
      }

      set((state) => {
        state.currentIndex = nextIndex;
      });

      applySnapshot(snapshot);
    },

    goForward: (): void => {
      const { currentIndex, history } = get();
      if (currentIndex < 0 || currentIndex >= history.length - 1) {
        return;
      }

      const nextIndex = currentIndex + 1;
      const snapshot = history[nextIndex];
      if (!snapshot) {
        return;
      }

      set((state) => {
        state.currentIndex = nextIndex;
      });

      applySnapshot(snapshot);
    },

    clearHistory: (): void => {
      set((state) => {
        state.history = [];
        state.currentIndex = -1;
      });
    },
  }))
);

export const useCanGoBack = (): boolean => {
  return useNavigationStore((state) => state.currentIndex > 0);
};

export const useCanGoForward = (): boolean => {
  return useNavigationStore((state) => {
    return state.currentIndex >= 0 && state.currentIndex < state.history.length - 1;
  });
};
