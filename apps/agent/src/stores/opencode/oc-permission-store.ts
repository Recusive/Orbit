import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';

import type { OcPermissionAsked, OcQuestionRequest } from '@/types/opencode';

const logger = createLogger('OcPermissionStore');

interface OcPermissionState {
  permissions: Record<string, OcPermissionAsked>;
  questions: Record<string, OcQuestionRequest>;
  addPermission: (permission: OcPermissionAsked) => void;
  removePermission: (requestId: string) => void;
  addQuestion: (question: OcQuestionRequest) => void;
  removeQuestion: (requestId: string) => void;
  clearSession: (sessionId: string) => void;
  clearAll: () => void;
}

export const useOcPermissionStore = create<OcPermissionState>((set) => ({
  permissions: {},
  questions: {},
  addPermission: (permission) => {
    logger.debug('Permission added', { requestId: permission.id, sessionId: permission.sessionID });
    set((state) => ({
      permissions: {
        ...state.permissions,
        [permission.id]: permission,
      },
    }));
  },
  removePermission: (requestId) => {
    logger.debug('Permission removed', { requestId });
    set((state) => ({
      permissions: Object.fromEntries(
        Object.entries(state.permissions).filter(([id]) => id !== requestId)
      ),
    }));
  },
  addQuestion: (question) => {
    logger.debug('Question added', { requestId: question.id, sessionId: question.sessionID });
    set((state) => ({
      questions: {
        ...state.questions,
        [question.id]: question,
      },
    }));
  },
  removeQuestion: (requestId) => {
    logger.debug('Question removed', { requestId });
    set((state) => ({
      questions: Object.fromEntries(
        Object.entries(state.questions).filter(([id]) => id !== requestId)
      ),
    }));
  },
  clearSession: (sessionId) => {
    set((state) => ({
      permissions: Object.fromEntries(
        Object.entries(state.permissions).filter(
          ([, permission]) => permission.sessionID !== sessionId
        )
      ),
      questions: Object.fromEntries(
        Object.entries(state.questions).filter(([, question]) => question.sessionID !== sessionId)
      ),
    }));
  },
  clearAll: () => {
    set({
      permissions: {},
      questions: {},
    });
  },
}));
