/**
 * Update store — manages auto-update lifecycle via rich card toasts.
 *
 * State machine: idle → checking → available → downloading → ready
 * Any state can transition to error.
 *
 * Each status transition fires a custom card toast via update-toast.tsx.
 * The user interacts with action buttons directly inside the toast
 * (Update now, Restart, Retry).
 */

import { createLogger } from '@orbit/common/lib';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';

import type { Update } from '@tauri-apps/plugin-updater';

import {
  dismissUpdateToast,
  showUpdateAvailable,
  showUpdateDownloading,
  showUpdateError,
  showUpdateReady,
} from '@/components/ui/update-toast';

const logger = createLogger('UpdateStore');

/** Possible update statuses. */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

/** Update store state shape. */
interface UpdateState {
  /** Current update lifecycle status. */
  status: UpdateStatus;
  /** Semver of the available update, if any. */
  availableVersion: string | null;
  /** Markdown release notes from GitHub Release body. */
  releaseNotes: string | null;
  /** Download progress percentage (0–100). */
  downloadProgress: number;
  /** Error message when status is 'error'. */
  error: string | null;
  /** Whether the user dismissed the update toast (clicked "Later"). */
  toastDismissed: boolean;
}

/** Update store actions. */
interface UpdateActions {
  /** Check GitHub for a newer version. */
  checkForUpdate: () => Promise<void>;
  /** Download and install the available update. */
  downloadAndInstall: () => Promise<void>;
  /** Restart the app to apply the installed update. */
  relaunch: () => Promise<void>;
  /** Reset to idle state. */
  reset: () => void;
}

const INITIAL_STATE: UpdateState = {
  status: 'idle',
  availableVersion: null,
  releaseNotes: null,
  downloadProgress: 0,
  error: null,
  toastDismissed: false,
};

export const useUpdateStore = create<UpdateState & UpdateActions>()((set, get) => ({
  ...INITIAL_STATE,

  checkForUpdate: async (): Promise<void> => {
    const { status } = get();
    if (status === 'checking' || status === 'downloading' || status === 'ready') {
      return;
    }

    set({ status: 'checking', error: null });

    try {
      const update: Update | null = await check();

      if (update !== null) {
        logger.info(`Update available: v${update.version}`);
        set({
          status: 'available',
          availableVersion: update.version,
          releaseNotes: update.body ?? null,
        });

        showUpdateAvailable(
          update.version,
          () => {
            void useUpdateStore.getState().downloadAndInstall();
          },
          () => {
            set({ toastDismissed: true });
          }
        );
      } else {
        logger.debug('No update available');
        set({ status: 'idle' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Update check failed: ${message}`);
      set({ status: 'error', error: message });
      // Silently fail — don't toast on check errors (network issues, dev mode, etc.)
    }
  },

  downloadAndInstall: async (): Promise<void> => {
    const { status } = get();
    if (status !== 'available') return;

    set({ status: 'downloading', downloadProgress: 0, toastDismissed: false });
    showUpdateDownloading(0);

    try {
      const update = await check();
      if (update === null) {
        set({ status: 'idle', error: null });
        dismissUpdateToast();
        return;
      }

      let contentLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started': {
            contentLength = event.data.contentLength ?? 0;
            logger.info(`Download started (${String(contentLength)} bytes)`);
            break;
          }
          case 'Progress': {
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
            set({ downloadProgress: progress });
            showUpdateDownloading(progress);
            break;
          }
          case 'Finished': {
            logger.info('Download finished, update ready');
            set({ status: 'ready', downloadProgress: 100 });

            showUpdateReady(
              () => {
                void useUpdateStore.getState().relaunch();
              },
              () => {
                set({ toastDismissed: true });
              }
            );
            break;
          }
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Download failed: ${message}`);
      set({ status: 'error', error: message });

      showUpdateError(message, () => {
        set({ status: 'available' });
        void useUpdateStore.getState().downloadAndInstall();
      });
    }
  },

  relaunch: async (): Promise<void> => {
    try {
      await relaunch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Relaunch failed: ${message}`);
      set({ status: 'error', error: message });
      showUpdateError(message, () => {
        void useUpdateStore.getState().relaunch();
      });
    }
  },

  reset: (): void => {
    dismissUpdateToast();
    set(INITIAL_STATE);
  },
}));
