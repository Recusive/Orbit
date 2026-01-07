/**
 * Variable Types
 *
 * Type definitions for the design variables/tokens system.
 * Supports color, number, and string variables with multiple modes.
 */

/**
 * Variable value types
 */
export type VariableType = 'color' | 'number' | 'string';

/**
 * A mode represents a variant of variable values (e.g., Light/Dark theme)
 */
export interface VariableMode {
  id: string;
  name: string;
}

/**
 * Variable value - can be a raw value or reference to another variable
 */
export type VariableValue = string | number | { variableId: string };

/**
 * A single variable definition
 */
export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  /** Collection this variable belongs to */
  collectionId: string;
  /** Description for documentation */
  description?: string;
  /** Values per mode */
  valuesByMode: Record<string, VariableValue>;
  /** Code syntax (for developers) */
  codeSyntax?: {
    web?: string;
    ios?: string;
    android?: string;
  };
}

/**
 * A collection of related variables
 */
export interface VariableCollection {
  id: string;
  name: string;
  /** Available modes for this collection */
  modes: VariableMode[];
  /** Default mode ID */
  defaultModeId: string;
  /** Variables in this collection */
  variableIds: string[];
  /** Whether this is a built-in collection */
  isBuiltIn?: boolean;
  /** Description */
  description?: string;
}

/**
 * Reference to a variable (used in properties)
 */
export interface VariableBinding {
  variableId: string;
  /** Optional field path for complex values */
  field?: string;
}

/**
 * A property value that can be either a raw value or a variable binding
 */
export type BoundValue<T> = T | VariableBinding;

/**
 * Check if a value is a variable binding
 */
export function isVariableBinding(value: unknown): value is VariableBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'variableId' in value &&
    typeof (value as VariableBinding).variableId === 'string'
  );
}

/**
 * Variable alias - a variable that references another variable
 */
export interface VariableAlias {
  type: 'alias';
  variableId: string;
}

/**
 * Check if a variable value is an alias
 */
export function isVariableAlias(value: VariableValue): value is VariableAlias {
  return typeof value === 'object' && 'variableId' in value;
}

/**
 * Resolved variable value (after resolving aliases)
 */
export interface ResolvedVariable {
  variable: Variable;
  value: string | number;
  mode: VariableMode;
}

/**
 * Variable scopes - where a variable can be applied
 */
export type VariableScope =
  | 'all'
  | 'fill-color'
  | 'stroke-color'
  | 'text-color'
  | 'effect-color'
  | 'corner-radius'
  | 'gap'
  | 'padding'
  | 'width-height'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'letter-spacing'
  | 'opacity'
  | 'stroke-width';

/**
 * Variable with resolved scope information
 */
export interface ScopedVariable extends Variable {
  scopes: VariableScope[];
}
