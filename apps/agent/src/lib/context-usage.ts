import type { UsageData } from '@/stores/agent/tool-store';

interface TurnUsageLike {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number | undefined;
  cacheCreationInputTokens?: number | undefined;
}

export interface SessionUsageLike extends TurnUsageLike {
  totalCostUsd?: number | undefined;
  lastTurnUsage?: TurnUsageLike | undefined;
}

export interface UsageCarrier {
  id: string;
  usage?: unknown;
}

export function toContextUsage(sessionUsage: SessionUsageLike): UsageData {
  if (sessionUsage.lastTurnUsage) {
    // Per-turn usage available — use it for context display (actual context occupancy)
    return {
      inputTokens: sessionUsage.lastTurnUsage.inputTokens,
      outputTokens: sessionUsage.lastTurnUsage.outputTokens,
      cacheReadInputTokens: sessionUsage.lastTurnUsage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: sessionUsage.lastTurnUsage.cacheCreationInputTokens ?? 0,
      totalCostUsd: sessionUsage.totalCostUsd ?? 0,
    };
  }

  // No per-turn data (old session before this feature).
  // Cumulative cache_read_input_tokens grows to millions (counted every turn) — unusable.
  // Use input + cache_creation only (stable approximation of context size).
  // This won't be exact but won't show 400% either. First new turn fixes it.
  return {
    inputTokens: sessionUsage.inputTokens,
    outputTokens: sessionUsage.outputTokens,
    cacheReadInputTokens: 0, // Exclude cumulative cache_read — it's the one that inflates to millions
    cacheCreationInputTokens: sessionUsage.cacheCreationInputTokens ?? 0,
    totalCostUsd: sessionUsage.totalCostUsd ?? 0,
  };
}

export function collectUsageMessageIds(messages: readonly UsageCarrier[]): string[] {
  return messages.flatMap((message) => (message.usage !== undefined ? [message.id] : []));
}
