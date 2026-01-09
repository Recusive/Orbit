import type { ThinkingModeInfo } from './types';
import type { InputMode, ThinkingMode } from '@/types/protocol';

export const INPUT_MODE_LABELS: Record<InputMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

export const THINKING_MODE_INFO: Record<ThinkingMode, ThinkingModeInfo> = {
  off: { level: 'Off', tokens: '0' },
  think: { level: 'Think', tokens: '4k' },
  hard: { level: 'Hard', tokens: '10k' },
  ultra: { level: 'Ultra', tokens: '32k' },
};

export const THINKING_MODE_DOTS: Record<ThinkingMode, number> = {
  off: 0,
  think: 1,
  hard: 2,
  ultra: 3,
};

// Thinking mode cycle order
export const THINKING_MODES: readonly ThinkingMode[] = ['off', 'think', 'hard', 'ultra'] as const;
