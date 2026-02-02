import { createLogger } from '@orbit/common/lib';
import { useEffect, useRef, useState } from 'react';

import type { Diagnostic } from '@/lib/api';

import { onFileDiagnostics } from '@/lib/api';

const logger = createLogger('useFileDiagnostics');

interface UseFileDiagnosticsResult {
  /** Diagnostics for this file */
  diagnostics: Diagnostic[];
  /** Errors only */
  errors: Diagnostic[];
  /** Warnings only */
  warnings: Diagnostic[];
  /** Info only */
  infos: Diagnostic[];
  /** Hints only */
  hints: Diagnostic[];
  /** Has any errors */
  hasErrors: boolean;
  /** Has any warnings */
  hasWarnings: boolean;
  /** Total count */
  count: number;
}

/**
 * Hook to subscribe to diagnostics for a specific file.
 *
 * Automatically filters diagnostics events for the given file path.
 *
 * @param filePath - Absolute path to the file, or null to disable
 *
 * @example
 * ```tsx
 * function EditorStatusBar({ filePath }) {
 *   const { errors, warnings, hasErrors } = useFileDiagnostics(filePath);
 *
 *   return (
 *     <div className={hasErrors ? 'text-red-500' : ''}>
 *       {errors.length} errors, {warnings.length} warnings
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileDiagnostics(filePath: string | null): UseFileDiagnosticsResult {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!filePath) {
      setDiagnostics([]);
      return;
    }

    onFileDiagnostics(filePath, (diags) => {
      setDiagnostics(diags);
    })
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      })
      .catch((err: unknown) => {
        logger.error('Failed to subscribe', err);
      });

    return (): void => {
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [filePath]);

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const infos = diagnostics.filter((d) => d.severity === 'info');
  const hints = diagnostics.filter((d) => d.severity === 'hint');

  return {
    diagnostics,
    errors,
    warnings,
    infos,
    hints,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    count: diagnostics.length,
  };
}
