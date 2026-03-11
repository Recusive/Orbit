import { createLogger } from '@orbit/common/lib';

import { ocSessionService } from './oc-session-service';

import type { OcGlobalEvent } from '@/types/opencode';

import { useFileStore } from '@/stores/file/file-store';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('OcEventCoordinator');

function isActiveDirectory(directory: string): boolean {
  const activeDirectory = useUIStore.getState().workspacePath;
  if (!activeDirectory) {
    return false;
  }
  return directory === activeDirectory;
}

export const ocEventCoordinator = {
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
        break;
      case 'session.deleted':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.info.id,
        });
        useOcSessionStore.getState().removeSession(payload.properties.info.id);
        useOcMessageStore.getState().clearSession(payload.properties.info.id);
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
        useOcSessionStore.getState().setSessionStatus(payload.properties.sessionID, {
          type: 'idle',
        });
        break;
      case 'session.error':
        if (payload.properties.sessionID && payload.properties.error) {
          logger.warn('Session error received', { sessionId: payload.properties.sessionID });
          const errorMessage = JSON.stringify(payload.properties.error.data);
          useOcSessionStore.getState().setSessionError(payload.properties.sessionID, errorMessage);
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
        break;
      case 'message.removed':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          messageId: payload.properties.messageID,
        });
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
        useOcMessageStore
          .getState()
          .appendDelta(
            payload.properties.sessionID,
            payload.properties.messageID,
            payload.properties.partID,
            payload.properties.field,
            payload.properties.delta
          );
        break;
      case 'message.part.removed':
        logger.debug('Event dispatched', {
          eventType: payload.type,
          sessionId: payload.properties.sessionID,
          partId: payload.properties.partID,
        });
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
        void ocSessionService.loadMessages(payload.properties.sessionID).catch((error: unknown) => {
          logger.error('Failed to reload compacted OpenCode session', error);
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
