/**
 * Design to React Code Generator
 *
 * Converts design tree nodes (frames, rectangles, text, etc.) into React component code.
 * This bridges the visual design system with live code preview.
 */

import type {
  DesignNode,
  DesignTree,
  FrameNode,
  LayerNode,
  TextNode,
  Fill,
  Stroke,
  CornerRadius,
  Shadow,
  AutoLayout,
} from '../types/designNodeTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface GenerateOptions {
  /** Component name for the generated code */
  componentName?: string;
  /** Whether to include React import */
  includeImport?: boolean;
  /** Whether to use inline styles or generate CSS classes */
  styleMode?: 'inline' | 'tailwind';
  /** Indent string (default: 2 spaces) */
  indent?: string;
}

export interface GeneratedCode {
  /** The generated React component code */
  code: string;
  /** Component name */
  componentName: string;
  /** Any warnings during generation */
  warnings: string[];
}

// =============================================================================
// CSS CONVERSION HELPERS
// =============================================================================

/**
 * Convert a Fill to CSS background value
 */
function fillToCSS(fill: Fill): string | null {
  if (fill.opacity === 0) return null;

  switch (fill.type) {
    case 'solid':
      if (fill.color === undefined) return null;
      if (fill.opacity !== undefined && fill.opacity < 1) {
        return hexToRGBA(fill.color, fill.opacity);
      }
      return fill.color;

    case 'gradient': {
      if (fill.gradientStops === undefined || fill.gradientStops.length < 2) {
        return null;
      }
      const stops = fill.gradientStops
        .map((stop) => `${stop.color} ${String(Math.round(stop.position * 100))}%`)
        .join(', ');

      if (fill.gradientType === 'radial') {
        return `radial-gradient(circle, ${stops})`;
      }
      const angle = fill.gradientAngle ?? 90;
      return `linear-gradient(${String(angle)}deg, ${stops})`;
    }

    case 'image':
      if (fill.imageUrl === undefined) return null;
      return `url(${fill.imageUrl})`;

    default:
      return null;
  }
}

/**
 * Convert hex color to RGBA
 */
function hexToRGBA(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(opacity)})`;
}

/**
 * Convert strokes to CSS border
 */
function strokeToCSS(stroke: Stroke): string {
  const style = stroke.style ?? 'solid';
  const color =
    stroke.opacity !== undefined && stroke.opacity < 1
      ? hexToRGBA(stroke.color, stroke.opacity)
      : stroke.color;
  return `${String(stroke.width)}px ${style} ${color}`;
}

/**
 * Convert corner radius to CSS
 */
function cornerRadiusToCSS(radius: CornerRadius | number): string {
  if (typeof radius === 'number') {
    return `${String(radius)}px`;
  }
  return `${String(radius.topLeft)}px ${String(radius.topRight)}px ${String(radius.bottomRight)}px ${String(radius.bottomLeft)}px`;
}

/**
 * Convert shadows to CSS box-shadow
 */
function shadowsToCSS(shadows: Shadow[]): string | null {
  if (shadows.length === 0) return null;

  return shadows
    .map((shadow) => {
      const inset = shadow.type === 'inner' ? 'inset ' : '';
      const color =
        shadow.opacity !== undefined && shadow.opacity < 1
          ? hexToRGBA(shadow.color, shadow.opacity)
          : shadow.color;
      return `${inset}${String(shadow.x)}px ${String(shadow.y)}px ${String(shadow.blur)}px ${String(shadow.spread)}px ${color}`;
    })
    .join(', ');
}

/**
 * Convert auto-layout to flexbox CSS
 */
function autoLayoutToCSS(autoLayout: AutoLayout): Record<string, string> {
  if (!autoLayout.enabled) return {};

  const styles: Record<string, string> = {
    display: 'flex',
    flexDirection: autoLayout.direction === 'vertical' ? 'column' : 'row',
    gap: `${String(autoLayout.spacing)}px`,
  };

  // Padding
  const { padding } = autoLayout;
  if (padding.top !== 0 || padding.right !== 0 || padding.bottom !== 0 || padding.left !== 0) {
    styles['padding'] =
      `${String(padding.top)}px ${String(padding.right)}px ${String(padding.bottom)}px ${String(padding.left)}px`;
  }

  // Primary axis alignment (justify-content)
  const justifyMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
  };
  styles['justifyContent'] = justifyMap[autoLayout.primaryAxisAlign] ?? 'flex-start';

  // Counter axis alignment (align-items)
  const alignMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };
  styles['alignItems'] = alignMap[autoLayout.counterAxisAlign] ?? 'stretch';

  // Wrap
  if (autoLayout.wrap) {
    styles['flexWrap'] = 'wrap';
  }

  return styles;
}

// =============================================================================
// STYLE GENERATION
// =============================================================================

/**
 * Generate CSS styles for a design node
 */
function generateNodeStyles(node: DesignNode, isRootFrame: boolean): Record<string, string> {
  const styles: Record<string, string> = {};

  // Position and size
  if (isRootFrame) {
    styles['position'] = 'relative';
    styles['width'] = `${String(node.width)}px`;
    styles['height'] = `${String(node.height)}px`;
  } else {
    styles['position'] = 'absolute';
    styles['left'] = `${String(node.x)}px`;
    styles['top'] = `${String(node.y)}px`;
    styles['width'] = `${String(node.width)}px`;
    styles['height'] = `${String(node.height)}px`;
  }

  // Rotation
  if (node.rotation !== 0) {
    styles['transform'] = `rotate(${String(node.rotation)}deg)`;
  }

  // Opacity
  if (node.opacity < 1) {
    styles['opacity'] = String(node.opacity);
  }

  // Visibility
  if (!node.visible) {
    styles['display'] = 'none';
  }

  // Background from fills
  if (node.fills.length > 0) {
    const visibleFills = node.fills.filter((f) => f.opacity !== 0);
    if (visibleFills.length > 0) {
      const firstFill = visibleFills[0];
      if (firstFill !== undefined) {
        const bg = fillToCSS(firstFill);
        if (bg !== null) {
          if (firstFill.type === 'image') {
            styles['backgroundImage'] = bg;
            styles['backgroundSize'] = firstFill.imageScaleMode === 'fit' ? 'contain' : 'cover';
            styles['backgroundPosition'] = 'center';
            styles['backgroundRepeat'] =
              firstFill.imageScaleMode === 'tile' ? 'repeat' : 'no-repeat';
          } else {
            styles['background'] = bg;
          }
        }
      }
    }
  }

  // Border from strokes
  if (node.strokes.length > 0) {
    const firstStroke = node.strokes[0];
    if (firstStroke !== undefined) {
      styles['border'] = strokeToCSS(firstStroke);
      // Adjust for stroke position
      if (firstStroke.position === 'inside') {
        styles['boxSizing'] = 'border-box';
      }
    }
  }

  // Corner radius
  if (node.cornerRadius !== 0) {
    const radiusCSS = cornerRadiusToCSS(node.cornerRadius);
    if (radiusCSS !== '0px' && radiusCSS !== '0px 0px 0px 0px') {
      styles['borderRadius'] = radiusCSS;
    }
  }

  // Shadows
  const boxShadow = shadowsToCSS(node.effects.shadows);
  if (boxShadow !== null) {
    styles['boxShadow'] = boxShadow;
  }

  // Blur
  if (node.effects.blur !== undefined) {
    if (node.effects.blur.type === 'layer') {
      styles['filter'] = `blur(${String(node.effects.blur.radius)}px)`;
    } else {
      styles['backdropFilter'] = `blur(${String(node.effects.blur.radius)}px)`;
    }
  }

  // Clip content
  if (node.clipContent) {
    styles['overflow'] = 'hidden';
  }

  // Blend mode
  if (node.blendMode !== undefined && node.blendMode !== 'normal') {
    styles['mixBlendMode'] = node.blendMode;
  }

  // Ellipse shape
  if (node.type === 'ellipse') {
    styles['borderRadius'] = '50%';
  }

  return styles;
}

/**
 * Generate text-specific styles
 */
function generateTextStyles(node: TextNode): Record<string, string> {
  const styles: Record<string, string> = {};
  const { textProperties } = node;

  styles['fontFamily'] = `'${textProperties.fontFamily}', sans-serif`;
  styles['fontSize'] = `${String(textProperties.fontSize)}px`;
  styles['fontWeight'] = String(textProperties.fontWeight);
  styles['textAlign'] = textProperties.textAlign;
  styles['letterSpacing'] =
    textProperties.letterSpacing !== 0 ? `${String(textProperties.letterSpacing)}px` : '0';

  // Line height
  if (textProperties.lineHeight === 'auto') {
    styles['lineHeight'] = 'normal';
  } else {
    styles['lineHeight'] = `${String(textProperties.lineHeight)}px`;
  }

  // Text decoration
  if (textProperties.textDecoration !== 'none') {
    styles['textDecoration'] = textProperties.textDecoration;
  }

  // Text case
  if (textProperties.textCase !== undefined && textProperties.textCase !== 'none') {
    styles['textTransform'] = textProperties.textCase;
  }

  // Vertical alignment (using flexbox)
  if (textProperties.textAlignVertical !== 'top') {
    styles['display'] = 'flex';
    styles['alignItems'] = textProperties.textAlignVertical === 'center' ? 'center' : 'flex-end';
  }

  // Text color from fills
  if (node.fills.length > 0) {
    const firstFill = node.fills[0];
    if (firstFill?.type === 'solid' && firstFill.color !== undefined) {
      styles['color'] =
        firstFill.opacity !== undefined && firstFill.opacity < 1
          ? hexToRGBA(firstFill.color, firstFill.opacity)
          : firstFill.color;
    }
  }

  return styles;
}

/**
 * Convert styles object to inline style string
 */
function stylesToString(styles: Record<string, string>, indent: string): string {
  const entries = Object.entries(styles);
  if (entries.length === 0) return '{}';

  // Convert camelCase to proper JSX style format
  const lines = entries.map(([key, value]) => {
    return `${indent}  ${key}: '${value}',`;
  });

  return `{\n${lines.join('\n')}\n${indent}}`;
}

// =============================================================================
// CODE GENERATION
// =============================================================================

/**
 * Escape text content for JSX
 */
function escapeJSX(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}

/**
 * Generate React code for a single node
 */
function generateNodeCode(
  node: DesignNode,
  tree: DesignTree,
  depth: number,
  indent: string,
  isRootFrame: boolean
): string {
  const currentIndent = indent.repeat(depth + 2);
  const childIndent = indent.repeat(depth + 3);

  // Get base styles
  const baseStyles = generateNodeStyles(node, isRootFrame);

  switch (node.type) {
    case 'frame': {
      // Merge auto-layout styles if enabled
      let styles = { ...baseStyles };
      if (node.autoLayout?.enabled === true) {
        const autoLayoutStyles = autoLayoutToCSS(node.autoLayout);
        styles = { ...styles, ...autoLayoutStyles };
      }

      const styleStr = stylesToString(styles, currentIndent);

      // Generate children
      const children = node.children
        .map((childId) => tree.nodes.get(childId))
        .filter((n): n is DesignNode => n?.visible === true)
        .map((child) => generateNodeCode(child, tree, depth + 1, indent, false))
        .join('\n');

      if (children.length > 0) {
        return `${currentIndent}<div style={${styleStr}}>\n${children}\n${currentIndent}</div>`;
      }
      return `${currentIndent}<div style={${styleStr}} />`;
    }

    case 'text': {
      const textStyles = { ...baseStyles, ...generateTextStyles(node) };

      // Remove background for text (color is used instead)
      delete textStyles['background'];

      const styleStr = stylesToString(textStyles, currentIndent);
      const content = escapeJSX(node.textProperties.content);

      return `${currentIndent}<span style={${styleStr}}>${content}</span>`;
    }

    case 'rectangle': {
      const styleStr = stylesToString(baseStyles, currentIndent);
      return `${currentIndent}<div style={${styleStr}} />`;
    }

    case 'ellipse': {
      const styleStr = stylesToString(baseStyles, currentIndent);
      return `${currentIndent}<div style={${styleStr}} />`;
    }

    case 'component': {
      const styleStr = stylesToString(baseStyles, currentIndent);
      return `${currentIndent}<div style={${styleStr}}>\n${childIndent}{/* Component: ${node.name} */}\n${currentIndent}</div>`;
    }

    case 'instance': {
      const styleStr = stylesToString(baseStyles, currentIndent);
      return `${currentIndent}<div style={${styleStr}}>\n${childIndent}{/* Instance */}\n${currentIndent}</div>`;
    }

    case 'layer': {
      // Layer is a page container - renders as a wrapper for child frames
      const layerStyles = {
        ...baseStyles,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      };
      const styleStr = stylesToString(layerStyles, currentIndent);

      // Generate all child frames (sections within the page)
      const children = node.children
        .map((childId) => tree.nodes.get(childId))
        .filter((n): n is DesignNode => n?.visible === true)
        .map((child) => generateNodeCode(child, tree, depth + 1, indent, false))
        .join('\n');

      if (children.length > 0) {
        return `${currentIndent}<div style={${styleStr}}>\n${children}\n${currentIndent}</div>`;
      }
      return `${currentIndent}<div style={${styleStr}} />`;
    }
  }
}

/**
 * Generate a complete React component from a frame
 */
export function generateReactComponent(
  frameId: string,
  tree: DesignTree,
  options: GenerateOptions = {}
): GeneratedCode {
  const { componentName = 'GeneratedComponent', includeImport = true, indent = '  ' } = options;

  const warnings: string[] = [];

  // Get the frame node
  const frame = tree.nodes.get(frameId);
  if (frame === undefined) {
    return {
      code: `// Error: Frame not found: ${frameId}`,
      componentName,
      warnings: ['Frame not found'],
    };
  }

  if (frame.type !== 'frame') {
    return {
      code: `// Error: Node is not a frame: ${frame.type}`,
      componentName,
      warnings: ['Node is not a frame'],
    };
  }

  // Generate the component body
  const body = generateNodeCode(frame, tree, 0, indent, true);

  // Build the full component
  const lines: string[] = [];

  if (includeImport) {
    lines.push("import React from 'react';");
    lines.push('');
  }

  lines.push(`export default function ${componentName}() {`);
  lines.push(`${indent}return (`);
  lines.push(body);
  lines.push(`${indent});`);
  lines.push('}');

  return {
    code: lines.join('\n'),
    componentName,
    warnings,
  };
}

/**
 * Generate a complete React page component from a Layer
 * A Layer represents a full page that contains frames (sections)
 */
export function generateLayerComponent(
  layerId: string,
  tree: DesignTree,
  options: GenerateOptions = {}
): GeneratedCode {
  const { componentName = 'GeneratedPage', includeImport = true, indent = '  ' } = options;

  const warnings: string[] = [];

  // Get the layer node
  const layer = tree.nodes.get(layerId);
  if (layer === undefined) {
    return {
      code: `// Error: Layer not found: ${layerId}`,
      componentName,
      warnings: ['Layer not found'],
    };
  }

  if (layer.type !== 'layer') {
    return {
      code: `// Error: Node is not a layer: ${layer.type}`,
      componentName,
      warnings: ['Node is not a layer'],
    };
  }

  // Generate the page body (layer renders all child frames as sections)
  const body = generateNodeCode(layer, tree, 0, indent, true);

  // Build the full component
  const lines: string[] = [];

  if (includeImport) {
    lines.push("import React from 'react';");
    lines.push('');
  }

  lines.push(`export default function ${componentName}() {`);
  lines.push(`${indent}return (`);
  lines.push(body);
  lines.push(`${indent});`);
  lines.push('}');

  return {
    code: lines.join('\n'),
    componentName,
    warnings,
  };
}

/**
 * Quick helper to generate code from a layer node directly
 */
export function layerToReact(layer: LayerNode, tree: DesignTree, componentName?: string): string {
  const result = generateLayerComponent(layer.id, tree, {
    componentName: componentName ?? sanitizeComponentName(layer.name),
    includeImport: true,
  });
  return result.code;
}

/**
 * Generate React code for a frame (simplified version without wrapper)
 */
export function generateFrameJSX(frameId: string, tree: DesignTree, indent = '  '): string {
  const frame = tree.nodes.get(frameId);
  if (frame?.type !== 'frame') {
    return '<!-- Frame not found -->';
  }

  return generateNodeCode(frame, tree, 0, indent, true);
}

/**
 * Quick helper to generate code from a frame node directly
 */
export function frameToReact(frame: FrameNode, tree: DesignTree, componentName?: string): string {
  const result = generateReactComponent(frame.id, tree, {
    componentName: componentName ?? sanitizeComponentName(frame.name),
    includeImport: true,
  });
  return result.code;
}

/**
 * Sanitize a frame name to be a valid React component name
 */
function sanitizeComponentName(name: string): string {
  // Remove invalid characters and convert to PascalCase
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // Ensure it starts with a letter
  if (/^[0-9]/.test(cleaned)) {
    return `Component${cleaned}`;
  }

  return cleaned.length > 0 ? cleaned : 'GeneratedComponent';
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  fillToCSS,
  strokeToCSS,
  cornerRadiusToCSS,
  shadowsToCSS,
  autoLayoutToCSS,
  sanitizeComponentName,
};
