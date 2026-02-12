# Extensible Icon Theme System Plan

## Overview

Build infrastructure for multiple icon themes while shipping only Material (current) theme. Users can add custom themes later via the `~/.orbit/icon-themes/` directory.

## Current State

- **Single theme**: All icons in `/apps/agent/src/assets/icons/` (Material-based)
- **Build-time loading**: Uses Vite's `import.meta.glob()` with `?url` query
- **Mapping logic**: `iconMap.ts` maps file extensions/names → icon names
- **No runtime theme loading**: Icons bundled at build time
- **Duplicate glob imports**: Both `file-icon.tsx` and `folder-icon.tsx` have identical glob loading code
- **Dark mode handling**: Uses `dark:invert dark:brightness-90` CSS for monochrome icons

## Design Goals

1. **Zero breaking changes** - Material theme works exactly as before
2. **Extensible** - Users can drop custom themes into `~/.orbit/icon-themes/`
3. **Performant** - Built-in themes still use Vite glob (fast), custom themes load at runtime
4. **Simple** - Single store, minimal API surface
5. **Dark mode aware** - Themes declare how they handle light/dark mode

---

## Architecture Decision: Zustand over React Context

**Why Zustand instead of Context?**

The file explorer uses a virtualized list (`@tanstack/react-virtual`) with 100+ memoized `FileTreeRow` components. React Context has a critical limitation:

```typescript
// ❌ PROBLEM: Context re-renders ALL consumers when provider value changes
const { getFileIconUrl } = useIconTheme(); // Every row subscribes
// When theme changes → ALL 100+ rows re-render simultaneously
```

Zustand's selector pattern only re-renders when the selected value changes:

```typescript
// ✅ SOLUTION: Zustand selector - surgical re-renders
const theme = useIconThemeStore(selectIconTheme);
// When theme changes → only rows that need the new value re-render
```

This matches the codebase pattern (16+ Zustand stores vs 2 Context providers).

---

## Implementation Approach

### Phase 1: Icon Theme Zustand Store

**New file: `apps/agent/src/stores/ui/icon-theme-store.ts`**

```typescript
import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const logger = createLogger('IconThemeStore');

// Theme IDs - extend when adding new themes
export type IconThemeId = 'material';

// Dark mode handling strategy
export type IconThemeDarkMode = 'invert' | 'variants' | 'none';
// - 'invert': Apply CSS invert filter (current Material behavior)
// - 'variants': Theme has separate dark/light icon files
// - 'none': Icons are color-neutral (work in both modes)

export interface IconThemeInfo {
  readonly id: IconThemeId;
  readonly name: string;
  readonly description?: string;
  readonly builtin: boolean;
  readonly darkMode: IconThemeDarkMode;
}

// Available themes registry (array for UI iteration)
export const AVAILABLE_THEMES: readonly IconThemeInfo[] = [
  {
    id: 'material',
    name: 'Material Icons',
    description: 'Material Design inspired file icons',
    builtin: true,
    darkMode: 'invert',
  },
] as const;

// O(1) lookup map for selectors (precomputed from AVAILABLE_THEMES)
export const THEME_BY_ID: Readonly<Record<IconThemeId, IconThemeInfo>> = Object.freeze(
  Object.fromEntries(AVAILABLE_THEMES.map((t) => [t.id, t])) as Record<IconThemeId, IconThemeInfo>
);

// Default theme ID (used for fallback on invalid stored values)
const DEFAULT_THEME: IconThemeId = 'material';

// Validate theme ID exists (for storage rehydration)
const isValidThemeId = (id: unknown): id is IconThemeId =>
  typeof id === 'string' && id in THEME_BY_ID;

interface IconThemeState {
  currentTheme: IconThemeId;
  // Pre-computed for O(1) selector access
  currentThemeDarkMode: IconThemeDarkMode;
}

interface IconThemeActions {
  setTheme: (theme: IconThemeId) => void;
}

type IconThemeStore = IconThemeState & IconThemeActions;

export const useIconThemeStore = create<IconThemeStore>()(
  persist(
    immer((set) => ({
      currentTheme: DEFAULT_THEME,
      currentThemeDarkMode: THEME_BY_ID[DEFAULT_THEME].darkMode,

      setTheme: (theme: IconThemeId): void => {
        // Guard against invalid theme IDs
        if (!isValidThemeId(theme)) {
          logger.warn('Invalid theme ID, falling back to default', {
            theme,
            default: DEFAULT_THEME,
          });
          theme = DEFAULT_THEME;
        }
        logger.debug('Theme changed', { theme });
        set((state) => {
          state.currentTheme = theme;
          state.currentThemeDarkMode = THEME_BY_ID[theme].darkMode;
        });
      },
    })),
    {
      name: 'orbit-icon-theme',
      // Rehydration guard: validate stored theme ID on load
      onRehydrateStorage: () => (state) => {
        if (state && !isValidThemeId(state.currentTheme)) {
          logger.warn('Invalid theme in storage, resetting to default', {
            stored: state.currentTheme,
            default: DEFAULT_THEME,
          });
          state.currentTheme = DEFAULT_THEME;
          state.currentThemeDarkMode = THEME_BY_ID[DEFAULT_THEME].darkMode;
        }
      },
    }
  )
);

// ============================================================================
// Stable Selectors (O(1) lookups for memoized components)
// ============================================================================

export const selectIconTheme = (s: IconThemeStore): IconThemeId => s.currentTheme;

export const selectUsesDarkInvert = (s: IconThemeStore): boolean =>
  s.currentThemeDarkMode === 'invert';

// ============================================================================
// Derived Hooks
// ============================================================================

/** Get full theme info for current theme (O(1) via THEME_BY_ID) */
export const useCurrentThemeInfo = (): IconThemeInfo => {
  const currentTheme = useIconThemeStore(selectIconTheme);
  return THEME_BY_ID[currentTheme];
};
```

### Phase 2: Shared Icon Loader Utility

**New file: `apps/agent/src/lib/icons/icon-loader.ts`**

Consolidate duplicated glob loading from both icon components. **Critical: Thread `themeId` through resolver functions** to enable future theme switching.

```typescript
import type { IconThemeId } from '@/stores/ui/icon-theme-store';

import { getFileIconName, getFolderIconName } from '@/lib/utils/iconMap';

// ============================================================================
// Icon Module Loading (per-theme)
// ============================================================================

// Type for a theme's icon map
type IconMap = Readonly<Record<string, string>>;

// Eagerly load Material theme icons at module level (same as current)
const materialIconModules = import.meta.glob<string>('/src/assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Build lookup map for Material theme at module initialization
const buildIconMap = (modules: Record<string, string>): IconMap => {
  const map: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const match = /\/([^/]+)\.svg$/.exec(path);
    if (match?.[1]) {
      map[match[1]] = url;
    }
  }
  return Object.freeze(map);
};

const materialIconMap = buildIconMap(materialIconModules);

// Registry of all theme icon maps (extend when adding new themes)
const THEME_ICON_MAPS: Readonly<Record<IconThemeId, IconMap>> = {
  material: materialIconMap,
};

// ============================================================================
// Icon Resolution Functions
// ============================================================================

/**
 * Resolve file icon URL with explicit fallback chain:
 * 1. Specific icon for filename/extension in the selected theme
 * 2. Theme's default 'document' icon
 * 3. Empty string (triggers inline SVG fallback in component)
 *
 * @param fileName - The file name to resolve icon for
 * @param themeId - The theme to use for resolution (default: 'material')
 *
 * Note on filename handling:
 * - Exact filename match is case-sensitive (e.g., "Makefile" vs "makefile")
 * - Lowercase filename is checked second
 * - Extensions are always lowercased for matching
 * - Dotfiles (.gitignore, .env) are matched by exact filename first
 */
export function resolveFileIconUrl(fileName: string, themeId: IconThemeId = 'material'): string {
  const iconMap = THEME_ICON_MAPS[themeId] ?? THEME_ICON_MAPS['material'];

  // Guard against empty icon map (shouldn't happen in production)
  if (Object.keys(iconMap).length === 0) {
    return '';
  }

  const iconName = getFileIconName(fileName);
  return iconMap[iconName] ?? iconMap['document'] ?? '';
}

/**
 * Resolve folder icon URL with explicit fallback chain:
 * 1. Specific folder icon in the selected theme (e.g., folder-src)
 * 2. Default folder/folder-open icon
 * 3. Empty string (triggers inline SVG fallback in component)
 *
 * @param folderName - The folder name to resolve icon for
 * @param isOpen - Whether the folder is expanded
 * @param themeId - The theme to use for resolution (default: 'material')
 */
export function resolveFolderIconUrl(
  folderName: string,
  isOpen: boolean,
  themeId: IconThemeId = 'material'
): string {
  const iconMap = THEME_ICON_MAPS[themeId] ?? THEME_ICON_MAPS['material'];

  // Guard against empty icon map (shouldn't happen in production)
  if (Object.keys(iconMap).length === 0) {
    return '';
  }

  const iconName = getFolderIconName(folderName, isOpen);
  const fallback = isOpen ? 'folder-open' : 'folder';
  return iconMap[iconName] ?? iconMap[fallback] ?? '';
}

/** Check if an icon URL was resolved (for fallback rendering) */
export function hasIconUrl(url: string): boolean {
  return url !== '';
}

// ============================================================================
// Testing Utilities (not for production use)
// ============================================================================

/** @internal Debug helper for visual regression tests */
export const __DEBUG_getIconMap = (themeId: IconThemeId = 'material'): IconMap =>
  THEME_ICON_MAPS[themeId] ?? THEME_ICON_MAPS['material'];
```

**New file: `apps/agent/src/lib/icons/index.ts`** (barrel export)

```typescript
export {
  resolveFileIconUrl,
  resolveFolderIconUrl,
  hasIconUrl,
  __DEBUG_getIconMap,
} from './icon-loader';
```

### Phase 3: Refactor Icon Components

**Modify `apps/agent/src/components/files/file-icon.tsx`:**

```typescript
import { memo, useMemo } from 'react';

import type { FC } from 'react';

import { resolveFileIconUrl, hasIconUrl } from '@/lib/icons';
import { cn } from '@/lib/utils';
import {
  selectIconTheme,
  selectUsesDarkInvert,
  useIconThemeStore,
} from '@/stores/ui/icon-theme-store';

export interface FileIconProps {
  readonly fileName: string;
  readonly className?: string;
  readonly monochrome?: boolean;
  readonly isSymlink?: boolean;
}

export const FileIcon: FC<FileIconProps> = memo(({
  fileName,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  // Subscribe to theme (triggers re-render when theme changes)
  const themeId = useIconThemeStore(selectIconTheme);
  const usesDarkInvert = useIconThemeStore(selectUsesDarkInvert);

  // Memoize URL resolution - stable unless fileName OR themeId changes
  const iconUrl = useMemo(
    () => resolveFileIconUrl(fileName, themeId),
    [fileName, themeId]
  );

  if (!hasIconUrl(iconUrl)) {
    // Inline SVG fallback (unchanged from current)
    return (
      <svg
        className={cn('shrink-0', isSymlink && 'opacity-60', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className={cn(
        'shrink-0',
        // Apply dark mode inversion based on theme's darkMode strategy
        monochrome && usesDarkInvert && 'dark:invert dark:brightness-90 opacity-80',
        isSymlink && 'opacity-60',
        className
      )}
      draggable={false}
    />
  );
});

FileIcon.displayName = 'FileIcon';
```

**Modify `apps/agent/src/components/files/folder-icon.tsx`:**

```typescript
import { memo, useMemo } from 'react';

import type { FC } from 'react';

import { resolveFolderIconUrl, hasIconUrl } from '@/lib/icons';
import { cn } from '@/lib/utils';
import {
  selectIconTheme,
  selectUsesDarkInvert,
  useIconThemeStore,
} from '@/stores/ui/icon-theme-store';

export interface FolderIconProps {
  readonly folderName: string;
  readonly isOpen?: boolean;
  readonly className?: string;
  readonly monochrome?: boolean;
  readonly isSymlink?: boolean;
}

export const FolderIcon: FC<FolderIconProps> = memo(({
  folderName,
  isOpen = false,
  className = '',
  monochrome = true,
  isSymlink = false,
}) => {
  // Subscribe to theme (triggers re-render when theme changes)
  const themeId = useIconThemeStore(selectIconTheme);
  const usesDarkInvert = useIconThemeStore(selectUsesDarkInvert);

  // Memoize URL resolution - stable unless folderName, isOpen, OR themeId changes
  const iconUrl = useMemo(
    () => resolveFolderIconUrl(folderName, isOpen, themeId),
    [folderName, isOpen, themeId]
  );

  if (!hasIconUrl(iconUrl)) {
    // Inline SVG fallback (unchanged from current)
    return (
      <svg
        className={cn('shrink-0', isSymlink && 'opacity-60', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        {isOpen ? (
          <>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M2 10h20" />
          </>
        ) : (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        )}
      </svg>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className={cn(
        'shrink-0',
        // Apply dark mode inversion based on theme's darkMode strategy
        monochrome && usesDarkInvert && 'dark:invert dark:brightness-90 opacity-80',
        isSymlink && 'opacity-60',
        className
      )}
      draggable={false}
    />
  );
});

FolderIcon.displayName = 'FolderIcon';
```

### Phase 4: Zod Validation Schema (For Future Custom Themes)

**New file: `apps/agent/src/types/icon-theme.ts`**

```typescript
import { z } from 'zod';

/**
 * Required icons that every theme must provide.
 * Used for validation when loading custom themes.
 */
export const REQUIRED_ICONS = ['document', 'folder', 'folder-open'] as const;

/**
 * Zod schema for validating custom icon theme manifests.
 * Used when loading themes from ~/.orbit/icon-themes/
 */
export const IconThemeManifestSchema = z.object({
  // ID must be lowercase alphanumeric with hyphens
  id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(50),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string().optional(),
  author: z.string().optional(),
  darkMode: z.enum(['invert', 'variants', 'none']).default('none'),

  // Required icons for theme completeness validation
  icons: z
    .object({
      document: z.string(), // Required default file icon
      folder: z.string(), // Required closed folder
      'folder-open': z.string(), // Required open folder
    })
    .passthrough(), // Allow additional icons
});

export type IconThemeManifest = z.infer<typeof IconThemeManifestSchema>;

/**
 * Validate a custom theme manifest.
 * Returns the validated manifest or throws with descriptive errors.
 */
export function validateThemeManifest(data: unknown): IconThemeManifest {
  return IconThemeManifestSchema.parse(data);
}

/**
 * Check which required icons are missing from an icon map.
 * Returns empty array if all required icons are present.
 */
export function validateThemeCompleteness(iconMap: Record<string, string>): string[] {
  return REQUIRED_ICONS.filter((icon) => !(icon in iconMap));
}

// ============================================================================
// Future: VS Code Icon Theme Compatibility
// ============================================================================

/**
 * VS Code icon theme manifest structure (for future compatibility).
 * See: https://code.visualstudio.com/api/extension-guides/file-icon-theme
 */
export interface VSCodeIconThemeManifest {
  id: string;
  label: string;
  iconDefinitions: Record<string, { iconPath: string }>;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
}

// Future: export function convertVSCodeTheme(manifest: VSCodeIconThemeManifest): IconThemeManifest;
```

### Phase 5: Update Barrel Exports

**Modify `apps/agent/src/stores/ui/index.ts`** (add export):

```typescript
export * from './icon-theme-store';
export * from './ui-store';
```

**Modify `apps/agent/src/stores/index.ts`** (ensure ui exports included):

```typescript
// ... existing exports
export * from './ui';
```

---

## Files to Create/Modify

| File                                              | Action     | Description                                                              |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `apps/agent/src/stores/ui/icon-theme-store.ts`    | **CREATE** | Zustand store with theme state, `THEME_BY_ID` map, and rehydration guard |
| `apps/agent/src/lib/icons/icon-loader.ts`         | **CREATE** | Shared icon loading with `themeId` parameter                             |
| `apps/agent/src/lib/icons/index.ts`               | **CREATE** | Barrel export                                                            |
| `apps/agent/src/types/icon-theme.ts`              | **CREATE** | Zod schema for custom theme validation                                   |
| `apps/agent/src/components/files/file-icon.tsx`   | **MODIFY** | Use shared loader with themeId + memo                                    |
| `apps/agent/src/components/files/folder-icon.tsx` | **MODIFY** | Use shared loader with themeId + memo                                    |
| `apps/agent/src/stores/ui/index.ts`               | **MODIFY** | Add icon-theme-store export                                              |

---

## Test Coverage

### Testing Strategy

**Test deterministic mapping logic, not Vite URL output.**

Vite's hashed asset names are non-deterministic and can cause brittle tests. Instead:

- Test `getFileIconName()` and `getFolderIconName()` directly for mapping logic
- Test store state transitions for theme selection
- Test component rendering behavior (img vs SVG fallback)

### Unit Tests: Icon Mapping Logic

**New file: `apps/agent/src/__tests__/unit/lib/utils/iconMap.test.ts`**

```typescript
import {
  getFileIconName,
  getFolderIconName,
  defaultFileIcon,
  defaultFolderIcon,
  defaultFolderOpenIcon,
} from '@/lib/utils/iconMap';

describe('iconMap', () => {
  // ============================================================================
  // getFileIconName - Deterministic mapping tests
  // ============================================================================

  describe('getFileIconName', () => {
    describe('exact filename matches', () => {
      it('maps package.json to nodejs', () => {
        expect(getFileIconName('package.json')).toBe('nodejs');
      });

      it('maps tsconfig.json to tsconfig', () => {
        expect(getFileIconName('tsconfig.json')).toBe('tsconfig');
      });

      it('maps Makefile to make', () => {
        expect(getFileIconName('Makefile')).toBe('make');
      });

      it('maps .gitignore to git', () => {
        expect(getFileIconName('.gitignore')).toBe('git');
      });

      it('maps README.md to readme', () => {
        expect(getFileIconName('README.md')).toBe('readme');
      });

      it('is case-sensitive for exact matches', () => {
        // Makefile works, but makefile falls through to extension
        expect(getFileIconName('Makefile')).toBe('make');
        expect(getFileIconName('makefile')).toBe('make'); // lowercase also in map
      });
    });

    describe('extension mapping', () => {
      it('maps .ts to typescript', () => {
        expect(getFileIconName('app.ts')).toBe('typescript');
      });

      it('maps .tsx to react_ts', () => {
        expect(getFileIconName('Component.tsx')).toBe('react_ts');
      });

      it('maps .js to javascript', () => {
        expect(getFileIconName('app.js')).toBe('javascript');
      });

      it('maps .jsx to react', () => {
        expect(getFileIconName('Component.jsx')).toBe('react');
      });

      it('maps .py to python', () => {
        expect(getFileIconName('script.py')).toBe('python');
      });

      it('maps .rs to rust', () => {
        expect(getFileIconName('main.rs')).toBe('rust');
      });

      it('maps .go to go', () => {
        expect(getFileIconName('main.go')).toBe('go');
      });

      it('maps .md to markdown', () => {
        expect(getFileIconName('notes.md')).toBe('markdown');
      });
    });

    describe('compound extensions', () => {
      it('maps .d.ts to typescript', () => {
        expect(getFileIconName('types.d.ts')).toBe('typescript');
      });
    });

    describe('test file patterns', () => {
      it('maps .test.ts to test-ts', () => {
        expect(getFileIconName('app.test.ts')).toBe('test-ts');
      });

      it('maps .spec.tsx to test-ts', () => {
        expect(getFileIconName('Component.spec.tsx')).toBe('test-ts');
      });

      it('maps .test.js to test-js', () => {
        expect(getFileIconName('app.test.js')).toBe('test-js');
      });
    });

    describe('fallback behavior', () => {
      it('returns default icon for unknown extension', () => {
        expect(getFileIconName('file.xyz123')).toBe(defaultFileIcon);
      });

      it('returns default icon for empty filename', () => {
        expect(getFileIconName('')).toBe(defaultFileIcon);
      });

      it('returns default icon for extensionless file', () => {
        expect(getFileIconName('somefile')).toBe(defaultFileIcon);
      });
    });
  });

  // ============================================================================
  // getFolderIconName - Deterministic mapping tests
  // ============================================================================

  describe('getFolderIconName', () => {
    describe('known folder names (closed)', () => {
      it('maps src to folder-src', () => {
        expect(getFolderIconName('src', false)).toBe('folder-src');
      });

      it('maps node_modules to folder-node', () => {
        expect(getFolderIconName('node_modules', false)).toBe('folder-node');
      });

      it('maps components to folder-components', () => {
        expect(getFolderIconName('components', false)).toBe('folder-components');
      });

      it('maps test to folder-test', () => {
        expect(getFolderIconName('test', false)).toBe('folder-test');
      });
    });

    describe('known folder names (open)', () => {
      it('maps src (open) to folder-src-open', () => {
        expect(getFolderIconName('src', true)).toBe('folder-src-open');
      });

      it('maps node_modules (open) to folder-node-open', () => {
        expect(getFolderIconName('node_modules', true)).toBe('folder-node-open');
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase folder names', () => {
        expect(getFolderIconName('SRC', false)).toBe('folder-src');
        expect(getFolderIconName('SRC', true)).toBe('folder-src-open');
      });

      it('handles mixed case folder names', () => {
        expect(getFolderIconName('Components', false)).toBe('folder-components');
      });
    });

    describe('fallback behavior', () => {
      it('returns default closed folder for unknown name', () => {
        expect(getFolderIconName('randomfolder', false)).toBe(defaultFolderIcon);
      });

      it('returns default open folder for unknown name when open', () => {
        expect(getFolderIconName('randomfolder', true)).toBe(defaultFolderOpenIcon);
      });

      it('returns default folder for empty name', () => {
        expect(getFolderIconName('', false)).toBe(defaultFolderIcon);
      });
    });
  });
});
```

### Unit Tests: Icon Theme Store

**New file: `apps/agent/src/__tests__/unit/stores/ui/icon-theme-store.test.ts`**

```typescript
import {
  useIconThemeStore,
  selectIconTheme,
  selectUsesDarkInvert,
  AVAILABLE_THEMES,
  THEME_BY_ID,
} from '@/stores/ui/icon-theme-store';

// Mock localStorage
const createLocalStorageMock = (): Storage => {
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
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('icon-theme-store', () => {
  beforeEach(() => {
    // Reset store to default state
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('has material as default theme', () => {
      const theme = selectIconTheme(useIconThemeStore.getState());
      expect(theme).toBe('material');
    });

    it('has invert as default dark mode strategy', () => {
      const state = useIconThemeStore.getState();
      expect(state.currentThemeDarkMode).toBe('invert');
    });
  });

  // ============================================================================
  // THEME_BY_ID (O(1) lookup map)
  // ============================================================================

  describe('THEME_BY_ID', () => {
    it('provides O(1) access to theme info', () => {
      expect(THEME_BY_ID['material']).toBeDefined();
      expect(THEME_BY_ID['material'].name).toBe('Material Icons');
      expect(THEME_BY_ID['material'].darkMode).toBe('invert');
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(THEME_BY_ID)).toBe(true);
    });

    it('contains all themes from AVAILABLE_THEMES', () => {
      for (const theme of AVAILABLE_THEMES) {
        expect(THEME_BY_ID[theme.id]).toBe(theme);
      }
    });
  });

  // ============================================================================
  // Selectors
  // ============================================================================

  describe('selectIconTheme', () => {
    it('returns current theme', () => {
      const theme = selectIconTheme(useIconThemeStore.getState());
      expect(theme).toBe('material');
    });
  });

  describe('selectUsesDarkInvert', () => {
    it('returns true for material theme', () => {
      const usesDarkInvert = selectUsesDarkInvert(useIconThemeStore.getState());
      expect(usesDarkInvert).toBe(true);
    });

    it('is O(1) - reads from pre-computed state', () => {
      const state = useIconThemeStore.getState();
      expect(state.currentThemeDarkMode).toBe('invert');
      expect(selectUsesDarkInvert(state)).toBe(true);
    });
  });

  // ============================================================================
  // Actions
  // ============================================================================

  describe('setTheme', () => {
    it('can change theme', () => {
      useIconThemeStore.getState().setTheme('material');
      expect(selectIconTheme(useIconThemeStore.getState())).toBe('material');
    });

    it('updates dark mode strategy when theme changes', () => {
      useIconThemeStore.getState().setTheme('material');
      expect(useIconThemeStore.getState().currentThemeDarkMode).toBe('invert');
    });
  });

  // ============================================================================
  // Available Themes Registry
  // ============================================================================

  describe('AVAILABLE_THEMES', () => {
    it('has at least one available theme', () => {
      expect(AVAILABLE_THEMES.length).toBeGreaterThan(0);
    });

    it('all themes have required properties', () => {
      for (const theme of AVAILABLE_THEMES) {
        expect(theme.id).toBeDefined();
        expect(theme.name).toBeDefined();
        expect(theme.builtin).toBeDefined();
        expect(theme.darkMode).toBeDefined();
        expect(['invert', 'variants', 'none']).toContain(theme.darkMode);
      }
    });

    it('material theme has correct configuration', () => {
      const material = AVAILABLE_THEMES.find((t) => t.id === 'material');
      expect(material).toBeDefined();
      expect(material?.builtin).toBe(true);
      expect(material?.darkMode).toBe('invert');
    });
  });
});
```

### Component Tests: FileIcon and FolderIcon

**New file: `apps/agent/src/__tests__/unit/components/files/file-icon.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';

import { FileIcon } from '@/components/files/file-icon';
import { useIconThemeStore } from '@/stores/ui/icon-theme-store';

describe('FileIcon', () => {
  beforeEach(() => {
    // Reset store to default state
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
  });

  it('renders img tag for known extension', () => {
    render(<FileIcon fileName="app.ts" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src');
  });

  it('applies shrink-0 class', () => {
    render(<FileIcon fileName="app.ts" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveClass('shrink-0');
  });

  it('applies opacity-60 for symlinks', () => {
    render(<FileIcon fileName="link.ts" isSymlink={true} />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveClass('opacity-60');
  });

  it('applies custom className', () => {
    render(<FileIcon fileName="app.ts" className="h-4 w-4" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveClass('h-4');
    expect(img).toHaveClass('w-4');
  });

  it('has draggable=false', () => {
    render(<FileIcon fileName="app.ts" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveAttribute('draggable', 'false');
  });

  it('has empty alt text for decorative icon', () => {
    render(<FileIcon fileName="app.ts" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveAttribute('alt', '');
  });
});
```

**New file: `apps/agent/src/__tests__/unit/components/files/folder-icon.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';

import { FolderIcon } from '@/components/files/folder-icon';
import { useIconThemeStore } from '@/stores/ui/icon-theme-store';

describe('FolderIcon', () => {
  beforeEach(() => {
    // Reset store to default state
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
  });

  it('renders img tag for known folder', () => {
    render(<FolderIcon folderName="src" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src');
  });

  it('renders different icon for open vs closed', () => {
    const { rerender } = render(<FolderIcon folderName="src" isOpen={false} />);
    const closedImg = screen.getByRole('img', { hidden: true });
    const closedSrc = closedImg.getAttribute('src');

    rerender(<FolderIcon folderName="src" isOpen={true} />);
    const openImg = screen.getByRole('img', { hidden: true });
    const openSrc = openImg.getAttribute('src');

    expect(closedSrc).not.toBe(openSrc);
  });

  it('applies shrink-0 class', () => {
    render(<FolderIcon folderName="src" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveClass('shrink-0');
  });

  it('applies opacity-60 for symlinks', () => {
    render(<FolderIcon folderName="link" isSymlink={true} />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveClass('opacity-60');
  });

  it('has draggable=false', () => {
    render(<FolderIcon folderName="src" />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveAttribute('draggable', 'false');
  });
});
```

---

## Verification

1. **Build check**: `bun run build` compiles without errors
2. **Type check**: `bun run typecheck` passes
3. **Lint check**: `bun run lint` passes
4. **Unit tests**: `bun test` passes (new tests included)
5. **Visual test**:
   - `bunx tauri dev`
   - Open file explorer
   - Verify all icons render correctly (same as before)
   - Expand/collapse folders - icons update properly
   - Check both light and dark modes (toggle via system preference)
   - Verify `dark:invert` still applies in dark mode
6. **No regressions**: File tree looks identical to current behavior
7. **Performance**: No visible lag when expanding large folders

---

## Implementation Order

1. Create `apps/agent/src/stores/ui/icon-theme-store.ts`
2. Create `apps/agent/src/lib/icons/icon-loader.ts` (with `themeId` parameter)
3. Create `apps/agent/src/lib/icons/index.ts` barrel
4. Update `apps/agent/src/stores/ui/index.ts` barrel export
5. Create `apps/agent/src/types/icon-theme.ts` (Zod schema)
6. Refactor `apps/agent/src/components/files/file-icon.tsx`
7. Refactor `apps/agent/src/components/files/folder-icon.tsx`
8. Create test files (iconMap tests, store tests, component tests)
9. Run `bun run check` and fix any issues
10. Visual verification in `bunx tauri dev`
11. Commit and push

---

## Key Decisions Summary

| Decision            | Choice                           | Rationale                                        |
| ------------------- | -------------------------------- | ------------------------------------------------ |
| State management    | Zustand (not Context)            | Performance: virtualized list with 100+ rows     |
| Middleware          | `persist` + `immer`              | Codebase consistency: matches other stores       |
| Theme lookup        | `THEME_BY_ID` Record             | O(1) access instead of `.find()` on array        |
| Icon resolution     | `themeId` parameter              | **Critical**: enables actual theme switching     |
| Storage rehydration | `onRehydrateStorage` guard       | Graceful fallback for invalid stored IDs         |
| Memoization         | `React.memo` + `useMemo`         | Performance: prevent unnecessary re-renders      |
| Fallback chain      | Explicit 3-tier                  | Robustness: specific → default → inline SVG      |
| Theme validation    | Zod schema                       | Type safety: validate custom themes at load time |
| Test strategy       | Test mapping functions           | Deterministic tests (avoid Vite URL assertions)  |
| Logging             | `createLogger('IconThemeStore')` | Codebase consistency: structured logging         |

---

## Known Behaviors & Edge Cases

### Filename Matching

- **Case sensitivity**: Exact filename match is case-sensitive (`Makefile` ≠ `MAKEFILE`)
- **Dotfiles**: Matched via `fileNameMap` (e.g., `.gitignore` → `git` icon)
- **Compound extensions**: `d.ts` checked before `.ts` for type definition files

### Folder Matching

- **Case insensitive**: All folder names lowercased before lookup
- **Open state**: Appends `-open` suffix (e.g., `folder-src` → `folder-src-open`)

### Error Handling

- **Missing icon**: Falls back to `document` icon, then inline SVG
- **Empty icon map**: Returns empty string (shouldn't happen in production)
- **Invalid theme ID**: Falls back to `material` with warning log
- **Corrupted storage**: `onRehydrateStorage` resets to default theme

---

## Future Extensions (Not in This PR)

- `~/.orbit/icon-themes/` directory for custom themes
- Theme marketplace/download from registry
- Settings UI with theme picker and preview
- VS Code icon theme JSON format compatibility
- Theme hot-reloading during development
- Theme loading error states in store
- Validate required icons exist on disk, not just in manifest
- Visual regression grid / icon audit script
