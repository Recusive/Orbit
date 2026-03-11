import { createLogger } from '@orbit/common/lib';

import { getClient } from './client';

import type { OcProviderInfo } from '@/stores/opencode';
import type { OcProviderAuthAuthorization, OcQuestionAnswer, OcSession } from '@/types/opencode';
import type { ProviderListResponses, SessionMessagesResponses } from '@opencode-ai/sdk/v2/client';

import {
  useOcMessageStore,
  useOcPermissionStore,
  useOcProviderStore,
  useOcSessionStore,
} from '@/stores/opencode';

const logger = createLogger('OcSessionService');

export interface OcSendMessageOptions {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly agent?: string;
}

function mapProviders(response: ProviderListResponses[200]): {
  providers: OcProviderInfo[];
  connectedProviders: string[];
  defaultModels: Record<string, string>;
} {
  return {
    providers: response.all.map((provider) => ({
      id: provider.id,
      name: provider.name,
      env: provider.env,
      models: Object.fromEntries(
        Object.values(provider.models as Record<string, { id: string; name: string }>).map(
          (model) => [
            model.id,
            {
              id: model.id,
              name: model.name,
            },
          ]
        )
      ),
    })),
    connectedProviders: response.connected,
    defaultModels: response.default,
  };
}

export const ocSessionService = {
  async listSessions(): Promise<OcSession[]> {
    const response = await getClient().session.list(undefined, { throwOnError: true });
    const sessions = response.data ?? [];
    useOcSessionStore.getState().setSessions(sessions);
    return sessions;
  },

  async createSession(input?: { title?: string }): Promise<OcSession> {
    const response = await getClient().session.create(
      input?.title ? { title: input.title } : undefined,
      { throwOnError: true }
    );
    const session = response.data;
    if (!session) {
      throw new Error('OpenCode returned no session from create');
    }

    useOcSessionStore.getState().addSession(session);
    return session;
  },

  async deleteSession(sessionId: string): Promise<void> {
    await getClient().session.delete({ sessionID: sessionId }, { throwOnError: true });
    useOcSessionStore.getState().removeSession(sessionId);
    useOcMessageStore.getState().clearSession(sessionId);
    useOcPermissionStore.getState().clearSession(sessionId);
  },

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const response = await getClient().session.update(
      {
        sessionID: sessionId,
        title,
      },
      { throwOnError: true }
    );
    const session = response.data;
    if (session) {
      useOcSessionStore.getState().updateSession(session);
    }
  },

  async validateSession(sessionId: string): Promise<OcSession | null> {
    const response = await getClient().session.get({ sessionID: sessionId });
    return response.data ?? null;
  },

  async sendMessage(
    sessionId: string,
    text: string,
    options?: OcSendMessageOptions
  ): Promise<void> {
    const model =
      options?.providerId && options.modelId
        ? {
            providerID: options.providerId,
            modelID: options.modelId,
          }
        : undefined;

    await getClient().session.promptAsync(
      {
        sessionID: sessionId,
        messageID: `msg_${crypto.randomUUID().replaceAll('-', '')}`,
        ...(options?.agent ? { agent: options.agent } : {}),
        ...(model ? { model } : {}),
        parts: [
          {
            type: 'text',
            text,
          },
        ],
      },
      { throwOnError: true }
    );
  },

  async abortSession(sessionId: string): Promise<void> {
    await getClient().session.abort({ sessionID: sessionId }, { throwOnError: true });
  },

  async loadMessages(sessionId: string): Promise<SessionMessagesResponses[200]> {
    const response = await getClient().session.messages(
      { sessionID: sessionId },
      { throwOnError: true }
    );
    const messages = response.data ?? [];
    useOcMessageStore.getState().setSessionMessages(sessionId, messages);
    return messages;
  },

  async replyPermission(requestId: string, reply: 'once' | 'always' | 'reject'): Promise<void> {
    await getClient().permission.reply(
      {
        requestID: requestId,
        reply,
      },
      { throwOnError: true }
    );
  },

  async replyQuestion(requestId: string, answers: OcQuestionAnswer[]): Promise<void> {
    await getClient().question.reply(
      {
        requestID: requestId,
        answers,
      },
      { throwOnError: true }
    );
  },

  async rejectQuestion(requestId: string): Promise<void> {
    await getClient().question.reject(
      {
        requestID: requestId,
      },
      { throwOnError: true }
    );
  },

  async loadProviders(): Promise<void> {
    const providerStore = useOcProviderStore.getState();
    providerStore.setLoading(true);

    try {
      const [providersResponse, authResponse] = await Promise.all([
        getClient().provider.list(undefined, { throwOnError: true }),
        getClient().provider.auth(undefined, { throwOnError: true }),
      ]);

      if (!providersResponse.data || !authResponse.data) {
        throw new Error('OpenCode provider endpoints returned no data');
      }

      const mapped = mapProviders(providersResponse.data);
      providerStore.setProviders(mapped);
      providerStore.setAuthMethods(authResponse.data);
    } catch (error) {
      logger.error('Failed to load OpenCode providers', error);
      throw error;
    } finally {
      providerStore.setLoading(false);
    }
  },

  async authorizeProvider(
    providerId: string,
    methodIndex: number
  ): Promise<OcProviderAuthAuthorization> {
    const response = await getClient().provider.oauth.authorize(
      {
        providerID: providerId,
        method: methodIndex,
      },
      { throwOnError: true }
    );

    if (!response.data) {
      throw new Error('OpenCode provider authorization returned no data');
    }

    return response.data;
  },

  async completeProviderAuthorization(
    providerId: string,
    methodIndex: number,
    code?: string
  ): Promise<void> {
    await getClient().provider.oauth.callback(
      {
        providerID: providerId,
        ...(methodIndex >= 0 ? { method: methodIndex } : {}),
        ...(code ? { code } : {}),
      },
      { throwOnError: true }
    );
  },

  async setProviderApiKey(providerId: string, key: string): Promise<void> {
    await getClient().auth.set(
      {
        providerID: providerId,
        auth: {
          type: 'api',
          key,
        },
      },
      { throwOnError: true }
    );
  },

  async removeProviderAuth(providerId: string): Promise<void> {
    await getClient().auth.remove(
      {
        providerID: providerId,
      },
      { throwOnError: true }
    );
  },
};
