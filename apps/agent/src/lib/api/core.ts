/**
 * Core Tauri utilities
 *
 * Foundation module containing invoke(), listen(), and Tauri detection.
 * All other API modules import from this file.
 */

import { createLogger } from '@orbit/common/lib';

// ============================================
// Tauri Detection & Imports
// ============================================

export const logger = createLogger('Backend');
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    logger.debug(`Mock invoke: ${command}`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

export type EventCallback<T> = (payload: T) => void;

export async function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void> {
  if (!IS_TAURI) {
    logger.debug(`Mock listen: ${event}`);
    return (): void => {
      // No-op for mock mode
    };
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}

/**
 * Decode base64 string to UTF-8 text.
 */
export function decodeBase64(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    // If decoding fails, return empty string
    return '';
  }
}

/**
 * Check if running in Tauri environment.
 */
export function isTauri(): boolean {
  return IS_TAURI;
}
