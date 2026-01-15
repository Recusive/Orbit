import { TIME_MS } from './constants';

// Re-export cn from shared common package
export { cn } from '@orbit/common/utils';

/**
 * Platform detection utilities for keyboard shortcuts
 */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC');

/**
 * Get the platform-aware command key symbol
 * Returns ⌘ on Mac, Ctrl on Windows/Linux
 */
export const getCommandKey = (): string => (isMac() ? '⌘' : 'Ctrl');

/**
 * Get the platform-aware modifier symbols
 */
export const getModifierSymbols = (): {
  cmd: string;
  ctrl: string;
  shift: string;
  alt: string;
} => ({
  cmd: isMac() ? '⌘' : 'Ctrl',
  ctrl: isMac() ? '⌃' : 'Ctrl',
  shift: isMac() ? '⇧' : 'Shift',
  alt: isMac() ? '⌥' : 'Alt',
});

/**
 * Format a timestamp into a human-readable string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < TIME_MS.minute) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < TIME_MS.hour) {
    const minutes = Math.floor(diff / TIME_MS.minute);
    return `${String(minutes)}m ago`;
  }

  // Less than 24 hours
  if (diff < TIME_MS.day) {
    const hours = Math.floor(diff / TIME_MS.hour);
    return `${String(hours)}h ago`;
  }

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Different year
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Truncate a file path for display
 */
export function truncatePath(path: string, maxLength = 40): string {
  if (path.length <= maxLength) return path;

  const parts = path.split('/');
  const fileName = parts.pop() ?? '';

  if (fileName.length >= maxLength - 3) {
    return '...' + fileName.slice(-(maxLength - 3));
  }

  let truncated = fileName;
  let remaining = maxLength - fileName.length - 4; // 4 for ".../"

  for (let i = parts.length - 1; i >= 0 && remaining > 0; i--) {
    const part = parts[i];
    if (part && part.length + 1 <= remaining) {
      truncated = part + '/' + truncated;
      remaining -= part.length + 1;
    } else {
      break;
    }
  }

  return '.../' + truncated;
}
