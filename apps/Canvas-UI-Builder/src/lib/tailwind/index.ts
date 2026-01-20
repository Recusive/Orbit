/**
 * Tailwind CSS Utilities
 *
 * Bidirectional conversion between CSS properties and Tailwind classes.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { cssToTailwind, parseTailwindClass } from '@canvas/lib/tailwind';
 *
 * // CSS → Tailwind
 * const result = cssToTailwind('borderRadius', '8px');
 * // → { tailwindClass: 'rounded-lg', isArbitrary: false, conflictPrefix: 'rounded' }
 *
 * // Tailwind → CSS
 * const parsed = parseTailwindClass('text-sm');
 * // → { original: 'text-sm', property: 'fontSize', value: '14px', isArbitrary: false }
 * ```
 */

// Re-export mapper functions
export {
  classesConflict,
  colorToTailwind,
  cssToTailwind,
  findConflictingClasses,
  getConflictPrefix,
  getCssPropertyForClass,
  CONFLICT_PATTERNS,
  TailwindResultSchema,
} from './mapper';

export type { TailwindResult } from './mapper';

// Re-export parser functions
export {
  directionToSuffix,
  parseClassByContext,
  parsedClassesToCssObject,
  parseTailwindClass,
  parseTailwindClasses,
  spacingScaleToValue,
} from './parser';

export type { ParsedTailwindClass } from './parser';

// Re-export commonly used tokens
export {
  // Token arrays
  BORDER_RADIUS_TOKENS,
  BORDER_WIDTH_TOKENS,
  COLOR_NAMES,
  COLOR_SHADES,
  FONT_SIZE_TOKENS,
  FONT_WEIGHT_TOKENS,
  LETTER_SPACING_TOKENS,
  LINE_HEIGHT_TOKENS,
  OPACITY_TOKENS,
  SPACING_TOKENS,
  // Token maps (for advanced usage)
  borderRadiusMaps,
  borderWidthMaps,
  fontSizeMaps,
  fontWeightMaps,
  letterSpacingMaps,
  lineHeightMaps,
  opacityMaps,
  spacingMaps,
  // Helpers
  buildClass,
  buildTokenMaps,
} from './tokens';

export type { TailwindToken, TokenMaps } from './tokens';
