/**
 * DEPRECATED: Combined Rewind Tests (Files + Conversation Context)
 *
 * These tests verified the OLD rewind system that combined:
 * 1. File rewind via SDK checkpoints (still works)
 * 2. Conversation context prepending (REMOVED)
 *
 * The conversation context prepending has been replaced with a parentUuid
 * chain approach (like Claude Code uses).
 *
 * File rewind (still works):
 * - SDK's rewindFiles() restores filesystem state
 * - Tested in file-rewind.test.ts
 *
 * Old conversation approach (removed):
 * - formatConversationContext() formatted messages as XML
 * - setRewindContext() stored truncated messages
 * - Context prepended to first message in new session
 *
 * New conversation approach (Task #6):
 * - parentUuid links messages in a chain
 * - SDK handles conversation history via message ancestry
 * - No context prepending needed
 *
 * These tests will be replaced with parentUuid-based tests when Task #6 is complete.
 * File rewind tests remain valid in file-rewind.test.ts.
 *
 * @deprecated Removed as part of rewind system rebuild - see Task #5
 */

import { describe, it } from 'bun:test';

describe.skip('Combined Rewind (Files + Conversation) - DEPRECATED', () => {
  it('rewinds both files and conversation context', () => {
    // Test removed - conversation context prepending deprecated
    // File rewind still works - see file-rewind.test.ts
  });

  it('new session continues from rewind point with context', () => {
    // Test removed - conversation context prepending deprecated
  });

  it('correctly handles rewind to earliest point', () => {
    // Test removed - conversation context prepending deprecated
  });

  it('handles file deletion in rewind scenario', () => {
    // Test removed - conversation context prepending deprecated
    // File rewind still works - see file-rewind.test.ts
  });
});
