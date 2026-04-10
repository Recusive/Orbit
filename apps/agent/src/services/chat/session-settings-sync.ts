import type { EffortLevel, Model, ThinkingMode, WebviewMessage } from '@/types/protocol';

import { isAdaptiveThinkingModel } from '@/stores/agent/tool-store';

interface SessionSettingsSnapshot {
  effortLevel: EffortLevel;
  model: Model;
  thinkingMode: ThinkingMode;
}

type SessionSettingsMessage = Extract<
  WebviewMessage,
  { type: 'thinking:set' | 'effort:set' | 'model:set' }
>;

const syncedSettingsBySessionId = new Map<string, SessionSettingsSnapshot>();

function buildThinkingModeMessage(
  sessionId: string,
  mode: ThinkingMode
): Extract<WebviewMessage, { type: 'thinking:set' }> {
  return {
    type: 'thinking:set',
    uuid: crypto.randomUUID(),
    session_id: sessionId,
    mode,
  };
}

function buildEffortLevelMessage(
  sessionId: string,
  effort: EffortLevel
): Extract<WebviewMessage, { type: 'effort:set' }> {
  return {
    type: 'effort:set',
    uuid: crypto.randomUUID(),
    session_id: sessionId,
    effort,
  };
}

function buildModelMessage(
  sessionId: string,
  model: Model
): Extract<WebviewMessage, { type: 'model:set' }> {
  return {
    type: 'model:set',
    uuid: crypto.randomUUID(),
    session_id: sessionId,
    model,
  };
}

export function markSessionSettingsSynced(
  sessionId: string,
  settings: SessionSettingsSnapshot
): void {
  syncedSettingsBySessionId.set(sessionId, settings);
}

export function syncSessionSettings(
  postMessage: (message: SessionSettingsMessage) => void,
  sessionId: string,
  settings: SessionSettingsSnapshot
): void {
  const previous = syncedSettingsBySessionId.get(sessionId);
  const isAdaptiveModel = isAdaptiveThinkingModel(settings.model);
  const adaptiveModelChanged =
    previous !== undefined && isAdaptiveThinkingModel(previous.model) !== isAdaptiveModel;

  if (
    !isAdaptiveModel &&
    (previous === undefined ||
      adaptiveModelChanged ||
      previous.thinkingMode !== settings.thinkingMode)
  ) {
    postMessage(buildThinkingModeMessage(sessionId, settings.thinkingMode));
  }

  if (previous?.model !== settings.model) {
    postMessage(buildModelMessage(sessionId, settings.model));
  }

  if (
    isAdaptiveModel &&
    (previous === undefined ||
      adaptiveModelChanged ||
      previous.effortLevel !== settings.effortLevel)
  ) {
    postMessage(buildEffortLevelMessage(sessionId, settings.effortLevel));
  }

  markSessionSettingsSynced(sessionId, settings);
}

export function resetSessionSettingsSyncState(): void {
  syncedSettingsBySessionId.clear();
}
