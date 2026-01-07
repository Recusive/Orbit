/**
 * Utility for merging Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for deduplication
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
