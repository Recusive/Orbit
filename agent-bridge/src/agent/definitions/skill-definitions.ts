/*---------------------------------------------------------------------------------------------
 *  Skill Definitions Service - Read-only discovery of .claude/skills/ skill files
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('SkillDefinitions');

/**
 * Skill definition structure (read-only, discovered from disk)
 */
export interface SkillDefinition {
  name: string;
  description: string;
  source: 'project' | 'user';
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
  source: 'project' | 'user',
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
function scanSkillsDirectory(skillsDir: string, source: 'project' | 'user'): SkillDefinition[] {
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
 * List all skill definitions from project and user directories.
 * Scans both .claude/skills/ (project) and ~/.claude/skills/ (user).
 * Returns skills sorted by source (project first) then name.
 */
export function listSkills(workspacePath: string): SkillDefinition[] {
  const homeDir = process.env.HOME ?? os.homedir();

  // Project skills: <workspace>/.claude/skills/
  const projectSkillsDir = path.join(workspacePath, '.claude', 'skills');
  const projectSkills = scanSkillsDirectory(projectSkillsDir, 'project');

  // User/personal skills: ~/.claude/skills/
  const userSkillsDir = path.join(homeDir, '.claude', 'skills');
  const userSkills = scanSkillsDirectory(userSkillsDir, 'user');

  const allSkills = [...projectSkills, ...userSkills];

  // Sort: project first, then user; alphabetical within each group
  allSkills.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'project' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  logger.info(
    { total: allSkills.length, project: projectSkills.length, user: userSkills.length },
    'Listed skills'
  );

  return allSkills;
}
