/**
 * Icon Theme Store
 *
 * Manages the current icon theme selection with O(1) theme lookups
 * and optimized selectors for virtualized component consumption.
 *
 * @module stores/ui/icon-theme-store
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types and Constants
// ============================================================================

/** Supported icon theme identifiers */
export type IconThemeId = 'material' | 'none';

/** How the theme handles dark mode */
export type IconThemeDarkMode = 'invert' | 'variants' | 'none';

/** Metadata for an icon theme */
export interface IconThemeInfo {
  readonly id: IconThemeId;
  readonly name: string;
  readonly description?: string;
  /** Whether this theme is built-in (vs. user-installed) */
  readonly builtin: boolean;
  /** How this theme handles dark mode */
  readonly darkMode: IconThemeDarkMode;
}

/** Default theme to use when no valid theme is stored */
const DEFAULT_THEME: IconThemeId = 'material';

/** Storage key for persisted theme preference */
const STORAGE_KEY = 'orbit-icon-theme';

const logger = createLogger('IconThemeStore');

// ============================================================================
// Theme Registry
// ============================================================================

/**
 * All available icon themes.
 * Add new themes here as they are implemented.
 */
export const AVAILABLE_THEMES: readonly IconThemeInfo[] = [
  {
    id: 'material',
    name: 'Material Icons',
    description: 'Material Design file and folder icons',
    builtin: true,
    darkMode: 'invert',
  },
  {
    id: 'none',
    name: 'No Icons (Test)',
    description: 'Shows generic fallback icons - for testing theme switching',
    builtin: true,
    darkMode: 'none',
  },
] as const;

/**
 * O(1) theme lookup by ID.
 * Frozen at runtime to guarantee reference stability for selectors.
 */
export const THEME_BY_ID: Readonly<Record<IconThemeId, IconThemeInfo>> = Object.freeze(
  AVAILABLE_THEMES.reduce(
    (acc, theme) => {
      acc[theme.id] = theme;
      return acc;
    },
    {} as Record<IconThemeId, IconThemeInfo>
  )
);

/**
 * Type guard to check if a string is a valid IconThemeId
 */
function isValidThemeId(id: unknown): id is IconThemeId {
  return typeof id === 'string' && id in THEME_BY_ID;
}

// ============================================================================
// Store Implementation
// ============================================================================

interface IconThemeState {
  /** Currently selected theme ID */
  currentTheme: IconThemeId;
  /** Pre-computed dark mode strategy for the current theme */
  currentThemeDarkMode: IconThemeDarkMode;
}

interface IconThemeActions {
  /**
   * Set the active icon theme.
   * Falls back to default theme if an invalid ID is provided.
   */
  setTheme: (theme: IconThemeId) => void;
}

export const useIconThemeStore = create<IconThemeState & IconThemeActions>()(
  persist(
    immer((set) => ({
      // Initial state
      currentTheme: DEFAULT_THEME,
      currentThemeDarkMode: THEME_BY_ID[DEFAULT_THEME].darkMode,

      // Actions
      setTheme: (theme: IconThemeId): void => {
        if (!isValidThemeId(theme)) {
          logger.warn('Invalid theme ID provided, falling back to default', {
            provided: theme,
            fallback: DEFAULT_THEME,
          });
          set((state) => {
            state.currentTheme = DEFAULT_THEME;
            state.currentThemeDarkMode = THEME_BY_ID[DEFAULT_THEME].darkMode;
          });
          return;
        }

        logger.debug('Changing icon theme', { from: 'previous', to: theme });
        set((state) => {
          state.currentTheme = theme;
          state.currentThemeDarkMode = THEME_BY_ID[theme].darkMode;
        });
      },
    })),
    {
      name: STORAGE_KEY,
      // Only persist the theme ID, recompute darkMode on rehydration
      partialize: (state) => ({ currentTheme: state.currentTheme }),
      onRehydrateStorage: () => (state, error) => {
        if (error !== undefined) {
          logger.warn('Error rehydrating icon theme store', { error });
          return;
        }

        if (state && !isValidThemeId(state.currentTheme)) {
          logger.warn('Invalid theme ID in storage, resetting to default', {
            stored: state.currentTheme,
            fallback: DEFAULT_THEME,
          });
          state.currentTheme = DEFAULT_THEME;
          state.currentThemeDarkMode = THEME_BY_ID[DEFAULT_THEME].darkMode;
        } else if (state) {
          // Recompute darkMode from the valid stored theme
          state.currentThemeDarkMode = THEME_BY_ID[state.currentTheme].darkMode;
        }
      },
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Selector for the current theme ID.
 * Use with useIconThemeStore for optimized re-renders.
 *
 * @example
 * const themeId = useIconThemeStore(selectIconTheme);
 */
export const selectIconTheme = (state: IconThemeState): IconThemeId => state.currentTheme;

/**
 * Selector for whether the current theme uses dark mode inversion.
 * Returns true if the theme's darkMode strategy is 'invert'.
 *
 * @example
 * const usesDarkInvert = useIconThemeStore(selectUsesDarkInvert);
 */
export const selectUsesDarkInvert = (state: IconThemeState): boolean =>
  state.currentThemeDarkMode === 'invert';

// ============================================================================
// Derived Hooks
// ============================================================================

/**
 * Returns the full theme info object for the current theme.
 * Use this when you need access to all theme metadata, not just the ID.
 *
 * @returns The IconThemeInfo for the currently selected theme
 *
 * @example
 * const themeInfo = useCurrentThemeInfo();
 * console.log(themeInfo.name); // "Material Icons"
 */
export function useCurrentThemeInfo(): IconThemeInfo {
  const themeId = useIconThemeStore(selectIconTheme);
  return THEME_BY_ID[themeId];
}
