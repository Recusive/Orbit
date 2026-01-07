import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Hook Types
// ═══════════════════════════════════════════════════════════════

export type MessageHandler = (message: ExtensionMessage) => void;

export interface UseTauriOptions {
  onMessage?: MessageHandler;
  debug?: boolean;
}

export interface UseTauriReturn {
  postMessage: (message: WebviewMessage) => void;
  isConnected: boolean;
  isMockMode: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Agent Stream Types
// ═══════════════════════════════════════════════════════════════

export interface AgentStreamCallbacks {
  onChunk: (content: string, messageId: string) => void;
  onComplete: (messageId: string, usage?: { input_tokens: number; output_tokens: number }) => void;
  onError: (error: string, messageId: string) => void;
  onToolStart?: (toolName: string, messageId: string) => void;
  onToolEnd?: (toolName: string, success: boolean, messageId: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// Rewind Context Types
// ═══════════════════════════════════════════════════════════════

export interface RewindContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ═══════════════════════════════════════════════════════════════
// Global Window Extensions
// ═══════════════════════════════════════════════════════════════

declare global {
  interface Window {
    __ORBIT_AGENT_LISTENERS_INITIALIZED__?: boolean;
    __ORBIT_AGENT_LISTENER_UNLISTEN__?: (() => void) | null;
    __ORBIT_MESSAGE_HANDLERS__?: Set<(message: ExtensionMessage) => void>;
    __ORBIT_WINDOW_LISTENER_INITIALIZED__?: boolean;
    __ORBIT_REMOVE_WINDOW_LISTENER__?: (() => void) | null;
  }
}

// Re-export for convenience
export type { ExtensionMessage, WebviewMessage };
