/*---------------------------------------------------------------------------------------------
 *  Command Definitions Service - CRUD operations for .claude/commands/*.md files
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('CommandDefinitions');

// Command scope: where the command comes from
export type CommandScope = 'builtin' | 'default' | 'project' | 'personal';

// Slash command definition
export interface SlashCommandDefinition {
  name: string;
  description?: string;
  content: string; // The actual prompt content
  allowedTools?: string[];
  argumentHint?: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  scope: CommandScope;
  readonly?: boolean;
}

/**
 * Built-in commands that are always available (read-only)
 */
const BUILTIN_COMMANDS: SlashCommandDefinition[] = [
  {
    name: 'compact',
    description: 'Compact conversation history to save context',
    content: '/compact',
    scope: 'builtin',
    readonly: true,
  },
  {
    name: 'clear',
    description: 'Clear conversation and start fresh',
    content: '/clear',
    scope: 'builtin',
    readonly: true,
  },
  {
    name: 'help',
    description: 'Show available commands and help',
    content: '/help',
    scope: 'builtin',
    readonly: true,
  },
];

/**
 * Default commands shipped with Snowflake (read-only)
 */
const DEFAULT_COMMANDS: SlashCommandDefinition[] = [
  {
    name: 'review-pr',
    description: 'Review the current pull request',
    content: `Review the current pull request thoroughly.

## Review Checklist
1. Code quality and readability
2. Security vulnerabilities
3. Performance implications
4. Test coverage
5. Documentation completeness

Provide specific, actionable feedback organized by priority.`,
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    scope: 'default',
    readonly: true,
  },
  {
    name: 'fix-tests',
    description: 'Find and fix failing tests',
    content: `Find and fix failing tests in the codebase.

1. Run the test suite to identify failures
2. Analyze the error messages
3. Fix the underlying issues
4. Re-run tests to verify fixes

Be thorough and ensure all tests pass.`,
    allowedTools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'],
    scope: 'default',
    readonly: true,
  },
  {
    name: 'document',
    description: 'Generate documentation for code',
    content: `Generate comprehensive documentation for the specified code.

Include:
- Function/class descriptions
- Parameter documentation
- Return value documentation
- Usage examples where appropriate

Follow the project's existing documentation style.`,
    argumentHint: '[file-or-function]',
    allowedTools: ['Read', 'Edit', 'Grep', 'Glob'],
    scope: 'default',
    readonly: true,
  },
];

/**
 * Get the commands directory path for a workspace (project scope)
 */
function getProjectCommandsDir(workspacePath: string): string {
  return path.join(workspacePath, '.claude', 'commands');
}

/**
 * Get the personal commands directory path (global scope)
 */
function getPersonalCommandsDir(): string {
  return path.join(os.homedir(), '.claude', 'commands');
}

/**
 * Ensure a commands directory exists
 */
function ensureCommandsDir(dirPath: string): void {
  const claudeDir = path.dirname(dirPath);

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Parse YAML frontmatter from markdown content
 * Expected format:
 * ---
 * description: Command description
 * allowed-tools: Read, Grep, Glob
 * argument-hint: [file] [options]
 * model: sonnet
 * ---
 *
 * Command content goes here...
 */
function parseCommandFile(
  content: string,
  filename: string,
  scope: CommandScope
): SlashCommandDefinition | null {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);

  if (frontmatterMatch === null) {
    // No frontmatter, treat entire content as command content with filename as name
    return {
      name: filename.replace(/\.md$/, ''),
      content: content.trim(),
      scope,
    };
  }

  const frontmatter = frontmatterMatch[1];
  const commandContent = frontmatterMatch[2];

  if (frontmatter === undefined || commandContent === undefined) {
    return {
      name: filename.replace(/\.md$/, ''),
      content: content.trim(),
      scope,
    };
  }

  // Parse YAML frontmatter (simple key: value parsing)
  const metadata = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match !== null) {
      const key = match[1];
      const value = match[2];
      if (key !== undefined && value !== undefined) {
        metadata.set(key, value.trim());
      }
    }
  }

  // Parse allowed-tools array from comma-separated string
  let allowedTools: string[] | undefined;
  const allowedToolsValue = metadata.get('allowed-tools');
  if (allowedToolsValue !== undefined && allowedToolsValue.length > 0) {
    allowedTools = allowedToolsValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  // Validate model
  let model: 'sonnet' | 'opus' | 'haiku' | undefined;
  const modelValue = metadata.get('model');
  if (modelValue !== undefined) {
    const validModels = ['sonnet', 'opus', 'haiku'];
    if (validModels.includes(modelValue)) {
      model = modelValue as typeof model;
    }
  }

  return {
    name: filename.replace(/\.md$/, ''),
    description: metadata.get('description'),
    content: commandContent.trim(),
    allowedTools,
    argumentHint: metadata.get('argument-hint'),
    model,
    scope,
  };
}

/**
 * Convert command definition to markdown file content
 */
function commandToMarkdown(command: SlashCommandDefinition): string {
  const lines: string[] = ['---'];

  if (command.description !== undefined) {
    lines.push(`description: ${command.description}`);
  }

  if (command.allowedTools !== undefined && command.allowedTools.length > 0) {
    lines.push(`allowed-tools: ${command.allowedTools.join(', ')}`);
  }

  if (command.argumentHint !== undefined) {
    lines.push(`argument-hint: ${command.argumentHint}`);
  }

  if (command.model !== undefined) {
    lines.push(`model: ${command.model}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(command.content);

  return lines.join('\n');
}

/**
 * Sanitize command name for use as filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List commands from a directory
 */
function listCommandsFromDir(dirPath: string, scope: CommandScope): SlashCommandDefinition[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const commands: SlashCommandDefinition[] = [];

  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      if (!file.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const command = parseCommandFile(content, file, scope);
        if (command !== null) {
          commands.push(command);
        }
      } catch (error) {
        logger.warn({ file, error }, 'Failed to parse command file');
      }
    }

    return commands;
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to list commands from directory');
    return [];
  }
}

/**
 * List all slash command definitions
 * Returns commands from all scopes: builtin, default, project, personal
 */
export function listCommands(workspacePath: string): SlashCommandDefinition[] {
  const commands: SlashCommandDefinition[] = [];

  // Add builtin commands (always available)
  commands.push(...BUILTIN_COMMANDS);

  // Add default commands (shipped with Snowflake)
  commands.push(...DEFAULT_COMMANDS);

  // Add project commands
  const projectDir = getProjectCommandsDir(workspacePath);
  const projectCommands = listCommandsFromDir(projectDir, 'project');
  commands.push(...projectCommands);

  // Add personal commands
  const personalDir = getPersonalCommandsDir();
  const personalCommands = listCommandsFromDir(personalDir, 'personal');
  commands.push(...personalCommands);

  logger.info(
    {
      builtin: BUILTIN_COMMANDS.length,
      default: DEFAULT_COMMANDS.length,
      project: projectCommands.length,
      personal: personalCommands.length,
      total: commands.length,
      workspacePath,
    },
    'Listed commands'
  );

  return commands;
}

/**
 * Get a single command definition by name and scope
 */
export function getCommand(
  workspacePath: string,
  name: string,
  scope: CommandScope
): SlashCommandDefinition | null {
  // Check builtin commands
  if (scope === 'builtin') {
    return BUILTIN_COMMANDS.find((c) => c.name === name) ?? null;
  }

  // Check default commands
  if (scope === 'default') {
    return DEFAULT_COMMANDS.find((c) => c.name === name) ?? null;
  }

  // Get from filesystem
  const dirPath =
    scope === 'project' ? getProjectCommandsDir(workspacePath) : getPersonalCommandsDir();

  const filename = sanitizeFilename(name) + '.md';
  const filePath = path.join(dirPath, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseCommandFile(content, filename, scope);
  } catch (error) {
    logger.error({ error, name, scope }, 'Failed to read command');
    return null;
  }
}

/**
 * Create a new command definition
 */
export function createCommand(
  workspacePath: string,
  command: SlashCommandDefinition
): SlashCommandDefinition {
  // Can only create project or personal commands
  if (command.scope !== 'project' && command.scope !== 'personal') {
    throw new Error('Can only create project or personal commands');
  }

  const dirPath =
    command.scope === 'project' ? getProjectCommandsDir(workspacePath) : getPersonalCommandsDir();

  ensureCommandsDir(dirPath);

  const filename = sanitizeFilename(command.name) + '.md';
  const filePath = path.join(dirPath, filename);

  // Check if already exists
  if (fs.existsSync(filePath)) {
    throw new Error(`Command "${command.name}" already exists in ${command.scope} scope`);
  }

  const content = commandToMarkdown(command);
  fs.writeFileSync(filePath, content, 'utf-8');

  logger.info({ name: command.name, scope: command.scope, path: filePath }, 'Created command');

  // Return the command with sanitized name
  return {
    ...command,
    name: sanitizeFilename(command.name),
  };
}

/**
 * Update an existing command definition
 */
export function updateCommand(
  workspacePath: string,
  originalName: string,
  command: SlashCommandDefinition
): SlashCommandDefinition {
  // Can only update project or personal commands
  if (command.scope !== 'project' && command.scope !== 'personal') {
    throw new Error('Can only update project or personal commands');
  }

  const dirPath =
    command.scope === 'project' ? getProjectCommandsDir(workspacePath) : getPersonalCommandsDir();

  ensureCommandsDir(dirPath);

  const originalFilename = sanitizeFilename(originalName) + '.md';
  const originalPath = path.join(dirPath, originalFilename);

  // Check if original exists
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Command "${originalName}" not found in ${command.scope} scope`);
  }

  const newFilename = sanitizeFilename(command.name) + '.md';
  const newPath = path.join(dirPath, newFilename);

  // If renaming, check new name doesn't exist
  if (originalFilename !== newFilename && fs.existsSync(newPath)) {
    throw new Error(`Command "${command.name}" already exists in ${command.scope} scope`);
  }

  // Write new content
  const content = commandToMarkdown(command);
  fs.writeFileSync(newPath, content, 'utf-8');

  // Delete old file if renamed
  if (originalFilename !== newFilename) {
    fs.unlinkSync(originalPath);
  }

  logger.info(
    { originalName, newName: command.name, scope: command.scope, path: newPath },
    'Updated command'
  );

  return {
    ...command,
    name: sanitizeFilename(command.name),
  };
}

/**
 * Delete a command definition
 */
export function deleteCommand(workspacePath: string, name: string, scope: CommandScope): void {
  // Can only delete project or personal commands
  if (scope !== 'project' && scope !== 'personal') {
    throw new Error('Can only delete project or personal commands');
  }

  const dirPath =
    scope === 'project' ? getProjectCommandsDir(workspacePath) : getPersonalCommandsDir();

  const filename = sanitizeFilename(name) + '.md';
  const filePath = path.join(dirPath, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Command "${name}" not found in ${scope} scope`);
  }

  fs.unlinkSync(filePath);
  logger.info({ name, scope, path: filePath }, 'Deleted command');
}
