import { z } from 'zod';

/**
 * Command scope for slash commands and subagents
 */
export const CommandScopeSchema = z.enum(['builtin', 'default', 'project', 'personal']);
export type CommandScope = z.infer<typeof CommandScopeSchema>;

/**
 * Permission decision
 */
export const DecisionSchema = z.enum(['approve', 'deny']);
export type Decision = z.infer<typeof DecisionSchema>;

/**
 * Agent phase during task execution
 */
export const AgentPhaseSchema = z.enum([
  'idle',
  'planning',
  'implementing',
  'reviewing',
  'testing',
  'debugging',
  'documenting',
  'waiting',
  'error',
]);
export type AgentPhase = z.infer<typeof AgentPhaseSchema>;

/**
 * Task status
 */
export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'blocked',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Tool call status
 */
export const ToolCallStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;
