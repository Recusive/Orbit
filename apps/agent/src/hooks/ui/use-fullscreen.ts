/**
 * useFullscreen — detect macOS fullscreen state
 *
 * Returns true when the app window is in native fullscreen mode.
 * Used by ContentCard to remove border-radius and margins in fullscreen.
 *
 * Uses the Tauri window `onResized` event as a proxy for fullscreen
 * changes (Tauri emits resize events when entering/exiting fullscreen).
 */
import { useEffect, useState } from 'react';

import { IS_TAURI } from '@/lib/api/core';

export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    const setup = async (): Promise<void> => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const appWindow = getCurrentWebviewWindow();

      // Initial check
      const fullscreen = await appWindow.isFullscreen();
      setIsFullscreen(fullscreen);

      // Listen for resize events (fires on fullscreen enter/exit)
      unlisten = await appWindow.onResized(() => {
        void appWindow.isFullscreen().then(setIsFullscreen);
      });
    };

    void setup();

    return (): void => {
      unlisten?.();
    };
  }, []);

  return isFullscreen;
}
