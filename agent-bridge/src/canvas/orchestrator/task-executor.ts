/*---------------------------------------------------------------------------------------------
 *  TaskExecutor - Event loop for task execution
 *
 *  Executes tasks from a TaskGraph respecting dependencies:
 *  1. Find tasks with all dependencies completed ("ready" tasks)
 *  2. Acquire locks for assigned nodes
 *  3. Dispatch tasks to agents in parallel (within stage limits)
 *  4. Collect results and update state
 *  5. Recurse until all tasks complete or failure
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'node:events';

import { createLogger } from '../../logger.js';

import { getBlackboard } from './blackboard.js';
import { getNodeLockManager } from './node-lock-manager.js';

import type { Blackboard } from './blackboard.js';
import type { NodeLockManager } from './node-lock-manager.js';
import type {
  AgentActivity,
  AgentType,
  BlackboardSlice,
  Task,
  TaskGraph,
  TaskOutput,
  TaskStage,
} from './types.js';

const logger = createLogger('TaskExecutor');

/**
 * Agent executor function type
 * Agents are provided externally to keep TaskExecutor decoupled from Claude SDK
 */
export type AgentExecutor = (task: Task, context: BlackboardSlice) => Promise<TaskOutput>;

/**
 * Task execution events
 */
export interface TaskExecutionEvents {
  /** Task started executing */
  onTaskStart: (task: Task) => void;
  /** Task completed (success or failure) */
  onTaskComplete: (data: { task: Task; output: TaskOutput }) => void;
  /** Stage started */
  onStageStart: (stage: TaskStage) => void;
  /** Stage completed */
  onStageComplete: (stage: TaskStage) => void;
  /** All tasks completed */
  onComplete: (data: { success: boolean; results: Map<string, TaskOutput> }) => void;
  /** Execution error */
  onError: (data: { task?: Task; error: Error }) => void;
}

/**
 * Executor configuration
 */
export interface TaskExecutorConfig {
  /** Maximum concurrent tasks per stage */
  maxConcurrentTasks: number;
  /** Task timeout in ms */
  taskTimeout: number;
  /** Retry failed tasks automatically */
  autoRetry: boolean;
  /** Max retry attempts per task */
  maxRetries: number;
}

const DEFAULT_CONFIG: TaskExecutorConfig = {
  maxConcurrentTasks: 3,
  taskTimeout: 60000,
  autoRetry: true,
  maxRetries: 2,
};

/**
 * TaskExecutor - Runs tasks from a graph respecting dependencies
 */
export class TaskExecutor {
  private readonly emitter = new EventEmitter();
  private readonly config: TaskExecutorConfig;
  private readonly lockManager: NodeLockManager;
  private readonly blackboard: Blackboard;

  /** Agent executors by type */
  private agents = new Map<AgentType, AgentExecutor>();

  /** Currently running tasks */
  private runningTasks = new Set<string>();

  /** Task retry counts */
  private retryCounts = new Map<string, number>();

  /** Execution state */
  private isExecuting = false;
  private isPaused = false;
  private isCancelled = false;

  /** Results storage */
  private results = new Map<string, TaskOutput>();

  constructor(config: Partial<TaskExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lockManager = getNodeLockManager();
    this.blackboard = getBlackboard();

    logger.info({ config: this.config }, 'TaskExecutor initialized');
  }

  // ========== Event Registration ==========

  /**
   * Register callback for task start events
   */
  onTaskStart(callback: (task: Task) => void): () => void {
    this.emitter.on('taskStart', callback);
    return () => this.emitter.off('taskStart', callback);
  }

  /**
   * Register callback for task complete events
   */
  onTaskComplete(callback: (data: { task: Task; output: TaskOutput }) => void): () => void {
    this.emitter.on('taskComplete', callback);
    return () => this.emitter.off('taskComplete', callback);
  }

  /**
   * Register callback for stage start events
   */
  onStageStart(callback: (stage: TaskStage) => void): () => void {
    this.emitter.on('stageStart', callback);
    return () => this.emitter.off('stageStart', callback);
  }

  /**
   * Register callback for stage complete events
   */
  onStageComplete(callback: (stage: TaskStage) => void): () => void {
    this.emitter.on('stageComplete', callback);
    return () => this.emitter.off('stageComplete', callback);
  }

  /**
   * Register callback for execution complete events
   */
  onComplete(
    callback: (data: { success: boolean; results: Map<string, TaskOutput> }) => void
  ): () => void {
    this.emitter.on('complete', callback);
    return () => this.emitter.off('complete', callback);
  }

  /**
   * Register callback for error events
   */
  onError(callback: (data: { task?: Task; error: Error }) => void): () => void {
    this.emitter.on('error', callback);
    return () => this.emitter.off('error', callback);
  }

  // ========== Public Methods ==========

  /**
   * Register an agent executor
   */
  registerAgent(type: AgentType, executor: AgentExecutor): void {
    this.agents.set(type, executor);
    logger.info({ type }, 'Agent registered');
  }

  /**
   * Execute a task graph
   */
  async execute(graph: TaskGraph): Promise<Map<string, TaskOutput>> {
    if (this.isExecuting) {
      throw new Error('Already executing a graph');
    }

    logger.info(
      { graphId: graph.id, taskCount: graph.tasks.size, stageCount: graph.stages.length },
      'Starting graph execution'
    );

    this.isExecuting = true;
    this.isPaused = false;
    this.isCancelled = false;
    this.results.clear();
    this.retryCounts.clear();
    this.runningTasks.clear();

    try {
      // Execute stages in order
      for (const stage of graph.stages) {
        await this.executeStage(stage, graph);

        // Check cancellation state after each stage (can be set externally)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.isCancelled) {
          break;
        }

        // Check if stage failed
        if (stage.status === 'failed') {
          logger.error({ stageId: stage.id, stageName: stage.name }, 'Stage failed');
          break;
        }
      }

      // Determine overall success
      const allCompleted = Array.from(graph.tasks.values()).every((t) => t.status === 'completed');

      this.emitter.emit('complete', { success: allCompleted, results: this.results });

      logger.info(
        { graphId: graph.id, success: allCompleted, resultCount: this.results.size },
        'Graph execution complete'
      );

      return this.results;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.isPaused = true;
    logger.info('Execution paused');
  }

  /**
   * Resume execution
   */
  resume(): void {
    this.isPaused = false;
    logger.info('Execution resumed');
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;

    // Release all locks
    for (const taskId of this.runningTasks) {
      this.lockManager.releaseAllLocks(taskId);
    }

    logger.info('Execution cancelled');
  }

  /**
   * Get current active agents
   */
  getActiveAgents(): AgentActivity[] {
    const activities: AgentActivity[] = [];

    for (const [type] of this.agents) {
      // Get first running task (task-to-type mapping would be needed for accuracy)
      const runningTask = Array.from(this.runningTasks)[0];

      activities.push({
        agentId: `${type}-agent-0`,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Agent`,
        type,
        status: runningTask !== undefined ? 'executing' : 'idle',
        currentTaskId: runningTask,
      });
    }

    return activities;
  }

  /**
   * Check if executor is running
   */
  isRunning(): boolean {
    return this.isExecuting;
  }

  /**
   * Check if executor is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Get results
   */
  getResults(): Map<string, TaskOutput> {
    return new Map(this.results);
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.cancel();
    this.emitter.removeAllListeners();
    this.agents.clear();
    this.results.clear();
    this.retryCounts.clear();
    this.runningTasks.clear();
  }

  // ========== Private Methods ==========

  /**
   * Execute a single stage
   */
  private async executeStage(stage: TaskStage, graph: TaskGraph): Promise<void> {
    logger.info({ stageId: stage.id, stageName: stage.name }, 'Starting stage');

    stage.status = 'active';
    this.emitter.emit('stageStart', stage);

    // Get tasks for this stage
    const stageTasks = stage.taskIds
      .map((id) => graph.tasks.get(id))
      .filter((t): t is Task => t !== undefined);

    if (stage.blocking) {
      // Blocking stage: run tasks with dependency ordering
      await this.executeTasksWithDependencies(stageTasks, graph);
    } else {
      // Parallel stage: run all tasks concurrently (respecting maxConcurrent)
      await this.executeTasksParallel(stageTasks, graph);
    }

    // Determine stage status
    const allCompleted = stageTasks.every((t) => t.status === 'completed');
    const anyFailed = stageTasks.some((t) => t.status === 'failed');

    stage.status = anyFailed ? 'failed' : allCompleted ? 'completed' : 'pending';

    this.emitter.emit('stageComplete', stage);

    logger.info(
      { stageId: stage.id, stageName: stage.name, status: stage.status },
      'Stage complete'
    );
  }

  /**
   * Execute tasks respecting dependencies (for blocking stages)
   */
  private async executeTasksWithDependencies(tasks: Task[], graph: TaskGraph): Promise<void> {
    while (!this.isCancelled) {
      // Wait if paused
      if (this.isPaused) {
        await this.waitForResume();
      }

      // Find ready tasks (all dependencies completed)
      const readyTasks = tasks.filter(
        (task) =>
          task.status === 'pending' &&
          task.dependencies.every((depId) => {
            const dep = graph.tasks.get(depId);
            return dep?.status === 'completed';
          })
      );

      if (readyTasks.length === 0) {
        // Check if we're done or stuck
        const pendingCount = tasks.filter((t) => t.status === 'pending').length;
        const runningCount = tasks.filter((t) => t.status === 'running').length;

        if (pendingCount === 0 && runningCount === 0) {
          break; // All done
        }

        if (pendingCount > 0 && runningCount === 0) {
          // Stuck - dependencies can't be satisfied
          logger.error('Execution stuck - unresolvable dependencies');
          break;
        }

        // Wait for running tasks to complete
        await this.waitForAnyTaskComplete();
        continue;
      }

      // Execute ready tasks (up to max concurrent)
      const toExecute = readyTasks.slice(0, this.config.maxConcurrentTasks);
      await Promise.all(toExecute.map((task) => this.executeTask(task, graph)));
    }
  }

  /**
   * Execute tasks in parallel (for non-blocking stages)
   */
  private async executeTasksParallel(tasks: Task[], graph: TaskGraph): Promise<void> {
    // Mark all as ready (dependencies should be met since prior stages completed)
    for (const task of tasks) {
      task.status = 'ready';
    }

    // Execute in batches respecting maxConcurrent
    const batches: Task[][] = [];
    for (let i = 0; i < tasks.length; i += this.config.maxConcurrentTasks) {
      batches.push(tasks.slice(i, i + this.config.maxConcurrentTasks));
    }

    for (const batch of batches) {
      if (this.isCancelled) {
        break;
      }

      // Wait if paused
      if (this.isPaused) {
        await this.waitForResume();
      }

      await Promise.all(batch.map((task) => this.executeTask(task, graph)));
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: Task, _graph?: TaskGraph): Promise<void> {
    void _graph; // Parameter reserved for future dependency tracking
    const agent = this.agents.get(task.type);
    if (!agent) {
      const error = new Error(`No agent registered for type: ${task.type}`);
      this.emitter.emit('error', { task, error });
      task.status = 'failed';
      task.error = error.message;
      return;
    }

    // Acquire locks for assigned nodes
    for (const nodeId of task.assignedNodeIds) {
      const lockResult = this.lockManager.acquireLock({
        nodeId,
        agentId: task.agentId,
        taskId: task.id,
        type: 'write',
        includesChildren: true,
      });

      if (!lockResult.success) {
        logger.warn(
          { taskId: task.id, nodeId, reason: lockResult.reason },
          'Failed to acquire lock'
        );
        // Don't fail immediately - could retry later
        task.status = 'pending';
        return;
      }
    }

    // Mark as running
    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.add(task.id);
    this.emitter.emit('taskStart', task);

    logger.info({ taskId: task.id, type: task.type }, 'Executing task');

    try {
      // Get context slice for this task
      const context = this.blackboard.getSlice(task.assignedNodeIds);

      // Execute with timeout
      const output = await this.executeWithTimeout(
        () => agent(task, context),
        this.config.taskTimeout
      );

      // Record output
      this.results.set(task.id, output);
      this.blackboard.setTaskOutput(task.id, output);

      if (output.success) {
        task.status = 'completed';
        task.output = output;
        task.completedAt = Date.now();

        // Commit changes
        if (output.changes.length > 0) {
          this.blackboard.addPendingChanges(task.id, output.changes);
          this.blackboard.commitChanges(task.id);
        }

        logger.info({ taskId: task.id }, 'Task completed successfully');
      } else {
        throw new Error(output.error ?? 'Task failed without error message');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      task.error = errorMessage;

      // Check if we should retry
      const retryCount = this.retryCounts.get(task.id) ?? 0;
      if (this.config.autoRetry && retryCount < this.config.maxRetries) {
        this.retryCounts.set(task.id, retryCount + 1);
        task.status = 'pending';
        logger.warn(
          { taskId: task.id, retryCount: retryCount + 1, error: errorMessage },
          'Task failed, will retry'
        );
      } else {
        task.status = 'failed';
        this.emitter.emit('error', {
          task,
          error: err instanceof Error ? err : new Error(errorMessage),
        });
        logger.error({ taskId: task.id, error: errorMessage }, 'Task failed');
      }
    } finally {
      // Release locks
      this.lockManager.releaseAllLocks(task.id);
      this.runningTasks.delete(task.id);

      this.emitter.emit('taskComplete', {
        task,
        output: this.results.get(task.id) ?? {
          success: false,
          changes: [],
          nodeIds: [],
          error: task.error,
        },
      });
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${String(timeout)}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  /**
   * Wait for any running task to complete
   */
  private waitForAnyTaskComplete(): Promise<void> {
    return new Promise((resolve) => {
      const unsubscribe = this.onTaskComplete(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  /**
   * Wait for resume after pause
   */
  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.isPaused || this.isCancelled) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

/**
 * Singleton instance
 */
let executorInstance: TaskExecutor | null = null;

/**
 * Get or create the TaskExecutor singleton
 */
export function getTaskExecutor(): TaskExecutor {
  executorInstance ??= new TaskExecutor();
  return executorInstance;
}

/**
 * Create a fresh TaskExecutor (for testing or isolation)
 */
export function createTaskExecutor(config?: Partial<TaskExecutorConfig>): TaskExecutor {
  return new TaskExecutor(config);
}
