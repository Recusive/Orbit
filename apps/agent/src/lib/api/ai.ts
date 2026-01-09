/**
 * AI Operations
 *
 * Functions for AI chat and code completion.
 */

import { invoke, listen } from './core';

// ============================================
// Types
// ============================================

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
