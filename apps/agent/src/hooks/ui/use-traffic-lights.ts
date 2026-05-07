/**
 * useTrafficLights — slide native macOS traffic lights with the sidebar
 *
 * Sidebar open: traffic lights at their configured position.
 * Sidebar closed: traffic lights slid off the left edge of the window.
 *
 * Resize resilience is handled on the native side via a
 * NSWindowDidResizeNotification observer — no frontend listener needed.
 *
 * No-op in browser dev mode (mock mode) and non-macOS platforms.
 */
import { createLogger } from '@orbit/common/lib';
import { useEffect } from 'react';

import { invoke, IS_TAURI } from '@/lib/api/core';

/** Traffic light position (points from top-left of window) */
const TRAFFIC_LIGHT_X = 11;
const TRAFFIC_LIGHT_Y = 25;

const logger = createLogger('TrafficLights');

function formatTrafficLightError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useTrafficLights(sidebarOpen: boolean): void {
  useEffect(() => {
    if (!IS_TAURI) return;

    invoke('set_traffic_lights_visible', {
      visible: sidebarOpen,
      x: TRAFFIC_LIGHT_X,
      y: TRAFFIC_LIGHT_Y,
    }).catch((error: unknown) => {
      logger.warn('Failed to update macOS traffic lights visibility', {
        error: formatTrafficLightError(error),
        sidebarOpen,
      });
    });
  }, [sidebarOpen]);
}
