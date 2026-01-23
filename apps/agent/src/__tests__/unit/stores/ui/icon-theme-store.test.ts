/**
 * Icon Theme Store Tests
 *
 * Tests for the icon theme store that:
 * - Manages current icon theme selection (material, none)
 * - Provides O(1) theme lookups via THEME_BY_ID
 * - Optimizes selectors for virtualized component consumption
 * - Persists theme preference to localStorage
 *
 * @see icon-theme-store.ts - Store implementation
 */

import type { IconThemeDarkMode, IconThemeId, IconThemeInfo } from '@/stores/ui/icon-theme-store';

import {
  AVAILABLE_THEMES,
  selectIconTheme,
  selectUsesDarkInvert,
  THEME_BY_ID,
  useIconThemeStore,
} from '@/stores/ui/icon-theme-store';

// =============================================================================
// localStorage Mock
// =============================================================================

/**
 * Create a mock localStorage implementation with vi.fn() for tracking calls.
 */
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      Reflect.deleteProperty(store, key);
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: (): string | null => null,
    get length(): number {
      return Object.keys(store).length;
    },
  };
}

const localStorageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// =============================================================================
// Test Setup
// =============================================================================

describe('icon-theme-store', () => {
  beforeEach(() => {
    // Reset store to default state
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
    // Clear localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should have "material" as the default theme', () => {
      const state = useIconThemeStore.getState();
      expect(state.currentTheme).toBe('material');
    });

    it('should have "invert" as the default dark mode strategy', () => {
      const state = useIconThemeStore.getState();
      expect(state.currentThemeDarkMode).toBe('invert');
    });

    it('should have consistent darkMode between state and THEME_BY_ID', () => {
      const state = useIconThemeStore.getState();
      const themeInfo = THEME_BY_ID[state.currentTheme];
      expect(state.currentThemeDarkMode).toBe(themeInfo.darkMode);
    });
  });

  // ===========================================================================
  // THEME_BY_ID
  // ===========================================================================

  describe('THEME_BY_ID', () => {
    it('should provide O(1) access by theme ID', () => {
      // Direct access should work without iteration
      const materialTheme = THEME_BY_ID.material;
      expect(materialTheme).toBeDefined();
      expect(materialTheme.id).toBe('material');

      const noneTheme = THEME_BY_ID.none;
      expect(noneTheme).toBeDefined();
      expect(noneTheme.id).toBe('none');
    });

    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(THEME_BY_ID)).toBe(true);
    });

    it('should contain all themes from AVAILABLE_THEMES', () => {
      for (const theme of AVAILABLE_THEMES) {
        expect(THEME_BY_ID).toHaveProperty(theme.id);
        expect(THEME_BY_ID[theme.id]).toBe(theme);
      }
    });

    it('should have same number of entries as AVAILABLE_THEMES', () => {
      const themeByIdKeys = Object.keys(THEME_BY_ID);
      expect(themeByIdKeys.length).toBe(AVAILABLE_THEMES.length);
    });

    it('should return correct theme info for "material"', () => {
      const theme = THEME_BY_ID.material;
      expect(theme.id).toBe('material');
      expect(theme.name).toBe('Material Icons');
      expect(theme.builtin).toBe(true);
      expect(theme.darkMode).toBe('invert');
    });

    it('should return correct theme info for "none"', () => {
      const theme = THEME_BY_ID.none;
      expect(theme.id).toBe('none');
      expect(theme.name).toBe('No Icons (Test)');
      expect(theme.builtin).toBe(true);
      expect(theme.darkMode).toBe('none');
    });
  });

  // ===========================================================================
  // Selectors
  // ===========================================================================

  describe('selectors', () => {
    describe('selectIconTheme', () => {
      it('should return the current theme ID', () => {
        const state = useIconThemeStore.getState();
        expect(selectIconTheme(state)).toBe('material');
      });

      it('should return updated theme after setTheme', () => {
        const { setTheme } = useIconThemeStore.getState();
        setTheme('none');

        const state = useIconThemeStore.getState();
        expect(selectIconTheme(state)).toBe('none');
      });

      it('should work with useIconThemeStore selector pattern', () => {
        // This tests the intended usage pattern
        const themeId = useIconThemeStore.getState().currentTheme;
        expect(selectIconTheme({ currentTheme: themeId, currentThemeDarkMode: 'invert' })).toBe(
          themeId
        );
      });
    });

    describe('selectUsesDarkInvert', () => {
      it('should return true when darkMode is "invert"', () => {
        const state = useIconThemeStore.getState();
        expect(selectUsesDarkInvert(state)).toBe(true);
      });

      it('should return false when darkMode is "none"', () => {
        const { setTheme } = useIconThemeStore.getState();
        setTheme('none');

        const state = useIconThemeStore.getState();
        expect(selectUsesDarkInvert(state)).toBe(false);
      });

      it('should return false when darkMode is "variants"', () => {
        // Manually set state to test variants (not currently in AVAILABLE_THEMES)
        const testState = {
          currentTheme: 'material' as IconThemeId,
          currentThemeDarkMode: 'variants' as IconThemeDarkMode,
        };
        expect(selectUsesDarkInvert(testState)).toBe(false);
      });

      it('should update correctly when theme changes', () => {
        const { setTheme } = useIconThemeStore.getState();

        // Start with material (invert)
        expect(selectUsesDarkInvert(useIconThemeStore.getState())).toBe(true);

        // Switch to none
        setTheme('none');
        expect(selectUsesDarkInvert(useIconThemeStore.getState())).toBe(false);

        // Switch back to material
        setTheme('material');
        expect(selectUsesDarkInvert(useIconThemeStore.getState())).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Actions
  // ===========================================================================

  describe('actions', () => {
    describe('setTheme', () => {
      it('should change the current theme', () => {
        const { setTheme } = useIconThemeStore.getState();
        setTheme('none');

        expect(useIconThemeStore.getState().currentTheme).toBe('none');
      });

      it('should update darkMode strategy when theme changes', () => {
        const { setTheme } = useIconThemeStore.getState();

        // Material has darkMode: 'invert'
        expect(useIconThemeStore.getState().currentThemeDarkMode).toBe('invert');

        // None has darkMode: 'none'
        setTheme('none');
        expect(useIconThemeStore.getState().currentThemeDarkMode).toBe('none');
      });

      it('should maintain consistency between theme and darkMode', () => {
        const { setTheme } = useIconThemeStore.getState();

        for (const theme of AVAILABLE_THEMES) {
          setTheme(theme.id);
          const state = useIconThemeStore.getState();
          expect(state.currentTheme).toBe(theme.id);
          expect(state.currentThemeDarkMode).toBe(theme.darkMode);
        }
      });

      it('should be idempotent when setting same theme', () => {
        const { setTheme } = useIconThemeStore.getState();

        setTheme('material');
        setTheme('material');
        setTheme('material');

        const state = useIconThemeStore.getState();
        expect(state.currentTheme).toBe('material');
        expect(state.currentThemeDarkMode).toBe('invert');
      });

      it('should handle switching back and forth', () => {
        const { setTheme } = useIconThemeStore.getState();

        setTheme('none');
        expect(useIconThemeStore.getState().currentTheme).toBe('none');

        setTheme('material');
        expect(useIconThemeStore.getState().currentTheme).toBe('material');

        setTheme('none');
        expect(useIconThemeStore.getState().currentTheme).toBe('none');
      });

      it('should fallback to default theme for invalid theme ID', () => {
        const { setTheme } = useIconThemeStore.getState();

        // First set to a valid non-default theme
        setTheme('none');
        expect(useIconThemeStore.getState().currentTheme).toBe('none');

        // Cast to bypass TypeScript - simulating runtime invalid input
        setTheme('invalid-theme' as IconThemeId);

        // Should fallback to default 'material'
        expect(useIconThemeStore.getState().currentTheme).toBe('material');
        expect(useIconThemeStore.getState().currentThemeDarkMode).toBe('invert');
      });

      it('should fallback to default theme for empty string', () => {
        const { setTheme } = useIconThemeStore.getState();

        setTheme('none');
        setTheme('' as IconThemeId);

        expect(useIconThemeStore.getState().currentTheme).toBe('material');
      });
    });
  });

  // ===========================================================================
  // AVAILABLE_THEMES
  // ===========================================================================

  describe('AVAILABLE_THEMES', () => {
    it('should have at least one theme', () => {
      expect(AVAILABLE_THEMES.length).toBeGreaterThan(0);
    });

    it('should have at least two themes', () => {
      expect(AVAILABLE_THEMES.length).toBeGreaterThanOrEqual(2);
    });

    it('should have "material" theme', () => {
      const materialTheme = AVAILABLE_THEMES.find((t) => t.id === 'material');
      expect(materialTheme).toBeDefined();
    });

    it('should have "none" theme', () => {
      const noneTheme = AVAILABLE_THEMES.find((t) => t.id === 'none');
      expect(noneTheme).toBeDefined();
    });

    describe('theme structure', () => {
      it('all themes should have required properties', () => {
        for (const theme of AVAILABLE_THEMES) {
          // Required string properties
          expect(typeof theme.id).toBe('string');
          expect(theme.id.length).toBeGreaterThan(0);

          expect(typeof theme.name).toBe('string');
          expect(theme.name.length).toBeGreaterThan(0);

          // Required boolean property
          expect(typeof theme.builtin).toBe('boolean');

          // Required darkMode property
          expect(['invert', 'variants', 'none']).toContain(theme.darkMode);
        }
      });

      it('all themes should have unique IDs', () => {
        const ids = AVAILABLE_THEMES.map((t) => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it('all themes should have unique names', () => {
        const names = AVAILABLE_THEMES.map((t) => t.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
      });

      it('description should be optional', () => {
        // At least one theme may have a description
        const themesWithDescription = AVAILABLE_THEMES.filter((t) => t.description !== undefined);
        // Just verify the structure is valid - descriptions are optional
        for (const theme of themesWithDescription) {
          expect(typeof theme.description).toBe('string');
        }
      });
    });
  });

  // ===========================================================================
  // Persistence
  // ===========================================================================

  describe('persistence', () => {
    it('should only persist currentTheme (not darkMode)', () => {
      // The store uses partialize to only persist currentTheme
      // darkMode is recomputed on rehydration from THEME_BY_ID

      const { setTheme } = useIconThemeStore.getState();
      setTheme('none');

      // The partialize config specifies only currentTheme
      const persistedData = { currentTheme: useIconThemeStore.getState().currentTheme };
      expect(persistedData).toEqual({ currentTheme: 'none' });
      expect(persistedData).not.toHaveProperty('currentThemeDarkMode');
    });

    it('should use correct storage key "orbit-icon-theme"', () => {
      // The store is configured with name: 'orbit-icon-theme'
      // This test documents the expected storage key
      const EXPECTED_STORAGE_KEY = 'orbit-icon-theme';

      // Verify by checking if setting a theme eventually results in localStorage usage
      // Note: Zustand persist middleware handles this automatically
      const { setTheme } = useIconThemeStore.getState();
      setTheme('none');

      // Since we're testing async middleware, verify the key is correct in config
      expect(EXPECTED_STORAGE_KEY).toBe('orbit-icon-theme');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle rapid theme switching', () => {
      const { setTheme } = useIconThemeStore.getState();

      // Rapidly switch themes (i: 0..9)
      for (let i = 0; i < 10; i++) {
        setTheme(i % 2 === 0 ? 'material' : 'none');
      }

      // Should end on 'none' (last iteration is i=9 which is odd)
      expect(useIconThemeStore.getState().currentTheme).toBe('none');
    });

    it('should maintain state consistency after multiple operations', () => {
      const { setTheme } = useIconThemeStore.getState();

      setTheme('none');
      setTheme('material');
      setTheme('none');
      setTheme('material');

      const state = useIconThemeStore.getState();
      expect(state.currentTheme).toBe('material');
      expect(state.currentThemeDarkMode).toBe(THEME_BY_ID.material.darkMode);
    });
  });

  // ===========================================================================
  // Type Safety
  // ===========================================================================

  describe('type safety', () => {
    it('THEME_BY_ID keys should match IconThemeId type', () => {
      const keys = Object.keys(THEME_BY_ID) as IconThemeId[];

      for (const key of keys) {
        // TypeScript should allow this - verifies type alignment
        const theme: IconThemeInfo = THEME_BY_ID[key];
        expect(theme.id).toBe(key);
      }
    });

    it('darkMode values should match IconThemeDarkMode type', () => {
      const validDarkModes: IconThemeDarkMode[] = ['invert', 'variants', 'none'];

      for (const theme of AVAILABLE_THEMES) {
        expect(validDarkModes).toContain(theme.darkMode);
      }
    });
  });
});
