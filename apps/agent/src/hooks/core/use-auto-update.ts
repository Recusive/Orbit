/**
 * Auto-update hook — checks for updates on mount and at a regular interval.
 *
 * - Production only: the Tauri updater plugin requires signed release builds.
 *   In dev mode, check() always fails (no signed release, placeholder pubkey).
 * - Delays the first check by 5 seconds to avoid slowing app startup.
 * - Re-checks every 4 hours while the app is running.
 * - In dev mode, Cmd+Shift+U triggers a simulated update via Sonner toasts.
 *
 * Mount once in App.tsx inside TauriProvider.
 */

import { useEffect } from 'react';

import type { UpdateSimulationConfig } from '@/stress-tests/update-simulation';

import { useUpdateStore } from '@/stores/ui/update-store';

/** Delay before the first update check (ms). */
const INITIAL_DELAY_MS = 5_000;

/** Interval between subsequent checks (ms). 4 hours. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

export function useAutoUpdate(): void {
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate);

  // Production: auto-check for real updates
  useEffect(() => {
    // Skip in dev — check() always fails without a signed release
    if (import.meta.env.DEV) return;

    const initialTimer = setTimeout(() => {
      void checkForUpdate();
    }, INITIAL_DELAY_MS);

    const intervalTimer = setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);

    return (): void => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [checkForUpdate]);

  // Dev-only: Cmd+Shift+U triggers the update simulation + expose on __orbit_debug
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.shiftKey && e.key === 'u') {
        e.preventDefault();
        void (async (): Promise<void> => {
          const { simulateUpdate } = await import('@/stress-tests/update-simulation');
          await simulateUpdate();
        })();
      }
    };

    // Expose update simulation on __orbit_debug (creates object if chat hasn't mounted yet)
    const existing = window.__orbit_debug ?? {};
    window.__orbit_debug = {
      ...existing,
      simulateUpdate: async (config?: UpdateSimulationConfig) => {
        const { simulateUpdate } = await import('@/stress-tests/update-simulation');
        return simulateUpdate(config);
      },
      simulateUpdateQuickCycle: async () => {
        const { simulateUpdateQuickCycle } = await import('@/stress-tests/update-simulation');
        return simulateUpdateQuickCycle();
      },
    };

    window.addEventListener('keydown', handler);
    return (): void => {
      window.removeEventListener('keydown', handler);
    };
  }, []);
}
