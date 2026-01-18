/**
 * Tailwind CSS utilities for parsing, manipulating, and generating classes
 */

// Tailwind spacing scale
export const SPACING_SCALE: Record<string, string> = {
  '0': '0px',
  px: '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
};

// Tailwind color palette (subset of common colors)
export const COLOR_PALETTE: Record<string, Record<string, string>> = {
  slate: {
    '50': '#f8fafc',
    '100': '#f1f5f9',
    '200': '#e2e8f0',
    '300': '#cbd5e1',
    '400': '#94a3b8',
    '500': '#64748b',
    '600': '#475569',
    '700': '#334155',
    '800': '#1e293b',
    '900': '#0f172a',
    '950': '#020617',
  },
  gray: {
    '50': '#f9fafb',
    '100': '#f3f4f6',
    '200': '#e5e7eb',
    '300': '#d1d5db',
    '400': '#9ca3af',
    '500': '#6b7280',
    '600': '#4b5563',
    '700': '#374151',
    '800': '#1f2937',
    '900': '#111827',
    '950': '#030712',
  },
  red: {
    '50': '#fef2f2',
    '100': '#fee2e2',
    '200': '#fecaca',
    '300': '#fca5a5',
    '400': '#f87171',
    '500': '#ef4444',
    '600': '#dc2626',
    '700': '#b91c1c',
    '800': '#991b1b',
    '900': '#7f1d1d',
    '950': '#450a0a',
  },
  orange: {
    '50': '#fff7ed',
    '100': '#ffedd5',
    '200': '#fed7aa',
    '300': '#fdba74',
    '400': '#fb923c',
    '500': '#f97316',
    '600': '#ea580c',
    '700': '#c2410c',
    '800': '#9a3412',
    '900': '#7c2d12',
    '950': '#431407',
  },
  yellow: {
    '50': '#fefce8',
    '100': '#fef9c3',
    '200': '#fef08a',
    '300': '#fde047',
    '400': '#facc15',
    '500': '#eab308',
    '600': '#ca8a04',
    '700': '#a16207',
    '800': '#854d0e',
    '900': '#713f12',
    '950': '#422006',
  },
  green: {
    '50': '#f0fdf4',
    '100': '#dcfce7',
    '200': '#bbf7d0',
    '300': '#86efac',
    '400': '#4ade80',
    '500': '#22c55e',
    '600': '#16a34a',
    '700': '#15803d',
    '800': '#166534',
    '900': '#14532d',
    '950': '#052e16',
  },
  blue: {
    '50': '#eff6ff',
    '100': '#dbeafe',
    '200': '#bfdbfe',
    '300': '#93c5fd',
    '400': '#60a5fa',
    '500': '#3b82f6',
    '600': '#2563eb',
    '700': '#1d4ed8',
    '800': '#1e40af',
    '900': '#1e3a8a',
    '950': '#172554',
  },
  indigo: {
    '50': '#eef2ff',
    '100': '#e0e7ff',
    '200': '#c7d2fe',
    '300': '#a5b4fc',
    '400': '#818cf8',
    '500': '#6366f1',
    '600': '#4f46e5',
    '700': '#4338ca',
    '800': '#3730a3',
    '900': '#312e81',
    '950': '#1e1b4b',
  },
  purple: {
    '50': '#faf5ff',
    '100': '#f3e8ff',
    '200': '#e9d5ff',
    '300': '#d8b4fe',
    '400': '#c084fc',
    '500': '#a855f7',
    '600': '#9333ea',
    '700': '#7e22ce',
    '800': '#6b21a8',
    '900': '#581c87',
    '950': '#3b0764',
  },
  pink: {
    '50': '#fdf2f8',
    '100': '#fce7f3',
    '200': '#fbcfe8',
    '300': '#f9a8d4',
    '400': '#f472b6',
    '500': '#ec4899',
    '600': '#db2777',
    '700': '#be185d',
    '800': '#9d174d',
    '900': '#831843',
    '950': '#500724',
  },
};

// Font size scale
export const FONT_SIZE_SCALE: Record<string, { size: string; lineHeight: string }> = {
  xs: { size: '0.75rem', lineHeight: '1rem' },
  sm: { size: '0.875rem', lineHeight: '1.25rem' },
  base: { size: '1rem', lineHeight: '1.5rem' },
  lg: { size: '1.125rem', lineHeight: '1.75rem' },
  xl: { size: '1.25rem', lineHeight: '1.75rem' },
  '2xl': { size: '1.5rem', lineHeight: '2rem' },
  '3xl': { size: '1.875rem', lineHeight: '2.25rem' },
  '4xl': { size: '2.25rem', lineHeight: '2.5rem' },
  '5xl': { size: '3rem', lineHeight: '1' },
  '6xl': { size: '3.75rem', lineHeight: '1' },
  '7xl': { size: '4.5rem', lineHeight: '1' },
  '8xl': { size: '6rem', lineHeight: '1' },
  '9xl': { size: '8rem', lineHeight: '1' },
};

// Font weight scale
export const FONT_WEIGHT_SCALE: Record<string, string> = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

// Border radius scale
export const BORDER_RADIUS_SCALE: Record<string, string> = {
  none: '0px',
  sm: '0.125rem',
  '': '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
};

// Class category type
export type ClassCategory =
  | 'layout'
  | 'spacing'
  | 'sizing'
  | 'typography'
  | 'colors'
  | 'borders'
  | 'effects'
  | 'other';

// Parsed class info
export interface ParsedClass {
  original: string;
  category: ClassCategory;
  property: string;
  value: string;
  variant?: string; // e.g., 'hover', 'md', 'dark'
}

// Class patterns for categorization
const CLASS_PATTERNS: { pattern: RegExp; category: ClassCategory; property: string }[] = [
  // Layout
  { pattern: /^(flex|inline-flex)$/, category: 'layout', property: 'display' },
  { pattern: /^(grid|inline-grid)$/, category: 'layout', property: 'display' },
  { pattern: /^(block|inline-block|inline|hidden)$/, category: 'layout', property: 'display' },
  {
    pattern: /^flex-(row|col|row-reverse|col-reverse)$/,
    category: 'layout',
    property: 'flexDirection',
  },
  {
    pattern: /^justify-(start|end|center|between|around|evenly)$/,
    category: 'layout',
    property: 'justifyContent',
  },
  {
    pattern: /^items-(start|end|center|baseline|stretch)$/,
    category: 'layout',
    property: 'alignItems',
  },
  { pattern: /^gap-(.+)$/, category: 'layout', property: 'gap' },

  // Spacing
  { pattern: /^p-(.+)$/, category: 'spacing', property: 'padding' },
  { pattern: /^px-(.+)$/, category: 'spacing', property: 'paddingX' },
  { pattern: /^py-(.+)$/, category: 'spacing', property: 'paddingY' },
  { pattern: /^pt-(.+)$/, category: 'spacing', property: 'paddingTop' },
  { pattern: /^pr-(.+)$/, category: 'spacing', property: 'paddingRight' },
  { pattern: /^pb-(.+)$/, category: 'spacing', property: 'paddingBottom' },
  { pattern: /^pl-(.+)$/, category: 'spacing', property: 'paddingLeft' },
  { pattern: /^m-(.+)$/, category: 'spacing', property: 'margin' },
  { pattern: /^mx-(.+)$/, category: 'spacing', property: 'marginX' },
  { pattern: /^my-(.+)$/, category: 'spacing', property: 'marginY' },
  { pattern: /^mt-(.+)$/, category: 'spacing', property: 'marginTop' },
  { pattern: /^mr-(.+)$/, category: 'spacing', property: 'marginRight' },
  { pattern: /^mb-(.+)$/, category: 'spacing', property: 'marginBottom' },
  { pattern: /^ml-(.+)$/, category: 'spacing', property: 'marginLeft' },

  // Sizing
  { pattern: /^w-(.+)$/, category: 'sizing', property: 'width' },
  { pattern: /^h-(.+)$/, category: 'sizing', property: 'height' },
  { pattern: /^min-w-(.+)$/, category: 'sizing', property: 'minWidth' },
  { pattern: /^min-h-(.+)$/, category: 'sizing', property: 'minHeight' },
  { pattern: /^max-w-(.+)$/, category: 'sizing', property: 'maxWidth' },
  { pattern: /^max-h-(.+)$/, category: 'sizing', property: 'maxHeight' },

  // Typography
  {
    pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
    category: 'typography',
    property: 'fontSize',
  },
  {
    pattern: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    category: 'typography',
    property: 'fontWeight',
  },
  { pattern: /^text-(left|center|right|justify)$/, category: 'typography', property: 'textAlign' },
  { pattern: /^leading-(.+)$/, category: 'typography', property: 'lineHeight' },
  { pattern: /^tracking-(.+)$/, category: 'typography', property: 'letterSpacing' },

  // Colors
  { pattern: /^bg-(.+)$/, category: 'colors', property: 'backgroundColor' },
  { pattern: /^text-(.+)-(\d+)$/, category: 'colors', property: 'color' },

  // Borders
  { pattern: /^border$/, category: 'borders', property: 'borderWidth' },
  { pattern: /^border-(.+)$/, category: 'borders', property: 'border' },
  { pattern: /^rounded$/, category: 'borders', property: 'borderRadius' },
  { pattern: /^rounded-(.+)$/, category: 'borders', property: 'borderRadius' },

  // Effects
  { pattern: /^shadow$/, category: 'effects', property: 'boxShadow' },
  { pattern: /^shadow-(.+)$/, category: 'effects', property: 'boxShadow' },
  { pattern: /^opacity-(.+)$/, category: 'effects', property: 'opacity' },
];

/**
 * Parse a Tailwind class string into structured data
 */
export function parseClasses(classString: string): ParsedClass[] {
  const classes = classString.split(/\s+/).filter(Boolean);
  return classes.map(parseClass);
}

/**
 * Parse a single Tailwind class
 */
export function parseClass(cls: string): ParsedClass {
  // Check for variant prefix (e.g., hover:, md:, dark:)
  let variant: string | undefined;
  let baseClass = cls;

  const variantMatch = /^([a-z]+):(.+)$/.exec(cls);
  if (variantMatch?.[1] && variantMatch[2]) {
    variant = variantMatch[1];
    baseClass = variantMatch[2];
  }

  // Match against patterns
  for (const { pattern, category, property } of CLASS_PATTERNS) {
    const match = baseClass.match(pattern);
    if (match) {
      const result: ParsedClass = {
        original: cls,
        category,
        property,
        value: match[1] ?? baseClass,
      };
      if (variant !== undefined) {
        result.variant = variant;
      }
      return result;
    }
  }

  // Default to 'other' category
  const result: ParsedClass = {
    original: cls,
    category: 'other',
    property: 'unknown',
    value: baseClass,
  };
  if (variant !== undefined) {
    result.variant = variant;
  }
  return result;
}

/**
 * Get classes by category
 */
export function getClassesByCategory(classes: ParsedClass[]): Record<ClassCategory, ParsedClass[]> {
  const result: Record<ClassCategory, ParsedClass[]> = {
    layout: [],
    spacing: [],
    sizing: [],
    typography: [],
    colors: [],
    borders: [],
    effects: [],
    other: [],
  };

  for (const cls of classes) {
    result[cls.category].push(cls);
  }

  return result;
}

/**
 * Remove a class from a class string
 */
export function removeClass(classString: string, classToRemove: string): string {
  const classes = classString.split(/\s+/).filter(Boolean);
  return classes.filter((c) => c !== classToRemove).join(' ');
}

/**
 * Add a class to a class string (avoiding duplicates)
 */
export function addClass(classString: string, classToAdd: string): string {
  const classes = classString.split(/\s+/).filter(Boolean);
  if (!classes.includes(classToAdd)) {
    classes.push(classToAdd);
  }
  return classes.join(' ');
}

/**
 * Replace a class that matches a property with a new class
 */
export function replaceClassByProperty(
  classString: string,
  property: string,
  newClass: string
): string {
  const classes = classString.split(/\s+/).filter(Boolean);
  const parsed = classes.map(parseClass);

  // Find and remove existing class with same property
  const filtered = parsed.filter((p) => p.property !== property);

  // Add new class
  const result = filtered.map((p) => p.original);
  result.push(newClass);

  return result.join(' ');
}

/**
 * Convert a CSS value to the nearest Tailwind spacing class
 */
export function cssToSpacingClass(prefix: string, cssValue: string): string | null {
  // Parse the CSS value
  const numMatch = /^([\d.]+)(px|rem|em)?$/.exec(cssValue);
  if (!numMatch?.[1]) return null;

  const value = parseFloat(numMatch[1]);
  const unit = numMatch[2] ?? 'px';

  // Convert to rem if needed
  let remValue = value;
  if (unit === 'px') {
    remValue = value / 16;
  }

  // Find closest match in spacing scale
  let closestKey = '0';
  let closestDiff = Infinity;

  for (const [key, scaleValue] of Object.entries(SPACING_SCALE)) {
    const scaleNum = parseFloat(scaleValue);
    const scaleRem = scaleValue.endsWith('rem')
      ? scaleNum
      : scaleValue.endsWith('px')
        ? scaleNum / 16
        : scaleNum;

    const diff = Math.abs(remValue - scaleRem);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestKey = key;
    }
  }

  return `${prefix}-${closestKey}`;
}

/**
 * Convert a CSS color to the nearest Tailwind color class
 */
export function cssToColorClass(prefix: string, cssColor: string): string | null {
  // Convert RGB/RGBA to hex
  let hex = cssColor;
  const rgbMatch = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cssColor);
  if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    hex = `#${r}${g}${b}`.toLowerCase();
  }

  // Find closest match in color palette
  let closestClass: string | null = null;
  let closestDiff = Infinity;

  for (const [colorName, shades] of Object.entries(COLOR_PALETTE)) {
    for (const [shade, colorHex] of Object.entries(shades)) {
      if (colorHex.toLowerCase() === hex) {
        return `${prefix}-${colorName}-${shade}`;
      }

      // Calculate color distance (simple RGB distance)
      const diff = colorDistance(hex, colorHex);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestClass = `${prefix}-${colorName}-${shade}`;
      }
    }
  }

  return closestClass;
}

/**
 * Calculate simple RGB color distance
 */
function colorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return Infinity;

  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) + Math.pow(rgb1.g - rgb2.g, 2) + Math.pow(rgb1.b - rgb2.b, 2)
  );
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) {
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Generate Tailwind class suggestions for a CSS property/value
 */
export function suggestTailwindClass(cssProperty: string, cssValue: string): string | null {
  const propertyMap: Record<string, string> = {
    padding: 'p',
    'padding-top': 'pt',
    'padding-right': 'pr',
    'padding-bottom': 'pb',
    'padding-left': 'pl',
    margin: 'm',
    'margin-top': 'mt',
    'margin-right': 'mr',
    'margin-bottom': 'mb',
    'margin-left': 'ml',
    gap: 'gap',
    width: 'w',
    height: 'h',
  };

  const spacingPrefix = propertyMap[cssProperty];
  if (spacingPrefix) {
    return cssToSpacingClass(spacingPrefix, cssValue);
  }

  if (cssProperty === 'background-color') {
    return cssToColorClass('bg', cssValue);
  }

  if (cssProperty === 'color') {
    return cssToColorClass('text', cssValue);
  }

  return null;
}
