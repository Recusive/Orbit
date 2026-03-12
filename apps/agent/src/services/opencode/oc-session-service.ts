import { createLogger } from '@orbit/common/lib';

import { getClient } from './client';

import type { OcProviderInfo } from '@/stores/opencode';
import type { OcProviderAuthAuthorization, OcQuestionAnswer, OcSession } from '@/types/opencode';
import type { ProviderListResponses, SessionMessagesResponses } from '@opencode-ai/sdk/v2/client';

import { useToolStore } from '@/stores/agent/tool-store';
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
  readonly variant?: string;
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
        Object.values(
          provider.models as Record<
            string,
            {
              id: string;
              name: string;
              reasoning: boolean;
              variants?: Record<string, Record<string, unknown>>;
            }
          >
        ).map((model) => [
          model.id,
          {
            id: model.id,
            name: model.name,
            ...(model.reasoning ? { reasoning: true } : {}),
            ...(model.variants ? { variants: model.variants } : {}),
          },
        ])
      ),
    })),
    connectedProviders: response.connected,
    defaultModels: response.default,
  };
}

export const ocSessionService = {
  async listSessions(): Promise<OcSession[]> {
    logger.info('Listing sessions');
    const response = await getClient().session.list(undefined, { throwOnError: true });
    const sessions = response.data ?? [];
    useOcSessionStore.getState().setSessions(sessions);
    logger.info('Sessions loaded', { count: sessions.length });
    return sessions;
  },

  async createSession(input?: { title?: string }): Promise<OcSession> {
    logger.info('Creating session');
    const effectiveTitle = input?.title === 'Untitled' ? undefined : input?.title;
    const response = await getClient().session.create(
      effectiveTitle ? { title: effectiveTitle } : undefined,
      { throwOnError: true }
    );
    const session = response.data;
    if (!session) {
      throw new Error('OpenCode returned no session from create');
    }

    useOcSessionStore.getState().addSession(session);
    logger.info('Session created', { sessionId: session.id });
    return session;
  },

  async deleteSession(sessionId: string): Promise<void> {
    logger.info('Deleting session', { sessionId });
    await getClient().session.delete({ sessionID: sessionId }, { throwOnError: true });
    useOcSessionStore.getState().removeSession(sessionId);
    useOcMessageStore.getState().clearSession(sessionId);
    useOcPermissionStore.getState().clearSession(sessionId);
    useToolStore.getState().clearSessionTools(sessionId);
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
    logger.info('Validating session', { sessionId });
    const response = await getClient().session.get({ sessionID: sessionId });
    return response.data ?? null;
  },

  async sendMessage(
    sessionId: string,
    text: string,
    options?: OcSendMessageOptions
  ): Promise<void> {
    logger.info('Sending message', {
      sessionId,
      hasModel: Boolean(options?.providerId && options.modelId),
      agent: options?.agent,
      variant: options?.variant,
    });

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
        // Let the backend generate messageID via Identifier.ascending("message")
        // so IDs are monotonically ordered. Frontend UUIDs break the prompt loop's
        // ID comparison (lastUser.id < lastAssistant.id) because UUID hex chars
        // are always lexicographically less than the backend's timestamp-based IDs.
        ...(options?.agent ? { agent: options.agent } : {}),
        ...(model ? { model } : {}),
        ...(options?.variant ? { variant: options.variant } : {}),
        parts: [
          {
            type: 'text',
            text,
          },
        ],
      },
      { throwOnError: true }
    );
    logger.info('Message sent (HTTP accepted)', { sessionId });
  },

  async abortSession(sessionId: string): Promise<void> {
    logger.info('Aborting session', { sessionId });
    await getClient().session.abort({ sessionID: sessionId }, { throwOnError: true });
  },

  async revertSession(sessionId: string, messageId: string): Promise<OcSession> {
    logger.info('Reverting session', { sessionId, messageId });
    const response = await getClient().session.revert(
      {
        sessionID: sessionId,
        messageID: messageId,
      },
      { throwOnError: true }
    );
    const session = response.data;
    if (!session) {
      throw new Error('OpenCode returned no session from revert');
    }

    useOcSessionStore.getState().updateSession(session);
    return session;
  },

  async loadMessages(sessionId: string): Promise<SessionMessagesResponses[200]> {
    logger.info('Loading messages', { sessionId });
    const response = await getClient().session.messages(
      { sessionID: sessionId },
      { throwOnError: true }
    );
    const messages = response.data ?? [];
    useOcMessageStore.getState().setSessionMessages(sessionId, messages);
    logger.info('Messages loaded', { sessionId, count: messages.length });
    return messages;
  },

  async replyPermission(requestId: string, reply: 'once' | 'always' | 'reject'): Promise<void> {
    logger.info('Replying to permission', { requestId, reply });
    await getClient().permission.reply(
      {
        requestID: requestId,
        reply,
      },
      { throwOnError: true }
    );
  },

  async replyQuestion(requestId: string, answers: OcQuestionAnswer[]): Promise<void> {
    logger.info('Replying to question', { requestId, answerCount: answers.length });
    await getClient().question.reply(
      {
        requestID: requestId,
        answers,
      },
      { throwOnError: true }
    );
  },

  async rejectQuestion(requestId: string): Promise<void> {
    logger.info('Rejecting question', { requestId });
    await getClient().question.reject(
      {
        requestID: requestId,
      },
      { throwOnError: true }
    );
  },

  async loadProviders(): Promise<void> {
    logger.info('Loading providers');
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
      logger.info('Providers loaded', {
        count: mapped.providers.length,
        connected: mapped.connectedProviders.length,
      });
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
