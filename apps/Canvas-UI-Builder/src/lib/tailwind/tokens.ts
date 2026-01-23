/**
 * Tailwind Token Mappings
 *
 * Single source of truth for Tailwind CSS scale values.
 * These maps enable bidirectional conversion between CSS values and Tailwind classes.
 *
 * @module
 */

// ============================================
// Types
// ============================================

/**
 * Token definition with CSS value and Tailwind suffix
 */
export interface TailwindToken {
  /** CSS value (e.g., "4px", "0.875rem") */
  readonly value: string;
  /** Tailwind class suffix (e.g., "sm", "lg", "2xl") */
  readonly suffix: string;
}

/**
 * Bidirectional lookup maps for O(1) conversions
 */
export interface TokenMaps {
  /** CSS value → Tailwind suffix */
  readonly valueToClass: ReadonlyMap<string, string>;
  /** Tailwind suffix → CSS value */
  readonly classToValue: ReadonlyMap<string, string>;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Builds bidirectional lookup maps from token definitions.
 * Used at module load time for O(1) lookups (rule: js-index-maps).
 *
 * @param tokens - Array of value/suffix pairs
 * @returns Bidirectional lookup maps
 */
export function buildTokenMaps(tokens: readonly TailwindToken[]): TokenMaps {
  const valueToClass = new Map<string, string>();
  const classToValue = new Map<string, string>();

  for (const { value, suffix } of tokens) {
    valueToClass.set(value, suffix);
    classToValue.set(suffix, value);
  }

  return {
    valueToClass,
    classToValue,
  };
}

/**
 * Builds a full Tailwind class from prefix and suffix
 */
export function buildClass(prefix: string, suffix: string): string {
  // Handle empty suffix (e.g., "rounded" not "rounded-")
  if (suffix === '') return prefix.replace(/-$/, '');
  return `${prefix}${suffix}`;
}

// ============================================
// Border Radius Tokens
// ============================================

/**
 * Tailwind border-radius scale
 * https://tailwindcss.com/docs/border-radius
 */
export const BORDER_RADIUS_TOKENS: readonly TailwindToken[] = [
  { value: '0px', suffix: 'none' },
  { value: '2px', suffix: 'sm' },
  { value: '4px', suffix: '' }, // Default "rounded"
  { value: '6px', suffix: 'md' },
  { value: '8px', suffix: 'lg' },
  { value: '12px', suffix: 'xl' },
  { value: '16px', suffix: '2xl' },
  { value: '24px', suffix: '3xl' },
  { value: '9999px', suffix: 'full' },
] as const;

export const borderRadiusMaps = buildTokenMaps(BORDER_RADIUS_TOKENS);

// ============================================
// Font Size Tokens
// ============================================

/**
 * Tailwind font-size scale
 * https://tailwindcss.com/docs/font-size
 */
export const FONT_SIZE_TOKENS: readonly TailwindToken[] = [
  { value: '12px', suffix: 'xs' },
  { value: '14px', suffix: 'sm' },
  { value: '16px', suffix: 'base' },
  { value: '18px', suffix: 'lg' },
  { value: '20px', suffix: 'xl' },
  { value: '24px', suffix: '2xl' },
  { value: '30px', suffix: '3xl' },
  { value: '36px', suffix: '4xl' },
  { value: '48px', suffix: '5xl' },
  { value: '60px', suffix: '6xl' },
  { value: '72px', suffix: '7xl' },
  { value: '96px', suffix: '8xl' },
  { value: '128px', suffix: '9xl' },
  // Also support rem values
  { value: '0.75rem', suffix: 'xs' },
  { value: '0.875rem', suffix: 'sm' },
  { value: '1rem', suffix: 'base' },
  { value: '1.125rem', suffix: 'lg' },
  { value: '1.25rem', suffix: 'xl' },
  { value: '1.5rem', suffix: '2xl' },
  { value: '1.875rem', suffix: '3xl' },
  { value: '2.25rem', suffix: '4xl' },
  { value: '3rem', suffix: '5xl' },
  { value: '3.75rem', suffix: '6xl' },
  { value: '4.5rem', suffix: '7xl' },
  { value: '6rem', suffix: '8xl' },
  { value: '8rem', suffix: '9xl' },
] as const;

export const fontSizeMaps = buildTokenMaps(FONT_SIZE_TOKENS);

// ============================================
// Font Weight Tokens
// ============================================

/**
 * Tailwind font-weight scale
 * https://tailwindcss.com/docs/font-weight
 */
export const FONT_WEIGHT_TOKENS: readonly TailwindToken[] = [
  { value: '100', suffix: 'thin' },
  { value: '200', suffix: 'extralight' },
  { value: '300', suffix: 'light' },
  { value: '400', suffix: 'normal' },
  { value: '500', suffix: 'medium' },
  { value: '600', suffix: 'semibold' },
  { value: '700', suffix: 'bold' },
  { value: '800', suffix: 'extrabold' },
  { value: '900', suffix: 'black' },
] as const;

export const fontWeightMaps = buildTokenMaps(FONT_WEIGHT_TOKENS);

// ============================================
// Spacing Tokens (padding, margin, gap, etc.)
// ============================================

/**
 * Tailwind spacing scale
 * https://tailwindcss.com/docs/customizing-spacing
 */
export const SPACING_TOKENS: readonly TailwindToken[] = [
  { value: '0px', suffix: '0' },
  { value: '1px', suffix: 'px' },
  { value: '2px', suffix: '0.5' },
  { value: '4px', suffix: '1' },
  { value: '6px', suffix: '1.5' },
  { value: '8px', suffix: '2' },
  { value: '10px', suffix: '2.5' },
  { value: '12px', suffix: '3' },
  { value: '14px', suffix: '3.5' },
  { value: '16px', suffix: '4' },
  { value: '20px', suffix: '5' },
  { value: '24px', suffix: '6' },
  { value: '28px', suffix: '7' },
  { value: '32px', suffix: '8' },
  { value: '36px', suffix: '9' },
  { value: '40px', suffix: '10' },
  { value: '44px', suffix: '11' },
  { value: '48px', suffix: '12' },
  { value: '56px', suffix: '14' },
  { value: '64px', suffix: '16' },
  { value: '80px', suffix: '20' },
  { value: '96px', suffix: '24' },
  { value: '112px', suffix: '28' },
  { value: '128px', suffix: '32' },
  { value: '144px', suffix: '36' },
  { value: '160px', suffix: '40' },
  { value: '176px', suffix: '44' },
  { value: '192px', suffix: '48' },
  { value: '208px', suffix: '52' },
  { value: '224px', suffix: '56' },
  { value: '240px', suffix: '60' },
  { value: '256px', suffix: '64' },
  { value: '288px', suffix: '72' },
  { value: '320px', suffix: '80' },
  { value: '384px', suffix: '96' },
  // Also support rem values
  { value: '0rem', suffix: '0' },
  { value: '0.125rem', suffix: '0.5' },
  { value: '0.25rem', suffix: '1' },
  { value: '0.375rem', suffix: '1.5' },
  { value: '0.5rem', suffix: '2' },
  { value: '0.625rem', suffix: '2.5' },
  { value: '0.75rem', suffix: '3' },
  { value: '0.875rem', suffix: '3.5' },
  { value: '1rem', suffix: '4' },
  { value: '1.25rem', suffix: '5' },
  { value: '1.5rem', suffix: '6' },
  { value: '1.75rem', suffix: '7' },
  { value: '2rem', suffix: '8' },
  { value: '2.25rem', suffix: '9' },
  { value: '2.5rem', suffix: '10' },
  { value: '2.75rem', suffix: '11' },
  { value: '3rem', suffix: '12' },
  { value: '3.5rem', suffix: '14' },
  { value: '4rem', suffix: '16' },
  { value: '5rem', suffix: '20' },
  { value: '6rem', suffix: '24' },
] as const;

export const spacingMaps = buildTokenMaps(SPACING_TOKENS);

// ============================================
// Line Height Tokens
// ============================================

/**
 * Tailwind line-height scale
 * https://tailwindcss.com/docs/line-height
 */
export const LINE_HEIGHT_TOKENS: readonly TailwindToken[] = [
  { value: '1', suffix: 'none' },
  { value: '1.25', suffix: 'tight' },
  { value: '1.375', suffix: 'snug' },
  { value: '1.5', suffix: 'normal' },
  { value: '1.625', suffix: 'relaxed' },
  { value: '2', suffix: 'loose' },
  // Fixed values
  { value: '12px', suffix: '3' },
  { value: '16px', suffix: '4' },
  { value: '20px', suffix: '5' },
  { value: '24px', suffix: '6' },
  { value: '28px', suffix: '7' },
  { value: '32px', suffix: '8' },
  { value: '36px', suffix: '9' },
  { value: '40px', suffix: '10' },
] as const;

export const lineHeightMaps = buildTokenMaps(LINE_HEIGHT_TOKENS);

// ============================================
// Letter Spacing Tokens
// ============================================

/**
 * Tailwind letter-spacing scale
 * https://tailwindcss.com/docs/letter-spacing
 */
export const LETTER_SPACING_TOKENS: readonly TailwindToken[] = [
  { value: '-0.05em', suffix: 'tighter' },
  { value: '-0.025em', suffix: 'tight' },
  { value: '0em', suffix: 'normal' },
  { value: '0.025em', suffix: 'wide' },
  { value: '0.05em', suffix: 'wider' },
  { value: '0.1em', suffix: 'widest' },
] as const;

export const letterSpacingMaps = buildTokenMaps(LETTER_SPACING_TOKENS);

// ============================================
// Opacity Tokens
// ============================================

/**
 * Tailwind opacity scale
 * https://tailwindcss.com/docs/opacity
 */
export const OPACITY_TOKENS: readonly TailwindToken[] = [
  { value: '0', suffix: '0' },
  { value: '0.05', suffix: '5' },
  { value: '0.1', suffix: '10' },
  { value: '0.15', suffix: '15' },
  { value: '0.2', suffix: '20' },
  { value: '0.25', suffix: '25' },
  { value: '0.3', suffix: '30' },
  { value: '0.35', suffix: '35' },
  { value: '0.4', suffix: '40' },
  { value: '0.45', suffix: '45' },
  { value: '0.5', suffix: '50' },
  { value: '0.55', suffix: '55' },
  { value: '0.6', suffix: '60' },
  { value: '0.65', suffix: '65' },
  { value: '0.7', suffix: '70' },
  { value: '0.75', suffix: '75' },
  { value: '0.8', suffix: '80' },
  { value: '0.85', suffix: '85' },
  { value: '0.9', suffix: '90' },
  { value: '0.95', suffix: '95' },
  { value: '1', suffix: '100' },
] as const;

export const opacityMaps = buildTokenMaps(OPACITY_TOKENS);

// ============================================
// Border Width Tokens
// ============================================

/**
 * Tailwind border-width scale
 * https://tailwindcss.com/docs/border-width
 */
export const BORDER_WIDTH_TOKENS: readonly TailwindToken[] = [
  { value: '0px', suffix: '0' },
  { value: '1px', suffix: '' }, // Default "border"
  { value: '2px', suffix: '2' },
  { value: '4px', suffix: '4' },
  { value: '8px', suffix: '8' },
] as const;

export const borderWidthMaps = buildTokenMaps(BORDER_WIDTH_TOKENS);

// ============================================
// Z-Index Tokens
// ============================================

/**
 * Tailwind z-index scale
 * https://tailwindcss.com/docs/z-index
 */
export const Z_INDEX_TOKENS: readonly TailwindToken[] = [
  { value: '0', suffix: '0' },
  { value: '10', suffix: '10' },
  { value: '20', suffix: '20' },
  { value: '30', suffix: '30' },
  { value: '40', suffix: '40' },
  { value: '50', suffix: '50' },
  { value: 'auto', suffix: 'auto' },
] as const;

export const zIndexMaps = buildTokenMaps(Z_INDEX_TOKENS);

// ============================================
// Width/Height Tokens
// ============================================

/**
 * Tailwind width scale (extends spacing)
 * https://tailwindcss.com/docs/width
 */
export const WIDTH_TOKENS: readonly TailwindToken[] = [
  ...SPACING_TOKENS,
  { value: 'auto', suffix: 'auto' },
  { value: '50%', suffix: '1/2' },
  { value: '33.333333%', suffix: '1/3' },
  { value: '66.666667%', suffix: '2/3' },
  { value: '25%', suffix: '1/4' },
  { value: '75%', suffix: '3/4' },
  { value: '20%', suffix: '1/5' },
  { value: '40%', suffix: '2/5' },
  { value: '60%', suffix: '3/5' },
  { value: '80%', suffix: '4/5' },
  { value: '16.666667%', suffix: '1/6' },
  { value: '83.333333%', suffix: '5/6' },
  { value: '100%', suffix: 'full' },
  { value: '100vw', suffix: 'screen' },
  { value: 'min-content', suffix: 'min' },
  { value: 'max-content', suffix: 'max' },
  { value: 'fit-content', suffix: 'fit' },
] as const;

export const widthMaps = buildTokenMaps(WIDTH_TOKENS);

// ============================================
// Color Palette
// ============================================

/**
 * Tailwind color shades
 */
export const COLOR_SHADES = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const;

export type ColorShade = (typeof COLOR_SHADES)[number];

/**
 * Base Tailwind color names
 */
export const COLOR_NAMES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

/**
 * Special color values
 */
export const SPECIAL_COLORS = ['inherit', 'current', 'transparent', 'black', 'white'] as const;

export type SpecialColor = (typeof SPECIAL_COLORS)[number];

/**
 * Build set for O(1) color name validation
 */
export const colorNameSet = new Set<string>(COLOR_NAMES);
export const colorShadeSet = new Set<string>(COLOR_SHADES);
export const specialColorSet = new Set<string>(SPECIAL_COLORS);
