/**
 * Integration tests for COMBINED REWIND (files + conversation).
 *
 * Tests both rewind mechanisms working together as they do in production:
 * 1. File rewind - SDK's rewindFiles() restores filesystem state
 * 2. Conversation rewind - Context prepend provides conversation history
 *
 * ## Full Rewind Flow (frontend: use-tauri.ts conversation:rewind handler):
 *
 * When user clicks "rewind" on message N:
 *
 * ### Step 1: Get Checkpoints (lines 835-851)
 * - Get rewind checkpoints from checkpointStore.getRewindCheckpoints()
 * - rewindCheckpoints.resumeSessionAt = user message UUID
 * - rewindCheckpoints.rewindFiles = checkpoint for file state
 *
 * ### Step 2: Get SDK Session ID (lines 853-860)
 * - Call agentGetSdkSessionId() to get current SDK session
 * - Needed for marking the forked session
 *
 * ### Step 3: Rewind Files (lines 862-878)
 * - Call agentRewindFiles(sessionId, rewindCheckpoints.rewindFiles)
 * - This calls agent.rewindFiles() which:
 *   - Interrupts current query
 *   - Creates resumed query with SDK session
 *   - Calls rewindQuery.rewindFiles(checkpointId)
 *
 * ### Step 4-5: Fork Conversation (lines 880-901)
 * - Create new session ID
 * - Call conversationFork() to get messages 1..N
 * - Store messages in rewindContextMap via setRewindContext()
 *
 * ### Step 6: Mark Session as Forked (lines 904-911)
 * - Call markSessionAsForked() for checkpoint tracking
 *
 * ### Step 7: First Message (lines 1047-1061 in message:send handler)
 * - consumeRewindContext() retrieves stored messages
 * - formatConversationContext() formats as XML
 * - Context prepended to user's message
 * - Combined message sent to fresh session
 *
 * ## What These Tests Verify:
 *
 * - Files are correctly restored by rewindFiles()
 * - Conversation context is correctly prepended
 * - Agent has access to both: restored files AND conversation memory
 * - The two mechanisms don't interfere with each other
 *
 * ## Key Implementation Files:
 *
 * - agent-bridge/src/agent.ts: rewindFiles()
 * - apps/agent/src/hooks/use-tauri.ts: conversation:rewind handler, message:send handler
 * - apps/agent/src/stores/checkpoint-store.ts: checkpoint tracking
 *
 * Requires: Valid Claude credentials (API key or OAuth)
 */

import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';

import { createAgent } from '../agent.js';

import type { OrbitAgent, OrbitAgentConfig } from '../agent.js';

const TEST_ROOT = join(import.meta.dir, '../../.test-workspace');

// Check for credentials: API key OR OAuth (macOS Keychain)
const hasCredentials = !!process.env.ANTHROPIC_API_KEY || process.platform === 'darwin';

const TIMEOUT_LONG = 180_000;
const TIMEOUT_VERY_LONG = 300_000;

// Debug logging - set DEBUG_TESTS=1 to enable
const DEBUG = process.env.DEBUG_TESTS === '1';
function noop(...args: unknown[]): void {
  // No-op function for disabled debug logging
  void args;
}
const log: (...args: unknown[]) => void = DEBUG ? console.warn.bind(console) : noop;

/**
 * Format conversation messages as XML context.
 *
 * IMPORTANT: This must match the frontend's formatConversationContext()
 * in apps/agent/src/hooks/use-tauri.ts exactly.
 */
interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

describe('Combined Rewind (Files + Conversation)', () => {
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
   * Run a conversation collecting checkpoints and responses.
   */
  async function runConversation(
    agent: OrbitAgent,
    prompts: string[],
    timeout = TIMEOUT_LONG
  ): Promise<{
    checkpoints: string[];
    responses: string[];
    sessionId?: string;
  }> {
    const checkpoints: string[] = [];
    const responses: string[] = [];
    let sessionId: string | undefined;
    let promptIndex = 0;
    let capturedCheckpointForCurrentPrompt = false;
    let currentResponse = '';

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
      const firstPrompt = prompts[promptIndex];
      if (!firstPrompt) throw new Error('First prompt not found');
      agent.queueMessage(firstPrompt);
      promptIndex++;

      for await (const sdkMessage of agent.receiveResponse()) {
        const m = sdkMessage as Record<string, unknown>;

        if (sdkMessage.type === 'system' && m.subtype === 'init') {
          sessionId = m.session_id as string;
          log('[TEST] Session ID:', sessionId);
        }

        // Capture checkpoint
        if (
          sdkMessage.type === 'user' &&
          typeof m.uuid === 'string' &&
          !capturedCheckpointForCurrentPrompt
        ) {
          checkpoints.push(m.uuid);
          capturedCheckpointForCurrentPrompt = true;
          log('[TEST] Checkpoint:', m.uuid);
        }

        // Capture response text
        if (
          sdkMessage.type === 'assistant' &&
          typeof m.message === 'object' &&
          m.message !== null
        ) {
          const msg = m.message as { content?: { type: string; text?: string }[] };
          for (const block of msg.content ?? []) {
            if (block.type === 'text' && block.text) {
              currentResponse += block.text;
            }
          }
        }

        if (sdkMessage.type === 'result') {
          responses.push(currentResponse);
          currentResponse = '';

          if (promptIndex < prompts.length) {
            const nextPrompt = prompts[promptIndex];
            if (!nextPrompt) throw new Error('Next prompt not found');
            agent.queueMessage(nextPrompt);
            promptIndex++;
            capturedCheckpointForCurrentPrompt = false;
          } else {
            break;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return { checkpoints, responses, sessionId };
  }

  /**
   * Send a single message with optional context prepended.
   */
  async function sendMessageWithContext(
    agent: OrbitAgent,
    message: string,
    context: ContextMessage[] = [],
    timeout = TIMEOUT_LONG
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
      const contextPrefix = formatConversationContext(context);
      agent.queueMessage(contextPrefix + message);

      for await (const sdkMessage of agent.receiveResponse()) {
        const m = sdkMessage as Record<string, unknown>;

        if (sdkMessage.type === 'system' && m.subtype === 'init') {
          sessionId = m.session_id as string;
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
  // Full rewind flow tests
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'rewinds both files and conversation context',
    async () => {
      const testFile = join(testDir, 'data.txt');

      // === Phase 1: Original session creates file and establishes context ===
      agent = createTestAgent();
      await agent.startSession();

      const { checkpoints, responses } = await runConversation(agent, [
        `Create file ${testFile} with exactly "version-1". Then say "File created with version-1."`,
        `Overwrite ${testFile} with "version-2". Then say "Updated to version-2."`,
      ]);

      expect(checkpoints.length).toBe(2);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('version-2');
      log('[TEST] After original session:', readFileSync(testFile, 'utf-8'));

      // Capture the conversation history up to turn 1 (before v2 was written)
      // This simulates what the frontend does when user clicks rewind
      const conversationContext: ContextMessage[] = [
        {
          role: 'user',
          content: `Create file ${testFile} with exactly "version-1". Then say "File created with version-1."`,
        },
        { role: 'assistant', content: responses[0] ?? '' },
      ];

      // === Phase 2: Rewind files to checkpoint 2 (before v2 was written) ===
      const checkpoint1 = checkpoints[1];
      if (!checkpoint1) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('version-1');
      log('[TEST] After file rewind:', readFileSync(testFile, 'utf-8'));

      // Stop original session
      await agent.stopSession();

      // === Phase 3: Create new session with conversation context ===
      agent = createTestAgent();
      await agent.startSession();

      // Ask about both the file AND the conversation history
      const { response } = await sendMessageWithContext(
        agent,
        `What version is the file ${testFile} at right now? Read the file and tell me.`,
        conversationContext
      );

      log('[TEST] Response with context:', response);

      // Agent should see version-1 (file was rewound)
      expect(response.toLowerCase()).toContain('version-1');
      // File should still be at version-1
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('version-1');
    },
    TIMEOUT_VERY_LONG
  );

  it.skipIf(!hasCredentials)(
    'new session continues from rewind point with context',
    async () => {
      const testFile = join(testDir, 'project.txt');

      // === Phase 1: Original session - create file, then modify ===
      agent = createTestAgent();
      await agent.startSession();

      const { checkpoints, responses } = await runConversation(agent, [
        `Create ${testFile} with "initial". Remember: the project name is "Phoenix".`,
        `Overwrite ${testFile} with "modified". The Phoenix project is now in phase 2.`,
      ]);

      expect(checkpoints.length).toBe(2);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('modified');

      // === Phase 2: Rewind and create new session ===
      const checkpoint1b = checkpoints[1];
      if (!checkpoint1b) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1b);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('initial');
      await agent.stopSession();

      // Context includes turn 1 where we established "Phoenix" project name
      const context: ContextMessage[] = [
        {
          role: 'user',
          content: `Create ${testFile} with "initial". Remember: the project name is "Phoenix".`,
        },
        { role: 'assistant', content: responses[0] ?? '' },
      ];

      // === Phase 3: New session with context - should remember "Phoenix" ===
      agent = createTestAgent();
      await agent.startSession();

      const { response } = await sendMessageWithContext(
        agent,
        'What is the project name I mentioned earlier?',
        context
      );

      log('[TEST] Response:', response);

      // Should remember the project name from context
      expect(response.toLowerCase()).toContain('phoenix');
    },
    TIMEOUT_VERY_LONG
  );

  it.skipIf(!hasCredentials)(
    'correctly handles rewind to earliest point',
    async () => {
      const testFile = join(testDir, 'counter.txt');

      // === Phase 1: Build up several versions ===
      agent = createTestAgent();
      await agent.startSession();

      const { checkpoints, responses } = await runConversation(agent, [
        `Create ${testFile} with "count: 1".`,
        `Overwrite ${testFile} with "count: 2".`,
        `Overwrite ${testFile} with "count: 3".`,
      ]);

      expect(checkpoints.length).toBe(3);
      expect(readFileSync(testFile, 'utf-8')).toContain('3');

      // === Phase 2: Rewind to FIRST checkpoint (before "count: 1" was written) ===
      // checkpoints[0] = state before turn 1 = file doesn't exist yet
      // We can't rewind to before creation (file didn't exist), so rewind to checkpoints[1]
      const checkpoint1c = checkpoints[1];
      if (!checkpoint1c) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1c);
      expect(readFileSync(testFile, 'utf-8')).toContain('1');
      log('[TEST] After rewind to checkpoint 1:', readFileSync(testFile, 'utf-8'));

      await agent.stopSession();

      // Context: only the first turn
      const context: ContextMessage[] = [
        { role: 'user', content: `Create ${testFile} with "count: 1".` },
        { role: 'assistant', content: responses[0] ?? '' },
      ];

      // === Phase 3: New session continues from count: 1 ===
      agent = createTestAgent();
      await agent.startSession();

      const { response } = await sendMessageWithContext(
        agent,
        `What is the current count in ${testFile}? Read the file.`,
        context
      );

      log('[TEST] Response:', response);

      // Should see count: 1 (rewound state)
      expect(response).toContain('1');
      expect(response).not.toContain('2');
      expect(response).not.toContain('3');
    },
    TIMEOUT_VERY_LONG
  );

  // ═══════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'handles file deletion in rewind scenario',
    async () => {
      const testFile = join(testDir, 'deletable.txt');

      // === Phase 1: Create file, then delete it ===
      agent = createTestAgent();
      await agent.startSession();

      const { checkpoints, responses } = await runConversation(agent, [
        `Create ${testFile} with "exists". Say "created".`,
        `Delete ${testFile} using rm command. Say "deleted".`,
      ]);

      expect(checkpoints.length).toBe(2);
      expect(existsSync(testFile)).toBe(false);

      // === Phase 2: Rewind to before deletion ===
      const checkpoint1d = checkpoints[1];
      if (!checkpoint1d) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1d);
      expect(existsSync(testFile)).toBe(true);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('exists');
      log('[TEST] File restored after rewind');

      await agent.stopSession();

      // Context: only the create turn
      const context: ContextMessage[] = [
        { role: 'user', content: `Create ${testFile} with "exists". Say "created".` },
        { role: 'assistant', content: responses[0] ?? '' },
      ];

      // === Phase 3: New session - file should still exist ===
      agent = createTestAgent();
      await agent.startSession();

      const { response } = await sendMessageWithContext(
        agent,
        `Does ${testFile} exist? Check and tell me.`,
        context
      );

      log('[TEST] Response:', response);

      // File should exist and agent should confirm
      expect(existsSync(testFile)).toBe(true);
      expect(response.toLowerCase()).toMatch(/exist|yes|found/);
    },
    TIMEOUT_VERY_LONG
  );
});
