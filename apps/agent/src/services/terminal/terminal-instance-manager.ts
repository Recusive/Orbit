/**
 * TerminalInstanceManager - Singleton service that manages terminal instances
 *
 * This service owns all TerminalInstance objects and manages their lifecycle
 * independently of React components. Mirrors VS Code's TerminalService pattern.
 *
 * Reference: Orbit/src/vs/workbench/contrib/terminal/browser/terminalService.ts
 */

import { createLogger } from '@orbit/common/lib';

import { TerminalInstance } from './terminal-instance';

import type { TerminalCapabilities } from './terminal-instance';
import type { ExtensionMessage } from '@/types/protocol';

const logger = createLogger('TerminalManager');

// ============================================================================
// Types
// ============================================================================

export interface TerminalInstanceInfo {
  sessionId: string;
  sessionName: string;
  terminalId: string | null;
  isConnected: boolean;
}

export interface TerminalManagerCallbacks {
  onInstanceConnected?: (
    sessionId: string,
    terminalId: string,
    pid?: number,
    shellType?: string,
    name?: string
  ) => void;
  onInstanceDisconnected?: (sessionId: string, exitCode?: number) => void;
  onCwdChange?: (sessionId: string, cwd: string) => void;
  onCommandStart?: (sessionId: string, commandLine?: string) => void;
  onCommandEnd?: (sessionId: string, exitCode: number) => void;
  onCapabilitiesChange?: (sessionId: string, capabilities: TerminalCapabilities) => void;
  onTitleChange?: (sessionId: string, title: string) => void;
  onForegroundChange?: (terminalId: string, processName: string, pid: number) => void;
}

// ============================================================================
// Module-Level State (persists across React lifecycle)
// ============================================================================

/**
 * These are stored at module level so they survive React component
 * mount/unmount cycles. This is critical for keeping terminals alive
 * when switching tabs or toggling panels.
 */
let globalPostMessage: ((message: unknown) => void) | null = null;
let globalIsMockMode = false;
let globalCallbacks: TerminalManagerCallbacks = {};

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: TerminalInstanceManager | null = null;

/**
 * Get the singleton TerminalInstanceManager.
 * Call initialize() before using if not already initialized.
 */
export function getTerminalInstanceManager(): TerminalInstanceManager {
  instance ??= new TerminalInstanceManager();
  return instance;
}

/**
 * Reset the singleton (for testing or hot reload)
 */
export function resetTerminalInstanceManager(): void {
  if (instance) {
    instance.disposeAll();
    instance = null;
  }
  // Also reset module-level state
  globalPostMessage = null;
  globalIsMockMode = false;
  globalCallbacks = {};
}

// ============================================================================
// TerminalInstanceManager Class
// ============================================================================

export class TerminalInstanceManager {
  private instances = new Map<string, TerminalInstance>();

  // ==========================================================================
  // Initialization & Updates
  // ==========================================================================

  /**
   * Initialize the manager with postMessage function and callbacks.
   * Can be called multiple times - updates the references safely.
   */
  initialize(
    postMessage: (message: unknown) => void,
    isMockMode: boolean,
    callbacks?: TerminalManagerCallbacks
  ): void {
    globalPostMessage = postMessage;
    globalIsMockMode = isMockMode;
    if (callbacks) {
      globalCallbacks = callbacks;
    }
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return globalPostMessage !== null;
  }

  /**
   * Update the postMessage function.
   * Called when React remounts and provides a new postMessage reference.
   * This is critical for keeping terminals alive across React lifecycle.
   */
  updatePostMessage(postMessage: (message: unknown) => void): void {
    globalPostMessage = postMessage;
    // Update all existing instances so they use the new reference
    for (const inst of this.instances.values()) {
      if (!inst.getIsDisposed()) {
        inst.updatePostMessage(postMessage);
      }
    }
  }

  /**
   * Update callbacks.
   * Called when Zustand store actions change reference.
   */
  updateCallbacks(callbacks: Partial<TerminalManagerCallbacks>): void {
    globalCallbacks = { ...globalCallbacks, ...callbacks };
  }

  /**
   * Get current mock mode status
   */
  getIsMockMode(): boolean {
    return globalIsMockMode;
  }

  // ==========================================================================
  // Instance Management
  // ==========================================================================

  /**
   * Create a new terminal instance.
   * Returns existing instance if one already exists for this sessionId.
   */
  createInstance(sessionId: string, sessionName: string): TerminalInstance {
    // Return existing instance if present
    const existing = this.instances.get(sessionId);
    if (existing && !existing.getIsDisposed()) {
      logger.debug(`Returning existing terminal instance: ${sessionId}`);
      return existing;
    }

    if (!globalPostMessage) {
      logger.error('TerminalInstanceManager not initialized');
      throw new Error('TerminalInstanceManager not initialized. Call initialize() first.');
    }

    logger.info(`Creating terminal instance: ${sessionName}`, { sessionId });

    // Clean up any disposed instances to prevent memory leaks
    this.cleanupDisposedInstances();

    // Create instance with closures that read from global state
    // This ensures callbacks always use the latest references
    const inst = new TerminalInstance({
      sessionId,
      sessionName,
      postMessage: globalPostMessage,
      isMockMode: globalIsMockMode,
      onConnected: (terminalId, pid, shellType, name) => {
        globalCallbacks.onInstanceConnected?.(sessionId, terminalId, pid, shellType, name);
      },
      onDisconnected: (exitCode) => {
        globalCallbacks.onInstanceDisconnected?.(sessionId, exitCode);
      },
      onCwdChange: (cwd) => {
        globalCallbacks.onCwdChange?.(sessionId, cwd);
      },
      onCommandStart: (commandLine) => {
        globalCallbacks.onCommandStart?.(sessionId, commandLine);
      },
      onCommandEnd: (exitCode) => {
        globalCallbacks.onCommandEnd?.(sessionId, exitCode);
      },
      onCapabilitiesChange: (capabilities) => {
        globalCallbacks.onCapabilitiesChange?.(sessionId, capabilities);
      },
      onTitleChange: (title) => {
        globalCallbacks.onTitleChange?.(sessionId, title);
      },
    });

    this.instances.set(sessionId, inst);
    return inst;
  }

  /**
   * Get an existing terminal instance by sessionId.
   */
  getInstance(sessionId: string): TerminalInstance | undefined {
    const instance = this.instances.get(sessionId);
    if (instance && !instance.getIsDisposed()) {
      return instance;
    }
    return undefined;
  }

  /**
   * Get all active terminal instances.
   */
  getAllInstances(): TerminalInstance[] {
    return Array.from(this.instances.values()).filter((instance) => !instance.getIsDisposed());
  }

  /**
   * Get info about all instances (for debugging/UI).
   */
  getInstancesInfo(): TerminalInstanceInfo[] {
    return this.getAllInstances().map((instance) => ({
      sessionId: instance.sessionId,
      sessionName: instance.sessionName,
      terminalId: instance.getTerminalId(),
      isConnected: instance.getIsConnected(),
    }));
  }

  /**
   * Destroy a terminal instance by sessionId.
   * This sends terminal:close to backend and cleans up resources.
   * Only call on explicit user close action!
   */
  destroyInstance(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (instance) {
      instance.dispose();
      this.instances.delete(sessionId);
    }
  }

  /**
   * Dispose all terminal instances.
   * Called on app shutdown or manager reset.
   */
  disposeAll(): void {
    for (const instance of this.instances.values()) {
      instance.dispose();
    }
    this.instances.clear();
  }

  /**
   * Clean up disposed instances from the map.
   * This prevents memory leaks when instances are orphaned.
   */
  private cleanupDisposedInstances(): void {
    const toDelete: string[] = [];
    for (const [sessionId, instance] of this.instances.entries()) {
      if (instance.getIsDisposed()) {
        toDelete.push(sessionId);
      }
    }
    for (const sessionId of toDelete) {
      this.instances.delete(sessionId);
    }
  }

  /**
   * Clean up orphaned instances that don't match any active session IDs.
   * Call this when the store's sessions may have been reset.
   */
  cleanupOrphanedInstances(activeSessionIds: Set<string>): void {
    const toDispose: string[] = [];
    for (const [sessionId, instance] of this.instances.entries()) {
      if (!activeSessionIds.has(sessionId) && !instance.getIsDisposed()) {
        toDispose.push(sessionId);
      }
    }
    for (const sessionId of toDispose) {
      const instance = this.instances.get(sessionId);
      if (instance) {
        instance.dispose();
        this.instances.delete(sessionId);
      }
    }
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle incoming messages from Orbit backend.
   * Routes terminal-related messages to the appropriate instance.
   */
  handleMessage(message: ExtensionMessage): void {
    // Only handle terminal messages
    if (!message.type.startsWith('terminal:')) {
      return;
    }

    // Route by terminal_id for most messages
    const terminalId = 'terminal_id' in message ? message.terminal_id : undefined;
    const sessionId = 'session_id' in message ? message.session_id : undefined;

    // Handle foreground process change - update store directly
    if (message.type === 'terminal:foreground' && terminalId) {
      const processName = 'process_name' in message ? message.process_name : undefined;
      const pid = 'pid' in message ? message.pid : undefined;
      if (processName && typeof pid === 'number') {
        globalCallbacks.onForegroundChange?.(terminalId, processName, pid);
      }
      return;
    }

    // For terminal:created, we need to match by session_id
    if (message.type === 'terminal:created' && sessionId) {
      const instance = this.instances.get(sessionId);
      if (instance) {
        instance.handleMessage(message as Parameters<TerminalInstance['handleMessage']>[0]);
      }
      return;
    }

    // For other messages, find instance by terminal_id
    if (terminalId) {
      for (const instance of this.instances.values()) {
        if (instance.getTerminalId() === terminalId) {
          instance.handleMessage(message as Parameters<TerminalInstance['handleMessage']>[0]);
          return;
        }
      }
    }

    // Fallback: try to match by session_id
    if (sessionId) {
      const instance = this.instances.get(sessionId);
      if (instance) {
        instance.handleMessage(message as Parameters<TerminalInstance['handleMessage']>[0]);
      }
    }
  }
}
