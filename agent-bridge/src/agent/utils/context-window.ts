const DEFAULT_CONTEXT_WINDOW = 200_000;
const ONE_MILLION_CONTEXT_WINDOW = 1_000_000;
const CONTEXT_1M_BETA = 'context-1m-2025-08-07';

interface ModelUsageEntry {
  contextWindow?: number | undefined;
}

type ModelUsage = Record<string, ModelUsageEntry>;

function isEligibleForOneMillionContext(model: string): boolean {
  return model.includes('claude-sonnet-4') || model.includes('opus-4-6');
}

function getLookupTokens(model: string): string[] {
  switch (model) {
    case 'haiku':
      return ['haiku', 'claude-haiku'];
    case 'claude-sonnet-4-6':
      return ['claude-sonnet-4-6', 'claude-sonnet-4', 'sonnet'];
    case 'claude-opus-4-6':
      return ['claude-opus-4-6', 'claude-opus-4', 'opus-4-6', 'opus'];
    default:
      return [model];
  }
}

function isPositiveContextWindow(value: number | undefined): value is number {
  return typeof value === 'number' && value > 0;
}

export function resolveContextWindowFromInit(
  model: string | undefined,
  betas: string[] | undefined
): number {
  if (!model) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  const normalizedModel = model.toLowerCase();
  if (normalizedModel.includes('[1m]')) {
    return ONE_MILLION_CONTEXT_WINDOW;
  }

  if (betas?.includes(CONTEXT_1M_BETA) && isEligibleForOneMillionContext(normalizedModel)) {
    return ONE_MILLION_CONTEXT_WINDOW;
  }

  return DEFAULT_CONTEXT_WINDOW;
}

export function resolveContextWindowFromModelUsage(
  modelUsage: ModelUsage | undefined,
  model: string | undefined
): number | undefined {
  if (!modelUsage || !model) {
    return undefined;
  }

  const entries = Object.entries(modelUsage).map(([key, usage]) => ({
    key: key.toLowerCase(),
    contextWindow: usage.contextWindow,
  }));
  const normalizedModel = model.toLowerCase();

  const exactMatch = entries.find(
    (entry) => entry.key === normalizedModel && isPositiveContextWindow(entry.contextWindow)
  );
  if (exactMatch) {
    return exactMatch.contextWindow;
  }

  for (const token of getLookupTokens(normalizedModel)) {
    const match = entries.find(
      (entry) =>
        isPositiveContextWindow(entry.contextWindow) &&
        (entry.key === token || entry.key.includes(token) || token.includes(entry.key))
    );
    if (match) {
      return match.contextWindow;
    }
  }

  return undefined;
}
