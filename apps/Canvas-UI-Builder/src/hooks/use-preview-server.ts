/**
 * Preview server lifecycle hook
 *
 * Manages the Vite-based preview server that runs at ~/.orbit/canvas/preview.
 * Provides start/stop controls and server status monitoring.
 *
 * The server runs on port 5199-5209 and communicates with the preview iframe
 * via postMessage.
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

/** Response from canvas_preview_server_status and canvas_start_preview_server */
interface PreviewServerInfo {
  running: boolean;
  port: number;
  url: string;
}

/** Possible states for the preview server */
export type ServerState = 'stopped' | 'starting' | 'running' | 'error';

/** Return value from usePreviewServer hook */
export interface UsePreviewServerResult {
  /** Current server state */
  state: ServerState;
  /** Server URL (http://localhost:{port}) when running */
  url: string | null;
  /** Error message if state is 'error' */
  error: string | null;
  /** Start the preview server */
  startServer: () => Promise<void>;
  /** Stop the preview server */
  stopServer: () => Promise<void>;
  /** Restart the preview server (stop + start) */
  restartServer: () => Promise<void>;
}

/**
 * Hook to manage preview server lifecycle
 *
 * @returns Server state, URL, and control functions
 *
 * @example
 * ```tsx
 * const { state, url, error, startServer, stopServer } = usePreviewServer();
 *
 * useEffect(() => {
 *   if (state === 'stopped') {
 *     void startServer();
 *   }
 * }, [state, startServer]);
 *
 * if (state === 'running' && url) {
 *   return <iframe src={url} />;
 * }
 * ```
 */
export function usePreviewServer(): UsePreviewServerResult {
  const [state, setState] = useState<ServerState>('stopped');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check initial status on mount
  useEffect(() => {
    const checkStatus = async (): Promise<void> => {
      try {
        const info = await invoke<PreviewServerInfo>('canvas_preview_server_status');
        if (info.running) {
          setState('running');
          setUrl(info.url);
        }
      } catch {
        // Server not running, that's OK - stay in 'stopped' state
      }
    };
    void checkStatus();
  }, []);

  const startServer = useCallback(async (): Promise<void> => {
    setState('starting');
    setError(null);

    try {
      // First ensure deps are installed
      await invoke('canvas_install_preview_deps');

      // Then start the server
      const info = await invoke<PreviewServerInfo>('canvas_start_preview_server');
      setUrl(info.url);
      setState('running');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setState('error');
    }
  }, []);

  const stopServer = useCallback(async (): Promise<void> => {
    try {
      await invoke('canvas_stop_preview_server');
      setState('stopped');
      setUrl(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    }
  }, []);

  const restartServer = useCallback(async (): Promise<void> => {
    setState('starting');
    setError(null);

    try {
      // Stop the server first (ignore errors if not running)
      try {
        await invoke('canvas_stop_preview_server');
      } catch {
        // Server might not be running, that's OK
      }

      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Start fresh
      const info = await invoke<PreviewServerInfo>('canvas_start_preview_server');
      setUrl(info.url);
      setState('running');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setState('error');
    }
  }, []);

  return {
    state,
    url,
    error,
    startServer,
    stopServer,
    restartServer,
  };
}
