/**
 * Hook to check for crashes from previous sessions.
 *
 * This hook checks if the previous session crashed on mount and provides
 * state for displaying crash notifications.
 */

import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useState } from 'react';

import { checkPreviousCrash, clearCrashLog, isTauri } from '@/lib/api';

const logger = createLogger('CrashCheck');

export interface UseCrashCheckReturn {
  /** Whether there is a pending crash to report */
  hasCrash: boolean;
  /** The crash log contents, if any */
  crashLog: string | null;
  /** Whether the crash check is in progress */
  isChecking: boolean;
  /** Dismiss the crash notification (clears the log) */
  dismiss: () => void;
  /** Acknowledge the crash without clearing (just close the dialog) */
  acknowledge: () => void;
}

/**
 * Hook to check for and manage crash notifications from previous sessions.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { hasCrash, crashLog, dismiss } = useCrashCheck();
 *
 *   return (
 *     <CrashNotification
 *       open={hasCrash}
 *       crashLog={crashLog ?? ''}
 *       onDismiss={dismiss}
 *     />
 *   );
 * }
 * ```
 */
export function useCrashCheck(): UseCrashCheckReturn {
  const [crashLog, setCrashLog] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check for crashes on mount
  useEffect(() => {
    async function check(): Promise<void> {
      // Skip in browser-only mode
      if (!isTauri()) {
        setIsChecking(false);
        return;
      }

      try {
        const log = await checkPreviousCrash();
        if (log) {
          setCrashLog(log);
          logger.warn('Previous session crashed. See crash notification.');
        }
      } catch (err: unknown) {
        // Silently ignore errors - crash checking is non-critical
        logger.error(
          'Failed to check for crashes',
          err instanceof Error ? err : new Error(String(err))
        );
      } finally {
        setIsChecking(false);
      }
    }

    void check();
  }, []);

  // Dismiss and clear the crash log
  const dismiss = useCallback((): void => {
    setIsDismissed(true);
    setCrashLog(null);

    // Also try to clear the log file (fire and forget)
    clearCrashLog().catch((err: unknown) => {
      logger.error(
        'Failed to clear crash log',
        err instanceof Error ? err : new Error(String(err))
      );
    });
  }, []);

  // Just acknowledge (close dialog) without clearing the log
  const acknowledge = useCallback((): void => {
    setIsDismissed(true);
  }, []);

  return {
    hasCrash: !isChecking && !isDismissed && crashLog !== null,
    crashLog,
    isChecking,
    dismiss,
    acknowledge,
  };
}
