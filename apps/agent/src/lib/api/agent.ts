/**
 * Agent Operations (Claude Agent SDK)
 *
 * Functions for interacting with the Claude Agent SDK.
 */

import { invoke, listen } from './core';

// ============================================
// Types
// ============================================

export interface SessionConfig {
  cwd?: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  thinkingEnabled?: boolean;
  thinkingTokens?: number;
  acceptEnabled?: boolean;
  planEnabled?: boolean;
  /** SDK session ID to resume from (for session continuity after app restart).
   * Not used for rewind — rewind uses context-prepend approach instead. */
  resumeSessionId?: string;
}

export interface AttachmentContentBlock {
  type: 'document' | 'image' | 'text';
  source?: {
    type: 'base64';
    mediaType: string;
    data: string;
  };
  content?: {
    type: 'text';
    text: string;
  };
  title?: string;
  context?: string;
}

export interface AgentMessageEvent {
  sessionId: string;
  message: AgentMessage;
}

export interface ToolMetadata {
  toolName?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  status?: 'awaiting-permission' | 'running' | 'success' | 'error';
}

export interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'result' | 'error' | 'turn_complete' | 'turn_cancel';
  content?: string;
  /** Stable message ID from SDK - all events in a single assistant turn share this ID */
  messageId?: string;
  /**
   * Position in the text stream where this event occurred.
   * For tool_use events, this is the character offset in the accumulated text
   * at the time the tool was invoked. Used to interleave tool widgets at the
   * correct position in the message.
   */
  contentOffset?: number;
  metadata?: ToolMetadata;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  totalCostUsd?: number;
  durationMs?: number;
  structuredOutput?: unknown;
  resultSubtype?: string;
}

export interface PermissionRequestEvent {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
}

export interface SessionInitEvent {
  sessionId: string;
  sdkSessionId: string;
  isResumed: boolean;
  isForked: boolean;
}

export interface ModeChangedEvent {
  sessionId: string;
  enabled: boolean;
}

export interface AgentErrorEvent {
  message: string;
  stack?: string;
}

export interface CheckpointEvent {
  sessionId: string;
  checkpointId: string;
}

export interface AuthErrorEvent {
  sessionId: string;
  category: 'TOKEN_EXPIRED' | 'REFRESH_FAILED' | 'NO_CREDENTIALS' | 'INVALID_TOKEN';
  message: string;
  recoverable: boolean;
}

export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

export interface SubagentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: AgentModel;
}

export type CommandScope = 'builtin' | 'default' | 'project' | 'personal';

export interface SlashCommandDefinition {
  name: string;
  description?: string;
  content: string;
  allowedTools?: string[];
  argumentHint?: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  scope: CommandScope;
  readonly?: boolean;
}

export interface ForkSessionOptions {
  keepAlive?: boolean;
  checkpointPrompt?: string;
  displayName?: string;
}

export interface ForkSessionResult {
  sdkSessionId: string;
  orbitSessionId?: string;
}

// ============================================
// Agent Session Operations
// ============================================

export async function agentCreateSession(sessionId: string, config?: SessionConfig): Promise<void> {
  return invoke('agent_create_session', { sessionId, config });
}

export async function agentDeleteSession(sessionId: string): Promise<void> {
  return invoke('agent_delete_session', { sessionId });
}

export async function agentSendMessage(
  sessionId: string,
  message: string,
  attachments?: AttachmentContentBlock[]
): Promise<void> {
  return invoke('agent_send_message', { sessionId, message, attachments });
}

export async function agentInterrupt(sessionId: string): Promise<void> {
  return invoke('agent_interrupt', { sessionId });
}

export async function agentIsSessionReady(sessionId: string): Promise<boolean> {
  return invoke<boolean>('agent_is_session_ready', { sessionId });
}

export async function agentGetSdkSessionId(sessionId: string): Promise<string | null> {
  return invoke<string | null>('agent_get_sdk_session_id', { sessionId });
}

export async function agentRespondPermission(
  requestId: string,
  decision: 'approve' | 'deny',
  always: boolean,
  answers?: Record<string, string>
): Promise<void> {
  return invoke('agent_respond_permission', { requestId, decision, always, answers });
}

export async function agentSetThinkingMode(
  sessionId: string,
  enabled: boolean,
  maxTokens?: number
): Promise<void> {
  return invoke('agent_set_thinking_mode', { sessionId, enabled, maxTokens });
}

export async function agentGetThinkingMode(sessionId: string): Promise<boolean> {
  return invoke<boolean>('agent_get_thinking_mode', { sessionId });
}

export async function agentSetModel(
  sessionId: string,
  model: 'haiku' | 'sonnet' | 'opus'
): Promise<void> {
  return invoke('agent_set_model', { sessionId, model });
}

export async function agentSetPlanMode(sessionId: string, enabled: boolean): Promise<void> {
  return invoke('agent_set_plan_mode', { sessionId, enabled });
}

export async function agentGetPlanMode(sessionId: string): Promise<boolean> {
  return invoke<boolean>('agent_get_plan_mode', { sessionId });
}

export async function agentSetAcceptMode(sessionId: string, enabled: boolean): Promise<void> {
  return invoke('agent_set_accept_mode', { sessionId, enabled });
}

export async function agentGetAcceptMode(sessionId: string): Promise<boolean> {
  return invoke<boolean>('agent_get_accept_mode', { sessionId });
}

// ============================================
// Agent Event Listeners
// ============================================

export async function onAgentMessage(
  callback: (event: AgentMessageEvent) => void
): Promise<() => void> {
  return listen<AgentMessageEvent>('agent:message', callback);
}

export async function onAgentPermissionRequest(
  callback: (event: PermissionRequestEvent) => void
): Promise<() => void> {
  return listen<PermissionRequestEvent>('agent:permission_request', callback);
}

export async function onAgentSessionInit(
  callback: (event: SessionInitEvent) => void
): Promise<() => void> {
  return listen<SessionInitEvent>('agent:session_init', callback);
}

export async function onAgentPlanModeChanged(
  callback: (event: ModeChangedEvent) => void
): Promise<() => void> {
  return listen<ModeChangedEvent>('agent:plan_mode_changed', callback);
}

export async function onAgentAcceptModeChanged(
  callback: (event: ModeChangedEvent) => void
): Promise<() => void> {
  return listen<ModeChangedEvent>('agent:accept_mode_changed', callback);
}

export async function onAgentError(
  callback: (event: AgentErrorEvent) => void
): Promise<() => void> {
  return listen<AgentErrorEvent>('agent:error', callback);
}

export async function onAgentCheckpoint(
  callback: (event: CheckpointEvent) => void
): Promise<() => void> {
  return listen<CheckpointEvent>('agent:checkpoint', callback);
}

export async function onAgentReady(callback: () => void): Promise<() => void> {
  return listen<undefined>('agent:ready', () => {
    callback();
  });
}

export async function onAgentAuthError(
  callback: (event: AuthErrorEvent) => void
): Promise<() => void> {
  return listen<AuthErrorEvent>('agent:auth_error', callback);
}

// ============================================
// Session Storage Operations
// ============================================

export async function agentGetStoredSession(sessionId: string): Promise<string | null> {
  return invoke<string | null>('agent_get_stored_session', { sessionId });
}

export async function agentCleanupSessions(maxAgeDays?: number): Promise<number> {
  return invoke<number>('agent_cleanup_sessions', { maxAgeDays });
}

/**
 * Rewind files to a specific checkpoint.
 * This restores all files modified by Write, Edit, NotebookEdit tools
 * to their state at the given checkpoint UUID.
 *
 * @param sessionId - The session ID
 * @param checkpointId - The checkpoint UUID (from a user message)
 */
export async function agentRewindFiles(sessionId: string, checkpointId: string): Promise<void> {
  await invoke('agent_rewind_files', { sessionId, checkpointId });
}

// ============================================
// Agent Definition Operations (Subagents)
// ============================================

export async function listAgents(workspacePath: string): Promise<SubagentDefinition[]> {
  return invoke<SubagentDefinition[]>('agent_list_agents', { workspacePath });
}

export async function getAgent(
  workspacePath: string,
  name: string
): Promise<SubagentDefinition | null> {
  return invoke<SubagentDefinition | null>('agent_get_agent', { workspacePath, name });
}

export async function createAgent(
  workspacePath: string,
  agent: SubagentDefinition
): Promise<SubagentDefinition> {
  return invoke<SubagentDefinition>('agent_create_agent', { workspacePath, agent });
}

export async function updateAgent(
  workspacePath: string,
  originalName: string,
  agent: SubagentDefinition
): Promise<SubagentDefinition> {
  return invoke<SubagentDefinition>('agent_update_agent', { workspacePath, originalName, agent });
}

export async function deleteAgent(workspacePath: string, name: string): Promise<void> {
  return invoke('agent_delete_agent', { workspacePath, name });
}

// ============================================
// Command Definition Operations (Slash Commands)
// ============================================

export async function listCommands(workspacePath: string): Promise<SlashCommandDefinition[]> {
  return invoke<SlashCommandDefinition[]>('agent_list_commands', { workspacePath });
}

export async function getCommand(
  workspacePath: string,
  name: string,
  scope: CommandScope
): Promise<SlashCommandDefinition | null> {
  return invoke<SlashCommandDefinition | null>('agent_get_command', { workspacePath, name, scope });
}

export async function createCommand(
  workspacePath: string,
  command: SlashCommandDefinition
): Promise<SlashCommandDefinition> {
  return invoke<SlashCommandDefinition>('agent_create_command', { workspacePath, command });
}

export async function updateCommand(
  workspacePath: string,
  originalName: string,
  command: SlashCommandDefinition
): Promise<SlashCommandDefinition> {
  return invoke<SlashCommandDefinition>('agent_update_command', {
    workspacePath,
    originalName,
    command,
  });
}

export async function deleteCommand(
  workspacePath: string,
  name: string,
  scope: CommandScope
): Promise<void> {
  return invoke('agent_delete_command', { workspacePath, name, scope });
}

// ============================================
// Fork and Generate Operations
// ============================================

export async function forkSession(
  sessionId: string,
  options?: ForkSessionOptions
): Promise<ForkSessionResult> {
  return invoke<ForkSessionResult>('agent_fork_session', { sessionId, options });
}

export async function generateAgentDefinition(description: string): Promise<SubagentDefinition> {
  return invoke<SubagentDefinition>('agent_generate_agent_definition', { description });
}

export async function generateCommandDefinition(
  description: string
): Promise<SlashCommandDefinition> {
  return invoke<SlashCommandDefinition>('agent_generate_command_definition', { description });
}
