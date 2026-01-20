/**
 * Tailwind Class Utilities
 *
 * Pure TypeScript utilities for Tailwind class manipulation.
 *
 * NOTE: The main transformation logic has been moved to the Rust backend
 * (`canvas_persist_styles` command) to avoid browser compatibility issues
 * with Babel packages that expect Node.js `process.env`.
 *
 * This file now only exports utility functions for frontend use.
 *
 * @module
 */

import { z } from 'zod';

// ============================================
// Schemas (kept for potential frontend use)
// ============================================

/**
 * A single style change to apply
 */
export const StyleChangeSchema = z.object({
  /** CSS property name (camelCase) */
  property: z.string(),
  /** CSS value */
  value: z.string(),
  /** Tailwind class to add/replace */
  tailwindClass: z.string(),
});

export type StyleChange = z.infer<typeof StyleChangeSchema>;

/**
 * Error codes for transform failures
 */
export const TransformErrorCodeSchema = z.enum([
  'PARSE_ERROR',
  'TRANSFORM_ERROR',
  'VALIDATION_ERROR',
]);

export type TransformErrorCode = z.infer<typeof TransformErrorCodeSchema>;

/**
 * Transform error details
 */
export const TransformErrorSchema = z.object({
  code: TransformErrorCodeSchema,
  message: z.string(),
});

export type TransformError = z.infer<typeof TransformErrorSchema>;

/**
 * Result of AST transformation
 */
export const TransformResultSchema = z.object({
  /** Whether transformation succeeded */
  success: z.boolean(),
  /** Transformed source code (only if success=true) */
  code: z.string().optional(),
  /** Classes that were added */
  addedClasses: z.array(z.string()),
  /** Classes that were removed */
  removedClasses: z.array(z.string()),
  /** Non-fatal warnings */
  warnings: z.array(z.string()),
  /** Error details (only if success=false) */
  error: TransformErrorSchema.optional(),
});

export type TransformResult = z.infer<typeof TransformResultSchema>;

/**
 * Fallback strategy when className target not found
 */
export const FallbackStrategySchema = z.enum(['warn', 'inject-wrapper', 'add-classname-prop']);

export type FallbackStrategy = z.infer<typeof FallbackStrategySchema>;

/**
 * Transform options
 */
export const TransformOptionsSchema = z.object({
  fallbackStrategy: FallbackStrategySchema,
});

export type TransformOptions = z.infer<typeof TransformOptionsSchema>;

// ============================================
// Constants
// ============================================

/**
 * Tailwind variant prefixes (responsive, state, etc.)
 * These should NOT be modified when replacing base classes
 */
const VARIANT_PREFIXES = new Set([
  // Responsive
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  // State
  'hover',
  'focus',
  'active',
  'visited',
  'disabled',
  'focus-within',
  'focus-visible',
  // Dark mode
  'dark',
  // Group/peer
  'group-hover',
  'group-focus',
  'peer-hover',
  'peer-focus',
  // First/last/odd/even
  'first',
  'last',
  'odd',
  'even',
  'first-of-type',
  'last-of-type',
  // Motion
  'motion-safe',
  'motion-reduce',
  // Print
  'print',
  // RTL/LTR
  'rtl',
  'ltr',
  // Placeholder
  'placeholder',
  // Selection
  'selection',
  // File
  'file',
  // Marker
  'marker',
  // Before/after
  'before',
  'after',
]);

/**
 * Class merging utility function names
 */
const MERGE_UTILITY_NAMES = new Set(['cn', 'clsx', 'classNames', 'twMerge', 'cx']);

// ============================================
// Variant Handling
// ============================================

/**
 * Check if a Tailwind class has a variant prefix
 *
 * @example
 * hasVariantPrefix('hover:text-red-500') // true
 * hasVariantPrefix('text-red-500') // false
 * hasVariantPrefix('md:p-4') // true
 */
export function hasVariantPrefix(className: string): boolean {
  const colonIndex = className.indexOf(':');
  if (colonIndex === -1) return false;

  const prefix = className.slice(0, colonIndex);
  return VARIANT_PREFIXES.has(prefix);
}

/**
 * Extract the base class from a variant-prefixed class
 *
 * @example
 * extractBaseClass('hover:text-red-500') // 'text-red-500'
 * extractBaseClass('md:hover:p-4') // 'p-4'
 * extractBaseClass('text-sm') // 'text-sm'
 */
export function extractBaseClass(className: string): string {
  let current = className;

  // Keep stripping variant prefixes until none remain
  let colonIndex = current.indexOf(':');
  while (colonIndex !== -1) {
    const prefix = current.slice(0, colonIndex);
    if (!VARIANT_PREFIXES.has(prefix)) break;

    current = current.slice(colonIndex + 1);
    colonIndex = current.indexOf(':');
  }

  return current;
}

/**
 * Extract the conflict prefix from a Tailwind class
 * Used to determine which classes conflict with each other
 *
 * @example
 * getConflictPrefix('rounded-lg') // 'rounded'
 * getConflictPrefix('text-sm') // 'text'
 * getConflictPrefix('p-4') // 'p'
 * getConflictPrefix('hover:p-4') // 'p'
 */
export function getConflictPrefix(className: string): string {
  // First extract base class (strip variants)
  const baseClass = extractBaseClass(className);

  // Handle negative prefix
  const isNegative = baseClass.startsWith('-');
  const positiveClass = isNegative ? baseClass.slice(1) : baseClass;

  // Handle arbitrary values
  const arbitraryMatch = /^([a-z-]+)-\[/.exec(positiveClass);
  if (arbitraryMatch?.[1]) {
    return arbitraryMatch[1];
  }

  // Handle single-word utilities
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

  if (singleWordUtilities.has(positiveClass)) {
    return positiveClass;
  }

  // Extract prefix from dash-separated class
  const dashIndex = positiveClass.indexOf('-');
  if (dashIndex === -1) {
    return positiveClass;
  }

  return positiveClass.slice(0, dashIndex);
}

// ============================================
// Class Replacement Logic
// ============================================

/**
 * Replace classes in a class string while preserving variants
 *
 * @param classString - Space-separated Tailwind classes
 * @param changes - Style changes to apply
 * @returns Object with new class string and tracking info
 */
export function replaceClasses(
  classString: string,
  changes: readonly StyleChange[]
): {
  result: string;
  added: string[];
  removed: string[];
} {
  const classes = classString.split(/\s+/).filter(Boolean);
  const added: string[] = [];
  const removed: string[] = [];

  // Build a map of conflict prefixes to new classes
  const changeMap = new Map<string, string>();
  for (const change of changes) {
    const prefix = getConflictPrefix(change.tailwindClass);
    changeMap.set(prefix, change.tailwindClass);
  }

  // Process each class
  const newClasses: string[] = [];
  const processedPrefixes = new Set<string>();

  for (const cls of classes) {
    // Skip if class has variant prefix - preserve these
    if (hasVariantPrefix(cls)) {
      newClasses.push(cls);
      continue;
    }

    // Check if this class conflicts with any change
    const prefix = getConflictPrefix(cls);
    const replacement = changeMap.get(prefix);

    if (replacement) {
      // Only add replacement once per prefix
      if (!processedPrefixes.has(prefix)) {
        newClasses.push(replacement);
        added.push(replacement);
        processedPrefixes.add(prefix);
      }
      removed.push(cls);
    } else {
      // Keep the class as-is
      newClasses.push(cls);
    }
  }

  // Add any new classes that weren't replacements
  for (const change of changes) {
    const prefix = getConflictPrefix(change.tailwindClass);
    if (!processedPrefixes.has(prefix)) {
      newClasses.push(change.tailwindClass);
      added.push(change.tailwindClass);
      processedPrefixes.add(prefix);
    }
  }

  return {
    result: newClasses.join(' '),
    added,
    removed,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a source file contains any CVA usage
 */
export function hasCvaUsage(sourceCode: string): boolean {
  // Quick regex check
  return /\bcva\s*\(/.test(sourceCode);
}

/**
 * Check if a source file uses class merging utilities
 */
export function hasClassMergingUtils(sourceCode: string): boolean {
  const patterns = [...MERGE_UTILITY_NAMES].map((name) => `\\b${name}\\s*\\(`);
  const regex = new RegExp(patterns.join('|'));
  return regex.test(sourceCode);
}

/**
 * Extract className strings from source code using regex
 *
 * Note: This is a simplified version that uses regex instead of AST parsing.
 * For precise extraction, use the Rust backend.
 */
export function extractClassNames(sourceCode: string): string[] {
  const classNames: string[] = [];

  // Match className="..."
  const directPattern = /className\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = directPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      classNames.push(match[1]);
    }
  }

  // Match cn("...", ...) and similar utility functions
  const utilityPattern = /(?:cn|clsx|classNames|twMerge|cx)\s*\(\s*"([^"]*)"/g;
  while ((match = utilityPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      classNames.push(match[1]);
    }
  }

  // Match cva("...", ...)
  const cvaPattern = /cva\s*\(\s*"([^"]*)"/g;
  while ((match = cvaPattern.exec(sourceCode)) !== null) {
    if (match[1]) {
      classNames.push(match[1]);
    }
  }

  return classNames;
}

// ============================================
// Deprecated - Use Rust Backend Instead
// ============================================

/**
 * @deprecated Use the `canvas_persist_styles` Tauri command instead.
 *
 * This function previously used Babel AST transformation which caused
 * compatibility issues in the browser environment (Node.js `process` polyfill).
 *
 * The transformation logic has been moved to the Rust backend for reliability.
 */
export function transformTailwindClasses(
  ...args: [sourceCode: string, changes: readonly StyleChange[], options?: TransformOptions]
): TransformResult {
  // Args captured for API compatibility but not used - function is deprecated
  void args;
  return {
    success: false,
    addedClasses: [],
    removedClasses: [],
    warnings: [],
    error: {
      code: 'TRANSFORM_ERROR',
      message:
        'transformTailwindClasses is deprecated. Use the canvas_persist_styles Tauri command instead.',
    },
  };
}
