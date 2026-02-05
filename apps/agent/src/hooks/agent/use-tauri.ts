import { createLogger } from '@orbit/common/lib';
import { formatZodError } from '@orbit/shared-schemas';
import { useCallback, useEffect, useRef, useState } from 'react';

// Internal modules
import { handleTauriMessage } from './use-tauri-handlers';
import { initWindowMessageListener, messageHandlers } from './use-tauri-message-listener';
import { handleMockMessage } from './use-tauri-mock';

// Import types for use in this file
import type { UseTauriOptions, UseTauriReturn, MessageHandler } from './types/tauri-types';
import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';

import { WebviewMessageSchema } from '@/types/protocol';

const logger = createLogger('Tauri');

// Re-export types for consumers
export type { UseTauriOptions, UseTauriReturn, MessageHandler };

// Re-export utility functions
export { markSessionAsForked } from './use-tauri-session';

// ═══════════════════════════════════════════════════════════════
// Tauri API Detection
// ═══════════════════════════════════════════════════════════════

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// ═══════════════════════════════════════════════════════════════
// Agent Listener Singleton HMR Cleanup
// ═══════════════════════════════════════════════════════════════

// Clean up on HMR to prevent listener accumulation
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__ORBIT_AGENT_LISTENER_UNLISTEN__) {
      window.__ORBIT_AGENT_LISTENER_UNLISTEN__();
      window.__ORBIT_AGENT_LISTENER_UNLISTEN__ = null;
      window.__ORBIT_AGENT_LISTENERS_INITIALIZED__ = false;
      logger.debug('Agent listeners cleaned up for HMR');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useTauri(options: UseTauriOptions = {}): UseTauriReturn {
  const { onMessage, debug = false } = options;

  // Initialize connection state correctly from the start (no useEffect needed)
  // This avoids state updates during commit phase which can cause infinite re-renders
  const [isConnected] = useState(() => isTauriEnvironment());
  const [isMockMode] = useState(() => !isTauriEnvironment());
  const handlerRef = useRef(onMessage);

  // Use refs for connection state so postMessage callback stays stable
  const isConnectedRef = useRef(isConnected);
  const isMockModeRef = useRef(isMockMode);

  handlerRef.current = onMessage;
  isConnectedRef.current = isConnected;
  isMockModeRef.current = isMockMode;

  // Log connection status once on mount
  useEffect(() => {
    if (debug) {
      if (isConnected && !isMockMode) {
        logger.debug('Connected to Tauri backend');
      } else {
        logger.debug('Mock mode - no Tauri backend');
      }
    }
  }, [debug, isConnected, isMockMode]);

  // Register/unregister handler with singleton message listener
  useEffect(() => {
    // Initialize singleton window listener (only runs once globally)
    initWindowMessageListener();

    // Create a stable handler wrapper that uses the ref
    const handler = (message: ExtensionMessage): void => {
      if (debug) {
        logger.debug(`Received: ${message.type}`);
      }
      handlerRef.current?.(message);
    };

    // Register this hook's handler
    messageHandlers.add(handler);

    return (): void => {
      // Unregister this hook's handler
      messageHandlers.delete(handler);
    };
  }, [debug]);

  // NOTE: Terminal and agent listeners are now initialized by TauriProvider
  // This ensures proper React lifecycle management and HMR support

  // Send message with validation
  // Uses refs for connection state so this callback reference stays stable
  const postMessage = useCallback(
    (message: WebviewMessage): void => {
      const result = WebviewMessageSchema.safeParse(message);
      if (!result.success) {
        logger.error('Invalid outgoing message', new Error(formatZodError(result.error)));
        return;
      }

      if (debug) {
        logger.debug(`Sending: ${message.type}`);
      }

      // Use refs to avoid dependency on state (prevents infinite re-renders)
      if (isConnectedRef.current && !isMockModeRef.current) {
        // Handle message via Tauri commands
        handleTauriMessage(message).catch((err: unknown) => {
          logger.error('Tauri message error', err instanceof Error ? err : new Error(String(err)));
        });
      } else if (isMockModeRef.current) {
        if (debug) logger.debug('Mock message', message as Record<string, unknown>);
        handleMockMessage(message);
      }
    },
    [debug]
  );

  return { postMessage, isConnected, isMockMode };
}
