/**
 * CSS to Tailwind Mapper
 *
 * Converts CSS property-value pairs to Tailwind classes with conflict detection.
 * Handles both standard scale values and arbitrary values.
 *
 * @module
 */

import { z } from 'zod';

import {
  borderRadiusMaps,
  borderWidthMaps,
  buildClass,
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
// Schemas
// ============================================

/**
 * Result of CSS to Tailwind conversion
 */
export const TailwindResultSchema = z.object({
  /** The Tailwind class name */
  tailwindClass: z.string(),
  /** Whether this uses arbitrary value syntax (e.g., `rounded-[7px]`) */
  isArbitrary: z.boolean(),
  /** Prefix used for conflict detection (e.g., "rounded" for "rounded-lg") */
  conflictPrefix: z.string(),
});

export type TailwindResult = z.infer<typeof TailwindResultSchema>;

// ============================================
// Conflict Patterns
// ============================================

/**
 * CSS property → conflict prefix mapping
 * Classes with the same prefix conflict with each other.
 *
 * The "text-*" prefix is tricky because it can mean:
 * - fontSize (text-sm, text-lg)
 * - color (text-red-500)
 * - textAlign (text-center)
 *
 * We handle this by using the CSS property name as the key.
 */
export const CONFLICT_PATTERNS: Readonly<Record<string, string>> = {
  // Typography
  fontSize: 'text',
  fontWeight: 'font',
  fontFamily: 'font',
  fontStyle: 'italic',
  letterSpacing: 'tracking',
  lineHeight: 'leading',
  textAlign: 'text',
  textDecoration: 'underline',
  textTransform: 'uppercase',

  // Colors
  color: 'text',
  backgroundColor: 'bg',
  borderColor: 'border',
  outlineColor: 'outline',

  // Spacing
  padding: 'p',
  paddingTop: 'pt',
  paddingRight: 'pr',
  paddingBottom: 'pb',
  paddingLeft: 'pl',
  paddingInline: 'px',
  paddingBlock: 'py',
  margin: 'm',
  marginTop: 'mt',
  marginRight: 'mr',
  marginBottom: 'mb',
  marginLeft: 'ml',
  marginInline: 'mx',
  marginBlock: 'my',
  gap: 'gap',
  rowGap: 'gap-y',
  columnGap: 'gap-x',

  // Sizing
  width: 'w',
  minWidth: 'min-w',
  maxWidth: 'max-w',
  height: 'h',
  minHeight: 'min-h',
  maxHeight: 'max-h',

  // Border
  borderRadius: 'rounded',
  borderTopLeftRadius: 'rounded-tl',
  borderTopRightRadius: 'rounded-tr',
  borderBottomRightRadius: 'rounded-br',
  borderBottomLeftRadius: 'rounded-bl',
  borderWidth: 'border',
  borderTopWidth: 'border-t',
  borderRightWidth: 'border-r',
  borderBottomWidth: 'border-b',
  borderLeftWidth: 'border-l',
  borderStyle: 'border',

  // Effects
  opacity: 'opacity',
  boxShadow: 'shadow',

  // Layout
  display: 'display',
  position: 'position',
  zIndex: 'z',
  overflow: 'overflow',
  overflowX: 'overflow-x',
  overflowY: 'overflow-y',

  // Flexbox
  flexDirection: 'flex',
  flexWrap: 'flex',
  alignItems: 'items',
  justifyContent: 'justify',
  alignSelf: 'self',
  flex: 'flex',
  flexGrow: 'grow',
  flexShrink: 'shrink',

  // Grid
  gridTemplateColumns: 'grid-cols',
  gridTemplateRows: 'grid-rows',
  gridColumn: 'col',
  gridRow: 'row',
} as const;

// ============================================
// Color Handling
// ============================================

/**
 * Hex color regex patterns
 */
const HEX_COLOR_3 = /^#([0-9a-f]{3})$/i;
const HEX_COLOR_6 = /^#([0-9a-f]{6})$/i;
const HEX_COLOR_8 = /^#([0-9a-f]{8})$/i;

/**
 * RGB/RGBA patterns
 */
const RGB_PATTERN = /^rgba?\([\d\s,./]+\)$/i;
const HSL_PATTERN = /^hsla?\([\d\s%,./]+\)$/i;
const OKLCH_PATTERN = /^oklch\([^)]+\)$/i;

/**
 * Check if a value looks like a color
 */
function isColorValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  return (
    HEX_COLOR_3.test(trimmed) ||
    HEX_COLOR_6.test(trimmed) ||
    HEX_COLOR_8.test(trimmed) ||
    RGB_PATTERN.test(trimmed) ||
    HSL_PATTERN.test(trimmed) ||
    OKLCH_PATTERN.test(trimmed) ||
    specialColorSet.has(trimmed)
  );
}

/**
 * Check if a value is a Tailwind color class suffix
 * e.g., "red-500", "slate-900"
 */
function isTailwindColorSuffix(value: string): boolean {
  const parts = value.split('-');
  if (parts.length === 2) {
    const name = parts[0];
    const shade = parts[1];
    if (name && shade) {
      return colorNameSet.has(name) && colorShadeSet.has(shade);
    }
  }
  return specialColorSet.has(value);
}

/**
 * Convert a color CSS property to Tailwind class
 */
export function colorToTailwind(
  property: 'color' | 'backgroundColor' | 'borderColor' | 'outlineColor',
  value: string
): TailwindResult | null {
  const prefixMap: Record<string, string> = {
    color: 'text',
    backgroundColor: 'bg',
    borderColor: 'border',
    outlineColor: 'outline',
  };

  const prefix = prefixMap[property];
  if (!prefix) return null;

  const trimmed = value.trim();

  // Check for special colors
  if (specialColorSet.has(trimmed)) {
    return {
      tailwindClass: `${prefix}-${trimmed}`,
      isArbitrary: false,
      conflictPrefix: prefix,
    };
  }

  // Check if it's already a Tailwind color reference
  if (isTailwindColorSuffix(trimmed)) {
    return {
      tailwindClass: `${prefix}-${trimmed}`,
      isArbitrary: false,
      conflictPrefix: prefix,
    };
  }

  // Handle hex/rgb/hsl as arbitrary values
  if (isColorValue(trimmed)) {
    // Escape special characters for arbitrary values
    const escaped = trimmed.replace(/\s+/g, '_');
    return {
      tailwindClass: `${prefix}-[${escaped}]`,
      isArbitrary: true,
      conflictPrefix: prefix,
    };
  }

  return null;
}

// ============================================
// Value Conversion
// ============================================

/**
 * Normalize a CSS value for comparison
 * Removes extra spaces, converts to lowercase for keywords
 */
function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// ============================================
// Main Conversion Functions
// ============================================

/**
 * Convert a CSS property-value pair to a Tailwind class
 *
 * @param property - CSS property name (camelCase, e.g., "borderRadius")
 * @param value - CSS value (e.g., "8px", "red-500")
 * @returns Tailwind result or null if conversion not supported
 *
 * @example
 * cssToTailwind('borderRadius', '8px')
 * // → { tailwindClass: 'rounded-lg', isArbitrary: false, conflictPrefix: 'rounded' }
 *
 * @example
 * cssToTailwind('borderRadius', '7px')
 * // → { tailwindClass: 'rounded-[7px]', isArbitrary: true, conflictPrefix: 'rounded' }
 *
 * @example
 * cssToTailwind('margin', '-16px')
 * // → { tailwindClass: '-m-4', isArbitrary: false, conflictPrefix: 'm' }
 */
export function cssToTailwind(property: string, value: string): TailwindResult | null {
  const normalized = normalizeValue(value);
  // Note: conflictPrefix is computed per-property below for more accurate mapping
  void (CONFLICT_PATTERNS[property] ?? property);

  // Handle color properties
  if (
    property === 'color' ||
    property === 'backgroundColor' ||
    property === 'borderColor' ||
    property === 'outlineColor'
  ) {
    return colorToTailwind(property, normalized);
  }

  // Handle border radius
  if (property === 'borderRadius') {
    const suffix = borderRadiusMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('rounded-', suffix),
        isArbitrary: false,
        conflictPrefix: 'rounded',
      };
    }
    // Arbitrary value
    return {
      tailwindClass: `rounded-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'rounded',
    };
  }

  // Handle font size
  if (property === 'fontSize') {
    const suffix = fontSizeMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('text-', suffix),
        isArbitrary: false,
        conflictPrefix: 'text',
      };
    }
    return {
      tailwindClass: `text-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'text',
    };
  }

  // Handle font weight
  if (property === 'fontWeight') {
    const suffix = fontWeightMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('font-', suffix),
        isArbitrary: false,
        conflictPrefix: 'font',
      };
    }
    return {
      tailwindClass: `font-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'font',
    };
  }

  // Handle letter spacing
  if (property === 'letterSpacing') {
    const suffix = letterSpacingMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('tracking-', suffix),
        isArbitrary: false,
        conflictPrefix: 'tracking',
      };
    }
    return {
      tailwindClass: `tracking-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'tracking',
    };
  }

  // Handle line height
  if (property === 'lineHeight') {
    const suffix = lineHeightMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('leading-', suffix),
        isArbitrary: false,
        conflictPrefix: 'leading',
      };
    }
    return {
      tailwindClass: `leading-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'leading',
    };
  }

  // Handle opacity
  if (property === 'opacity') {
    const suffix = opacityMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('opacity-', suffix),
        isArbitrary: false,
        conflictPrefix: 'opacity',
      };
    }
    return {
      tailwindClass: `opacity-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'opacity',
    };
  }

  // Handle border width
  if (property === 'borderWidth') {
    const suffix = borderWidthMaps.valueToClass.get(normalized);
    if (suffix !== undefined) {
      return {
        tailwindClass: buildClass('border-', suffix),
        isArbitrary: false,
        conflictPrefix: 'border',
      };
    }
    return {
      tailwindClass: `border-[${normalized}]`,
      isArbitrary: true,
      conflictPrefix: 'border',
    };
  }

  // Handle spacing properties (padding, margin, gap)
  const spacingResult = handleSpacingProperty(property, normalized);
  if (spacingResult) return spacingResult;

  // Handle text align
  if (property === 'textAlign') {
    const alignMap: Record<string, string> = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
      start: 'text-start',
      end: 'text-end',
    };
    const twClass = alignMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'text',
      };
    }
  }

  // Handle display
  if (property === 'display') {
    const displayMap: Record<string, string> = {
      block: 'block',
      inline: 'inline',
      'inline-block': 'inline-block',
      flex: 'flex',
      'inline-flex': 'inline-flex',
      grid: 'grid',
      'inline-grid': 'inline-grid',
      none: 'hidden',
      contents: 'contents',
    };
    const twClass = displayMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'display',
      };
    }
  }

  // Handle position
  if (property === 'position') {
    const positionMap: Record<string, string> = {
      static: 'static',
      relative: 'relative',
      absolute: 'absolute',
      fixed: 'fixed',
      sticky: 'sticky',
    };
    const twClass = positionMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'position',
      };
    }
  }

  // Handle border style
  if (property === 'borderStyle') {
    const styleMap: Record<string, string> = {
      solid: 'border-solid',
      dashed: 'border-dashed',
      dotted: 'border-dotted',
      double: 'border-double',
      none: 'border-none',
    };
    const twClass = styleMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'border',
      };
    }
  }

  // Handle flexbox properties
  if (property === 'flexDirection') {
    const dirMap: Record<string, string> = {
      row: 'flex-row',
      'row-reverse': 'flex-row-reverse',
      column: 'flex-col',
      'column-reverse': 'flex-col-reverse',
    };
    const twClass = dirMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'flex',
      };
    }
  }

  if (property === 'alignItems') {
    const alignMap: Record<string, string> = {
      'flex-start': 'items-start',
      'flex-end': 'items-end',
      center: 'items-center',
      baseline: 'items-baseline',
      stretch: 'items-stretch',
    };
    const twClass = alignMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'items',
      };
    }
  }

  if (property === 'justifyContent') {
    const justifyMap: Record<string, string> = {
      'flex-start': 'justify-start',
      'flex-end': 'justify-end',
      center: 'justify-center',
      'space-between': 'justify-between',
      'space-around': 'justify-around',
      'space-evenly': 'justify-evenly',
    };
    const twClass = justifyMap[normalized];
    if (twClass) {
      return {
        tailwindClass: twClass,
        isArbitrary: false,
        conflictPrefix: 'justify',
      };
    }
  }

  // Default: return null for unsupported properties
  return null;
}

/**
 * Handle spacing properties (padding, margin, gap)
 */
function handleSpacingProperty(property: string, value: string): TailwindResult | null {
  const prefixMap: Record<string, string> = {
    padding: 'p',
    paddingTop: 'pt',
    paddingRight: 'pr',
    paddingBottom: 'pb',
    paddingLeft: 'pl',
    paddingInline: 'px',
    paddingBlock: 'py',
    margin: 'm',
    marginTop: 'mt',
    marginRight: 'mr',
    marginBottom: 'mb',
    marginLeft: 'ml',
    marginInline: 'mx',
    marginBlock: 'my',
    gap: 'gap',
    rowGap: 'gap-y',
    columnGap: 'gap-x',
  };

  const prefix = prefixMap[property];
  if (!prefix) return null;

  // Check for negative values (only valid for margin)
  const isNegative = value.startsWith('-');
  const absValue = isNegative ? value.slice(1) : value;

  // Only margin can be negative
  if (isNegative && !property.startsWith('margin')) {
    return null;
  }

  const suffix = spacingMaps.valueToClass.get(absValue);

  if (suffix !== undefined) {
    const tailwindClass = isNegative ? `-${prefix}-${suffix}` : buildClass(`${prefix}-`, suffix);
    return {
      tailwindClass,
      isArbitrary: false,
      conflictPrefix: prefix,
    };
  }

  // Arbitrary value
  const tailwindClass = isNegative ? `-${prefix}-[${absValue}]` : `${prefix}-[${value}]`;

  return {
    tailwindClass,
    isArbitrary: true,
    conflictPrefix: prefix,
  };
}

// ============================================
// Conflict Detection
// ============================================

/**
 * Extract the conflict prefix from a Tailwind class
 */
export function getConflictPrefix(tailwindClass: string): string {
  // Handle negative prefix
  const isNegative = tailwindClass.startsWith('-');
  const className = isNegative ? tailwindClass.slice(1) : tailwindClass;

  // Handle arbitrary values
  const arbitraryMatch = /^([a-z-]+)-\[/.exec(className);
  const arbitraryPrefix = arbitraryMatch?.[1];
  if (arbitraryPrefix) {
    return arbitraryPrefix;
  }

  // Handle standard classes
  // Special cases for single-word utilities
  const singleWordUtilities = new Set([
    'block',
    'inline',
    'flex',
    'grid',
    'hidden',
    'static',
    'relative',
    'absolute',
    'fixed',
    'sticky',
    'italic',
    'underline',
    'uppercase',
    'lowercase',
    'capitalize',
  ]);

  if (singleWordUtilities.has(className)) {
    return className;
  }

  // Extract prefix from dash-separated class
  const parts = className.split('-');
  const firstPart = parts[0];

  // If no dash found or first part is empty, return original class name
  if (parts.length === 1 || !firstPart) {
    return className;
  }

  // For classes like "rounded-lg", "text-sm", "p-4"
  return firstPart;
}

/**
 * Get the CSS property that a Tailwind class affects
 */
export function getCssPropertyForClass(tailwindClass: string): string | null {
  const prefix = getConflictPrefix(tailwindClass);

  // Build reverse mapping for common prefixes
  const prefixToProperty: Record<string, string> = {
    rounded: 'borderRadius',
    text: 'fontSize', // Note: could also be color or textAlign depending on suffix
    font: 'fontWeight', // Note: could also be fontFamily
    tracking: 'letterSpacing',
    leading: 'lineHeight',
    opacity: 'opacity',
    border: 'borderWidth', // Note: could be borderColor or borderStyle
    p: 'padding',
    pt: 'paddingTop',
    pr: 'paddingRight',
    pb: 'paddingBottom',
    pl: 'paddingLeft',
    px: 'paddingInline',
    py: 'paddingBlock',
    m: 'margin',
    mt: 'marginTop',
    mr: 'marginRight',
    mb: 'marginBottom',
    ml: 'marginLeft',
    mx: 'marginInline',
    my: 'marginBlock',
    gap: 'gap',
    w: 'width',
    h: 'height',
    bg: 'backgroundColor',
    z: 'zIndex',
    items: 'alignItems',
    justify: 'justifyContent',
    flex: 'flexDirection',
    block: 'display',
    hidden: 'display',
    static: 'position',
    relative: 'position',
    absolute: 'position',
    fixed: 'position',
    sticky: 'position',
  };

  return prefixToProperty[prefix] ?? null;
}

/**
 * Check if two Tailwind classes conflict (affect same CSS property)
 */
export function classesConflict(class1: string, class2: string): boolean {
  const prefix1 = getConflictPrefix(class1);
  const prefix2 = getConflictPrefix(class2);

  // Same prefix = conflict
  if (prefix1 === prefix2) return true;

  // Check for cross-prefix conflicts (e.g., "p" conflicts with "px" and "py")
  const paddingPrefixes = new Set(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl']);
  const marginPrefixes = new Set(['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml']);

  if (paddingPrefixes.has(prefix1) && paddingPrefixes.has(prefix2)) {
    // "p" conflicts with directional padding
    if (prefix1 === 'p' || prefix2 === 'p') return true;
    // "px" conflicts with "pl" and "pr"
    if (
      (prefix1 === 'px' && (prefix2 === 'pl' || prefix2 === 'pr')) ||
      (prefix2 === 'px' && (prefix1 === 'pl' || prefix1 === 'pr'))
    )
      return true;
    // "py" conflicts with "pt" and "pb"
    if (
      (prefix1 === 'py' && (prefix2 === 'pt' || prefix2 === 'pb')) ||
      (prefix2 === 'py' && (prefix1 === 'pt' || prefix1 === 'pb'))
    )
      return true;
  }

  if (marginPrefixes.has(prefix1) && marginPrefixes.has(prefix2)) {
    // Same logic for margins
    if (prefix1 === 'm' || prefix2 === 'm') return true;
    if (
      (prefix1 === 'mx' && (prefix2 === 'ml' || prefix2 === 'mr')) ||
      (prefix2 === 'mx' && (prefix1 === 'ml' || prefix1 === 'mr'))
    )
      return true;
    if (
      (prefix1 === 'my' && (prefix2 === 'mt' || prefix2 === 'mb')) ||
      (prefix2 === 'my' && (prefix1 === 'mt' || prefix1 === 'mb'))
    )
      return true;
  }

  return false;
}

/**
 * Find all classes in a list that conflict with a given class
 */
export function findConflictingClasses(
  targetClass: string,
  classList: readonly string[]
): string[] {
  return classList.filter((cls) => cls !== targetClass && classesConflict(cls, targetClass));
}
