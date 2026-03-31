import { afterEach, describe, expect, it, jest } from 'bun:test';

import { OrbitAgent } from '../agent/core/agent.js';
import { SessionManager } from '../agent/session/session-manager.js';
import {
  resolveContextWindowFromInit,
  resolveContextWindowFromModelUsage,
} from '../agent/utils/context-window.js';

describe('context window resolution', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolveContextWindowFromInit', () => {
    it('returns 1M when the model name explicitly advertises [1m]', () => {
      expect(resolveContextWindowFromInit('claude-sonnet-4-6 [1m]', undefined)).toBe(1_000_000);
    });

    it('returns 1M for eligible models when the 1M beta is enabled', () => {
      expect(
        resolveContextWindowFromInit('claude-sonnet-4-6-20260219', ['context-1m-2025-08-07'])
      ).toBe(1_000_000);
      expect(resolveContextWindowFromInit('claude-opus-4-6', ['context-1m-2025-08-07'])).toBe(
        1_000_000
      );
    });

    it('falls back to 200k without the beta or for ineligible models', () => {
      expect(resolveContextWindowFromInit('claude-sonnet-4-6-20260219', undefined)).toBe(200_000);
      expect(resolveContextWindowFromInit('haiku', ['context-1m-2025-08-07'])).toBe(200_000);
      expect(resolveContextWindowFromInit(undefined, undefined)).toBe(200_000);
    });
  });

  describe('resolveContextWindowFromModelUsage', () => {
    it('prefers an exact model key match', () => {
      expect(
        resolveContextWindowFromModelUsage(
          {
            'claude-sonnet-4-6': { contextWindow: 1_000_000 },
            haiku: { contextWindow: 200_000 },
          },
          'claude-sonnet-4-6'
        )
      ).toBe(1_000_000);
    });

    it('supports alias keys', () => {
      expect(
        resolveContextWindowFromModelUsage(
          {
            sonnet: { contextWindow: 1_000_000 },
          },
          'claude-sonnet-4-6'
        )
      ).toBe(1_000_000);
    });

    it('supports versioned model keys', () => {
      expect(
        resolveContextWindowFromModelUsage(
          {
            'claude-opus-4-6-20260219': { contextWindow: 1_000_000 },
          },
          'claude-opus-4-6'
        )
      ).toBe(1_000_000);
    });

    it('returns undefined when no positive match exists', () => {
      expect(
        resolveContextWindowFromModelUsage(
          {
            haiku: { contextWindow: 200_000 },
          },
          'claude-opus-4-6'
        )
      ).toBeUndefined();

      expect(
        resolveContextWindowFromModelUsage(
          {
            'claude-sonnet-4-6': { contextWindow: 0 },
          },
          'claude-sonnet-4-6'
        )
      ).toBeUndefined();
    });
  });

  describe('session manager turn usage', () => {
    it('captures assistant per-turn usage even when the assistant message has no content', async () => {
      jest.spyOn(OrbitAgent.prototype, 'startSession').mockImplementation(() => Promise.resolve());
      jest.spyOn(OrbitAgent.prototype, 'getModel').mockReturnValue('claude-opus-4-6');
      jest.spyOn(OrbitAgent.prototype, 'receiveResponse').mockImplementation(async function* () {
        await Promise.resolve();
        yield {
          type: 'assistant',
          message: {
            content: [],
            usage: {
              input_tokens: 29,
              output_tokens: 4_500,
              cache_read_input_tokens: 243_000,
              cache_creation_input_tokens: 3_100,
            },
          },
        };
        yield {
          type: 'result',
          usage: {
            input_tokens: 3_700_000,
            output_tokens: 21_000,
            cache_read_input_tokens: 3_400_000,
            cache_creation_input_tokens: 12_000,
          },
        };
      });

      const manager = new SessionManager();
      const resultMessagePromise = new Promise<unknown>((resolve) => {
        const disposable = manager.onAgentMessage(({ message }) => {
          if (message.type === 'result') {
            disposable.dispose();
            resolve(message);
          }
        });
      });

      await manager.createSession('session-1');
      const resultMessage = (await resultMessagePromise) as {
        turnUsage?: {
          inputTokens: number;
          outputTokens: number;
          cacheReadInputTokens?: number;
          cacheCreationInputTokens?: number;
        };
      };

      expect(resultMessage.turnUsage).toEqual({
        inputTokens: 29,
        outputTokens: 4_500,
        cacheReadInputTokens: 243_000,
        cacheCreationInputTokens: 3_100,
      });
      expect(
        (
          manager as unknown as {
            lastAssistantUsage: Map<string, unknown>;
          }
        ).lastAssistantUsage.has('session-1')
      ).toBe(false);
    });

    it('cleans up captured assistant usage when a session is deleted', async () => {
      jest.spyOn(OrbitAgent.prototype, 'startSession').mockImplementation(() => Promise.resolve());
      jest.spyOn(OrbitAgent.prototype, 'stopSession').mockImplementation(() => Promise.resolve());
      jest.spyOn(OrbitAgent.prototype, 'receiveResponse').mockImplementation(async function* () {
        yield* await Promise.resolve([]);
      });

      const manager = new SessionManager();
      await manager.createSession('session-1');

      (
        manager as unknown as {
          lastAssistantUsage: Map<
            string,
            {
              input_tokens: number;
              output_tokens: number;
              cache_read_input_tokens: number;
              cache_creation_input_tokens: number;
            }
          >;
        }
      ).lastAssistantUsage.set('session-1', {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 25,
        cache_creation_input_tokens: 10,
      });

      await manager.deleteSession('session-1');

      expect(
        (
          manager as unknown as {
            lastAssistantUsage: Map<string, unknown>;
          }
        ).lastAssistantUsage.has('session-1')
      ).toBe(false);
    });
  });
});
