import { createLogger } from '@orbit/common/lib';

const logger = createLogger('ChangelogLoader');

const changelogModules = import.meta.glob<string>('/src/changelogs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const VERSION_FILE_RE =
  /^\/src\/changelogs\/v(?<version>\d+(?:\.\d+)*(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z.-]+)?)\.md$/;

export interface ChangelogEntry {
  readonly version: string;
  readonly title: string;
  readonly date: string;
  readonly body: string;
}

type ChangelogModuleSource = Record<string, string> | Iterable<readonly [string, string]>;

const MAX_BUNDLED_CHANGELOGS = 20;

interface ParsedFrontmatter {
  readonly title: string;
  readonly date: string;
  readonly body: string;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function extractVersionFromPath(path: string): string | null {
  const match = VERSION_FILE_RE.exec(path);
  return match?.groups?.['version'] ?? null;
}

function parseFrontmatter(markdown: string): ParsedFrontmatter | null {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized.startsWith('---\n')) {
    return null;
  }

  const closingDelimiterIndex = normalized.indexOf('\n---\n', 4);
  if (closingDelimiterIndex < 0) {
    return null;
  }

  const frontmatterBlock = normalized.slice(4, closingDelimiterIndex);
  const body = normalized.slice(closingDelimiterIndex + 5).trim();

  const titleMatch = /^title:\s*(.+)$/m.exec(frontmatterBlock);
  const dateMatch = /^date:\s*(.+)$/m.exec(frontmatterBlock);

  const title = titleMatch?.[1] ? stripWrappingQuotes(titleMatch[1].trim()) : '';
  const date = dateMatch?.[1] ? stripWrappingQuotes(dateMatch[1].trim()) : '';

  if (title.length === 0 || date.length === 0) {
    return null;
  }

  return {
    title,
    date,
    body,
  };
}

function parseNumericSegments(version: string): number[] {
  const coreVersion = version.split('-')[0]?.split('+')[0] ?? version;
  return coreVersion.split('.').map((segment) => Number.parseInt(segment, 10) || 0);
}

function parsePrereleaseSegments(version: string): string[] {
  const prerelease = version.split('+')[0]?.split('-')[1];
  return prerelease?.split('.') ?? [];
}

function compareSemver(left: string, right: string): number {
  const leftNumeric = parseNumericSegments(left);
  const rightNumeric = parseNumericSegments(right);
  const maxLength = Math.max(leftNumeric.length, rightNumeric.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftNumeric[index] ?? 0;
    const rightPart = rightNumeric[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  const leftPrerelease = parsePrereleaseSegments(left);
  const rightPrerelease = parsePrereleaseSegments(right);

  if (leftPrerelease.length === 0 && rightPrerelease.length === 0) {
    return 0;
  }

  if (leftPrerelease.length === 0) {
    return 1;
  }

  if (rightPrerelease.length === 0) {
    return -1;
  }

  const maxPrereleaseLength = Math.max(leftPrerelease.length, rightPrerelease.length);

  for (let index = 0; index < maxPrereleaseLength; index += 1) {
    const leftPart = leftPrerelease[index];
    const rightPart = rightPrerelease[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const leftIsNumeric = /^\d+$/.test(leftPart);
    const rightIsNumeric = /^\d+$/.test(rightPart);

    if (leftIsNumeric && rightIsNumeric) {
      const leftNumber = Number.parseInt(leftPart, 10);
      const rightNumber = Number.parseInt(rightPart, 10);

      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }

      continue;
    }

    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

export function buildChangelogEntries(modules: ChangelogModuleSource): readonly ChangelogEntry[] {
  const seenVersions = new Set<string>();
  const entries: ChangelogEntry[] = [];

  const moduleEntries =
    typeof (modules as { readonly [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
      ? Array.from(modules as Iterable<readonly [string, string]>)
      : Object.entries(modules as Record<string, string>);

  for (const [path, markdown] of moduleEntries) {
    const version = extractVersionFromPath(path);
    if (version === null) {
      logger.warn('Skipping changelog with invalid filename', { path });
      continue;
    }

    if (seenVersions.has(version)) {
      logger.warn('Skipping duplicate changelog version', { path, version });
      continue;
    }

    const parsed = parseFrontmatter(markdown);
    if (parsed === null) {
      logger.warn('Skipping malformed changelog frontmatter', { path, version });
      continue;
    }

    seenVersions.add(version);
    entries.push(
      Object.freeze({
        version,
        title: parsed.title,
        date: parsed.date,
        body: parsed.body,
      })
    );
  }

  return Object.freeze(
    [...entries].sort((left, right) => compareSemver(right.version, left.version))
  );
}

const bundledChangelogs = Object.freeze(
  buildChangelogEntries(changelogModules).slice(0, MAX_BUNDLED_CHANGELOGS)
);

export function getChangelogs(): readonly ChangelogEntry[] {
  return bundledChangelogs;
}

export function mergeChangelogEntries(
  entries: readonly ChangelogEntry[],
  availableVersion: string | null,
  releaseNotes: string | null
): readonly ChangelogEntry[] {
  if (availableVersion === null) {
    return entries;
  }

  const newestBundledVersion = entries[0]?.version;

  if (newestBundledVersion !== undefined) {
    const comparison = compareSemver(availableVersion, newestBundledVersion);

    if (comparison === 0 || comparison < 0) {
      return entries;
    }
  }

  return Object.freeze([createVirtualEntry(availableVersion, releaseNotes), ...entries]);
}

export function getMergedChangelogs(
  availableVersion: string | null,
  releaseNotes: string | null
): readonly ChangelogEntry[] {
  return mergeChangelogEntries(bundledChangelogs, availableVersion, releaseNotes);
}

export function createVirtualEntry(version: string, releaseNotes: string | null): ChangelogEntry {
  const trimmedReleaseNotes = releaseNotes?.trim();
  const body =
    trimmedReleaseNotes !== undefined && trimmedReleaseNotes.length > 0
      ? trimmedReleaseNotes
      : `Update to Orbit v${version}.`;

  return Object.freeze({
    version,
    title: `Orbit v${version}`,
    date: 'Available now',
    body,
  });
}
