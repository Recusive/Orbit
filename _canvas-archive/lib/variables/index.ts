/**
 * Variables Module
 *
 * Design variables/tokens system for Orbit Canvas.
 */

// Types
export type {
  Variable,
  VariableCollection,
  VariableMode,
  VariableValue,
  VariableType,
  VariableBinding,
  BoundValue,
  VariableAlias,
  ResolvedVariable,
  VariableScope,
  ScopedVariable,
} from './variableTypes';

export { isVariableBinding, isVariableAlias } from './variableTypes';

// Default collections
export {
  defaultCollections,
  defaultVariables,
  defaultVariablesMap,
  defaultCollectionsMap,
  lightMode,
  darkMode,
} from './defaultCollections';

// Resolver
export {
  resolveVariableValue,
  resolveVariable,
  resolveCollection,
  resolveColorVariable,
  resolveNumberVariable,
  isVariableCompatible,
  filterVariablesByType,
  searchVariables,
} from './variableResolver';

// Store
export {
  useVariableStore,
  selectVariable,
  selectCollection,
  selectActiveMode,
  selectAllCollections,
  selectColorVariables,
  selectNumberVariables,
} from './variableStore';

export type { VariableStore, VariableStoreState, VariableStoreActions } from './variableStore';
