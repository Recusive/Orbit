/**
 * Default Variable Collections
 *
 * Built-in primitive collections for colors, spacing, radii, and typography.
 * These provide a foundation that users can extend or override.
 */

import type { Variable, VariableCollection, VariableMode } from './variableTypes';

// =============================================================================
// MODES
// =============================================================================

export const lightMode: VariableMode = { id: 'light', name: 'Light' };
export const darkMode: VariableMode = { id: 'dark', name: 'Dark' };

// =============================================================================
// COLOR PRIMITIVES
// =============================================================================

const colorPrimitives: Variable[] = [
  // Grays
  {
    id: 'color-gray-50',
    name: 'Gray 50',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#FAFAFA', dark: '#FAFAFA' },
  },
  {
    id: 'color-gray-100',
    name: 'Gray 100',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#F4F4F5', dark: '#F4F4F5' },
  },
  {
    id: 'color-gray-200',
    name: 'Gray 200',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#E4E4E7', dark: '#E4E4E7' },
  },
  {
    id: 'color-gray-300',
    name: 'Gray 300',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#D4D4D8', dark: '#D4D4D8' },
  },
  {
    id: 'color-gray-400',
    name: 'Gray 400',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#A1A1AA', dark: '#A1A1AA' },
  },
  {
    id: 'color-gray-500',
    name: 'Gray 500',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#71717A', dark: '#71717A' },
  },
  {
    id: 'color-gray-600',
    name: 'Gray 600',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#52525B', dark: '#52525B' },
  },
  {
    id: 'color-gray-700',
    name: 'Gray 700',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#3F3F46', dark: '#3F3F46' },
  },
  {
    id: 'color-gray-800',
    name: 'Gray 800',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#27272A', dark: '#27272A' },
  },
  {
    id: 'color-gray-900',
    name: 'Gray 900',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#18181B', dark: '#18181B' },
  },
  // Primary (Blue)
  {
    id: 'color-primary-50',
    name: 'Primary 50',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#EFF6FF', dark: '#EFF6FF' },
  },
  {
    id: 'color-primary-500',
    name: 'Primary 500',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#3B82F6', dark: '#3B82F6' },
  },
  {
    id: 'color-primary-600',
    name: 'Primary 600',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#2563EB', dark: '#2563EB' },
  },
  {
    id: 'color-primary-700',
    name: 'Primary 700',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#1D4ED8', dark: '#1D4ED8' },
  },
  // Success (Green)
  {
    id: 'color-success-500',
    name: 'Success 500',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#22C55E', dark: '#22C55E' },
  },
  // Warning (Amber)
  {
    id: 'color-warning-500',
    name: 'Warning 500',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#F59E0B', dark: '#F59E0B' },
  },
  // Error (Red)
  {
    id: 'color-error-500',
    name: 'Error 500',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#EF4444', dark: '#EF4444' },
  },
  // Base
  {
    id: 'color-white',
    name: 'White',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#FFFFFF', dark: '#FFFFFF' },
  },
  {
    id: 'color-black',
    name: 'Black',
    type: 'color',
    collectionId: 'primitives-colors',
    valuesByMode: { light: '#000000', dark: '#000000' },
  },
];

// =============================================================================
// SEMANTIC COLORS (Reference primitives, differ by mode)
// =============================================================================

const semanticColors: Variable[] = [
  {
    id: 'color-background',
    name: 'Background',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Main background color',
    valuesByMode: {
      light: { variableId: 'color-white' },
      dark: { variableId: 'color-gray-900' },
    },
  },
  {
    id: 'color-foreground',
    name: 'Foreground',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Main text color',
    valuesByMode: {
      light: { variableId: 'color-gray-900' },
      dark: { variableId: 'color-gray-50' },
    },
  },
  {
    id: 'color-muted',
    name: 'Muted',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Muted background',
    valuesByMode: {
      light: { variableId: 'color-gray-100' },
      dark: { variableId: 'color-gray-800' },
    },
  },
  {
    id: 'color-muted-foreground',
    name: 'Muted Foreground',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Muted text color',
    valuesByMode: {
      light: { variableId: 'color-gray-500' },
      dark: { variableId: 'color-gray-400' },
    },
  },
  {
    id: 'color-border',
    name: 'Border',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Default border color',
    valuesByMode: {
      light: { variableId: 'color-gray-200' },
      dark: { variableId: 'color-gray-700' },
    },
  },
  {
    id: 'color-primary',
    name: 'Primary',
    type: 'color',
    collectionId: 'semantic-colors',
    description: 'Primary brand color',
    valuesByMode: {
      light: { variableId: 'color-primary-600' },
      dark: { variableId: 'color-primary-500' },
    },
  },
];

// =============================================================================
// SPACING
// =============================================================================

const spacingVariables: Variable[] = [
  {
    id: 'spacing-0',
    name: '0',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 0, dark: 0 },
  },
  {
    id: 'spacing-1',
    name: '1 (4px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 4, dark: 4 },
  },
  {
    id: 'spacing-2',
    name: '2 (8px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 8, dark: 8 },
  },
  {
    id: 'spacing-3',
    name: '3 (12px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 12, dark: 12 },
  },
  {
    id: 'spacing-4',
    name: '4 (16px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 16, dark: 16 },
  },
  {
    id: 'spacing-5',
    name: '5 (20px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 20, dark: 20 },
  },
  {
    id: 'spacing-6',
    name: '6 (24px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 24, dark: 24 },
  },
  {
    id: 'spacing-8',
    name: '8 (32px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 32, dark: 32 },
  },
  {
    id: 'spacing-10',
    name: '10 (40px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 40, dark: 40 },
  },
  {
    id: 'spacing-12',
    name: '12 (48px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 48, dark: 48 },
  },
  {
    id: 'spacing-16',
    name: '16 (64px)',
    type: 'number',
    collectionId: 'primitives-spacing',
    valuesByMode: { light: 64, dark: 64 },
  },
];

// =============================================================================
// RADII
// =============================================================================

const radiiVariables: Variable[] = [
  {
    id: 'radius-none',
    name: 'None',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 0, dark: 0 },
  },
  {
    id: 'radius-sm',
    name: 'Small',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 4, dark: 4 },
  },
  {
    id: 'radius-md',
    name: 'Medium',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 6, dark: 6 },
  },
  {
    id: 'radius-lg',
    name: 'Large',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 8, dark: 8 },
  },
  {
    id: 'radius-xl',
    name: 'Extra Large',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 12, dark: 12 },
  },
  {
    id: 'radius-2xl',
    name: '2X Large',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 16, dark: 16 },
  },
  {
    id: 'radius-full',
    name: 'Full',
    type: 'number',
    collectionId: 'primitives-radii',
    valuesByMode: { light: 9999, dark: 9999 },
  },
];

// =============================================================================
// TYPOGRAPHY
// =============================================================================

const typographyVariables: Variable[] = [
  // Font sizes
  {
    id: 'font-size-xs',
    name: 'Extra Small',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 12, dark: 12 },
  },
  {
    id: 'font-size-sm',
    name: 'Small',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 14, dark: 14 },
  },
  {
    id: 'font-size-base',
    name: 'Base',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 16, dark: 16 },
  },
  {
    id: 'font-size-lg',
    name: 'Large',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 18, dark: 18 },
  },
  {
    id: 'font-size-xl',
    name: 'Extra Large',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 20, dark: 20 },
  },
  {
    id: 'font-size-2xl',
    name: '2X Large',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 24, dark: 24 },
  },
  {
    id: 'font-size-3xl',
    name: '3X Large',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 30, dark: 30 },
  },
  // Font weights
  {
    id: 'font-weight-normal',
    name: 'Normal',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 400, dark: 400 },
  },
  {
    id: 'font-weight-medium',
    name: 'Medium',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 500, dark: 500 },
  },
  {
    id: 'font-weight-semibold',
    name: 'Semibold',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 600, dark: 600 },
  },
  {
    id: 'font-weight-bold',
    name: 'Bold',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 700, dark: 700 },
  },
  // Line heights
  {
    id: 'line-height-tight',
    name: 'Tight',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 1.25, dark: 1.25 },
  },
  {
    id: 'line-height-normal',
    name: 'Normal',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 1.5, dark: 1.5 },
  },
  {
    id: 'line-height-relaxed',
    name: 'Relaxed',
    type: 'number',
    collectionId: 'primitives-typography',
    valuesByMode: { light: 1.75, dark: 1.75 },
  },
];

// =============================================================================
// COLLECTIONS
// =============================================================================

export const defaultCollections: VariableCollection[] = [
  {
    id: 'primitives-colors',
    name: 'Color Primitives',
    modes: [lightMode, darkMode],
    defaultModeId: 'light',
    variableIds: colorPrimitives.map((v) => v.id),
    isBuiltIn: true,
    description: 'Base color palette',
  },
  {
    id: 'semantic-colors',
    name: 'Semantic Colors',
    modes: [lightMode, darkMode],
    defaultModeId: 'light',
    variableIds: semanticColors.map((v) => v.id),
    isBuiltIn: true,
    description: 'Theme-aware color tokens',
  },
  {
    id: 'primitives-spacing',
    name: 'Spacing',
    modes: [lightMode],
    defaultModeId: 'light',
    variableIds: spacingVariables.map((v) => v.id),
    isBuiltIn: true,
    description: '4px base spacing scale',
  },
  {
    id: 'primitives-radii',
    name: 'Border Radius',
    modes: [lightMode],
    defaultModeId: 'light',
    variableIds: radiiVariables.map((v) => v.id),
    isBuiltIn: true,
    description: 'Corner radius tokens',
  },
  {
    id: 'primitives-typography',
    name: 'Typography',
    modes: [lightMode],
    defaultModeId: 'light',
    variableIds: typographyVariables.map((v) => v.id),
    isBuiltIn: true,
    description: 'Font size, weight, and line height tokens',
  },
];

// All default variables
export const defaultVariables: Variable[] = [
  ...colorPrimitives,
  ...semanticColors,
  ...spacingVariables,
  ...radiiVariables,
  ...typographyVariables,
];

// Variable lookup map
export const defaultVariablesMap = new Map<string, Variable>(
  defaultVariables.map((v) => [v.id, v])
);

// Collection lookup map
export const defaultCollectionsMap = new Map<string, VariableCollection>(
  defaultCollections.map((c) => [c.id, c])
);
