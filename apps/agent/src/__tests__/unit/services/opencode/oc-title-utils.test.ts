import type { OcPart } from '@/types/opencode';

import {
  countRealUserMessages,
  isDefaultOcTitle,
  willBackendGenerateTitle,
} from '@/services/opencode/oc-title-utils';

function createTextPart(overrides: Partial<Extract<OcPart, { type: 'text' }>> = {}): OcPart {
  return {
    id: 'part-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'text',
    text: 'hello',
    ...overrides,
  };
}

function createSubtaskPart(overrides: Partial<Extract<OcPart, { type: 'subtask' }>> = {}): OcPart {
  return {
    id: 'part-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'subtask',
    prompt: 'Do the thing',
    description: 'Do the thing',
    agent: 'build',
    ...overrides,
  };
}

describe('oc-title-utils', () => {
  describe('isDefaultOcTitle', () => {
    it('matches root default title format', () => {
      expect(isDefaultOcTitle('New session - 2026-03-11T10:30:00.000Z')).toBe(true);
    });

    it('matches child default title format', () => {
      expect(isDefaultOcTitle('Child session - 2026-03-11T10:30:00.000Z')).toBe(true);
    });

    it('rejects non-default titles', () => {
      expect(isDefaultOcTitle('Refactor auth middleware')).toBe(false);
      expect(isDefaultOcTitle('New session - not-a-date')).toBe(false);
    });
  });

  describe('countRealUserMessages', () => {
    it('returns 0 for an empty session', () => {
      expect(countRealUserMessages([], {}, {})).toBe(0);
    });

    it('counts normal user messages as real', () => {
      expect(
        countRealUserMessages(
          ['message-1'],
          { 'message-1': { role: 'user' } },
          { 'message-1': [createTextPart()] }
        )
      ).toBe(1);
    });

    it('excludes user messages whose parts are all synthetic', () => {
      expect(
        countRealUserMessages(
          ['message-1'],
          { 'message-1': { role: 'user' } },
          {
            'message-1': [createTextPart({ text: 'synthetic', synthetic: true })],
          }
        )
      ).toBe(0);
    });

    it('counts the message when at least one part is non-synthetic', () => {
      expect(
        countRealUserMessages(
          ['message-1'],
          { 'message-1': { role: 'user' } },
          {
            'message-1': [
              createTextPart({ id: 'part-1', text: 'auto', synthetic: true }),
              createTextPart({ id: 'part-2', text: 'real' }),
            ],
          }
        )
      ).toBe(1);
    });

    it('counts non-text user parts as real', () => {
      expect(
        countRealUserMessages(
          ['message-1'],
          { 'message-1': { role: 'user' } },
          { 'message-1': [createSubtaskPart()] }
        )
      ).toBe(1);
    });

    it('treats a user message with no parts as real', () => {
      expect(countRealUserMessages(['message-1'], { 'message-1': { role: 'user' } }, {})).toBe(1);
    });

    it('ignores assistant messages', () => {
      expect(countRealUserMessages(['message-1'], { 'message-1': { role: 'assistant' } }, {})).toBe(
        0
      );
    });
  });

  describe('willBackendGenerateTitle', () => {
    it('returns true for a root session with a default title and no prior real user messages', () => {
      expect(
        willBackendGenerateTitle({
          title: 'New session - 2026-03-11T10:30:00.000Z',
          realUserMessageCount: 0,
        })
      ).toBe(true);
    });

    it('returns false for child sessions', () => {
      expect(
        willBackendGenerateTitle({
          title: 'New session - 2026-03-11T10:30:00.000Z',
          parentID: 'parent-1',
          realUserMessageCount: 0,
        })
      ).toBe(false);
    });

    it('returns false after a real user message already exists', () => {
      expect(
        willBackendGenerateTitle({
          title: 'New session - 2026-03-11T10:30:00.000Z',
          realUserMessageCount: 1,
        })
      ).toBe(false);
    });

    it('returns false when the session already has a real title', () => {
      expect(
        willBackendGenerateTitle({
          title: 'Refactor auth middleware',
          realUserMessageCount: 0,
        })
      ).toBe(false);
    });
  });
});
