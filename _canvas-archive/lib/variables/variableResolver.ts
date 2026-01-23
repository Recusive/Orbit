/**
 * Variable Resolver
 *
 * Resolves variable references to their actual values,
 * handling aliases and mode switching.
 */

import { isVariableAlias } from './variableTypes';

import type {
  Variable,
  VariableValue,
  VariableCollection,
  ResolvedVariable,
  VariableMode,
} from './variableTypes';

/**
 * Maximum depth for resolving variable aliases to prevent infinite loops
 */
const MAX_RESOLVE_DEPTH = 10;

/**
 * Resolve a variable value, following aliases if necessary
 */
export function resolveVariableValue(
  value: VariableValue,
  modeId: string,
  variablesMap: Map<string, Variable>,
  depth = 0
): string | number | null {
  // Prevent infinite loops
  if (depth > MAX_RESOLVE_DEPTH) {
    console.warn('Variable resolution exceeded maximum depth');
    return null;
  }

  // If it's a direct value, return it
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  // It's an alias - resolve the referenced variable
  if (isVariableAlias(value)) {
    const referencedVar = variablesMap.get(value.variableId);
    if (!referencedVar) {
      console.warn(`Referenced variable not found: ${value.variableId}`);
      return null;
    }

    // Get the value for the current mode, or fall back to any available mode
    let modeValue = referencedVar.valuesByMode[modeId];
    if (modeValue === undefined) {
      const availableModes = Object.keys(referencedVar.valuesByMode);
      if (availableModes.length > 0 && availableModes[0]) {
        modeValue = referencedVar.valuesByMode[availableModes[0]];
      }
    }

    if (modeValue === undefined) {
      return null;
    }

    // Recursively resolve if it's another alias
    return resolveVariableValue(modeValue, modeId, variablesMap, depth + 1);
  }

  return null;
}

/**
 * Resolve a variable to its final value for a given mode
 */
export function resolveVariable(
  variable: Variable,
  modeId: string,
  variablesMap: Map<string, Variable>,
  modesMap?: Map<string, VariableMode>
): ResolvedVariable | null {
  const modeValue = variable.valuesByMode[modeId];
  if (modeValue === undefined) {
    return null;
  }

  const resolvedValue = resolveVariableValue(modeValue, modeId, variablesMap);
  if (resolvedValue === null) {
    return null;
  }

  const mode: VariableMode = modesMap?.get(modeId) ?? { id: modeId, name: modeId };

  return {
    variable,
    value: resolvedValue,
    mode,
  };
}

/**
 * Get all resolved variables for a collection in a specific mode
 */
export function resolveCollection(
  collection: VariableCollection,
  modeId: string,
  variablesMap: Map<string, Variable>
): ResolvedVariable[] {
  const results: ResolvedVariable[] = [];
  const mode = collection.modes.find((m) => m.id === modeId) ?? collection.modes[0];

  if (!mode) {
    return results;
  }

  for (const variableId of collection.variableIds) {
    const variable = variablesMap.get(variableId);
    if (!variable) continue;

    const resolved = resolveVariable(variable, mode.id, variablesMap);
    if (resolved) {
      results.push(resolved);
    }
  }

  return results;
}

/**
 * Get a color value from a variable, returning the hex string
 */
export function resolveColorVariable(
  variableId: string,
  modeId: string,
  variablesMap: Map<string, Variable>
): string | null {
  const variable = variablesMap.get(variableId);
  if (variable?.type !== 'color') {
    return null;
  }

  const resolved = resolveVariable(variable, modeId, variablesMap);
  if (!resolved || typeof resolved.value !== 'string') {
    return null;
  }

  return resolved.value;
}

/**
 * Get a number value from a variable
 */
export function resolveNumberVariable(
  variableId: string,
  modeId: string,
  variablesMap: Map<string, Variable>
): number | null {
  const variable = variablesMap.get(variableId);
  if (variable?.type !== 'number') {
    return null;
  }

  const resolved = resolveVariable(variable, modeId, variablesMap);
  if (!resolved || typeof resolved.value !== 'number') {
    return null;
  }

  return resolved.value;
}

/**
 * Check if a variable can be used for a specific property type
 */
export function isVariableCompatible(
  variable: Variable,
  propertyType: 'color' | 'number' | 'string'
): boolean {
  return variable.type === propertyType;
}

/**
 * Filter variables by type
 */
export function filterVariablesByType(
  variables: Variable[],
  type: 'color' | 'number' | 'string'
): Variable[] {
  return variables.filter((v) => v.type === type);
}

/**
 * Search variables by name
 */
export function searchVariables(variables: Variable[], query: string): Variable[] {
  const lowerQuery = query.toLowerCase();
  return variables.filter(
    (v) =>
      v.name.toLowerCase().includes(lowerQuery) ||
      v.id.toLowerCase().includes(lowerQuery) ||
      v.description?.toLowerCase().includes(lowerQuery)
  );
}
