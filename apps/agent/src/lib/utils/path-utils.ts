/**
 * Path helper utilities that are safe for both POSIX and Windows-style paths.
 */

const WINDOWS_DRIVE_ROOT_RE = /^[A-Za-z]:\/$/;
const WINDOWS_DRIVE_PREFIX_RE = /^[A-Za-z]:\//;

function normalizePathForComparison(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  let trimmed = normalized;

  if (trimmed !== '/' && !WINDOWS_DRIVE_ROOT_RE.test(trimmed)) {
    trimmed = trimmed.replace(/\/+$/, '');
  }

  if (WINDOWS_DRIVE_PREFIX_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function getPathName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (trimmed.length === 0) return path;
  const parts = trimmed.split(/[\\/]+/);
  const lastPart = parts[parts.length - 1];
  return lastPart && lastPart.length > 0 ? lastPart : path;
}

export function getParentPath(path: string): string | null {
  const lastSeparatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastSeparatorIndex < 0) return null;
  if (lastSeparatorIndex === 0) return path[0] ?? '/';
  return path.slice(0, lastSeparatorIndex);
}

export function joinPath(parentPath: string, childName: string): string {
  const separator = parentPath.includes('\\') ? '\\' : '/';
  const trimmedParent = parentPath.replace(/[\\/]+$/, '');

  if (trimmedParent.length === 0) {
    return `${separator}${childName}`;
  }

  return `${trimmedParent}${separator}${childName}`;
}

export function isPathEqualOrWithin(path: string, parentPath: string): boolean {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedParent = normalizePathForComparison(parentPath);

  if (normalizedPath === normalizedParent) return true;
  return normalizedPath.startsWith(`${normalizedParent}/`);
}

export function isPathWithin(path: string, parentPath: string): boolean {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedParent = normalizePathForComparison(parentPath);

  if (normalizedPath === normalizedParent) return false;
  return normalizedPath.startsWith(`${normalizedParent}/`);
}

export function toRelativePath(path: string, rootPath: string): string | null {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedRoot = normalizePathForComparison(rootPath);

  if (normalizedPath === normalizedRoot) return '';
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return null;

  return normalizedPath.slice(normalizedRoot.length + 1);
}
