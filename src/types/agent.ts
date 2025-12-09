import { z } from 'zod';

/**
 * Agent phase enum
 */
export enum AgentPhase {
  IDLE = 'idle',
  PLANNING = 'planning',
  IMPLEMENTING = 'implementing',
  REVIEWING = 'reviewing',
  TESTING = 'testing',
  DEBUGGING = 'debugging',
  DOCUMENTING = 'documenting',
  WAITING = 'waiting',
  ERROR = 'error',
}

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
}

/**
 * Tool call status enum
 */
export enum ToolCallStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Tool call schema
 */
export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.nativeEnum(ToolCallStatus),
  parameters: z.record(z.any()),
  result: z.any().optional(),
  error: z.string().optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  metadata: z
    .object({
      retryCount: z.number().optional(),
      duration: z.number().optional(),
      tokens: z.number().optional(),
    })
    .optional(),
});

/**
 * Task progress schema
 */
export const TaskProgressSchema = z.object({
  current: z.number().min(0),
  total: z.number().min(0),
  percentage: z.number().min(0).max(100),
  message: z.string().optional(),
  estimatedTimeRemaining: z.number().optional(),
});

/**
 * Agent task schema
 */
export const AgentTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  parentTaskId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  subtasks: z.array(z.string()).optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  progress: TaskProgressSchema.optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
  metadata: z
    .object({
      filesPaths: z.array(z.string()).optional(),
      commandsRun: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Agent state schema
 */
export const AgentStateSchema = z.object({
  phase: z.nativeEnum(AgentPhase),
  currentTask: AgentTaskSchema.optional(),
  taskQueue: z.array(AgentTaskSchema),
  completedTasks: z.array(AgentTaskSchema),
  thinking: z.string().optional(),
  isProcessing: z.boolean(),
  lastActivity: z.number(),
  error: z.string().optional(),
  statistics: z
    .object({
      totalTasks: z.number(),
      completedTasks: z.number(),
      failedTasks: z.number(),
      totalToolCalls: z.number(),
      successfulToolCalls: z.number(),
      failedToolCalls: z.number(),
      totalDuration: z.number(),
      averageTaskDuration: z.number(),
    })
    .optional(),
});

/**
 * Agent configuration schema
 */
export const AgentConfigSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
  systemPrompt: z.string().optional(),
  maxIterations: z.number().optional(),
  timeout: z.number().optional(),
  enabledTools: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
  verboseLogging: z.boolean().optional(),
});

/**
 * Agent capability schema
 */
export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  tools: z.array(z.string()),
  permissions: z.array(z.string()).optional(),
});

/**
 * Agent metrics schema
 */
export const AgentMetricsSchema = z.object({
  timestamp: z.number(),
  phase: z.nativeEnum(AgentPhase),
  activeTasks: z.number(),
  completedTasks: z.number(),
  failedTasks: z.number(),
  toolCallsPerMinute: z.number().optional(),
  tokensUsed: z.number().optional(),
  cost: z.number().optional(),
  memoryUsage: z.number().optional(),
  cpuUsage: z.number().optional(),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type TaskProgress = z.infer<typeof TaskProgressSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

/**
 * Helper functions
 */
export function createAgentTask(
  id: string,
  title: string,
  description?: string,
  priority?: 'low' | 'medium' | 'high' | 'critical'
): AgentTask {
  return {
    id,
    title,
    description,
    status: TaskStatus.PENDING,
    priority,
    createdAt: Date.now(),
  };
}

export function createToolCall(
  id: string,
  name: string,
  parameters: Record<string, unknown>
): ToolCall {
  return {
    id,
    name,
    status: ToolCallStatus.PENDING,
    parameters,
    startTime: Date.now(),
  };
}

export function createInitialAgentState(): AgentState {
  return {
    phase: AgentPhase.IDLE,
    taskQueue: [],
    completedTasks: [],
    isProcessing: false,
    lastActivity: Date.now(),
  };
}

export function getTaskDuration(task: AgentTask): number | undefined {
  if (task.startedAt === undefined || task.completedAt === undefined) return undefined;
  return task.completedAt - task.startedAt;
}

export function getToolCallDuration(toolCall: ToolCall): number | undefined {
  if (toolCall.endTime === undefined) return undefined;
  return toolCall.endTime - toolCall.startTime;
}

export function getPhaseColor(phase: AgentPhase): string {
  switch (phase) {
    case AgentPhase.IDLE:
      return 'gray';
    case AgentPhase.PLANNING:
      return 'blue';
    case AgentPhase.IMPLEMENTING:
      return 'purple';
    case AgentPhase.REVIEWING:
      return 'cyan';
    case AgentPhase.TESTING:
      return 'yellow';
    case AgentPhase.DEBUGGING:
      return 'orange';
    case AgentPhase.DOCUMENTING:
      return 'green';
    case AgentPhase.WAITING:
      return 'gray';
    case AgentPhase.ERROR:
      return 'red';
    default:
      return 'gray';
  }
}

export function getTaskStatusColor(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.PENDING:
      return 'gray';
    case TaskStatus.IN_PROGRESS:
      return 'blue';
    case TaskStatus.COMPLETED:
      return 'green';
    case TaskStatus.FAILED:
      return 'red';
    case TaskStatus.BLOCKED:
      return 'orange';
    case TaskStatus.CANCELLED:
      return 'gray';
    default:
      return 'gray';
  }
}

export function isTaskComplete(task: AgentTask): boolean {
  return (
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.FAILED ||
    task.status === TaskStatus.CANCELLED
  );
}

export function canTaskStart(task: AgentTask, completedTaskIds: Set<string>): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every((depId) => completedTaskIds.has(depId));
}

export function getTaskHierarchy(
  tasks: AgentTask[]
): Map<string, { task: AgentTask; children: AgentTask[] }> {
  const hierarchy = new Map<string, { task: AgentTask; children: AgentTask[] }>();

  // Initialize map with all tasks
  for (const task of tasks) {
    hierarchy.set(task.id, { task, children: [] });
  }

  // Build parent-child relationships
  for (const task of tasks) {
    if (task.parentTaskId) {
      const parent = hierarchy.get(task.parentTaskId);
      if (parent) {
        parent.children.push(task);
      }
    }
  }

  return hierarchy;
}

export function getRootTasks(tasks: AgentTask[]): AgentTask[] {
  return tasks.filter((task) => !task.parentTaskId);
}

export function getTaskProgress(task: AgentTask): TaskProgress | undefined {
  if (task.progress) return task.progress;

  if (task.subtasks && task.subtasks.length > 0) {
    // Calculate progress based on subtasks
    // This would require access to subtask data
    return undefined;
  }

  if (task.status === TaskStatus.COMPLETED) {
    return {
      current: 100,
      total: 100,
      percentage: 100,
    };
  }

  return undefined;
}

export function formatTaskDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(milliseconds)}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${String(minutes)}m ${seconds}s`;
  }
}

export function calculateAgentStatistics(state: AgentState): AgentState['statistics'] {
  const allTasks = [...state.taskQueue, ...state.completedTasks];
  if (state.currentTask) {
    allTasks.push(state.currentTask);
  }

  const completedTasks = allTasks.filter((t) => t.status === TaskStatus.COMPLETED);
  const failedTasks = allTasks.filter((t) => t.status === TaskStatus.FAILED);

  const allToolCalls = allTasks.flatMap((t) => t.toolCalls ?? []);
  const successfulToolCalls = allToolCalls.filter(
    (tc) => tc.status === ToolCallStatus.COMPLETED
  );
  const failedToolCalls = allToolCalls.filter((tc) => tc.status === ToolCallStatus.FAILED);

  const taskDurations = completedTasks
    .map((t) => getTaskDuration(t))
    .filter((d): d is number => d !== undefined);

  const totalDuration = taskDurations.reduce((sum, d) => sum + d, 0);
  const averageTaskDuration = taskDurations.length > 0 ? totalDuration / taskDurations.length : 0;

  return {
    totalTasks: allTasks.length,
    completedTasks: completedTasks.length,
    failedTasks: failedTasks.length,
    totalToolCalls: allToolCalls.length,
    successfulToolCalls: successfulToolCalls.length,
    failedToolCalls: failedToolCalls.length,
    totalDuration,
    averageTaskDuration,
  };
}
