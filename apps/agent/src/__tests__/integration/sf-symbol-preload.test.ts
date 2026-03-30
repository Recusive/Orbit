/// <reference types="node" />
/**
 * Ensures WORKSPACE_SF_SYMBOLS stays in sync with actual <SFSymbol> usages.
 *
 * If a developer adds a new <SFSymbol> without updating the preload list,
 * this test fails — preventing un-preloaded icons that flash on mount.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORKSPACE_SF_SYMBOLS } from '@/components/shared/sf-symbol';

const THIS_DIR = join(fileURLToPath(import.meta.url), '..');
const COMPONENT_DIR = join(THIS_DIR, '..', '..', 'components');

/** Build "name:size:weight" key for comparison. */
function symbolKey(name: string, size: number, weight: string): string {
  return `${name}:${String(size)}:${weight}`;
}

/** Recursively find all .tsx files under a directory. */
function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

interface SymbolUsage {
  name: string;
  size: number;
  weight: string;
  file: string;
  line: number;
}

/**
 * Scan component files for <SFSymbol> usages and extract {name, size, weight}.
 *
 * Handles two patterns:
 *  1. Direct: `<SFSymbol ... name="..." ... size={N} ... weight="..."`
 *  2. Indirect (ModeButton-style): `sfSymbol="..."` props passed to a wrapper
 *     that renders `<SFSymbol name={sfSymbol} size={18} weight="medium">`
 */
function extractSFSymbolUsages(componentDir: string): SymbolUsage[] {
  const files = findTsxFiles(componentDir);
  const usages: SymbolUsage[] = [];

  // Pattern 1: Direct <SFSymbol with name/size/weight across lines
  const directPattern =
    /<SFSymbol[\s\S]*?name="([^"]+)"[\s\S]*?size=\{(\d+)\}[\s\S]*?weight="([^"]+)"/g;

  // Pattern 2: sfSymbol="..." prop (always flows through size=18/weight="medium")
  const indirectPattern = /sfSymbol="([^"]+)"/g;

  for (const filePath of files) {
    // Skip sf-symbol.tsx itself (contains JSDoc examples, not real usages)
    if (filePath.includes('sf-symbol.tsx')) continue;

    const content = readFileSync(filePath, 'utf-8');
    const relPath = relative(join(componentDir, '..', '..'), filePath);

    // Direct usages
    let match: RegExpExecArray | null;
    while ((match = directPattern.exec(content)) !== null) {
      const matchedName = match[1];
      const matchedSize = match[2];
      const matchedWeight = match[3];
      if (matchedName !== undefined && matchedSize !== undefined && matchedWeight !== undefined) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        usages.push({
          name: matchedName,
          size: Number(matchedSize),
          weight: matchedWeight,
          file: relPath,
          line: lineNumber,
        });
      }
    }

    // Indirect usages (sfSymbol="..." → always renders at size=18, weight="medium")
    while ((match = indirectPattern.exec(content)) !== null) {
      const matchedName = match[1];
      if (matchedName !== undefined) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        usages.push({
          name: matchedName,
          size: 18,
          weight: 'medium',
          file: relPath,
          line: lineNumber,
        });
      }
    }
  }

  return usages;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('WORKSPACE_SF_SYMBOLS preload list', () => {
  const preloadKeys = new Set(WORKSPACE_SF_SYMBOLS.map((s) => symbolKey(s.name, s.size, s.weight)));

  const usages = extractSFSymbolUsages(COMPONENT_DIR);
  const usageKeys = new Map<string, { file: string; line: number }>();
  for (const u of usages) {
    usageKeys.set(symbolKey(u.name, u.size, u.weight), { file: u.file, line: u.line });
  }

  it('should include every <SFSymbol> used in components', () => {
    const missing: string[] = [];
    for (const [key, loc] of usageKeys) {
      if (!preloadKeys.has(key)) {
        missing.push(`${key} (${loc.file}:${String(loc.line)})`);
      }
    }

    expect(
      missing,
      `SFSymbol usages missing from WORKSPACE_SF_SYMBOLS in sf-symbol.tsx:\n  ${missing.join('\n  ')}\n\nAdd them to the preload list to prevent icon flash on mount.`
    ).toHaveLength(0);
  });

  it('should not contain entries unused by any component', () => {
    const unused: string[] = [];
    for (const key of preloadKeys) {
      if (!usageKeys.has(key)) {
        unused.push(key);
      }
    }

    expect(
      unused,
      `WORKSPACE_SF_SYMBOLS entries not found in any component:\n  ${unused.join('\n  ')}\n\nRemove stale entries to keep the preload list accurate.`
    ).toHaveLength(0);
  });

  it('should not contain duplicate entries', () => {
    const keys = WORKSPACE_SF_SYMBOLS.map((s) => symbolKey(s.name, s.size, s.weight));
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const key of keys) {
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }

    expect(
      duplicates,
      `Duplicate entries in WORKSPACE_SF_SYMBOLS: ${duplicates.join(', ')}`
    ).toHaveLength(0);
  });
});
