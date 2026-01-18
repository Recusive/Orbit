/**
 * Variable Store
 *
 * Zustand store for managing design variables.
 * Handles variable collections, modes, and CRUD operations.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { defaultVariables, defaultCollections } from './defaultCollections';
import { resolveColorVariable, resolveNumberVariable } from './variableResolver';

import type { Variable, VariableCollection, VariableMode, VariableValue } from './variableTypes';

// =============================================================================
// STORE STATE
// =============================================================================

export interface VariableStoreState {
  /** All variables by ID */
  variables: Map<string, Variable>;
  /** All collections by ID */
  collections: Map<string, VariableCollection>;
  /** Current active mode ID per collection */
  activeModes: Map<string, string>;
  /** Global default mode (used when collection doesn't have specific mode) */
  globalMode: string;
}

export interface VariableStoreActions {
  // Variable operations
  addVariable: (variable: Variable) => void;
  updateVariable: (id: string, updates: Partial<Variable>) => void;
  deleteVariable: (id: string) => void;
  setVariableValue: (id: string, modeId: string, value: VariableValue) => void;

  // Collection operations
  addCollection: (collection: VariableCollection) => void;
  updateCollection: (id: string, updates: Partial<VariableCollection>) => void;
  deleteCollection: (id: string) => void;

  // Mode operations
  addMode: (collectionId: string, mode: VariableMode) => void;
  removeMode: (collectionId: string, modeId: string) => void;
  setActiveMode: (collectionId: string, modeId: string) => void;
  setGlobalMode: (modeId: string) => void;

  // Resolution helpers
  resolveColor: (variableId: string, collectionId?: string) => string | null;
  resolveNumber: (variableId: string, collectionId?: string) => number | null;
  getVariablesByCollection: (collectionId: string) => Variable[];
  getVariablesByType: (type: 'color' | 'number' | 'string') => Variable[];

  // Reset to defaults
  resetToDefaults: () => void;
}

export type VariableStore = VariableStoreState & VariableStoreActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

function createInitialState(): VariableStoreState {
  const variables = new Map<string, Variable>();
  const collections = new Map<string, VariableCollection>();
  const activeModes = new Map<string, string>();

  // Load default variables
  for (const variable of defaultVariables) {
    variables.set(variable.id, variable);
  }

  // Load default collections
  for (const collection of defaultCollections) {
    collections.set(collection.id, collection);
    activeModes.set(collection.id, collection.defaultModeId);
  }

  return {
    variables,
    collections,
    activeModes,
    globalMode: 'light',
  };
}

// =============================================================================
// STORE
// =============================================================================

export const useVariableStore = create<VariableStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    // Variable operations
    addVariable: (variable) => {
      set((state) => {
        const newVariables = new Map(state.variables);
        newVariables.set(variable.id, variable);

        // Add to collection if specified
        const collection = state.collections.get(variable.collectionId);
        if (collection && !collection.variableIds.includes(variable.id)) {
          const newCollections = new Map(state.collections);
          newCollections.set(variable.collectionId, {
            ...collection,
            variableIds: [...collection.variableIds, variable.id],
          });
          return { variables: newVariables, collections: newCollections };
        }

        return { variables: newVariables };
      });
    },

    updateVariable: (id, updates) => {
      set((state) => {
        const variable = state.variables.get(id);
        if (!variable) return state;

        const newVariables = new Map(state.variables);
        newVariables.set(id, { ...variable, ...updates });
        return { variables: newVariables };
      });
    },

    deleteVariable: (id) => {
      set((state) => {
        const variable = state.variables.get(id);
        if (!variable) return state;

        const newVariables = new Map(state.variables);
        newVariables.delete(id);

        // Remove from collection
        const collection = state.collections.get(variable.collectionId);
        if (collection) {
          const newCollections = new Map(state.collections);
          newCollections.set(variable.collectionId, {
            ...collection,
            variableIds: collection.variableIds.filter((vid) => vid !== id),
          });
          return { variables: newVariables, collections: newCollections };
        }

        return { variables: newVariables };
      });
    },

    setVariableValue: (id, modeId, value) => {
      set((state) => {
        const variable = state.variables.get(id);
        if (!variable) return state;

        const newVariables = new Map(state.variables);
        newVariables.set(id, {
          ...variable,
          valuesByMode: {
            ...variable.valuesByMode,
            [modeId]: value,
          },
        });
        return { variables: newVariables };
      });
    },

    // Collection operations
    addCollection: (collection) => {
      set((state) => {
        const newCollections = new Map(state.collections);
        newCollections.set(collection.id, collection);

        const newActiveModes = new Map(state.activeModes);
        newActiveModes.set(collection.id, collection.defaultModeId);

        return { collections: newCollections, activeModes: newActiveModes };
      });
    },

    updateCollection: (id, updates) => {
      set((state) => {
        const collection = state.collections.get(id);
        if (!collection) return state;

        const newCollections = new Map(state.collections);
        newCollections.set(id, { ...collection, ...updates });
        return { collections: newCollections };
      });
    },

    deleteCollection: (id) => {
      set((state) => {
        const collection = state.collections.get(id);
        if (!collection || collection.isBuiltIn) return state;

        const newCollections = new Map(state.collections);
        newCollections.delete(id);

        // Delete all variables in collection
        const newVariables = new Map(state.variables);
        for (const variableId of collection.variableIds) {
          newVariables.delete(variableId);
        }

        const newActiveModes = new Map(state.activeModes);
        newActiveModes.delete(id);

        return {
          collections: newCollections,
          variables: newVariables,
          activeModes: newActiveModes,
        };
      });
    },

    // Mode operations
    addMode: (collectionId, mode) => {
      set((state) => {
        const collection = state.collections.get(collectionId);
        if (!collection) return state;

        const newCollections = new Map(state.collections);
        newCollections.set(collectionId, {
          ...collection,
          modes: [...collection.modes, mode],
        });
        return { collections: newCollections };
      });
    },

    removeMode: (collectionId, modeId) => {
      set((state) => {
        const collection = state.collections.get(collectionId);
        if (!collection || collection.modes.length <= 1) return state;

        const newCollections = new Map(state.collections);
        const newModes = collection.modes.filter((m) => m.id !== modeId);
        const firstMode = newModes[0];

        newCollections.set(collectionId, {
          ...collection,
          modes: newModes,
          defaultModeId:
            collection.defaultModeId === modeId && firstMode
              ? firstMode.id
              : collection.defaultModeId,
        });

        // Update active mode if necessary
        const newActiveModes = new Map(state.activeModes);
        if (state.activeModes.get(collectionId) === modeId && firstMode) {
          newActiveModes.set(collectionId, firstMode.id);
        }

        return { collections: newCollections, activeModes: newActiveModes };
      });
    },

    setActiveMode: (collectionId, modeId) => {
      set((state) => {
        const newActiveModes = new Map(state.activeModes);
        newActiveModes.set(collectionId, modeId);
        return { activeModes: newActiveModes };
      });
    },

    setGlobalMode: (modeId) => {
      set({ globalMode: modeId });
    },

    // Resolution helpers
    resolveColor: (variableId, collectionId) => {
      const state = get();
      const variable = state.variables.get(variableId);
      if (!variable) return null;

      const cId = collectionId ?? variable.collectionId;
      const modeId = state.activeModes.get(cId) ?? state.globalMode;

      return resolveColorVariable(variableId, modeId, state.variables);
    },

    resolveNumber: (variableId, collectionId) => {
      const state = get();
      const variable = state.variables.get(variableId);
      if (!variable) return null;

      const cId = collectionId ?? variable.collectionId;
      const modeId = state.activeModes.get(cId) ?? state.globalMode;

      return resolveNumberVariable(variableId, modeId, state.variables);
    },

    getVariablesByCollection: (collectionId) => {
      const state = get();
      const collection = state.collections.get(collectionId);
      if (!collection) return [];

      return collection.variableIds
        .map((id) => state.variables.get(id))
        .filter((v): v is Variable => v !== undefined);
    },

    getVariablesByType: (type) => {
      const state = get();
      return Array.from(state.variables.values()).filter((v) => v.type === type);
    },

    // Reset
    resetToDefaults: () => {
      set(createInitialState());
    },
  }))
);

// =============================================================================
// SELECTORS
// =============================================================================

export const selectVariable = (state: VariableStore, id: string): Variable | undefined =>
  state.variables.get(id);

export const selectCollection = (
  state: VariableStore,
  id: string
): VariableCollection | undefined => state.collections.get(id);

export const selectActiveMode = (state: VariableStore, collectionId: string): string =>
  state.activeModes.get(collectionId) ?? state.globalMode;

export const selectAllCollections = (state: VariableStore): VariableCollection[] =>
  Array.from(state.collections.values());

export const selectColorVariables = (state: VariableStore): Variable[] =>
  Array.from(state.variables.values()).filter((v) => v.type === 'color');

export const selectNumberVariables = (state: VariableStore): Variable[] =>
  Array.from(state.variables.values()).filter((v) => v.type === 'number');
