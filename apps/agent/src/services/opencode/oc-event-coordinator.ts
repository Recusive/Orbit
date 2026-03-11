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
      return;
    }

    const payload = event.payload;
    switch (payload.type) {
      case 'session.created':
        useOcSessionStore.getState().addSession(payload.properties.info);
        break;
      case 'session.updated':
        useOcSessionStore.getState().updateSession(payload.properties.info);
        break;
      case 'session.deleted':
        useOcSessionStore.getState().removeSession(payload.properties.info.id);
        useOcMessageStore.getState().clearSession(payload.properties.info.id);
        break;
      case 'session.status':
        useOcSessionStore
          .getState()
          .setSessionStatus(payload.properties.sessionID, payload.properties.status);
        break;
      case 'session.idle':
        useOcSessionStore.getState().setSessionStatus(payload.properties.sessionID, {
          type: 'idle',
        });
        break;
      case 'session.error':
        if (payload.properties.sessionID && payload.properties.error) {
          const errorMessage = JSON.stringify(payload.properties.error.data);
          useOcSessionStore.getState().setSessionError(payload.properties.sessionID, errorMessage);
        }
        break;
      case 'message.updated':
        useOcMessageStore.getState().upsertMessage(payload.properties.info);
        break;
      case 'message.removed':
        useOcMessageStore
          .getState()
          .removeMessage(payload.properties.sessionID, payload.properties.messageID);
        break;
      case 'message.part.updated':
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
        useOcMessageStore
          .getState()
          .removePart(payload.properties.sessionID, payload.properties.partID);
        break;
      case 'permission.asked':
        useOcPermissionStore.getState().addPermission(payload.properties);
        break;
      case 'permission.replied':
        useOcPermissionStore.getState().removePermission(payload.properties.requestID);
        break;
      case 'question.asked':
        useOcPermissionStore.getState().addQuestion(payload.properties);
        break;
      case 'question.replied':
      case 'question.rejected':
        useOcPermissionStore.getState().removeQuestion(payload.properties.requestID);
        break;
      case 'file.edited':
        useFileStore.getState().handleFileChanged(payload.properties.file, 'modified');
        break;
      case 'session.compacted':
        void ocSessionService.loadMessages(payload.properties.sessionID).catch((error: unknown) => {
          logger.error('Failed to reload compacted OpenCode session', error);
        });
        break;
      default:
        break;
    }
  },
};
