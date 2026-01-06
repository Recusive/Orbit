/*---------------------------------------------------------------------------------------------
 *  BaseAgent - Abstract base class for specialized canvas agents
 *
 *  Wraps Claude Agent SDK with:
 *  - Specialized system prompts per agent type
 *  - Context injection from Blackboard
 *  - Tool filtering (agents only see relevant tools)
 *  - Structured output handling
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'node:events';

import { query } from '@anthropic-ai/claude-agent-sdk';

import { ClaudeCredentials } from '../../../common/auth/credentials.js';
import { createLogger } from '../../../common/logging/logger.js';

import type { AgentType, BlackboardSlice, CanvasChange, Task, TaskOutput } from '../types.js';
import type {
  Options,
  Query,
  SDKMessage as ClaudeSDKMessage,
  McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';

type Logger = ReturnType<typeof createLogger>;

/**
 * Agent execution events
 */
export interface AgentEvents {
  /** Agent started thinking */
  onThinking: (text: string) => void;
  /** Agent produced text output */
  onText: (text: string) => void;
  /** Agent is using a tool */
  onToolUse: (data: { name: string; id: string; input: unknown }) => void;
  /** Agent completed */
  onComplete: (output: TaskOutput) => void;
  /** Agent encountered error */
  onError: (error: Error) => void;
}

/**
 * Configuration for agent execution
 */
export interface AgentConfig {
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Enable extended thinking */
  thinkingEnabled?: boolean;
  /** Maximum thinking tokens */
  maxThinkingTokens?: number;
  /** Execution timeout in ms */
  timeout?: number;
}

const DEFAULT_CONFIG: Required<AgentConfig> = {
  model: 'claude-sonnet-4-20250514',
  thinkingEnabled: false,
  maxThinkingTokens: 10000,
  timeout: 60000,
};

/**
 * Abstract base class for specialized agents
 */
export abstract class BaseAgent {
  protected readonly emitter = new EventEmitter();
  protected readonly logger: Logger;
  protected readonly config: Required<AgentConfig>;

  /** MCP server for canvas tools */
  protected mcpServer: McpSdkServerConfigWithInstance | null = null;

  /** Current query instance */
  protected currentQuery: Query | null = null;

  /** Collected changes during execution */
  protected collectedChanges: CanvasChange[] = [];

  /** Collected node IDs created/modified */
  protected collectedNodeIds: string[] = [];

  constructor(
    public readonly id: string,
    public readonly type: AgentType,
    config: AgentConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger(`${this.getAgentName()}Agent`);

    this.logger.info({ agentId: id, type }, 'Agent created');
  }

  // ========== Event Registration ==========

  /**
   * Register callback for thinking events
   */
  onThinking(callback: (text: string) => void): () => void {
    this.emitter.on('thinking', callback);
    return () => this.emitter.off('thinking', callback);
  }

  /**
   * Register callback for text output events
   */
  onText(callback: (text: string) => void): () => void {
    this.emitter.on('text', callback);
    return () => this.emitter.off('text', callback);
  }

  /**
   * Register callback for tool use events
   */
  onToolUse(callback: (data: { name: string; id: string; input: unknown }) => void): () => void {
    this.emitter.on('toolUse', callback);
    return () => this.emitter.off('toolUse', callback);
  }

  /**
   * Register callback for completion events
   */
  onComplete(callback: (output: TaskOutput) => void): () => void {
    this.emitter.on('complete', callback);
    return () => this.emitter.off('complete', callback);
  }

  /**
   * Register callback for error events
   */
  onError(callback: (error: Error) => void): () => void {
    this.emitter.on('error', callback);
    return () => this.emitter.off('error', callback);
  }

  // ========== Abstract Methods ==========

  /**
   * Get human-readable agent name
   */
  abstract getAgentName(): string;

  /**
   * Get the system prompt for this agent
   */
  abstract getSystemPrompt(): string;

  /**
   * Get allowed tool names for this agent
   * Returns undefined to allow all tools
   */
  abstract getAllowedTools(): string[] | undefined;

  // ========== Public Methods ==========

  /**
   * Set the MCP server for tool execution
   */
  setMcpServer(server: McpSdkServerConfigWithInstance): void {
    this.mcpServer = server;
    this.logger.info('MCP server configured');
  }

  /**
   * Execute a task
   */
  async execute(task: Task, context: BlackboardSlice): Promise<TaskOutput> {
    this.logger.info({ taskId: task.id, prompt: task.prompt.substring(0, 100) }, 'Executing task');

    // Reset state
    this.collectedChanges = [];
    this.collectedNodeIds = [];

    // Check credentials
    const credentials = ClaudeCredentials.getCredentials();
    if (!credentials.hasCredentials) {
      throw new Error(
        'No credentials found. Please log in to Claude Code CLI or set ANTHROPIC_API_KEY.'
      );
    }

    // Handle OAuth vs API key
    if (credentials.type === 'oauth') {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
    }

    try {
      // Build the prompt with context
      const fullPrompt = this.buildPrompt(task, context);

      // Create SDK options
      const options = this.createOptions();

      // Execute query
      this.currentQuery = query({
        prompt: fullPrompt,
        options,
      });

      // Process responses
      const output = await this.processResponses(task);

      this.logger.info(
        { taskId: task.id, success: output.success, changeCount: output.changes.length },
        'Task execution complete'
      );

      this.emitter.emit('complete', output);
      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ taskId: task.id, error: errorMessage }, 'Task execution failed');

      const output: TaskOutput = {
        success: false,
        changes: this.collectedChanges,
        nodeIds: this.collectedNodeIds,
        error: errorMessage,
      };

      this.emitter.emit('error', error instanceof Error ? error : new Error(errorMessage));
      return output;
    } finally {
      this.currentQuery = null;
    }
  }

  /**
   * Interrupt current execution
   */
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      this.logger.info('Interrupting query');
      await this.currentQuery.interrupt();
      this.currentQuery = null;
    }
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.emitter.removeAllListeners();
    this.currentQuery = null;
    this.mcpServer = null;
  }

  // ========== Protected Methods ==========

  /**
   * Build the full prompt with context injection
   */
  protected buildPrompt(task: Task, context: BlackboardSlice): string {
    const parts: string[] = [];

    // Add context from blackboard
    if (context.relevantNodes.length > 0) {
      parts.push('<canvas_context>');
      parts.push(`Relevant nodes (${String(context.relevantNodes.length)}):`);
      for (const node of context.relevantNodes) {
        const label = (node.data.label as string | undefined) ?? node.type;
        const code = node.data.code as string | undefined;
        parts.push(
          `- ${label} [id: ${node.id}] at (${String(node.position.x)}, ${String(node.position.y)})`
        );
        if (code) {
          const preview = code.split('\n').slice(0, 10).join('\n');
          parts.push('  Code:');
          parts.push('  ```tsx');
          parts.push(`  ${preview}`);
          parts.push('  ```');
        }
      }
      parts.push('</canvas_context>');
      parts.push('');
    }

    // Add constraints
    if (context.constraints.length > 0) {
      parts.push('<constraints>');
      for (const constraint of context.constraints) {
        parts.push(
          `- [${constraint.source}] ${constraint.type}: ${constraint.property} = ${JSON.stringify(constraint.value)}`
        );
      }
      parts.push('</constraints>');
      parts.push('');
    }

    // Add sibling outputs (for coordination)
    if (context.siblingOutputs.size > 0) {
      parts.push('<sibling_outputs>');
      parts.push('Other agents have completed:');
      for (const [taskId, output] of context.siblingOutputs) {
        const nodeList = output.nodeIds?.join(', ') ?? 'none';
        parts.push(
          `- Task ${taskId}: ${output.success ? 'success' : 'failed'}, nodes: [${nodeList}]`
        );
      }
      parts.push('</sibling_outputs>');
      parts.push('');
    }

    // Add the task prompt
    parts.push('<task>');
    parts.push(task.prompt);
    parts.push('</task>');

    // Add assigned nodes info
    if (task.assignedNodeIds.length > 0) {
      parts.push('');
      parts.push(`You are assigned to work on nodes: [${task.assignedNodeIds.join(', ')}]`);
    }

    return parts.join('\n');
  }

  /**
   * Create SDK options
   */
  protected createOptions(): Options {
    const options: Options = {
      systemPrompt: this.getSystemPrompt(),
      model: this.config.model,
      cwd: process.cwd(),
    };

    // Enable thinking if configured
    if (this.config.thinkingEnabled) {
      options.maxThinkingTokens = this.config.maxThinkingTokens;
    }

    // Configure tools
    const allowedTools = this.getAllowedTools();
    if (allowedTools) {
      options.allowedTools = [];
      options.disallowedTools = ['*']; // Disable built-in tools
    }

    // Add MCP server if available
    if (this.mcpServer) {
      options.mcpServers = {
        'snowflake-canvas': this.mcpServer,
      };
    }

    // Auto-approve canvas tools
    options.canUseTool = (toolName, toolInput) => {
      this.logger.debug({ toolName }, 'Auto-approving tool');
      return {
        behavior: 'allow' as const,
        updatedInput: toolInput,
      };
    };

    return options;
  }

  /**
   * Process responses from the query
   */
  protected async processResponses(task: Task): Promise<TaskOutput> {
    void task; // Reserved for subclass use
    if (!this.currentQuery) {
      throw new Error('No query to process');
    }

    let textOutput = '';

    for await (const message of this.currentQuery) {
      this.handleMessage(message);

      // Collect text output
      if (message.type === 'assistant' && message.message.content.length > 0) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textOutput += block.text;
          }
        }
      }
    }

    // Parse output for structured data if needed
    const parsed = this.parseOutput(textOutput);

    return {
      success: true,
      changes: [...this.collectedChanges, ...parsed.changes],
      code: parsed.code,
      nodeIds: [...new Set([...this.collectedNodeIds, ...parsed.nodeIds])],
      suggestions: parsed.suggestions,
    };
  }

  /**
   * Handle a message from Claude
   */
  protected handleMessage(message: ClaudeSDKMessage): void {
    switch (message.type) {
      case 'assistant': {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              this.emitter.emit('text', block.text);
            } else if (block.type === 'tool_use') {
              this.emitter.emit('toolUse', {
                name: block.name,
                id: block.id,
                input: block.input,
              });
              // Track node modifications from tool use
              this.trackToolUse(block.name, block.input as Record<string, unknown>);
            } else if (block.type === 'thinking') {
              const thinking = (block as { type: 'thinking'; thinking: string }).thinking || '';
              this.emitter.emit('thinking', thinking);
            }
          }
        }
        break;
      }

      case 'user': {
        // Tool result - could extract info here
        break;
      }

      case 'result': {
        // Query complete
        break;
      }

      case 'system':
      case 'stream_event':
      case 'tool_progress':
      case 'auth_status': {
        // Handle other message types - no action needed
        break;
      }
    }
  }

  /**
   * Track tool use for change collection
   */
  protected trackToolUse(toolName: string, input: Record<string, unknown>): void {
    switch (toolName) {
      case 'create_component':
      case 'create_page': {
        const nodeId = (input.node_id as string | undefined) ?? (input.name as string | undefined);
        if (nodeId) {
          this.collectedNodeIds.push(nodeId);
          this.collectedChanges.push({
            type: 'create',
            nodeId,
            after: input,
          });
        }
        break;
      }

      case 'update_component': {
        const nodeId = input.node_id as string;
        if (nodeId) {
          this.collectedNodeIds.push(nodeId);
          this.collectedChanges.push({
            type: 'update',
            nodeId,
            property: 'code',
            after: input.code,
          });
        }
        break;
      }

      case 'delete_component': {
        const nodeId = input.node_id as string;
        if (nodeId) {
          this.collectedChanges.push({
            type: 'delete',
            nodeId,
          });
        }
        break;
      }

      case 'move_component': {
        const nodeId = input.node_id as string | undefined;
        const position = input.position as { x: number; y: number } | undefined;
        if (nodeId !== undefined && position !== undefined) {
          this.collectedChanges.push({
            type: 'move',
            nodeId,
            after: position,
          });
        }
        break;
      }
    }
  }

  /**
   * Parse text output for structured data
   * Subclasses can override for specialized parsing
   */
  protected parseOutput(text: string): {
    changes: CanvasChange[];
    code?: string;
    nodeIds: string[];
    suggestions?: string[];
  } {
    void text; // Reserved for subclass use
    // Default: no additional parsing
    return {
      changes: [],
      nodeIds: [],
    };
  }
}

/**
 * Singleton instances for each agent type
 */
const agentInstances = new Map<string, BaseAgent>();

/**
 * Get or create an agent instance by ID
 */
export function getAgentInstance(id: string): BaseAgent | undefined {
  return agentInstances.get(id);
}

/**
 * Register an agent instance
 */
export function registerAgentInstance(agent: BaseAgent): void {
  agentInstances.set(agent.id, agent);
}

/**
 * Unregister an agent instance
 */
export function unregisterAgentInstance(id: string): boolean {
  const agent = agentInstances.get(id);
  if (agent) {
    agent.dispose();
    agentInstances.delete(id);
    return true;
  }
  return false;
}

/**
 * Clear all agent instances
 */
export function clearAgentInstances(): void {
  for (const agent of agentInstances.values()) {
    agent.dispose();
  }
  agentInstances.clear();
}
