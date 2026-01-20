/**
 * Semantic Colors Hook
 *
 * Provides detection of semantic color usage in components.
 * Loads component classes on mount and provides on-demand semantic checking.
 *
 * @module
 */

import {
  detectSemanticColorUsage,
  extractClassesFromComponent,
  isColorProperty,
} from '@canvas/lib/semantic-colors';
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SemanticColorUsage } from '@canvas/lib/semantic-colors';

// ============================================
// Logger
// ============================================

const logger = createLogger('useSemanticColors');

// ============================================
// Types
// ============================================

/**
 * Options for the semantic colors hook
 */
export interface UseSemanticColorsOptions {
  /** Name of the component to analyze */
  componentName: string | null;
  /** Type of component - 'ui' for shadcn, 'custom' for user-created */
  componentType: 'ui' | 'custom';
  /** Whether the hook is enabled */
  enabled?: boolean;
}

/**
 * Return type for the semantic colors hook
 */
export interface UseSemanticColorsReturn {
  /** Current Tailwind classes found in the component */
  currentClasses: readonly string[];
  /**
   * Check if changing a color property would affect a semantic token.
   * Returns null if no semantic token is being used.
   */
  checkSemanticUsage: (
    property: 'color' | 'backgroundColor' | 'borderColor'
  ) => SemanticColorUsage | null;
  /**
   * Check any CSS property - returns null for non-color properties
   */
  checkProperty: (property: string) => SemanticColorUsage | null;
  /** Whether classes are currently being loaded */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Refresh the class list from component source */
  refresh: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for detecting semantic color usage in components
 *
 * @param options - Configuration options
 * @returns Object with class list, detection function, and loading state
 *
 * @example
 * ```tsx
 * const { currentClasses, checkSemanticUsage, loading } = useSemanticColors({
 *   componentName: 'button',
 *   componentType: 'ui',
 * });
 *
 * // Before applying a color change
 * const usage = checkSemanticUsage('backgroundColor');
 * if (usage) {
 *   // Show dialog: "This component uses semantic token 'primary'"
 *   console.log(`Uses ${usage.semanticToken} via class ${usage.className}`);
 * }
 * ```
 */
export function useSemanticColors(options: UseSemanticColorsOptions): UseSemanticColorsReturn {
  const { componentName, componentType, enabled = true } = options;

  // State
  const [currentClasses, setCurrentClasses] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for tracking component changes
  const lastComponentRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Load classes from component source
   */
  const loadClasses = useCallback(async (): Promise<void> => {
    if (!componentName || !enabled) {
      setCurrentClasses([]);
      setError(null);
      return;
    }

    // Skip if same component
    if (lastComponentRef.current === componentName && currentClasses.length > 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      logger.debug('Loading classes for component', { componentName, componentType });
      const classes = await extractClassesFromComponent(componentName, componentType);

      if (isMountedRef.current) {
        setCurrentClasses(classes);
        lastComponentRef.current = componentName;
        logger.debug('Loaded classes', { count: classes.length, componentName });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load component classes';
      if (isMountedRef.current) {
        setError(message);
        setCurrentClasses([]);
        logger.error('Failed to load classes', new Error(message));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [componentName, componentType, enabled, currentClasses.length]);

  // Load classes when component changes
  useEffect(() => {
    if (componentName !== lastComponentRef.current) {
      void loadClasses();
    }
  }, [componentName, loadClasses]);

  /**
   * Check if a color property change would affect a semantic token
   */
  const checkSemanticUsage = useCallback(
    (property: 'color' | 'backgroundColor' | 'borderColor'): SemanticColorUsage | null => {
      if (currentClasses.length === 0) {
        return null;
      }

      return detectSemanticColorUsage(currentClasses, property);
    },
    [currentClasses]
  );

  /**
   * Check any property - filters to only color properties
   */
  const checkProperty = useCallback(
    (property: string): SemanticColorUsage | null => {
      if (!isColorProperty(property)) {
        return null;
      }
      return checkSemanticUsage(property);
    },
    [checkSemanticUsage]
  );

  /**
   * Refresh the class list
   */
  const refresh = useCallback(async (): Promise<void> => {
    lastComponentRef.current = null; // Force reload
    await loadClasses();
  }, [loadClasses]);

  return {
    currentClasses,
    checkSemanticUsage,
    checkProperty,
    loading,
    error,
    refresh,
  };
}
