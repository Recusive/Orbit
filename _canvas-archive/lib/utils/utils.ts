/**
 * Re-export cn from shared common package
 */
export { cn } from '@orbit/common/utils';

/**
 * Type-safe omit utility for removing properties from objects.
 *
 * This is the proper way to remove optional properties when using
 * TypeScript's exactOptionalPropertyTypes setting. Unlike destructuring
 * (which creates unused variables), this approach is fully type-safe
 * and doesn't require eslint-disable comments.
 *
 * @example
 * ```ts
 * const card = { id: '1', name: 'test', fileConflict: true };
 * const clean = omit(card, 'fileConflict');
 * // clean: { id: string; name: string }
 * ```
 */
export function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const keySet = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keySet.has(k))) as Omit<T, K>;
}
