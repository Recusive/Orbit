import { z } from 'zod';

/**
 * AI Model selection (shorthand names resolved by Claude Agent SDK)
 * - haiku: Haiku 4.5 — Fast, efficient for simple tasks
 * - sonnet: Sonnet 4.5 — Balanced performance and capability
 * - opus: Opus 4.5 — Capable, complex tasks
 * - claude-opus-4-6: Opus 4.6 — Most capable, latest flagship model
 */
export const ModelSchema = z.enum(['haiku', 'sonnet', 'opus', 'claude-opus-4-6']);
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
