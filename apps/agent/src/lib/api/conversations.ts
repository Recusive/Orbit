/**
 * Conversation Operations
 *
 * Functions for storing and retrieving conversation history.
 */

import { invoke } from './core';

// ============================================
// Types
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
  worktreePath?: string;
  forkedFrom?: string;
}

export interface ConversationSummaryDto {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string;
  worktreePath?: string;
}

// ============================================
// Conversation Operations
// ============================================

export async function conversationCreate(
  sessionId: string,
  title: string,
  workspacePath?: string,
  worktreePath?: string
): Promise<ConversationDto> {
  return invoke<ConversationDto>('conversation_create', {
    sessionId,
    title,
    workspacePath,
    worktreePath,
  });
}

export async function conversationList(
  workspacePath?: string,
  worktreePath?: string
): Promise<ConversationSummaryDto[]> {
  return invoke<ConversationSummaryDto[]>('conversation_list', { workspacePath, worktreePath });
}

export async function conversationLoad(
  sessionId: string,
  workspacePath?: string
): Promise<ConversationDto | null> {
  return invoke<ConversationDto | null>('conversation_load', { sessionId, workspacePath });
}

export async function conversationDelete(sessionId: string, workspacePath?: string): Promise<void> {
  return invoke('conversation_delete', { sessionId, workspacePath });
}

export async function conversationUpdateTitle(sessionId: string, title: string): Promise<void> {
  return invoke('conversation_update_title', { sessionId, title });
}

export async function conversationAddMessage(
  sessionId: string,
  message: ConversationMessageDto,
  workspacePath?: string,
  worktreePath?: string
): Promise<void> {
  return invoke('conversation_add_message', { sessionId, message, workspacePath, worktreePath });
}

export async function conversationFork(
  sessionId: string,
  newSessionId: string,
  upToMessageId?: string,
  workspacePath?: string
): Promise<ConversationDto | null> {
  return invoke<ConversationDto | null>('conversation_fork', {
    sessionId,
    newSessionId,
    upToMessageId,
    workspacePath,
  });
}
