/**
 * Icon Loader
 *
 * Centralizes icon loading and resolution for the file explorer.
 * Supports multiple icon themes via the `themeId` parameter.
 *
 * @module lib/icons/icon-loader
 */

import type { IconThemeId } from '@/stores/ui/icon-theme-store';

import { getFileIconName, getFolderIconName } from '@/lib/utils/iconMap';

// ============================================================================
// Icon Module Loading (per-theme)
// ============================================================================

/**
 * Vite's import.meta.glob returns a record of file paths to resolved URLs.
 * We load all SVGs eagerly at startup to avoid async lookup during render.
 *
 * Path: `/src/assets/icons/*.svg`
 * Options:
 *   - eager: true - Load immediately, not lazily
 *   - query: '?url' - Return the resolved URL string
 *   - import: 'default' - Get the default export (the URL)
 */
const materialIconModules = import.meta.glob<string>('/src/assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Extracts icon name from file path and builds a lookup map.
 *
 * @example
 * Input: { '/src/assets/icons/typescript.svg': '/assets/typescript-abc123.svg' }
 * Output: { 'typescript': '/assets/typescript-abc123.svg' }
 */
function buildIconMap(modules: Record<string, string>): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};

  for (const [path, url] of Object.entries(modules)) {
    // Extract filename without extension: /src/assets/icons/typescript.svg -> typescript
    const match = /\/([^/]+)\.svg$/.exec(path);
    if (match?.[1] !== undefined) {
      map[match[1]] = url;
    }
  }

  return Object.freeze(map);
}

/** Material theme icon map - built once at module initialization */
const materialIconMap = buildIconMap(materialIconModules);

/** Empty icon map for 'none' theme - forces fallback to inline SVGs */
const emptyIconMap: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Registry of icon maps per theme.
 * Add new themes here as they are implemented.
 */
const THEME_ICON_MAPS: Readonly<Record<IconThemeId, Readonly<Record<string, string>>>> = {
  material: materialIconMap,
  none: emptyIconMap,
};

// ============================================================================
// Icon Resolution Functions
// ============================================================================

/**
 * Resolves a file name to its icon URL for the given theme.
 *
 * Resolution priority (fallback chain):
 * 1. Exact filename match (e.g., 'package.json' -> 'nodejs')
 * 2. Lowercase filename match
 * 3. Test file pattern match (e.g., '*.test.ts' -> 'test-ts')
 * 4. Compound extension match (e.g., '.d.ts' -> 'typescript')
 * 5. Simple extension match (e.g., '.ts' -> 'typescript')
 * 6. Default 'document' icon
 * 7. Empty string (if document icon not found)
 *
 * The empty string return triggers inline SVG fallback in components.
 *
 * @param fileName - The file name to resolve (e.g., 'app.tsx', 'package.json')
 * @param themeId - The theme to use for resolution (defaults to 'material')
 * @returns The resolved icon URL, or empty string if not found
 *
 * @example
 * resolveFileIconUrl('app.ts')           // -> '/assets/typescript-abc123.svg'
 * resolveFileIconUrl('package.json')     // -> '/assets/nodejs-def456.svg'
 * resolveFileIconUrl('unknown.xyz')      // -> '/assets/document-ghi789.svg'
 * resolveFileIconUrl('mystery', 'material') // -> '' (no document icon somehow)
 */
export function resolveFileIconUrl(fileName: string, themeId: IconThemeId = 'material'): string {
  const iconMap = THEME_ICON_MAPS[themeId];

  // Guard against missing/empty icon map (shouldn't happen in practice)
  if (Object.keys(iconMap).length === 0) {
    return '';
  }

  // Get the icon name from the mapping logic
  const iconName = getFileIconName(fileName);

  // Try specific icon first, then fallback to document
  const url = iconMap[iconName] ?? iconMap['document'];

  return url ?? '';
}

/**
 * Resolves a folder name to its icon URL for the given theme.
 *
 * Resolution priority (fallback chain):
 * 1. Specific folder icon (e.g., 'src' -> 'folder-src')
 * 2. Specific folder open variant (e.g., 'src' + open -> 'folder-src-open')
 * 3. Default 'folder' or 'folder-open' icon
 * 4. Empty string (if default folder icon not found)
 *
 * The empty string return triggers inline SVG fallback in components.
 *
 * @param folderName - The folder name to resolve (e.g., 'src', 'components')
 * @param isOpen - Whether the folder is expanded/open
 * @param themeId - The theme to use for resolution (defaults to 'material')
 * @returns The resolved icon URL, or empty string if not found
 *
 * @example
 * resolveFolderIconUrl('src', false)      // -> '/assets/folder-src-abc123.svg'
 * resolveFolderIconUrl('src', true)       // -> '/assets/folder-src-open-def456.svg'
 * resolveFolderIconUrl('random', false)   // -> '/assets/folder-ghi789.svg'
 * resolveFolderIconUrl('random', true)    // -> '/assets/folder-open-jkl012.svg'
 */
export function resolveFolderIconUrl(
  folderName: string,
  isOpen: boolean,
  themeId: IconThemeId = 'material'
): string {
  const iconMap = THEME_ICON_MAPS[themeId];

  // Guard against missing/empty icon map
  if (Object.keys(iconMap).length === 0) {
    return '';
  }

  // Get the icon name from the mapping logic (handles open state internally)
  const iconName = getFolderIconName(folderName, isOpen);

  // Try specific folder icon first, then fallback to default folder
  const fallbackIcon = isOpen ? 'folder-open' : 'folder';
  const url = iconMap[iconName] ?? iconMap[fallbackIcon];

  return url ?? '';
}

/**
 * Checks if a URL string represents a valid icon URL.
 * Used by components to determine whether to render an <img> or inline SVG fallback.
 *
 * @param url - The URL to check
 * @returns true if the URL is non-empty, false otherwise
 *
 * @example
 * hasIconUrl('/assets/typescript.svg')  // -> true
 * hasIconUrl('')                        // -> false
 */
export function hasIconUrl(url: string): boolean {
  return url.length > 0;
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Returns the raw icon map for the specified theme.
 * Intended for debugging and testing only.
 *
 * @param themeId - The theme to get the icon map for
 * @returns The frozen icon map record
 *
 * @internal
 */
export function __DEBUG_getIconMap(
  themeId: IconThemeId = 'material'
): Readonly<Record<string, string>> {
  return THEME_ICON_MAPS[themeId];
}
