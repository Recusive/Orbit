/**
 * Integration tests for FILE REWIND (SDK's rewindFiles).
 *
 * Tests the SDK's native checkpoint/restore functionality for filesystem state.
 * This is one half of the full rewind feature - the other half is conversation
 * context (tested in conversation-rewind.test.ts).
 *
 * ## File Rewind Flow (what these tests verify):
 *
 * 1. Agent creates/modifies files during conversation
 * 2. SDK tracks file changes via checkpoints (enabled by enableFileCheckpointing)
 * 3. Each user message has a UUID that serves as a checkpoint ID
 * 4. Calling agent.rewindFiles(checkpointId) restores files to that checkpoint
 *
 * ## Implementation Details (agent.ts:rewindFiles):
 *
 * 1. Gets SDK session ID from _currentSessionId
 * 2. Interrupts current query
 * 3. Waits 500ms for SDK to finalize checkpoint data
 * 4. Creates new query with resume: sdkSessionId
 * 5. Calls rewindQuery.rewindFiles(checkpointId) on the resumed query
 *
 * ## Key Configuration:
 *
 * - enableFileCheckpointing: true (options)
 * - CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' (env)
 * - replay-user-messages flag (extraArgs) for checkpoint tracking
 *
 * Requires: Valid Claude credentials (API key or OAuth)
 */

import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';

import { createAgent } from '../agent/core/agent.js';

import type { OrbitAgent, OrbitAgentConfig } from '../agent/core/agent.js';

const TEST_ROOT = join(import.meta.dir, '../../.test-workspace');

// Check for credentials: API key OR OAuth (macOS Keychain)
const hasCredentials = !!process.env.ANTHROPIC_API_KEY || process.platform === 'darwin';

const TIMEOUT_SHORT = 60_000;
const TIMEOUT_LONG = 180_000;

// Debug logging - set DEBUG_TESTS=1 to enable
const DEBUG = process.env.DEBUG_TESTS === '1';
function noop(...args: unknown[]): void {
  // No-op function for disabled debug logging
  void args;
}
const log: (...args: unknown[]) => void = DEBUG ? console.warn.bind(console) : noop;

describe('File Rewind (SDK rewindFiles)', () => {
  let testDir: string;
  let agent: OrbitAgent | undefined;

  beforeAll(() => {
    process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';
    if (!existsSync(TEST_ROOT)) {
      mkdirSync(TEST_ROOT, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create isolated directory for each test
    testDir = join(TEST_ROOT, `run-${String(Date.now())}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    log('[TEST] Created test directory:', testDir);
  });

  afterEach(async () => {
    // Stop agent if running
    if (agent !== undefined) {
      try {
        await agent.stopSession();
      } catch {
        // Ignore stop errors
      }
    }

    // Clean up test directory
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

  /**
   * Create an OrbitAgent with test configuration
   * Mirrors the actual implementation in session-manager.ts
   */
  function createTestAgent(config: Partial<OrbitAgentConfig> = {}): OrbitAgent {
    return createAgent({
      cwd: testDir,
      acceptEnabled: true, // Auto-approve tools for testing
      ...config,
    });
  }

  /**
   * Run a complete conversation with the agent, collecting checkpoint IDs
   * for each message in the conversation.
   *
   * Unlike the real app which keeps the response loop running continuously,
   * this helper runs each prompt to completion in sequence.
   */
  async function runConversation(
    agent: OrbitAgent,
    prompts: string[],
    timeout = TIMEOUT_LONG
  ): Promise<{
    checkpoints: string[];
    sessionId?: string;
  }> {
    const checkpoints: string[] = [];
    let sessionId: string | undefined;
    let promptIndex = 0;
    let capturedCheckpointForCurrentPrompt = false;

    // Set up overall timeout
    const timeoutId = setTimeout(() => {
      agent.interrupt().catch(() => {
        // Ignore interrupt errors
      });
    }, timeout);

    try {
      // Queue first message
      const firstPrompt = prompts[promptIndex];
      if (!firstPrompt) throw new Error('First prompt not found');
      agent.queueMessage(firstPrompt);
      promptIndex++;

      // Collect responses in a single loop
      for await (const sdkMessage of agent.receiveResponse()) {
        log(
          '[TEST] Message type:',
          sdkMessage.type,
          sdkMessage.type === 'system' ? (sdkMessage.subtype ?? '') : ''
        );

        // Capture session ID from init message
        if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
          sessionId = sdkMessage.session_id ?? '';
          log('[TEST] Session ID:', sessionId);
        }

        // Capture FIRST user message UUID per prompt (the actual prompt, not tool results)
        // Tool results are also "user" messages but we only want the original prompt's UUID
        if (
          sdkMessage.type === 'user' &&
          typeof sdkMessage.uuid === 'string' &&
          !capturedCheckpointForCurrentPrompt
        ) {
          const checkpointId = sdkMessage.uuid;
          checkpoints.push(checkpointId);
          capturedCheckpointForCurrentPrompt = true;
          log('[TEST] Checkpoint ID:', checkpointId);
        }

        // On result, queue next message if available
        if (sdkMessage.type === 'result') {
          if (promptIndex < prompts.length) {
            log('[TEST] Queuing next message:', promptIndex);
            const nextPrompt = prompts[promptIndex];
            if (!nextPrompt) throw new Error('Next prompt not found');
            agent.queueMessage(nextPrompt);
            promptIndex++;
            capturedCheckpointForCurrentPrompt = false; // Reset for next prompt
          } else {
            // All messages processed, break
            break;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return { checkpoints, sessionId };
  }

  /**
   * Simple helper for single-message conversations
   */
  async function sendMessage(
    agent: OrbitAgent,
    message: string,
    timeout = TIMEOUT_SHORT
  ): Promise<{ checkpointId?: string; sessionId?: string }> {
    const result = await runConversation(agent, [message], timeout);
    return {
      checkpointId: result.checkpoints[0],
      sessionId: result.sessionId,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Basic checkpoint capture
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'captures checkpoint ID from user message',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      const { sessionId, checkpointId } = await sendMessage(
        agent,
        'Say "test" only. Do not use any tools.'
      );

      expect(sessionId).toBeDefined();
      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
      if (checkpointId !== undefined) {
        expect(checkpointId.length).toBeGreaterThan(0);
      }

      // Verify we can get the SDK session ID through the agent
      const agentSessionId = agent.getCurrentSessionId();
      expect(agentSessionId).toBe(sessionId);
    },
    TIMEOUT_SHORT
  );

  // ═══════════════════════════════════════════════════════════════
  // File rewind tests
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'rewinds file to previous checkpoint',
    async () => {
      const testFile = join(testDir, 'rewind.txt');

      agent = createTestAgent();
      await agent.startSession();

      // Run both turns in one conversation
      // Checkpoint is captured BEFORE the message is processed:
      // - checkpoints[0]: state before "create v1" → file doesn't exist
      // - checkpoints[1]: state before "overwrite v2" → file has "v1"
      const { checkpoints, sessionId } = await runConversation(agent, [
        `Create file ${testFile} with exactly the text "v1" (nothing else). Use Write tool once.`,
        `Overwrite file ${testFile} with exactly the text "v2" (nothing else). Use Write tool once.`,
      ]);

      expect(sessionId).toBeDefined();
      expect(checkpoints.length).toBe(2);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('v2');
      log('[TEST] File after both turns:', readFileSync(testFile, 'utf-8'));

      // Rewind to checkpoint 2 (before "overwrite v2" was processed)
      // This restores the file to "v1"
      const checkpoint1a = checkpoints[1];
      if (!checkpoint1a) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1a);
      log('[TEST] Rewound to checkpoint:', checkpoint1a);

      expect(readFileSync(testFile, 'utf-8').trim()).toBe('v1');
      log('[TEST] File after rewind:', readFileSync(testFile, 'utf-8'));
    },
    TIMEOUT_LONG
  );

  it.skipIf(!hasCredentials)(
    'restores deleted file on rewind',
    async () => {
      const testFile = join(testDir, 'deleted.txt');
      // NOTE: File must be created BY THE AGENT (not beforehand) for SDK to checkpoint it.
      // The SDK only tracks files that are modified during the session.

      agent = createTestAgent();
      await agent.startSession();

      // Run conversation: create file, then delete it
      // Checkpoint is captured BEFORE processing:
      // - checkpoints[0]: file doesn't exist (before create)
      // - checkpoints[1]: file exists with "original" (before delete)
      const { checkpoints, sessionId } = await runConversation(agent, [
        `Create file ${testFile} with exactly the text "original" (nothing else). Use Write tool once.`,
        `Delete the file ${testFile} using the Bash tool with rm command.`,
      ]);

      expect(sessionId).toBeDefined();
      expect(checkpoints.length).toBe(2);
      expect(existsSync(testFile)).toBe(false);
      log('[TEST] File deleted');

      // Rewind to checkpoint 2 (before "delete" was processed)
      // File should be restored to its pre-delete state
      const checkpoint1b = checkpoints[1];
      if (!checkpoint1b) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1b);
      log('[TEST] Rewound to checkpoint:', checkpoint1b);

      expect(existsSync(testFile)).toBe(true);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('original');
      log('[TEST] File restored after rewind');
    },
    TIMEOUT_LONG
  );

  it.skipIf(!hasCredentials)(
    'rewinds multiple files',
    async () => {
      const fileA = join(testDir, 'file-a.txt');
      const fileB = join(testDir, 'file-b.txt');

      agent = createTestAgent();
      await agent.startSession();

      // Run conversation: create both files, then modify both
      // Checkpoint is captured BEFORE processing:
      // - checkpoints[0]: files don't exist (before create)
      // - checkpoints[1]: files have a1/b1 (before modify)
      const { checkpoints, sessionId } = await runConversation(agent, [
        `Create two files: ${fileA} with content "a1" and ${fileB} with content "b1". Use Write tool for each.`,
        `Overwrite ${fileA} with "a2" and ${fileB} with "b2". Use Write tool for each.`,
      ]);

      expect(sessionId).toBeDefined();
      expect(checkpoints.length).toBe(2);
      expect(readFileSync(fileA, 'utf-8').trim()).toBe('a2');
      expect(readFileSync(fileB, 'utf-8').trim()).toBe('b2');

      // Rewind to checkpoint 2 (before modify) - files should have a1/b1
      const checkpoint1c = checkpoints[1];
      if (!checkpoint1c) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1c);

      expect(readFileSync(fileA, 'utf-8').trim()).toBe('a1');
      expect(readFileSync(fileB, 'utf-8').trim()).toBe('b1');
    },
    TIMEOUT_LONG
  );

  it.skipIf(!hasCredentials)(
    'rewinds to middle checkpoint',
    async () => {
      const testFile = join(testDir, 'versions.txt');

      agent = createTestAgent();
      await agent.startSession();

      // Run all three turns in one conversation
      // Checkpoint is captured BEFORE processing:
      // - checkpoints[0]: file doesn't exist (before v1)
      // - checkpoints[1]: file has v1 (before v2)
      // - checkpoints[2]: file has v2 (before v3)
      const { checkpoints, sessionId } = await runConversation(agent, [
        `Create ${testFile} with exactly "v1".`,
        `Overwrite ${testFile} with exactly "v2".`,
        `Overwrite ${testFile} with exactly "v3".`,
      ]);

      expect(sessionId).toBeDefined();
      expect(checkpoints.length).toBe(3);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('v3');

      // Rewind to checkpoint 2 (before v2 was written, so file has v1)
      const checkpoint1d = checkpoints[1];
      if (!checkpoint1d) throw new Error('Checkpoint not found');
      await agent.rewindFiles(checkpoint1d);

      expect(readFileSync(testFile, 'utf-8').trim()).toBe('v1');
    },
    TIMEOUT_LONG
  );

  // ═══════════════════════════════════════════════════════════════
  // Error handling tests
  // ═══════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'rejects invalid checkpoint ID',
    async () => {
      agent = createTestAgent();
      await agent.startSession();

      // Send a message to establish a session
      await sendMessage(agent, 'Say "test"');

      let threw = false;
      let errorMessage = '';

      try {
        await agent.rewindFiles('invalid-checkpoint-xyz');
      } catch (err) {
        threw = true;
        errorMessage = err instanceof Error ? err.message : String(err);
        log('[TEST] Expected error:', errorMessage);
      }

      expect(threw).toBe(true);
      expect(errorMessage.toLowerCase()).toContain('checkpoint');
    },
    TIMEOUT_SHORT
  );
});
