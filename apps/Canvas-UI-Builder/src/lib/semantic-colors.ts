/**
 * Semantic Colors Detection System
 *
 * Detects when CSS property changes affect semantic design tokens (like --primary, --background).
 * Allows users to choose between updating just the component or the global token.
 *
 * NOTE: Class extraction uses regex instead of Babel AST to avoid browser
 * compatibility issues with Node.js `process.env` polyfills.
 *
 * @module
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================
// Types
// ============================================

/**
 * Semantic color token names (shadcn/ui design system)
 */
export type SemanticColor =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'input'
  | 'ring';

/**
 * Information about a semantic color usage in the component
 */
export interface SemanticColorUsage {
  /** The Tailwind class being used (e.g., 'bg-primary') */
  className: string;
  /** The semantic token name (e.g., 'primary') */
  semanticToken: SemanticColor;
  /** The CSS variable (e.g., '--primary') */
  cssVariable: string;
  /** Which CSS property this affects */
  property: 'color' | 'backgroundColor' | 'borderColor';
}

// ============================================
// Constants
// ============================================

/**
 * List of all semantic colors in the design system
 */
export const SEMANTIC_COLORS: readonly SemanticColor[] = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

/**
 * Maps Tailwind classes to their semantic tokens
 *
 * Key: Tailwind class (e.g., 'bg-primary')
 * Value: { token: SemanticColor, property: CSS property }
 */
export const SEMANTIC_CLASS_MAP: Readonly<
  Record<string, { token: SemanticColor; property: 'color' | 'backgroundColor' | 'borderColor' }>
> = {
  // Background colors
  'bg-background': { token: 'background', property: 'backgroundColor' },
  'bg-card': { token: 'card', property: 'backgroundColor' },
  'bg-popover': { token: 'popover', property: 'backgroundColor' },
  'bg-primary': { token: 'primary', property: 'backgroundColor' },
  'bg-secondary': { token: 'secondary', property: 'backgroundColor' },
  'bg-muted': { token: 'muted', property: 'backgroundColor' },
  'bg-accent': { token: 'accent', property: 'backgroundColor' },
  'bg-destructive': { token: 'destructive', property: 'backgroundColor' },

  // Text colors
  'text-foreground': { token: 'foreground', property: 'color' },
  'text-card-foreground': { token: 'card-foreground', property: 'color' },
  'text-popover-foreground': { token: 'popover-foreground', property: 'color' },
  'text-primary': { token: 'primary', property: 'color' },
  'text-primary-foreground': { token: 'primary-foreground', property: 'color' },
  'text-secondary': { token: 'secondary', property: 'color' },
  'text-secondary-foreground': { token: 'secondary-foreground', property: 'color' },
  'text-muted': { token: 'muted', property: 'color' },
  'text-muted-foreground': { token: 'muted-foreground', property: 'color' },
  'text-accent': { token: 'accent', property: 'color' },
  'text-accent-foreground': { token: 'accent-foreground', property: 'color' },
  'text-destructive': { token: 'destructive', property: 'color' },
  'text-destructive-foreground': { token: 'destructive-foreground', property: 'color' },

  // Border colors
  'border-border': { token: 'border', property: 'borderColor' },
  'border-input': { token: 'input', property: 'borderColor' },
  'border-primary': { token: 'primary', property: 'borderColor' },
  'border-secondary': { token: 'secondary', property: 'borderColor' },
  'border-muted': { token: 'muted', property: 'borderColor' },
  'border-accent': { token: 'accent', property: 'borderColor' },
  'border-destructive': { token: 'destructive', property: 'borderColor' },

  // Ring colors
  'ring-ring': { token: 'ring', property: 'borderColor' },
  'ring-primary': { token: 'primary', property: 'borderColor' },
} as const;

/**
 * CSS property to Tailwind prefix mapping
 */
const CSS_TO_TAILWIND_PREFIX: Readonly<
  Record<'color' | 'backgroundColor' | 'borderColor', string>
> = {
  color: 'text-',
  backgroundColor: 'bg-',
  borderColor: 'border-',
} as const;

// ============================================
// Detection Functions
// ============================================

/**
 * Detect if any of the current classes use a semantic color for the given property
 *
 * @param currentClasses - Array of Tailwind classes currently on the component
 * @param propertyBeingChanged - The CSS property being modified
 * @returns SemanticColorUsage if a semantic color is being used, null otherwise
 *
 * @example
 * ```typescript
 * const classes = ['bg-primary', 'text-foreground', 'rounded-lg'];
 * const usage = detectSemanticColorUsage(classes, 'backgroundColor');
 * // → { className: 'bg-primary', semanticToken: 'primary', cssVariable: '--primary', property: 'backgroundColor' }
 * ```
 */
export function detectSemanticColorUsage(
  currentClasses: readonly string[],
  propertyBeingChanged: 'color' | 'backgroundColor' | 'borderColor'
): SemanticColorUsage | null {
  const prefix = CSS_TO_TAILWIND_PREFIX[propertyBeingChanged];

  for (const cls of currentClasses) {
    // Check direct match
    const mapping = SEMANTIC_CLASS_MAP[cls];
    if (mapping?.property === propertyBeingChanged) {
      return {
        className: cls,
        semanticToken: mapping.token,
        cssVariable: `--${mapping.token}`,
        property: propertyBeingChanged,
      };
    }

    // Also check for classes with variant prefixes (e.g., 'hover:bg-primary')
    if (cls.includes(':')) {
      const baseClass = cls.split(':').pop() ?? '';
      const baseMapping = SEMANTIC_CLASS_MAP[baseClass];
      if (baseMapping?.property === propertyBeingChanged) {
        // Don't flag variant-prefixed classes - they're intentionally different states
        continue;
      }
    }

    // Check if it starts with the right prefix and uses a semantic token
    if (cls.startsWith(prefix)) {
      const tokenPart = cls.slice(prefix.length);
      // Check if tokenPart is a semantic color name
      if (SEMANTIC_COLORS.includes(tokenPart as SemanticColor)) {
        return {
          className: cls,
          semanticToken: tokenPart as SemanticColor,
          cssVariable: `--${tokenPart}`,
          property: propertyBeingChanged,
        };
      }
      // Check for compound tokens like 'primary-foreground'
      for (const token of SEMANTIC_COLORS) {
        if (tokenPart === token) {
          return {
            className: cls,
            semanticToken: token,
            cssVariable: `--${token}`,
            property: propertyBeingChanged,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Check if a CSS property is a color property that could use semantic tokens
 */
export function isColorProperty(
  property: string
): property is 'color' | 'backgroundColor' | 'borderColor' {
  return property === 'color' || property === 'backgroundColor' || property === 'borderColor';
}

// ============================================
// Class Extraction (Regex-based)
// ============================================

/**
 * Result type for file read from Tauri
 */
interface FileReadResult {
  success: boolean;
  content: string | null;
  error: string | null;
}

/**
 * Extract all Tailwind classes from a component's source code
 *
 * Uses regex patterns to find className string literals.
 * This avoids browser compatibility issues with Babel AST parsing.
 *
 * @param componentName - Name of the component (e.g., 'button')
 * @param componentType - 'ui' for shadcn components, 'custom' for user-created
 * @returns Array of class names found in the component
 *
 * @example
 * ```typescript
 * const classes = await extractClassesFromComponent('button', 'ui');
 * // → ['inline-flex', 'items-center', 'justify-center', 'rounded-md', 'text-sm', 'bg-primary', ...]
 * ```
 */
export async function extractClassesFromComponent(
  componentName: string,
  componentType: 'ui' | 'custom'
): Promise<string[]> {
  // Read component source via Tauri
  const result = await invoke<FileReadResult>('canvas_read_component_source', {
    componentName,
    componentType,
    testMode: false,
  });

  if (!result.success || !result.content) {
    return [];
  }

  return extractClassesFromSource(result.content);
}

/**
 * Extract Tailwind classes from source code string using regex
 *
 * Patterns matched:
 * 1. className="..." - Direct string literals
 * 2. className={'...'} - Single-quoted expression strings
 * 3. className={"..."} - Double-quoted expression strings
 * 4. cn("...", ...), clsx("...", ...), etc. - Utility function calls
 * 5. cva("...", { ... }) - CVA base classes
 *
 * @param sourceCode - The component source code
 * @returns Array of unique class names
 */
export function extractClassesFromSource(sourceCode: string): string[] {
  const classes: string[] = [];

  // Pattern 1: className="..."
  const classNameStringPattern = /className\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = classNameStringPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Pattern 2: className={'...'}
  const classNameSingleQuotePattern = /className\s*=\s*\{\s*'([^']*)'\s*\}/g;
  while ((match = classNameSingleQuotePattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Pattern 3: className={"..."}
  const classNameExprStringPattern = /className\s*=\s*\{\s*"([^"]*)"\s*\}/g;
  while ((match = classNameExprStringPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Pattern 4: cn("...", ...), clsx("...", ...), classNames("...", ...), twMerge("...", ...), cx("...", ...)
  const utilityFnPattern = /(?:cn|clsx|classNames|twMerge|cx)\s*\(\s*"([^"]*)"/g;
  while ((match = utilityFnPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Also match single-quoted strings in utility functions
  const utilityFnSinglePattern = /(?:cn|clsx|classNames|twMerge|cx)\s*\(\s*'([^']*)'/g;
  while ((match = utilityFnSinglePattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Pattern 5: cva("...", { ... }) - first argument
  const cvaPattern = /cva\s*\(\s*"([^"]*)"/g;
  while ((match = cvaPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Also match single-quoted CVA base classes
  const cvaSinglePattern = /cva\s*\(\s*'([^']*)'/g;
  while ((match = cvaSinglePattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      extractFromClassString(match[1], classes);
    }
  }

  // Deduplicate
  return [...new Set(classes)];
}

/**
 * Extract individual class names from a space-separated class string
 */
function extractFromClassString(classString: string, output: string[]): void {
  const parts = classString.split(/\s+/).filter(Boolean);
  output.push(...parts);
}

// ============================================
// Token Helpers
// ============================================

/**
 * Get the display name for a semantic token
 */
export function getTokenDisplayName(token: SemanticColor): string {
  return token
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if a token is a foreground variant
 */
export function isForegroundToken(token: SemanticColor): boolean {
  return token.endsWith('-foreground') || token === 'foreground';
}

/**
 * Get the base token for a foreground token
 */
export function getBaseToken(token: SemanticColor): SemanticColor {
  if (token.endsWith('-foreground')) {
    const base = token.replace('-foreground', '');
    if (SEMANTIC_COLORS.includes(base as SemanticColor)) {
      return base as SemanticColor;
    }
  }
  return token;
}
