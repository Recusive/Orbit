import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Diagnostic } from '@/lib/api';

import { onDiagnostics } from '@/lib/api';

const logger = createLogger('Diagnostics');

type DiagnosticsState = Record<string, Diagnostic[]>;

interface UseDiagnosticsResult {
  /** All diagnostics by file path */
  diagnostics: DiagnosticsState;
  /** Get diagnostics for a specific file */
  getDiagnostics: (path: string) => Diagnostic[];
  /** Get error count for a file */
  getErrorCount: (path: string) => number;
  /** Get warning count for a file */
  getWarningCount: (path: string) => number;
  /** Get total issues across all files */
  totalIssues: number;
  /** Get total errors across all files */
  totalErrors: number;
  /** Get total warnings across all files */
  totalWarnings: number;
  /** Clear diagnostics for a file */
  clear: (path: string) => void;
  /** Clear all diagnostics */
  clearAll: () => void;
}

/**
 * Hook to subscribe to all LSP diagnostics events.
 *
 * Provides a centralized store for diagnostics across all files.
 *
 * @example
 * ```tsx
 * function ProblemsPanel() {
 *   const { diagnostics, totalErrors, totalWarnings } = useDiagnostics();
 *
 *   return (
 *     <div>
 *       <h2>Problems ({totalErrors} errors, {totalWarnings} warnings)</h2>
 *       {Object.entries(diagnostics).map(([path, diags]) => (
 *         <FileProblems key={path} path={path} diagnostics={diags} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({});
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Subscribe to diagnostics events
    onDiagnostics((event) => {
      setDiagnostics((prev) => ({
        ...prev,
        [event.path]: event.diagnostics,
      }));
    })
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      })
      .catch((err: unknown) => {
        logger.error(
          'Failed to subscribe to diagnostics',
          err instanceof Error ? err : new Error(String(err))
        );
      });

    return (): void => {
      unlistenRef.current?.();
    };
  }, []);

  const getDiagnostics = useCallback(
    (path: string): Diagnostic[] => {
      return diagnostics[path] ?? [];
    },
    [diagnostics]
  );

  const countBySeverity = useCallback(
    (path: string, severity: Diagnostic['severity']): number => {
      return getDiagnostics(path).filter((d) => d.severity === severity).length;
    },
    [getDiagnostics]
  );

  const getErrorCount = useCallback(
    (path: string): number => countBySeverity(path, 'error'),
    [countBySeverity]
  );

  const getWarningCount = useCallback(
    (path: string): number => countBySeverity(path, 'warning'),
    [countBySeverity]
  );

  // Calculate totals
  const allDiagnostics = Object.values(diagnostics).flat();
  const totalIssues = allDiagnostics.length;
  const totalErrors = allDiagnostics.filter((d) => d.severity === 'error').length;
  const totalWarnings = allDiagnostics.filter((d) => d.severity === 'warning').length;

  const clear = useCallback((path: string): void => {
    setDiagnostics((prev) => {
      const { [path]: _removed, ...rest } = prev;
      void _removed; // Explicitly mark as intentionally unused
      return rest;
    });
  }, []);

  const clearAll = useCallback((): void => {
    setDiagnostics({});
  }, []);

  return {
    diagnostics,
    getDiagnostics,
    getErrorCount,
    getWarningCount,
    totalIssues,
    totalErrors,
    totalWarnings,
    clear,
    clearAll,
  };
}
