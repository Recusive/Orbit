/**
 * Unit tests for the multi-source skill discovery pipeline.
 *
 * Uses a temporary filesystem layout so we can exercise the Claude
 * plugin manifest, ancestor walking, and Codex adapters without
 * depending on the developer's real `~/.claude/` state.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { listSkills, __testing } from '../agent/definitions/skill-definitions.js';

import type { SkillDefinition, SkillSource } from '../agent/definitions/skill-definitions.js';

const { parseSkillFile, mergeSkills, SOURCE_PRIORITY } = __testing;

function writeSkill(dir: string, name: string, description: string): void {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`
  );
}

describe('parseSkillFile', () => {
  it('extracts name, description, and triggers from frontmatter', () => {
    const raw = `---\nname: demo\ndescription: a test skill\ntriggers: alpha, beta, gamma\n---\n\nBody text\n`;
    const skill = parseSkillFile(raw, 'demo.md', 'user', '/abs/demo.md');
    expect(skill.name).toBe('demo');
    expect(skill.description).toBe('a test skill');
    expect(skill.triggers).toEqual(['alpha', 'beta', 'gamma']);
    expect(skill.source).toBe('user');
    expect(skill.filePath).toBe('/abs/demo.md');
  });

  it('falls back to filename when frontmatter is missing', () => {
    const skill = parseSkillFile('no frontmatter here', 'bare.md', 'project', '/abs/bare.md');
    expect(skill.name).toBe('bare');
    expect(skill.description).toBe('');
  });
});

describe('mergeSkills', () => {
  it('keeps the highest-priority source on name collision', () => {
    const lower: SkillDefinition = {
      name: 'dup',
      description: 'from claude user',
      source: 'claude_user',
    };
    const higher: SkillDefinition = {
      name: 'dup',
      description: 'from project',
      source: 'project',
    };
    const merged = mergeSkills([lower, higher]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.description).toBe('from project');
  });

  it('sorts by priority desc then name asc', () => {
    const input: SkillDefinition[] = [
      { name: 'zed', description: '', source: 'codex' },
      { name: 'alpha', description: '', source: 'project' },
      { name: 'beta', description: '', source: 'user' },
    ];
    const merged = mergeSkills(input);
    expect(merged.map((s) => s.name)).toEqual(['alpha', 'beta', 'zed']);
  });

  it('orders Solo-native sources above compatibility adapters', () => {
    const ordered: SkillSource[] = [
      'project',
      'user',
      'claude_project',
      'claude_user',
      'claude_plugin',
      'codex',
    ];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const higher = ordered[i];
      const lower = ordered[i + 1];
      if (higher === undefined || lower === undefined) continue;
      expect(SOURCE_PRIORITY[higher]).toBeGreaterThan(SOURCE_PRIORITY[lower]);
    }
  });
});

describe('listSkills — filesystem adapters', () => {
  let root: string;
  let home: string;
  let workspace: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orbit-skills-'));
    home = join(root, 'home');
    workspace = join(root, 'workspace', 'repo');
    mkdirSync(home, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    originalHome = process.env.HOME;
    process.env.HOME = home;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers project and user skills in isolation', () => {
    writeSkill(join(workspace, '.claude', 'skills'), 'proj-skill', 'from project');
    writeSkill(join(home, '.claude', 'skills'), 'user-skill', 'from user');

    const skills = listSkills(workspace);
    const bySource = skills.reduce<Record<string, number>>((acc, s) => {
      acc[s.source] = (acc[s.source] ?? 0) + 1;
      return acc;
    }, {});
    expect(bySource.project).toBe(1);
    expect(bySource.user).toBe(1);
  });

  it('walks ancestors for claude_project skills up to the home boundary', () => {
    const monorepoRoot = join(root, 'workspace');
    writeSkill(join(monorepoRoot, '.claude', 'skills'), 'ancestor-skill', 'from ancestor');

    const skills = listSkills(workspace);
    const ancestor = skills.find((s) => s.name === 'ancestor-skill');
    expect(ancestor).toBeDefined();
    expect(ancestor?.source).toBe('claude_project');
  });

  it('reads skills bundled with Claude Code plugins via installed_plugins.json', () => {
    const pluginRoot = join(home, 'plugins', 'example-plugin');
    writeSkill(join(pluginRoot, 'skills'), 'plugin-skill', 'from plugin');

    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    writeFileSync(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'example-plugin': [{ installPath: pluginRoot }] } })
    );

    const skills = listSkills(workspace);
    const plugin = skills.find((s) => s.name === 'plugin-skill');
    expect(plugin).toBeDefined();
    expect(plugin?.source).toBe('claude_plugin');
  });

  it('discovers codex skills when ~/.codex/skills/ is populated', () => {
    writeSkill(join(home, '.codex', 'skills'), 'codex-skill', 'from codex');
    const skills = listSkills(workspace);
    const codex = skills.find((s) => s.name === 'codex-skill');
    expect(codex).toBeDefined();
    expect(codex?.source).toBe('codex');
  });

  it('project wins when the same skill name exists in multiple sources', () => {
    writeSkill(join(workspace, '.claude', 'skills'), 'shared', 'project version');
    writeSkill(join(home, '.claude', 'skills'), 'shared', 'user version');
    writeSkill(join(home, '.codex', 'skills'), 'shared', 'codex version');

    const skills = listSkills(workspace);
    const shared = skills.filter((s) => s.name === 'shared');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.source).toBe('project');
  });

  it('returns an empty list when no sources exist', () => {
    expect(listSkills(workspace)).toEqual([]);
  });
});
