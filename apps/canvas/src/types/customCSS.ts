/**
 * Custom CSS properties that can be applied to any node
 * These properties will be rendered as inline styles in the preview
 * and included in the generated code
 */
export interface CustomCSS {
  // Layout
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;

  // Spacing
  padding?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  margin?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  gap?: string;

  // Typography
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';

  // Colors
  color?: string;
  backgroundColor?: string;
  borderColor?: string;

  // Border
  border?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: string;

  // Effects
  boxShadow?: string;
  opacity?: string;

  // Flexbox (for containers)
  display?: string;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
}

/**
 * Style object type for inline styles
 */
export type StyleObject = Record<string, string | number | undefined>;

/**
 * Convert CustomCSS object to inline style object
 */
export function customCSSToStyle(customCSS: CustomCSS | undefined): StyleObject {
  if (!customCSS) {
    return {};
  }

  const style: StyleObject = {};

  // Map CustomCSS properties to style object
  Object.entries(customCSS).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      style[key] = value as string;
    }
  });

  return style;
}

/**
 * Convert CustomCSS object to inline style string for HTML
 */
export function customCSSToString(customCSS: CustomCSS | undefined): string {
  if (!customCSS) {
    return '';
  }

  const entries = Object.entries(customCSS)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const kebabKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      return `${kebabKey}: ${String(value)}`;
    });

  return entries.join('; ');
}

/**
 * Merge custom CSS with base classes
 * Returns inline style string that can be added to HTML elements
 */
export function mergeCustomCSS(
  baseClasses: string,
  customCSS: CustomCSS | undefined
): { classes: string; style: string } {
  return {
    classes: baseClasses,
    style: customCSSToString(customCSS),
  };
}
