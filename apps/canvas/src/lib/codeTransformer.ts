/**
 * Code transformer utilities for updating React/JSX code
 *
 * Provides functions to find and update className attributes in JSX code
 * based on element path selectors.
 */

/**
 * Find className attribute in JSX code by element characteristics
 * This is a simple regex-based approach for common patterns
 */
export function findClassNameInCode(
  code: string,
  elementInfo: {
    tagName: string;
    className: string;
    path: string;
  }
): { start: number; end: number; value: string } | null {
  // Strategy 1: Find by exact className match
  if (elementInfo.className) {
    const classNamePatterns = [
      // className="..."
      new RegExp(`className=["']${escapeRegex(elementInfo.className)}["']`, 'g'),
      // className={`...`}
      new RegExp(`className=\\{\`${escapeRegex(elementInfo.className)}\`\\}`, 'g'),
      // className={"..."}
      new RegExp(`className=\\{"${escapeRegex(elementInfo.className)}"\\}`, 'g'),
    ];

    for (const pattern of classNamePatterns) {
      const match = pattern.exec(code);
      if (match) {
        // Find the value portion
        const fullMatch = match[0];
        const valueStart = fullMatch.indexOf(elementInfo.className);
        return {
          start: match.index + valueStart,
          end: match.index + valueStart + elementInfo.className.length,
          value: elementInfo.className,
        };
      }
    }
  }

  // Strategy 2: Find by tag name with first class
  const firstClass = elementInfo.className.split(/\s+/)[0];
  if (firstClass) {
    const tagPattern = new RegExp(
      `<${elementInfo.tagName}[^>]*className=["']([^"']*${escapeRegex(firstClass)}[^"']*)["']`,
      'g'
    );
    const match = tagPattern.exec(code);
    if (match?.[1] !== undefined) {
      const classValue = match[1];
      const valueStart = match.index + match[0].indexOf(classValue);
      return {
        start: valueStart,
        end: valueStart + classValue.length,
        value: classValue,
      };
    }
  }

  return null;
}

/**
 * Update className in code
 */
export function updateClassNameInCode(
  code: string,
  elementInfo: {
    tagName: string;
    className: string;
    path: string;
  },
  newClassName: string
): string {
  const location = findClassNameInCode(code, elementInfo);
  if (!location) {
    return code;
  }

  return code.substring(0, location.start) + newClassName + code.substring(location.end);
}

/**
 * Find all className occurrences in code
 */
export function findAllClassNames(code: string): {
  start: number;
  end: number;
  value: string;
  quoteStyle: 'single' | 'double' | 'template';
}[] {
  const results: {
    start: number;
    end: number;
    value: string;
    quoteStyle: 'single' | 'double' | 'template';
  }[] = [];

  // Pattern for className="..." or className='...'
  const doubleQuotePattern = /className="([^"]*)"/g;
  const singleQuotePattern = /className='([^']*)'/g;
  const templatePattern = /className=\{`([^`]*)`\}/g;

  let match;

  while ((match = doubleQuotePattern.exec(code)) !== null) {
    const captured = match[1] ?? '';
    const valueStart = match.index + 'className="'.length;
    results.push({
      start: valueStart,
      end: valueStart + captured.length,
      value: captured,
      quoteStyle: 'double',
    });
  }

  while ((match = singleQuotePattern.exec(code)) !== null) {
    const captured = match[1] ?? '';
    const valueStart = match.index + "className='".length;
    results.push({
      start: valueStart,
      end: valueStart + captured.length,
      value: captured,
      quoteStyle: 'single',
    });
  }

  while ((match = templatePattern.exec(code)) !== null) {
    const captured = match[1] ?? '';
    const valueStart = match.index + 'className={`'.length;
    results.push({
      start: valueStart,
      end: valueStart + captured.length,
      value: captured,
      quoteStyle: 'template',
    });
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);

  return results;
}

/**
 * Add or update a Tailwind class in a className string
 */
export function updateTailwindClass(
  currentClasses: string,
  property: string,
  newClass: string
): string {
  const classes = currentClasses.split(/\s+/).filter(Boolean);

  // Define which prefixes correspond to which properties
  const propertyPrefixes: Record<string, RegExp> = {
    padding: /^(p-|px-|py-|pt-|pr-|pb-|pl-)/,
    paddingX: /^px-/,
    paddingY: /^py-/,
    paddingTop: /^pt-/,
    paddingRight: /^pr-/,
    paddingBottom: /^pb-/,
    paddingLeft: /^pl-/,
    margin: /^(m-|mx-|my-|mt-|mr-|mb-|ml-)/,
    marginX: /^mx-/,
    marginY: /^my-/,
    marginTop: /^mt-/,
    marginRight: /^mr-/,
    marginBottom: /^mb-/,
    marginLeft: /^ml-/,
    width: /^w-/,
    height: /^h-/,
    gap: /^gap-/,
    backgroundColor: /^bg-/,
    color: /^text-(?!xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|center|right|justify)/,
    fontSize: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)/,
    fontWeight: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/,
    borderRadius: /^rounded/,
    display: /^(flex|grid|block|inline|hidden)/,
    flexDirection: /^flex-(row|col)/,
    justifyContent: /^justify-/,
    alignItems: /^items-/,
  };

  const pattern = propertyPrefixes[property];
  if (!pattern) {
    // Just add the class if we don't know how to replace
    return [...classes, newClass].join(' ');
  }

  // Remove existing classes that match the pattern
  const filtered = classes.filter((c) => !pattern.test(c));

  // Add new class
  filtered.push(newClass);

  return filtered.join(' ');
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a diff of class changes
 */
export function diffClasses(
  oldClasses: string,
  newClasses: string
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldClasses.split(/\s+/).filter(Boolean));
  const newSet = new Set(newClasses.split(/\s+/).filter(Boolean));

  const added: string[] = [];
  const removed: string[] = [];

  for (const cls of newSet) {
    if (!oldSet.has(cls)) {
      added.push(cls);
    }
  }

  for (const cls of oldSet) {
    if (!newSet.has(cls)) {
      removed.push(cls);
    }
  }

  return { added, removed };
}

/**
 * Update code by replacing className at a specific position
 */
export function replaceClassNameAtPosition(
  code: string,
  position: { start: number; end: number },
  newClassName: string
): string {
  return code.substring(0, position.start) + newClassName + code.substring(position.end);
}
