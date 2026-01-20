/**
 * Canvas setup hook
 *
 * Checks if the Canvas environment is properly configured by invoking
 * the `canvas_check_setup` Tauri command.
 *
 * ⚠️  TESTED: This hook is covered by integration tests.
 *     If you modify this, run: bun run canvas:test
 *     Test file: src/__tests__/placeholder.test.ts
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

/** Response from the canvas_check_setup Tauri command */
interface SetupStatus {
  initialized: boolean;
  orbitPath: string;
  componentCount: number;
  previewReady: boolean;
}

/** Possible states for the canvas setup */
export type CanvasSetupState = 'checking' | 'needs-setup' | 'ready' | 'error';

/** Return value from useCanvasSetup hook */
export interface UseCanvasSetupResult {
  /** Current setup state */
  state: CanvasSetupState;
  /** Path to ~/.orbit/canvas */
  orbitPath: string | null;
  /** Number of installed components */
  componentCount: number;
  /** Whether the preview environment is ready */
  previewReady: boolean;
  /** Error message if state is 'error' */
  error: string | null;
  /** Re-check setup status */
  recheckSetup: () => Promise<void>;
}

/**
 * Hook to check Canvas setup status
 *
 * @returns Current setup state and recheck function
 *
 * @example
 * ```tsx
 * const { state, componentCount, recheckSetup, error } = useCanvasSetup();
 *
 * if (state === 'checking') return <Spinner />;
 * if (state === 'needs-setup') return <SetupWizard onComplete={recheckSetup} />;
 * if (state === 'error') return <ErrorMessage error={error} />;
 * return <CanvasApp componentCount={componentCount} />;
 * ```
 */
export function useCanvasSetup(): UseCanvasSetupResult {
  const [state, setState] = useState<CanvasSetupState>('checking');
  const [orbitPath, setOrbitPath] = useState<string | null>(null);
  const [componentCount, setComponentCount] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSetup = useCallback(async (): Promise<void> => {
    setState('checking');
    setError(null);

    try {
      const status = await invoke<SetupStatus>('canvas_check_setup');
      setOrbitPath(status.orbitPath);
      setComponentCount(status.componentCount);
      setPreviewReady(status.previewReady);

      if (status.initialized && status.componentCount > 0 && status.previewReady) {
        setState('ready');
      } else {
        setState('needs-setup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  return {
    state,
    orbitPath,
    componentCount,
    previewReady,
    error,
    recheckSetup: checkSetup,
  };
}
