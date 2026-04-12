import { createLogger } from '@orbit/common/lib';

import {
  clearShownSessionTraceRequest,
  endSwitchTimeline,
  getSessionSwitchGeometrySnapshot,
  markSwitchTimeline,
  recordSessionSwitchTrace,
  setShownSessionTraceRequest,
  startPostCommitDriftMonitor,
} from './session-switch-trace';

import type { SessionSwitchAbortReason } from './session-switch-trace';
import type {
  PendingCreateState,
  PendingMessage,
  ReadyInstancePhase,
  ReadyInstanceRecord,
  SessionSwitchStatus,
} from '@/stores/chat';

import { findChatScroller } from '@/lib/chat/chat-selectors';
import { markOperation } from '@/lib/perf/frame-monitor';
import {
  getConversationGeneration,
  getWorkspaceEpoch,
} from '@/lib/query/conversation-detail-cache';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import {
  buildSessionReadinessSignature,
  buildSessionSettledSignature,
  useSessionSwitchStore,
} from '@/stores/chat/session-switch-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('SessionSwitchCoordinator');
const READY_BOTTOM_TOLERANCE_PX = 4;
const VISIBLE_VERIFICATION_SAFETY_TIMEOUT_MS = 3000;

let visibleVerificationSafetyTimer: number | null = null;

function clearVisibleVerificationSafetyTimer(): void {
  if (visibleVerificationSafetyTimer !== null) {
    window.clearTimeout(visibleVerificationSafetyTimer);
    visibleVerificationSafetyTimer = null;
  }
}

export interface SessionVerificationResult {
  sessionId: string;
  requestId: number;
  signature: string;
  settledSignature: string;
  tailProofVersion: number;
  instanceGeneration: number;
  phase: ReadyInstancePhase;
  result: 'hidden-ready' | 'visible-ready' | 'timeout' | 'aborted';
}

export function beginSessionSwitch(targetSessionId: string, title: string | null): number {
  const endCoordinatorBegin = markOperation('coordinator-begin');
  const switchState = useSessionSwitchStore.getState();
  if (switchState.pending !== null) {
    abortSessionSwitch(switchState.requestId, 'superseded_by_new_request');
  }
  useSessionSwitchStore.getState().clearPreMount();

  const shownSessionId = useChatStore.getState().activeSessionId;
  const conversationGeneration = getConversationGeneration(targetSessionId);
  const workspaceEpoch = getWorkspaceEpoch();
  const requestId = useSessionSwitchStore
    .getState()
    .beginSessionSwitch(
      targetSessionId,
      title,
      shownSessionId,
      conversationGeneration,
      workspaceEpoch
    );

  useUIStore.getState().setLoadingConversation(true);
  useUIStore.getState().setConversationTransitioning(true);

  recordSessionSwitchTrace({
    event: 'begin_switch',
    requestId,
    sessionId: targetSessionId,
    data: {
      title,
      shownSessionId,
    },
  });

  endCoordinatorBegin();
  return requestId;
}

export function promotePendingToVisibleVerification(
  requestId: number,
  sessionId: string,
  title: string | null
): boolean {
  const endPromote = markOperation('coordinator-promote');
  const switchState = useSessionSwitchStore.getState();
  if (switchState.pending?.sessionId !== sessionId || switchState.requestId !== requestId) {
    endPromote();
    return false;
  }

  useSessionSwitchStore.getState().setPendingConversationTitle(title, requestId);
  const promoted = useSessionSwitchStore.getState().promotePendingToVisibleVerification(requestId);
  if (promoted) {
    markSwitchTimeline('promote', '→ visible');
    recordSessionSwitchTrace({
      event: 'pending_phase_transition',
      requestId,
      sessionId,
      data: {
        nextPhase: 'visible-verifying',
        title,
      },
    });

    clearVisibleVerificationSafetyTimer();
    visibleVerificationSafetyTimer = window.setTimeout(() => {
      visibleVerificationSafetyTimer = null;
      const current = useSessionSwitchStore.getState();
      if (current.requestId === requestId && current.pending?.sessionId === sessionId) {
        logger.warn('Visible verification safety timeout — forcing commit', {
          requestId,
          sessionId,
        });
        commitSessionReveal(requestId, sessionId, title);
      }
    }, VISIBLE_VERIFICATION_SAFETY_TIMEOUT_MS);
  }
  endPromote();
  return promoted;
}

export function setPendingLoadStrategy(
  strategy: 'none' | 'query' | 'slow',
  requestId?: number
): void {
  useSessionSwitchStore.getState().setPendingLoadStrategy(strategy, requestId);
}

export function setPendingConversationTitle(title: string | null, requestId?: number): void {
  useSessionSwitchStore.getState().setPendingConversationTitle(title, requestId);
}

export function retargetPendingSession(
  currentSessionId: string,
  nextSessionId: string,
  title?: string | null,
  requestId?: number
): boolean {
  const conversationGeneration = getConversationGeneration(nextSessionId);
  const workspaceEpoch = getWorkspaceEpoch();
  const retargeted = useSessionSwitchStore
    .getState()
    .retargetPendingSession(
      currentSessionId,
      nextSessionId,
      conversationGeneration,
      workspaceEpoch,
      title,
      requestId
    );
  if (!retargeted) {
    return false;
  }

  useSessionSwitchStore.getState().clearReadyInstances([currentSessionId, nextSessionId]);
  markSwitchTimeline('retarget', `${currentSessionId.slice(-6)} → ${nextSessionId.slice(-6)}`);
  return true;
}

export function abortSessionSwitch(
  requestId: number,
  reason: SessionSwitchAbortReason = 'unexpected_pending_clear'
): void {
  const switchState = useSessionSwitchStore.getState();
  if (switchState.requestId !== requestId || switchState.pending === null) {
    return;
  }

  const endAbort = markOperation('coordinator-abort');
  clearVisibleVerificationSafetyTimer();

  const pendingSessionId = switchState.pending.sessionId;
  const pendingLoadStrategy = switchState.pending.loadStrategy;
  useSessionSwitchStore.getState().clearPendingSwitch(requestId);

  useMessageBufferStore.getState().clearLoadPending(pendingSessionId);
  if (pendingLoadStrategy === 'slow') {
    useChatStore.getState().clearSessionLoaded(pendingSessionId);
  }
  useSessionSwitchStore.getState().resetInitialRestorePending(requestId);

  useUIStore.getState().setLoadingConversation(false);
  useUIStore.getState().setConversationTransitioning(false);

  endSwitchTimeline('aborted', reason);
  recordSessionSwitchTrace({
    event: 'abort_switch',
    requestId,
    sessionId: pendingSessionId,
    abortReason: reason,
  });
  endAbort();
}

export function commitSessionReveal(
  requestId: number,
  targetSessionId: string,
  title: string | null
): boolean {
  clearVisibleVerificationSafetyTimer();

  const switchState = useSessionSwitchStore.getState();
  if (switchState.requestId !== requestId || switchState.pending?.sessionId !== targetSessionId) {
    return false;
  }

  if (switchState.pending.workspaceEpoch !== getWorkspaceEpoch()) {
    abortSessionSwitch(requestId, 'stale_workspace_epoch');
    return false;
  }

  if (switchState.pending.conversationGeneration !== getConversationGeneration(targetSessionId)) {
    abortSessionSwitch(requestId, 'stale_conversation_generation');
    return false;
  }

  markSwitchTimeline('commit', '');
  recordSessionSwitchTrace({
    event: 'commit_reveal_pre',
    requestId,
    sessionId: targetSessionId,
    geometry: getSessionSwitchGeometrySnapshot(targetSessionId),
  });
  const endCommitMark = markOperation('store-commit');
  useChatStore.getState().setActiveSession(targetSessionId);
  useFileStore.getState().switchSession(targetSessionId);
  useToolStore.getState().switchSession(targetSessionId);
  useUIStore.getState().setActiveConversation(targetSessionId, title);
  useUIStore.getState().setLoadingConversation(false);
  useUIStore.getState().setConversationTransitioning(false);
  useMessageBufferStore.getState().clearLoadPending(targetSessionId);
  useSessionSwitchStore.getState().clearPendingSwitch(requestId);
  endCommitMark();
  markSwitchTimeline('commit:stores', 'sync');

  setShownSessionTraceRequest(targetSessionId, requestId);
  recordSessionSwitchTrace({
    event: 'commit_reveal_post',
    requestId,
    sessionId: targetSessionId,
    geometry: getSessionSwitchGeometrySnapshot(targetSessionId),
  });
  startPostCommitDriftMonitor(requestId, targetSessionId);
  endSwitchTimeline('complete');

  return true;
}

export function isPendingSessionRequest(sessionId: string, requestId?: number): boolean {
  const switchState = useSessionSwitchStore.getState();
  if (requestId !== undefined && requestId !== switchState.requestId) {
    return false;
  }
  return switchState.pending?.sessionId === sessionId;
}

export function getPendingSessionTitle(sessionId: string): string | null {
  const switchState = useSessionSwitchStore.getState();
  if (switchState.pending?.sessionId !== sessionId) {
    return null;
  }
  return switchState.pending.title;
}

export function getPendingSessionPhase(): SessionSwitchStatus {
  return useSessionSwitchStore.getState().status;
}

export function recordReadyInstance(result: SessionVerificationResult): void {
  if (result.result !== 'hidden-ready' && result.result !== 'visible-ready') {
    return;
  }

  const record: ReadyInstanceRecord = {
    phase: result.phase,
    requestId: result.requestId,
    signature: result.signature,
    settledSignature: result.settledSignature,
    tailProofVersion: result.tailProofVersion,
    instanceGeneration: result.instanceGeneration,
  };
  useSessionSwitchStore.getState().setReadyInstance(result.sessionId, record);
}

export function clearReadyInstance(sessionId: string, instanceGeneration?: number): void {
  useSessionSwitchStore.getState().clearReadyInstance(sessionId, instanceGeneration);
}

export function clearReadyInstances(sessionIds: string[]): void {
  useSessionSwitchStore.getState().clearReadyInstances(sessionIds);
}

export function clearAllReadyInstances(): void {
  clearReadyInstances(Object.keys(useSessionSwitchStore.getState().readyInstances));
  const shownSessionId = useChatStore.getState().activeSessionId;
  if (shownSessionId) {
    clearShownSessionTraceRequest(shownSessionId);
  }
}

function getSessionInstanceElement(sessionId: string): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const escapedSessionId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sessionId)
      : sessionId.replaceAll('"', '\\"');

  return document.querySelector<HTMLElement>(`[data-session-instance="${escapedSessionId}"]`);
}

function isLiveReadyInstance(sessionId: string, readyRecord: ReadyInstanceRecord): boolean {
  const instance = getSessionInstanceElement(sessionId);
  if (!instance) {
    return false;
  }

  const instanceGeneration = Number(instance.dataset['instanceGeneration'] ?? Number.NaN);
  if (Number.isNaN(instanceGeneration) || instanceGeneration !== readyRecord.instanceGeneration) {
    return false;
  }

  if (instance.dataset['instanceVisible'] !== 'true') {
    return false;
  }

  const liveTailProofVersion = Number(instance.dataset['tailProofVersion'] ?? Number.NaN);
  if (Number.isNaN(liveTailProofVersion) || liveTailProofVersion !== readyRecord.tailProofVersion) {
    return false;
  }

  const scroller = findChatScroller(instance);
  if (!scroller) {
    return false;
  }

  const bottomTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return (
    bottomTop <= READY_BOTTOM_TOLERANCE_PX ||
    scroller.scrollTop >= bottomTop - READY_BOTTOM_TOLERANCE_PX
  );
}

export function hasCurrentReadyInstance(sessionId: string, requestId?: number): boolean {
  const session = useChatStore.getState().sessions[sessionId];
  const signature = buildSessionReadinessSignature(session);
  const settledSignature = buildSessionSettledSignature(session);
  if (!signature || !settledSignature || (session?.layoutPendingCount ?? 0) !== 0) {
    return false;
  }

  const switchState = useSessionSwitchStore.getState();
  const readyRecord = switchState.readyInstances[sessionId];
  if (
    readyRecord?.phase !== 'visible' ||
    readyRecord.signature !== signature ||
    readyRecord.settledSignature !== settledSignature
  ) {
    return false;
  }

  if (!isLiveReadyInstance(sessionId, readyRecord)) {
    clearReadyInstance(sessionId, readyRecord.instanceGeneration);
    recordSessionSwitchTrace({
      event: 'ready_instance_rejected',
      requestId: requestId ?? readyRecord.requestId,
      sessionId,
      abortReason: 'invalid_ready_instance',
      data: {
        instanceGeneration: readyRecord.instanceGeneration,
      },
    });
    return false;
  }

  if (requestId === undefined) {
    return true;
  }

  return useSessionSwitchStore
    .getState()
    .adoptVisibleReadyInstance(
      sessionId,
      signature,
      settledSignature,
      readyRecord.tailProofVersion,
      requestId
    );
}

export function beginPendingCreate(
  createRequestId: string,
  title: string,
  payload: PendingMessage | null
): PendingCreateState {
  const switchState = useSessionSwitchStore.getState();
  if (switchState.pending !== null) {
    abortSessionSwitch(switchState.requestId, 'superseded_by_new_request');
  }

  const currentCreate = switchState.pendingCreate;
  if (currentCreate && currentCreate.createRequestId !== createRequestId) {
    useSessionSwitchStore.getState().abortPendingCreate(currentCreate.createRequestId);
  }

  const pendingCreate = useSessionSwitchStore
    .getState()
    .beginPendingCreate(createRequestId, title, payload);

  logger.debug('Begin pending create', {
    createRequestId,
    title,
    hasPayload: payload !== null,
  });

  return pendingCreate;
}

export function resolvePendingCreateDraft(
  createRequestId: string,
  draftSessionId: string,
  title: string
): PendingCreateState | null {
  const pendingCreate = useSessionSwitchStore
    .getState()
    .resolvePendingCreateDraft(createRequestId, draftSessionId, title);
  if (pendingCreate) {
    logger.debug('Resolve pending create draft', {
      createRequestId,
      draftSessionId,
    });
  }
  return pendingCreate;
}

export function markPendingCreateAwaitingSystemInit(
  createRequestId: string
): PendingCreateState | null {
  const pendingCreate = useSessionSwitchStore
    .getState()
    .markPendingCreateAwaitingSystemInit(createRequestId);
  if (pendingCreate) {
    logger.debug('Mark pending create awaiting system:init', {
      createRequestId,
      effectiveSessionId: pendingCreate.effectiveSessionId,
    });
  }
  return pendingCreate;
}

export function remapPendingCreateSession(
  currentSessionId: string,
  nextSessionId: string
): PendingCreateState | null {
  const pendingCreate = useSessionSwitchStore
    .getState()
    .remapPendingCreateSession(currentSessionId, nextSessionId);
  if (pendingCreate) {
    clearReadyInstances([currentSessionId, nextSessionId]);
    logger.debug('Remap pending create session', {
      currentSessionId,
      nextSessionId,
      createRequestId: pendingCreate.createRequestId,
    });
  }
  return pendingCreate;
}

export function finishPendingCreate(createRequestId: string): void {
  useSessionSwitchStore.getState().finishPendingCreate(createRequestId);
}

export function abortPendingCreate(createRequestId?: string): void {
  useSessionSwitchStore.getState().abortPendingCreate(createRequestId);
}

export function getPendingCreate(): PendingCreateState | null {
  return useSessionSwitchStore.getState().pendingCreate;
}

export function getPendingCreateByRequestId(createRequestId: string): PendingCreateState | null {
  return useSessionSwitchStore.getState().getCreateRecord(createRequestId);
}

export function getPendingCreateBySessionId(sessionId: string): PendingCreateState | null {
  const createRequestId = useSessionSwitchStore.getState().getCreateRequestIdBySessionId(sessionId);
  if (!createRequestId) {
    return null;
  }
  return useSessionSwitchStore.getState().getCreateRecord(createRequestId);
}

export function getCreateRequestIdBySessionId(sessionId: string): string | null {
  return useSessionSwitchStore.getState().getCreateRequestIdBySessionId(sessionId);
}
