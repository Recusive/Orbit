/**
 * AST Module
 *
 * Tailwind class manipulation utilities.
 *
 * NOTE: The main transformation logic has been moved to the Rust backend
 * (`canvas_persist_styles` Tauri command) to avoid browser compatibility
 * issues with Babel packages that expect Node.js `process.env`.
 *
 * This module now exports:
 * - Type definitions and schemas for style changes
 * - Utility functions for class manipulation
 * - A deprecated `transformTailwindClasses` stub that returns an error
 *
 * @module
 */

// Main transform function (DEPRECATED - use Rust backend) and types
export {
  /** @deprecated Use `canvas_persist_styles` Tauri command instead */
  transformTailwindClasses,
  type StyleChange,
  type TransformResult,
  type TransformOptions,
  type TransformError,
  type TransformErrorCode,
  type FallbackStrategy,
  // Schemas for validation
  StyleChangeSchema,
  TransformResultSchema,
  TransformOptionsSchema,
  TransformErrorSchema,
  TransformErrorCodeSchema,
  FallbackStrategySchema,
} from './transform';

// Helper functions (still usable in frontend)
export {
  hasVariantPrefix,
  extractBaseClass,
  getConflictPrefix,
  replaceClasses,
  // Analysis utilities
  hasCvaUsage,
  hasClassMergingUtils,
  extractClassNames,
} from './transform';
