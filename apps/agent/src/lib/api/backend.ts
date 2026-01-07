/**
 * Backend abstraction layer for Tauri
 *
 * This module provides a unified API for all backend operations.
 * All functions use Tauri invoke() for communication with the Rust backend.
 */

import { createLogger } from '@/lib/logger';

// ============================================
// Tauri Detection & Imports
// ============================================

const logger = createLogger('Backend');
const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    logger.debug(`Mock invoke: ${command}`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

type EventCallback<T> = (payload: T) => void;

async function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void> {
  if (!IS_TAURI) {
    logger.debug(`Mock listen: ${event}`);
    return (): void => {
      // No-op for mock mode
    };
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}

// ============================================
// File Operations
// ============================================

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>('read_file_bytes', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function writeFileBytes(path: string, content: number[]): Promise<void> {
  return invoke('write_file_bytes', { path, content });
}

export async function listDirectory(path: string, showHidden?: boolean): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_directory', { path, showHidden });
}

export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke('create_directory', { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath });
}

export async function copyFile(from: string, to: string): Promise<void> {
  return invoke('copy_file', { from, to });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export async function isDirectory(path: string): Promise<boolean> {
  return invoke<boolean>('is_directory', { path });
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke<FileInfo>('get_file_info', { path });
}

// ============================================
// LSP Operations
// ============================================

export async function lspSetWorkspace(path: string): Promise<void> {
  return invoke('lsp_set_workspace', { path });
}

export async function getCompletions(
  path: string,
  line: number,
  column: number
): Promise<CompletionItem[]> {
  return invoke<CompletionItem[]>('lsp_completions', { path, line, column });
}

export async function getHover(
  path: string,
  line: number,
  column: number
): Promise<HoverInfo | null> {
  return invoke<HoverInfo | null>('lsp_hover', { path, line, column });
}

export async function gotoDefinition(
  path: string,
  line: number,
  column: number
): Promise<Location | null> {
  return invoke<Location | null>('lsp_goto_definition', { path, line, column });
}

export async function findReferences(
  path: string,
  line: number,
  column: number
): Promise<Location[]> {
  return invoke<Location[]>('lsp_find_references', { path, line, column });
}

export async function formatDocument(path: string): Promise<string> {
  return invoke<string>('lsp_format', { path });
}

export async function getDiagnostics(path: string): Promise<Diagnostic[]> {
  return invoke<Diagnostic[]>('lsp_diagnostics', { path });
}

export async function getSignatureHelp(
  path: string,
  line: number,
  column: number
): Promise<SignatureHelp | null> {
  return invoke<SignatureHelp | null>('lsp_signature_help', { path, line, column });
}

export async function lspDidOpen(path: string, language: string, content: string): Promise<void> {
  return invoke('lsp_did_open', { path, language, content });
}

export async function lspDidChange(path: string, content: string, version: number): Promise<void> {
  return invoke('lsp_did_change', { path, content, version });
}

export async function lspDidSave(path: string): Promise<void> {
  return invoke('lsp_did_save', { path });
}

export async function lspDidClose(path: string): Promise<void> {
  return invoke('lsp_did_close', { path });
}

/**
 * Start a language server for the given language.
 * @param language - Language ID (e.g., "rust", "typescript", "python")
 * @param rootPath - Workspace root path
 */
export async function lspStart(language: string, rootPath: string): Promise<void> {
  return invoke('lsp_start', { language, rootPath });
}

/**
 * Stop a language server.
 * @param language - Language ID to stop
 */
export async function lspStop(language: string): Promise<void> {
  return invoke('lsp_stop', { language });
}

/**
 * Check if a language server is running.
 * @param language - Language ID to check
 */
export async function lspIsRunning(language: string): Promise<boolean> {
  return invoke<boolean>('lsp_is_running', { language });
}

/**
 * Get list of running language servers.
 */
export async function lspRunningServers(): Promise<string[]> {
  return invoke<string[]>('lsp_running_servers');
}

/**
 * Subscribe to diagnostics events (push-based).
 *
 * @param callback - Called when diagnostics are received for any file
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unlisten = await onDiagnostics((event) => {
 *   console.log(`${event.path}: ${event.diagnostics.length} issues`);
 * });
 *
 * // Later...
 * unlisten();
 * ```
 */
export async function onDiagnostics(
  callback: (event: DiagnosticsEvent) => void
): Promise<() => void> {
  return listen<DiagnosticsEvent>('lsp:diagnostics', callback);
}

/**
 * Subscribe to diagnostics for a specific file.
 *
 * @param filePath - Absolute path to watch
 * @param callback - Called when diagnostics change for this file
 * @returns Unsubscribe function
 */
export async function onFileDiagnostics(
  filePath: string,
  callback: (diagnostics: Diagnostic[]) => void
): Promise<() => void> {
  return listen<DiagnosticsEvent>('lsp:diagnostics', (event): void => {
    // Normalize paths for comparison
    const eventPath = event.path.replace(/\\/g, '/');
    const watchPath = filePath.replace(/\\/g, '/');

    if (eventPath === watchPath) {
      callback(event.diagnostics);
    }
  });
}

// ============================================
// Terminal Operations
// ============================================

export async function createTerminal(
  id: string,
  cwd?: string,
  shell?: string,
  cols?: number,
  rows?: number
): Promise<TerminalInfo> {
  return invoke<TerminalInfo>('terminal_create', { id, cwd, shell, cols, rows });
}

export async function writeTerminal(id: string, data: string): Promise<void> {
  return invoke('terminal_write', { id, data });
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke('terminal_resize', { id, cols, rows });
}

export async function closeTerminal(id: string): Promise<void> {
  return invoke('terminal_close', { id });
}

export async function listTerminals(): Promise<string[]> {
  return invoke<string[]>('terminal_list');
}

// Internal interface for raw base64 terminal output from backend
interface RawTerminalOutputEvent {
  id: string;
  data: string; // base64 encoded
}

/**
 * Decode base64 string to UTF-8 text.
 */
function decodeBase64(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    // If decoding fails, return empty string
    return '';
  }
}

export async function onTerminalOutput(
  callback: (data: TerminalOutputEvent) => void
): Promise<() => void> {
  return listen<RawTerminalOutputEvent>('terminal:output', (raw): void => {
    // Decode base64 data to string
    const decoded = decodeBase64(raw.data);
    callback({
      id: raw.id,
      data: decoded,
    });
  });
}

export async function onTerminalExit(
  callback: (data: TerminalExitEvent) => void
): Promise<() => void> {
  return listen<TerminalExitEvent>('terminal:exit', callback);
}

/** Event emitted when the terminal foreground process changes. */
export interface TerminalForegroundEvent {
  /** Terminal ID. */
  id: string;
  /** Process name (e.g., "zsh", "node", "python"). */
  process_name: string;
  /** Process ID. */
  pid: number;
}

export async function onTerminalForeground(
  callback: (data: TerminalForegroundEvent) => void
): Promise<() => void> {
  return listen<TerminalForegroundEvent>('terminal:foreground', callback);
}

export type TerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

/**
 * Send a signal to a terminal process.
 * - SIGINT: Interrupt (Ctrl+C)
 * - SIGTERM: Graceful termination
 * - SIGKILL: Force kill
 */
export async function sendTerminalSignal(id: string, signal: TerminalSignal): Promise<void> {
  return invoke('terminal_signal', { id, signal });
}

/**
 * Acknowledge data received from a terminal (for flow control).
 * Call this after processing terminal output to prevent buffer overflow.
 */
export async function acknowledgeTerminalData(id: string, byteCount: number): Promise<void> {
  return invoke('terminal_acknowledge', { id, byteCount });
}

/**
 * Get the number of pending bytes (written but not acknowledged) for a terminal.
 * Useful for implementing backpressure.
 */
export async function getTerminalPendingBytes(id: string): Promise<number> {
  return invoke<number>('terminal_pending_bytes', { id });
}

export interface TerminalPromptEvent {
  id: string;
  promptType?: 'primary' | 'continuation' | 'secondary';
}

/**
 * Emit a prompt event (called when shell integration detects a prompt).
 * This is typically called by the frontend when xterm.js shell integration fires.
 */
export async function emitTerminalPrompt(
  id: string,
  promptType?: 'primary' | 'continuation' | 'secondary'
): Promise<void> {
  return invoke('terminal_emit_prompt', { id, promptType });
}

/**
 * Subscribe to terminal prompt events.
 */
export async function onTerminalPrompt(
  callback: (data: TerminalPromptEvent) => void
): Promise<() => void> {
  return listen<TerminalPromptEvent>('terminal:prompt', callback);
}

// ============================================
// Git Operations
// ============================================

export async function gitDiscover(path: string): Promise<string> {
  return invoke<string>('git_discover', { path });
}

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { repoPath });
}

export async function gitStage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_stage', { repoPath, files });
}

export async function gitUnstage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_unstage', { repoPath, files });
}

export async function gitStageAll(repoPath: string): Promise<void> {
  return invoke('git_stage_all', { repoPath });
}

export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return invoke<string>('git_commit', { repoPath, message });
}

export async function gitDiff(repoPath: string, file?: string): Promise<string> {
  return invoke<string>('git_diff', { repoPath, file });
}

export async function gitDiffStructured(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_diff_structured', { repoPath });
}

export async function gitStagedDiff(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_staged_diff', { repoPath });
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_discard', { repoPath, files });
}

export async function gitLog(repoPath: string, limit?: number): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_log', { repoPath, limit });
}

export async function gitBranches(repoPath: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>('git_branches', { repoPath });
}

export async function gitBranchInfo(repoPath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>('git_branch_info', { repoPath });
}

export async function gitCheckout(repoPath: string, branch: string): Promise<void> {
  return invoke('git_checkout', { repoPath, branch });
}

export async function gitCreateBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_create_branch', { repoPath, name });
}

export async function gitDeleteBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_delete_branch', { repoPath, name });
}

export async function gitBlame(repoPath: string, file: string): Promise<BlameLine[]> {
  return invoke<BlameLine[]>('git_blame', { repoPath, file });
}

export async function gitPush(repoPath: string, remote?: string): Promise<void> {
  return invoke('git_push', { repoPath, remote });
}

export async function gitPull(repoPath: string, remote?: string): Promise<void> {
  return invoke('git_pull', { repoPath, remote });
}

// ============================================
// Agent Operations (Claude Agent SDK)
// ============================================

export interface SessionConfig {
  cwd?: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  thinkingEnabled?: boolean;
  thinkingTokens?: number;
  acceptEnabled?: boolean;
  planEnabled?: boolean;
  // NOTE: We intentionally removed resumeSessionId, forkSession, and resumeSessionAt.
  // For rewind scenarios, we DON'T use SDK's resume because it loads ALL messages.
  // Instead, we prepend the truncated conversation history to the first message.
  // This matches how Claude Code handles rewind - they slice messages BEFORE passing to SDK.
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

// Agent Event Listeners

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

export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

export interface SubagentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: AgentModel;
}

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

export interface ForkSessionOptions {
  keepAlive?: boolean;
  checkpointPrompt?: string;
  displayName?: string;
}

export interface ForkSessionResult {
  sdkSessionId: string;
  orbitSessionId?: string;
}

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

// ============================================
// Conversation Operations
// ============================================

export interface ConversationMessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  createdAt: number;
  toolUses?: ToolUseDto[];
  usage?: TokenUsageDto;
}

export interface ToolUseDto {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  success: boolean;
}

export interface TokenUsageDto {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  totalCostUsd?: number;
}

export interface ConversationDto {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessageDto[];
  workspacePath?: string;
  forkedFrom?: string;
}

export interface ConversationSummaryDto {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string;
}

export async function conversationCreate(
  sessionId: string,
  title: string,
  workspacePath?: string
): Promise<ConversationDto> {
  return invoke<ConversationDto>('conversation_create', { sessionId, title, workspacePath });
}

export async function conversationList(workspacePath?: string): Promise<ConversationSummaryDto[]> {
  return invoke<ConversationSummaryDto[]>('conversation_list', { workspacePath });
}

export async function conversationLoad(sessionId: string): Promise<ConversationDto | null> {
  return invoke<ConversationDto | null>('conversation_load', { sessionId });
}

export async function conversationDelete(sessionId: string): Promise<void> {
  return invoke('conversation_delete', { sessionId });
}

export async function conversationUpdateTitle(sessionId: string, title: string): Promise<void> {
  return invoke('conversation_update_title', { sessionId, title });
}

export async function conversationAddMessage(
  sessionId: string,
  message: ConversationMessageDto,
  workspacePath?: string
): Promise<void> {
  return invoke('conversation_add_message', { sessionId, message, workspacePath });
}

export async function conversationFork(
  sessionId: string,
  newSessionId: string,
  upToMessageId?: string
): Promise<ConversationDto | null> {
  return invoke<ConversationDto | null>('conversation_fork', {
    sessionId,
    newSessionId,
    upToMessageId,
  });
}

export async function conversationDataPath(): Promise<string> {
  return invoke<string>('conversation_data_path');
}

export async function conversationCleanupOrphaned(): Promise<number> {
  return invoke<number>('conversation_cleanup_orphaned');
}

// ============================================
// AI Operations
// ============================================

export async function aiChat(
  messages: ChatMessage[],
  model?: string,
  onChunk?: (chunk: string) => void
): Promise<ChatResponse> {
  // Set up streaming listener if callback provided
  let unlisten: (() => void) | undefined;
  if (onChunk) {
    unlisten = await listen<string>('ai:chunk', onChunk);
  }

  try {
    return await invoke<ChatResponse>('ai_chat', { messages, model });
  } finally {
    unlisten?.();
  }
}

export async function aiComplete(
  prefix: string,
  suffix: string,
  language: string
): Promise<string> {
  return invoke<string>('ai_complete', { prefix, suffix, language });
}

export async function aiStopGeneration(): Promise<void> {
  return invoke('ai_stop');
}

// ============================================
// Search Operations
// ============================================

export async function searchFiles(
  rootPath: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_files', { rootPath, query, ...options });
}

export async function searchText(
  rootPath: string,
  pattern: string,
  options?: SearchOptions
): Promise<TextSearchResult[]> {
  return invoke<TextSearchResult[]>('search_text', { rootPath, pattern, ...options });
}

// ============================================
// File Watcher
// ============================================

export async function watchPath(path: string): Promise<void> {
  return invoke('watch_path', { path });
}

export async function unwatchPath(path: string): Promise<void> {
  return invoke('unwatch_path', { path });
}

export async function onFileChange(
  callback: (event: FileChangeEvent) => void
): Promise<() => void> {
  return listen<FileChangeEvent>('file:change', callback);
}

// ============================================
// Window Operations
// ============================================

export async function openFileDialog(
  options?: FileDialogOptions
): Promise<string | string[] | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] openFileDialog');
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open(options);
}

export async function saveFileDialog(options?: SaveDialogOptions): Promise<string | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] saveFileDialog');
    return null;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save(options);
}

// ============================================
// Clipboard
// ============================================

export async function clipboardRead(): Promise<string> {
  if (!IS_TAURI) {
    return navigator.clipboard.readText();
  }
  const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
  return readText();
}

export async function clipboardWrite(text: string): Promise<void> {
  if (!IS_TAURI) {
    return navigator.clipboard.writeText(text);
  }
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
  return writeText(text);
}

// ============================================
// App Info
// ============================================

export async function getAppVersion(): Promise<string> {
  if (!IS_TAURI) {
    return '0.0.0-dev';
  }
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function getWorkspacePath(): Promise<string | null> {
  return invoke<string | null>('get_workspace_path');
}

export async function setWorkspacePath(path: string): Promise<void> {
  return invoke('set_workspace_path', { path });
}

// ============================================
// Settings Operations
// ============================================

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke('update_settings', { settings });
}

export async function addRecentProject(path: string): Promise<void> {
  return invoke('add_recent_project', { path });
}

export async function getRecentProjects(): Promise<string[]> {
  return invoke<string[]>('get_recent_projects');
}

export async function clearRecentProjects(): Promise<void> {
  return invoke('clear_recent_projects');
}

export async function getSettingsPath(): Promise<string> {
  return invoke<string>('get_settings_path');
}

// ============================================
// Diagnostics Operations
// ============================================

/**
 * Check if the previous session crashed.
 *
 * Returns the crash log contents if there was a crash, or null if
 * the previous session ended normally.
 *
 * The crash log is consumed (cleared) after reading, so subsequent calls
 * will return null until another crash occurs.
 */
export async function checkPreviousCrash(): Promise<string | null> {
  return invoke<string | null>('check_previous_crash');
}

/**
 * Clear any pending crash logs without reading them.
 *
 * This is useful when the user dismisses a crash notification without
 * viewing the details.
 *
 * Returns true if the log was cleared successfully.
 */
export async function clearCrashLog(): Promise<boolean> {
  return invoke<boolean>('clear_crash_log');
}

/**
 * Get the path to the crash log directory.
 *
 * Returns null if the directory cannot be determined.
 */
export async function getCrashLogPath(): Promise<string | null> {
  return invoke<string | null>('get_crash_log_path');
}

// ============================================
// Types
// ============================================

export interface FileEntry {
  /** Full path to the file */
  path: string;
  /** File name without directory */
  name: string;
  /** Whether this is a directory */
  isDir: boolean;
  /** Whether this is a symbolic link */
  isSymlink: boolean;
  /** Whether this is a hidden file (name starts with dot) */
  isHidden: boolean;
  /** File size in bytes (undefined for directories) */
  size?: number;
  /** Last modified timestamp (Unix epoch seconds) */
  modified?: number;
}

export interface FileInfo {
  path: string;
  name: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  created: number;
  readonly: boolean;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface HoverInfo {
  contents: string;
  range?: Range;
}

export interface Location {
  path: string;
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  range: Range;
  source?: string;
  code?: string;
}

/**
 * Diagnostics event from LSP server (push-based).
 */
export interface DiagnosticsEvent {
  /** File path (absolute) */
  path: string;
  /** Diagnostics for this file */
  diagnostics: Diagnostic[];
  /** Language server that produced these */
  language: string;
}

export interface SignatureHelp {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: ParameterInfo[];
}

export interface ParameterInfo {
  label: string;
  documentation?: string;
}

export interface TerminalInfo {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface TerminalOutputEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  code: number;
}

/**
 * File status in git.
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'
  | 'typechange';

/**
 * A file's status entry in git.
 */
export interface StatusEntry {
  /** File path relative to repository root */
  path: string;
  /** Status type */
  status: FileStatus;
  /** Original path for renames/copies */
  oldPath: string | null;
  /** Similarity percentage for renames/copies (0-100) */
  similarity: number | null;
}

/**
 * Complete git repository status.
 */
export interface GitStatus {
  /** Current branch name (empty if detached HEAD) */
  branch: string;
  /** Upstream branch name if tracking */
  upstream: string | null;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Files staged for commit (in index) */
  staged: StatusEntry[];
  /** Files modified but not staged (in working tree) */
  modified: StatusEntry[];
  /** Untracked files */
  untracked: StatusEntry[];
  /** Files with merge conflicts */
  conflicted: StatusEntry[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: number;
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream?: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}

export interface DiffLine {
  origin: string;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
  isBinary: boolean;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  content: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model?: string;
  stopReason?: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  include?: string[];
  exclude?: string[];
  maxResults?: number;
}

export interface SearchResult {
  path: string;
  name: string;
  isDir: boolean;
}

export interface TextSearchResult {
  path: string;
  line: number;
  column: number;
  matchLength: number;
  lineContent: string;
  beforeContext?: string[];
  afterContext?: string[];
}

export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
}

export interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  vimMode: boolean;
}

export interface ThemeSettings {
  theme: string;
  accentColor?: string;
}

export interface AISettings {
  enabled: boolean;
  inlineSuggestions: boolean;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface Settings {
  editor: EditorSettings;
  theme: ThemeSettings;
  ai: AISettings;
  windowState: WindowState;
  recentProjects: string[];
}

// ============================================
// Dev-Monitor Operations (dev-only)
// ============================================

/**
 * Dev log entry for the monitoring system.
 * This is only used in development builds.
 */
export interface DevLogEntry {
  timestamp: number;
  severity: string;
  category: string;
  file: string;
  function?: string;
  title: string;
  details?: string;
  context?: Record<string, unknown>;
  dedupCount?: number;
}

/**
 * Ensure the dev-monitor output directory exists.
 * Creates the directory and any parent directories if needed.
 *
 * @param dirPath - Path to the directory to create
 */
export async function devMonitorEnsureDir(dirPath: string): Promise<void> {
  return invoke('dev_monitor_ensure_dir', { dirPath });
}

/**
 * Write a batch of log entries to a JSONL file.
 * Each entry is written as a single JSON line, appended to the file.
 *
 * @param filePath - Path to the JSONL file
 * @param entries - Array of log entries to write
 */
export async function devMonitorWriteBatch(
  filePath: string,
  entries: DevLogEntry[]
): Promise<void> {
  return invoke('dev_monitor_write_batch', { filePath, entries });
}

/**
 * Read recent log entries from a JSONL file.
 *
 * @param filePath - Path to the JSONL file
 * @param limit - Maximum number of entries to return (default: 100)
 */
export async function devMonitorReadEntries(
  filePath: string,
  limit?: number
): Promise<DevLogEntry[]> {
  return invoke<DevLogEntry[]>('dev_monitor_read_entries', { filePath, limit });
}

/**
 * Clear all log files in the dev-monitor directory.
 *
 * @param dirPath - Path to the dev-monitor directory
 */
export async function devMonitorClear(dirPath: string): Promise<void> {
  return invoke('dev_monitor_clear', { dirPath });
}

// ============================================
// Utility: Check if running in Tauri
// ============================================

export function isTauri(): boolean {
  return IS_TAURI;
}
