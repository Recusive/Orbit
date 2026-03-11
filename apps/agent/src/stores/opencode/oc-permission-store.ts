import { create } from 'zustand';

import type { OcPermissionAsked, OcQuestionRequest } from '@/types/opencode';

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
    set((state) => ({
      permissions: {
        ...state.permissions,
        [permission.id]: permission,
      },
    }));
  },
  removePermission: (requestId) => {
    set((state) => ({
      permissions: Object.fromEntries(
        Object.entries(state.permissions).filter(([id]) => id !== requestId)
      ),
    }));
  },
  addQuestion: (question) => {
    set((state) => ({
      questions: {
        ...state.questions,
        [question.id]: question,
      },
    }));
  },
  removeQuestion: (requestId) => {
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
