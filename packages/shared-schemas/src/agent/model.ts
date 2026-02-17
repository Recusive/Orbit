import { z } from 'zod';

/**
 * AI Model selection (shorthand names resolved by Claude Agent SDK)
 * - haiku: Haiku 4.5 — Fast, efficient for simple tasks (extended thinking)
 * - claude-sonnet-4-6: Sonnet 4.6 — Balanced performance and capability (adaptive thinking)
 * - claude-opus-4-6: Opus 4.6 — Most capable, latest flagship model (adaptive thinking)
 */
export const ModelSchema = z.enum(['haiku', 'claude-sonnet-4-6', 'claude-opus-4-6']);
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
 * Effort level for Claude Opus 4.6 adaptive thinking
 * Controls how much reasoning effort the model applies.
 * - low: Fast & efficient (minimal thinking)
 * - medium: Balanced (moderate thinking)
 * - high: Deep reasoning (default for Opus 4.6)
 * - max: Maximum capability (extensive thinking)
 */
export const EffortLevelSchema = z.enum(['low', 'medium', 'high', 'max']);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

/**
 * Input mode for agent behavior
 * - default: Ask for permission before actions
 * - accept: Auto-approve actions
 * - plan: Read-only planning mode
 */
export const InputModeSchema = z.enum(['default', 'accept', 'plan']);
export type InputMode = z.infer<typeof InputModeSchema>;
