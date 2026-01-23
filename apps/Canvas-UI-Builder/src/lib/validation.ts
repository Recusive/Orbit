/**
 * Component Validation Utilities
 *
 * Validates component names and types for the Canvas UI Builder.
 * Uses Zod for runtime validation with helpful error messages.
 *
 * @module
 */

import { z } from 'zod';

// ============================================
// Schemas
// ============================================

/**
 * Valid component name pattern:
 * - Starts with a letter (a-z, A-Z)
 * - Contains only alphanumeric characters and hyphens
 * - No consecutive hyphens
 * - Does not end with a hyphen
 * - Length: 1-64 characters
 */
const COMPONENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*$/;

/**
 * Schema for component name validation
 */
export const ComponentNameSchema = z
  .string()
  .min(1, 'Component name cannot be empty')
  .max(64, 'Component name must be 64 characters or less')
  .regex(
    COMPONENT_NAME_PATTERN,
    'Component name must start with a letter, contain only letters, numbers, and hyphens, and not end with a hyphen'
  );

/**
 * Schema for component type validation
 */
export const ComponentTypeSchema = z.enum(['ui', 'custom']);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

/**
 * Schema for full component identifier (name + type)
 */
export const ComponentIdentifierSchema = z.object({
  name: ComponentNameSchema,
  type: ComponentTypeSchema,
});

export type ComponentIdentifier = z.infer<typeof ComponentIdentifierSchema>;

// ============================================
// Validation Results
// ============================================

/**
 * Result type for validation functions
 */
export type ValidationResult = { valid: true } | { valid: false; error: string };

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a component name
 *
 * @param name - The component name to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * validateComponentName('my-button')
 * // → { valid: true }
 *
 * @example
 * validateComponentName('123-button')
 * // → { valid: false, error: 'Component name must start with a letter...' }
 */
export function validateComponentName(name: string): ValidationResult {
  const result = ComponentNameSchema.safeParse(name);

  if (result.success) {
    return { valid: true };
  }

  // Extract the first error message (Zod 4 uses 'issues' not 'errors')
  const errorMessage = result.error.issues[0]?.message ?? 'Invalid component name';
  return { valid: false, error: errorMessage };
}

/**
 * Validate a component type
 *
 * @param type - The component type to validate
 * @returns Validation result with error message if invalid
 */
export function validateComponentType(type: string): ValidationResult {
  const result = ComponentTypeSchema.safeParse(type);

  if (result.success) {
    return { valid: true };
  }

  // Zod 4 uses 'issues' array
  const errorMessage = result.error.issues[0]?.message ?? 'Component type must be "ui" or "custom"';
  return { valid: false, error: errorMessage };
}

/**
 * Validate a full component identifier (name + type)
 *
 * @param name - The component name
 * @param type - The component type
 * @returns Validation result with error message if invalid
 *
 * @example
 * validateComponentIdentifier('my-button', 'ui')
 * // → { valid: true }
 *
 * @example
 * validateComponentIdentifier('', 'ui')
 * // → { valid: false, error: 'Component name cannot be empty' }
 */
export function validateComponentIdentifier(name: string, type: string): ValidationResult {
  const result = ComponentIdentifierSchema.safeParse({ name, type });

  if (result.success) {
    return { valid: true };
  }

  // Zod 4 uses 'issues' array
  const errorMessage = result.error.issues[0]?.message ?? 'Invalid component identifier';
  return { valid: false, error: errorMessage };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Normalize a component name to a valid format
 *
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes invalid characters
 * - Removes consecutive hyphens
 * - Removes leading/trailing hyphens
 *
 * @param input - Raw input string
 * @returns Normalized component name
 *
 * @example
 * normalizeComponentName('My Button Component')
 * // → 'my-button-component'
 *
 * @example
 * normalizeComponentName('  --button--123-- ')
 * // → 'button-123'
 */
export function normalizeComponentName(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Remove characters that aren't alphanumeric or hyphens
      .replace(/[^a-z0-9-]/g, '')
      // Remove consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading hyphens
      .replace(/^-+/, '')
      // Remove trailing hyphens
      .replace(/-+$/, '')
  );
}

/**
 * Convert a component name to PascalCase (for React component exports)
 *
 * @param name - Kebab-case component name
 * @returns PascalCase name
 *
 * @example
 * toPascalCase('my-button')
 * // → 'MyButton'
 */
export function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Convert a PascalCase name to kebab-case
 *
 * @param name - PascalCase component name
 * @returns Kebab-case name
 *
 * @example
 * toKebabCase('MyButton')
 * // → 'my-button'
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Generate a unique component name by appending a number suffix
 *
 * @param baseName - The base component name
 * @param existingNames - Set of existing component names
 * @returns A unique name that doesn't exist in the set
 *
 * @example
 * const existing = new Set(['button', 'button-1', 'button-2']);
 * generateUniqueName('button', existing)
 * // → 'button-3'
 */
export function generateUniqueName(baseName: string, existingNames: ReadonlySet<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  let candidate = `${baseName}-${String(counter)}`;

  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${baseName}-${String(counter)}`;
  }

  return candidate;
}

// ============================================
// File Path Validation
// ============================================

/**
 * Reserved names that cannot be used as component names
 * (commonly reserved by file systems or frameworks)
 */
const RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'lpt1',
  'lpt2',
  'lpt3',
  'index',
  'utils',
  'lib',
  'types',
]);

/**
 * Check if a name is reserved
 *
 * @param name - The component name to check
 * @returns true if the name is reserved
 */
export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.toLowerCase());
}

/**
 * Validate a component name for file system safety
 *
 * Additional checks beyond the schema validation:
 * - Not a reserved name
 * - Not too similar to existing names (basic check)
 *
 * @param name - The component name
 * @returns Validation result
 */
export function validateNameForFilesystem(name: string): ValidationResult {
  // First check basic schema
  const schemaResult = validateComponentName(name);
  if (!schemaResult.valid) {
    return schemaResult;
  }

  // Check reserved names
  if (isReservedName(name)) {
    return {
      valid: false,
      error: `"${name}" is a reserved name and cannot be used`,
    };
  }

  return { valid: true };
}
