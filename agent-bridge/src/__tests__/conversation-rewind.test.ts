/**
 * DEPRECATED: Conversation Rewind Tests (Context Prepend)
 *
 * These tests verified the OLD rewind system that used XML context prepending.
 * That system has been removed and replaced with a parentUuid chain approach
 * (like Claude Code uses).
 *
 * Old approach (removed):
 * - formatConversationContext() formatted messages as XML
 * - setRewindContext() stored truncated messages
 * - consumeRewindContext() retrieved and prepended to first message
 *
 * New approach (Task #6):
 * - parentUuid links messages in a chain
 * - SDK handles conversation history via message ancestry
 * - No context prepending needed
 *
 * These tests will be replaced with parentUuid-based tests when Task #6 is complete.
 *
 * @deprecated Removed as part of rewind system rebuild - see Task #5
 */

import { describe, it } from 'bun:test';

describe.skip('Conversation Rewind (Context Prepend) - DEPRECATED', () => {
  it('understands XML context prepended to message', () => {
    // Test removed - old context prepend system deprecated
  });

  it('maintains continuity from multi-turn context', () => {
    // Test removed - old context prepend system deprecated
  });

  it('handles empty context gracefully', () => {
    // Test removed - old context prepend system deprecated
  });

  it('captures SDK session ID during conversation', () => {
    // Test removed - old context prepend system deprecated
  });

  it('handles special characters in context', () => {
    // Test removed - old context prepend system deprecated
  });
});
