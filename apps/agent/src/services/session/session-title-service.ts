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
/** Maps old session IDs to canonical IDs after system:init remaps a session. */
const titleSessionAliases = new Map<string, string>();
/**
 * Most recent title applied in-memory per session. Cleared when a write is confirmed.
 *
 * Relationship to `pendingTitles`:
 * - `pendingTitles` = title waiting for JSONL creation during bootstrap.
 * - `freshestTitles` = newest in-memory title that may still be newer than disk.
 */
const freshestTitles = new Map<string, string>();
/** Sessions where the last persist returned `written === false` because JSONL was missing. */
const titlesNeedingRetry = new Set<string>();
/** Per-session generation epoch — bumped on manual rename, delete, or new AI request. */
const titleGenerationEpoch = new Map<string, number>();

type SessionTitleGlobals = typeof globalThis & {
  __orbitSessionTitlePrevWorkspacePath__?: string | null | undefined;
  __orbitSessionTitleWorkspaceUnsub__?: (() => void) | undefined;
};

const sessionTitleGlobals = globalThis as SessionTitleGlobals;

function clearAllTitleState(): void {
  freshestTitles.clear();
  pendingTitles.clear();
  aiTitleGenerated.clear();
  aiTitleInFlight.clear();
  titlesNeedingRetry.clear();
  titleSessionAliases.clear();
  titleGenerationEpoch.clear();
}

function clearAllTitleLoading(): void {
  useUIStore.setState({ titleLoadingSessions: new Set<string>() });
}

sessionTitleGlobals.__orbitSessionTitleWorkspaceUnsub__?.();
sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__ = useUIStore.getState().workspacePath;

sessionTitleGlobals.__orbitSessionTitleWorkspaceUnsub__ = useUIStore.subscribe((state) => {
  const previousWorkspacePath = sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__;
  const workspacePath = state.workspacePath;

  if (
    previousWorkspacePath !== undefined &&
    previousWorkspacePath !== null &&
    previousWorkspacePath !== workspacePath
  ) {
    sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__ = workspacePath;
    clearAllTitleState();
    clearAllTitleLoading();
    return;
  }

  sessionTitleGlobals.__orbitSessionTitlePrevWorkspacePath__ = workspacePath;
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sessionTitleGlobals.__orbitSessionTitleWorkspaceUnsub__?.();
    sessionTitleGlobals.__orbitSessionTitleWorkspaceUnsub__ = undefined;
  });
}

function deleteIfMatching(map: Map<string, string>, ids: readonly string[], title: string): void {
  for (const id of ids) {
    if (map.get(id) === title) {
      map.delete(id);
    }
  }
}

function getSessionIdVariants(sessionId: string): string[] {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  return canonicalId === sessionId ? [sessionId] : [sessionId, canonicalId];
}

/**
 * Persist a title to JSONL via the Rust backend.
 * Reads `workspacePath` from UIStore at call time to avoid stale closures.
 */
function persistTitle(sessionId: string, title: string): Promise<boolean> {
  const workspacePath = useUIStore.getState().workspacePath ?? undefined;
  return conversationUpdateTitle(sessionId, title, workspacePath).then((written: boolean) => {
    const sessionIds = getSessionIdVariants(sessionId);
    const canonicalId = sessionIds[sessionIds.length - 1] ?? sessionId;

    if (written) {
      for (const id of sessionIds) {
        titlesNeedingRetry.delete(id);
      }
      deleteIfMatching(freshestTitles, sessionIds, title);
      deleteIfMatching(pendingTitles, sessionIds, title);
    } else {
      titlesNeedingRetry.delete(sessionId);
      titlesNeedingRetry.add(canonicalId);
    }

    return written;
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
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);

  // 1. Immediate in-memory update (UIStore drives sidebar rendering)
  freshestTitles.set(canonicalId, title);
  useUIStore.getState().updateConversationTitle(canonicalId, title);

  // 2. Store as pending — flushPendingTitle() will retry after system:init
  pendingTitles.set(canonicalId, title);

  // 3. Try to persist immediately (works for renames of existing sessions)
  void persistTitle(canonicalId, title).catch((err: unknown) => {
    logger.warn('Failed to persist session title to disk', { sessionId: canonicalId, err });
  });
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
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  const remappedCanonicalId =
    remappedFromId === undefined ? undefined : resolveCanonicalTitleSessionId(remappedFromId);
  const title =
    pendingTitles.get(canonicalId) ??
    pendingTitles.get(sessionId) ??
    (remappedCanonicalId ? pendingTitles.get(remappedCanonicalId) : undefined) ??
    (remappedFromId ? pendingTitles.get(remappedFromId) : undefined);

  if (!title) return;

  pendingTitles.delete(canonicalId);
  pendingTitles.delete(sessionId);
  if (remappedCanonicalId) pendingTitles.delete(remappedCanonicalId);
  if (remappedFromId) pendingTitles.delete(remappedFromId);

  void persistTitle(canonicalId, title).catch((err: unknown) => {
    logger.warn('Failed to flush pending title to disk', { sessionId: canonicalId, err });
  });
}

/** Sessions that have already had an AI title generated (prevents duplicate calls). */
const aiTitleGenerated = new Set<string>();
/** Sessions with an AI title request currently in progress (dedupes concurrent calls). */
const aiTitleInFlight = new Set<string>();

function bumpTitleEpoch(sessionId: string): number {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  const next = (titleGenerationEpoch.get(canonicalId) ?? 0) + 1;
  titleGenerationEpoch.set(canonicalId, next);
  return next;
}

function resolveCanonicalTitleSessionId(sessionId: string): string {
  let currentId = sessionId;
  const seen = new Set<string>();

  while (!seen.has(currentId)) {
    seen.add(currentId);
    const nextId = titleSessionAliases.get(currentId);
    if (nextId === undefined) {
      break;
    }
    currentId = nextId;
  }

  if (currentId !== sessionId) {
    titleSessionAliases.set(sessionId, currentId);
  }

  return currentId;
}

/**
 * Remap title state when system:init changes a session's canonical ID.
 *
 * Aliases persist for the session lifetime. If this becomes a memory concern,
 * clear them during explicit session deletion.
 */
export function remapSessionTitleState(oldSessionId: string, newSessionId: string): void {
  titleSessionAliases.set(oldSessionId, newSessionId);

  if (aiTitleGenerated.delete(oldSessionId)) {
    aiTitleGenerated.add(newSessionId);
  }

  if (aiTitleInFlight.delete(oldSessionId)) {
    aiTitleInFlight.add(newSessionId);
  }

  const pendingTitle = pendingTitles.get(oldSessionId);
  if (pendingTitle !== undefined) {
    pendingTitles.delete(oldSessionId);
    pendingTitles.set(newSessionId, pendingTitle);
  }

  const freshestTitle = freshestTitles.get(oldSessionId);
  if (freshestTitle !== undefined) {
    freshestTitles.delete(oldSessionId);
    freshestTitles.set(newSessionId, freshestTitle);
  }

  if (titlesNeedingRetry.delete(oldSessionId)) {
    titlesNeedingRetry.add(newSessionId);
  }

  const epoch = titleGenerationEpoch.get(oldSessionId);
  if (epoch !== undefined) {
    titleGenerationEpoch.delete(oldSessionId);
    titleGenerationEpoch.set(newSessionId, epoch);
  }

  const uiStore = useUIStore.getState();
  if (uiStore.titleLoadingSessions.has(oldSessionId)) {
    uiStore.setTitleLoading(oldSessionId, false);
    uiStore.setTitleLoading(newSessionId, true);
  }
}

export function getPreferredTitle(sessionId: string): string | undefined {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  return freshestTitles.get(canonicalId) ?? freshestTitles.get(sessionId);
}

export function retryPendingPersistence(sessionId: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  if (!titlesNeedingRetry.has(canonicalId) && !titlesNeedingRetry.has(sessionId)) {
    return;
  }

  titlesNeedingRetry.delete(canonicalId);
  titlesNeedingRetry.delete(sessionId);

  const title =
    freshestTitles.get(canonicalId) ??
    freshestTitles.get(sessionId) ??
    pendingTitles.get(canonicalId) ??
    pendingTitles.get(sessionId);
  if (title === undefined) {
    return;
  }

  void persistTitle(canonicalId, title).catch((err: unknown) => {
    logger.warn('Retry persist failed', { sessionId: canonicalId, err });
  });
}

export function applyManualSessionTitle(sessionId: string, title: string): Promise<boolean> {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  const wasAlreadySettled = aiTitleGenerated.has(canonicalId);

  aiTitleGenerated.add(canonicalId);
  bumpTitleEpoch(canonicalId);
  useUIStore.getState().setTitleLoading(canonicalId, false);

  freshestTitles.set(canonicalId, title);
  useUIStore.getState().updateConversationTitle(canonicalId, title);
  return persistTitle(canonicalId, title).catch((err: unknown) => {
    if (freshestTitles.get(canonicalId) === title) {
      freshestTitles.delete(canonicalId);
    }
    titlesNeedingRetry.delete(canonicalId);
    if (!wasAlreadySettled) {
      aiTitleGenerated.delete(canonicalId);
    }
    throw err;
  });
}

export function clearSessionTitleState(sessionId: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);

  bumpTitleEpoch(canonicalId);
  useUIStore.getState().setTitleLoading(canonicalId, false);
  useUIStore.getState().setTitleLoading(sessionId, false);

  freshestTitles.delete(canonicalId);
  freshestTitles.delete(sessionId);
  pendingTitles.delete(canonicalId);
  pendingTitles.delete(sessionId);
  aiTitleGenerated.delete(canonicalId);
  aiTitleGenerated.delete(sessionId);
  aiTitleInFlight.delete(canonicalId);
  aiTitleInFlight.delete(sessionId);
  titlesNeedingRetry.delete(canonicalId);
  titlesNeedingRetry.delete(sessionId);

  for (const [alias, target] of titleSessionAliases) {
    if (
      alias === canonicalId ||
      alias === sessionId ||
      target === canonicalId ||
      target === sessionId
    ) {
      titleSessionAliases.delete(alias);
    }
  }
}

/**
 * Generate an AI-powered session title and persist it.
 *
 * [warning] TESTED: This module is covered by integration tests.
 *     If you modify this, run: bun run test -- session-title-service
 *     Test file: src/__tests__/unit/services/session/session-title-service.test.ts
 *
 * Calls Haiku via the agent-bridge sidecar to summarize the first user message
 * into a concise 3-8 word title. On success,
 * overwrites the placeholder title in both UIStore and JSONL. On failure,
 * the placeholder remains.
 *
 * Fire-and-forget — errors are logged but never thrown to callers.
 */
export function generateAITitle(sessionId: string, userMessage: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);

  // Prevent duplicate calls for the same session
  if (aiTitleGenerated.has(canonicalId) || aiTitleInFlight.has(canonicalId)) return;
  const requestEpoch = bumpTitleEpoch(canonicalId);
  aiTitleInFlight.add(canonicalId);
  useUIStore.getState().setTitleLoading(canonicalId, true);

  void (async (): Promise<void> => {
    try {
      const title = await generateSessionTitle(userMessage);
      const resolvedId = resolveCanonicalTitleSessionId(sessionId);
      if (titleGenerationEpoch.get(resolvedId) !== requestEpoch) return;
      aiTitleGenerated.add(resolvedId);
      applySessionTitle(resolvedId, title);
      logger.info('AI title generated', { sessionId: resolvedId, title });
    } catch (err: unknown) {
      logger.warn('AI title generation failed, will retry on next turn', { sessionId, err });
    } finally {
      const resolvedId = resolveCanonicalTitleSessionId(sessionId);
      aiTitleInFlight.delete(resolvedId);
      if (titleGenerationEpoch.get(resolvedId) === requestEpoch) {
        useUIStore.getState().setTitleLoading(resolvedId, false);
      }
    }
  })();
}
