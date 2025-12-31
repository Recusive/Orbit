import { z } from 'zod';

/**
 * AI Model selection
 * - haiku: Fast, efficient for simple tasks
 * - sonnet: Balanced performance and capability
 * - opus: Most capable, best for complex tasks
 */
export const ModelSchema = z.enum(['haiku', 'sonnet', 'opus']);
export type Model = z.infer<typeof ModelSchema>;

/**
 * Thinking mode for extended reasoning
 * - off: No extended thinking
 * - think: 4k token budget
 * - hard: 10k token budget
 * - ultra: 32k token budget
 */
export const ThinkingModeSchema = z.enum(['off', 'think', 'hard', 'ultra']);
export type ThinkingMode = z.infer<typeof ThinkingModeSchema>;

/**
 * Input mode for agent behavior
 * - default: Ask for permission before actions
 * - accept: Auto-approve actions
 * - plan: Read-only planning mode
 */
export const InputModeSchema = z.enum(['default', 'accept', 'plan']);
export type InputMode = z.infer<typeof InputModeSchema>;
