/*---------------------------------------------------------------------------------------------
 *  Skill Definitions Service - Read-only discovery of skill files across installations.
 *
 *  Orbit's project and user skills live under `.claude/skills/`. Additional
 *  adapters surface skills authored for other installations so users keep
 *  what they already have:
 *
 *    - `~/.claude/skills/`                    (Claude Code personal)
 *    - `~/.claude/plugins/<plugin>/skills/`   (Claude Code plugin marketplace)
 *    - `{ancestors}/.claude/skills/`          (workspace-ancestor scoped skills)
 *    - `~/.codex/skills/`                     (Codex, forward-compat)
 *
 *  Name collisions resolve by priority: project > user > claude_project >
 *  claude_user > claude_plugin > codex.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('SkillDefinitions');

/** Maximum ancestor directories walked when scanning for `.claude/skills/`. */
const ANCESTOR_WALK_LIMIT = 12;

/** Source of a discovered skill. See module doc for directory conventions. */
export type SkillSource =
  | 'project'
  | 'user'
  | 'claude_user'
  | 'claude_plugin'
  | 'claude_project'
  | 'codex';

/**
 * Priority used when the same skill name appears in multiple sources.
 * Higher wins. Mirrors the precedence used by Solo so users see the same
 * selection behaviour across editors.
 */
const SOURCE_PRIORITY: Record<SkillSource, number> = {
  project: 60,
  user: 50,
  claude_project: 40,
  claude_user: 30,
  claude_plugin: 20,
  codex: 10,
};

/**
 * Skill definition structure (read-only, discovered from disk)
 */
export interface SkillDefinition {
  name: string;
  description: string;
  source: SkillSource;
  triggers?: string[];
  filePath?: string;
}

/**
 * Parse YAML frontmatter from skill markdown content.
 * Uses the same regex as agent-definitions.ts:59.
 * Falls back to filename as name if no frontmatter is present.
 */
function parseSkillFile(
  content: string,
  filename: string,
  source: SkillSource,
  absolutePath: string
): SkillDefinition {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);

  if (frontmatterMatch === null) {
    // No frontmatter — use filename as name (matching parseAgentFile fallback)
    return {
      name: filename.replace(/\.md$/i, ''),
      description: '',
      source,
      filePath: absolutePath,
    };
  }

  const frontmatter = frontmatterMatch[1];
  if (frontmatter === undefined) {
    return {
      name: filename.replace(/\.md$/i, ''),
      description: '',
      source,
      filePath: absolutePath,
    };
  }

  // Parse YAML frontmatter (simple key: value parsing)
  const metadata = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (match !== null) {
      const key = match[1];
      const value = match[2];
      if (key !== undefined && value !== undefined) {
        metadata.set(key, value.trim());
      }
    }
  }

  // Parse triggers array from comma-separated string
  let triggers: string[] | undefined;
  const triggersValue = metadata.get('triggers');
  if (triggersValue !== undefined && triggersValue.length > 0) {
    triggers = triggersValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  return {
    name: metadata.get('name') ?? filename.replace(/\.md$/i, ''),
    description: metadata.get('description') ?? '',
    source,
    triggers,
    filePath: absolutePath,
  };
}

/**
 * Resolve whether a dirent represents a directory, following symlinks.
 * Dirent.isDirectory() returns false for symlinks even when the target
 * is a directory. Marketplace skills (bunx skills add) are installed as
 * symlinks, so we must resolve them via fs.statSync.
 */
function isDirectoryEntry(entry: fs.Dirent, entryPath: string): boolean {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs.statSync(entryPath).isDirectory();
  } catch {
    return false; // broken symlink
  }
}

/**
 * Scan a single skills directory using dual-pattern matching:
 * 1. Subdirectories (or symlinks to directories) containing SKILL.md → parse as skill
 * 2. Root-level *.md files (or symlinks to .md files) → parse as skill
 */
function scanSkillsDirectory(skillsDir: string, source: SkillSource): SkillDefinition[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills: SkillDefinition[] = [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(skillsDir, entry.name);

      if (isDirectoryEntry(entry, entryPath)) {
        // Pattern 1: Subdirectory (or symlink to directory) with SKILL.md
        const skillFilePath = path.join(entryPath, 'SKILL.md');
        if (fs.existsSync(skillFilePath)) {
          try {
            const content = fs.readFileSync(skillFilePath, 'utf-8');
            const skill = parseSkillFile(content, 'SKILL.md', source, skillFilePath);
            // Use directory name as skill name if frontmatter doesn't specify one
            if (skill.name === 'SKILL') {
              skill.name = entry.name;
            }
            skills.push(skill);
          } catch (error) {
            logger.warn({ file: skillFilePath, error }, 'Failed to parse skill file');
          }
        }
      } else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.md')) {
        // Pattern 2: Root-level .md files (or symlinks to .md files)
        try {
          const content = fs.readFileSync(entryPath, 'utf-8');
          const skill = parseSkillFile(content, entry.name, source, entryPath);
          skills.push(skill);
        } catch (error) {
          logger.warn({ file: entryPath, error }, 'Failed to parse skill file');
        }
      }
    }
  } catch (error) {
    logger.error({ error, skillsDir }, 'Failed to scan skills directory');
  }

  return skills;
}

/**
 * Discover skills bundled with Claude Code plugins. The plugin manifest at
 * `~/.claude/plugins/installed_plugins.json` maps plugin IDs to install
 * records; each install record points at a directory that may contain a
 * `skills/` folder.
 */
function discoverClaudePlugins(): SkillDefinition[] {
  const homeDir = process.env.HOME ?? os.homedir();
  const manifestPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(manifestPath)) return [];

  let parsed: { plugins?: Record<string, { installPath?: string }[]> };
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      plugins?: Record<string, { installPath?: string }[]>;
    };
  } catch (error) {
    logger.warn({ error, manifestPath }, 'Failed to parse claude plugins manifest');
    return [];
  }

  const out: SkillDefinition[] = [];
  const plugins = parsed.plugins ?? {};
  for (const installs of Object.values(plugins)) {
    for (const install of installs) {
      if (install.installPath === undefined) continue;
      const skillsDir = path.join(install.installPath, 'skills');
      out.push(...scanSkillsDirectory(skillsDir, 'claude_plugin'));
    }
  }
  return out;
}

/**
 * Walk from `cwd` up to (but not including) `$HOME`, collecting any
 * `.claude/skills/` directories encountered. Enables monorepo setups where
 * skills live at a higher root than the open workspace. Bounded by
 * ANCESTOR_WALK_LIMIT hops as a safety net for pathological layouts.
 */
function discoverClaudeProjectAncestors(cwd: string): SkillDefinition[] {
  const homeDir = process.env.HOME ?? os.homedir();
  const out: SkillDefinition[] = [];
  let current = path.resolve(cwd);
  let hops = 0;

  while (hops < ANCESTOR_WALK_LIMIT) {
    if (current === homeDir) break;
    const candidate = path.join(current, '.claude', 'skills');
    if (fs.existsSync(candidate)) {
      out.push(...scanSkillsDirectory(candidate, 'claude_project'));
    }
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
    hops += 1;
  }

  return out;
}

/**
 * Collapse name collisions by keeping the highest-priority source, then
 * sort by priority descending, then alphabetical by name.
 */
function mergeSkills(all: SkillDefinition[]): SkillDefinition[] {
  const bestByName = new Map<string, SkillDefinition>();
  for (const skill of all) {
    const existing = bestByName.get(skill.name);
    if (
      existing === undefined ||
      SOURCE_PRIORITY[skill.source] > SOURCE_PRIORITY[existing.source]
    ) {
      bestByName.set(skill.name, skill);
    }
  }

  return Array.from(bestByName.values()).sort((a, b) => {
    const priorityDiff = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    if (priorityDiff !== 0) return priorityDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * List all skill definitions from every source. The workspace
 * `.claude/skills/` directory has the highest priority, followed by the
 * user's personal skills and the compatibility adapters.
 */
export function listSkills(workspacePath: string): SkillDefinition[] {
  const homeDir = process.env.HOME ?? os.homedir();

  // Orbit-native sources
  const projectSkillsDir = path.join(workspacePath, '.claude', 'skills');
  const projectSkills = scanSkillsDirectory(projectSkillsDir, 'project');

  const userSkillsDir = path.join(homeDir, '.claude', 'skills');
  const userSkills = scanSkillsDirectory(userSkillsDir, 'user');

  // Compatibility adapters — read-only, surface skills from other tools
  const claudeProjectSkills = discoverClaudeProjectAncestors(workspacePath);
  const claudePluginSkills = discoverClaudePlugins();
  const codexSkills = scanSkillsDirectory(path.join(homeDir, '.codex', 'skills'), 'codex');

  const merged = mergeSkills([
    ...projectSkills,
    ...userSkills,
    ...claudeProjectSkills,
    ...claudePluginSkills,
    ...codexSkills,
  ]);

  if (merged.length > 0) {
    logger.info(
      {
        total: merged.length,
        bySource: merged.reduce<Record<string, number>>((acc, skill) => {
          acc[skill.source] = (acc[skill.source] ?? 0) + 1;
          return acc;
        }, {}),
      },
      'Listed skills'
    );
  } else {
    logger.debug('No skills found');
  }

  return merged;
}

// Exposed for unit tests.
export const __testing = {
  parseSkillFile,
  scanSkillsDirectory,
  mergeSkills,
  SOURCE_PRIORITY,
  ANCESTOR_WALK_LIMIT,
};
