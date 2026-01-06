/**
 * Design Token Quantization
 *
 * Maps raw CSS values to Tailwind design tokens.
 * This enables the AI agent to understand visual values in terms of the design system,
 * making it easier to generate consistent, design-compliant code modifications.
 */

// Tailwind color palette with hex values
const TAILWIND_COLORS: Record<string, Record<string, string>> = {
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
  zinc: {
    '50': '#fafafa',
    '100': '#f4f4f5',
    '200': '#e4e4e7',
    '300': '#d4d4d8',
    '400': '#a1a1aa',
    '500': '#71717a',
    '600': '#52525b',
    '700': '#3f3f46',
    '800': '#27272a',
    '900': '#18181b',
    '950': '#09090b',
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
  amber: {
    '50': '#fffbeb',
    '100': '#fef3c7',
    '200': '#fde68a',
    '300': '#fcd34d',
    '400': '#fbbf24',
    '500': '#f59e0b',
    '600': '#d97706',
    '700': '#b45309',
    '800': '#92400e',
    '900': '#78350f',
    '950': '#451a03',
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
  lime: {
    '50': '#f7fee7',
    '100': '#ecfccb',
    '200': '#d9f99d',
    '300': '#bef264',
    '400': '#a3e635',
    '500': '#84cc16',
    '600': '#65a30d',
    '700': '#4d7c0f',
    '800': '#3f6212',
    '900': '#365314',
    '950': '#1a2e05',
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
  emerald: {
    '50': '#ecfdf5',
    '100': '#d1fae5',
    '200': '#a7f3d0',
    '300': '#6ee7b7',
    '400': '#34d399',
    '500': '#10b981',
    '600': '#059669',
    '700': '#047857',
    '800': '#065f46',
    '900': '#064e3b',
    '950': '#022c22',
  },
  teal: {
    '50': '#f0fdfa',
    '100': '#ccfbf1',
    '200': '#99f6e4',
    '300': '#5eead4',
    '400': '#2dd4bf',
    '500': '#14b8a6',
    '600': '#0d9488',
    '700': '#0f766e',
    '800': '#115e59',
    '900': '#134e4a',
    '950': '#042f2e',
  },
  cyan: {
    '50': '#ecfeff',
    '100': '#cffafe',
    '200': '#a5f3fc',
    '300': '#67e8f9',
    '400': '#22d3ee',
    '500': '#06b6d4',
    '600': '#0891b2',
    '700': '#0e7490',
    '800': '#155e75',
    '900': '#164e63',
    '950': '#083344',
  },
  sky: {
    '50': '#f0f9ff',
    '100': '#e0f2fe',
    '200': '#bae6fd',
    '300': '#7dd3fc',
    '400': '#38bdf8',
    '500': '#0ea5e9',
    '600': '#0284c7',
    '700': '#0369a1',
    '800': '#075985',
    '900': '#0c4a6e',
    '950': '#082f49',
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
  violet: {
    '50': '#f5f3ff',
    '100': '#ede9fe',
    '200': '#ddd6fe',
    '300': '#c4b5fd',
    '400': '#a78bfa',
    '500': '#8b5cf6',
    '600': '#7c3aed',
    '700': '#6d28d9',
    '800': '#5b21b6',
    '900': '#4c1d95',
    '950': '#2e1065',
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
  fuchsia: {
    '50': '#fdf4ff',
    '100': '#fae8ff',
    '200': '#f5d0fe',
    '300': '#f0abfc',
    '400': '#e879f9',
    '500': '#d946ef',
    '600': '#c026d3',
    '700': '#a21caf',
    '800': '#86198f',
    '900': '#701a75',
    '950': '#4a044e',
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
  rose: {
    '50': '#fff1f2',
    '100': '#ffe4e6',
    '200': '#fecdd3',
    '300': '#fda4af',
    '400': '#fb7185',
    '500': '#f43f5e',
    '600': '#e11d48',
    '700': '#be123c',
    '800': '#9f1239',
    '900': '#881337',
    '950': '#4c0519',
  },
};

// Tailwind spacing scale (in rem, assuming 1rem = 16px)
const TAILWIND_SPACING: Record<string, number> = {
  '0': 0,
  px: 1,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '11': 44,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
  '24': 96,
  '28': 112,
  '32': 128,
  '36': 144,
  '40': 160,
  '44': 176,
  '48': 192,
  '52': 208,
  '56': 224,
  '60': 240,
  '64': 256,
  '72': 288,
  '80': 320,
  '96': 384,
};

// Tailwind font sizes (in px)
const TAILWIND_FONT_SIZES: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};

// Tailwind font weights
const TAILWIND_FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

// Tailwind border radius (in px)
const TAILWIND_BORDER_RADIUS: Record<string, number> = {
  none: 0,
  sm: 2,
  DEFAULT: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
};

// Tailwind line heights (as multiplier) - currently unused but kept for future features
// const TAILWIND_LINE_HEIGHTS: Record<string, number> = {
// 	'none': 1, 'tight': 1.25, 'snug': 1.375, 'normal': 1.5,
// 	'relaxed': 1.625, 'loose': 2,
// };

/**
 * Parse a CSS color value to RGB
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt((hex[0] ?? '0') + (hex[0] ?? '0'), 16),
        g: parseInt((hex[1] ?? '0') + (hex[1] ?? '0'), 16),
        b: parseInt((hex[2] ?? '0') + (hex[2] ?? '0'), 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  // Handle rgb/rgba
  const rgbMatch = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1] ?? '0', 10),
      g: parseInt(rgbMatch[2] ?? '0', 10),
      b: parseInt(rgbMatch[3] ?? '0', 10),
    };
  }

  return null;
}

/**
 * Calculate color distance (simple Euclidean in RGB space)
 */
function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number }
): number {
  return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

/**
 * Parse a CSS length value to pixels
 */
function parseLengthToPx(value: string): number | null {
  if (value === '0') return 0;

  const pxMatch = /^([\d.]+)px$/.exec(value);
  if (pxMatch !== null) return parseFloat(pxMatch[1] ?? '0');

  const remMatch = /^([\d.]+)rem$/.exec(value);
  if (remMatch !== null) return parseFloat(remMatch[1] ?? '0') * 16;

  const emMatch = /^([\d.]+)em$/.exec(value);
  if (emMatch !== null) return parseFloat(emMatch[1] ?? '0') * 16; // Approximate

  return null;
}

export interface QuantizedColor {
  token: string; // e.g., "blue-500"
  tailwindClass: string; // e.g., "text-blue-500" or "bg-blue-500"
  hex: string;
  distance: number; // How close the match is (0 = exact)
}

export interface QuantizedSpacing {
  token: string; // e.g., "4"
  tailwindClass: string; // e.g., "p-4" or "m-4"
  px: number;
  distance: number;
}

export interface QuantizedFontSize {
  token: string; // e.g., "base"
  tailwindClass: string; // e.g., "text-base"
  px: number;
  distance: number;
}

export interface QuantizedFontWeight {
  token: string; // e.g., "semibold"
  tailwindClass: string; // e.g., "font-semibold"
  value: number;
  distance: number;
}

export interface QuantizedBorderRadius {
  token: string; // e.g., "lg"
  tailwindClass: string; // e.g., "rounded-lg"
  px: number;
  distance: number;
}

/**
 * Quantize a color value to the nearest Tailwind color token
 */
export function quantizeColor(
  colorValue: string,
  prefix: 'text' | 'bg' | 'border' = 'text'
): QuantizedColor | null {
  const parsed = parseColor(colorValue);
  if (parsed === null) return null;

  let bestMatch: QuantizedColor | null = null;
  let minDistance = Infinity;

  for (const [colorName, shades] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, hex] of Object.entries(shades)) {
      const shadeColor = parseColor(hex);
      if (shadeColor === null) continue;

      const distance = colorDistance(parsed, shadeColor);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = {
          token: `${colorName}-${shade}`,
          tailwindClass: `${prefix}-${colorName}-${shade}`,
          hex,
          distance,
        };
      }
    }
  }

  // Also check black and white
  const blackDistance = colorDistance(parsed, { r: 0, g: 0, b: 0 });
  if (blackDistance < minDistance) {
    bestMatch = {
      token: 'black',
      tailwindClass: `${prefix}-black`,
      hex: '#000000',
      distance: blackDistance,
    };
    minDistance = blackDistance;
  }

  const whiteDistance = colorDistance(parsed, { r: 255, g: 255, b: 255 });
  if (whiteDistance < minDistance) {
    bestMatch = {
      token: 'white',
      tailwindClass: `${prefix}-white`,
      hex: '#ffffff',
      distance: whiteDistance,
    };
  }

  return bestMatch;
}

/**
 * Quantize a spacing value to the nearest Tailwind spacing token
 */
export function quantizeSpacing(
  spacingValue: string,
  prefix: 'p' | 'm' | 'gap' | 'w' | 'h' = 'p'
): QuantizedSpacing | null {
  const px = parseLengthToPx(spacingValue);
  if (px === null) return null;

  let bestMatch: QuantizedSpacing | null = null;
  let minDistance = Infinity;

  for (const [token, pxValue] of Object.entries(TAILWIND_SPACING)) {
    const distance = Math.abs(px - pxValue);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = {
        token,
        tailwindClass: `${prefix}-${token}`,
        px: pxValue,
        distance,
      };
    }
  }

  return bestMatch;
}

/**
 * Quantize a font size to the nearest Tailwind font size token
 */
export function quantizeFontSize(fontSizeValue: string): QuantizedFontSize | null {
  const px = parseLengthToPx(fontSizeValue);
  if (px === null) return null;

  let bestMatch: QuantizedFontSize | null = null;
  let minDistance = Infinity;

  for (const [token, pxValue] of Object.entries(TAILWIND_FONT_SIZES)) {
    const distance = Math.abs(px - pxValue);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = {
        token,
        tailwindClass: `text-${token}`,
        px: pxValue,
        distance,
      };
    }
  }

  return bestMatch;
}

/**
 * Quantize a font weight to the nearest Tailwind font weight token
 */
export function quantizeFontWeight(fontWeightValue: string): QuantizedFontWeight | null {
  const weight = parseInt(fontWeightValue, 10);
  if (Number.isNaN(weight)) {
    // Handle named weights
    const normalized = fontWeightValue.toLowerCase();
    if (TAILWIND_FONT_WEIGHTS[normalized] !== undefined) {
      return {
        token: normalized,
        tailwindClass: `font-${normalized}`,
        value: TAILWIND_FONT_WEIGHTS[normalized],
        distance: 0,
      };
    }
    return null;
  }

  let bestMatch: QuantizedFontWeight | null = null;
  let minDistance = Infinity;

  for (const [token, value] of Object.entries(TAILWIND_FONT_WEIGHTS)) {
    const distance = Math.abs(weight - value);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = {
        token,
        tailwindClass: `font-${token}`,
        value,
        distance,
      };
    }
  }

  return bestMatch;
}

/**
 * Quantize a border radius to the nearest Tailwind border radius token
 */
export function quantizeBorderRadius(radiusValue: string): QuantizedBorderRadius | null {
  const px = parseLengthToPx(radiusValue);
  if (px === null) return null;

  let bestMatch: QuantizedBorderRadius | null = null;
  let minDistance = Infinity;

  for (const [token, pxValue] of Object.entries(TAILWIND_BORDER_RADIUS)) {
    // Skip 'full' unless the value is very large
    if (token === 'full' && px < 100) continue;

    const distance = Math.abs(px - pxValue);
    if (distance < minDistance) {
      minDistance = distance;
      const classToken = token === 'DEFAULT' ? '' : `-${token}`;
      bestMatch = {
        token: token === 'DEFAULT' ? 'default' : token,
        tailwindClass: `rounded${classToken}`,
        px: pxValue,
        distance,
      };
    }
  }

  return bestMatch;
}

/**
 * Quantize all relevant CSS properties in a styles object
 * Returns suggested Tailwind classes
 */
export function quantizeStyles(styles: Record<string, { raw: string }>): string[] {
  const classes: string[] = [];

  // Color properties
  if (styles['color'] !== undefined) {
    const quantized = quantizeColor(styles['color'].raw, 'text');
    if (quantized !== null && quantized.distance < 30) {
      classes.push(quantized.tailwindClass);
    }
  }

  if (styles['background-color'] !== undefined) {
    const quantized = quantizeColor(styles['background-color'].raw, 'bg');
    if (quantized !== null && quantized.distance < 30) {
      classes.push(quantized.tailwindClass);
    }
  }

  if (styles['border-color'] !== undefined) {
    const quantized = quantizeColor(styles['border-color'].raw, 'border');
    if (quantized !== null && quantized.distance < 30) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Font size
  if (styles['font-size'] !== undefined) {
    const quantized = quantizeFontSize(styles['font-size'].raw);
    if (quantized !== null && quantized.distance < 3) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Font weight
  if (styles['font-weight'] !== undefined) {
    const quantized = quantizeFontWeight(styles['font-weight'].raw);
    if (quantized !== null && quantized.distance < 100) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Padding
  if (styles['padding'] !== undefined) {
    const quantized = quantizeSpacing(styles['padding'].raw, 'p');
    if (quantized !== null && quantized.distance < 4) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Margin
  if (styles['margin'] !== undefined) {
    const quantized = quantizeSpacing(styles['margin'].raw, 'm');
    if (quantized !== null && quantized.distance < 4) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Border radius
  if (styles['border-radius'] !== undefined) {
    const quantized = quantizeBorderRadius(styles['border-radius'].raw);
    if (quantized !== null && quantized.distance < 3) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Gap
  if (styles['gap'] !== undefined) {
    const quantized = quantizeSpacing(styles['gap'].raw, 'gap');
    if (quantized !== null && quantized.distance < 4) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Width
  if (styles['width'] !== undefined) {
    const quantized = quantizeSpacing(styles['width'].raw, 'w');
    if (quantized !== null && quantized.distance < 4) {
      classes.push(quantized.tailwindClass);
    }
  }

  // Height
  if (styles['height'] !== undefined) {
    const quantized = quantizeSpacing(styles['height'].raw, 'h');
    if (quantized !== null && quantized.distance < 4) {
      classes.push(quantized.tailwindClass);
    }
  }

  return classes;
}

/**
 * Enhance computed styles with token information
 */
export function enhanceStylesWithTokens(
  styles: Record<string, { raw: string }>
): Record<string, { raw: string; token?: string; semantic?: string }> {
  const enhanced: Record<string, { raw: string; token?: string; semantic?: string }> = {};

  for (const [prop, value] of Object.entries(styles)) {
    enhanced[prop] = { raw: value.raw };

    // Add token mappings based on property type
    switch (prop) {
      case 'color':
      case 'background-color':
      case 'border-color': {
        const quantized = quantizeColor(
          value.raw,
          prop === 'color' ? 'text' : prop === 'background-color' ? 'bg' : 'border'
        );
        if (quantized !== null && quantized.distance < 30) {
          enhanced[prop].token = quantized.token;
          enhanced[prop].semantic = quantized.tailwindClass;
        }
        break;
      }
      case 'font-size': {
        const quantized = quantizeFontSize(value.raw);
        if (quantized !== null && quantized.distance < 3) {
          enhanced[prop].token = quantized.token;
          enhanced[prop].semantic = `${quantized.tailwindClass} (${String(quantized.px)}px)`;
        }
        break;
      }
      case 'font-weight': {
        const quantized = quantizeFontWeight(value.raw);
        if (quantized !== null && quantized.distance < 100) {
          enhanced[prop].token = quantized.token;
          enhanced[prop].semantic = quantized.tailwindClass;
        }
        break;
      }
      case 'padding':
      case 'margin':
      case 'gap':
      case 'width':
      case 'height': {
        const prefix =
          prop === 'padding'
            ? 'p'
            : prop === 'margin'
              ? 'm'
              : prop === 'gap'
                ? 'gap'
                : prop === 'width'
                  ? 'w'
                  : 'h';
        const quantized = quantizeSpacing(value.raw, prefix);
        if (quantized !== null && quantized.distance < 4) {
          enhanced[prop].token = quantized.token;
          enhanced[prop].semantic = `${quantized.tailwindClass} (${String(quantized.px)}px)`;
        }
        break;
      }
      case 'border-radius': {
        const quantized = quantizeBorderRadius(value.raw);
        if (quantized !== null && quantized.distance < 3) {
          enhanced[prop].token = quantized.token;
          enhanced[prop].semantic = quantized.tailwindClass;
        }
        break;
      }
    }
  }

  return enhanced;
}
