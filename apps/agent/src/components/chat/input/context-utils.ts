import type { CSSProperties } from 'react';

export interface ContextTokenUsage {
  promptTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export function formatTokens(count: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
}

export function formatPercentage(percentage: number): string {
  const rounded = Math.round(percentage * 10) / 10;
  const minimumFractionDigits = Number.isInteger(rounded) ? 0 : 1;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits: 1,
  }).format(rounded);
}

export function getContextProgressStyle(percentage: number): CSSProperties {
  if (percentage >= 80) {
    return {
      background: 'var(--gradient-error)',
      boxShadow: 'var(--gradient-error-glow)',
    };
  }
  if (percentage >= 50) {
    return {
      background: 'var(--gradient-warning)',
      boxShadow: 'var(--gradient-warning-glow)',
    };
  }
  return {
    background: 'var(--gradient-success)',
    boxShadow: 'var(--gradient-success-glow)',
  };
}
