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
import { useEffect } from 'react';

import { invoke, IS_TAURI } from '@/lib/api/core';

/** Traffic light position (points from top-left of window) */
const TRAFFIC_LIGHT_X = 11;
const TRAFFIC_LIGHT_Y = 24;

export function useTrafficLights(sidebarOpen: boolean): void {
  useEffect(() => {
    if (!IS_TAURI) return;

    void invoke('set_traffic_lights_visible', {
      visible: sidebarOpen,
      x: TRAFFIC_LIGHT_X,
      y: TRAFFIC_LIGHT_Y,
    });
  }, [sidebarOpen]);
}
