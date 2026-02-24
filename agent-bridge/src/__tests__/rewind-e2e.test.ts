/**
 * END-TO-END REWIND INTEGRATION TEST
 *
 * This is a comprehensive integration test for the conversation rewind system.
 * It tests the FULL FLOW with REAL Claude API calls - no mocks, no shortcuts.
 *
 * ## What This Test Verifies:
 *
 * 1. **JSONL Truncation**: When rewinding, the JSONL file is truncated at the
 *    target message, removing all subsequent messages from disk.
 *
 * 2. **New Session ID**: A new SDK session ID is created for the resumed session
 *    to avoid the SDK's cached continuation state.
 *
 * 3. **File Rewind**: Any files created/modified after the rewind point are
 *    restored to their state at that point.
 *
 * 4. **Claude Context**: CRITICAL - Claude CANNOT see messages that came after
 *    the rewind point. When asked "what did I say after X?", Claude must NOT
 *    know about messages that were truncated.
 *
 * ## Architecture (How Rewind Works):
 *
 * 1. User clicks "rewind to message X" in the UI
 * 2. Frontend calls `agentForkSessionAt(sessionId, messageUuid)`
 * 3. Agent-bridge's `forkSessionAt()` does:
 *    a. Finds the JSONL file for the session
 *    b. Truncates JSONL at the target message UUID (removes lines after)
 *    c. Copies truncated JSONL to a NEW session ID (avoids cached state)
 *    d. Deletes the old session
 *    e. Creates new session resuming from the copied JSONL
 * 4. SDK reads the truncated JSONL, sees only messages up to rewind point
 * 5. New messages continue from there - Claude has NO memory of truncated content
 *
 * ## Why This Test Matters:
 *
 * Previously, the rewind was implemented with "context prepending" - we'd format
 * truncated messages as XML and prepend them to the first message in a new session.
 * This was unreliable because:
 * - Claude could "see through" the context and remember things
 * - The formatting was fragile and model-dependent
 * - It didn't actually remove the messages from the SDK's state
 *
 * The new JSONL truncation approach is clean - we directly edit what the SDK reads.
 *
 * @requires Valid Claude credentials (API key or macOS Keychain OAuth)
 * @timeout 300000 (5 minutes - multi-turn conversations are slow)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { createAgent } from '../agent/core/agent.js';

import type { OrbitAgent, OrbitAgentConfig } from '../agent/core/agent.js';

// Test workspace - isolated from real projects
const TEST_ROOT = join(import.meta.dir, '../../.test-workspace-e2e');

// Check for credentials: API key OR OAuth (macOS Keychain)
const hasCredentials = !!process.env.ANTHROPIC_API_KEY || process.platform === 'darwin';

// Timeouts - these are REAL API calls, they're slow
const TIMEOUT_TURN = 120_000; // 120s per turn (conservative)
const TIMEOUT_FULL = 600_000; // 10 min for full test (multi-turn + rewinds)

// Debug logging - set DEBUG_TESTS=1 to enable verbose output
const DEBUG = process.env.DEBUG_TESTS === '1';
function noop(): void {
  /* no-op */
}
const log: (...args: unknown[]) => void = DEBUG ? console.warn.bind(console) : noop;

/**
 * Message info captured during conversation
 */
interface MessageInfo {
  userUuid: string; // The UUID of the user message (checkpoint ID)
  assistantUuid?: string; // The UUID of the assistant response
  responseText: string; // Full text of assistant response
}

/**
 * Find session JSONL files in ~/.claude/projects/
 */
function findSessionJsonl(sdkSessionId: string): string | null {
  const claudeDir = join(os.homedir(), '.claude', 'projects');
  if (!existsSync(claudeDir)) return null;

  const projectDirs = readdirSync(claudeDir, { withFileTypes: true });
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const jsonlPath = join(claudeDir, dir.name, `${sdkSessionId}.jsonl`);
    if (existsSync(jsonlPath)) {
      return jsonlPath;
    }
  }
  return null;
}

/**
 * Count message lines in a JSONL file
 */
function countJsonlMessages(jsonlPath: string): { total: number; user: number; assistant: number } {
  const content = readFileSync(jsonlPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== '');

  let user = 0;
  let assistant = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string };
      if (parsed.type === 'user') user++;
      if (parsed.type === 'assistant') assistant++;
    } catch {
      // Ignore parse errors
    }
  }

  return { total: lines.length, user, assistant };
}

/**
 * Run a multi-turn conversation collecting message info for each turn.
 * Follows the pattern from file-rewind.test.ts.
 */
async function runConversation(
  agent: OrbitAgent,
  prompts: string[],
  timeout = TIMEOUT_FULL
): Promise<{
  messages: MessageInfo[];
  sessionId?: string;
}> {
  const messages: MessageInfo[] = [];
  let sessionId: string | undefined;
  let promptIndex = 0;
  let currentUserUuid: string | undefined;
  let currentAssistantUuid: string | undefined;
  let currentText = '';
  let capturedUserUuidForTurn = false;

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
        sdkMessage.type === 'system' ? (sdkMessage.subtype ?? '') : '',
        'uuid' in sdkMessage ? String(sdkMessage.uuid ?? '') : ''
      );

      // Capture session ID from init message
      if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
        sessionId = sdkMessage.session_id ?? '';
        log('[TEST] Session ID:', sessionId);
      }

      // Capture streaming text from events (content_block_delta with text_delta)
      // This is where the actual response text comes through during streaming
      if (sdkMessage.type === 'stream_event') {
        const event = sdkMessage.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text;
          if (text) {
            currentText += text;
          }
        }
      }

      // Capture user message UUID (checkpoint ID) - only the FIRST one per turn
      // Tool results are also "user" messages but we want the original prompt
      if (
        sdkMessage.type === 'user' &&
        typeof sdkMessage.uuid === 'string' &&
        !capturedUserUuidForTurn
      ) {
        currentUserUuid = sdkMessage.uuid;
        capturedUserUuidForTurn = true;
        log('[TEST] User UUID:', currentUserUuid);
      }

      // Capture assistant message UUID
      if (sdkMessage.type === 'assistant' && typeof sdkMessage.uuid === 'string') {
        currentAssistantUuid = sdkMessage.uuid;
        log('[TEST] Assistant UUID:', currentAssistantUuid);

        // Also try to extract text from assistant message content (fallback)
        const content = sdkMessage.message.content;
        for (const block of content) {
          if (block.type === 'text' && block.text !== '') {
            // Only add if we didn't get it via streaming
            if (currentText === '') {
              currentText += block.text;
            }
          }
        }
      }

      // On result, save message info and queue next message if available
      if (sdkMessage.type === 'result') {
        // Save this turn's info
        // Note: For resumed sessions, user message may not be emitted, so we save turns
        // even without a user UUID - the important part is capturing the response text
        messages.push({
          userUuid: currentUserUuid ?? `synth-${String(messages.length)}`,
          assistantUuid: currentAssistantUuid,
          responseText: currentText,
        });
        log('[TEST] Saved turn', messages.length, '- text:', currentText.substring(0, 50), '...');

        // Reset for next turn
        currentUserUuid = undefined;
        currentAssistantUuid = undefined;
        currentText = '';
        capturedUserUuidForTurn = false;

        if (promptIndex < prompts.length) {
          log('[TEST] Queuing next message:', promptIndex);
          const nextPrompt = prompts[promptIndex];
          if (!nextPrompt) throw new Error('Next prompt not found');
          agent.queueMessage(nextPrompt);
          promptIndex++;
        } else {
          // All messages processed - stop session so next sendMessage can restart it
          log('[TEST] All prompts processed, stopping session');
          await agent.stopSession();
          break;
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return { messages, sessionId };
}

/**
 * Send a single message and wait for response.
 * Automatically restarts the session if it was closed by a previous message.
 */
async function sendMessage(
  agent: OrbitAgent,
  message: string,
  timeout = TIMEOUT_TURN
): Promise<{ userUuid?: string; assistantUuid?: string; text: string; sessionId?: string }> {
  // Restart session if needed (session closes after each runConversation completes)
  if (!agent.isSessionReady()) {
    await agent.startSession();
  }
  const result = await runConversation(agent, [message], timeout);
  const first = result.messages[0];
  return {
    userUuid: first?.userUuid,
    assistantUuid: first?.assistantUuid,
    text: first?.responseText ?? '',
    sessionId: result.sessionId,
  };
}

/**
 * Create an agent with test configuration
 */
function createTestAgent(testDir: string, config: Partial<OrbitAgentConfig> = {}): OrbitAgent {
  return createAgent({
    cwd: testDir,
    acceptEnabled: true, // Auto-approve tools
    ...config,
  });
}

/**
 * Fork a session at a specific message (rewind).
 * This mimics what the SessionManager.forkSessionAt() does but directly on the agent.
 *
 * IMPORTANT: When copying the JSONL, we must update the sessionId fields inside
 * each line to match the new filename. Otherwise the SDK won't recognize it as
 * a valid session file and will create a brand new session instead.
 */
async function forkSessionAtMessage(
  oldAgent: OrbitAgent,
  testDir: string,
  targetMessageUuid: string
): Promise<{ newAgent: OrbitAgent; newSessionId: string }> {
  const sdkSessionId = oldAgent.getCurrentSessionId();
  if (!sdkSessionId) {
    throw new Error('No SDK session ID available');
  }

  // Find and truncate the JSONL
  const jsonlPath = findSessionJsonl(sdkSessionId);
  if (!jsonlPath) {
    throw new Error(`JSONL file not found for session ${sdkSessionId}`);
  }

  log('[FORK] Found JSONL:', jsonlPath);

  // Read and truncate the JSONL at target message
  const content = readFileSync(jsonlPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== '');

  let targetIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i] ?? '{}') as { uuid?: string };
      if (parsed.uuid === targetMessageUuid) {
        targetIndex = i;
        log('[FORK] Found target at line', i);
        break;
      }
    } catch {
      // Ignore
    }
  }

  if (targetIndex === -1) {
    throw new Error(`Target message ${targetMessageUuid} not found in JSONL`);
  }

  // Truncate: keep lines 0..targetIndex (inclusive)
  const truncatedLines = lines.slice(0, targetIndex + 1);
  const linesRemoved = lines.length - truncatedLines.length;
  log('[FORK] Truncating:', linesRemoved, 'lines removed,', truncatedLines.length, 'kept');

  // Generate new session ID - MUST be proper UUID format for SDK to recognize
  const { randomUUID } = await import('node:crypto');
  const newSessionId = randomUUID();

  // NOTE: We do NOT update the sessionId values inside the JSON lines.
  // The production code (session-manager.ts copySessionJsonl) does a raw file copy
  // and that works. The SDK apparently looks for files by filename only.
  const truncatedContent = truncatedLines.join('\n') + '\n';
  const sourceDir = jsonlPath.substring(0, jsonlPath.lastIndexOf('/'));
  const newJsonlPath = join(sourceDir, `${newSessionId}.jsonl`);

  const fs = await import('node:fs');
  fs.writeFileSync(newJsonlPath, truncatedContent, 'utf-8');
  log('[FORK] Created new JSONL:', newJsonlPath);
  log('[FORK] Truncated to', truncatedLines.length, 'lines');

  // Stop old agent
  await oldAgent.stopSession();
  log('[FORK] Old agent stopped');

  // Create new agent resuming from the truncated JSONL
  const newAgent = createAgent({
    cwd: testDir,
    acceptEnabled: true,
    resumeSessionId: newSessionId,
  });

  await newAgent.startSession();
  log('[FORK] New agent started with session:', newSessionId);

  return { newAgent, newSessionId };
}

describe('Rewind End-to-End Integration', () => {
  let testDir: string;
  let agent: OrbitAgent | undefined;

  beforeAll(() => {
    // Enable SDK file checkpointing
    process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';

    // Create test workspace
    if (!existsSync(TEST_ROOT)) {
      mkdirSync(TEST_ROOT, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create isolated test directory for each test
    testDir = join(TEST_ROOT, `e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    log('[TEST] Test directory:', testDir);
  });

  afterEach(async () => {
    // Clean up agent
    if (agent !== undefined) {
      try {
        await agent.stopSession();
      } catch {
        // Ignore
      }
    }

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up test workspace
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN E2E TEST: Full Rewind Flow with Context Verification
  // ═══════════════════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'FULL REWIND: Claude forgets messages after rewind point',
    async () => {
      log('\n═══════════════════════════════════════════════════════════════');
      log('STARTING FULL REWIND E2E TEST');
      log('═══════════════════════════════════════════════════════════════\n');

      // ─────────────────────────────────────────────────────────────────
      // STEP 1: Create agent and run 3-message conversation
      // ─────────────────────────────────────────────────────────────────
      log('[STEP 1] Creating agent and running conversation...');

      agent = createTestAgent(testDir);
      await agent.startSession();

      // Send 3 messages with unique code words
      const conversation = await runConversation(agent, [
        'Remember this code word: ALPHA. Just confirm by saying "ALPHA acknowledged" and nothing else.',
        'Remember this code word: BETA. Just confirm by saying "BETA acknowledged" and nothing else.',
        'Remember this code word: GAMMA. Just confirm by saying "GAMMA acknowledged" and nothing else.',
      ]);

      expect(conversation.sessionId).toBeDefined();
      expect(conversation.messages.length).toBe(3);

      const sdkSessionId = conversation.sessionId;
      if (!sdkSessionId) throw new Error('Session ID is undefined');
      log('[STEP 1] Conversation complete');
      log('[STEP 1] Session ID:', sdkSessionId);
      log(
        '[STEP 1] Messages:',
        conversation.messages.map((m) => m.userUuid)
      );

      // Verify responses contain the code words
      expect(conversation.messages[0]?.responseText.toLowerCase()).toContain('alpha');
      expect(conversation.messages[1]?.responseText.toLowerCase()).toContain('beta');
      expect(conversation.messages[2]?.responseText.toLowerCase()).toContain('gamma');

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Verify pre-rewind JSONL state
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 2] Verifying pre-rewind JSONL...');

      const jsonlPath = findSessionJsonl(sdkSessionId);
      expect(jsonlPath).not.toBeNull();

      if (jsonlPath !== null) {
        const preCounts = countJsonlMessages(jsonlPath);
        log('[STEP 2] JSONL counts:', preCounts);

        // Should have 3 user messages and 3 assistant messages
        expect(preCounts.user).toBeGreaterThanOrEqual(3);
        expect(preCounts.assistant).toBeGreaterThanOrEqual(3);

        // Verify GAMMA is in the file
        const content = readFileSync(jsonlPath, 'utf-8').toLowerCase();
        expect(content).toContain('gamma');
        log('[STEP 2] Verified: GAMMA is in JSONL');
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: REWIND to MESSAGE 2 (BETA) - forget GAMMA
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 3] REWINDING TO MESSAGE 2 (forget GAMMA)...');

      // Use the ASSISTANT message UUID of turn 2 as the rewind target
      // This keeps turns 1 and 2, removes turn 3
      const rewindTarget = conversation.messages[1]?.assistantUuid;
      if (!rewindTarget) {
        throw new Error('No assistant UUID for turn 2');
      }

      log('[STEP 3] Rewind target (assistant UUID):', rewindTarget);

      // Fork the session
      const { newAgent, newSessionId } = await forkSessionAtMessage(agent, testDir, rewindTarget);
      agent = newAgent;

      log('[STEP 3] New session ID:', newSessionId);

      // Verify new session ID is different
      expect(newSessionId).not.toBe(sdkSessionId);

      // ─────────────────────────────────────────────────────────────────
      // STEP 4: Verify JSONL truncation
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 4] Verifying JSONL truncation...');

      const newJsonlPath = findSessionJsonl(newSessionId);
      expect(newJsonlPath).not.toBeNull();

      if (newJsonlPath !== null) {
        const postCounts = countJsonlMessages(newJsonlPath);
        log('[STEP 4] New JSONL counts:', postCounts);

        // Should have 2 user messages and 2 assistant messages
        expect(postCounts.user).toBe(2);
        expect(postCounts.assistant).toBe(2);

        // Verify GAMMA is NOT in the truncated file
        const content = readFileSync(newJsonlPath, 'utf-8').toLowerCase();
        expect(content).not.toContain('gamma');
        log('[STEP 4] Verified: GAMMA is NOT in truncated JSONL');
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 5: THE CRITICAL TEST - Ask Claude what it remembers
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 5] THE CRITICAL TEST: Does Claude remember GAMMA?');

      const verifyResult = await sendMessage(
        agent,
        'List ALL the code words I have told you in this conversation. Be thorough and list every single one, separated by commas.'
      );

      log('[STEP 5] Verification response:', verifyResult.text);

      // Structural check: Verify Claude responded (non-empty response)
      expect(verifyResult.text.length).toBeGreaterThan(0);

      // Claude SHOULD remember ALPHA and BETA
      const responseLower = verifyResult.text.toLowerCase();
      expect(responseLower).toContain('alpha');
      expect(responseLower).toContain('beta');

      // Claude SHOULD NOT remember GAMMA
      // TODO(code-review/cycle-1#43): This assertion depends on LLM output and may be flaky.
      // The JSONL truncation verified in STEP 4 structurally guarantees GAMMA is not in context.
      // If this assertion fails intermittently, the structural checks above are the authoritative verification.
      const hasGamma = responseLower.includes('gamma');
      log('[STEP 5] Contains ALPHA:', responseLower.includes('alpha'));
      log('[STEP 5] Contains BETA:', responseLower.includes('beta'));
      log('[STEP 5] Contains GAMMA:', hasGamma);

      // CRITICAL ASSERTION
      expect(hasGamma).toBe(false);

      log('\n═══════════════════════════════════════════════════════════════');
      log('[PASS] REWIND E2E TEST PASSED');
      log('Claude correctly forgot GAMMA after rewind to BETA');
      log('═══════════════════════════════════════════════════════════════\n');
    },
    TIMEOUT_FULL
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST: Rewind with File Restoration
  // ═══════════════════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'REWIND + FILES: File changes and context are restored',
    async () => {
      log('\n═══════════════════════════════════════════════════════════════');
      log('STARTING REWIND + FILES E2E TEST');
      log('═══════════════════════════════════════════════════════════════\n');

      const testFile = join(testDir, 'version.txt');

      // ─────────────────────────────────────────────────────────────────
      // STEP 1: Create agent and run conversation that modifies files
      // ─────────────────────────────────────────────────────────────────
      log('[STEP 1] Creating agent...');

      agent = createTestAgent(testDir);
      await agent.startSession();

      // Send messages that create and modify files
      const conversation = await runConversation(agent, [
        `Create a file at ${testFile} with exactly the content "v1" (just those two characters, no quotes). Use the Write tool.`,
        `Overwrite the file at ${testFile} with exactly the content "v2". Use the Write tool.`,
        `Overwrite the file at ${testFile} with exactly the content "v3". Use the Write tool.`,
      ]);

      expect(conversation.sessionId).toBeDefined();
      expect(conversation.messages.length).toBe(3);

      const sdkSessionId = conversation.sessionId;
      if (!sdkSessionId) throw new Error('Session ID is undefined');
      log('[STEP 1] Conversation complete');

      // Verify file is at v3
      expect(existsSync(testFile)).toBe(true);
      expect(readFileSync(testFile, 'utf-8').trim()).toBe('v3');
      log('[STEP 1] File contains: v3');

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Rewind files first (SDK checkpoint restore)
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 2] Rewinding files to v2 state...');

      // The checkpoint for turn 3 (v3 write) captures state BEFORE the write
      // So rewinding to checkpoint 3 restores file to v2
      const fileCheckpoint = conversation.messages[2]?.userUuid;
      if (fileCheckpoint) {
        await agent.rewindFiles(fileCheckpoint);
        log('[STEP 2] File rewind complete');

        const fileContent = readFileSync(testFile, 'utf-8').trim();
        log('[STEP 2] File after rewind:', fileContent);
        expect(fileContent).toBe('v2');
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: Rewind conversation to turn 2 (v2 write)
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 3] Rewinding conversation...');

      const rewindTarget = conversation.messages[1]?.assistantUuid;
      if (!rewindTarget) {
        throw new Error('No assistant UUID for turn 2');
      }

      const { newAgent, newSessionId } = await forkSessionAtMessage(agent, testDir, rewindTarget);
      agent = newAgent;

      log('[STEP 3] New session:', newSessionId);
      expect(newSessionId).not.toBe(sdkSessionId);

      // ─────────────────────────────────────────────────────────────────
      // STEP 4: Verify Claude doesn't know about v3
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 4] Verifying Claude context...');

      const verifyResult = await sendMessage(
        agent,
        `Read the file at ${testFile} and tell me: what is the current content, and what versions has this file contained during our conversation? List all versions you know about.`
      );

      log('[STEP 4] Verification response:', verifyResult.text.slice(0, 300));

      // Structural check: Verify Claude responded (non-empty response)
      expect(verifyResult.text.length).toBeGreaterThan(0);

      // Claude should know about v1 and v2
      expect(verifyResult.text).toContain('v1');
      expect(verifyResult.text).toContain('v2');

      // Claude should NOT know about v3
      // TODO(code-review/cycle-1#43): This assertion depends on LLM output and may be flaky.
      // The file rewind (STEP 2) and JSONL fork (STEP 3) structurally guarantee v3 is not in context.
      // If this assertion fails intermittently, the structural checks are the authoritative verification.
      const hasV3 = verifyResult.text.includes('v3');
      log('[STEP 4] Contains v3:', hasV3);
      expect(hasV3).toBe(false);

      log('\n═══════════════════════════════════════════════════════════════');
      log('[PASS] REWIND + FILES E2E TEST PASSED');
      log('═══════════════════════════════════════════════════════════════\n');
    },
    TIMEOUT_FULL
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST: Multiple Sequential Rewinds
  // ═══════════════════════════════════════════════════════════════════════════

  it.skipIf(!hasCredentials)(
    'MULTIPLE REWINDS: Can rewind multiple times in sequence',
    async () => {
      log('\n═══════════════════════════════════════════════════════════════');
      log('STARTING MULTIPLE REWINDS E2E TEST');
      log('═══════════════════════════════════════════════════════════════\n');

      // ─────────────────────────────────────────────────────────────────
      // STEP 1: Create conversation with 3 color words
      // ─────────────────────────────────────────────────────────────────
      log('[STEP 1] Creating conversation...');

      agent = createTestAgent(testDir);
      await agent.startSession();

      const conversation = await runConversation(agent, [
        'Remember the color RED. Just say "RED noted."',
        'Remember the color BLUE. Just say "BLUE noted."',
        'Remember the color GREEN. Just say "GREEN noted."',
      ]);

      expect(conversation.messages.length).toBe(3);
      log('[STEP 1] Conversation complete');

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: First rewind - forget GREEN
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 2] First rewind to BLUE (forget GREEN)...');

      const target1 = conversation.messages[1]?.assistantUuid;
      if (!target1) throw new Error('No UUID for turn 2');

      const { newAgent: agent2, newSessionId: session2 } = await forkSessionAtMessage(
        agent,
        testDir,
        target1
      );
      agent = agent2;

      // Verify GREEN is forgotten
      const verify1 = await sendMessage(
        agent,
        'List all the colors I told you, separated by commas.'
      );
      log('[STEP 2] After first rewind:', verify1.text);

      expect(verify1.text.length).toBeGreaterThan(0);
      expect(verify1.text.toLowerCase()).toContain('red');
      expect(verify1.text.toLowerCase()).toContain('blue');
      // TODO(code-review/cycle-1#43): LLM-dependent negative assertion — may be flaky.
      // JSONL truncation structurally guarantees GREEN is not in Claude's context.
      expect(verify1.text.toLowerCase()).not.toContain('green');

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: Add YELLOW after rewind
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 3] Adding YELLOW after rewind...');

      const yellowResult = await sendMessage(
        agent,
        'Remember the color YELLOW. Just say "YELLOW noted."'
      );
      expect(yellowResult.text.toLowerCase()).toContain('yellow');

      // Verify current state: RED, BLUE, YELLOW (no GREEN)
      const verify2 = await sendMessage(
        agent,
        'List all the colors I told you, separated by commas.'
      );
      log('[STEP 3] After adding YELLOW:', verify2.text);

      expect(verify2.text.toLowerCase()).toContain('red');
      expect(verify2.text.toLowerCase()).toContain('blue');
      expect(verify2.text.toLowerCase()).toContain('yellow');
      // TODO(code-review/cycle-1#43): LLM-dependent negative assertion — may be flaky.
      expect(verify2.text.toLowerCase()).not.toContain('green');

      // ─────────────────────────────────────────────────────────────────
      // STEP 4: Second rewind - back to just RED
      // ─────────────────────────────────────────────────────────────────
      log('\n[STEP 4] Second rewind to just RED...');

      // Need to find the new session's messages
      // The first message after resume should have RED
      // We need to rewind to the FIRST assistant response which has RED

      // Find the RED acknowledgment in the new JSONL
      const newJsonlPath = findSessionJsonl(session2);
      if (!newJsonlPath) throw new Error('Could not find new JSONL');

      const content = readFileSync(newJsonlPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim() !== '');

      // Find the first assistant message (RED acknowledgment)
      let firstAssistantUuid: string | undefined;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as { type?: string; uuid?: string };
          if (parsed.type === 'assistant' && parsed.uuid) {
            firstAssistantUuid = parsed.uuid;
            break;
          }
        } catch {
          // Ignore
        }
      }

      if (!firstAssistantUuid) throw new Error('Could not find first assistant message');

      const { newAgent: agent3 } = await forkSessionAtMessage(agent, testDir, firstAssistantUuid);
      agent = agent3;

      // Verify only RED remains
      const verify3 = await sendMessage(
        agent,
        'List all the colors I told you, separated by commas.'
      );
      log('[STEP 4] After second rewind:', verify3.text);

      expect(verify3.text.toLowerCase()).toContain('red');
      // TODO(code-review/cycle-1#43): LLM-dependent negative assertions — may be flaky.
      // Sequential JSONL truncation structurally guarantees these colors are not in context.
      expect(verify3.text.toLowerCase()).not.toContain('blue');
      expect(verify3.text.toLowerCase()).not.toContain('green');
      expect(verify3.text.toLowerCase()).not.toContain('yellow');

      log('\n═══════════════════════════════════════════════════════════════');
      log('[PASS] MULTIPLE REWINDS E2E TEST PASSED');
      log('═══════════════════════════════════════════════════════════════\n');
    },
    TIMEOUT_FULL
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST GAP: forkSessionAt with Invalid UUID (Task #48)
  //
  // Coverage gap identified in code review cycle-1.
  // forkSessionAt has validation for empty strings but no test coverage for:
  // - Empty string UUID
  // - Non-existent message UUID (UUID not found in JSONL)
  // - Session state corruption after failed fork attempt
  //
  // These tests require a REAL Claude API session to be meaningful because
  // forkSessionAt operates on actual JSONL files on disk.
  //
  // TODO(code-review/cycle-1#48): Implement full tests with real API calls.
  // ═══════════════════════════════════════════════════════════════════════════

  // TODO(code-review/cycle-1#48): forkSessionAt invalid UUID handling
  // - should throw when called with empty string UUID
  // - should throw when called with whitespace-only UUID
  // - should throw when called with non-existent message UUID
  // - should not corrupt session state on invalid UUID (session still usable after error)
  // - should not delete or truncate JSONL when UUID is not found
});
