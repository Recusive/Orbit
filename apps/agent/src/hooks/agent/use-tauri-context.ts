import type { RewindContextMessage } from './types/tauri-types';

// ═══════════════════════════════════════════════════════════════
// Context Formatting
// ═══════════════════════════════════════════════════════════════

/**
 * Format conversation messages as context for Claude.
 * Uses XML-style tags for clear structure.
 *
 * ⚠️  TESTED: This function's format is verified by integration tests.
 *     If you modify the XML format, update the tests to match!
 *     Run: cd agent-bridge && bun test
 *     Test files: src/__tests__/conversation-rewind.test.ts
 *                 src/__tests__/combined-rewind.test.ts
 */
export function formatConversationContext(messages: RewindContextMessage[]): string {
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
