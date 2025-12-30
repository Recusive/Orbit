/**
 * useTerminalInstanceManager - React hook for accessing the terminal instance manager
 *
 * This hook initializes the singleton TerminalInstanceManager with the Tauri
 * postMessage function and handles message routing.
 *
 * CRITICAL: Uses module-level state and listeners to survive React lifecycle.
 * Terminal instances persist across component mount/unmount cycles.
 */

import { useEffect } from 'react';

import type { TerminalInstanceManager } from '@/services/terminal-instance-manager';
import type { ShellType } from '@/types/protocol';

import { useTauri } from '@/hooks/use-tauri';
import { getTerminalInstanceManager } from '@/services/terminal-instance-manager';
import { useTerminalStore } from '@/stores/terminal-store';

// ============================================================================
// Module-Level State (persists across React lifecycle)
// ============================================================================

/**
 * Global message listener - registered once, never removed.
 * This ensures terminal messages are always routed to the manager,
 * regardless of React component lifecycle.
 */
let messageListenerRegistered = false;

function registerGlobalMessageListener(): void {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: string } | null | undefined;

    // Only handle terminal messages
    if (data?.type?.startsWith('terminal:')) {
      const manager = getTerminalInstanceManager();
      if (manager.isInitialized()) {
        // Safe cast - we know this is an ExtensionMessage with terminal type
        manager.handleMessage(data as Parameters<typeof manager.handleMessage>[0]);
      }
    }
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useTerminalInstanceManager(): TerminalInstanceManager {
  // Get store actions for callbacks
  // Using individual selectors to minimize re-renders
  const sessions = useTerminalStore((state) => state.sessions);
  const connectSession = useTerminalStore((state) => state.connectSession);
  const disconnectSession = useTerminalStore((state) => state.disconnectSession);
  const updateSession = useTerminalStore((state) => state.updateSession);
  const updateCwd = useTerminalStore((state) => state.updateCwd);
  const updateCapabilities = useTerminalStore((state) => state.updateCapabilities);
  const startCommand = useTerminalStore((state) => state.startCommand);
  const endCommand = useTerminalStore((state) => state.endCommand);
  const updateForegroundProcess = useTerminalStore((state) => state.updateForegroundProcess);

  // Get postMessage from Tauri
  // Pass dummy handler since we use global listener instead
  const { postMessage, isMockMode } = useTauri({
    debug: false,
  });

  // Register global message listener (idempotent - only runs once ever)
  useEffect(() => {
    registerGlobalMessageListener();
  }, []);

  // Initialize and update manager on every render with latest references
  // This is safe because initialize() and updatePostMessage() are idempotent
  useEffect(() => {
    const manager = getTerminalInstanceManager();

    // Initialize if not already (first time setup)
    if (!manager.isInitialized()) {
      manager.initialize(postMessage as (message: unknown) => void, isMockMode, {
        onInstanceConnected: (sessionId, terminalId, pid, shellType, name) => {
          connectSession(sessionId, terminalId, pid, shellType as ShellType | undefined);
          // Update session name to show the process name (e.g., "zsh", "node")
          // Extract basename from full path (e.g., "/bin/zsh" -> "zsh")
          if (name) {
            const basename = name.split('/').pop() ?? name;
            updateSession(sessionId, { name: basename });
          }
        },
        onInstanceDisconnected: (sessionId, exitCode) => {
          disconnectSession(sessionId, exitCode);
        },
        onCwdChange: (sessionId, cwd) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            updateCwd(termId, cwd);
          }
        },
        onCommandStart: (sessionId, commandLine) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            startCommand(termId, commandLine);
          }
        },
        onCommandEnd: (sessionId, exitCode) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            endCommand(termId, exitCode);
          }
        },
        onCapabilitiesChange: (sessionId, capabilities) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            updateCapabilities(termId, capabilities);
          }
        },
        onTitleChange: (sessionId, title) => {
          // Update session name when PTY title changes (e.g., "zsh" -> "node")
          // Extract basename from full path
          const basename = title.split('/').pop() ?? title;
          updateSession(sessionId, { name: basename });
        },
        onForegroundChange: (terminalId, processName, pid) => {
          updateForegroundProcess(terminalId, processName, pid);
        },
      });
    } else {
      // Already initialized - just update the postMessage reference
      // This is critical for surviving React remounts
      manager.updatePostMessage(postMessage as (message: unknown) => void);

      // Update callbacks with latest store action references
      manager.updateCallbacks({
        onInstanceConnected: (sessionId, terminalId, pid, shellType, name) => {
          connectSession(sessionId, terminalId, pid, shellType as ShellType | undefined);
          // Update session name to show the process name (e.g., "zsh", "node")
          // Extract basename from full path (e.g., "/bin/zsh" -> "zsh")
          if (name) {
            const basename = name.split('/').pop() ?? name;
            updateSession(sessionId, { name: basename });
          }
        },
        onInstanceDisconnected: (sessionId, exitCode) => {
          disconnectSession(sessionId, exitCode);
        },
        onCwdChange: (sessionId, cwd) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            updateCwd(termId, cwd);
          }
        },
        onCommandStart: (sessionId, commandLine) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            startCommand(termId, commandLine);
          }
        },
        onCommandEnd: (sessionId, exitCode) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            endCommand(termId, exitCode);
          }
        },
        onCapabilitiesChange: (sessionId, capabilities) => {
          const instance = manager.getInstance(sessionId);
          const termId = instance?.getTerminalId();
          if (termId) {
            updateCapabilities(termId, capabilities);
          }
        },
        onTitleChange: (sessionId, title) => {
          // Update session name when PTY title changes (e.g., "zsh" -> "node")
          // Extract basename from full path
          const basename = title.split('/').pop() ?? title;
          updateSession(sessionId, { name: basename });
        },
        onForegroundChange: (terminalId, processName, pid) => {
          updateForegroundProcess(terminalId, processName, pid);
        },
      });
    }

    // NO CLEANUP - We intentionally never clean up the manager
    // Terminals persist across React lifecycle
  }, [
    postMessage,
    isMockMode,
    connectSession,
    disconnectSession,
    updateSession,
    updateCwd,
    updateCapabilities,
    startCommand,
    endCommand,
    updateForegroundProcess,
  ]);

  // Clean up orphaned instances when sessions change
  // This handles the case where the store resets (e.g., webview reload)
  // but the manager still has old instances with stale session IDs
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    if (!manager.isInitialized()) return;

    const activeSessionIds = new Set(sessions.map((s) => s.id));
    manager.cleanupOrphanedInstances(activeSessionIds);
  }, [sessions]);

  // Return the singleton manager
  return getTerminalInstanceManager();
}
