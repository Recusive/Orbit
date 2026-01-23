/**
 * Icon Theme Validation
 *
 * Zod schemas and validation functions for custom icon theme manifests.
 * Used to validate themes loaded from ~/.orbit/icon-themes/
 *
 * @module types/icon-theme
 */

import { z } from 'zod';

// ============================================================================
// Required Icons Constant
// ============================================================================

/**
 * Icons that must be present in every theme.
 * These serve as fallbacks when specific file/folder icons are not defined.
 */
export const REQUIRED_ICONS = ['document', 'folder', 'folder-open'] as const;

export type RequiredIcon = (typeof REQUIRED_ICONS)[number];

// ============================================================================
// Zod Schema Definition
// ============================================================================

/**
 * Regex patterns for manifest validation
 */
const ID_PATTERN = /^[a-z0-9-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Dark mode strategies for icon themes.
 *
 * - `invert`: Apply CSS invert filter in dark mode (simple, works for monochrome icons)
 * - `variants`: Theme provides separate dark mode icon variants (e.g., icon-dark.svg)
 * - `none`: Icons work in both modes without modification (colorful icons)
 */
export const DarkModeStrategySchema = z.enum(['invert', 'variants', 'none']);

/**
 * Schema for the icons object within a manifest.
 *
 * Required keys: document, folder, folder-open
 * Additional keys allowed via passthrough for file-specific icons.
 *
 * Values are relative paths to SVG files within the theme directory.
 */
export const IconMappingsSchema = z
  .object({
    /** Default icon for files without a specific mapping */
    document: z.string().min(1),
    /** Default icon for closed folders */
    folder: z.string().min(1),
    /** Default icon for open/expanded folders */
    'folder-open': z.string().min(1),
  })
  .loose();

/**
 * Schema for a custom icon theme manifest (theme.json).
 *
 * @example
 * {
 *   "id": "seti-icons",
 *   "name": "Seti Icons",
 *   "version": "1.0.0",
 *   "description": "Seti UI icons adapted for Orbit",
 *   "author": "Jesse Weed",
 *   "darkMode": "variants",
 *   "icons": {
 *     "document": "default-file.svg",
 *     "folder": "folder.svg",
 *     "folder-open": "folder-open.svg",
 *     "typescript": "typescript.svg",
 *     "javascript": "javascript.svg"
 *   }
 * }
 */
export const IconThemeManifestSchema = z.object({
  /**
   * Unique identifier for the theme.
   * Lowercase alphanumeric with hyphens only.
   * Used as the theme directory name and in settings.
   */
  id: z
    .string()
    .min(1, 'Theme ID is required')
    .max(50, 'Theme ID must be 50 characters or less')
    .regex(ID_PATTERN, 'Theme ID must be lowercase alphanumeric with hyphens only'),

  /**
   * Human-readable theme name for display in settings UI.
   */
  name: z
    .string()
    .min(1, 'Theme name is required')
    .max(50, 'Theme name must be 50 characters or less'),

  /**
   * Semantic version of the theme.
   * Format: major.minor.patch (e.g., "1.0.0")
   */
  version: z.string().regex(SEMVER_PATTERN, 'Version must be in semver format (e.g., "1.0.0")'),

  /**
   * Optional description of the theme.
   */
  description: z.string().max(200).optional(),

  /**
   * Optional author name or attribution.
   */
  author: z.string().max(100).optional(),

  /**
   * How this theme handles dark mode.
   * Defaults to 'none' if not specified.
   */
  darkMode: DarkModeStrategySchema.default('none'),

  /**
   * Mapping of icon names to SVG file paths.
   * Must include required icons (document, folder, folder-open).
   * Additional mappings for file extensions and specific filenames are optional.
   */
  icons: IconMappingsSchema,
});

// ============================================================================
// Exported Types
// ============================================================================

/**
 * Validated icon theme manifest type.
 * Inferred from the Zod schema for type safety.
 */
export type IconThemeManifest = z.infer<typeof IconThemeManifestSchema>;

/**
 * Dark mode strategy type.
 */
export type DarkModeStrategy = z.infer<typeof DarkModeStrategySchema>;

/**
 * Icon mappings type (includes required + additional icons).
 */
export type IconMappings = z.infer<typeof IconMappingsSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates raw data against the icon theme manifest schema.
 *
 * @param data - Unknown data to validate (typically parsed JSON)
 * @returns Validated and typed manifest
 * @throws {z.ZodError} When validation fails with detailed error messages
 *
 * @example
 * try {
 *   const manifest = validateThemeManifest(JSON.parse(jsonString));
 *   console.log(manifest.name); // Type-safe access
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Invalid manifest:', error.issues);
 *   }
 * }
 */
export function validateThemeManifest(data: unknown): IconThemeManifest {
  return IconThemeManifestSchema.parse(data);
}

/**
 * Safely validates manifest data without throwing.
 *
 * @param data - Unknown data to validate
 * @returns Validated manifest or null if validation fails
 *
 * @example
 * const manifest = safeValidateThemeManifest(data);
 * if (manifest !== null) {
 *   console.log(manifest.name); // Type-safe access
 * } else {
 *   console.error('Invalid manifest');
 * }
 */
export function safeValidateThemeManifest(data: unknown): IconThemeManifest | null {
  const result = IconThemeManifestSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Checks if an icon map contains all required icons.
 *
 * @param iconMap - Record of icon name to URL/path
 * @returns Array of missing required icon names (empty if all present)
 *
 * @example
 * const missing = validateThemeCompleteness({
 *   'document': '/path/to/doc.svg',
 *   'folder': '/path/to/folder.svg',
 *   // 'folder-open' is missing
 * });
 * console.log(missing); // ['folder-open']
 */
export function validateThemeCompleteness(
  iconMap: Readonly<Record<string, string>>
): readonly RequiredIcon[] {
  const missing: RequiredIcon[] = [];

  for (const required of REQUIRED_ICONS) {
    const iconPath = iconMap[required];
    if (iconPath === undefined || iconPath.length === 0) {
      missing.push(required);
    }
  }

  return missing;
}

/**
 * Type guard to check if a value is a valid dark mode strategy.
 *
 * @param value - Value to check
 * @returns True if value is a valid dark mode strategy
 */
export function isDarkModeStrategy(value: unknown): value is DarkModeStrategy {
  return DarkModeStrategySchema.safeParse(value).success;
}

// ============================================================================
// Future: VS Code Icon Theme Compatibility
// ============================================================================

/**
 * VS Code icon theme package.json contribution structure.
 * Reference: https://code.visualstudio.com/api/extension-guides/file-icon-theme
 *
 * This interface documents the VS Code format for future implementation
 * of a converter that can load VS Code-compatible icon themes.
 *
 * @future Implementation planned for Phase 5
 */
export interface VSCodeIconThemeContribution {
  readonly id: string;
  readonly label: string;
  readonly path: string; // Path to the icon theme JSON file
}

/**
 * VS Code icon theme definition file structure.
 *
 * VS Code themes use a different format with:
 * - fileExtensions: Map extension to icon ID
 * - fileNames: Map exact filename to icon ID
 * - folderNames: Map folder name to icon ID
 * - languageIds: Map VS Code language ID to icon ID
 * - iconDefinitions: Map icon ID to { iconPath: string }
 *
 * @future Implementation planned for Phase 5
 */
export interface VSCodeIconThemeDefinition {
  readonly iconDefinitions: Readonly<Record<string, { iconPath: string }>>;
  readonly file?: string; // Default file icon ID
  readonly folder?: string; // Default folder icon ID
  readonly folderExpanded?: string; // Default open folder icon ID
  readonly fileExtensions?: Readonly<Record<string, string>>;
  readonly fileNames?: Readonly<Record<string, string>>;
  readonly folderNames?: Readonly<Record<string, string>>;
  readonly folderNamesExpanded?: Readonly<Record<string, string>>;
  readonly languageIds?: Readonly<Record<string, string>>;
  readonly light?: Partial<Omit<VSCodeIconThemeDefinition, 'iconDefinitions' | 'light'>>;
  readonly highContrast?: Partial<
    Omit<VSCodeIconThemeDefinition, 'iconDefinitions' | 'highContrast'>
  >;
}

/**
 * Converts a VS Code icon theme to Orbit's manifest format.
 *
 * @param vsCodeTheme - VS Code icon theme definition
 * @param metadata - Additional metadata (id, name, version)
 * @returns Orbit IconThemeManifest
 *
 * @future Implementation planned for Phase 5
 *
 * @example
 * // Future usage:
 * const vsCodeDef = JSON.parse(await readFile('icon-theme.json'));
 * const orbitManifest = convertVSCodeTheme(vsCodeDef, {
 *   id: 'material-icon-theme',
 *   name: 'Material Icon Theme',
 *   version: '1.0.0'
 * });
 */
// export function convertVSCodeTheme(
//   vsCodeTheme: VSCodeIconThemeDefinition,
//   metadata: { id: string; name: string; version: string }
// ): IconThemeManifest {
//   // TODO: Implement VS Code theme conversion
//   // 1. Extract iconDefinitions paths
//   // 2. Map fileExtensions/fileNames to our icons format
//   // 3. Determine darkMode strategy from light/highContrast presence
//   throw new Error('Not implemented');
// }
