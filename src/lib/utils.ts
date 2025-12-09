import { clsx  } from "clsx"
import { twMerge } from "tailwind-merge"

import type {ClassValue} from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp into a human-readable string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${String(minutes)}m ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
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
 * Format a file size in bytes into a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unit = units[i];

  return `${String(parseFloat((bytes / Math.pow(k, i)).toFixed(1)))} ${unit ?? ''}`;
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

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id'): string {
  const random = Math.random().toString(36);
  return `${prefix}_${String(Date.now())}_${random.slice(2, 11)}`;
}
