/**
 * Canvas Session Manager - Manages multiple canvas agent sessions
 *
 * Each session has its own CanvasAgent with isolated state and tool execution.
 * Events are forwarded with session IDs for proper routing.
 *
 * Ported from Orbit's OrbitCanvasService
 *
 * ⚠️  TESTED: This module is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test files:
 *     - src/__tests__/canvas-types.test.ts (unit tests)
 *     - src/__tests__/canvas-e2e.test.ts (simulated E2E)
 *     - src/__tests__/canvas-real-e2e.test.ts (REAL Claude API calls)
 */

import { EventEmitter } from 'node:events';

import { createLogger } from '../logger.js';

import { createCanvasAgent } from './canvas-agent.js';
import { createIntentAnalyzer, createOrchestrator } from './orchestrator/index.js';

import type { CanvasAgent } from './canvas-agent.js';
import type {
  IntentAnalyzer,
  Orchestrator,
  CanvasSnapshot,
  IntentAnalysis,
} from './orchestrator/index.js';
import type {
  CanvasState,
  CanvasSessionConfig,
  SDKMessage,
  McpToolRequest,
  McpToolResponse,
} from './types.js';

const logger = createLogger('CanvasSessionManager');

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Message event data
 */
export interface SessionMessageEvent {
  sessionId: string;
  message: SDKMessage;
}

/**
 * Tool request event data
 */
export interface SessionToolRequestEvent {
  sessionId: string;
  request: McpToolRequest;
}

/**
 * Error event data
 */
export interface SessionErrorEvent {
  sessionId: string;
  error: Error;
}

/**
 * Callback types
 */
export type MessageCallback = (data: SessionMessageEvent) => void;
export type ToolRequestCallback = (data: SessionToolRequestEvent) => void;
export type ErrorCallback = (data: SessionErrorEvent) => void;

// =============================================================================
// CANVAS SESSION MANAGER
// =============================================================================

/**
 * Canvas Session Manager
 *
 * Manages multiple canvas agent sessions. Each session has its own agent
 * with isolated canvas state and tool execution context.
 *
 * @example
 * ```typescript
 * const manager = new CanvasSessionManager();
 *
 * // Subscribe to events
 * const unsubMessage = manager.onMessage(({ sessionId, message }) => {
 *   console.log(`[${sessionId}] Message:`, message);
 * });
 *
 * const unsubTool = manager.onToolRequest(({ sessionId, request }) => {
 *   // Execute tool in frontend, then call handleToolResponse
 * });
 *
 * // Create and use session
 * await manager.createSession('canvas-1', { thinkingEnabled: true });
 * await manager.sendMessage('canvas-1', 'Create a button', canvasState);
 *
 * // Cleanup
 * await manager.deleteSession('canvas-1');
 * manager.dispose();
 * ```
 */
export class CanvasSessionManager {
  // Event emitter
  private readonly emitter = new EventEmitter();

  // Session management
  private readonly sessions = new Map<string, CanvasAgent>();

  // Cleanup tracking
  private readonly sessionCleanups = new Map<string, (() => void)[]>();

  // Orchestrator components
  private readonly intentAnalyzer: IntentAnalyzer;
  private readonly orchestrators = new Map<string, Orchestrator>();

  // Disposed flag
  private disposed = false;

  constructor() {
    this.intentAnalyzer = createIntentAnalyzer();
    logger.info('Canvas session manager initialized');
  }

  // ===========================================================================
  // EVENT CALLBACKS
  // ===========================================================================

  /**
   * Register callback for agent messages
   * @returns Unsubscribe function
   */
  onMessage(callback: MessageCallback): () => void {
    this.emitter.on('message', callback);
    return () => {
      this.emitter.off('message', callback);
    };
  }

  /**
   * Register callback for tool requests
   * Tool requests should be forwarded to the frontend for execution
   * @returns Unsubscribe function
   */
  onToolRequest(callback: ToolRequestCallback): () => void {
    this.emitter.on('toolRequest', callback);
    return () => {
      this.emitter.off('toolRequest', callback);
    };
  }

  /**
   * Register callback for errors
   * @returns Unsubscribe function
   */
  onError(callback: ErrorCallback): () => void {
    this.emitter.on('error', callback);
    return () => {
      this.emitter.off('error', callback);
    };
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new canvas session
   * @throws Error if session already exists or manager is disposed
   */
  createSession(sessionId: string, config?: CanvasSessionConfig): void {
    if (this.disposed) {
      throw new Error('CanvasSessionManager has been disposed');
    }

    if (this.sessions.has(sessionId)) {
      logger.warn({ sessionId }, 'Session already exists');
      return;
    }

    logger.info({ sessionId }, 'Creating canvas session');

    // Track cleanup functions for this session
    const cleanups: (() => void)[] = [];

    // Create agent
    const agent = createCanvasAgent(sessionId, config);

    // Subscribe to agent messages
    const unsubMessage = agent.onMessage((message) => {
      this.emitter.emit('message', { sessionId, message } as SessionMessageEvent);
    });
    cleanups.push(unsubMessage);

    // Subscribe to tool requests
    const unsubTool = agent.onToolRequest((request) => {
      this.emitter.emit('toolRequest', { sessionId, request } as SessionToolRequestEvent);
    });
    cleanups.push(unsubTool);

    // Store cleanup functions
    this.sessionCleanups.set(sessionId, cleanups);

    try {
      // Start the agent session
      agent.startSession();

      // Store agent
      this.sessions.set(sessionId, agent);

      logger.info({ sessionId }, 'Canvas session created successfully');
    } catch (error) {
      // Clean up on failure
      for (const cleanup of cleanups) {
        cleanup();
      }
      this.sessionCleanups.delete(sessionId);
      agent.dispose();

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ sessionId, error: err.message }, 'Failed to create session');
      this.emitter.emit('error', { sessionId, error: err } as SessionErrorEvent);
      throw err;
    }
  }

  /**
   * Delete a canvas session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for deletion');
      return;
    }

    logger.info({ sessionId }, 'Deleting canvas session');

    // Stop and dispose agent
    try {
      await agent.stopSession();
    } catch (error) {
      logger.error({ sessionId, error }, 'Error stopping session');
    }
    agent.dispose();

    // Run cleanup functions
    const cleanups = this.sessionCleanups.get(sessionId);
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      this.sessionCleanups.delete(sessionId);
    }

    // Clean up orchestrator if present
    const orchestrator = this.orchestrators.get(sessionId);
    if (orchestrator) {
      orchestrator.dispose();
      this.orchestrators.delete(sessionId);
      logger.debug({ sessionId }, 'Disposed orchestrator for session');
    }

    // Remove from sessions
    this.sessions.delete(sessionId);

    logger.info({ sessionId }, 'Canvas session deleted');
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  // ===========================================================================
  // MESSAGING
  // ===========================================================================

  /**
   * Send a message to a canvas session
   * Routes between fast path (single agent) and orchestrator (multi-agent) based on intent
   *
   * @throws Error if session doesn't exist
   */
  async sendMessage(sessionId: string, message: string, state: CanvasState): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      throw new Error(`Session ${sessionId} not found. Create session first.`);
    }

    logger.info({ sessionId, preview: message.substring(0, 50) }, 'Sending message to session');

    // Convert state to snapshot for intent analysis
    const canvasSnapshot = this.convertToSnapshot(state);

    // Analyze intent to determine routing
    const analysis = this.intentAnalyzer.analyze(message, canvasSnapshot);

    logger.info(
      {
        sessionId,
        useFastPath: analysis.useFastPath,
        complexity: analysis.complexity,
        category: analysis.category,
        confidence: analysis.confidence,
      },
      'Intent analyzed'
    );

    if (analysis.useFastPath) {
      // Simple request → direct to CanvasAgent (fast path)
      agent.setCanvasState(state);

      try {
        agent.sendMessage(message);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ sessionId, error: err.message }, 'Error sending message (fast path)');
        this.emitter.emit('error', { sessionId, error: err } as SessionErrorEvent);
        throw err;
      }
    } else {
      // Complex request → Orchestrator (multi-agent pipeline)
      try {
        await this.executeWithOrchestrator(sessionId, message, canvasSnapshot, analysis);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ sessionId, error: err.message }, 'Error executing with orchestrator');
        this.emitter.emit('error', { sessionId, error: err } as SessionErrorEvent);
        throw err;
      }
    }
  }

  /**
   * Handle tool response from frontend
   * Call this when the frontend executes a tool and returns the result
   */
  handleToolResponse(sessionId: string, response: McpToolResponse): void {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for tool response');
      return;
    }

    agent.handleToolResponse(response);
  }

  /**
   * Interrupt a canvas session
   */
  async interrupt(sessionId: string): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for interrupt');
      return;
    }

    logger.info({ sessionId }, 'Interrupting session');

    try {
      await agent.interrupt();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ sessionId, error: err.message }, 'Error interrupting session');
      this.emitter.emit('error', { sessionId, error: err } as SessionErrorEvent);
    }
  }

  // ===========================================================================
  // ORCHESTRATION
  // ===========================================================================

  /**
   * Execute a complex request through the multi-agent orchestrator
   */
  private async executeWithOrchestrator(
    sessionId: string,
    message: string,
    canvasSnapshot: CanvasSnapshot,
    analysis: IntentAnalysis
  ): Promise<void> {
    // Get or create orchestrator for this session
    let orchestrator = this.orchestrators.get(sessionId);
    if (!orchestrator) {
      orchestrator = createOrchestrator({ enableFastPath: false });
      this.orchestrators.set(sessionId, orchestrator);

      // Wire orchestrator events to session events
      orchestrator.onStateChange((state) => {
        // Emit progress updates as messages
        const stageInfo = state.stages[state.currentStage];
        const stageName = stageInfo?.name ?? 'Processing';
        this.emitter.emit('message', {
          sessionId,
          message: {
            type: 'text' as const,
            content: `[Orchestrator] Stage ${String(state.currentStage + 1)}/${String(state.stages.length)}: ${stageName} (${state.status})`,
          },
        } as SessionMessageEvent);
      });

      orchestrator.onError((error) => {
        this.emitter.emit('error', {
          sessionId,
          error: new Error(error.message),
        } as SessionErrorEvent);
      });

      orchestrator.onComplete(({ success, results }) => {
        const taskCount = results.size;
        this.emitter.emit('message', {
          sessionId,
          message: {
            type: 'result' as const,
            content: success
              ? `Completed ${String(taskCount)} task${taskCount !== 1 ? 's' : ''} successfully`
              : `Orchestration completed with errors (${String(taskCount)} tasks)`,
          },
        } as SessionMessageEvent);
      });

      logger.info({ sessionId }, 'Created orchestrator for session');
    }

    logger.info(
      {
        sessionId,
        complexity: analysis.complexity,
        category: analysis.category,
        estimatedTasks: analysis.estimatedTaskCount,
      },
      'Executing with orchestrator'
    );

    // Process intent and execute through orchestrator
    const { results } = await orchestrator.processAndExecute(message, canvasSnapshot);

    // Log completion
    logger.info(
      {
        sessionId,
        taskCount: results.size,
        success: Array.from(results.values()).every((r) => r.success),
      },
      'Orchestrator execution completed'
    );
  }

  /**
   * Convert CanvasState to CanvasSnapshot for orchestrator
   */
  private convertToSnapshot(state: CanvasState): CanvasSnapshot {
    return {
      nodes: state.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
      selectedNodeId: state.selectedNodeId ?? undefined,
    };
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Set thinking mode for a session
   * Note: Requires session restart to take effect
   */
  setThinkingMode(sessionId: string, enabled: boolean): void {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for thinking mode update');
      return;
    }

    agent.setThinking(enabled);
  }

  /**
   * Set model for a session
   * Note: Requires session restart to take effect
   */
  setModel(sessionId: string, model: string): void {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for model update');
      return;
    }

    agent.setModel(model);
  }

  /**
   * Get canvas state for a session
   */
  getCanvasState(sessionId: string): CanvasState | undefined {
    const agent = this.sessions.get(sessionId);
    return agent?.getCanvasState();
  }

  /**
   * Update canvas state for a session (without sending a message)
   */
  updateCanvasState(sessionId: string, state: CanvasState): void {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      logger.warn({ sessionId }, 'Session not found for state update');
      return;
    }

    agent.setCanvasState(state);
  }

  /**
   * Get session configuration
   */
  getSessionConfig(sessionId: string): CanvasSessionConfig | undefined {
    const agent = this.sessions.get(sessionId);
    return agent?.getConfig();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Check if manager is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Dispose manager and all sessions
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    logger.info({ sessionCount: this.sessions.size }, 'Disposing session manager');

    // Dispose all agents
    for (const [sessionId, agent] of this.sessions) {
      logger.debug({ sessionId }, 'Disposing session');

      // Stop session (fire and forget)
      agent.stopSession().catch((error: unknown) => {
        logger.error({ sessionId, error }, 'Error stopping session during dispose');
      });

      // Dispose agent
      agent.dispose();

      // Run cleanup functions
      const cleanups = this.sessionCleanups.get(sessionId);
      if (cleanups) {
        for (const cleanup of cleanups) {
          cleanup();
        }
      }
    }

    // Dispose all orchestrators
    for (const orchestrator of this.orchestrators.values()) {
      orchestrator.dispose();
    }
    this.orchestrators.clear();

    // Clear maps
    this.sessions.clear();
    this.sessionCleanups.clear();

    // Remove all event listeners
    this.emitter.removeAllListeners();

    logger.info('Canvas session manager disposed');
  }
}

/**
 * Factory function to create CanvasSessionManager
 */
export function createCanvasSessionManager(): CanvasSessionManager {
  return new CanvasSessionManager();
}
