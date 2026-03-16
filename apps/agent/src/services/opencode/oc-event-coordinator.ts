import { createLogger } from '@orbit/common/lib';

import { ocSessionService } from './oc-session-service';

import type { RafBatchHandler } from '@/lib/utils/event-batcher';
import type { OcDeltaItem } from '@/stores/opencode/oc-message-store';
import type { OcGlobalEvent } from '@/types/opencode';

import { rafBatch } from '@/lib/utils/event-batcher';
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('OcEventCoordinator');

// ---------------------------------------------------------------------------
// Session-scoped RAF delta batchers
// ---------------------------------------------------------------------------

const deltaBatchers = new Map<string, RafBatchHandler<OcDeltaItem>>();

function getDeltaBatcher(sessionId: string): RafBatchHandler<OcDeltaItem> {
  const existing = deltaBatchers.get(sessionId);
  if (existing) {
    return existing;
  }

  const created = rafBatch<OcDeltaItem>((items: OcDeltaItem[]): void => {
    useOcMessageStore.getState().appendDeltaBatch(items);
  });
  deltaBatchers.set(sessionId, created);
  return created;
}

/** Flush and destroy a single session's batcher. Used on session.idle/deleted/error. */
function cancelSessionDeltas(sessionId: string, flush = false): void {
  deltaBatchers.get(sessionId)?.cancel(flush);
  deltaBatchers.delete(sessionId);
}

/**
 * Cancel all batchers without flushing — used during full OpenCode teardown.
 * MUST be called BEFORE clearAll() to prevent zombie session recreation.
 */
export function cancelAllDeltaBatchers(): void {
  for (const batcher of deltaBatchers.values()) {
    batcher.cancel(false);
  }
  deltaBatchers.clear();
}

function isActiveDirectory(directory: string): boolean {
  const activeDirectory = useUIStore.getState().workspacePath;
  if (!activeDirectory) {
    return false;
  }
  return directory === activeDirectory;
}

export const ocEventCoordinator = {
  /**
   * [warning] TESTED: OpenCode title-loading and compaction settlement in this
   *     coordinator are covered by integration tests.
   *     If you modify this, run:
   *     bun run test -- apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts
   *     Test files: apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts, apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts
   */
  handleGlobalEvent(event: OcGlobalEvent): void {
    if (!isActiveDirectory(event.directory)) {
      const eventType = (event.payload as { type: string }).type;
      if (eventType !== 'server.heartbeat') {
        logger.debug('Event filtered: directory mismatch', {
          eventType,
          eventDirectory: event.directory,
          activeDirectory: useUIStore.getState().workspacePath,
        });
      }
      return;
    }

    const payload = event.payload;
    switch (payload.type) {
      case 'session.created':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.info.id,
        });
        useOcSessionStore.getState().addSession(payload.properties.info);
        break;
      case 'session.updated':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.info.id,
        });
        useOcSessionStore.getState().updateSession(payload.properties.info);
        if (!isDefaultOcTitle(payload.properties.info.title)) {
          useUIStore.getState().setTitleLoading(payload.properties.info.id, false);
        }
        break;
      case 'session.deleted':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.info.id,
        });
        cancelSessionDeltas(payload.properties.info.id, true);
        useOcSessionStore.getState().removeSession(payload.properties.info.id);
        useOcMessageStore.getState().clearSession(payload.properties.info.id);
        useUIStore.getState().setTitleLoading(payload.properties.info.id, false);
        useOcSessionStore.getState().clearPendingSend(payload.properties.info.id);
        useChatStore.getState().settleCompaction(payload.properties.info.id);
        break;
      case 'session.status':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          statusType: payload.properties.status.type,
        });
        useOcSessionStore
          .getState()
          .setSessionStatus(payload.properties.sessionID, payload.properties.status);
        break;
      case 'session.idle':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
        });
        cancelSessionDeltas(payload.properties.sessionID, true);
        useOcSessionStore.getState().setSessionStatus(payload.properties.sessionID, {
          type: 'idle',
        });
        break;
      case 'session.error':
        if (payload.properties.sessionID && payload.properties.error) {
          cancelSessionDeltas(payload.properties.sessionID, true);
          logger.warn('Session error received', { sessionId: payload.properties.sessionID });
          const errorMessage = JSON.stringify(payload.properties.error.data);
          useOcSessionStore.getState().setSessionError(payload.properties.sessionID, errorMessage);
          useUIStore.getState().setTitleLoading(payload.properties.sessionID, false);
          useOcSessionStore.getState().clearPendingSend(payload.properties.sessionID);
          useChatStore.getState().settleCompaction(payload.properties.sessionID);
        }
        break;
      case 'message.updated':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.info.sessionID,
          messageId: payload.properties.info.id,
          role: payload.properties.info.role,
        });
        useOcMessageStore.getState().upsertMessage(payload.properties.info);
        useOcSessionStore.getState().clearPendingSend(payload.properties.info.sessionID);
        break;
      case 'message.removed':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          messageId: payload.properties.messageID,
        });
        // Flush pending deltas (preserves other messages' work), then remove
        deltaBatchers.get(payload.properties.sessionID)?.cancel(true);
        useOcMessageStore
          .getState()
          .removeMessage(payload.properties.sessionID, payload.properties.messageID);
        break;
      case 'message.part.updated':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.part.sessionID,
          messageId: payload.properties.part.messageID,
          partId: payload.properties.part.id,
        });
        // Flush pending deltas for this session before upsertPart replaces with authoritative text
        cancelSessionDeltas(payload.properties.part.sessionID, true);
        useOcMessageStore.getState().upsertPart(payload.properties.part);
        useOcMessageStore
          .getState()
          .flushDeltaBuffer(
            payload.properties.part.sessionID,
            payload.properties.part.messageID,
            payload.properties.part.id
          );
        break;
      case 'message.part.delta':
        // Skip logging for delta events — fires per-character during streaming
        // Batched via RAF to coalesce ~200-400 deltas/sec into ~60 store updates/sec
        getDeltaBatcher(payload.properties.sessionID)({
          sessionID: payload.properties.sessionID,
          messageID: payload.properties.messageID,
          partID: payload.properties.partID,
          field: payload.properties.field,
          delta: payload.properties.delta,
        });
        break;
      case 'message.part.removed':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          partId: payload.properties.partID,
        });
        // Flush pending deltas (preserves other parts' work), then remove
        deltaBatchers.get(payload.properties.sessionID)?.cancel(true);
        useOcMessageStore
          .getState()
          .removePart(payload.properties.sessionID, payload.properties.partID);
        break;
      case 'permission.asked':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          requestId: payload.properties.id,
        });
        useOcPermissionStore.getState().addPermission(payload.properties);
        break;
      case 'permission.replied':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          requestId: payload.properties.requestID,
        });
        useOcPermissionStore.getState().removePermission(payload.properties.requestID);
        break;
      case 'question.asked':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          requestId: payload.properties.id,
        });
        useOcPermissionStore.getState().addQuestion(payload.properties);
        break;
      case 'question.replied':
      case 'question.rejected':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          requestId: payload.properties.requestID,
        });
        useOcPermissionStore.getState().removeQuestion(payload.properties.requestID);
        break;
      case 'file.edited':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          file: payload.properties.file,
        });
        useFileStore.getState().handleFileChanged(payload.properties.file, 'modified');
        break;
      case 'session.compacted':
        logger.info('Session compacted, reloading messages', {
          sessionId: payload.properties.sessionID,
        });
        void ocSessionService
          .loadMessages(payload.properties.sessionID)
          .then(() => {
            useChatStore.getState().settleCompaction(payload.properties.sessionID);
          })
          .catch((error: unknown) => {
            logger.error('Failed to reload compacted OpenCode session', error);
            // Still settle on failure — don't leave a stuck indicator
            useChatStore.getState().settleCompaction(payload.properties.sessionID);
          });
        break;
      default: {
        const eventType = (payload as { type: string }).type;
        if (eventType !== 'session.diff' && eventType !== 'server.heartbeat') {
          logger.warn('Unhandled event type', { eventType });
        }
        break;
      }
    }
  },
};
