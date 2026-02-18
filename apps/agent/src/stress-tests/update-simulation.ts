/**
 * Update simulation — drives the update store through every state with rich card toasts.
 *
 * Usage (DevTools console):
 *   window.__orbit_debug.simulateUpdate()
 *   window.__orbit_debug.simulateUpdate({ downloadDurationMs: 5000 })
 *   window.__orbit_debug.simulateUpdate({ showError: true })
 *
 * Keyboard shortcut (dev only): Cmd+Shift+U
 *
 * The simulation walks through:
 *   idle → checking (1s) → available toast (waits 3s) → downloading toast (progress 0→100) → ready toast
 *
 * With showError: true:
 *   idle → checking (1s) → error toast (with retry)
 */

import {
  dismissUpdateToast,
  showUpdateAvailable,
  showUpdateDownloading,
  showUpdateError,
  showUpdateReady,
} from '@/components/ui/update-toast';
import { useUpdateStore } from '@/stores/ui/update-store';

export interface UpdateSimulationConfig {
  /** Simulated version string. Default: "0.0.2" */
  version?: string;
  /** How long the "checking" state lasts (ms). Default: 1000 */
  checkDurationMs?: number;
  /** Total download duration (ms). Default: 3000 */
  downloadDurationMs?: number;
  /** If true, simulate a check failure instead of a successful update. */
  showError?: boolean;
}

const DEFAULT_CONFIG: Required<UpdateSimulationConfig> = {
  version: '0.0.2',
  checkDurationMs: 1000,
  downloadDurationMs: 3000,
  showError: false,
};

/** Promise-based delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Run the full update simulation with rich card toasts.
 */
export async function simulateUpdate(userConfig?: UpdateSimulationConfig): Promise<void> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const store = useUpdateStore;

  // eslint-disable-next-line no-console
  console.log(
    '%c[UpdateSim] Starting update simulation',
    'color: #f97316; font-weight: bold',
    config
  );

  // ── Step 1: Reset ──
  store.getState().reset();
  await delay(300);

  // ── Step 2: Checking ──
  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] → checking', 'color: #f97316');
  store.setState({ status: 'checking', error: null });

  await delay(config.checkDurationMs);

  // ── Step 3: Error path ──
  if (config.showError) {
    // eslint-disable-next-line no-console
    console.log('%c[UpdateSim] → error', 'color: #ef4444');
    store.setState({
      status: 'error',
      error: 'Simulated: could not reach update server (ECONNREFUSED)',
    });
    showUpdateError(
      'Simulated: could not reach update server (ECONNREFUSED)',
      () => void simulateUpdate({ ...userConfig, showError: false })
    );
    return;
  }

  // ── Step 4: Available — show card toast with action buttons ──
  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] → available (v%s)', 'color: #f97316', config.version);
  store.setState({
    status: 'available',
    availableVersion: config.version,
    releaseNotes: null,
  });

  showUpdateAvailable(
    config.version,
    () => {
      // User clicked Update now
      store.setState({ status: 'downloading', downloadProgress: 0 });
    },
    () => {
      // User clicked Later — keep status available, mark toast dismissed for sidebar
      store.setState({ toastDismissed: true });
    }
  );

  // Wait for user to click "Update now" or "Later"
  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] Waiting for user action...', 'color: #f97316');
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    await delay(200);
    const state = store.getState();
    if (state.status === 'downloading') break;
    if (state.status !== 'available' || state.toastDismissed) {
      // eslint-disable-next-line no-console
      console.log(
        '%c[UpdateSim] User dismissed (status: %s), ending simulation',
        'color: #f97316',
        state.status
      );
      return;
    }
  }

  // ── Step 5: Downloading — animate progress in card toast ──
  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] → downloading', 'color: #f97316');
  store.setState({ status: 'downloading', downloadProgress: 0 });

  showUpdateDownloading(0);

  const steps = 20;
  const stepDelay = config.downloadDurationMs / steps;

  for (let i = 1; i <= steps; i++) {
    await delay(stepDelay);
    const progress = Math.round((i / steps) * 100);
    store.setState({ downloadProgress: progress });
    showUpdateDownloading(progress);
  }

  // ── Step 6: Ready — show restart card toast ──
  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] → ready (restart to apply)', 'color: #22c55e; font-weight: bold');
  store.setState({ status: 'ready', downloadProgress: 100 });

  showUpdateReady(() => {
    // eslint-disable-next-line no-console
    console.log('%c[UpdateSim] Restart clicked (no-op in simulation)', 'color: #22c55e');
    dismissUpdateToast();
    store.getState().reset();
  });
}

/**
 * Quick cycle: show each toast state for 2 seconds.
 */
export async function simulateUpdateQuickCycle(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    '%c[UpdateSim] Quick cycle — showing every toast state for 2s each',
    'color: #f97316; font-weight: bold'
  );

  // 1. Available
  showUpdateAvailable(
    '0.0.2',
    () => {
      /* no-op for visual demo */
    },
    () => {
      /* no-op for visual demo */
    }
  );
  await delay(2000);

  // 2. Downloading 0%
  showUpdateDownloading(0);
  await delay(1000);

  // 3. Downloading 50%
  showUpdateDownloading(50);
  await delay(1000);

  // 4. Downloading 100%
  showUpdateDownloading(100);
  await delay(1000);

  // 5. Ready
  showUpdateReady(() => {
    /* no-op for visual demo */
  });
  await delay(2000);

  // 6. Error
  showUpdateError('Network timeout: update server unreachable', () => {
    /* no-op for visual demo */
  });
  await delay(2000);

  // Cleanup
  dismissUpdateToast();

  // eslint-disable-next-line no-console
  console.log('%c[UpdateSim] Quick cycle complete', 'color: #22c55e; font-weight: bold');
}
