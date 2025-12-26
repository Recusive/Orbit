/*---------------------------------------------------------------------------------------------
 *  Agent Definitions Service - CRUD operations for .claude/agents/*.md files
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createLogger } from './logger.js';

const logger = createLogger('AgentDefinitions');

/**
 * Subagent definition structure
 */
export interface SubagentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

/**
 * Get the agents directory path for a workspace
 */
function getAgentsDir(workspacePath: string): string {
  return path.join(workspacePath, '.claude', 'agents');
}

/**
 * Ensure the agents directory exists
 */
function ensureAgentsDir(workspacePath: string): void {
  const agentsDir = getAgentsDir(workspacePath);
  const claudeDir = path.join(workspacePath, '.claude');

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }
}

/**
 * Parse YAML frontmatter from markdown content
 * Expected format:
 * ---
 * name: agent-name
 * description: Agent description
 * tools: Read, Grep, Glob
 * model: sonnet
 * ---
 *
 * Prompt content goes here...
 */
function parseAgentFile(content: string, filename: string): SubagentDefinition | null {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);

  if (frontmatterMatch === null) {
    // No frontmatter, treat entire content as prompt with filename as name
    return {
      name: filename.replace(/\.md$/, ''),
      description: '',
      prompt: content.trim(),
    };
  }

  const [, frontmatter, prompt] = frontmatterMatch;

  // Parse YAML frontmatter (simple key: value parsing)
  const metadata = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (match !== null) {
      metadata.set(match[1], match[2].trim());
    }
  }

  // Parse tools array from comma-separated string
  let tools: string[] | undefined;
  const toolsValue = metadata.get('tools');
  if (toolsValue !== undefined && toolsValue.length > 0) {
    tools = toolsValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  // Parse disallowedTools array
  let disallowedTools: string[] | undefined;
  const disallowedToolsValue = metadata.get('disallowedTools');
  if (disallowedToolsValue !== undefined && disallowedToolsValue.length > 0) {
    disallowedTools = disallowedToolsValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  // Validate model
  let model: 'sonnet' | 'opus' | 'haiku' | 'inherit' | undefined;
  const modelValue = metadata.get('model');
  if (modelValue !== undefined) {
    const validModels = ['sonnet', 'opus', 'haiku', 'inherit'];
    if (validModels.includes(modelValue)) {
      model = modelValue as typeof model;
    }
  }

  return {
    name: metadata.get('name') ?? filename.replace(/\.md$/, ''),
    description: metadata.get('description') ?? '',
    prompt: prompt.trim(),
    tools,
    disallowedTools,
    model,
  };
}

/**
 * Convert agent definition to markdown file content
 */
function agentToMarkdown(agent: SubagentDefinition): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${agent.name}`);
  lines.push(`description: ${agent.description}`);

  if (agent.tools !== undefined && agent.tools.length > 0) {
    lines.push(`tools: ${agent.tools.join(', ')}`);
  }

  if (agent.disallowedTools !== undefined && agent.disallowedTools.length > 0) {
    lines.push(`disallowedTools: ${agent.disallowedTools.join(', ')}`);
  }

  if (agent.model !== undefined) {
    lines.push(`model: ${agent.model}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(agent.prompt);

  return lines.join('\n');
}

/**
 * Sanitize agent name for use as filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List all agent definitions in a workspace
 */
export function listAgents(workspacePath: string): SubagentDefinition[] {
  const agentsDir = getAgentsDir(workspacePath);

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  const agents: SubagentDefinition[] = [];

  try {
    const files = fs.readdirSync(agentsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(agentsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const agent = parseAgentFile(content, file);
        if (agent !== null) {
          agents.push(agent);
        }
      } catch (error) {
        logger.warn({ file, error }, 'Failed to parse agent file');
      }
    }

    logger.info({ count: agents.length, workspacePath }, 'Listed agents');
    return agents;
  } catch (error) {
    logger.error({ error, workspacePath }, 'Failed to list agents');
    return [];
  }
}

/**
 * Get a single agent definition by name
 */
export function getAgent(workspacePath: string, name: string): SubagentDefinition | null {
  const agentsDir = getAgentsDir(workspacePath);
  const filename = sanitizeFilename(name) + '.md';
  const filePath = path.join(agentsDir, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseAgentFile(content, filename);
  } catch (error) {
    logger.error({ error, name }, 'Failed to read agent');
    return null;
  }
}

/**
 * Create a new agent definition
 */
export function createAgent(workspacePath: string, agent: SubagentDefinition): SubagentDefinition {
  ensureAgentsDir(workspacePath);

  const agentsDir = getAgentsDir(workspacePath);
  const filename = sanitizeFilename(agent.name) + '.md';
  const filePath = path.join(agentsDir, filename);

  // Check if already exists
  if (fs.existsSync(filePath)) {
    throw new Error(`Agent "${agent.name}" already exists`);
  }

  const content = agentToMarkdown(agent);
  fs.writeFileSync(filePath, content, 'utf-8');

  logger.info({ name: agent.name, path: filePath }, 'Created agent');

  // Return the agent with sanitized name
  return {
    ...agent,
    name: sanitizeFilename(agent.name),
  };
}

/**
 * Update an existing agent definition
 */
export function updateAgent(
  workspacePath: string,
  originalName: string,
  agent: SubagentDefinition
): SubagentDefinition {
  ensureAgentsDir(workspacePath);

  const agentsDir = getAgentsDir(workspacePath);
  const originalFilename = sanitizeFilename(originalName) + '.md';
  const originalPath = path.join(agentsDir, originalFilename);

  // Check if original exists
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Agent "${originalName}" not found`);
  }

  const newFilename = sanitizeFilename(agent.name) + '.md';
  const newPath = path.join(agentsDir, newFilename);

  // If renaming, check new name doesn't exist
  if (originalFilename !== newFilename && fs.existsSync(newPath)) {
    throw new Error(`Agent "${agent.name}" already exists`);
  }

  // Write new content
  const content = agentToMarkdown(agent);
  fs.writeFileSync(newPath, content, 'utf-8');

  // Delete old file if renamed
  if (originalFilename !== newFilename) {
    fs.unlinkSync(originalPath);
  }

  logger.info({ originalName, newName: agent.name, path: newPath }, 'Updated agent');

  return {
    ...agent,
    name: sanitizeFilename(agent.name),
  };
}

/**
 * Delete an agent definition
 */
export function deleteAgent(workspacePath: string, name: string): void {
  const agentsDir = getAgentsDir(workspacePath);
  const filename = sanitizeFilename(name) + '.md';
  const filePath = path.join(agentsDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent "${name}" not found`);
  }

  fs.unlinkSync(filePath);
  logger.info({ name, path: filePath }, 'Deleted agent');
}

/**
 * Convert SubagentDefinitions to the SDK AgentDefinition format
 * This is used when creating sessions to pass to the SDK
 */
export function convertToSdkFormat(agents: SubagentDefinition[]): Record<
  string,
  {
    description: string;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  }
> {
  const result: Record<
    string,
    {
      description: string;
      prompt: string;
      tools?: string[];
      disallowedTools?: string[];
      model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
    }
  > = {};

  for (const agent of agents) {
    result[agent.name] = {
      description: agent.description,
      prompt: agent.prompt,
      tools: agent.tools,
      disallowedTools: agent.disallowedTools,
      model: agent.model,
    };
  }

  return result;
}
