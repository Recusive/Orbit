/*---------------------------------------------------------------------------------------------
 *  Orchestrator - Main orchestration controller
 *
 *  Coordinates intent analysis, task decomposition, and agent execution.
 *  Routes between Fast Path (single agent) and Full Orchestration (multi-agent).
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'node:events';

import { createLogger } from '../../common/logging/logger.js';

import { getBlackboard } from './blackboard.js';
import { getIntentAnalyzer } from './intent-analyzer.js';
import { getTaskDecomposer } from './task-decomposer.js';
import { getTaskExecutor } from './task-executor.js';

import type { Blackboard } from './blackboard.js';
import type { IntentAnalyzer } from './intent-analyzer.js';
import type { TaskDecomposer } from './task-decomposer.js';
import type { TaskExecutor, AgentExecutor } from './task-executor.js';
import type {
  AgentActivity,
  AgentType,
  CanvasSnapshot,
  DecompositionResult,
  IntentAnalysis,
  OrchestratorControlAction,
  OrchestratorError,
  OrchestratorState,
  OrchestratorStatus,
  TaskGraph,
  TaskOutput,
  TaskStageProgress,
} from './types.js';

const logger = createLogger('Orchestrator');

/**
 * Default idle state
 */
const DEFAULT_STATE: OrchestratorState = {
  status: 'idle',
  currentStage: 0,
  stages: [],
  activeAgents: [],
  completedTasks: 0,
  totalTasks: 0,
  errors: [],
};

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Enable fast path optimization for simple requests */
  enableFastPath?: boolean;

  /** Minimum confidence to use fast path */
  fastPathConfidenceThreshold?: number;

  /** Maximum concurrent tasks per stage */
  maxConcurrentTasks?: number;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  enableFastPath: true,
  fastPathConfidenceThreshold: 0.6,
  maxConcurrentTasks: 3,
};

/**
 * Main Orchestrator class
 */
export class Orchestrator {
  private readonly emitter = new EventEmitter();

  private readonly intentAnalyzer: IntentAnalyzer;
  private readonly taskDecomposer: TaskDecomposer;
  private readonly taskExecutor: TaskExecutor;
  private readonly blackboard: Blackboard;
  private readonly config: Required<OrchestratorConfig>;

  private state: OrchestratorState = { ...DEFAULT_STATE };
  private currentGraph: TaskGraph | null = null;
  private isPaused = false;

  constructor(config: OrchestratorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.intentAnalyzer = getIntentAnalyzer();
    this.taskDecomposer = getTaskDecomposer();
    this.taskExecutor = getTaskExecutor();
    this.blackboard = getBlackboard();

    // Wire up executor events
    this.wireExecutorEvents();

    logger.info({ config: this.config }, 'Orchestrator initialized');
  }

  // ========== Event Registration ==========

  /**
   * Register callback for state change events
   */
  onStateChange(callback: (state: OrchestratorState) => void): () => void {
    this.emitter.on('stateChange', callback);
    return () => this.emitter.off('stateChange', callback);
  }

  /**
   * Register callback for error events
   */
  onError(callback: (error: OrchestratorError) => void): () => void {
    this.emitter.on('error', callback);
    return () => this.emitter.off('error', callback);
  }

  /**
   * Register callback for completion events
   */
  onComplete(
    callback: (result: { success: boolean; results: Map<string, TaskOutput> }) => void
  ): () => void {
    this.emitter.on('complete', callback);
    return () => this.emitter.off('complete', callback);
  }

  // ========== Public Methods ==========

  /**
   * Get current orchestrator state
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Process a user intent
   *
   * @param intent - The user's prompt/request
   * @param canvasState - Current canvas state snapshot
   * @returns Analysis and decomposition result
   */
  processIntent(
    intent: string,
    canvasState?: CanvasSnapshot
  ): { analysis: IntentAnalysis; decomposition: DecompositionResult } {
    logger.info({ intent: intent.substring(0, 100) }, 'Processing intent');

    // Update state to analyzing
    this.updateState({
      status: 'analyzing',
      currentIntent: intent,
    });

    try {
      // Analyze intent
      const analysis = this.intentAnalyzer.analyze(intent, canvasState);

      // Check if fast path is allowed and appropriate
      const useFastPath =
        this.config.enableFastPath &&
        analysis.useFastPath &&
        analysis.confidence >= this.config.fastPathConfidenceThreshold;

      // Override analysis if fast path is disabled by config
      if (!useFastPath && analysis.useFastPath) {
        analysis.useFastPath = false;
        analysis.fastPathAgent = undefined;
        analysis.reasoning += ' Fast path disabled by configuration.';
      }

      // Decompose into task graph
      const decomposition = this.taskDecomposer.decompose(analysis, canvasState);

      // Store current graph
      this.currentGraph = decomposition.graph;

      // Update state with graph info
      this.updateState({
        status: 'idle', // Ready to execute
        stages: this.graphToStageProgress(decomposition.graph),
        totalTasks: decomposition.graph.tasks.size,
        completedTasks: 0,
      });

      logger.info(
        {
          useFastPath: analysis.useFastPath,
          taskCount: decomposition.graph.tasks.size,
          stageCount: decomposition.graph.stages.length,
        },
        'Intent processed'
      );

      return { analysis, decomposition };
    } catch (error) {
      const err = this.createError('INTENT_PROCESSING_FAILED', String(error), true);
      this.emitter.emit('error', err);
      this.updateState({
        status: 'failed',
        errors: [...this.state.errors, err],
      });
      throw error;
    }
  }

  /**
   * Execute the current task graph
   */
  async executeGraph(): Promise<Map<string, TaskOutput>> {
    if (!this.currentGraph) {
      throw new Error('No task graph to execute. Call processIntent first.');
    }

    logger.info({ graphId: this.currentGraph.id }, 'Starting graph execution');

    this.updateState({ status: 'executing' });

    try {
      const results = await this.taskExecutor.execute(this.currentGraph);

      // Determine overall success
      const allCompleted = Array.from(this.currentGraph.tasks.values()).every(
        (t) => t.status === 'completed'
      );

      this.updateState({
        status: allCompleted ? 'completing' : 'failed',
      });

      this.emitter.emit('complete', { success: allCompleted, results });

      return results;
    } catch (error) {
      const err = this.createError('EXECUTION_FAILED', String(error), true);
      this.emitter.emit('error', err);
      this.updateState({
        status: 'failed',
        errors: [...this.state.errors, err],
      });
      throw error;
    }
  }

  /**
   * Process intent and execute in one call
   */
  async processAndExecute(
    intent: string,
    canvasState?: CanvasSnapshot
  ): Promise<{ analysis: IntentAnalysis; results: Map<string, TaskOutput> }> {
    const { analysis } = this.processIntent(intent, canvasState);
    const results = await this.executeGraph();
    return { analysis, results };
  }

  /**
   * Register an agent executor for a specific type
   */
  registerAgent(type: AgentType, executor: AgentExecutor): void {
    this.taskExecutor.registerAgent(type, executor);
  }

  /**
   * Check if a request should use fast path
   */
  shouldUseFastPath(analysis: IntentAnalysis): boolean {
    return (
      this.config.enableFastPath &&
      analysis.useFastPath &&
      analysis.confidence >= this.config.fastPathConfidenceThreshold
    );
  }

  /**
   * Handle control actions (pause, resume, cancel, retry)
   */
  handleControl(action: OrchestratorControlAction, taskId?: string): void {
    logger.info({ action, taskId }, 'Control action received');

    switch (action) {
      case 'pause':
        this.isPaused = true;
        this.taskExecutor.pause();
        if (this.state.status === 'executing') {
          this.updateState({ status: 'idle' });
        }
        break;

      case 'resume':
        this.isPaused = false;
        this.taskExecutor.resume();
        break;

      case 'cancel':
        this.taskExecutor.cancel();
        this.reset();
        break;

      case 'retry':
        if (taskId && this.currentGraph) {
          const task = this.currentGraph.tasks.get(taskId);
          if (task) {
            task.status = 'pending';
            task.error = undefined;
            logger.info({ taskId }, 'Task marked for retry');
          }
        }
        break;
    }
  }

  /**
   * Reset orchestrator to idle state
   */
  reset(): void {
    this.currentGraph = null;
    this.isPaused = false;
    this.blackboard.reset();
    this.updateState({ ...DEFAULT_STATE });
    logger.info('Orchestrator reset');
  }

  /**
   * Get the current task graph
   */
  getCurrentGraph(): TaskGraph | null {
    return this.currentGraph;
  }

  /**
   * Check if orchestrator is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Update orchestrator status
   */
  setStatus(status: OrchestratorStatus): void {
    this.updateState({ status });
  }

  /**
   * Update active agents for UI display
   */
  updateActiveAgents(agents: AgentActivity[]): void {
    this.updateState({ activeAgents: agents });
  }

  /**
   * Mark a task as completed and update progress
   */
  markTaskCompleted(taskId: string): void {
    if (!this.currentGraph) {
      return;
    }

    const task = this.currentGraph.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();

      const completedCount = Array.from(this.currentGraph.tasks.values()).filter(
        (t) => t.status === 'completed'
      ).length;

      this.updateState({
        completedTasks: completedCount,
        stages: this.graphToStageProgress(this.currentGraph),
      });

      logger.info(
        { taskId, completedCount, total: this.currentGraph.tasks.size },
        'Task completed'
      );
    }
  }

  /**
   * Mark a task as failed
   */
  markTaskFailed(taskId: string, error: string): void {
    if (!this.currentGraph) {
      return;
    }

    const task = this.currentGraph.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;

      const err = this.createError('TASK_FAILED', error, true, taskId, task.agentId);
      this.emitter.emit('error', err);

      this.updateState({
        errors: [...this.state.errors, err],
        stages: this.graphToStageProgress(this.currentGraph),
      });

      logger.error({ taskId, error }, 'Task failed');
    }
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.taskExecutor.dispose();
    this.emitter.removeAllListeners();
    this.currentGraph = null;
  }

  // ========== Private Methods ==========

  /**
   * Wire up task executor events to orchestrator state
   */
  private wireExecutorEvents(): void {
    this.taskExecutor.onTaskStart(() => {
      this.updateState({
        activeAgents: this.taskExecutor.getActiveAgents(),
      });
      if (this.currentGraph) {
        this.updateState({
          stages: this.graphToStageProgress(this.currentGraph),
        });
      }
    });

    this.taskExecutor.onTaskComplete(({ task, output }) => {
      if (output.success) {
        this.markTaskCompleted(task.id);
      } else {
        this.markTaskFailed(task.id, output.error ?? 'Unknown error');
      }
    });

    this.taskExecutor.onStageStart((stage) => {
      this.updateState({
        currentStage: stage.id,
      });
    });

    this.taskExecutor.onStageComplete(() => {
      if (this.currentGraph) {
        this.updateState({
          stages: this.graphToStageProgress(this.currentGraph),
        });
      }
    });

    this.taskExecutor.onComplete(({ success, results }) => {
      this.updateState({
        status: success ? 'completing' : 'failed',
      });
      this.emitter.emit('complete', { success, results });
    });

    this.taskExecutor.onError(({ task, error }) => {
      const err = this.createError(
        'TASK_EXECUTION_ERROR',
        error.message,
        true,
        task?.id,
        task?.agentId
      );
      this.emitter.emit('error', err);
      this.updateState({
        errors: [...this.state.errors, err],
      });
    });
  }

  /**
   * Update orchestrator state and emit event
   */
  private updateState(partial: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...partial };
    this.emitter.emit('stateChange', this.state);
  }

  /**
   * Convert task graph to stage progress for UI
   */
  private graphToStageProgress(graph: TaskGraph): TaskStageProgress[] {
    return graph.stages.map((stage) => {
      const stageTasks = stage.taskIds
        .map((taskId) => graph.tasks.get(taskId))
        .filter((t): t is NonNullable<typeof t> => t !== undefined);

      const completedTasks = stageTasks.filter((t) => t.status === 'completed').length;
      const progress = stageTasks.length > 0 ? (completedTasks / stageTasks.length) * 100 : 0;

      return {
        id: stage.id,
        name: stage.name,
        status: stage.status,
        progress,
        tasks: stageTasks.map((task) => ({
          id: task.id,
          type: task.type,
          agentId: task.agentId,
          status: task.status,
          assignedNodeIds: task.assignedNodeIds,
        })),
      };
    });
  }

  /**
   * Create an orchestrator error
   */
  private createError(
    code: string,
    message: string,
    recoverable: boolean,
    taskId?: string,
    agentId?: string
  ): OrchestratorError {
    return {
      code,
      message,
      taskId,
      agentId,
      recoverable,
      timestamp: Date.now(),
    };
  }
}

/**
 * Singleton instance
 */
let orchestratorInstance: Orchestrator | null = null;

/**
 * Get or create the Orchestrator singleton
 */
export function getOrchestrator(): Orchestrator {
  orchestratorInstance ??= new Orchestrator();
  return orchestratorInstance;
}

/**
 * Create a fresh Orchestrator (for testing or isolation)
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
