import { createLogger } from '@orbit/common/lib';
import { parseDiffFromFile } from '@pierre/diffs';

import type { BatchFileContentResult, BatchFileRequest, DiffScope, FileDiff } from '@/lib/api';
import type { CachedParsedDiff } from '@/lib/utils/pierre-diff-cache';

import { gitBatchFileContents } from '@/lib/api';
import { PATHOLOGICAL_DIFF_THRESHOLD, buildGitFileContents } from '@/lib/utils/pierre-adapter';
import {
  getCachedParsedDiff,
  getParsedDiffCacheKey,
  setCachedParsedDiff,
} from '@/lib/utils/pierre-diff-cache';
import { useGitStore } from '@/stores/git/git-store';

const logger = createLogger('diff-prep-service');

const MAX_PREP_CONTENT_BYTES = 200_000;

export interface FileSpec {
  path: string;
  scope: DiffScope;
  oldPath: string | null;
}

export type PreparedDiffEntry = CachedParsedDiff;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface SessionFile {
  file: FileSpec;
  cacheKey: string;
}

interface PrepSession {
  id: number;
  cancelled: boolean;
  repoPath: string;
  statusRevision: number;
  sessionFiles: SessionFile[];
}

let currentSession: PrepSession | null = null;
let pendingRerun: (() => void) | null = null;
let batchIpcInFlight = false;
let sessionCounter = 0;

const inflightPromises = new Map<string, Deferred<PreparedDiffEntry | null>>();

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function buildScopeKey(scope: DiffScope, path: string): string {
  return `${scope}::${path}`;
}

function createPreparedDiffKey(
  repoPath: string,
  file: FileSpec,
  statusFingerprint: string | null
): string {
  return getParsedDiffCacheKey({
    repoPath,
    scope: file.scope,
    path: file.path,
    oldPath: file.oldPath,
    statusFingerprint,
  });
}

function countChangedLines(diff: FileDiff): number {
  let changedLines = 0;

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.origin === '+' || line.origin === '-') {
        changedLines += 1;
      }
    }
  }

  return changedLines;
}

function countPreparedChanges(fileDiff: PreparedDiffEntry['fileDiff']): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }

  return { additions, deletions };
}

function buildEligibilityMap(
  stagedDiffs: FileDiff[],
  unstagedDiffs: FileDiff[]
): Map<string, FileDiff> {
  const map = new Map<string, FileDiff>();

  for (const diff of stagedDiffs) {
    map.set(buildScopeKey('staged', diff.path), diff);
  }

  for (const diff of unstagedDiffs) {
    map.set(buildScopeKey('unstaged', diff.path), diff);
  }

  return map;
}

function isEligibleForPrep(file: FileSpec, eligibilityMap: Map<string, FileDiff>): boolean {
  const diff = eligibilityMap.get(buildScopeKey(file.scope, file.path));
  if (!diff) {
    return true;
  }

  if (diff.isBinary) {
    return false;
  }

  return countChangedLines(diff) < PATHOLOGICAL_DIFF_THRESHOLD;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function isSessionStale(session: PrepSession): boolean {
  const state = useGitStore.getState();
  return (
    session.cancelled ||
    state.repoPath !== session.repoPath ||
    state.statusRevision !== session.statusRevision
  );
}

function resolveInflight(key: string, value: PreparedDiffEntry | null): void {
  const deferred = inflightPromises.get(key);
  if (!deferred) {
    return;
  }

  inflightPromises.delete(key);
  deferred.resolve(value);
}

function clearSessionPromises(session: PrepSession): void {
  for (const { cacheKey } of session.sessionFiles) {
    resolveInflight(cacheKey, null);
  }
}

function cancelSession(session: PrepSession): void {
  session.cancelled = true;
  if (currentSession === session) {
    currentSession = null;
  }
  clearSessionPromises(session);
}

function buildResultMap(results: BatchFileContentResult[]): Map<string, BatchFileContentResult> {
  const map = new Map<string, BatchFileContentResult>();

  for (const result of results) {
    map.set(buildScopeKey(result.scope, result.file), result);
  }

  return map;
}

export function cancelDiffPrep(): void {
  if (currentSession) {
    cancelSession(currentSession);
  }

  pendingRerun = null;
}

export function getPreparedDiff(
  repoPath: string,
  scope: DiffScope,
  path: string,
  oldPath: string | null,
  statusFingerprint: string | null
): PreparedDiffEntry | undefined {
  return getCachedParsedDiff(
    getParsedDiffCacheKey({
      repoPath,
      scope,
      path,
      oldPath,
      statusFingerprint,
    })
  );
}

export function getInflightPromise(
  cacheKey: string
): Promise<PreparedDiffEntry | null> | undefined {
  return inflightPromises.get(cacheKey)?.promise;
}

export async function startDiffPrep(
  repoPath: string,
  files: FileSpec[],
  statusRevision: number,
  stagedDiffs: FileDiff[],
  unstagedDiffs: FileDiff[]
): Promise<void> {
  cancelDiffPrep();

  if (batchIpcInFlight) {
    pendingRerun = () => {
      void startDiffPrep(repoPath, files, statusRevision, stagedDiffs, unstagedDiffs);
    };
    return;
  }

  const statusFingerprint = useGitStore.getState().statusFingerprint;
  const eligibilityMap = buildEligibilityMap(stagedDiffs, unstagedDiffs);
  const dedupe = new Set<string>();
  const sessionFiles: SessionFile[] = [];
  const batchRequests: BatchFileRequest[] = [];

  for (const file of files) {
    if (!isEligibleForPrep(file, eligibilityMap)) {
      continue;
    }

    const cacheKey = createPreparedDiffKey(repoPath, file, statusFingerprint);
    if (dedupe.has(cacheKey) || getCachedParsedDiff(cacheKey)) {
      continue;
    }

    dedupe.add(cacheKey);
    sessionFiles.push({ file, cacheKey });
    batchRequests.push({
      file: file.path,
      scope: file.scope,
      oldPath: file.oldPath,
    });
    inflightPromises.set(cacheKey, createDeferred<PreparedDiffEntry | null>());
  }

  if (batchRequests.length === 0) {
    return;
  }

  const session: PrepSession = {
    id: ++sessionCounter,
    cancelled: false,
    repoPath,
    statusRevision,
    sessionFiles,
  };

  currentSession = session;
  batchIpcInFlight = true;

  try {
    const results = await gitBatchFileContents(repoPath, batchRequests);
    if (isSessionStale(session)) {
      cancelSession(session);
      return;
    }

    const resultMap = buildResultMap(results);

    for (const { file, cacheKey } of session.sessionFiles) {
      if (isSessionStale(session)) {
        cancelSession(session);
        return;
      }

      await yieldToMain();

      if (isSessionStale(session)) {
        cancelSession(session);
        return;
      }

      const result = resultMap.get(buildScopeKey(file.scope, file.path));
      if (!result?.content || result.error) {
        resolveInflight(cacheKey, null);
        continue;
      }

      const content = result.content;
      if (content.isBinary) {
        resolveInflight(cacheKey, null);
        continue;
      }

      const combinedBytes = content.oldContent.length + content.newContent.length;
      if (combinedBytes > MAX_PREP_CONTENT_BYTES) {
        logger.debug('Skipping prep for large file', {
          file: file.path,
          bytes: combinedBytes,
          scope: file.scope,
        });
        resolveInflight(cacheKey, null);
        continue;
      }

      try {
        const oldFile = buildGitFileContents({
          repoPath,
          scope: file.scope,
          path: file.path,
          oldPath: file.oldPath,
          side: 'old',
          contents: content.oldContent,
        });
        const newFile = buildGitFileContents({
          repoPath,
          scope: file.scope,
          path: file.path,
          oldPath: file.oldPath,
          side: 'new',
          contents: content.newContent,
        });
        const fileDiff = parseDiffFromFile(oldFile, newFile);
        const counts = countPreparedChanges(fileDiff);
        const prepared: PreparedDiffEntry = {
          fileDiff,
          additions: counts.additions,
          deletions: counts.deletions,
          oldContent: content.oldContent,
          newContent: content.newContent,
        };

        setCachedParsedDiff(cacheKey, prepared);
        resolveInflight(cacheKey, prepared);
      } catch (error) {
        logger.debug('Failed to prepare diff in background', {
          error: error instanceof Error ? error.message : String(error),
          file: file.path,
          scope: file.scope,
        });
        resolveInflight(cacheKey, null);
      }
    }
  } catch (error) {
    logger.warn('Background diff prep batch failed', {
      error: error instanceof Error ? error.message : String(error),
      repoPath,
      sessionId: session.id,
    });
    clearSessionPromises(session);
  } finally {
    if (currentSession === session) {
      currentSession = null;
    }

    batchIpcInFlight = false;

    const rerun = pendingRerun;
    pendingRerun = null;
    if (rerun && currentSession === null) {
      rerun();
    }
  }
}
