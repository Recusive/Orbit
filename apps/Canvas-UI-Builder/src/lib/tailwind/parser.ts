/**
 * Tailwind to CSS Parser
 *
 * Parses Tailwind classes back to CSS property-value pairs.
 * Handles disambiguation for ambiguous prefixes like "text-*" and "font-*".
 *
 * @module
 */

import {
  borderRadiusMaps,
  borderWidthMaps,
  colorNameSet,
  colorShadeSet,
  fontSizeMaps,
  fontWeightMaps,
  letterSpacingMaps,
  lineHeightMaps,
  opacityMaps,
  spacingMaps,
  specialColorSet,
} from './tokens';

// ============================================
// Types
// ============================================

/**
 * Result of parsing a Tailwind class
 */
export interface ParsedTailwindClass {
  /** Original class name */
  original: string;
  /** CSS property name (camelCase) */
  property: string;
  /** CSS value (with units) */
  value: string;
  /** Responsive/state variant prefix (e.g., "hover", "md") */
  variant?: string;
  /** Whether this is an arbitrary value class */
  isArbitrary: boolean;
}

// ============================================
// Disambiguation Keywords
// ============================================

/**
 * Font size keywords in the Tailwind scale
 */
const FONT_SIZE_KEYWORDS = new Set([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
]);

/**
 * Text alignment keywords
 */
const TEXT_ALIGN_KEYWORDS = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

/**
 * Font weight keywords in the Tailwind scale
 */
const FONT_WEIGHT_KEYWORDS = new Set([
  'thin',
  'extralight',
  'light',
  'normal',
  'medium',
  'semibold',
  'bold',
  'extrabold',
  'black',
]);

/**
 * Font style keywords
 * Note: Used for reference, actual parsing is done in parseSingleWordClass
 */
const _FONT_STYLE_KEYWORDS = new Set(['italic', 'not-italic']);
void _FONT_STYLE_KEYWORDS; // Reserved for future enhanced parsing

// ============================================
// Helper Functions
// ============================================

/**
 * Extract variant prefix from class (e.g., "hover:text-red-500" → ["hover", "text-red-500"])
 */
function extractVariant(className: string): { variant?: string; baseClass: string } {
  const colonIndex = className.indexOf(':');
  if (colonIndex === -1) {
    return { baseClass: className };
  }

  return {
    variant: className.slice(0, colonIndex),
    baseClass: className.slice(colonIndex + 1),
  };
}

/**
 * Extract arbitrary value from class (e.g., "text-[14px]" → "14px")
 */
function extractArbitraryValue(className: string): string | null {
  const match = /\[([^\]]+)\]$/.exec(className);
  return match?.[1] ?? null;
}

/**
 * Check if a suffix looks like a Tailwind color
 * e.g., "red-500", "slate-900", "white", "transparent"
 */
function isColorSuffix(suffix: string): boolean {
  // Check special colors
  if (specialColorSet.has(suffix)) {
    return true;
  }

  // Check palette colors (e.g., "red-500")
  const parts = suffix.split('-');
  if (parts.length === 2) {
    const colorName = parts[0];
    const shade = parts[1];
    if (colorName && shade) {
      return colorNameSet.has(colorName) && colorShadeSet.has(shade);
    }
  }

  return false;
}

/**
 * Convert spacing scale suffix to CSS value
 */
export function spacingScaleToValue(suffix: string): string | null {
  return spacingMaps.classToValue.get(suffix) ?? null;
}

/**
 * Convert direction suffix to CSS property suffix
 */
export function directionToSuffix(direction: string): string {
  const directionMap: Record<string, string> = {
    t: 'Top',
    r: 'Right',
    b: 'Bottom',
    l: 'Left',
    x: 'Inline',
    y: 'Block',
  };
  return directionMap[direction] ?? '';
}

// ============================================
// Main Parser Functions
// ============================================

/**
 * Parse a single Tailwind class to CSS property-value pair
 *
 * @param className - Tailwind class (e.g., "text-sm", "p-4", "bg-red-500")
 * @returns Parsed result or null if not recognized
 *
 * @example
 * parseTailwindClass('text-sm')
 * // → { original: 'text-sm', property: 'fontSize', value: '14px', isArbitrary: false }
 *
 * @example
 * parseTailwindClass('text-center')
 * // → { original: 'text-center', property: 'textAlign', value: 'center', isArbitrary: false }
 *
 * @example
 * parseTailwindClass('text-red-500')
 * // → { original: 'text-red-500', property: 'color', value: 'red-500', isArbitrary: false }
 */
export function parseTailwindClass(className: string): ParsedTailwindClass | null {
  // Extract variant if present
  const { variant, baseClass } = extractVariant(className);

  // Handle negative prefix
  const isNegative = baseClass.startsWith('-');
  const positiveClass = isNegative ? baseClass.slice(1) : baseClass;

  // Try context-aware parsing
  const result = parseClassByContext(positiveClass);
  if (!result) return null;

  // Apply negative sign to value if needed (only for margin)
  let finalValue = result.value;
  if (isNegative && result.property.startsWith('margin')) {
    finalValue = `-${result.value}`;
  }

  // Build result object - only include variant if defined (exactOptionalPropertyTypes)
  const parsed: ParsedTailwindClass = {
    original: className,
    property: result.property,
    value: finalValue,
    isArbitrary: result.isArbitrary,
  };

  if (variant) {
    parsed.variant = variant;
  }

  return parsed;
}

/**
 * Parse a Tailwind class with context-aware disambiguation
 *
 * Handles ambiguous prefixes:
 * - "text-*": fontSize vs color vs textAlign
 * - "font-*": fontWeight vs fontFamily
 */
export function parseClassByContext(
  className: string
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Check for arbitrary value
  const arbitraryValue = extractArbitraryValue(className);

  // Handle single-word utilities
  const singleWordResult = parseSingleWordClass(className);
  if (singleWordResult) return singleWordResult;

  // Split class into prefix and suffix
  const firstDash = className.indexOf('-');
  if (firstDash === -1) return null;

  const prefix = className.slice(0, firstDash);
  const suffix = className.slice(firstDash + 1);

  // Handle text-* disambiguation
  if (prefix === 'text') {
    return parseTextClass(suffix, arbitraryValue);
  }

  // Handle font-* disambiguation
  if (prefix === 'font') {
    return parseFontClass(suffix, arbitraryValue);
  }

  // Handle spacing prefixes (p, px, py, pt, etc.)
  if (isSpacingPrefix(prefix)) {
    return parseSpacingClass(prefix, suffix, arbitraryValue);
  }

  // Handle margin prefixes (m, mx, my, mt, etc.)
  if (isMarginPrefix(prefix)) {
    return parseMarginClass(prefix, suffix, arbitraryValue);
  }

  // Handle bg-* (background color)
  if (prefix === 'bg') {
    return parseBackgroundClass(suffix, arbitraryValue);
  }

  // Handle border-* (border color, width, style)
  if (prefix === 'border') {
    return parseBorderClass(suffix, arbitraryValue);
  }

  // Handle rounded-* (border radius)
  if (prefix === 'rounded') {
    return parseRoundedClass(suffix, arbitraryValue);
  }

  // Handle gap-*
  if (prefix === 'gap') {
    return parseGapClass(suffix, arbitraryValue);
  }

  // Handle leading-* (line height)
  if (prefix === 'leading') {
    return parseLeadingClass(suffix, arbitraryValue);
  }

  // Handle tracking-* (letter spacing)
  if (prefix === 'tracking') {
    return parseTrackingClass(suffix, arbitraryValue);
  }

  // Handle opacity-*
  if (prefix === 'opacity') {
    return parseOpacityClass(suffix, arbitraryValue);
  }

  // Handle w-* (width)
  if (prefix === 'w') {
    return parseWidthClass(suffix, arbitraryValue);
  }

  // Handle h-* (height)
  if (prefix === 'h') {
    return parseHeightClass(suffix, arbitraryValue);
  }

  // Handle items-* (align-items)
  if (prefix === 'items') {
    return parseAlignItemsClass(suffix);
  }

  // Handle justify-* (justify-content)
  if (prefix === 'justify') {
    return parseJustifyClass(suffix);
  }

  // Handle z-* (z-index)
  if (prefix === 'z') {
    return parseZIndexClass(suffix, arbitraryValue);
  }

  return null;
}

// ============================================
// Specialized Parsers
// ============================================

/**
 * Parse single-word utility classes
 */
function parseSingleWordClass(
  className: string
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Display utilities
  const displayMap: Record<string, string> = {
    block: 'block',
    inline: 'inline',
    'inline-block': 'inline-block',
    flex: 'flex',
    'inline-flex': 'inline-flex',
    grid: 'grid',
    'inline-grid': 'inline-grid',
    hidden: 'none',
    contents: 'contents',
  };

  if (displayMap[className]) {
    return {
      property: 'display',
      value: displayMap[className],
      isArbitrary: false,
    };
  }

  // Position utilities
  const positionMap: Record<string, string> = {
    static: 'static',
    relative: 'relative',
    absolute: 'absolute',
    fixed: 'fixed',
    sticky: 'sticky',
  };

  if (positionMap[className]) {
    return {
      property: 'position',
      value: positionMap[className],
      isArbitrary: false,
    };
  }

  // Font style
  if (className === 'italic') {
    return { property: 'fontStyle', value: 'italic', isArbitrary: false };
  }
  if (className === 'not-italic') {
    return { property: 'fontStyle', value: 'normal', isArbitrary: false };
  }

  // Text decoration
  if (className === 'underline') {
    return { property: 'textDecoration', value: 'underline', isArbitrary: false };
  }
  if (className === 'line-through') {
    return { property: 'textDecoration', value: 'line-through', isArbitrary: false };
  }
  if (className === 'no-underline') {
    return { property: 'textDecoration', value: 'none', isArbitrary: false };
  }

  // Text transform
  if (className === 'uppercase') {
    return { property: 'textTransform', value: 'uppercase', isArbitrary: false };
  }
  if (className === 'lowercase') {
    return { property: 'textTransform', value: 'lowercase', isArbitrary: false };
  }
  if (className === 'capitalize') {
    return { property: 'textTransform', value: 'capitalize', isArbitrary: false };
  }
  if (className === 'normal-case') {
    return { property: 'textTransform', value: 'none', isArbitrary: false };
  }

  return null;
}

/**
 * Parse text-* classes (fontSize, color, or textAlign)
 */
function parseTextClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Handle arbitrary value
  if (arbitraryValue) {
    // Arbitrary colors start with # or rgb/hsl
    if (
      arbitraryValue.startsWith('#') ||
      arbitraryValue.startsWith('rgb') ||
      arbitraryValue.startsWith('hsl') ||
      arbitraryValue.startsWith('oklch')
    ) {
      return {
        property: 'color',
        value: arbitraryValue,
        isArbitrary: true,
      };
    }
    // Assume font size for numeric arbitrary values
    return {
      property: 'fontSize',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Check for text alignment keywords
  if (TEXT_ALIGN_KEYWORDS.has(suffix)) {
    return {
      property: 'textAlign',
      value: suffix,
      isArbitrary: false,
    };
  }

  // Check for font size keywords
  if (FONT_SIZE_KEYWORDS.has(suffix)) {
    const cssValue = fontSizeMaps.classToValue.get(suffix);
    return {
      property: 'fontSize',
      value: cssValue ?? suffix,
      isArbitrary: false,
    };
  }

  // Check for color (palette color like "red-500" or special color like "white")
  if (isColorSuffix(suffix)) {
    return {
      property: 'color',
      value: suffix,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse font-* classes (fontWeight or fontFamily)
 */
function parseFontClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Handle arbitrary value
  if (arbitraryValue) {
    // Numeric values are font weights
    if (/^\d+$/.test(arbitraryValue)) {
      return {
        property: 'fontWeight',
        value: arbitraryValue,
        isArbitrary: true,
      };
    }
    // String values (possibly quoted) are font families
    return {
      property: 'fontFamily',
      value: arbitraryValue.replace(/_/g, ' '),
      isArbitrary: true,
    };
  }

  // Check for font weight keywords
  if (FONT_WEIGHT_KEYWORDS.has(suffix)) {
    const cssValue = fontWeightMaps.classToValue.get(suffix);
    return {
      property: 'fontWeight',
      value: cssValue ?? suffix,
      isArbitrary: false,
    };
  }

  // Known font family shortcuts
  const fontFamilyMap: Record<string, string> = {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
  };

  const fontFamily = fontFamilyMap[suffix];
  if (fontFamily) {
    return {
      property: 'fontFamily',
      value: fontFamily,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Check if prefix is a padding prefix
 */
function isSpacingPrefix(prefix: string): boolean {
  return /^p[trblxy]?$/.test(prefix);
}

/**
 * Check if prefix is a margin prefix
 */
function isMarginPrefix(prefix: string): boolean {
  return /^m[trblxy]?$/.test(prefix);
}

/**
 * Parse padding classes
 */
function parseSpacingClass(
  prefix: string,
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Determine property based on prefix
  let property = 'padding';
  if (prefix.length > 1) {
    const direction = prefix.slice(1);
    property = `padding${directionToSuffix(direction)}`;
  }

  // Handle arbitrary value
  if (arbitraryValue) {
    return {
      property,
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Look up in spacing scale
  const cssValue = spacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property,
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse margin classes
 */
function parseMarginClass(
  prefix: string,
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Determine property based on prefix
  let property = 'margin';
  if (prefix.length > 1) {
    const direction = prefix.slice(1);
    property = `margin${directionToSuffix(direction)}`;
  }

  // Handle arbitrary value
  if (arbitraryValue) {
    return {
      property,
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Look up in spacing scale
  const cssValue = spacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property,
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse background color classes
 */
function parseBackgroundClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'backgroundColor',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  if (isColorSuffix(suffix)) {
    return {
      property: 'backgroundColor',
      value: suffix,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse border classes (color, width, style)
 */
function parseBorderClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Handle arbitrary value
  if (arbitraryValue) {
    // Color if hex/rgb/hsl
    if (
      arbitraryValue.startsWith('#') ||
      arbitraryValue.startsWith('rgb') ||
      arbitraryValue.startsWith('hsl')
    ) {
      return {
        property: 'borderColor',
        value: arbitraryValue,
        isArbitrary: true,
      };
    }
    // Otherwise assume width
    return {
      property: 'borderWidth',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Border style keywords
  const borderStyleMap: Record<string, string> = {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted',
    double: 'double',
    none: 'none',
  };

  if (borderStyleMap[suffix]) {
    return {
      property: 'borderStyle',
      value: borderStyleMap[suffix],
      isArbitrary: false,
    };
  }

  // Border width (number suffixes)
  const widthValue = borderWidthMaps.classToValue.get(suffix);
  if (widthValue) {
    return {
      property: 'borderWidth',
      value: widthValue,
      isArbitrary: false,
    };
  }

  // Border color
  if (isColorSuffix(suffix)) {
    return {
      property: 'borderColor',
      value: suffix,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse rounded-* classes (border-radius)
 */
function parseRoundedClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'borderRadius',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  const cssValue = borderRadiusMaps.classToValue.get(suffix);
  if (cssValue !== undefined) {
    return {
      property: 'borderRadius',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse gap-* classes
 */
function parseGapClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  // Handle gap-x-* and gap-y-*
  if (suffix.startsWith('x-') || suffix.startsWith('y-')) {
    const direction = suffix[0];
    const scaleSuffix = suffix.slice(2);
    const property = direction === 'x' ? 'columnGap' : 'rowGap';

    if (arbitraryValue) {
      return { property, value: arbitraryValue, isArbitrary: true };
    }

    const cssValue = spacingMaps.classToValue.get(scaleSuffix);
    if (cssValue) {
      return { property, value: cssValue, isArbitrary: false };
    }
    return null;
  }

  if (arbitraryValue) {
    return {
      property: 'gap',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  const cssValue = spacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'gap',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse leading-* classes (line-height)
 */
function parseLeadingClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'lineHeight',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  const cssValue = lineHeightMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'lineHeight',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse tracking-* classes (letter-spacing)
 */
function parseTrackingClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'letterSpacing',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  const cssValue = letterSpacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'letterSpacing',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse opacity-* classes
 */
function parseOpacityClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'opacity',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  const cssValue = opacityMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'opacity',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse w-* classes (width)
 */
function parseWidthClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'width',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Special width values
  const specialWidths: Record<string, string> = {
    auto: 'auto',
    full: '100%',
    screen: '100vw',
    min: 'min-content',
    max: 'max-content',
    fit: 'fit-content',
  };

  if (specialWidths[suffix]) {
    return {
      property: 'width',
      value: specialWidths[suffix],
      isArbitrary: false,
    };
  }

  // Fraction widths
  if (suffix.includes('/')) {
    const fractionMap: Record<string, string> = {
      '1/2': '50%',
      '1/3': '33.333333%',
      '2/3': '66.666667%',
      '1/4': '25%',
      '3/4': '75%',
      '1/5': '20%',
      '2/5': '40%',
      '3/5': '60%',
      '4/5': '80%',
    };
    const percentage = fractionMap[suffix];
    if (percentage) {
      return {
        property: 'width',
        value: percentage,
        isArbitrary: false,
      };
    }
  }

  // Spacing scale
  const cssValue = spacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'width',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse h-* classes (height)
 */
function parseHeightClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'height',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Special height values
  const specialHeights: Record<string, string> = {
    auto: 'auto',
    full: '100%',
    screen: '100vh',
    min: 'min-content',
    max: 'max-content',
    fit: 'fit-content',
  };

  if (specialHeights[suffix]) {
    return {
      property: 'height',
      value: specialHeights[suffix],
      isArbitrary: false,
    };
  }

  // Spacing scale
  const cssValue = spacingMaps.classToValue.get(suffix);
  if (cssValue) {
    return {
      property: 'height',
      value: cssValue,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse items-* classes (align-items)
 */
function parseAlignItemsClass(
  suffix: string
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  const alignMap: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    baseline: 'baseline',
    stretch: 'stretch',
  };

  const value = alignMap[suffix];
  if (value) {
    return {
      property: 'alignItems',
      value,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse justify-* classes (justify-content)
 */
function parseJustifyClass(
  suffix: string
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  const justifyMap: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  };

  const value = justifyMap[suffix];
  if (value) {
    return {
      property: 'justifyContent',
      value,
      isArbitrary: false,
    };
  }

  return null;
}

/**
 * Parse z-* classes (z-index)
 */
function parseZIndexClass(
  suffix: string,
  arbitraryValue: string | null
): Omit<ParsedTailwindClass, 'original' | 'variant'> | null {
  if (arbitraryValue) {
    return {
      property: 'zIndex',
      value: arbitraryValue,
      isArbitrary: true,
    };
  }

  // Standard z-index values
  const zIndexMap: Record<string, string> = {
    '0': '0',
    '10': '10',
    '20': '20',
    '30': '30',
    '40': '40',
    '50': '50',
    auto: 'auto',
  };

  const value = zIndexMap[suffix];
  if (value) {
    return {
      property: 'zIndex',
      value,
      isArbitrary: false,
    };
  }

  return null;
}

// ============================================
// Batch Parsing
// ============================================

/**
 * Parse multiple Tailwind classes
 *
 * @param classString - Space-separated Tailwind classes
 * @returns Array of parsed results (skipping unrecognized classes)
 */
export function parseTailwindClasses(classString: string): ParsedTailwindClass[] {
  const classes = classString.split(/\s+/).filter(Boolean);
  const results: ParsedTailwindClass[] = [];

  for (const cls of classes) {
    const parsed = parseTailwindClass(cls);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Convert parsed classes to a CSS object
 *
 * @param classes - Array of parsed Tailwind classes
 * @returns CSS property-value object
 */
export function parsedClassesToCssObject(
  classes: readonly ParsedTailwindClass[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const cls of classes) {
    // Skip classes with variants for now (they need special handling)
    if (!cls.variant) {
      result[cls.property] = cls.value;
    }
  }

  return result;
}
