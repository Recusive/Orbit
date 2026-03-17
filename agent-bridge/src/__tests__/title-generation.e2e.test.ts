/**
 * TESTED: agent-bridge/src/agent/session/session-manager.ts:generateTitle()
 *     Run: cd agent-bridge && bun test title-generation
 */

import { describe, expect, it } from 'bun:test';

import { SessionManager } from '../agent/session/session-manager.js';
import { ClaudeCredentials } from '../common/auth/credentials.js';
import { GenerateTitleRequestSchema } from '../protocol/schemas.js';

const credentials = await ClaudeCredentials.getCredentials();
const hasCredentials = credentials.hasCredentials;

describe('title generation (direct SDK)', () => {
  it.skipIf(!hasCredentials)(
    'generates a non-empty title through the direct SDK path',
    async () => {
      const manager = new SessionManager();
      const title = await manager.generateTitle('Help me debug a TypeScript build failure');

      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(50);
    }
  );

  it.skipIf(!hasCredentials)('generates a title from the user message alone', async () => {
    const manager = new SessionManager();
    const title = await manager.generateTitle('fix this error');

    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(50);
  });

  it('accepts the user-only title request schema', () => {
    const parsed = GenerateTitleRequestSchema.parse({
      type: 'generate_title',
      userMessage: 'Explain React useEffect cleanup',
    });

    expect(parsed.userMessage).toBe('Explain React useEffect cleanup');
  });

  it.skipIf(hasCredentials)('throws when credentials are unavailable', async () => {
    const manager = new SessionManager();

    try {
      await manager.generateTitle('Explain React useEffect cleanup');
      throw new Error('Expected title generation to fail without credentials');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('No credentials available for title generation');
    }
  });
});
