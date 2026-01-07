/**
 * Integration tests for CONVERSATION REWIND (context prepend).
 *
 * Tests the context-prepend approach for conversation memory restoration.
 * This is one half of the full rewind feature - the other half is file
 * restoration (tested in file-rewind.test.ts).
 *
 * ## Why Context Prepend Instead of SDK Resume?
 *
 * The SDK's `resume` option loads ALL messages from the previous session.
 * For rewind, we only want messages UP TO the rewind point.
 * Using resume would cause a "replay bug" where Claude sees both old and new messages.
 *
 * ## Conversation Rewind Flow (frontend: use-tauri.ts):
 *
 * 1. User clicks "rewind" on message N
 * 2. Frontend calls conversationFork() to get messages 1..N
 * 3. Messages are stored in rewindContextMap via setRewindContext()
 * 4. New session is created (fresh, NO SDK resume)
 * 5. When user sends first message:
 *    - consumeRewindContext() retrieves stored messages
 *    - formatConversationContext() formats them as XML
 *    - Context is prepended to the user's message
 *    - Combined message is sent to agent
 *
 * ## What These Tests Verify:
 *
 * - Agent correctly parses XML context format
 * - Agent "remembers" information from prepended context
 * - Agent can continue conversation naturally from context
 * - Edge cases: empty context, special characters, multi-turn
 *
 * ## Key Implementation Files:
 *
 * - apps/agent/src/hooks/use-tauri.ts: formatConversationContext(), setRewindContext()
 * - The XML format tested here MUST match the frontend exactly
 *
 * Requires: Valid Claude credentials (API key or OAuth)
 */

import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';

import { createAgent } from '../agent/core/agent.js';

import type { OrbitAgent, OrbitAgentConfig } from '../agent/core/agent.js';

const TEST_ROOT = join(import.meta.dir, '../../.test-workspace');

// Check for credentials: API key OR OAuth (macOS Keychain)
const hasCredentials = !!process.env.ANTHROPIC_API_KEY || process.platform === 'darwin';

const TIMEOUT_SHORT = 60_000;

// Debug logging - set DEBUG_TESTS=1 to enable
const DEBUG = process.env.DEBUG_TESTS === '1';
function noop(...args: unknown[]): void {
  // No-op function for disabled debug logging
  void args;
}
const log: (...args: unknown[]) => void = DEBUG ? console.warn.bind(console) : noop;

/**
 * Format conversation messages as XML context.
 * This mirrors the frontend's formatConversationContext() function.
 */
interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Format conversation messages as context for Claude.
 * Uses XML-style tags for clear structure.
 *
 * IMPORTANT: This must match the frontend's formatConversationContext()
 * in apps/agent/src/hooks/use-tauri.ts exactly.
 */
function formatConversationContext(messages: ContextMessage[]): string {
  if (messages.length === 0) return '';

  const formattedMessages = messages
    .map((m) => `<message role="${m.role}">\n${m.content}\n</message>`)
    .join('\n\n');

  return `<previous_conversation>
This is a continuation of a previous conversation. Here is the conversation history:

${formattedMessages}
</previous_conversation>

Continue from where we left off. The user's new message follows:

`;
}

describe('Conversation Rewind (Context Prepend)', () => {
  let testDir: string;
  let agent: OrbitAgent | undefined;

  beforeAll(() => {
    process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';
    if (!existsSync(TEST_ROOT)) {
      mkdirSync(TEST_ROOT, { recursive: true });
    }
  });

  beforeEach(() => {
    testDir = join(TEST_ROOT, `run-${String(Date.now())}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    log('[TEST] Created test directory:', testDir);
  });

  afterEach(async () => {
    if (agent !== undefined) {
      try {
        await agent.stopSession();
      } catch {
        // Ignore stop errors
      }
    }

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
      log('[TEST] Cleaned up test directory:', testDir);
    }
  });

  afterAll(() => {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function createTestAgent(config: Partial<OrbitAgentConfig> = {}): OrbitAgent {
    return createAgent({
      cwd: testDir,
      acceptEnabled: true,
      ...config,
    });
  }

  /**
   * Send a message and collect the response.
   */
  async function sendMessage(
    agent: OrbitAgent,
    message: string,
    timeout = TIMEOUT_SHORT
  ): Promise<{ response: string; sessionId?: string }> {
    let response = '';
    let sessionId: string | undefined;

    const timeoutId = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          await agent.interrupt();
        } catch {
          // Ignore interrupt errors
        }
      })();
    }, timeout);

    try {
      agent.queueMessage(message);

      for await (const sdkMessage of agent.receiveResponse()) {
        const m = sdkMessage as Record<string, unknown>;

        if (sdkMessage.type === 'system' && m.subtype === 'init') {
          sessionId = m.session_id as string;
          log('[TEST] Session ID:', sessionId);
        }

        if (
          sdkMessage.type === 'assistant' &&
          typeof m.message === 'object' &&
          m.message !== null
        ) {
          const msg = m.message as { content?: { type: string; text?: string }[] };
          for (const block of msg.content ?? []) {
            if (block.type === 'text' && block.text) {
              response += block.text;
            }
          }
        }

        if (sdkMessage.type === 'result') {
          break;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return { response, sessionId };
  }

  // ═══════════════════════════════════════════════════════════════
  // Context prepend tests
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'understands XML context prepended to message',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Create context with a "secret" the agent should remember
      const context: ContextMessage[] = [
        { role: 'user', content: 'Remember this secret code: ALPHA-7-BRAVO. Never forget it.' },
        { role: 'assistant', content: 'I will remember the secret code ALPHA-7-BRAVO.' },
      ];

      const contextPrefix = formatConversationContext(context);
      const question = 'What is the secret code I told you earlier?';

      const { response } = await sendMessage(agent, contextPrefix + question);

      log('[TEST] Response:', response);

      // The agent should reference the secret code from the context
      expect(response.toLowerCase()).toContain('alpha');
      expect(response.toLowerCase()).toContain('bravo');
    },
    TIMEOUT_SHORT
  );

  it.skipIf(!hasCredentials)(
    'maintains continuity from multi-turn context',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Simulate a multi-turn conversation about a project
      const context: ContextMessage[] = [
        {
          role: 'user',
          content: "I'm building a weather app called SunnyDay. It uses React and TypeScript.",
        },
        {
          role: 'assistant',
          content:
            "That's a great project! SunnyDay built with React and TypeScript sounds like a solid foundation. What features are you planning?",
        },
        {
          role: 'user',
          content: 'I want to add a 5-day forecast feature.',
        },
        {
          role: 'assistant',
          content:
            'A 5-day forecast is a great addition to SunnyDay. You could use a weather API like OpenWeatherMap.',
        },
      ];

      const contextPrefix = formatConversationContext(context);
      const question = 'What was the name of my app and what framework am I using?';

      const { response } = await sendMessage(agent, contextPrefix + question);

      log('[TEST] Response:', response);

      // Agent should remember both the app name and framework
      expect(response.toLowerCase()).toContain('sunnyday');
      expect(response.toLowerCase()).toContain('react');
    },
    TIMEOUT_SHORT
  );

  it.skipIf(!hasCredentials)(
    'handles empty context gracefully',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Empty context should not break anything
      const context: ContextMessage[] = [];
      const contextPrefix = formatConversationContext(context);

      const question = 'Say "hello world" and nothing else.';

      const { response } = await sendMessage(agent, contextPrefix + question);

      log('[TEST] Response:', response);

      // Should still respond normally
      expect(response.toLowerCase()).toContain('hello');
    },
    TIMEOUT_SHORT
  );

  // ═══════════════════════════════════════════════════════════════
  // Session ID tracking tests
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'captures SDK session ID during conversation',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Send a message and verify session ID is captured
      const { sessionId } = await sendMessage(agent, 'Say "test" and nothing else.');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      if (sessionId !== undefined) {
        expect(sessionId.length).toBeGreaterThan(0);
      }

      // getCurrentSessionId should return the same ID
      const currentId = agent.getCurrentSessionId();
      expect(currentId).toBe(sessionId);

      log('[TEST] SDK Session ID:', sessionId);
    },
    TIMEOUT_SHORT
  );

  // ═══════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'handles special characters in context',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Context with special XML characters and unicode
      const context: ContextMessage[] = [
        {
          role: 'user',
          content: 'The formula is: x < y && z > 0. Remember: "quotes" and \'apostrophes\' matter.',
        },
        {
          role: 'assistant',
          content: 'I understand the formula uses <, >, &&, and various quote marks.',
        },
      ];

      const contextPrefix = formatConversationContext(context);
      const question = 'What comparison operators did I mention?';

      const { response } = await sendMessage(agent, contextPrefix + question);

      log('[TEST] Response:', response);

      // Should handle the context despite special characters
      expect(response.length).toBeGreaterThan(0);
      // Should reference less-than or greater-than
      const hasComparison =
        response.includes('<') ||
        response.includes('>') ||
        response.toLowerCase().includes('less') ||
        response.toLowerCase().includes('greater');
      expect(hasComparison).toBe(true);
    },
    TIMEOUT_SHORT
  );
});
