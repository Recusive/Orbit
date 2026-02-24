/**
 * Session Title Service — standalone module for generating and persisting session titles.
 *
 * Three responsibilities:
 * 1. `generateFallbackTitle()` — smart truncation of message text (used as placeholder)
 * 2. `applySessionTitle()` — write title to both UIStore (memory) and Rust backend (disk)
 * 3. `generateAITitle()` — call Haiku via agent-bridge to create a concise summary title
 *
 * The Rust backend persists titles as `{"type":"custom-title","title":"..."}` JSONL lines,
 * matching the Claude Code CLI convention. The backend already reads this format with
 * highest priority in `parse_title_line()`.
 */
import { createLogger } from '@orbit/common/lib';

import { conversationUpdateTitle, generateSessionTitle } from '@/lib/api';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('SessionTitleService');

/** Default maximum character count for generated titles (matches Rust `extract_user_text_from_line`). */
const DEFAULT_MAX_CHARS = 80;

/** Regex for fenced code blocks (``` or ~~~, with optional language tag). */
const CODE_FENCE_RE = /^```[\s\S]*?^```|^~~~[\s\S]*?^~~~/gm;

/**
 * Generate a fallback display title from raw message text.
 *
 * Used as an immediate placeholder before the AI title arrives, and as
 * a fallback when the AI title generation fails.
 *
 * - Strips fenced code blocks (replaces with inline summary)
 * - Collapses whitespace (newlines, tabs, multiple spaces → single space)
 * - Truncates at a word boundary
 * - Appends "..." if truncated
 * - Returns "Untitled" for empty/whitespace-only input
 */
export function generateFallbackTitle(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  if (!text) return 'Untitled';

  // Strip fenced code blocks — they make terrible titles
  let cleaned = text.replace(CODE_FENCE_RE, '');

  // Collapse all whitespace (newlines, tabs, runs of spaces) to single spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned.length === 0) return 'Untitled';

  // If within limit, return as-is
  if (cleaned.length <= maxChars) return cleaned;

  // Truncate at the last word boundary before maxChars
  const truncated = cleaned.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');

  // If no space found (single giant word), just hard-cut
  const cutPoint = lastSpace > maxChars * 0.4 ? lastSpace : maxChars;

  return cleaned.slice(0, cutPoint) + '...';
}

/**
 * Pending titles waiting for the CLI to create the JSONL file.
 *
 * For new sessions, `applySessionTitle` fires before the CLI creates the JSONL.
 * The Rust backend correctly skips the write (file doesn't exist). We store the
 * title here and flush it when `system:init` arrives — at that point the JSONL
 * is guaranteed to exist.
 */
const pendingTitles = new Map<string, string>();

/**
 * Persist a title to JSONL via the Rust backend (fire-and-forget).
 * Reads `workspacePath` from UIStore at call time to avoid stale closures.
 */
function persistTitle(sessionId: string, title: string): void {
  const workspacePath = useUIStore.getState().workspacePath ?? undefined;
  void conversationUpdateTitle(sessionId, title, workspacePath).catch((err: unknown) => {
    logger.warn('Failed to persist session title to disk', { sessionId, err });
  });
}

/**
 * Persist a session title to both UIStore (in-memory) and the Rust backend (disk).
 *
 * For new sessions, the JSONL file doesn't exist yet (the CLI creates it when
 * processing the first message). The Rust backend silently skips the write if
 * the file is missing. The title is stored in `pendingTitles` and flushed by
 * `flushPendingTitle()` when `system:init` fires (JSONL guaranteed to exist).
 *
 * For renames of existing sessions, the immediate persist succeeds directly.
 */
export function applySessionTitle(sessionId: string, title: string): void {
  // 1. Immediate in-memory update (UIStore drives sidebar rendering)
  useUIStore.getState().updateConversationTitle(sessionId, title);

  // 2. Try to persist immediately (works for renames of existing sessions)
  persistTitle(sessionId, title);

  // 3. Store as pending — flushPendingTitle() will retry after system:init
  pendingTitles.set(sessionId, title);
}

/**
 * Flush a pending title write after the CLI has created the JSONL file.
 *
 * Called from the `system:init` handler in chat-message-service.ts.
 * At that point the JSONL file is guaranteed to exist, so the Rust backend
 * will successfully append the `custom-title` line.
 *
 * Accepts an optional `remappedFromId` for fork/remap scenarios where the
 * pending title was stored under the original frontend session ID but the
 * JSONL now uses a different SDK session ID.
 */
export function flushPendingTitle(sessionId: string, remappedFromId?: string): void {
  const title =
    pendingTitles.get(sessionId) ??
    (remappedFromId ? pendingTitles.get(remappedFromId) : undefined);

  if (!title) return;

  pendingTitles.delete(sessionId);
  if (remappedFromId) pendingTitles.delete(remappedFromId);

  persistTitle(sessionId, title);
}

/** Sessions that have already had an AI title generated (prevents duplicate calls). */
const aiTitleGenerated = new Set<string>();

/**
 * Generate an AI-powered session title and persist it.
 *
 * Calls Haiku via the agent-bridge sidecar to summarize the first user+assistant
 * exchange into a concise 3-8 word title. On success, overwrites the placeholder
 * title in both UIStore and JSONL. On failure, the placeholder remains.
 *
 * Fire-and-forget — errors are logged but never thrown to callers.
 */
export function generateAITitle(
  sessionId: string,
  userMessage: string,
  assistantResponse: string
): void {
  // Prevent duplicate calls for the same session
  if (aiTitleGenerated.has(sessionId)) return;

  void (async (): Promise<void> => {
    try {
      const title = await generateSessionTitle(userMessage, assistantResponse);
      aiTitleGenerated.add(sessionId); // Mark AFTER success — allows retry on failure
      applySessionTitle(sessionId, title);
      logger.info('AI title generated', { sessionId, title });
    } catch (err: unknown) {
      aiTitleGenerated.delete(sessionId); // Defense-in-depth: allow retry on next agent:complete
      logger.warn('AI title generation failed, will retry on next turn', { sessionId, err });
    }
  })();
}
