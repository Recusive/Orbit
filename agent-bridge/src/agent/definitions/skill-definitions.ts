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
 * Scan a single skills directory using dual-pattern matching:
 * 1. Subdirectories containing SKILL.md → parse as skill
 * 2. Root-level *.md files → parse as skill (catches standalone skill files)
 */
function scanSkillsDirectory(skillsDir: string, source: 'project' | 'user'): SkillDefinition[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills: SkillDefinition[] = [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Pattern 1: Subdirectory with SKILL.md
        const skillFilePath = path.join(skillsDir, entry.name, 'SKILL.md');
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
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Pattern 2: Root-level .md files
        const filePath = path.join(skillsDir, entry.name);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const skill = parseSkillFile(content, entry.name, source, filePath);
          skills.push(skill);
        } catch (error) {
          logger.warn({ file: filePath, error }, 'Failed to parse skill file');
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
