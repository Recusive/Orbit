/**
 * Component Library Search
 * Unified search across all indexed component libraries
 */

import { headlessUIComponents } from '../libraries/headlessUIIndex';
import { lucideIcons } from '../libraries/lucideIndex';
import { radixComponents } from '../libraries/radixIndex';
import { shadcnComponents } from '../libraries/shadcnIndex';

import type {
  IndexedComponent,
  ComponentSearchResult,
  ComponentSearchOptions,
  ComponentCategory,
} from './componentLibraryTypes';

// All indexed components from all libraries
const allComponents: IndexedComponent[] = [
  ...shadcnComponents,
  ...lucideIcons,
  ...radixComponents,
  ...headlessUIComponents,
];

/**
 * Simple fuzzy match scoring
 * Returns a score based on how well the query matches the text
 */
function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 100;

  // Starts with query
  if (lowerText.startsWith(lowerQuery)) return 90;

  // Contains query
  if (lowerText.includes(lowerQuery)) return 70;

  // Fuzzy character matching
  let score = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      score += 10 + consecutiveMatches * 5;
      consecutiveMatches++;
      queryIndex++;
    } else {
      consecutiveMatches = 0;
    }
  }

  // Only return score if all query characters were found
  if (queryIndex === lowerQuery.length) {
    return Math.min(60, score);
  }

  return 0;
}

/**
 * Search components by query string
 */
export function searchComponents(
  query: string,
  options: ComponentSearchOptions = {}
): ComponentSearchResult[] {
  const { libraries, categories, includeIcons = true, limit = 50 } = options;

  if (!query.trim()) {
    return [];
  }

  const results: ComponentSearchResult[] = [];

  for (const component of allComponents) {
    // Filter by library
    if (libraries && libraries.length > 0) {
      if (!libraries.includes(component.library.id)) continue;
    }

    // Filter by category
    if (categories && categories.length > 0) {
      if (!categories.includes(component.category)) continue;
    }

    // Filter icons if not included
    if (!includeIcons && component.category === 'icon') continue;

    // Calculate match score
    const matchedFields: string[] = [];
    let totalScore = 0;

    // Name match (highest weight)
    const nameScore = fuzzyScore(query, component.name);
    if (nameScore > 0) {
      totalScore += nameScore * 2;
      matchedFields.push('name');
    }

    // Tag match
    for (const tag of component.tags) {
      const tagScore = fuzzyScore(query, tag);
      if (tagScore > 0) {
        totalScore += tagScore * 1.5;
        if (!matchedFields.includes('tags')) {
          matchedFields.push('tags');
        }
        break; // Only count first matching tag
      }
    }

    // Description match
    const descScore = fuzzyScore(query, component.description);
    if (descScore > 0) {
      totalScore += descScore;
      matchedFields.push('description');
    }

    // Library name match
    const libScore = fuzzyScore(query, component.library.name);
    if (libScore > 0) {
      totalScore += libScore * 0.5;
      matchedFields.push('library');
    }

    if (totalScore > 0) {
      results.push({
        component,
        score: totalScore,
        matchedFields,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  return results.slice(0, limit);
}

/**
 * Get all components grouped by category
 */
export function getComponentsByCategory(
  options: ComponentSearchOptions = {}
): Record<ComponentCategory, IndexedComponent[]> {
  const { libraries, includeIcons = true } = options;

  const result: Record<ComponentCategory, IndexedComponent[]> = {
    layout: [],
    navigation: [],
    input: [],
    display: [],
    feedback: [],
    overlay: [],
    media: [],
    data: [],
    icon: [],
  };

  for (const component of allComponents) {
    // Filter by library
    if (libraries && libraries.length > 0) {
      if (!libraries.includes(component.library.id)) continue;
    }

    // Filter icons if not included
    if (!includeIcons && component.category === 'icon') continue;

    result[component.category].push(component);
  }

  return result;
}

/**
 * Get components from a specific library
 */
export function getComponentsByLibrary(libraryId: string): IndexedComponent[] {
  return allComponents.filter((c) => c.library.id === libraryId);
}

/**
 * Get a single component by ID
 */
export function getComponentById(id: string): IndexedComponent | undefined {
  return allComponents.find((c) => c.id === id);
}

/**
 * Get all available libraries
 */
export function getAvailableLibraries(): { id: string; name: string; count: number }[] {
  const libraryMap = new Map<string, { name: string; count: number }>();

  for (const component of allComponents) {
    const existing = libraryMap.get(component.library.id);
    if (existing) {
      existing.count++;
    } else {
      libraryMap.set(component.library.id, {
        name: component.library.name,
        count: 1,
      });
    }
  }

  return Array.from(libraryMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    count: data.count,
  }));
}

/**
 * Autocomplete suggestions for @mentions
 */
export function autocomplete(partial: string, limit = 10): IndexedComponent[] {
  if (!partial.trim()) return [];

  const lowerPartial = partial.toLowerCase();

  // Score by how well the name starts with the partial
  const scored = allComponents
    .map((component) => {
      const lowerName = component.name.toLowerCase();
      let score = 0;

      if (lowerName === lowerPartial) score = 100;
      else if (lowerName.startsWith(lowerPartial)) score = 90;
      else if (lowerName.includes(lowerPartial)) score = 50;
      else {
        // Check tags
        for (const tag of component.tags) {
          if (tag.toLowerCase().startsWith(lowerPartial)) {
            score = 30;
            break;
          }
        }
      }

      return { component, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ component }) => component);

  return scored;
}

// Re-export types
export type { IndexedComponent, ComponentSearchResult, ComponentSearchOptions };
